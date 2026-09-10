#!/usr/bin/env python3
"""Dona Antônia — product image studio batch.

Test mode by default:
- reads exactly 9 REAL repository images from a manifest;
- sends those 9 images in one OpenAI image-edit request;
- requests a strict 3x3, 1008x1008 studio board;
- splits the returned board into nine exact 336x336 cells;
- writes lightweight WebP outputs and a cost/usage report;
- NEVER updates products or production URLs.

Production write-back is intentionally not implemented in this test runner.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageOps

OPENAI_URL = "https://api.openai.com/v1/images/edits"
EXPECTED_COUNT = 9
DEFAULT_CANVAS = 1008
DEFAULT_CELL = 336


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_manifest(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    products = data.get("products") or []
    if len(products) != EXPECTED_COUNT:
        raise ValueError(f"manifest must contain exactly {EXPECTED_COUNT} products")
    if len({p.get('id') for p in products}) != EXPECTED_COUNT:
        raise ValueError("manifest product ids must be unique")
    return data


def image_to_png_bytes(path: Path) -> bytes:
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        out = io.BytesIO()
        img.save(out, format="PNG", optimize=True)
        return out.getvalue()


def make_before_sheet(products: list[dict[str, Any]], root: Path, out_path: Path, background: str) -> None:
    board = Image.new("RGB", (DEFAULT_CANVAS, DEFAULT_CANVAS), background)
    for idx, product in enumerate(products):
        source = root / product["path"]
        with Image.open(source) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            # Keep the original image untouched inside each cell; only letterbox it for comparison.
            fitted = ImageOps.contain(img, (DEFAULT_CELL, DEFAULT_CELL), Image.Resampling.LANCZOS)
            cell = Image.new("RGB", (DEFAULT_CELL, DEFAULT_CELL), background)
            x = (DEFAULT_CELL - fitted.width) // 2
            y = (DEFAULT_CELL - fitted.height) // 2
            cell.paste(fitted, (x, y))
            col, row = idx % 3, idx // 3
            board.paste(cell, (col * DEFAULT_CELL, row * DEFAULT_CELL))
    board.save(out_path, format="JPEG", quality=82, optimize=True, progressive=True)


def build_prompt(products: list[dict[str, Any]], background: str) -> str:
    order = "\n".join(
        f"{idx + 1}. {p['name']} (SKU {p.get('sku') or '-'})"
        for idx, p in enumerate(products)
    )
    return f"""
BACKGROUND-REPLACEMENT TASK FOR A REAL RETAIL CATALOG. DO NOT REDESIGN PRODUCTS.

You receive exactly 9 REAL product photos. Preserve each product from its corresponding input image with maximum visual fidelity: same package/bottle/carton, silhouette, proportions, colors, brand, logo, label artwork, printed words, weight/volume, cap, folds and visible details. Do not invent, modernize, beautify, substitute, translate, correct, re-typeset or hallucinate any packaging element. This is a studio-background cleanup, not a product redesign.

Create ONE square image exactly 1008x1008 pixels, divided into an exact 3x3 grid of nine equal 336x336 cells. Keep inputs in the exact order supplied, left-to-right then top-to-bottom:
{order}

For every cell:
- use one and only one corresponding real input product;
- remove/replace only the surrounding original scene/background;
- use the exact same uniform light-gray background {background} in all 9 cells;
- center the product, upright when appropriate, with about 8-12% safe margin;
- use clean neutral e-commerce studio lighting and only a very subtle natural contact shadow;
- no props, shelves, hands, decorations, captions, price labels, added text, watermarks, borders or gutters;
- never let one product cross into another cell.

