import fs from 'node:fs';
import assert from 'node:assert/strict';

const v1=fs.readFileSync('supabase/migrations/20260918220000_cm_1_8_segment_engine_v1.sql','utf8');
const v2=fs.readFileSync('supabase/migrations/20260918222500_cm_1_8_registry_compat_v2.sql','utf8');
const edge=fs.readFileSync('supabase/functions/customer-intelligence-v1/index.ts','utf8');
const app=fs.readFileSync('admin/app.js','utf8');

assert.match(v1,/customer_segment_registry_v1/);
assert.match(v1,/customer_segment_facts_v1/);
assert.match(v1,/get_customer_dynamic_segments_v1/);
assert.match(v1,/query_customer_segment_v1/);
assert.match(v1,/segment_engine_summary_v1/);
for(const segment of [
  'comprou_alguma_vez','primeira_compra','recorrente','sem_compra_30d','sem_compra_60d',
  'mercearia','lavanderia','higiene','cesta_basica','falou_nao_comprou',
  'carrinho_nao_concluido','marketing_permitido','marketing_nao_permitido',
  'atendimento_problema','baixa_qualidade_dados','marca','categoria'
]) assert.match(v1,new RegExp(segment),'missing dynamic segment '+segment);
for(const segment of [
  'primeiro_comprador','mensal','inativo','alto_valor','comprador_cesta',
  'produtos_avulsos','cesta_favorita','proximo_recompra'
]) assert.match(v2,new RegExp(segment),'missing legacy compatibility segment '+segment);

assert.match(v1,/evaluate_customer_contact_eligibility_v1/,'marketing segment must use Customer Protection');
assert.match(v1,/has_incomplete_cart/);
assert.match(v1,/has_open_handoff/);
assert.match(v1,/purchased_brands/);
assert.match(v1,/purchased_categories/);
assert.match(v1,/grant execute on function public\.query_customer_segment_v1\(text,text,integer,integer\) to service_role/);
assert.doesNotMatch(v1+v2,/openai|gpt-|gemini/i,'Segment Engine must stay deterministic');

assert.match(edge,/query_customer_segment_v1/,'Customer list must filter through Segment Engine');
assert.match(edge,/get_customer_dynamic_segments_v1/,'Customer 360 must load dynamic segments');
assert.match(edge,/segment_engine:'cm1\.8-v1'/);
assert.match(edge,/action==='segment_registry'/);
assert.match(edge,/commercial:\{profile:commercialProfile\|\|\{\},intelligence:intelligence\|\|\{\},segments:dynamicSegments/);

assert.match(app,/sem_compra_30d/);
assert.match(app,/falou_nao_comprou/);
assert.match(app,/carrinho_nao_concluido/);
assert.match(app,/marketing_nao_permitido/);
assert.match(app,/Segmentos dinâmicos/);
assert.match(app,/secureCustomersEnabled\(\)\?secureSegmentOptions:legacySegmentOptions/);

console.log('cm-1.8 segment engine contract ok');
