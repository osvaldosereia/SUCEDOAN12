import assert from 'node:assert/strict';
import fs from 'node:fs';

const {
  PRESET_LEVELS,
  presetFlags,
  normalizeFlags,
  inferLevel,
  modeAllowed,
  menuItemAllowed,
}=await import('../supabase/functions/_shared/chat-intelligence-config.js');

assert.deepEqual(PRESET_LEVELS,['basic','recommended','complete']);

const basic=presetFlags('basic');
assert.equal(basic.openai,false,'Básico deve funcionar sem OpenAI');
assert.equal(basic.baskets,true);
assert.equal(basic.products,true);
assert.equal(basic.checkout,true);
assert.equal(basic.profile,false,'Básico deve manter cadastro desligado');
assert.equal(basic.external_links,false,'Básico não deve abrir links externos');

const recommended=presetFlags('recommended');
assert.equal(recommended.openai,true,'Recomendado deve usar classificador leve quando necessário');
assert.equal(recommended.baskets,true);
assert.equal(recommended.products,true);
assert.equal(recommended.offers,true);
assert.equal(recommended.checkout,true);
assert.equal(recommended.profile,true);
assert.equal(recommended.commerce_info,true);
assert.equal(recommended.external_links,false,'Recomendado preserva o chat dentro da experiência própria');

const complete=presetFlags('complete');
assert.equal(complete.openai,true);
assert.equal(complete.external_links,true,'Completo libera todas as ferramentas permitidas');

assert.equal(inferLevel(recommended),'recommended');
const custom=normalizeFlags({...recommended,offers:false});
assert.equal(inferLevel(custom),'custom','alteração manual deve virar Personalizado');
assert.equal(modeAllowed('offers',custom),false,'ofertas desligadas não podem ser executadas');
assert.equal(modeAllowed('products',custom),true);
assert.equal(modeAllowed('product_lookup',custom),true);
assert.equal(modeAllowed('checkout',{...custom,checkout:false}),false);
assert.equal(modeAllowed('cta_url',{...custom,external_links:false}),false);
assert.equal(menuItemAllowed('payment',{...custom,commerce_info:false}),false);
assert.equal(menuItemAllowed('delivery',{...custom,commerce_info:false}),false);
assert.equal(menuItemAllowed('profile',{...custom,profile:false}),false);
assert.equal(menuItemAllowed('text',custom),true);

const html=fs.readFileSync('admin/atendimento.html','utf8');
const js=fs.readFileSync('admin/service-strategy.js','utf8');
const adminEdge=fs.readFileSync('supabase/functions/admin-service-intelligence-simple-v1/index.ts','utf8');
const chatEdge=fs.readFileSync('supabase/functions/shopping-chat-v1/index.ts','utf8');
const menuEdge=fs.readFileSync('supabase/functions/shopping-chat-menu-v1/index.ts','utf8');
const productsEdge=fs.readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');

assert.match(js,/runtimeLevel/,'Admin deve renderizar seletor de nível');
for(const level of ['basic','recommended','complete']) assert.match(js,new RegExp(`value=["']${level}["']|['"]${level}['"]`),`preset ${level} deve existir no Admin`);
for(const feature of ['openai','baskets','products','offers','checkout','profile','commerce_info','external_links']) assert.ok(js.includes(feature),`controle individual ${feature} deve existir no Admin`);
assert.match(adminEdge,/integration_flags|integrations/,'backend administrativo deve persistir controles individuais');
assert.match(chatEdge,/modeAllowed|integration_flags|integrations/,'motor público deve respeitar integrações desligadas');
assert.match(menuEdge,/menuItemAllowed|integration_flags|integrations/,'menu público deve esconder integrações desligadas');
assert.match(productsEdge,/integration_flags|normalizeFlags/,'API dedicada de produtos também deve respeitar integrações');
assert.match(productsEdge,/feature_disabled/,'API dedicada de produtos deve bloquear catálogo/ofertas desligados');

console.log('chat_intelligence_presets_v1_ok');
