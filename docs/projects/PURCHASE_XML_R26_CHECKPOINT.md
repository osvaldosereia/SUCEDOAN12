# R26 — Compras e Catálogo XML — 2026-10-09

Base main: d5f3f16b5b6b8ba27823406de0c43628e62d4a78.

Reviewed mandatory HANDOFF_COMPRAS_CATALOGO_XML_2026-10-08.md completely, R24 checkpoint, R25 branch presence, main recent commits and open-PR search. R25 checkpoint not found on its branch; prior R25 local package is not merged or CI validated.

## Acceptance matrix (NOT homologated)
- Bling XML/manual catalog-only ingestion: isolated functional and browser E2E outstanding.
- Missing-product candidates, historical supplier/price/tax evidence: E2E outstanding.
- Inactive product creation and existing-product linking: authorization and non-mutation assertions outstanding.
- Commercial vs tax GTIN, pack conversion, NCM/CEST conflicts: human/fiscal review outstanding.
- Field-by-field approval, immutable audit, transactional rollback: runtime RPC absent per R25 report; no production release.
- Identifier ACL: R25 report identified excessive grants; recheck live privileges before release.
- Auth, RLS, private XML storage, lazy loading: preserve and verify in browser/runtime read-only.

No production mutations, migrations, deploys, cron, fiscal/commercial actions or main merge authorized. Prior isolated tests are not production acceptance. Next: integrate permission regression tests in fresh branch with CI PostgreSQL 17, then E2E synthetic authenticated review/rollback. This checkpoint records only verified GitHub reads and prior reports; it does not claim a new live Supabase audit.
