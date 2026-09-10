#!/usr/bin/env python3
"""Dona Antônia — deterministic product image studio.

Homologation mode:
- reads exactly 9 REAL repository product photos;
- removes the background locally with a segmentation model (no generative AI);
- preserves the source product pixels/label artwork instead of redesigning packaging;
- places every isolated product on the exact same light-gray background;
- adds only a subtle synthetic contact shadow outside the product;
- builds one exact 3x3 grid and re-crops it into 9 equal WebP files;
- NEVER updates products or production URLs.

The write-back stage is intentionally absent until visual homologation is approved.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageOps
from rembg import new_session, remove

EXPECTED_COUNT = 9
DEFAULT_CELL = 400
DEFAULT_CANVAS = DEFAULT_CELL * 3
DEFAULT_BG = "#ECECEC"
TARGET_MAX_BYTES = 100_000


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


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.strip().lstrip("#")
    if len(value) != 6:
        raise ValueError("background must be a 6-digit hex color")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def open_rgb(path: Path) -> Image.Image:
    with Image.open(path) as img:
        return ImageOps.exif_transpose(img).convert("RGB")


def make_before_sheet(products: list[dict[str, Any]], root: Path, out_path: Path, background: str) -> None:
    bg = hex_to_rgb(background)
    board = Image.new("RGB", (DEFAULT_CANVAS, DEFAULT_CANVAS), bg)
    for idx, product in enumerate(products):
        img = open_rgb(root / product["path"])
        fitted = ImageOps.contain(img, (DEFAULT_CELL, DEFAULT_CELL), Image.Resampling.LANCZOS)
        cell = Image.new("RGB", (DEFAULT_CELL, DEFAULT_CELL), bg)
        cell.paste(fitted, ((DEFAULT_CELL - fitted.width) // 2, (DEFAULT_CELL - fitted.height) // 2))
        board.paste(cell, ((idx % 3) * DEFAULT_CELL, (idx // 3) * DEFAULT_CELL))
    board.save(out_path, format="JPEG", quality=82, optimize=True, progressive=True)


def select_main_component(alpha: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Keep the dominant centered foreground component.

    Background-removal models may also mark nearby props as foreground. We score components
    by area plus centrality, then keep the best component. This is deterministic and never
    invents pixels. A small set of nearby components is retained only when they sit inside
    the dominant component's expanded bounding box (useful for detached package edges).
    """
    binary = (alpha >= 18).astype(np.uint8)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(binary, 8)
    h, w = alpha.shape
    if count <= 1:
        raise RuntimeError("segmentation produced no foreground")

    cx, cy = w / 2.0, h / 2.0
    diag = math.hypot(w, h)
    candidates: list[tuple[float, int]] = []
    for label in range(1, count):
        x, y, bw, bh, area = stats[label]
        if area < max(64, int(w * h * 0.0005)):
            continue
        mx, my = centroids[label]
        distance = math.hypot(mx - cx, my - cy) / max(diag, 1.0)
        contains_center = x <= cx <= x + bw and y <= cy <= y + bh
        central_bonus = 1.8 if contains_center else max(0.35, 1.0 - 1.8 * distance)
        score = float(area) * central_bonus
        candidates.append((score, label))

    if not candidates:
        raise RuntimeError("segmentation foreground components were too small")

    candidates.sort(reverse=True)
    main_label = candidates[0][1]
    x, y, bw, bh, main_area = stats[main_label]
    pad_x = int(bw * 0.12)
    pad_y = int(bh * 0.12)
    ex1, ey1 = max(0, x - pad_x), max(0, y - pad_y)
    ex2, ey2 = min(w, x + bw + pad_x), min(h, y + bh + pad_y)

    keep_labels = {main_label}
    for _, label in candidates[1:]:
        lx, ly, lbw, lbh, area = stats[label]
        mx, my = centroids[label]
        inside_expanded = ex1 <= mx <= ex2 and ey1 <= my <= ey2
        if inside_expanded and area >= max(48, int(main_area * 0.004)):
            keep_labels.add(label)

    keep = np.isin(labels, list(keep_labels))
    cleaned = np.where(keep, alpha, 0).astype(np.uint8)
    ys, xs = np.where(cleaned >= 12)
    if len(xs) == 0:
        raise RuntimeError("foreground disappeared after component cleanup")

    info = {
        "component_count": int(count - 1),
        "kept_component_count": len(keep_labels),
        "main_component_area": int(main_area),
        "foreground_bbox_source": [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)],
    }
    return cleaned, info


