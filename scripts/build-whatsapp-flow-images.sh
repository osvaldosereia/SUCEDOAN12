#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="img/flow"
mkdir -p "$OUT_DIR"

# Basket images used by the WhatsApp Flow. These are precompiled to small JPEGs so
# the Edge Function does not need to transcode WebP/AVIF during a customer session.
sources=(
  "img/cesta-basica-cuiaba-varzea-grande-economica.avif"
  "img/CESTA-MINI-BONINI.webp"
  "img/CESTA-MINI-KOBLENZ.webp"
  "img/CESTA-PEQUENA-BONINI.webp"
  "img/CESTA-PEQUENA-KOBLENZ.webp"
  "img/CESTA-MEDIA-KOBLENZ.webp"
  "img/CESTA-MEDIA-BONINI.webp"
  "img/CESTA-GRANDE-KOBLENZ.webp"
  "img/CESTA-GRANDE-ALVINO.webp"
)

for src in "${sources[@]}"; do
  [[ -f "$src" ]] || { echo "missing source: $src" >&2; exit 1; }
  base="$(basename "$src")"
  stem="${base%.*}"
  dst="$OUT_DIR/$stem.jpg"
  magick "$src" -auto-orient -strip -resize '360x360>' -background white -alpha remove -alpha off -quality 66 "$dst"
  bytes="$(wc -c < "$dst")"
  if (( bytes > 80000 )); then
    magick "$src" -auto-orient -strip -resize '300x300>' -background white -alpha remove -alpha off -quality 54 "$dst"
    bytes="$(wc -c < "$dst")"
  fi
  if (( bytes > 80000 )); then
    echo "generated image exceeds 80KB: $dst ($bytes bytes)" >&2
    exit 1
  fi
  identify "$dst"
  echo "$dst $bytes bytes"
done

python - <<'PY'
from pathlib import Path
files=sorted(Path('img/flow').glob('*.jpg'))
assert len(files)>=9, f'expected at least 9 flow basket images, got {len(files)}'
for p in files:
    assert p.stat().st_size <= 80000, (p,p.stat().st_size)
print(f'validated {len(files)} precompiled WhatsApp Flow images')
PY
