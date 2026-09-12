import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('admin-v3/atendimento.html','utf8');
const js=fs.readFileSync('admin-v3/service-strategy.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-service-intelligence-simple-v1/index.ts','utf8');

assert.ok(html.includes('Regras da IA'),'a aba deve se chamar Regras da IA');
assert.ok(html.includes('Atendimento próprio da Dona Antônia'),'deve explicar que as regras pertencem ao atendimento próprio');
assert.ok(html.includes('não altera Meta nem PapoAI'),'deve deixar explícito que não controla Meta/PapoAI');

const modesBlock=js.match(/const MODES=\[(.*?)\];\nconst modeInfo/s)?.[1]||'';
assert.ok(modesBlock,'bloco MODES deve existir');

for(const id of ['text','audio_ai','image','reply_buttons','cta_url','list_view','list_select','product_lookup','human','silence']){
  assert.ok(modesBlock.includes(`'${id}'`),`ferramenta interna ${id} deve continuar disponível`);
}
for(const forbidden of ['basket_flow','registration_flow','address_flow','custom_flow','catalog_message','single_product','product_list','template_quick_reply','template_cta','template_carousel','template_catalog','template_multi_product']){
  assert.ok(!modesBlock.includes(`'${forbidden}'`),`ferramenta Meta/Flow ${forbidden} não deve aparecer no editor`);
}
for(const forbiddenLabel of ['Flow —','catálogo do WhatsApp','Template +','Carrossel no WhatsApp','Meta']){
  assert.ok(!modesBlock.includes(forbiddenLabel),`rótulo externo não deve aparecer: ${forbiddenLabel}`);
}
assert.ok(modesBlock.includes('Botões do nosso chat'),'botões devem ser apresentados como recurso do nosso chat');
assert.ok(modesBlock.includes('Lista para escolher'),'lista selecionável deve ter linguagem do nosso atendimento');

const backendModes=edge.match(/const MODES=new Set\(\[(.*?)\]\);/s)?.[1]||'';
assert.ok(backendModes,'MODES do backend deve existir');
for(const forbidden of ['basket_flow','registration_flow','address_flow','custom_flow','catalog_message','single_product','product_list','template_quick_reply','template_cta','template_carousel','template_catalog','template_multi_product']){
  assert.ok(!backendModes.includes(`"${forbidden}"`),`backend não deve aceitar novo uso de ${forbidden}`);
}

console.log('admin-v3 own attendance tools contract: PASS');
