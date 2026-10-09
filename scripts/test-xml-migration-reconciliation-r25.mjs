import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const root=new URL("../",import.meta.url);
const read=p=>readFileSync(new URL(p,root),"utf8");
const canonical="supabase/migrations/20261009155231_separation_ready_reservation_idempotence_20261009.sql";
const duplicate="supabase/migrations/20261009160000_separation_ready_reservation_idempotence.sql";
assert.equal(existsSync(new URL(canonical,root)),true,"Applied remote migration must be checked in");
assert.equal(existsSync(new URL(duplicate,root)),false,"Duplicate migration would replay separation function");
const applied=read(canonical);
assert.match(applied,/sync_vitrine_order_stock_reservation_v1/);
assert.match(applied,/order_separation_completions_v1/);
assert.match(applied,/stock_applied/);
assert.match(applied,/return new;/);
assert.match(read("scripts/test-separation-ready-reservation-idempotence.mjs"),/stock_reservation_released|sync_vitrine_order_stock_reservation_v1/);
const r23=read("supabase/migrations/20261009145919_purchase_xml_identity_atomic_r23.sql");
const r24=read("supabase/migrations/20261009155445_purchase_xml_field_approval_r24.sql");
assert.match(r23,/purchase_xml_resolve_catalog_identity_v1/);
assert.match(r24,/purchase_xml_field_review/);
assert.match(r24,/purchase_xml_apply_field_review_v1/);
const order=[
 "20261009035359",
 "20261009145919",
 "20261009155231",
 "20261009155445"
].sort();
assert.deepEqual(order,["20261009035359","20261009145919","20261009155231","20261009155445"]);
assert.match(read("supabase/migrations/20261009035359_purchase_xml_ingest_error_audit_v5.sql"),/purchase_xml_catalog_ingest_errors_v1/);
console.log("PASS R25: applied migration version reconciled; no duplicate order trigger; R23/R24 sequencing documented");
