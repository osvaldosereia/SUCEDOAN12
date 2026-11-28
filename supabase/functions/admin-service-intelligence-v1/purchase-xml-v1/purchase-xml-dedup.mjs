export function isCompleteImportedInvoice(document) {
  if (!document || typeof document !== "object") return false;
  const expected = Number(document.item_count);
  if (!Number.isInteger(expected) || expected < 1) return false;
  return Boolean(
    String(document.document_key || "").length === 44 &&
    String(document.storage_path || "").trim() &&
    /^[a-f0-9]{64}$/i.test(String(document.content_sha256 || "")) &&
    document.catalog_only === true &&
    Number(document.catalog_evidence_count) === expected &&
    Number(document.staged_item_count) === expected &&
    document.catalog_recovery_failed !== true
  );
}
