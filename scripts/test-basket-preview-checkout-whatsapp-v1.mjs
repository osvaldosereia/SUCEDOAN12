import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const js=readFileSync('comprar/chat-light-v2.js','utf8');
const addon=readFileSync('comprar/chat-checkout-quantity-v1.js','utf8');
const config=readFileSync('comprar/config.js','utf8');
const customerEdge=readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');

// Ver a composição de uma cesta deve ser uma leitura, nunca uma inclusão no carrinho.
assert.match(config,/basketStorefrontApi:\s*'[^']*basket-storefront-v1'/,'Comprar must expose the read-only basket detail API');
assert.match(js,/async function basketDetailApi/,'client must have a read-only basket detail helper');
assert.match(js,/async function previewBasket/,'basket cards must open a preview before selection');
assert.match(js,/bt\.textContent='Ver produtos'/,'basket card action must say Ver produtos');
assert.match(js,/bt\.onclick=\(\)=>previewBasket\(b,bt\)/,'basket card must open preview instead of starting the basket');
const preview=js.match(/async function previewBasket[\s\S]*?(?=async function chooseBasket)/)?.[0]||'';
assert.match(preview,/basketDetailApi\('detail'/,'preview must load basket details without mutating the cart');
assert.doesNotMatch(preview,/start_basket/,'preview must never add the basket to the cart');
assert.match(preview,/Escolher esta cesta/,'preview must have an explicit selection action');
assert.match(preview,/Voltar às cestas/,'preview must let the customer return to basket choices');

// Abrir o checkout deve mostrar o pedido desde o topo e não abrir o teclado sozinho.
assert.doesNotMatch(addon,/setTimeout\(\(\)=>input\?\.focus\(\),0\)/,'phone lookup must not autofocus when checkout opens');

// O WhatsApp deve receber um resumo operacional, separando cesta normal, alterações e extras.
assert.match(customerEdge,/base_quantity/,'basket policy helper must expose original basket quantity');
assert.match(customerEdge,/product:products\(name\)/,'basket policy helper must expose product name for removed/changed items');
assert.match(addon,/PRODUTOS DA CESTA SEM ALTERACAO/,'WhatsApp message must list unchanged basket items');
assert.match(addon,/PRODUTOS DA CESTA COM QUANTIDADE ALTERADA/,'WhatsApp message must list changed basket items');
assert.match(addon,/PRODUTOS ADICIONADOS FORA DA CESTA/,'WhatsApp message must list products added outside the basket');
assert.match(addon,/RESUMO DE VALORES/,'WhatsApp message must include a value summary');
assert.match(addon,/DADOS PARA ATENDIMENTO/,'WhatsApp message must include customer and delivery data');
assert.match(addon,/Olá! Gostaria de confirmar este pedido e o endereço de entrega\./,'WhatsApp message must end with the confirmation request');

console.log('basket_preview_checkout_whatsapp_v1_ok');
