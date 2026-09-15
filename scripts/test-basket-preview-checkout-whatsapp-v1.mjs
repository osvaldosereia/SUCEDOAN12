import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const addon=readFileSync('comprar/chat-checkout-quantity-v1.js','utf8');
const checkout=readFileSync('comprar/checkout-final-v2.js','utf8');
const config=readFileSync('comprar/config.js','utf8');
const customerEdge=readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');

// Ver a composição de uma cesta deve ser uma leitura, nunca uma inclusão no carrinho.
assert.match(config,/basketStorefrontApi:\s*'[^']*basket-storefront-v1'/,'Comprar must expose the read-only basket detail API');
assert.match(addon,/async function basketDetailApi/,'client must have a read-only basket detail helper');
assert.match(addon,/async function previewBasket/,'basket cards must open a preview before selection');
assert.match(addon,/function decorateBasketPicker/,'basket picker must be upgraded without changing the cart flow');
assert.match(addon,/button\.textContent='Ver produtos'/,'basket card action must say Ver produtos');
assert.match(addon,/button\.onclick=\(\)=>previewBasket\(card,button,originalChoose\)/,'basket card must open preview instead of starting the basket');
const preview=addon.match(/async function previewBasket[\s\S]*?(?=function decorateBasketPicker)/)?.[0]||'';
assert.match(preview,/basketDetailApi\('detail'/,'preview must load basket details without mutating the cart');
assert.doesNotMatch(preview,/start_basket/,'preview must never add the basket to the cart');
assert.match(preview,/Escolher esta cesta/,'preview must have an explicit selection action');
assert.match(preview,/Voltar às cestas/,'preview must let the customer return to basket choices');

// Abrir o checkout não deve abrir o teclado sozinho.
assert.doesNotMatch(addon,/setTimeout\(\(\)=>input\?\.focus\(\),0\)/,'phone lookup must not autofocus when checkout opens');

// O WhatsApp deve receber um resumo operacional, separando cesta normal, alterações e extras.
assert.match(customerEdge,/base_quantity/,'basket policy helper must expose original basket quantity');
assert.match(customerEdge,/product:products\(name\)/,'basket policy helper must expose product name for removed/changed items');
assert.match(addon,/item\.source==='basket'\|\|item\.source==='substitution'/,'basket comparison must ignore addon rows even when the same product is also in the basket');
assert.match(addon,/PRODUTOS DA CESTA SEM ALTERACAO/,'WhatsApp message must list unchanged basket items');
assert.match(addon,/PRODUTOS DA CESTA COM QUANTIDADE ALTERADA/,'WhatsApp message must list changed basket items');
assert.match(addon,/PRODUTOS ADICIONADOS FORA DA CESTA/,'WhatsApp message must list products added outside the basket');
assert.match(addon,/RESUMO DE VALORES/,'WhatsApp message must include a value summary');
assert.match(addon,/DADOS PARA ATENDIMENTO/,'WhatsApp message must include customer and delivery data');
assert.match(addon,/Olá! Gostaria de confirmar este pedido e o endereço de entrega\./,'WhatsApp message must end with the confirmation request');

// A nova confirmação de identidade deve abrir o WhatsApp no contexto atual, sem target=_blank.
const verification=checkout.match(/function renderVerification[\s\S]*?(?=\n\s*async function checkVerification)/)?.[0]||'';
assert.match(verification,/v2VerifyWhatsApp/,'customer verification must expose the WhatsApp confirmation action');
assert.match(verification,/removeAttribute\('target'\)/,'verification must explicitly remove target from the WhatsApp link');
assert.doesNotMatch(verification,/target=["']_blank["']/,'verification must not depend on a new browser tab');
assert.match(verification,/location\.assign\(/,'verification click must navigate directly to WhatsApp');

// A confirmação final salva uma única vez e só então abre o WhatsApp.
const confirmOrder=checkout.match(/async function confirmOrder[\s\S]*?(?=\n\s*function renderSuccess)/)?.[0]||'';
assert.match(confirmOrder,/api\('confirm_order'/,'final action must persist the order first');
assert.match(confirmOrder,/state\.orderSaved=true/,'client must remember that the order was already persisted');
assert.match(confirmOrder,/state\.whatsappUrl=d\.whatsapp_url/,'client must retain the prepared WhatsApp URL returned after persistence');
assert.match(confirmOrder,/location\.assign\(whatsappAppUrl\(state\.whatsappUrl\)\)/,'final action must navigate directly to WhatsApp after persistence');
assert.doesNotMatch(confirmOrder,/setTimeout\(/,'final WhatsApp navigation must not depend on a delayed timer');
assert.doesNotMatch(checkout,/whatsapp:\/\/send\?phone=/,'mobile web flow must not depend on a custom deep-link scheme that can bounce back to the storefront');
assert.match(checkout,/https:\/\/wa\.me\//,'mobile flow must use the official WhatsApp universal click-to-chat link');

// Nenhum módulo legado pode disparar uma segunda navegação automática depois do checkout v2.
const legacySuccess=addon.match(/function decorateOrderSuccess[\s\S]*?(?=\n\s*function refresh)/)?.[0]||'';
assert.match(legacySuccess,/checkout-whatsapp-return/,'legacy success state may keep a manual WhatsApp fallback');
assert.doesNotMatch(legacySuccess,/setTimeout\(/,'legacy success decorator must not schedule a second WhatsApp navigation');
assert.doesNotMatch(legacySuccess,/location\.(?:href|assign)/,'legacy success decorator must never auto-navigate after checkout v2');
assert.doesNotMatch(addon,/whatsappReturnScheduled/,'obsolete delayed redirect state must be removed');

// O fallback reutiliza o pedido já salvo; não chama confirm_order novamente.
const success=checkout.match(/function renderSuccess[\s\S]*?(?=\n\s*const observer)/)?.[0]||'';
assert.match(success,/Abrir WhatsApp/,'success state must expose a manual WhatsApp fallback');
assert.match(success,/state\.whatsappUrl/,'fallback must reuse the stored WhatsApp URL');
assert.doesNotMatch(success,/confirm_order/,'fallback must never create or confirm the order again');

console.log('basket_preview_checkout_whatsapp_v1_ok');
