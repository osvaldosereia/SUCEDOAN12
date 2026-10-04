import assert from 'node:assert/strict';
import fs from 'node:fs';

const pagePath='vitrine/admin/atendimento/index.html';
const offersPath='vitrine/admin/atendimento/attendance-offers.js';
const storefrontPath='supabase/functions/storefront-v2/index.ts';
const sendPath='vitrine/admin/atendimento/attendance-product-send.js';

for(const path of [pagePath,offersPath,storefrontPath,sendPath]) assert.equal(fs.existsSync(path),true,`${path} deve existir`);

const page=fs.readFileSync(pagePath,'utf8');
const offers=fs.readFileSync(offersPath,'utf8');
const storefront=fs.readFileSync(storefrontPath,'utf8');
const send=fs.readFileSync(sendPath,'utf8');

assert.match(page,/data-context-tab=["']orders["'][^>]*>Pedidos<\/button>\s*<button[^>]+data-context-tab=["']offers["'][^>]*>Ofertas<\/button>\s*<button[^>]+data-context-tab=["']products["'][^>]*>Produtos<\/button>/,'Ofertas deve ficar entre Pedidos e Produtos');
assert.match(page,/attendance-offers\.js/,'página deve carregar o módulo de Ofertas');
assert.match(offers,/storefront-v2\?action=offers/,'Ofertas deve reutilizar a fonte canônica já existente do storefront');
assert.match(offers,/className=['"]product-card['"]/,'Ofertas deve reutilizar o padrão visual de cards de produtos');
assert.match(offers,/toggleAttendanceProductSelection\(product\)/,'ofertas devem reutilizar a seleção canônica de produtos');
assert.match(offers,/sendAttendanceProductBatch/,'ofertas devem reutilizar o envio canônico de produtos');
assert.match(offers,/retryFailedAttendanceProducts/,'falhas do lote devem poder ser reenviadas pelo fluxo canônico');
assert.doesNotMatch(offers,/to_phone_e164|phone_number_id|whatsapp_account_id/,'frontend de ofertas não pode escolher destino técnico');
assert.match(offers,/offer:\{active:true,price:Number\(item\.price_cents\|\|0\)\/100\}/,'preço do storefront deve virar oferta canônica para o envio');
assert.match(storefront,/async function offerList\(\)/,'storefront deve manter lista canônica de ofertas');
assert.match(storefront,/\.eq\(["']is_active["'],true\)\.eq\(["']is_offer["'],true\)/,'fonte canônica deve filtrar produtos ativos em oferta');
assert.match(storefront,/ops2_loose_sellable_stock_v1/,'fonte canônica deve usar estoque vendável avulso');
assert.match(storefront,/action={2,3}["']offers["']\)return json\(req,await offerList\(\)/,'rota pública de ofertas deve continuar ativa');
assert.match(send,/product\?\.offer\?\.active\?product\?\.offer\?\.price:product\?\.sale_price/,'envio deve usar preço de oferta quando ativo');
assert.match(send,/form\.set\(['"]caption['"],formatAttendanceProductCaption\(product\)\)/,'imagem deve levar nome e valor no caption');
assert.match(offers,/function\s+formatAttendanceOfferSendError\s*\(/,'Ofertas deve traduzir erros técnicos de envio em mensagem operacional');
assert.match(offers,/meta_canary_destination_blocked[\s\S]*imagem[\s\S]*canal/i,'bloqueio de mídia deve explicar que imagem ainda não está liberada naquele canal');
assert.match(offers,/result\.stopped_by[\s\S]*formatAttendanceOfferSendError/i,'resultado bloqueado deve mostrar a causa em vez de apenas contador de falhas');

console.log('PASS test-admin-attendance-offers-tab-v1');
