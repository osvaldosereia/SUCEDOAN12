import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('admin/app.js','utf8');
const view=fs.readFileSync('admin/customer-360-view.js','utf8');
const css=fs.readFileSync('admin/customer-360-v2.css','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

assert.match(app,/renderCustomer360/,'Admin must use Customer 360 renderer');
assert.match(app,/renderCustomerOrderDetail/,'Order detail must use professional renderer');
assert.match(app,/openDialog\(html,'customer360'\)/,'Customer 360 must use dedicated dialog variant');
assert.match(app,/data-customer-tab/,'Admin must support tab navigation');
assert.match(app,/data-customer-edit/,'Customer profile must expose edit action');

for(const tab of ['Resumo','Compras','Preferências','Conversas','Proteção','Linha do tempo']){
  assert.match(view,new RegExp(tab),'Missing Customer 360 tab '+tab);
}
for(const section of ['Visão executiva','Situação agora','Segmentos dinâmicos','Marcas com maior afinidade','Categorias principais','Produtos recorrentes','Marketing WhatsApp']){
  assert.match(view,new RegExp(section),'Missing professional section '+section);
}
for(const technical of ['Não definido','Identidade observada','Evento automático','Atendimento automatizado','Pedido confirmado']){
  assert.match(view,new RegExp(technical),'Missing humanized technical label '+technical);
}
assert.match(view,/Customer Protection/);
assert.match(view,/data-suppress-marketing/);
assert.match(view,/data-revoke-marketing/);
assert.match(view,/data-release-suppression/);
assert.match(view,/data-history-order/);
assert.match(css,/\.editor-dialog\.customer-360-dialog/);
assert.match(css,/width:min\(1180px/);
assert.match(css,/\.c360-tabs/);
assert.match(css,/\.c360-timeline/);
assert.match(app,/customer-directory-row/,'Clientes deve usar diretório profissional');
assert.match(app,/customer-profile-button/,'Diretório deve destacar abertura do perfil');
assert.match(css,/\.customer-directory-head/);
assert.match(css,/\.customer-directory-row/);
assert.match(css,/\.customer-directory-avatar/);
assert.match(app,/customer-identity-strip/,'Diagnóstico de identidade deve ser compacto');
assert.match(css,/\.customer-identity-strip/);
assert.match(css,/\.c360-mobile-actions/,'Customer 360 precisa de ações móveis persistentes');
assert.match(css,/@media\(max-width:680px\)/);
assert.match(html,/customer-360-v2\.css\?v=20260918-2/);
assert.match(html,/app\.js\?v=20260918-customer-ux-4/);
assert.match(view,/marketing_consent_unknown:'Consentimento de marketing não registrado'/);
assert.match(view,/order_in_progress:'Pedido em andamento'/);
assert.match(view,/human_service_in_progress:'Atendimento humano em andamento'/);
assert.match(view,/marketing_cooldown:'Intervalo mínimo entre campanhas'/);

console.log('customer 360 redesign contract ok');
