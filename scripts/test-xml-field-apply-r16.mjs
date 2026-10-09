import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const content=readFileSync(new URL("../docs/projects/purchase-xml-field-apply-r16.sql",import.meta.url),"utf8");
const fixture=readFileSync(new URL("./fixtures/xml-field-review-ledger-r14.sql",import.meta.url),"utf8");
const test=readFileSync(new URL("./test-xml-field-apply-r16.pg.sql",import.meta.url),"utf8");
const rules=[
 /-- R16 PROPOSAL: NOT A MIGRATION/,
 /p_confirmation is distinct from 'APLICAR_NOME_APROVADO_XML'/,
 /p_confirmation is distinct from 'REVERTER_NOME_APLICADO_XML'/,
 /v\.status<>'approved' or v\.field_name<>'name'/,
 /v\.revision is distinct from p_expected_revision/,
 /v_current is distinct from v\.original_value/,
 /v_current is distinct from v\.applied_value/,
 /for update;/i,
 /get diagnostics v_count=row_count;/i,
 /xml_apply_already_applied/,
 /xml_review_rollback_required/,
 /purchase_xml_field_application_events_v1/,
 /enable row level security;/,
 /to service_role;/,
 /revoke all on function public\.purchase_xml_apply_field_review_v1/,
 /revoke all on function public\.purchase_xml_rollback_field_review_v1/
];
for(const x of rules)assert.match(content,x);
for(const bad of [
 /update\s+public\.products\s+set\s+(?:stock|price|cost|gtin|ncm|unit|is_active)\b/i,
 /update\s+public\.product_fiscal_profiles\b/i,
 /insert\s+into\s+public\.purchase_xml_(?:items|documents)\b/i,
 /http[s]?:\/\/api\.bling\.com\.br/i,
 /\bgrant\s+execute\s+on\s+function[^;]+\bto\s+(?:anon|authenticated)\s*;/i
])assert.doesNotMatch(content,bad);
assert.match(content,/update public\.products set name=v\.proposed_value/);
assert.match(content,/update public\.products set name=v\.before_value/);
assert.match(fixture,/TEST FIXTURE: exact SQL snapshot of PR #990/);
assert.match(test,/\i scripts\/fixtures\/xml-field-review-ledger-r14\.sql/);
assert.match(test,/\i docs\/projects\/purchase-xml-field-apply-r16\.sql/);
let denied=0;
for(const replacement of ["update public.products set stock=0;","update public.product_fiscal_profiles set ncm='0';",
 "grant execute on function public.purchase_xml_apply_field_review_v1(uuid,integer,uuid,text) to authenticated;"]){
 const modified=content+"\n"+replacement;
 try{
  for(const bad of [
   /update\s+public\.products\s+set\s+(?:stock|price|cost|gtin|ncm|unit|is_active)\b/i,
   /update\s+public\.product_fiscal_profiles\b/i,
   /\bgrant\s+execute\s+on\s+function[^;]+\bto\s+(?:anon|authenticated)\s*;/i
  ])assert.doesNotMatch(modified,bad);
 }catch(_){denied++;}
}
assert.equal(denied,3);
console.log("PASS R16 SQL source contract: name-only CAS application, rollback, service-only grants and negatives");