def isolate_real_product(source: Path, session: Any) -> tuple[Image.Image, dict[str, Any]]:
    original = open_rgb(source)
    rgba_input = original.convert("RGBA")

    # rembg modifies only the alpha/mask result. RGB for the kept foreground comes from
    # the original source image. No generative model is called.
    cut = remove(
        rgba_input,
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=6,
        post_process_mask=True,
    )
    if not isinstance(cut, Image.Image):
        cut = Image.open(io.BytesIO(cut)).convert("RGBA")
    else:
        cut = cut.convert("RGBA")

    alpha = np.asarray(cut.getchannel("A"), dtype=np.uint8)
    alpha, component_info = select_main_component(alpha)
    alpha_img = Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(0.45))

    # Explicitly restore RGB from the real source after mask creation.
    real_rgba = original.convert("RGBA")
    real_rgba.putalpha(alpha_img)

    bbox = alpha_img.getbbox()
    if not bbox:
        raise RuntimeError(f"empty foreground for {source}")
    cropped = real_rgba.crop(bbox)
    component_info.update({
        "source_width": original.width,
        "source_height": original.height,
        "crop_bbox": list(map(int, bbox)),
    })
    return cropped, component_info


def make_studio_cell(product_rgba: Image.Image, background: str) -> Image.Image:
    bg = hex_to_rgb(background)
    cell = Image.new("RGB", (DEFAULT_CELL, DEFAULT_CELL), bg)

    max_w = int(DEFAULT_CELL * 0.82)
    max_h = int(DEFAULT_CELL * 0.82)
    scale = min(max_w / product_rgba.width, max_h / product_rgba.height)
    new_size = (
        max(1, int(round(product_rgba.width * scale))),
        max(1, int(round(product_rgba.height * scale))),
    )
    product = product_rgba.resize(new_size, Image.Resampling.LANCZOS)

    alpha = product.getchannel("A")
    x = (DEFAULT_CELL - product.width) // 2
    y = (DEFAULT_CELL - product.height) // 2

    # Shadow is derived only from the alpha silhouette and is painted on the background,
    # never onto the product's RGB pixels.
    shadow_alpha = Image.new("L", (DEFAULT_CELL, DEFAULT_CELL), 0)
    shadow_alpha.paste(alpha, (x, y + 5))
    shadow_alpha = shadow_alpha.filter(ImageFilter.GaussianBlur(7))
    shadow_alpha = shadow_alpha.point(lambda p: int(p * 0.16))
    shadow_layer = Image.new("RGB", (DEFAULT_CELL, DEFAULT_CELL), (95, 95, 95))
    cell.paste(shadow_layer, (0, 0), shadow_alpha)
    cell.paste(product.convert("RGB"), (x, y), alpha)
    return cell


