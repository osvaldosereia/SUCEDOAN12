import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260909123000_whatsapp_flow_basket_adjustment_policy_v3.sql',import.meta.url),'utf8');
const contractFix=fs.readFileSync(new URL('../supabase/migrations/20260909124500_whatsapp_flow_basket_adjustment_contract_v3_fix.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/whatsapp-flow-data-exchange-v1/index.ts',import.meta.url),'utf8');
const flow=JSON.parse(fs.readFileSync(new URL('../whatsapp/flows/flow-cestas-comercial-v3.json',import.meta.url),'utf8'));

assert.equal(flow.version,'7.1');
assert.equal(flow.data_api_version,'3.0');
assert.deepEqual(flow.routing_model.PERSONALIZAR,['AJUSTAR_ITEM','SECOES']);
assert.deepEqual(flow.routing_model.AJUSTAR_ITEM,['PERSONALIZAR']);
assert.ok(flow.screens.some(s=>s.id==='AJUSTAR_ITEM'));
assert.match(JSON.stringify(flow),/basket_customize_v3/);
assert.match(JSON.stringify(flow),/basket_item_apply/);
assert.doesNotMatch(JSON.stringify(flow.screens.find(s=>s.id==='PERSONALIZAR')),/Nova quantidade/);

assert.match(migration,/get_whatsapp_flow_basket_adjustment_options_v1/);
assert.match(migration,/patch_whatsapp_flow_basket_selection_v2/);
assert.match(migration,/handle_whatsapp_flow_commercial_exchange_v3/);
assert.match(migration,/removal_allowed/);
assert.match(migration,/decrease_allowed/);
assert.match(migration,/increase_allowed/);
assert.match(migration,/component_prices_visible',false/);
assert.match(migration,/backend_validation_required',true/);
assert.match(migration,/return public\.handle_whatsapp_flow_commercial_exchange_v2/);

assert.match(contractFix,/basket_customize_v3/);
assert.match(contractFix,/AJUSTAR_ITEM/);
assert.match(contractFix,/basket_item_apply/);
assert.match(contractFix,/"basket_customize"/);
assert.match(contractFix,/return public\.handle_whatsapp_flow_commercial_exchange_v2/);

for(const source of [migration,contractFix]){
  assert.match(source,/whatsapp_live_canary_percent=1/);
  assert.match(source,/experience_orchestrator_enabled=false/);
  assert.match(source,/whatsapp_flow_data_exchange_enabled=false/);
  assert.match(source,/whatsapp_flow_send_enabled=false/);
  assert.match(source,/whatsapp_flow_commercial_write_enabled=false/);
  assert.match(source,/bling_order_sync_enabled=false/);
}

assert.match(edge,/handle_whatsapp_flow_commercial_exchange_v3/);
assert.doesNotMatch(edge,/console\.log\([^)]*flowToken/);

console.log('PASS: visual Flow V3 uses a dedicated adjustment screen, policies stay deterministic, legacy paths remain delegated, and all runtime gates stay OFF.');