Grid geometry is mandatory: vertical boundaries at x=336 and x=672; horizontal boundaries at y=336 and y=672. Do not draw boundary lines. The background tone must remain visually identical across all nine cells.
""".strip()


def extract_usage_cost(usage: Any) -> dict[str, Any]:
    result: dict[str, Any] = {
        "raw": usage,
        "estimated_usd": None,
        "rates_usd_per_million": {
            "image_input": 8.0,
            "text_input": 5.0,
            "image_output": 30.0,
        },
    }
    if not isinstance(usage, dict):
        return result

    details = usage.get("input_tokens_details") or usage.get("input_token_details") or {}
    output_details = usage.get("output_tokens_details") or usage.get("output_token_details") or {}

    image_in = details.get("image_tokens")
    text_in = details.get("text_tokens")
    image_out = output_details.get("image_tokens")

    # Some image endpoint responses expose output_tokens directly rather than nested image_tokens.
    if image_out is None:
        image_out = usage.get("output_tokens")

    if all(isinstance(v, (int, float)) for v in (image_in, text_in, image_out)):
        usd = image_in * 8.0 / 1_000_000 + text_in * 5.0 / 1_000_000 + image_out * 30.0 / 1_000_000
        result.update({
            "image_input_tokens": image_in,
            "text_input_tokens": text_in,
            "image_output_tokens": image_out,
            "estimated_usd": round(usd, 8),
            "estimated_usd_per_product": round(usd / EXPECTED_COUNT, 8),
        })
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--repo-root", default=".")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    manifest_path = (repo_root / args.manifest).resolve()
    out_dir = Path(args.output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = load_manifest(manifest_path)
    products = manifest["products"]
    background = manifest.get("background", "#ECECEC")
    model = manifest.get("model", "gpt-image-2.5-sunburst")
    quality = manifest.get("quality", "low")
    size = manifest.get("size", "1008x1008")

    if quality != "low":
        raise ValueError("test is hard-gated to quality=low")
    if size != "1008x1008":
        raise ValueError("test is hard-gated to exact 1008x1008 output")
    if model != "gpt-image-2.5-sunburst":
        raise ValueError("test is hard-gated to gpt-image-2.5-sunburst for editing fidelity")

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is missing")

    source_report = []
    files = []
    for idx, product in enumerate(products):
        source = repo_root / product["path"]
        if not source.is_file():
            raise FileNotFoundError(f"missing real source image: {source}")
        raw = source.read_bytes()
        png = image_to_png_bytes(source)
        source_report.append({
            "index": idx + 1,
            "id": product["id"],
            "sku": product.get("sku"),
            "name": product["name"],
            "path": product["path"],
            "source_bytes": len(raw),
            "source_sha256": sha256_bytes(raw),
        })
        files.append(("image[]", (f"input-{idx + 1:02d}.png", png, "image/png")))

    before_path = out_dir / "00-before-real-sources.jpg"
    make_before_sheet(products, repo_root, before_path, background)

    prompt = build_prompt(products, background)
    response = requests.post(
        OPENAI_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        data={
            "model": model,
            "prompt": prompt,
            "quality": quality,
            "size": size,
            "n": "1",
        },
        files=files,
        timeout=300,
    )

    request_id = response.headers.get("x-request-id")
    if response.status_code >= 400:
        safe_body = response.text[:4000]
        raise RuntimeError(f"OpenAI image edit failed status={response.status_code} request_id={request_id} body={safe_body}")

    payload = response.json()
    data = payload.get("data") or []
    if not data or not data[0].get("b64_json"):
        raise RuntimeError(f"OpenAI response had no image request_id={request_id}")

    generated = base64.b64decode(data[0]["b64_json"])
    generated_path = out_dir / "01-openai-studio-grid.png"
    generated_path.write_bytes(generated)

    with Image.open(io.BytesIO(generated)) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        if img.size != (DEFAULT_CANVAS, DEFAULT_CANVAS):
            # Enforce exact deterministic split dimensions if the service returns another square size.
            img = img.resize((DEFAULT_CANVAS, DEFAULT_CANVAS), Image.Resampling.LANCZOS)
        normalized_grid = out_dir / "02-grid-normalized-1008.jpg"
        img.save(normalized_grid, format="JPEG", quality=84, optimize=True, progressive=True)

        outputs = []
        for idx, product in enumerate(products):
            col, row = idx % 3, idx // 3
            box = (
                col * DEFAULT_CELL,
                row * DEFAULT_CELL,
                (col + 1) * DEFAULT_CELL,
                (row + 1) * DEFAULT_CELL,
            )
            cell = img.crop(box)
            safe_sku = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in str(product.get("sku") or product["id"]))
            filename = f"product-{idx + 1:02d}-{safe_sku}.webp"
            path = out_dir / filename
            cell.save(path, format="WEBP", quality=80, method=6)
            out_raw = path.read_bytes()
            outputs.append({
                "index": idx + 1,
                "id": product["id"],
                "sku": product.get("sku"),
                "name": product["name"],
                "filename": filename,
                "width": DEFAULT_CELL,
                "height": DEFAULT_CELL,
                "bytes": len(out_raw),
                "sha256": sha256_bytes(out_raw),
            })

    report = {
        "mode": "homologation_no_writeback",
        "production_images_changed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "quality": quality,
        "requested_size": size,
        "background": background,
        "openai_request_id": request_id,
        "sources": source_report,
        "outputs": outputs,
        "usage_and_cost": extract_usage_cost(payload.get("usage")),
        "notes": [
            "All nine source files were read from the repository checkout.",
            "No Supabase product row, image_url, or production asset was modified.",
            "Human visual approval is required before any future write-back stage is enabled.",
        ],
    }
    (out_dir / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "mode": report["mode"],
        "request_id": request_id,
        "outputs": len(outputs),
        "usage_and_cost": report["usage_and_cost"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
