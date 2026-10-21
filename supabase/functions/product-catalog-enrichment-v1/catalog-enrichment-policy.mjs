export const STORE_CATEGORIES = Object.freeze([
  "mercearia",
  "limpeza_lavanderia",
  "higiene_beleza",
  "casa_pet",
]);

const CATEGORY_ALIASES = new Map([
  ["mercearia", "mercearia"],
  ["alimentos", "mercearia"],
  ["alimentos e bebidas", "mercearia"],
  ["bebidas", "mercearia"],
  ["limpeza e descartaveis", "limpeza_lavanderia"],
  ["limpeza e lavanderia", "limpeza_lavanderia"],
  ["limpeza_lavanderia", "limpeza_lavanderia"],
  ["higiene e beleza", "higiene_beleza"],
  ["higiene_beleza", "higiene_beleza"],
  ["casa e pet", "casa_pet"],
  ["casa_pet", "casa_pet"],
  ["pets", "casa_pet"],
]);

export function canonicalStoreCategory(value) {
  const key = String(value ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return CATEGORY_ALIASES.get(key) ?? "";
}

export function isXmlCreatedProduct(product) {
  const m = product?.metadata && typeof product.metadata === "object" && !Array.isArray(product.metadata)
    ? product.metadata
    : {};
  return m.purchase_xml_created === true || m.purchase_xml_created === "true";
}

export function createSafeEnrichmentPatch(product, proposal, taxonomy) {
  if (!isXmlCreatedProduct(product)) throw new Error("product_not_xml_created");
  if (product?.is_active !== false) throw new Error("product_is_not_inactive");
  const meta = product.metadata && typeof product.metadata === "object" && !Array.isArray(product.metadata)
    ? product.metadata
    : {};
  if (product.last_admin_edit_at) throw new Error("product_has_admin_edits");
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) throw new Error("invalid_proposal");

  const name = String(proposal.name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
  const descriptionShort = String(proposal.description_short ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  let descriptionLong = String(proposal.description_long ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1400);
  if (!name || !descriptionShort || !descriptionLong) throw new Error("incomplete_proposal");
  if (/\b(?:sem\s+(?:marca|peso|volume|informa(?:ção|cao))\s+(?:especificad[oa]|informad[oa])|n[aã]o\s+informad[oa]|variante)\b/i.test(descriptionLong)) {
    descriptionLong = `${descriptionShort} Cadastro organizado com base nas informações da nota fiscal.`;
  }

  const category = STORE_CATEGORIES.includes(String(proposal.category ?? "")) ? String(proposal.category) : "";
  const candidateSubcategories = Array.isArray(taxonomy?.[category]) ? taxonomy[category] : [];
  const subcategory = candidateSubcategories.includes(String(proposal.subcategory ?? "")) ? String(proposal.subcategory) : "";
  const confidence = Math.max(0, Math.min(1, Number(proposal.confidence) || 0));
  const needsReview = !category || !subcategory || confidence < 0.72;
  const enrichedAt = new Date().toISOString();

  return {
    patch: {
      name,
      description_short: descriptionShort,
      description_long: descriptionLong,
      ...(category ? { sales_category: category, storefront_category: category, category } : {}),
      ...(subcategory ? { subcategory } : {}),
      metadata: {
        ...meta,
        catalog_enrichment_status: needsReview ? "review" : "ready",
        catalog_enrichment_origin: "purchase_xml",
        catalog_enrichment_review_required: needsReview,
        catalog_enrichment_confidence: confidence,
        catalog_enrichment_model: "gpt-4.1-mini",
        catalog_enriched_at: enrichedAt,
        ean_reader_segment_visible: true,
      },
    },
    queueStatus: needsReview ? "review" : "completed",
    reviewReason: !category ? "categoria_nao_validada" : !subcategory ? "subcategoria_nao_validada" : confidence < 0.72 ? "baixa_confianca" : null,
  };
}
