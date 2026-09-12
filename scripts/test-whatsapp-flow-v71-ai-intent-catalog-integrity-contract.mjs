import fs from 'node:fs';
import assert from 'node:assert/strict';

const base='supabase/migrations/20260912171731_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness.sql';
const fix='supabase/migrations/20260912171823_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_fix.sql';
const sql=fs.readFileSync(base,'utf8');
const fixSql=fs.readFileSync(fix,'utf8');

for (const needle of [
  'get_whatsapp_flow_v71_ai_intent_catalog_integrity_readiness_v1',
  'get_whatsapp_flow_owner_homologation_preflight_v12',
  'queue_and_dispatch_whatsapp_flow_owner_homologation_v15',
  'get_whatsapp_flow_v71_homologation_control_plane_v1',
  "'ai_role','intent_text_only'",
  "'commercial_truth','backend_deterministic'",
  "'full_catalog_loaded',false",
  "'max_products_per_query',20",
  "'stock_verified_in_backend',true",
  "'stock_exposed_to_flow',false",
  "revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v14(uuid,text,text) from service_role",
  "grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v15(uuid,text,text) to service_role"
]) assert.ok(sql.includes(needle), `missing ${needle}`);

for (const needle of [
  'coalesce(pr.stock,0)>0',
  "pr.price=(p->>'price')::numeric",
  "coalesce(pr.image_url,'') like 'https://%'",
  "'direct_search_probe','leite'",
  "'direct_search_failures'"
]) assert.ok(fixSql.includes(needle), `fix missing ${needle}`);

assert.ok(!fixSql.includes("pr.stock=(p->>'stock')::numeric"), 'stock must be verified in backend, not expected in Flow card payload');
console.log('v71 AI intent catalog integrity contract: OK');
