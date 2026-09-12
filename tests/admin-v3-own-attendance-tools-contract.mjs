import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('admin-v3/atendimento.html','utf8');
const own=fs.readFileSync('admin-v3/service-strategy-own-tools.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260912_admin_v3_service_strategy_own_tools_v1.sql','utf8');

assert.ok(html.includes('Regras da IA'),'a aba deve se chamar Regras da IA');
assert.ok(html.includes('Atendimento próprio da Dona Antônia'),'deve explicar que as regras pertencem ao atendimento próprio');
assert.ok(html.includes('não altera Meta nem PapoAI'),'deve deixar explícito que não controla Meta/PapoAI');
assert.ok(html.includes('service-strategy-own-tools.js'),'filtro de ferramentas próprias deve ser carregado');

const ownModes=own.match(/const OWN_MODES=\[(.*?)\];/s)?.[1]||'';
assert.ok(ownModes,'OWN_MODES deve existir');
for(const id of ['text','audio_ai','image','reply_buttons','cta_url','list_view','list_select','product_lookup','human','silence']){
  assert.ok(ownModes.includes(`'${id}'`),`ferramenta interna ${id} deve continuar disponível`);
}
for(const forbidden of ['basket_flow','registration_flow','address_flow','custom_flow','catalog_message','single_product','product_list','template_quick_reply','template_cta','template_carousel','template_catalog','template_multi_product']){
  assert.ok(!ownModes.includes(`'${forbidden}'`),`ferramenta Meta/Flow ${forbidden} não deve aparecer como ferramenta própria`);
}
assert.ok(own.includes('Botões do nosso chat'),'botões devem ser apresentados como recurso do nosso chat');
assert.ok(own.includes('Lista para escolher'),'lista selecionável deve ter linguagem do nosso atendimento');
assert.ok(own.includes('MutationObserver'),'o filtro deve continuar valendo quando o editor renderizar novamente');

assert.ok(migration.includes("response_mode = 'cta_url'"),'regra antiga de cestas deve migrar para abrir a nossa sala de compra');
assert.ok(migration.includes('https://donaantonia.com.br/comprar/'),'migração deve apontar para o nosso atendimento próprio');
assert.ok(migration.includes("response_mode') = 'basket_flow'"),'migração deve converter também a etapa antiga basket_flow');

console.log('admin-v3 own attendance tools contract: PASS');
