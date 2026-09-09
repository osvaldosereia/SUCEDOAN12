import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260909123000_whatsapp_flow_basket_adjustment_policy_v3.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/whatsapp-flow-data-exchange-v1/index.ts',import.meta.url),'utf8');

assert.match(migration,/get_whatsapp_flow_basket_adjustment_options_v1/);
assert.match(migration,/patch_whatsapp_flow_basket_selection_v2/);
assert.match(migration,/handle_whatsapp_flow_commercial_exchange_v3/);
assert.match(migration,/basket_item_prepare/);
assert.match(migration,/basket_item_apply/);
assert.match(migration,/removal_allowed/);
assert.match(migration,/decrease_allowed/);
assert.match(migration,/increase_allowed/);
assert.match(migration,/component_prices_visible',false/);
assert.match(migration,/backend_validation_required',true/);
assert.match(migration,/return public\.handle_whatsapp_flow_commercial_exchange_v2/);
assert.match(migration,/whatsapp_live_canary_percent=1/);
assert.match(migration,/experience_orchestrator_enabled=false/);
assert.match(migration,/whatsapp_flow_data_exchange_enabled=false/);
assert.match(migration,/whatsapp_flow_send_enabled=false/);
assert.match(migration,/whatsapp_flow_commercial_write_enabled=false/);
assert.match(migration,/bling_order_sync_enabled=false/);
assert.match(edge,/handle_whatsapp_flow_commercial_exchange_v3/);
assert.doesNotMatch(edge,/console\.log\([^)]*flowToken/);

console.log('PASS: basket adjustment v3 separates remove/decrease/increase policies, delegates legacy paths, and preserves all runtime gates OFF.');
