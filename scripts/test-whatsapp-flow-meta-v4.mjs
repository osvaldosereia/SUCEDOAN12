import assert from 'node:assert/strict';
import fs from 'node:fs';

const flow=JSON.parse(fs.readFileSync(new URL('../whatsapp/flows/flow-cestas-comercial-v4.json',import.meta.url),'utf8'));
const edge=fs.readFileSync(new URL('../supabase/functions/whatsapp-flow-data-exchange-v1/index.ts',import.meta.url),'utf8');

assert.equal(flow.version,'7.3');
assert.equal(flow.data_api_version,'3.0');
assert.deepEqual(flow.routing_model.PERSONALIZAR,['AJUSTAR_ITEM','SECOES']);
assert.deepEqual(flow.routing_model.AJUSTAR_ITEM,[],'Meta routing_model must not declare the backward AJUSTAR_ITEM -> PERSONALIZAR route');
assert.ok(flow.screens.some(s=>s.id==='AJUSTAR_ITEM'));
assert.doesNotMatch(JSON.stringify(flow),/"init-value"/,'Meta TextInput does not accept init-value');
for(const [screen,destinations] of Object.entries(flow.routing_model)){
  assert.ok(!destinations.includes(screen),`Meta routing model must not self-loop: ${screen}`);
}

const readinessPos=edge.indexOf('get_whatsapp_flow_transport_readiness_v1');
const decryptPos=edge.indexOf('decryptFlowRequest');
const gatePos=edge.indexOf('action!=="ping"&&!readiness?.data_exchange_enabled');
assert.ok(readinessPos>=0);
assert.ok(decryptPos>=0);
assert.ok(gatePos>decryptPos,'commercial gate must be evaluated after encrypted payload is decrypted so Meta ping can be identified');
assert.match(edge,/if\(action==="ping"\)/);
assert.match(edge,/flow_endpoint_disabled/);
assert.match(edge,/handle_whatsapp_flow_commercial_exchange_v3/);

console.log('PASS: Flow v4 matches Meta schema, declares only forward routes, and encrypted healthcheck stays available while commercial Data Exchange remains OFF.');
