import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const app=readFileSync('comprar/app.js','utf8');
const baskets=readFileSync('comprar/baskets.js','utf8');
const checkout=readFileSync('comprar/checkout.js','utf8');
const config=readFileSync('comprar/config.js','utf8');
const customerEdge=readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const roomEdge=readFileSync('supabase/functions/shopping-room-v1/index.ts','utf8');
const cestaReturn=readFileSync('cesta/whatsapp-return.js','utf8');
const publicHome=readFileSync('index.html','utf8');

// A prévia da cesta é somente leitura até a confirmação explícita.
assert.match(config,/basketStorefrontApi:\s*'[^']*basket-storefront-v1'/,'Comprar must expose the read-only basket detail API');
assert.match(baskets,/async function previewBasket/,'basket cards must open a preview before selection');
assert.match(baskets,/button\.textContent='Ver produtos'/,'basket card action must say Ver produtos');
const policy=baskets.match(/function basketPolicy[\s\S]*?(?=\n\s*function renderPicker)/)?.[0]||'';
assert.match(policy,/min_quantity/,'basket policy helper must respect minimum quantity');
assert.match(policy,/max_quantity/,'basket policy helper must respect maximum quantity');
assert.match(policy,/quantity_editable/,'basket policy helper must respect editability');
const preview=baskets.match(/async function previewBasket[\s\S]*?(?=\n\s*async function chooseBasket)/)?.[0]||'';
assert.match(preview,/basketStorefrontApi\('detail'/,'preview must load basket details through the read-only storefront API');
assert.doesNotMatch(preview,/start_basket/,'preview must never add the basket to the cart');
assert.doesNotMatch(preview,/set_basket_quantity/,'preview quantity changes must remain local until basket choice');
assert.match(preview,/className='qty'/,'preview must render quantity controls');
assert.match(preview,/basketPolicy\(item\)/,'preview quantity controls must use the shared basket policy helper');
assert.match(preview,/Escolher esta cesta/,'preview must have an explicit selection action');
assert.match(preview,/Voltar às cestas/,'preview must let the customer return without changing the cart');

// A cesta só entra no carrinho depois da escolha; depois abre a etapa 2 sem voltar à lista.
const choose=baskets.match(/async function chooseBasket[\s\S]*?(?=\n\s*function renderSelectedBasket)/)?.[0]||'';
assert.match(choose,/api\('start_basket'/,'choosing must start the basket exactly in the selection action');
assert.match(choose,/api\('set_basket_quantity'/,'edited preview quantities must be persisted only after start_basket');
assert.match(choose,/renderSelectedBasket\(\)/,'selection must render the chosen basket');
assert.match(choose,/state\.modules\.products\?\.renderEntry\?\.\(\{auto:true\}\)/,'selection must open stage 2 automatically');
assert.match(choose,/scrollTo\(finish,\{block:'start'\}\)/,'selection must position Finalizar pedido immediately before stage 2');
const selected=baskets.match(/function renderSelectedBasket[\s\S]*?(?=\n\s*async function restoreFromOpen)/)?.[0]||'';
assert.match(selected,/basket-finish-anchor/,'selected basket must retain a dedicated Finalizar pedido anchor');
assert.match(selected,/finish\.textContent='Finalizar pedido'/,'selected basket must expose Finalizar pedido');

// Ver pedido usa um único caminho e nunca deixa a interface travada.
const openCheckout=checkout.match(/async function open\(button\)[\s\S]*?(?=\n\s*function render\()/)?.[0]||'';
assert.match(openCheckout,/state\.modules\.products\?\.waitForPending\?\.\(\)/,'checkout must wait only for product writes already in progress');
assert.match(openCheckout,/refreshCheckout\(\)/,'checkout must request a fresh checkout preview');
assert.match(openCheckout,/finally\s*\{/,'checkout busy state must always be cleared');
assert.match(openCheckout,/setButtonBusy\(button,false\)/,'checkout trigger must always be re-enabled');
assert.match(app,/function openCheckout\(button\)/,'shell must have one checkout entry point');
assert.match(app,/checkoutButton\.onclick=\(\)=>openCheckout\(checkoutButton\)/,'fixed Ver pedido button must use the same checkout path');
assert.match(app,/cartButton\.onclick=\(\)=>openCheckout\(cartButton\)/,'top Pedido button must use the same checkout path');

// A verificação de cadastro abre o WhatsApp no contexto atual, sem target=_blank.
const verification=checkout.match(/function renderVerification[\s\S]*?(?=\n\s*async function checkVerification)/)?.[0]||'';
assert.match(verification,/checkoutVerifyWhatsApp/,'customer verification must expose the WhatsApp confirmation action');
assert.doesNotMatch(verification,/target=["']_blank["']/,'verification must not depend on a new browser tab');
assert.match(verification,/location\.assign\(link\.href\)/,'verification click must navigate directly to WhatsApp');

// A confirmação final salva apenas uma vez; o fallback reutiliza a URL já devolvida pelo backend.
const confirm=checkout.match(/async function confirmOrder[\s\S]*?(?=\n\s*function renderSuccess)/)?.[0]||'';
assert.match(confirm,/app\.confirmOrder\(payload\)/,'final action must persist through the single app transport');
assert.match(confirm,/local\.orderSaved=true/,'client must remember that the order was already persisted');
assert.match(confirm,/local\.whatsappUrl=data\.whatsapp_url/,'client must retain the prepared WhatsApp URL returned by the backend');
assert.match(confirm,/if\(local\.orderSaved\)/,'a repeated confirmation must reuse the saved result instead of creating another order');
assert.doesNotMatch(confirm,/setTimeout\(/,'final confirmation must not depend on delayed navigation');
const success=checkout.match(/function renderSuccess[\s\S]*?(?=\n\s*document\.addEventListener|\n\s*app\.registerModule)/)?.[0]||'';
assert.match(success,/checkout-whatsapp-return/,'success state must expose a manual WhatsApp continuation');
assert.match(success,/local\.whatsappUrl/,'success fallback must reuse the stored WhatsApp URL');
assert.doesNotMatch(success,/confirm_order/,'success fallback must never confirm the order again');

// Admin V3 usa transporte explícito, sem interceptar fetch comercial.
assert.match(app,/window\.DA_ADMIN_TEST_TRANSPORT/,'app must use explicit Admin test transport');
assert.doesNotMatch(app,/window\.fetch\s*=/,'commercial app must never replace window.fetch');
assert.doesNotMatch(checkout,/window\.fetch\s*=/,'checkout must never replace window.fetch');

// Todo o fluxo continua apontando para o WhatsApp oficial.
const officialWhatsApp='5565998150975';
const formerWhatsApp=/556584491018/;
assert.match(publicHome,new RegExp(officialWhatsApp),'public home must expose the official WhatsApp number');
assert.match(config,new RegExp(`whatsappFallback:'https://wa\\.me/${officialWhatsApp}'`),'Comprar fallback must use the official WhatsApp number');
assert.match(checkout,/app\.config\.whatsappFallback/,'checkout verification fallback must use runtime config');
assert.match(customerEdge,new RegExp(`WA_NUMBER='${officialWhatsApp}'`),'customer verification must use the official WhatsApp number');
assert.match(roomEdge,new RegExp(`phone='${officialWhatsApp}'`),'legacy room emergency fallback must use the official WhatsApp number');
assert.match(cestaReturn,new RegExp(`WHATSAPP_PHONE="${officialWhatsApp}"`),'basket return must use the official WhatsApp number');
for(const [name,source] of [['config',config],['Comprar checkout',checkout],['customer verification',customerEdge],['legacy room',roomEdge],['basket return',cestaReturn]]){
  assert.doesNotMatch(source,formerWhatsApp,`${name} must not retain the former WhatsApp number`);
}

console.log('basket_preview_checkout_whatsapp_v1_ok');
