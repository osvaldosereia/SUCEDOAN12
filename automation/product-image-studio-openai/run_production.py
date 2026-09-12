#!/usr/bin/env python3
"""Dona Antônia — safe OpenAI product image studio.

The pipeline edits one real product photo at a time. It never uses local
background segmentation. When the current asset was produced by the legacy
rembg workflow, the original predecessor image is recovered from Git history
and used as the OpenAI input.

Dry-run writes previews only. Production mode replaces the same catalog path
and records a hash ledger so the same output is not processed again.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from openai import OpenAI
from PIL import Image, ImageOps

MODEL = "gpt-image-2.5-sunburst"
QUALITY = "low"
BACKGROUND = "#ECECEC"
DISCOVERY_ROOT = Path("site/img/produtos_3")
DEFAULT_STATE = Path("automation/product-image-studio-openai/state.json")
DEFAULT_REPORT = Path("artifacts/product-image-studio-openai/result.json")
DEFAULT_PREVIEW = Path("artifacts/product-image-studio-openai/previews")
PATTERN = "*foto-atual-otimizada*.webp"
PIPELINE_VERSION = "openai-sunburst-low-v1"
TARGET_SIZE = 400
INNER_SIZE = 320
TARGET_MAX_BYTES = 100_000
LEGACY_COMMIT_PREFIX = "chore: process product studio image batch"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def derive_product_name(path: Path) -> str:
    stem = path.stem
    marker = "-foto-atual-otimizada-"
    if marker in stem:
        stem = stem.split(marker, 1)[0]
    words = [word for word in stem.replace("_", "-").split("-") if word]
    return " ".join(words)[:180] or "produto"


def git_original_before_legacy(repo_root: Path, rel_path: str, current: bytes) -> tuple[bytes, str]:
    """Recover the version immediately before legacy rembg touched this path."""
    log = subprocess.run(
        ["git", "log", "-1", "--format=%H%x09%s", "--", rel_path],
        cwd=repo_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    line = log.stdout.decode("utf-8", errors="replace").strip()
    if not line or "\t" not in line:
        return current, "current_asset"
    commit_sha, subject = line.split("\t", 1)
    if not subject.startswith(LEGACY_COMMIT_PREFIX):
        return current, "current_asset"
    show = subprocess.run(
        ["git", "show", f"{commit_sha}^:{rel_path}"],
        cwd=repo_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if show.returncode == 0 and show.stdout:
        return show.stdout, "git_parent_before_legacy_rembg"
    return current, "current_asset_fallback"


def prepare_input(source: bytes) -> bytes:
    with Image.open(io.BytesIO(source)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, format="PNG", optimize=True)
        return out.getvalue()


def prompt_for(product_name: str) -> str:
    return (
        "Crie uma nova foto de catálogo usando a FOTO ENVIADA como verdade visual principal. "
        f"O nome de apoio do produto é: {product_name}. "
        "Preserve fielmente o produto real: formato, proporções, marca, logotipo, cores, "
        "rótulo, textos visíveis, tampa, alça, transparências, material e detalhes da embalagem. "
        "Não redesenhe a embalagem, não invente texto, não troque marca e não remova partes. "
        f"Use fundo liso cinza muito claro exatamente na aparência de {BACKGROUND}. "
        "Mostre somente um produto, inteiro, frontal ou no mesmo ângulo útil da referência, "
        "centralizado, sem corte, com bastante espaço vazio ao redor. "
        "O produto deve ocupar no máximo cerca de 78% a 80% da largura ou altura da imagem. "
        "Não adicione cenário, mesa, pessoas, preço, selos, objetos decorativos ou outros produtos. "
        "Iluminação de estúdio limpa e neutra; no máximo uma sombra de contato muito discreta. "
        "Prioridade máxima: fidelidade ao item fotografado, não criatividade."
    )


def decode_image_response(response: Any) -> tuple[bytes, dict[str, Any]]:
    raw = response.model_dump() if hasattr(response, "model_dump") else {}
    data = getattr(response, "data", None) or []
    if not data:
        raise RuntimeError("openai_image_response_without_data")
    first = data[0]
    b64 = getattr(first, "b64_json", None)
    if b64:
        return base64.b64decode(b64), raw
    url = getattr(first, "url", None)
    if url:
        http = requests.get(url, timeout=90)
        http.raise_for_status()
        return http.content, raw
    raise RuntimeError("openai_image_response_without_image")


def edit_product(client: OpenAI, source_png: bytes, product_name: str) -> tuple[bytes, dict[str, Any]]:
    with tempfile.NamedTemporaryFile(suffix=".png") as source_file:
        source_file.write(source_png)
        source_file.flush()
        with open(source_file.name, "rb") as image_file:
            response = client.images.edit(
                model=MODEL,
                image=image_file,
                prompt=prompt_for(product_name),
                size="1024x1024",
                quality=QUALITY,
            )
    return decode_image_response(response)


def normalize_output(generated: bytes) -> tuple[bytes, dict[str, Any]]:
    """Guarantee a square 400px output and at least 10% empty border per side.

    We shrink the complete generated square to 320px and extend it with the same
    catalog background. No product segmentation or alpha-mask inference is used.
    """
    bg = tuple(int(BACKGROUND.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))
    with Image.open(io.BytesIO(generated)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        generated_size = image.size
        inner = ImageOps.fit(image, (INNER_SIZE, INNER_SIZE), method=Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (TARGET_SIZE, TARGET_SIZE), bg)
        offset = (TARGET_SIZE - INNER_SIZE) // 2
        canvas.paste(inner, (offset, offset))
        selected = b""
        selected_quality = 82
        for quality in (82, 78, 74, 70, 66, 62):
            buffer = io.BytesIO()
            canvas.save(buffer, format="WEBP", quality=quality, method=6)
            selected = buffer.getvalue()
            selected_quality = quality
            if len(selected) <= TARGET_MAX_BYTES:
                break
        return selected, {
            "generated_size": list(generated_size),
            "final_size": [TARGET_SIZE, TARGET_SIZE],
            "inner_size": INNER_SIZE,
            "minimum_outer_margin_px": offset,
            "webp_quality": selected_quality,
            "output_bytes": len(selected),
        }


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"schema_version": 1, "pipeline_version": PIPELINE_VERSION, "items": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("invalid_state")
    data.setdefault("items", {})
    return data


def atomic_write(path: Path, payload: bytes) -> None:
    tmp = path.with_suffix(path.suffix + ".openai-tmp")
    tmp.write_bytes(payload)
    os.replace(tmp, path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--state", default=str(DEFAULT_STATE))
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    parser.add_argument("--preview-root", default=str(DEFAULT_PREVIEW))
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY_missing")

    repo_root = Path(args.repo_root).resolve()
    state_path = (repo_root / args.state).resolve()
    report_path = (repo_root / args.report).resolve()
    preview_root = (repo_root / args.preview_root).resolve()
    state = load_state(state_path)
    items = state.setdefault("items", {})

    candidates: list[Path] = []
    skipped = 0
    for path in sorted((repo_root / DISCOVERY_ROOT).rglob(PATTERN)):
        if not path.is_file():
            continue
        rel = path.relative_to(repo_root).as_posix()
        current_hash = sha256_file(path)
        previous = items.get(rel) or {}
        if not args.force and previous.get("output_sha256") == current_hash:
            skipped += 1
            continue
        candidates.append(path)
        if len(candidates) >= max(1, args.limit):
            break

    report: dict[str, Any] = {
        "created_at": utc_now(),
        "pipeline_version": PIPELINE_VERSION,
        "model": MODEL,
        "quality": QUALITY,
        "background": BACKGROUND,
        "dry_run": bool(args.dry_run),
        "selected": len(candidates),
        "skipped_already_processed": skipped,
        "processed": [],
        "errors": [],
    }
    client = OpenAI(api_key=api_key)
    preview_root.mkdir(parents=True, exist_ok=True)

    for path in candidates:
        rel = path.relative_to(repo_root).as_posix()
        try:
            current = path.read_bytes()
            input_source, source_origin = git_original_before_legacy(repo_root, rel, current)
            source_png = prepare_input(input_source)
            product_name = derive_product_name(path)
            generated, openai_raw = edit_product(client, source_png, product_name)
            final_webp, output_meta = normalize_output(generated)
            preview_path = preview_root / path.name
            preview_path.write_bytes(final_webp)
            output_hash = sha256_bytes(final_webp)

            if not args.dry_run:
                atomic_write(path, final_webp)
                items[rel] = {
                    "status": "done",
                    "pipeline_version": PIPELINE_VERSION,
                    "model": MODEL,
                    "quality": QUALITY,
                    "source_origin": source_origin,
                    "source_sha256": sha256_bytes(input_source),
                    "output_sha256": output_hash,
                    "processed_at": utc_now(),
                }

            report["processed"].append({
                "path": rel,
                "product_name": product_name,
                "source_origin": source_origin,
                "source_sha256": sha256_bytes(input_source),
                "output_sha256": output_hash,
                "preview_path": preview_path.relative_to(repo_root).as_posix(),
                "wrote_live_asset": not args.dry_run,
                "output": output_meta,
                "usage": openai_raw.get("usage") if isinstance(openai_raw, dict) else None,
            })
        except Exception as exc:  # noqa: BLE001
            report["errors"].append({"path": rel, "error": str(exc)})

    report["processed_count"] = len(report["processed"])
    report["error_count"] = len(report["errors"])
    report["status"] = "completed" if not report["errors"] else "completed_with_errors"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not args.dry_run:
        state["schema_version"] = 1
        state["pipeline_version"] = PIPELINE_VERSION
        state["last_run_at"] = utc_now()
        state["last_run_processed"] = report["processed_count"]
        state["last_run_errors"] = report["error_count"]
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "status": report["status"],
        "model": MODEL,
        "quality": QUALITY,
        "dry_run": args.dry_run,
        "selected": len(candidates),
        "processed_count": report["processed_count"],
        "error_count": report["error_count"],
    }, ensure_ascii=False, indent=2))

    if candidates and not report["processed"]:
        return 1
    return 0 if not report["errors"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
