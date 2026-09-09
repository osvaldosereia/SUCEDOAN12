import assert from 'node:assert/strict';
import fs from 'node:fs';

const flow=JSON.parse(fs.readFileSync(new URL('../whatsapp/flows/flow-cestas-comercial-v2.json',import.meta.url),'utf8'));
const migration=fs.readFileSync(new URL('../supabase/migrations/20260909073500_whatsapp_flow_commercial_multi_addons_v2.sql',import.meta.url),'utf8');
const guard=fs.readFileSync(new URL('../supabase/migrations/20260909074200_whatsapp_flow_extras_preview_total_guard_v1.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/whatsapp-flow-data-exchange-v1/index.ts',import.meta.url),'utf8');

assert.equal(flow.version,'7.1');
assert.equal(flow.data_api_version,'3.0');
assert.deepEqual(flow.routing_model.PRODUTO,['SECOES']);
assert.ok(flow.routing_model.SECOES.includes('TERMOS'));
assert.ok(flow.routing_model.SECOES.includes('PRODUTOS'));
assert.ok(flow.routing_model.SECOES.includes('UPSELL'));
assert.doesNotMatch(JSON.stringify(flow),/"init-value"/,'Meta Flow schema must not include unsupported TextInput init-value');

const sections=flow.screens.find(s=>s.id==='SECOES');
assert.ok(sections);
const extrasForm=sections.layout.children.find(c=>c.type==='Form'&&c.name==='extras_form');
assert.ok(extrasForm);
assert.ok(extrasForm.children.some(c=>c.name==='extras_action'));
assert.ok(extrasForm.children.some(c=>c.name==='direct_query'));
assert.ok(JSON.stringify(extrasForm).includes('extras_continue'));

const product=flow.screens.find(s=>s.id==='PRODUTO');
assert.ok(product);
assert.ok(JSON.stringify(product).includes('Adicionar e continuar comprando'));
assert.ok(JSON.stringify(product).includes('product_image_base64'));

assert.match(migration,/handle_whatsapp_flow_commercial_exchange_v2/);
assert.match(migration,/direct_search/);
assert.match(migration,/flow_pending_addons/);
assert.match(migration,/jsonb_array_length\(v_pending\)<30/);
assert.match(migration,/get_whatsapp_flow_product_results_v1\(v_query,12\)/);
assert.match(migration,/return public\.handle_whatsapp_flow_commercial_exchange_v1/);
assert.match(migration,/whatsapp_flow_commercial_write_enabled=false/);
assert.match(migration,/bling_order_sync_enabled=false/);

assert.match(guard,/Prévia em montagem/);
assert.match(guard,/v_write_ready/);
assert.match(edge,/handle_whatsapp_flow_commercial_exchange_v2/);
assert.doesNotMatch(edge,/console\.log\([^)]*flowToken/);

console.log('whatsapp-flow-cestas-commercial-v2: ok');
