import type { Sql } from "npm:postgres@3.4.7";
import type { BasketsDocument, Product, ProductsDocument } from "../../../src/domain/catalog.ts";

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  packaging: string | null;
  unit: string | null;
  price: string | number | null;
  stock_quantity: string | number | null;
  image_url: string | null;
  sku: string | null;
  gtin: string | null;
  bling_product_id: string | number | null;
  is_active: boolean | null;
  is_whatsapp_active: boolean | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function productIdsFromBaskets(document: BasketsDocument): string[] {
  const ids = new Set<string>();
  for (const basket of document.baskets) {
    for (const group of basket.groups) {
      for (const id of group.productIds) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
          throw new Error("As cestas devem referenciar produtos por UUID do Supabase.");
        }
        ids.add(id);
      }
    }
  }
  return [...ids].sort();
}

function productDocument(rows: ProductRow[]): ProductsDocument {
  return {
    schemaVersion: 5,
    products: rows.map((row): Product => ({
      id: row.id,
      name: row.name,
      brand: row.brand ?? "",
      presentation: row.packaging || row.unit || "un",
      unitPriceCents: Math.max(0, Math.round(Number(row.price ?? 0) * 100)),
      stockQuantity: Math.max(0, Math.floor(Number(row.stock_quantity ?? 0))),
      imageUrl: row.image_url ?? "",
      sku: row.sku || null,
      gtin: row.gtin || null,
      blingProductId: row.bling_product_id == null ? null : String(row.bling_product_id),
      active: row.is_active === true && row.is_whatsapp_active === true,
    })),
  };
}

/** Reads only products referenced by the new Admin's basket configuration.
 * The base availability follows the same Supabase stock view used by the existing WhatsApp product search.
 * Confirmed orders not yet invoiced remain deducted from availability in this new order namespace.
 */
export async function readSupabaseBasketProducts(db: Sql, baskets: BasketsDocument): Promise<ProductsDocument> {
  const ids = productIdsFromBaskets(baskets);
  if (!ids.length) throw new Error("Nenhum produto está associado às cestas configuradas.");

  const rows = await db<ProductRow>`
    select p.id::text as id, p.name, p.brand, p.packaging, p.unit, p.price,
      p.image_url, p.sku, p.gtin,
      coalesce(stock.bling_product_id, p.bling_product_id)::text as bling_product_id,
      p.is_active, p.is_whatsapp_active,
      greatest(0, floor(coalesce(stock.effective_sellable_stock, 0) - coalesce(reserved.quantity, 0)))::integer as stock_quantity
    from public.products p
    left join public.ops2_loose_sellable_stock_v1 stock on stock.product_id = p.id
    left join (
      select item.product_id, sum(item.quantity)::numeric as quantity
      from whatsapp_atendimento.order_items item
      join whatsapp_atendimento.orders customer_order on customer_order.id = item.order_id
      where item.product_id = any(${db.array(ids, "text")})
        and customer_order.status not in ('invoice_authorized', 'out_for_delivery', 'completed', 'cancelled')
      group by item.product_id
    ) reserved on reserved.product_id = p.id::text
    where p.id::text = any(${db.array(ids, "text")})
    order by p.id
  `;
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((row) => row.id));
    const missing = ids.filter((id) => !found.has(id));
    throw new Error(`Produto de cesta ausente do Supabase: ${missing.length} identificador(es).`);
  }
  return productDocument(rows);
}

/** SHA-1 is only a compact optimistic-concurrency revision, not an authentication primitive. */
export async function catalogRevision(products: ProductsDocument, basketsSha: string): Promise<string> {
  const businessProducts = products.products
    .map(({ stockQuantity: _stock, ...product }) => product)
    .sort((left, right) => left.id.localeCompare(right.id));
  const source = JSON.stringify(businessProducts);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(source)));
  const productsSha = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  if (!/^[a-f0-9]{40}$/i.test(basketsSha)) throw new Error("A revisão das cestas não é válida.");
  return `${productsSha}:${basketsSha}`;
}

export function catalogDocumentFromBaskets(value: unknown): BasketsDocument {
  if (!isRecord(value) || !Array.isArray(value.baskets)) throw new Error("O documento de cestas do projeto é inválido.");
  return value as unknown as BasketsDocument;
}
