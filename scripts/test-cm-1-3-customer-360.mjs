import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('supabase/functions/customer-intelligence-v1/index.ts','utf8');
const app=fs.readFileSync('admin/app.js','utf8');
const runtime=fs.readFileSync('admin/runtime-config.js','utf8');

for(const token of [
  "customer_product_stats",
  "conversations",
  "carts",
  "customer_service_memory",
  "customer_substitution_preferences",
  "marketing_attribution_touchpoints",
  "marketing_events"
]) assert.match(edge,new RegExp(token),'Customer 360 precisa incluir '+token);

for(const token of [
  "lifecycle",
  "last_interaction_at",
  "brands",
  "categories",
  "products",
  "conversations",
  "carts",
  "service_memory",
  "touchpoints"
]) assert.match(edge,new RegExp(token),'Customer 360 precisa retornar '+token);

assert.match(app,/Customer 360/);
assert.match(app,/Ciclo de vida/);
assert.match(app,/Marcas/);
assert.match(app,/Conversas/);
assert.match(app,/Carrinhos/);
assert.match(app,/Preferências e memória/);
assert.match(app,/Marketing/);
assert.match(app,/Linha do tempo/);
assert.match(runtime,/customerOsSecureUiEnabled:\s*false/,'UI protegida continua desligada até homologação manual do PIN');
assert.doesNotMatch(edge,/openai|gpt-|gemini/i,'Customer 360 operacional deve ser determinístico e não gastar IA para montar a ficha');

console.log('cm-1.3 customer 360 contract ok');
