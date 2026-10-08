import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const root=fs.readFileSync('index.html','utf8');
const vitrine=fs.readFileSync('vitrine/index.html','utf8');
const page=fs.readFileSync('pedido/index.html','utf8');
const resilience=fs.readFileSync('checkout-resilience.js','utf8');
const adminOrders=fs.readFileSync('supabase/functions/admin-orders-v1/index.ts','utf8');
const adminProducts=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const publicEdge=fs.readFileSync('supabase/functions/order-public-view-v1/index.ts','utf8');
const shortMigrationPath='supabase/migrations/20261003043000_order_public_short_link.sql';
const shortMigration=fs.existsSync(shortMigrationPath)?fs.readFileSync(shortMigrationPath,'utf8'):'';
const shortPagePath='p/index.html';
const shortPage=fs.existsSync(shortPagePath)?fs.readFileSync(shortPagePath,'utf8'):'';

assert.ok(admin.includes('function orderCustomerDataPending('),'Admin deve ter um gate explícito para dados essenciais do cliente');
assert.ok(admin.includes('AGUARDANDO DADOS DO CLIENTE'),'Admin deve destacar pedido com dados essenciais pendentes');
assert.ok(admin.includes("['Cliente não identificado','Telefone pendente','Endereço incompleto','CPF/CNPJ pendente']"),'Gate deve considerar nome, telefone, endereço e CPF/CNPJ');
assert.ok(admin.includes('if(orderCustomerDataPending(o))'),'Próxima ação deve bloquear avanço quando dados do cliente estiverem pendentes');

for(const [name,html] of [['index.html',root],['vitrine/index.html',vitrine]]){
  assert.ok(html.includes('function basketCard('),`${name}: deve continuar renderizando cartões de cesta`);
  assert.ok(html.includes('function basketPublicAvailabilityLabel('),`${name}: deve ter regra explícita de disponibilidade pública`);
  assert.ok(html.includes("function basketPublicAvailabilityLabel(){return ''}"),`${name}: não deve mostrar quantidade numérica de cesta ao cliente`);
  assert.ok(html.includes('order_public_url'),`${name}: checkout deve usar o link público curto retornado pelo backend`);
  assert.ok(html.includes('order_public_code'),`${name}: checkout deve exibir o código público curto do pedido`);
}

assert.match(shortMigration,/public_token/i,'Resumo público deve ter token curto independente do UUID interno');
assert.match(shortMigration,/public_code/i,'Resumo público deve ter código curto de exibição');
assert.match(shortMigration,/\[A-Z\].*\[A-Z\].*\[0-9\].*\{3\}/i,'Código público deve ter duas letras e três números');
assert.match(shortMigration,/donaantonia\.com\.br\/p\/\?k=/,'RPC do banco deve produzir URL pública curta');
assert.match(publicEdge,/public_token/,'Endpoint público deve resolver pedido pelo token curto');
assert.match(publicEdge,/public_code/,'Endpoint público deve devolver o código curto');
assert.match(publicEdge,/channel_origin/,'Endpoint público deve devolver o canal de origem da conversa');
assert.match(page,/\.get\(['"]k['"]\)/,'Página do pedido deve aceitar token curto k');
assert.match(publicEdge,/5565998150975/,'Backend deve reconhecer o canal 0975');
assert.match(publicEdge,/5565984491018/,'Backend deve reconhecer o canal 1018');
assert.doesNotMatch(page,/<button\b/i,'Resumo público do pedido permanece sem botões');
assert.match(shortPage,/pedido\/\?k=/,'Atalho /p deve encaminhar para a página de pedido com token curto');
assert.match(resilience,/order_public_url/,'Fluxo de ajuste de estoque do checkout deve preferir o link curto');
assert.match(adminOrders,/ops2_order_public_link_v1/,'PapoAI deve obter a identidade pública curta pela RPC canônica');
assert.match(adminOrders,/order_public_token/,'Payload para PapoAI deve incluir token público curto');
assert.match(adminOrders,/order_public_code/,'Payload para PapoAI deve incluir código público curto');
assert.match(adminOrders,/order_url/,'Payload para PapoAI deve incluir URL curta pronta');
assert.match(storefront,/ops2_order_public_link_v1/,'Checkout deve obter a identidade pública curta pela RPC canônica');
assert.match(storefront,/order_public_url/,'Checkout deve receber URL curta no retorno de submit_order');
assert.match(storefront,/order_public_code/,'Checkout deve receber código público curto no retorno de submit_order');
assert.match(adminProducts,/ops2_order_public_link_v1/,'Detalhe do Admin deve obter link público curto');
assert.match(adminProducts,/public_order_url/,'Detalhe do Admin deve expor URL curta para os botões manuais');
assert.match(admin,/o\?\.public_order_url|o\.public_order_url/,'Admin deve preferir URL pública curta nos envios manuais');
assert.match(admin,/public_order_code/,'Admin deve preferir código público curto nas mensagens manuais');

console.log('admin pending data + basket public stock + short order link contract: OK');
