import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync(new URL('../supabase/functions/whatsapp-flow-data-exchange-v1/index.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260909132500_whatsapp_flow_commercial_handler_v4_unrolled.sql',import.meta.url),'utf8');
const flow=JSON.parse(fs.readFileSync(new URL('../whatsapp/flows/flow-cestas-comercial-v5.json',import.meta.url),'utf8'));

assert.match(edge,/handle_whatsapp_flow_commercial_exchange_v4/,'commercial Data Exchange must use handler v4');
assert.doesNotMatch(edge,/handle_whatsapp_flow_commercial_exchange_v3\"/,'Edge Function must not route the commercial definition directly to v3');
assert.match(edge,/\^PRODUTO\(\?:_\[123\]\)\?\$/,'product image hydration must support unrolled product screens');
assert.match(edge,/action!=="ping"&&!readiness\?\.data_exchange_enabled/,'non-ping Data Exchange must remain gated');

for(const screen of ['SECOES_1','TERMOS_1','PRODUTOS_1','PRODUTO_1','SECOES_2','TERMOS_2','PRODUTOS_2','PRODUTO_2','SECOES_3','TERMOS_3','PRODUTOS_3','PRODUTO_3']){
  assert.ok(flow.screens.some(s=>s.id===screen),`missing visual v5 screen ${screen}`);
}
assert.deepEqual(flow.routing_model.PRODUTO_1,['SECOES_2']);
assert.deepEqual(flow.routing_model.PRODUTO_2,['SECOES_3']);
assert.deepEqual(flow.routing_model.PRODUTO_3,['UPSELL']);
assert.match(JSON.stringify(flow),/direct_search/,'visual flow must preserve direct product search');
assert.match(JSON.stringify(flow),/term_selected/,'visual flow must preserve segmented search terms');

for(const required of [
  'whatsapp_live_canary_percent=1',
  'experience_orchestrator_enabled=false',
  'whatsapp_flow_data_exchange_enabled=false',
  'whatsapp_flow_send_enabled=false',
  'whatsapp_flow_commercial_write_enabled=false',
  'bling_order_sync_enabled=false',
]) assert.ok(migration.includes(required),`safety gate drift: ${required}`);

console.log('WhatsApp Flow Data Exchange v5 static contract: OK');
