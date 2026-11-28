// Fail-closed NF-e XML ingestion guard. Shared by manual-only, Bling and replay paths.
// No network, data-store, invoice, stock or master product side effects.
import { extractCatalogFromNfe } from "./xml-catalog-extractor.mjs";

export const MAX_CATALOG_XML_BYTES = 10 * 1024 * 1024;

export function assertCatalogXmlSize(xml) {
  if (typeof xml !== "string" || !xml.trim()) throw new Error("xml_size_invalid");
  // Supabase Storage limits bytes; JS String.length counts UTF-16 code units.
  // Enforce bytes to reject multi-byte XMLs that would pass a char-count guard.
  if (new TextEncoder().encode(xml).byteLength > MAX_CATALOG_XML_BYTES)
    throw new Error("xml_size_invalid");
  return xml;
}

export function assertCatalogXmlIntegrity(xml, expectedKey) {
  assertCatalogXmlSize(xml);
  const parsed = extractCatalogFromNfe(xml, expectedKey);
  if (parsed.items.length > 5000) throw new Error("xml_item_limit");
  return parsed;
}

export function assertExistingXmlDigest(existingDigest, incomingDigest) {
  // Legacy records may lack hashes; never invent equivalence in that case.
  const old = String(existingDigest ?? "").trim().toLowerCase();
  const next = String(incomingDigest ?? "").trim().toLowerCase();
  if (old && (!/^[0-9a-f]{64}$/.test(old) || !/^[0-9a-f]{64}$/.test(next) || old !== next))
    throw new Error("existing_nfe_key_has_different_xml");
  return true;
}
