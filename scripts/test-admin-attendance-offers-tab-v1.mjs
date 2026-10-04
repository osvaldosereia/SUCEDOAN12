import assert from 'node:assert/strict';
import fs from 'node:fs';

const pagePath='vitrine/admin/atendimento/index.html';
const appPath='vitrine/admin/atendimento/attendance-app.js';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
const sendPath='vitrine/admin/atendimento/attendance-product-send.js';

for(const path of [pagePath,appPath,apiPath,sendPath]) assert.equal(fs.existsSync(path),true,`${path} deve existir`);

const page=fs.readFileSync(pagePath,'utf8');
const app=fs.readFileSync(appPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const send=fs.readFileSync(sendPath,'utf8');

assert.match(page,/data-context-tab=["']orders["'][^>]*>Pedidos<\/button>\s*<button[^>]+data-context-tab=["']offers["'][^>]*>Ofertas<\/button>\s*<button[^>]+data-context-tab=["']products["'][^>]*>Produtos<\/button>/,'Ofertas deve ficar entre Pedidos e Produtos');
assert.match(app,/state\.contextTab===['"]offers['"][\s\S]{0,160}renderOffers\(box\)/,'contexto deve renderizar a aba Ofertas');
assert.match(app,/api\(['"]offers['"][^)]*\)/,'aba Ofertas deve carregar ofertas pelo backend administrativo');
assert.match(app,/className=['"]product-card['"]/,'Ofertas deve reutilizar o padrão visual de cards de produtos');
assert.match(app,/toggleAttendanceProductSelection\(p\)/,'ofertas devem reutilizar a seleção canônica de produtos');
assert.match(app,/sendSelectedProducts\(/,'ofertas devem reutilizar o envio canônico de produtos');
assert.match(api,/READ_ACTIONS=new Set\([^\n]*["']offers["']/,'backend deve permitir leitura autenticada de ofertas');
assert.match(api,/action===['"]offers['"][\s\S]{0,900}is_offer["']?\s*,?\s*true|action===['"]offers['"][\s\S]{0,900}\.eq\(['"]is_offer['"],true\)/,'endpoint de ofertas deve filtrar somente produtos em oferta');
assert.match(api,/offer_price/,'endpoint de ofertas deve retornar preço de oferta');
assert.match(send,/product\?\.offer\?\.active\?product\?\.offer\?\.price:product\?\.sale_price/,'envio deve usar preço de oferta quando ativo');
assert.match(send,/form\.set\(['"]caption['"],formatAttendanceProductCaption\(product\)\)/,'imagem deve levar nome e valor no caption');

console.log('PASS test-admin-attendance-offers-tab-v1');