def encode_webp_under_target(img: Image.Image, target: int = TARGET_MAX_BYTES) -> tuple[bytes, int]:
    selected = b""
    selected_quality = 66
    for quality in (82, 78, 74, 70, 66):
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=quality, method=6)
        selected = buf.getvalue()
        selected_quality = quality
        if len(selected) <= target:
            break
    return selected, selected_quality


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
    background = manifest.get("background", DEFAULT_BG)
    if background.upper() != DEFAULT_BG:
        raise ValueError(f"homologation background is hard-gated to {DEFAULT_BG}")

    source_report: list[dict[str, Any]] = []
    output_report: list[dict[str, Any]] = []
    segmentation_report: list[dict[str, Any]] = []

    for product in products:
        source = repo_root / product["path"]
        if not source.is_file():
            raise FileNotFoundError(f"missing real source image: {source}")
        raw = source.read_bytes()
        with Image.open(source) as probe:
            size = ImageOps.exif_transpose(probe).size
        source_report.append({
            "id": product["id"],
            "sku": product.get("sku"),
            "name": product["name"],
            "path": product["path"],
            "source_bytes": len(raw),
            "source_sha256": sha256_bytes(raw),
            "source_size": list(size),
        })

    make_before_sheet(products, repo_root, out_dir / "00-before-real-sources.jpg", background)

    # One local segmentation session is reused for all 9 images.
    session = new_session("u2net")
    cells: list[Image.Image] = []
    for idx, product in enumerate(products):
        source = repo_root / product["path"]
        isolated, info = isolate_real_product(source, session)
        cell = make_studio_cell(isolated, background)
        cells.append(cell)
        info.update({
            "index": idx + 1,
            "id": product["id"],
            "sku": product.get("sku"),
            "name": product["name"],
        })
        segmentation_report.append(info)

    # Build the requested exact 3x3 image first.
    board = Image.new("RGB", (DEFAULT_CANVAS, DEFAULT_CANVAS), hex_to_rgb(background))
    for idx, cell in enumerate(cells):
        board.paste(cell, ((idx % 3) * DEFAULT_CELL, (idx // 3) * DEFAULT_CELL))

    board_png = out_dir / "01-studio-grid-lossless.png"
    board.save(board_png, format="PNG", optimize=True)
    board.save(out_dir / "02-studio-grid-preview.jpg", format="JPEG", quality=84, optimize=True, progressive=True)

    # Re-cut from the final 3x3 board, exactly as production will do.
    for idx, product in enumerate(products):
        col, row = idx % 3, idx // 3
        box = (col * DEFAULT_CELL, row * DEFAULT_CELL, (col + 1) * DEFAULT_CELL, (row + 1) * DEFAULT_CELL)
        crop = board.crop(box)
        safe_sku = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in str(product.get("sku") or product["id"]))
        filename = f"product-{idx + 1:02d}-{safe_sku}.webp"
        encoded, quality = encode_webp_under_target(crop)
        (out_dir / filename).write_bytes(encoded)
        output_report.append({
            "index": idx + 1,
            "id": product["id"],
            "sku": product.get("sku"),
            "name": product["name"],
            "filename": filename,
            "width": DEFAULT_CELL,
            "height": DEFAULT_CELL,
            "bytes": len(encoded),
            "webp_quality": quality,
            "sha256": sha256_bytes(encoded),
        })

    report = {
        "mode": "homologation_local_segmentation_no_writeback",
        "production_images_changed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "background": background,
        "grid": {"width": DEFAULT_CANVAS, "height": DEFAULT_CANVAS, "cell": DEFAULT_CELL, "count": 9},
        "segmentation": {
            "engine": "rembg",
            "model": "u2net",
            "generative_ai_used": False,
            "openai_used": False,
            "openai_cost_usd": 0.0,
            "items": segmentation_report,
        },
        "sources": source_report,
        "outputs": output_report,
        "total_output_bytes": sum(x["bytes"] for x in output_report),
        "average_output_bytes": round(sum(x["bytes"] for x in output_report) / EXPECTED_COUNT),
        "notes": [
            "The product RGB content comes from each original repository image; no product is redrawn.",
            "A local segmentation model is used only to create an alpha mask for background removal.",
            "No OpenAI image API call is made and OpenAI image cost is zero for this pipeline.",
            "No Supabase product row, image_url, GitHub production image, or live asset is modified.",
            "Human visual approval is required before a write-back stage is implemented/enabled.",
        ],
    }
    (out_dir / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "mode": report["mode"],
        "outputs": len(output_report),
        "background": background,
        "openai_cost_usd": 0.0,
        "average_output_bytes": report["average_output_bytes"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
