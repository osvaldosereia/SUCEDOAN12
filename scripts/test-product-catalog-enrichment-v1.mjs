import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSafeEnrichmentPatch, isXmlCreatedProduct, canonicalStoreCategory } from "../supabase/functions/product-catalog-enrichment-v1/catalog-enrichment-policy.mjs";

const base = {
  id: "product-1", name: "PIPOCA DOIDOTO 400 GR", is_active: false, gtin: "7891234567890",
  stock: 7, validity_date: "2026-11-30", ncm: "19041000", supplier: "Fornecedor NF",
  last_admin_edit_at: null,
  metadata: { purchase_xml_created: true, purchase_xml_document_key: "nfe-1", ean_reader_segment_visible: true },
};
const taxonomy = { mercearia: ["MILHO DE PIPOCA", "BISCOITO"], higiene_beleza: ["HIGIENE BUCAL"] };
const proposal = { name: "Pipoca Doidoto Tradicional 400 g", description_short: "Milho para pipoca Doidoto, pacote de 400 g.", description_long: "Pipoca Doidoto em embalagem de 400 g. Produto identificado pelas informações da nota fiscal.", category: "mercearia", subcategory: "MILHO DE PIPOCA", confidence: 0.91 };

assert.equal(isXmlCreatedProduct(base), true);
assert.equal(canonicalStoreCategory("Alimentos e bebidas"), "mercearia");
const result = createSafeEnrichmentPatch(base, proposal, taxonomy);
assert.equal(result.queueStatus, "completed");
assert.equal(result.patch.name, proposal.name);
assert.equal(result.patch.sales_category, "mercearia");
assert.equal(result.patch.subcategory, "MILHO DE PIPOCA");
assert.equal(result.patch.is_active, undefined, "enrichment must not activate a product");
assert.equal(result.patch.stock, undefined, "enrichment must not alter inventory");
assert.equal(result.patch.validity_date, undefined, "enrichment must not alter expiry");
assert.equal(result.patch.gtin, undefined, "enrichment must not alter EAN");
assert.equal(result.patch.ncm, undefined, "enrichment must not alter fiscal data");
assert.equal(result.patch.cest, undefined, "enrichment must not alter fiscal evidence");
assert.equal(result.patch.image_url, undefined, "photo stays outside this automation");
assert.equal(result.patch.cost, undefined, "enrichment must not alter purchase cost");
assert.equal(result.patch.price, undefined, "enrichment must not alter selling price");
assert.equal(result.patch.supplier, undefined, "enrichment must not alter supplier evidence");
assert.equal(result.patch.metadata.purchase_xml_document_key, "nfe-1");
assert.equal(result.patch.metadata.ean_reader_segment_visible, true);
assert.throws(() => createSafeEnrichmentPatch({ ...base, is_active: true }, proposal, taxonomy), /product_is_not_inactive/);
assert.throws(() => createSafeEnrichmentPatch({ ...base, last_admin_edit_at: "2026-10-21T12:00:00Z" }, proposal, taxonomy), /product_has_admin_edits/);
const invalid = createSafeEnrichmentPatch(base, { ...proposal, subcategory: "NOVA SUBCATEGORIA" }, taxonomy);
assert.equal(invalid.queueStatus, "review");
assert.equal(invalid.patch.subcategory, undefined, "must not invent a site subcategory");
assert.equal(invalid.patch.metadata.catalog_enrichment_review_required, true);

const migration = await readFile(new URL("../supabase/migrations/20261021190000_product_catalog_enrichment_v1.sql", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../supabase/functions/admin-products-live-v1/index.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../supabase/functions/product-catalog-enrichment-v1/index.ts", import.meta.url), "utf8");
assert.match(migration, /products_enqueue_xml_catalog_enrichment_v1/);
assert.match(migration, /'\*\/15 \* \* \* \*'/, "scheduled worker runs every 15 minutes");
assert.match(migration, /product_catalog_enrichment_worker_secret_v1/);
assert.match(adminApi, /metadata->>ean_reader_segment_visible/);
assert.match(adminApi, /__ean_catalog_origin/);
assert.match(worker, /get_product_catalog_enrichment_openai_key_v1/);
assert.doesNotMatch(worker, /google\.com\/search|imagegen|images\/generations/i, "worker must not search or generate photos");
console.log("product catalog enrichment policy: all assertions passed");
