import assert from 'node:assert/strict';
import fs from 'node:fs';

const pagePath='vitrine/admin/atendimento/index.html';
const offersPath='vitrine/admin/atendimento/attendance-offers.js';
const apiPath='supabase/functions/admin-attendance-offers-v1/index.ts';
const sendPath='vitrine/admin/atendimento/attendance-product-send.js';

for(const path of [pagePath,sendPath]) assert.equal(fs.existsSync(path),true,`${path} deve existir`);
assert.equal(fs.existsSync(offersPath),true,'deve existir módulo isolado da aba Ofertas');
assert.equal(fs.existsSync(apiPath),true,'deve existir endpoint administrativo isolado de ofertas');

const page=fs.readFileSync(pagePath,'utf8');
const offers=fs.readFileSync(offersPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const send=fs.readFileSync(sendPath,'utf8');

assert.match(page,/data-context-tab=["']orders["'][^>]*>Pedidos<\/button>\s*<button[^>]+data-context-tab=["']offers["'][^>]*>Ofertas<\/button>\s*<button[^>]+data-context-tab=["']products["'][^>]*>Produtos<\/button>/,'Ofertas deve ficar entre Pedidos e Produtos');
assert.match(page,/attendance-offers\.js/,'página deve carregar o módulo de Ofertas');
assert.match(offers,/admin-attendance-offers-v1/,'Ofertas deve carregar dados pelo endpoint administrativo dedicado');
assert.match(offers,/className=['"]product-card['"]/,'Ofertas deve reutilizar o padrão visual de cards de produtos');
assert.match(offers,/toggleAttendanceProductSelection\(product\)/,'ofertas devem reutilizar a seleção canônica de produtos');
assert.match(offers,/sendAttendanceProductBatch/,'ofertas devem reutilizar o envio canônico de produtos');
assert.match(offers,/retryFailedAttendanceProducts/,'falhas do lote devem poder ser reenviadas pelo fluxo canônico');
assert.doesNotMatch(offers,/to_phone_e164|phone_number_id|whatsapp_account_id/,'frontend de ofertas não pode escolher destino técnico');
assert.match(api,/\.eq\(['"]is_offer['"],true\)/,'endpoint deve filtrar somente produtos em oferta');
assert.match(api,/\.eq\(['"]is_active['"],true\)/,'endpoint deve retornar somente produtos ativos');
assert.match(api,/offer_price/,'endpoint deve retornar preço de oferta');
assert.match(api,/admin_users/,'endpoint deve exigir usuário administrativo autorizado');
assert.match(api,/ops2_loose_sellable_stock_v1/,'endpoint deve usar a mesma autoridade de estoque vendável do Atendimento');
assert.match(send,/product\?\.offer\?\.active\?product\?\.offer\?\.price:product\?\.sale_price/,'envio deve usar preço de oferta quando ativo');
assert.match(send,/form\.set\(['"]caption['"],formatAttendanceProductCaption\(product\)\)/,'imagem deve levar nome e valor no caption');

console.log('PASS test-admin-attendance-offers-tab-v1');
