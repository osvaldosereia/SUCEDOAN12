import assert from 'node:assert/strict';
import fs from 'node:fs';

const p='supabase/migrations/20260911142500_whatsapp_flow_v44_ai_intent_bridge_v1.sql';
const sql=fs.readFileSync(p,'utf8');

for (const required of [
  'get_whatsapp_flow_ai_intent_entry_v1',
  'get_whatsapp_flow_intent_products_v1',
  'get_whatsapp_flow_v44_ai_intent_bridge_readiness_v1',
  "'target_screen','PRODUTOS_A'",
  "'ai_role','intent_text_only'",
  "'ai_authoritative_for_catalog',false",
  "'full_catalog_loaded',false",
  "'component_prices_visible',true",
  "'basket_component_prices_visible',false",
  "'max_products_per_query', 20",
  "'default_products_per_query', 12"
]) assert.match(sql,new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

assert.match(sql,/whatsapp_live_canary_percent=1/);
assert.match(sql,/not coalesce\(cfg\.experience_orchestrator_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.whatsapp_flow_data_exchange_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.whatsapp_flow_send_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.whatsapp_flow_commercial_write_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.bling_order_sync_enabled,false\)/);
assert.match(sql,/revoke all on function public\.get_whatsapp_flow_ai_intent_entry_v1\(text,integer\) from public,anon,authenticated/);
assert.match(sql,/grant execute on function public\.get_whatsapp_flow_ai_intent_entry_v1\(text,integer\) to service_role/);
assert.doesNotMatch(sql,/update\s+public\.automation_config\s+set/i);
assert.doesNotMatch(sql,/insert\s+into\s+public\.orders/i);

console.log('OK whatsapp flow v44 AI intent bridge contract');
