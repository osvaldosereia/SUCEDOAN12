import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../docs/projects/purchase-xml-field-review-ledger-v1.sql",import.meta.url),"utf8");
function validate(source){
 const required=[
  /create table if not exists public\.purchase_xml_field_reviews_v1/i,
  /create table if not exists public\.purchase_xml_field_review_events_v1/i,
  /on conflict \(observation_id,product_id,field_name\) do nothing/i,
  /source_state='xml_verified'/,
  /linked_product_id=p_product_id/,
  /xml_review_stale_revision/,
  /for update;/i,
  /xml_review_confirmation_required/,
  /xml_review_decision_invalid/,
  /fiscal_review_required/,
  /xml_review_event_immutable_v1/,
  /before update or delete\s+on public\.purchase_xml_field_review_events_v1/i,
  /alter table public\.purchase_xml_field_reviews_v1 enable row level security;/i,
  /alter table public\.purchase_xml_field_review_events_v1 enable row level security;/i,
  /revoke all on function public\.purchase_xml_decide_field_review_v1/i,
  /revoke all on function public\.purchase_xml_open_field_review_v1/i,
  /to service_role;/,
  /'product_updated',false/,
  /'fiscal_updated',false/,
  /p_decision is null or p_decision not in/,
  /p_field_name is null or p_field_name not in/
 ];
 for(const re of required)assert.match(source,re);
 for(const re of [
  /(?:update|delete from|insert into)\s+public\.products\b/i,
  /(?:update|delete from|insert into)\s+public\.product_fiscal_profiles\b/i,
  /(?:update|delete from|insert into)\s+public\.purchase_xml_items\b/i,
  /grant\s+execute\s+on\s+function[^;]+to\s+(?:anon|authenticated)\s*;/i
 ])assert.doesNotMatch(source,re);
}
validate(sql);
for(const fragment of ["for update;","source_state='xml_verified'","xml_review_stale_revision",
 "alter table public.purchase_xml_field_reviews_v1 enable row level security;",
 "'product_updated',false","p_decision is null or p_decision not in"]){
 assert.ok(sql.includes(fragment));
 assert.throws(()=>validate(sql.replace(fragment,"")),fragment);
}
assert.throws(()=>validate(sql+"\nUPDATE public.products SET stock=0;"));
console.log("PASS XML field-review v1: audit/RLS/verified source/CAS/human gate/no catalog writes; 7 negative checks");
