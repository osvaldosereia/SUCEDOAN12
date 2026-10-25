"""Build the greenfield catalog and optimized product images from a temporary export.

The input is a deliberately narrow data extract, not a database dump. It must not
contain customers, orders, stock, credentials, or the private basket adjustment.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


PROJECT = Path(__file__).resolve().parents[1]
MAX_IMAGE_BYTES = 27_000
MAX_SOURCE_BYTES = 12_000_000
IMAGE_SIZE = (240, 190)
ALLOWED_HOSTS = {"ssbesxgaijknwsjbsbcz.supabase.co", "raw.githubusercontent.com"}
SOURCE_IMAGE_ROOT = "/storage/v1/object/public/product-images/"
GITHUB_IMAGE_PREFIX = "/osvaldosereia/SUCEDOAN12/"
KNOWN_NAME_FIXES = {
    "785d5c0d-2ddf-4818-a85b-7575132f9633": "Café a Vácuo Brasileiro 250 g",
    "27e56e5d-4575-4a72-8bfa-926b168f76ce": "Creme Dental Close Up Triple Hortelã 70 g",
}


def slug(value: str) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-") or "grupo"


def cents(value: object) -> int:
    amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(amount * 100)


def image_source(url: str) -> tuple[str, str]:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError(f"Imagem fora da lista de origens permitidas: {url}")
    if parsed.hostname == "ssbesxgaijknwsjbsbcz.supabase.co":
        if not parsed.path.startswith(SOURCE_IMAGE_ROOT):
            raise ValueError(f"Caminho Supabase não aprovado: {parsed.path}")
        return "supabase-storage", parsed.path
    if not parsed.path.startswith(GITHUB_IMAGE_PREFIX):
        raise ValueError(f"Caminho GitHub não aprovado: {parsed.path}")
    parts = parsed.path[len(GITHUB_IMAGE_PREFIX) :].split("/", 1)
    if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{40}", parts[0]):
        raise ValueError(f"O arquivo GitHub precisa usar commit SHA imutável: {parsed.path}")
    return "github-raw", parsed.path


def read_source_image(url: str) -> tuple[bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "whatsapp-atendimento-catalog-import/1.0"})
    with urllib.request.urlopen(request, timeout=25) as response:
        final = urllib.parse.urlsplit(response.geturl())
        if final.scheme != "https" or final.hostname not in ALLOWED_HOSTS:
            raise ValueError(f"Redirecionamento para origem não aprovada: {response.geturl()}")
        content_type = response.headers.get_content_type()
        if content_type not in {"image/webp", "application/octet-stream"}:
            raise ValueError(f"MIME inesperado para {url}: {content_type}")
        payload = response.read(MAX_SOURCE_BYTES + 1)
    if len(payload) > MAX_SOURCE_BYTES:
        raise ValueError(f"Imagem de origem excede {MAX_SOURCE_BYTES} bytes: {url}")
    if len(payload) < 12 or payload[:4] != b"RIFF" or payload[8:12] != b"WEBP":
        raise ValueError(f"Arquivo não tem assinatura WebP válida: {url}")
    return payload, content_type


def optimize(payload: bytes) -> tuple[bytes, tuple[int, int], tuple[int, int]]:
    with Image.open(io.BytesIO(payload)) as source:
        source.load()
        if source.format != "WEBP" or source.width < 32 or source.height < 32:
            raise ValueError(f"Imagem WebP tem dimensões/formato inadequados: {source.size}, {source.format}")
        source_size = source.size
        if source.width * source.height > 40_000_000:
            raise ValueError(f"Imagem de origem grande demais: {source.size}")
        source = ImageOps.contain(source.convert("RGBA"), IMAGE_SIZE, method=Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", IMAGE_SIZE, "white")
        canvas.alpha_composite(source, ((IMAGE_SIZE[0] - source.width) // 2, (IMAGE_SIZE[1] - source.height) // 2))
        flattened = canvas.convert("RGB")

        for size in (IMAGE_SIZE, (220, 175), (200, 158), (180, 143)):
            resized = flattened.resize(size, Image.Resampling.LANCZOS)
            for quality in range(60, 34, -5):
                target = io.BytesIO()
                resized.save(target, format="WEBP", quality=quality, method=6)
                result = target.getvalue()
                if len(result) <= MAX_IMAGE_BYTES:
                    return result, source_size, size
    raise ValueError("Não foi possível comprimir a imagem para o limite de 27 KB")


def make_contact_sheets(products: list[dict], destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    try:
        font = ImageFont.truetype("arial.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    columns, rows_per_page = 4, 5
    cell_width, cell_height = 170, 145
    for start in range(0, len(products), columns * rows_per_page):
        page = products[start : start + columns * rows_per_page]
        sheet = Image.new("RGB", (columns * cell_width, rows_per_page * cell_height), "white")
        draw = ImageDraw.Draw(sheet)
        for offset, product in enumerate(page):
            row, column = divmod(offset, columns)
            x, y = column * cell_width, row * cell_height
            image_path = PROJECT / product["imagePath"]
            with Image.open(image_path) as image:
                image.thumbnail((150, 108), Image.Resampling.LANCZOS)
                sheet.paste(image.convert("RGB"), (x + 10, y + 4))
            title = f"{start + offset + 1}. {product['brand']} — {product['name']}"
            draw.text((x + 5, y + 114), title[:31], fill="#17212b", font=font)
            draw.text((x + 5, y + 130), (product["sku"] or "SKU pendente")[:26], fill="#657383", font=font)
        sheet.save(destination / f"contact-{start // (columns * rows_per_page) + 1:02d}.png", optimize=True)


def build(input_path: Path) -> None:
    source = json.loads(input_path.read_text(encoding="utf-8"))
    source_products = source["products"]
    configuration = source["configuration"]
    if len(source_products) != 61:
        raise ValueError(f"Esperados 61 produtos distintos; recebido {len(source_products)}")
    if len(configuration["baskets"]) != 5:
        raise ValueError(f"Esperadas 5 cestas ativas; recebido {len(configuration['baskets'])}")

    product_ids = {product["id"] for product in source_products}
    configured_ids = {
        product_id
        for group in configuration["groups"]
        for product_id in group["productIds"]
    }
    if product_ids != configured_ids:
        raise ValueError(
            f"Produtos divergentes: sem opção={sorted(product_ids - configured_ids)}, "
            f"sem registro={sorted(configured_ids - product_ids)}"
        )

    image_dir = PROJECT / "images" / "products"
    image_dir.mkdir(parents=True, exist_ok=True)
    products: list[dict] = []
    manifest: list[dict] = []
    missing_integration_fields: list[str] = []

    for source_product in source_products:
        product_id = str(source_product["id"])
        url = str(source_product["imageUrl"])
        origin, source_path = image_source(url)
        original, _ = read_source_image(url)
        optimized, source_dimensions, output_dimensions = optimize(original)
        output = image_dir / f"{product_id}.webp"
        output.write_bytes(optimized)

        selected_price = source_product["offerPrice"]
        if selected_price is None:
            selected_price = source_product["unitPrice"]
        mapped = {
            "id": product_id,
            "name": KNOWN_NAME_FIXES.get(product_id, str(source_product["name"]).strip()),
            "brand": str(source_product["brand"] or "Sem marca").strip(),
            "presentation": str(source_product["presentation"] or source_product["unit"] or "Unidade").strip(),
            "unitPriceCents": cents(selected_price),
            "imagePath": f"images/products/{product_id}.webp",
            "sku": str(source_product["sku"]).strip() if source_product["sku"] else None,
            "gtin": str(source_product["gtin"]).strip() if source_product["gtin"] else None,
            "blingProductId": str(source_product["blingProductId"]) if source_product["blingProductId"] is not None else None,
            "active": bool(source_product["active"]),
        }
        if not mapped["name"]:
            raise ValueError(f"Produto sem nome: {product_id}")
        if mapped["sku"] is None:
            missing_integration_fields.append(f"{product_id}:sku")
        if mapped["blingProductId"] is None:
            missing_integration_fields.append(f"{product_id}:blingProductId")
        products.append(mapped)
        manifest.append(
            {
                "productId": product_id,
                "imagePath": mapped["imagePath"],
                "sourceOrigin": origin,
                "sourcePath": source_path,
                "sourceSha256": hashlib.sha256(original).hexdigest(),
                "sourceBytes": len(original),
                "sourceWidth": source_dimensions[0],
                "sourceHeight": source_dimensions[1],
                "outputSha256": hashlib.sha256(optimized).hexdigest(),
                "outputBytes": len(optimized),
                "width": output_dimensions[0],
                "height": output_dimensions[1],
                "reviewStatus": "pending",
            }
        )

    products.sort(key=lambda product: (product["name"].casefold(), product["id"]))
    product_document = {"schemaVersion": 1, "products": products}
    baskets: list[dict] = []
    for source_basket in configuration["baskets"]:
        basket_id = slug(source_basket["name"])
        groups = [group for group in configuration["groups"] if group["basketId"] == source_basket["id"]]
        group_ids: set[str] = set()
        mapped_groups = []
        for group in sorted(groups, key=lambda item: (item["sortOrder"], item["name"].casefold())):
            group_id = f"{basket_id}-{slug(group['name'])}"
            if group_id in group_ids:
                group_id += f"-{group['sortOrder']}"
            if group_id in group_ids:
                raise ValueError(f"Grupo duplicado sem ID estável único: {group_id}")
            group_ids.add(group_id)
            quantity = int(group["initialQuantity"])
            if quantity < 0 or quantity > 10:
                raise ValueError(f"Quantidade inicial fora de 0–10: {group['basketName']} / {group['name']}")
            mapped_groups.append(
                {
                    "id": group_id,
                    "label": str(group["name"]).strip(),
                    "category": str(group["category"] or "Outros").strip(),
                    "productIds": [str(product_id) for product_id in group["productIds"]],
                    "minimumQuantity": 0,
                    "maximumQuantity": 10,
                    "initialQuantity": quantity,
                    "removalAllowed": True,
                }
            )
        baskets.append(
            {
                "id": basket_id,
                "name": str(source_basket["name"]).strip(),
                "active": bool(source_basket["active"]),
                "sortOrder": int(source_basket["sortOrder"]),
                "basePriceCents": int(source_basket["basePriceCents"]),
                "groups": mapped_groups,
            }
        )

    catalog_dir = PROJECT / "catalog"
    catalog_dir.mkdir(parents=True, exist_ok=True)
    (catalog_dir / "products.json").write_text(json.dumps(product_document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (catalog_dir / "baskets.json").write_text(json.dumps({"schemaVersion": 1, "baskets": baskets}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (catalog_dir / "image-manifest.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "preparedOn": date.today().isoformat(),
                "flowImageLimitBytes": MAX_IMAGE_BYTES,
                "reviewStatus": "pending",
                "images": manifest,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (catalog_dir / "import-report.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "preparedOn": date.today().isoformat(),
                "sourceSelection": "five active basket configurations; positive quantities; active product types",
                "productCount": len(products),
                "basketCount": len(baskets),
                "groupCount": sum(len(basket["groups"]) for basket in baskets),
                "optionCount": len(configured_ids),
                "missingIntegrationFields": missing_integration_fields,
                "note": "Resolve missing fiscal identifiers before enabling affected products for confirmed orders.",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    review_dir = PROJECT / ".round1-tmp" / "review"
    make_contact_sheets(products, review_dir)
    print(
        json.dumps(
            {
                "products": len(products),
                "baskets": len(baskets),
                "groupsByBasket": {basket["name"]: len(basket["groups"]) for basket in baskets},
                "options": len(configured_ids),
                "missingIntegrationFields": missing_integration_fields,
                "imageBytesMax": max(item["outputBytes"] for item in manifest),
                "imageBytesAverage": round(sum(item["outputBytes"] for item in manifest) / len(manifest)),
                "reviewSheets": str(review_dir),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="temporary narrow catalog export in JSON")
    args = parser.parse_args()
    try:
        build(args.input)
    except Exception as error:
        print(f"Catálogo não preparado: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
