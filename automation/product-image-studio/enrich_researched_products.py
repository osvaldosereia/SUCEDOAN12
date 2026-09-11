#!/usr/bin/env python3
"""Enrich AI-researched products with a safe locally processed catalog image.

The EAN research worker stores only evidence-backed candidate URLs in product metadata.
This worker:
- never uses generative image AI;
- never hotlinks the catalog to a third-party image;
- downloads only public HTTP(S) resources with SSRF guards;
- validates the source as a plausible product image;
- reuses the canonical rembg/U2Net studio pipeline and #ECECEC background;
- uploads a 400x400 WebP copy to our public Supabase Storage bucket;
- updates products.image_url while keeping the product inactive for human review.
"""

from __future__ import annotations

import argparse
import importlib.util
import io
import ipaddress
import json
import os
import re
import socket
import sys
import tempfile
import urllib.parse
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageOps
from rembg import new_session

ROOT = Path(__file__).resolve().parents[2]
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = "product-images"
BACKGROUND = "#ECECEC"
PIPELINE_VERSION = "web-research-studio-v1-rembg-u2net-ececec-400"
DEFAULT_LIMIT = 9
MAX_SOURCE_BYTES = 8_000_000
MIN_EDGE = 180
MAX_ATTEMPTS = 3
TIMEOUT = 25
USER_AGENT = "DonaAntonia-ProductImageResearch/1.0 (+https://donaantonia.com.br)"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_helpers():
    helper_path = ROOT / "automation/product-image-studio/run_batch.py"
    spec = importlib.util.spec_from_file_location("product_image_studio_helpers", helper_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load helper module: {helper_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def auth_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        **(extra or {}),
    }


def ensure_public_url(raw: str) -> str:
    value = str(raw or "").strip()
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("unsafe_or_invalid_url")
    host = parsed.hostname.lower().rstrip(".")
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("private_host_rejected")
    try:
        addresses = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("dns_resolution_failed") from exc
    if not addresses:
        raise ValueError("dns_resolution_empty")
    for entry in addresses:
        ip = ipaddress.ip_address(entry[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise ValueError("private_address_rejected")
    return value


def http_get(raw_url: str, *, expect_image: bool) -> tuple[bytes, str, str]:
    current = ensure_public_url(raw_url)
    headers = {"User-Agent": USER_AGENT, "Accept": "image/avif,image/webp,image/*,*/*;q=0.8" if expect_image else "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"}
    for _ in range(5):
        response = requests.get(current, headers=headers, timeout=TIMEOUT, allow_redirects=False, stream=True)
        if response.status_code in {301, 302, 303, 307, 308}:
            location = response.headers.get("location") or ""
            if not location:
                raise ValueError("redirect_without_location")
            current = ensure_public_url(urllib.parse.urljoin(current, location))
            continue
        response.raise_for_status()
        content_type = (response.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
        if expect_image and not content_type.startswith("image/"):
            raise ValueError(f"not_an_image:{content_type or 'unknown'}")
        if not expect_image and content_type and not any(x in content_type for x in ("html", "xhtml", "text/plain")):
            raise ValueError(f"not_html:{content_type}")
        data = bytearray()
        for chunk in response.iter_content(64 * 1024):
            if not chunk:
                continue
            data.extend(chunk)
            if len(data) > MAX_SOURCE_BYTES:
                raise ValueError("source_too_large")
        if not data:
            raise ValueError("empty_source")
        return bytes(data), current, content_type
    raise ValueError("too_many_redirects")


def meta_image_candidates(page: bytes, page_url: str) -> list[str]:
    text = page.decode("utf-8", errors="ignore")[:2_500_000]
    patterns = [
        r'<meta[^>]+(?:property|name)=["\'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["\']',
        r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)',
        r'"image"\s*:\s*"(https?:\\?/\\?/[^"\\]+(?:\\.[^"\\]*)?)"',
    ]
    out: list[str] = []
    for pattern in patterns:
        for match in re.findall(pattern, text, flags=re.I):
            candidate = unescape(str(match)).replace("\\/", "/").strip()
            if not candidate:
                continue
            candidate = urllib.parse.urljoin(page_url, candidate)
            if candidate not in out:
                out.append(candidate)
            if len(out) >= 12:
                return out
    return out


def validate_image(data: bytes) -> tuple[int, int]:
    with Image.open(io.BytesIO(data)) as probe:
        probe = ImageOps.exif_transpose(probe)
        probe.load()
        width, height = probe.size
        if width < MIN_EDGE or height < MIN_EDGE:
            raise ValueError(f"image_too_small:{width}x{height}")
        ratio = max(width / max(height, 1), height / max(width, 1))
        if ratio > 4.5:
            raise ValueError(f"implausible_image_ratio:{width}x{height}")
        if probe.mode not in {"RGB", "RGBA", "P", "L", "CMYK"}:
            raise ValueError(f"unsupported_image_mode:{probe.mode}")
        return width, height


def fetch_candidate(meta: dict[str, Any]) -> tuple[bytes, str, str | None, tuple[int, int]]:
    direct = str(meta.get("image_candidate_url") or "").strip()
    source_page = str(meta.get("image_source_page_url") or "").strip()
    errors: list[str] = []

    if direct:
        try:
            data, final_url, _ = http_get(direct, expect_image=True)
            size = validate_image(data)
            return data, final_url, source_page or None, size
        except Exception as exc:  # noqa: BLE001
            errors.append(f"direct:{exc}")

    if source_page:
        try:
            page, final_page, _ = http_get(source_page, expect_image=False)
            candidates = meta_image_candidates(page, final_page)
            if not candidates:
                raise ValueError("page_has_no_image_metadata")
            for candidate in candidates:
                try:
                    data, final_url, _ = http_get(candidate, expect_image=True)
                    size = validate_image(data)
                    return data, final_url, final_page, size
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"page_candidate:{exc}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"page:{exc}")

    raise RuntimeError("; ".join(errors[-6:]) or "no_usable_image_candidate")


def query_candidates(limit: int) -> list[dict[str, Any]]:
    params = {
        "select": "id,gtin,name,image_url,metadata,created_at,is_active,is_whatsapp_active,physically_verified",
        "source_system": "eq.ai_ean_research",
        "order": "created_at.asc",
        "limit": "120",
    }
    response = requests.get(f"{SUPABASE_URL}/rest/v1/products", params=params, headers=auth_headers(), timeout=TIMEOUT)
    response.raise_for_status()
    rows = response.json()
    selected: list[dict[str, Any]] = []
    for row in rows if isinstance(rows, list) else []:
        if str(row.get("image_url") or "").strip():
            continue
        meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        if str(meta.get("rich_research_version") or "") != "v2":
            continue
        if float(meta.get("image_research_confidence") or 0) < 0.72:
            continue
        if not (meta.get("image_candidate_url") or meta.get("image_source_page_url")):
            continue
        status = str(meta.get("image_enrichment_status") or "")
        if status in {"completed", "needs_human_review", "no_reliable_image_found"}:
            continue
        if int(meta.get("image_enrichment_attempts") or 0) >= MAX_ATTEMPTS:
            continue
        selected.append(row)
        if len(selected) >= limit:
            break
    return selected


def upload_webp(product_id: str, payload: bytes) -> tuple[str, str]:
    object_path = f"catalog-products/{product_id}.webp"
    quoted = urllib.parse.quote(object_path, safe="/")
    response = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{quoted}",
        headers=auth_headers({"Content-Type": "image/webp", "x-upsert": "true", "cache-control": "31536000"}),
        data=payload,
        timeout=TIMEOUT,
    )
    if not response.ok:
        raise RuntimeError(f"storage_upload_{response.status_code}:{response.text[:300]}")
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{quoted}"
    return object_path, public_url


def patch_product(product_id: str, payload: dict[str, Any]) -> None:
    response = requests.patch(
        f"{SUPABASE_URL}/rest/v1/products",
        params={"id": f"eq.{product_id}"},
        headers=auth_headers({"Content-Type": "application/json", "Prefer": "return=minimal"}),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        timeout=TIMEOUT,
    )
    response.raise_for_status()


def process_one(row: dict[str, Any], helpers: Any, session: Any) -> dict[str, Any]:
    product_id = str(row.get("id") or "").strip()
    if not product_id:
        raise ValueError("product_id_missing")
    meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    attempts = int(meta.get("image_enrichment_attempts") or 0) + 1
    source, source_url, source_page, source_size = fetch_candidate(meta)

    with tempfile.TemporaryDirectory(prefix="da-product-image-") as tmp:
        source_path = Path(tmp) / "source-image"
        source_path.write_bytes(source)
        isolated, segmentation = helpers.isolate_real_product(source_path, session)
        cell = helpers.make_studio_cell(isolated, BACKGROUND)
        encoded, quality = helpers.encode_webp_under_target(cell)
        with Image.open(io.BytesIO(encoded)) as probe:
            probe.load()
            if probe.format != "WEBP" or probe.size != (400, 400):
                raise RuntimeError("invalid_studio_output")

    object_path, public_url = upload_webp(product_id, encoded)
    new_meta = {
        **meta,
        "image_enrichment_status": "completed",
        "image_enrichment_attempts": attempts,
        "image_enriched_at": utc_now(),
        "image_pipeline_version": PIPELINE_VERSION,
        "image_background": BACKGROUND,
        "image_original_source_url": source_url,
        "image_original_source_page_url": source_page,
        "image_original_width": source_size[0],
        "image_original_height": source_size[1],
        "image_storage_bucket": BUCKET,
        "image_storage_path": object_path,
        "image_output_width": 400,
        "image_output_height": 400,
        "image_output_bytes": len(encoded),
        "image_webp_quality": quality,
        "image_segmentation": segmentation,
    }
    patch_product(product_id, {"image_url": public_url, "metadata": new_meta})
    return {
        "id": product_id,
        "gtin": row.get("gtin"),
        "name": row.get("name"),
        "source_url": source_url,
        "source_page": source_page,
        "source_size": list(source_size),
        "output_url": public_url,
        "output_bytes": len(encoded),
        "webp_quality": quality,
    }


def mark_failure(row: dict[str, Any], exc: Exception) -> dict[str, Any]:
    product_id = str(row.get("id") or "").strip()
    meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    attempts = int(meta.get("image_enrichment_attempts") or 0) + 1
    status = "needs_human_review" if attempts >= MAX_ATTEMPTS else "error"
    message = str(exc).replace("\n", " ")[:700]
    new_meta = {
        **meta,
        "image_enrichment_status": status,
        "image_enrichment_attempts": attempts,
        "image_enrichment_last_error": message,
        "image_enrichment_last_attempt_at": utc_now(),
    }
    if product_id:
        patch_product(product_id, {"metadata": new_meta})
    return {"id": product_id, "gtin": row.get("gtin"), "name": row.get("name"), "error": message, "attempts": attempts, "status": status}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--report", default="artifacts/product-image-studio-production/researched-products.json")
    args = parser.parse_args()
    if not SUPABASE_URL or not SERVICE_KEY:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    limit = max(1, min(int(args.limit or DEFAULT_LIMIT), 20))
    report_path = (ROOT / args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    candidates = query_candidates(limit)
    report: dict[str, Any] = {
        "created_at": utc_now(),
        "pipeline_version": PIPELINE_VERSION,
        "background": BACKGROUND,
        "generative_ai_used": False,
        "selected": len(candidates),
        "processed": [],
        "errors": [],
    }
    if not candidates:
        report["status"] = "nothing_to_do"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": "nothing_to_do", "selected": 0}, ensure_ascii=False))
        return 0

    helpers = load_helpers()
    session = new_session("u2net")
    for row in candidates:
        try:
            report["processed"].append(process_one(row, helpers, session))
        except Exception as exc:  # noqa: BLE001
            try:
                report["errors"].append(mark_failure(row, exc))
            except Exception as patch_exc:  # noqa: BLE001
                report["errors"].append({"id": row.get("id"), "error": f"{exc}; failure_patch:{patch_exc}"})

    report["status"] = "completed" if not report["errors"] else "completed_with_errors"
    report["processed_count"] = len(report["processed"])
    report["error_count"] = len(report["errors"])
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "selected": len(candidates), "processed_count": report["processed_count"], "error_count": report["error_count"]}, ensure_ascii=False, indent=2))

    # Do not poison the pre-existing image-standardization queue on a single remote-site failure.
    # Failed candidates remain retryable up to MAX_ATTEMPTS and then require human review.
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
