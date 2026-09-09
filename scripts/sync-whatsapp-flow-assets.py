from __future__ import annotations

import io
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps
import pillow_avif  # noqa: F401

ROOT = Path(__file__).resolve().parents[1]
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = "whatsapp-flow-assets"
MAX_BYTES = 40_000
ATTEMPTS = [(300, 64), (260, 58), (220, 50), (190, 44)]

if not SUPABASE_URL or not SERVICE_KEY:
    raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

BASKET_SOURCES = [
    ROOT / "img" / "cesta-basica-cuiaba-varzea-grande-economica.avif",
    ROOT / "img" / "CESTA-MINI-BONINI.webp",
    ROOT / "img" / "CESTA-MINI-KOBLENZ.webp",
    ROOT / "img" / "CESTA-PEQUENA-BONINI.webp",
    ROOT / "img" / "CESTA-PEQUENA-KOBLENZ.webp",
    ROOT / "img" / "CESTA-MEDIA-KOBLENZ.webp",
    ROOT / "img" / "CESTA-MEDIA-BONINI.webp",
    ROOT / "img" / "CESTA-GRANDE-KOBLENZ.webp",
    ROOT / "img" / "CESTA-GRANDE-ALVINO.webp",
]


def api_request(url: str, *, method: str = "GET", body: bytes | None = None, headers: dict[str, str] | None = None) -> bytes:
    h = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        **(headers or {}),
    }
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()


def compress_image(source: bytes) -> bytes:
    with Image.open(io.BytesIO(source)) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        for edge, quality in ATTEMPTS:
            candidate = im.copy()
            candidate.thumbnail((edge, edge), Image.Resampling.LANCZOS)
            canvas = Image.new("RGB", (edge, edge), "white")
            x = (edge - candidate.width) // 2
            y = (edge - candidate.height) // 2
            canvas.paste(candidate, (x, y))
            out = io.BytesIO()
            canvas.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
            data = out.getvalue()
            if 0 < len(data) <= MAX_BYTES:
                return data
    raise ValueError("image could not be compressed below Flow target")


def upload(asset_path: str, data: bytes) -> None:
    quoted = "/".join(urllib.parse.quote(part, safe="") for part in asset_path.split("/"))
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{quoted}"
    api_request(
        url,
        method="POST",
        body=data,
        headers={"Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "3600"},
    )


def read_url(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "DonaAntonia-FlowAssetSync/1.0"})
    with urllib.request.urlopen(req, timeout=20) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000:
        raise ValueError("source image over 2MB")
    return data


def query_sellable_products() -> list[dict[str, object]]:
    params = urllib.parse.urlencode({
        "select": "id,image_url,name",
        "physically_verified": "eq.true",
        "is_active": "eq.true",
        "is_whatsapp_active": "eq.true",
        "stock": "gt.0",
        "price": "gt.0",
        "image_url": "not.is.null",
        "order": "id.asc",
        "limit": "1000",
    })
    raw = api_request(f"{SUPABASE_URL}/rest/v1/products?{params}")
    rows = json.loads(raw.decode("utf-8"))
    if not isinstance(rows, list):
        raise ValueError("unexpected products response")
    return rows


stats = {"basket_ok": 0, "product_ok": 0, "skipped": 0, "failed": 0}
errors: list[str] = []

for src in BASKET_SOURCES:
    try:
        if not src.is_file():
            raise FileNotFoundError(src)
        data = compress_image(src.read_bytes())
        upload(f"baskets/{src.stem}.jpg", data)
        stats["basket_ok"] += 1
        print(f"basket {src.name}: {len(data)} bytes")
    except Exception as exc:  # noqa: BLE001
        stats["failed"] += 1
        errors.append(f"basket {src.name}: {exc}")

for row in query_sellable_products():
    pid = str(row.get("id") or "").strip()
    image_url = str(row.get("image_url") or "").strip()
    if not pid or not image_url:
        stats["skipped"] += 1
        continue
    try:
        source = read_url(image_url)
        data = compress_image(source)
        upload(f"products/{pid}.jpg", data)
        stats["product_ok"] += 1
        print(f"product {pid}: {len(data)} bytes")
    except Exception as exc:  # noqa: BLE001
        stats["failed"] += 1
        errors.append(f"product {pid}: {exc}")

print(json.dumps(stats, ensure_ascii=False))
if errors:
    print("Asset errors:", file=sys.stderr)
    for error in errors[:50]:
        print(f"- {error}", file=sys.stderr)

# Basket media is mandatory because it is the first visual experience.
if stats["basket_ok"] != len(BASKET_SOURCES):
    raise SystemExit("not all canonical basket images were synchronized")
# Product failures are non-fatal: the Edge retains a safe original-image fallback.
