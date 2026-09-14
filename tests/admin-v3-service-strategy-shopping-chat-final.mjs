import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('admin-v3/index.html','utf8');
const html=fs.readFileSync('admin-v3/atendimento.html','utf8');
const js=fs.readFileSync('admin-v3/service-strategy.js','utf8');
const css=fs.readFileSync('admin-v3/service-chat-center.css','utf8');
const edge=fs.readFileSync('supabase/functions/admin-service-intelligence-simple-v1/index.ts','utf8');

assert.doesNotMatch(index,/\.\.\/ame-mais\//i,'Ame Mais é projeto separado e não pode aparecer no menu do Admin V3');

for(const tab of ['flow','rules','test']){
  assert.match(html,new RegExp(`data-strategy-tab=["']${tab}["']`),`aba ${tab} deve existir`);
}
for(const oldTab of ['history','evolution','intelligence','chat']){
  assert.doesNotMatch(html,new RegExp(`data-strategy-tab=["']${oldTab}["']`),`aba antiga ${oldTab} não deve permanecer`);
}
assert.match(html,/service-strategy\.js/,'deve haver um único controlador da tela');
for(const legacyScript of ['service-strategy-addon.js','service-chat-center.js','service-strategy-own-tools.js']){
  assert.ok(!html.includes(legacyScript),`${legacyScript} não deve ser carregado`);
}

for(const required of ["'text'","'reply_buttons'","'cta_url'","'baskets'","'offers'","'products'","'product_lookup'","'checkout'","'silence'"]){
  assert.ok(js.includes(required),`modo próprio ${required} deve existir no editor`);
}
for(const forbidden of ['basket_flow','registration_flow','address_flow','custom_flow','template_','catalog_message','single_product','product_list','Chamar atendimento humano','Atendimento Humano']){
  assert.ok(!js.includes(forbidden),`recurso legado ${forbidden} não deve aparecer no controlador`);
}
assert.match(js,/admin-chat-menu-v1/,'Fluxo do Chat deve reutilizar a configuração do menu próprio');
assert.match(js,/simulate/,'aba Testar deve chamar a simulação administrativa');

// Regressão visual mostrada no desktop: labels e campos do editor não podem ficar inline/sobrepostos.
assert.match(css,/#ruleEditor\s*\{[^}]*display:grid/i,'editor de regras deve empilhar os campos em grid');
assert.match(css,/#ruleEditor\s+(?:input|textarea|select)[^{]*\{[^}]*width:100%/i,'controles do editor devem ocupar a largura disponível');

assert.match(edge,/action===["']simulate["']/,'backend administrativo deve oferecer simulação sem efeitos colaterais');
assert.doesNotMatch(edge,/whatsapp_flow|template_carousel|template_catalog|template_multi_product|catalog_message|single_product|product_list/i,'backend final não deve expor recursos Meta/WhatsApp');
assert.doesNotMatch(edge,/"human"/,'backend final não deve aceitar modo humano');
assert.match(edge,/"baskets"/,'backend deve aceitar ação de cestas do Chat Comprar');
assert.match(edge,/"offers"/,'backend deve aceitar ação de ofertas do Chat Comprar');
assert.match(edge,/"checkout"/,'backend deve aceitar ação de checkout do Chat Comprar');

console.log('admin_v3_shopping_chat_final_contract_ok');
