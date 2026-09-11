import fs from 'node:fs';
import assert from 'node:assert/strict';

const p='supabase/migrations/20260911051600_whatsapp_flow_v35_session_aware_upsell_v1.sql';
const sql=fs.readFileSync(p,'utf8');

assert.match(sql,/get_whatsapp_flow_session_recommendations_v1/);
assert.match(sql,/handle_whatsapp_flow_commercial_exchange_v25/);
assert.match(sql,/handle_whatsapp_flow_commercial_exchange_v24/);
assert.match(sql,/flow_pending_addons/);
assert.match(sql,/flow_pending_product/);
assert.match(sql,/basket_template_items/);
assert.match(sql,/get_cart_aware_recommendations\(p_conversation_id,30,'upsell'\)/);
assert.match(sql,/not exists\(select 1 from excluded/);
assert.match(sql,/limit greatest\(1,least\(coalesce\(p_limit,6\),6\)\)/);
assert.match(sql,/Sugestões opcionais relacionadas ao seu pedido/);
assert.match(sql,/ai_authoritative_for_products',false/);
assert.match(sql,/optional_upsell',true/);
assert.match(sql,/writes_executed',false/);
assert.match(sql,/whatsapp_live_canary_percent=1/);
assert.match(sql,/not coalesce\(cfg\.experience_orchestrator_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.whatsapp_flow_data_exchange_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.whatsapp_flow_send_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.whatsapp_flow_commercial_write_enabled,false\)/);
assert.match(sql,/not coalesce\(cfg\.bling_order_sync_enabled,false\)/);
assert.match(sql,/revoke all on function public\.get_whatsapp_flow_session_recommendations_v1\(uuid,uuid,integer\) from public,anon,authenticated/);
assert.match(sql,/grant execute on function public\.get_whatsapp_flow_session_recommendations_v1\(uuid,uuid,integer\) to service_role/);

console.log('V35 session-aware upsell contract OK');
