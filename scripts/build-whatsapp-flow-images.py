from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageOps
import pillow_avif  # noqa: F401

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img" / "flow"
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = [
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

MAX_BYTES = 80_000
ATTEMPTS = [(360, 66), (320, 58), (280, 52), (240, 46)]


def save_compact(src: Path, dst: Path) -> int:
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        for edge, quality in ATTEMPTS:
            candidate = im.copy()
            candidate.thumbnail((edge, edge), Image.Resampling.LANCZOS)
            # Use a white square canvas to avoid odd transparent/letterboxed renderings in Flow.
            canvas = Image.new("RGB", (edge, edge), "white")
            x = (edge - candidate.width) // 2
            y = (edge - candidate.height) // 2
            canvas.paste(candidate, (x, y))
            canvas.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)
            size = dst.stat().st_size
            if 0 < size <= MAX_BYTES:
                return size
    raise RuntimeError(f"could not compress {src} below {MAX_BYTES} bytes")


for src in SOURCES:
    if not src.is_file():
        raise FileNotFoundError(src)
    dst = OUT / f"{src.stem}.jpg"
    size = save_compact(src, dst)
    with Image.open(dst) as check:
        if check.format != "JPEG" or check.width > 360 or check.height > 360:
            raise RuntimeError(f"invalid output {dst}: {check.format} {check.size}")
    print(f"{dst.relative_to(ROOT)} {size} bytes")

outputs = sorted(OUT.glob("*.jpg"))
if len(outputs) < len(SOURCES):
    raise RuntimeError(f"expected {len(SOURCES)} generated images, got {len(outputs)}")
print(f"validated {len(outputs)} precompiled WhatsApp Flow images")
