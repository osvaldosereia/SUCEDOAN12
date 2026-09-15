import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const addon=readFileSync('comprar/chat-checkout-quantity-v1.js','utf8');
const chat=readFileSync('comprar/chat-light-v2.js','utf8');
const checkout=readFileSync('comprar/checkout-final-v2.js','utf8');
const config=readFileSync('comprar/config.js','utf8');
const customerEdge=readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const roomEdge=readFileSync('supabase/functions/shopping-room-v1/index.ts','utf8');
const cestaReturn=readFileSync('cesta/whatsapp-return.js','utf8');
const publicHome=readFileSync('index.html','utf8');

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
assert.doesNotMatch(preview,/set_basket_quantity/,'preview quantity controls must remain local until the basket is chosen');
assert.match(preview,/className='qty'/,'preview must render minus/quantity/plus controls for editable basket items');
assert.match(preview,/min_quantity/,'preview quantity control must respect the basket minimum');
assert.match(preview,/max_quantity/,'preview quantity control must respect the basket maximum');
assert.doesNotMatch(preview,/class=\"qty-fixed\"[^>]*>\$\{Number\(item\.quantity/,'preview must not render every basket quantity as fixed');
assert.match(preview,/basketPreviewQuantities/,'preview must pass the locally edited quantities only when the customer chooses the basket');
assert.match(preview,/Escolher esta cesta/,'preview must have an explicit selection action');
assert.match(preview,/Voltar às cestas/,'preview must let the customer return to basket choices');

// Escolher a cesta aplica as quantidades locais somente depois de criar a cesta no carrinho.
const chooseBasket=chat.match(/async function chooseBasket[\s\S]*?(?=function renderBasketStage)/)?.[0]||'';
assert.match(chooseBasket,/start_basket/,'basket selection must still create the basket using the canonical cart flow');
assert.match(chooseBasket,/basketPreviewQuantities/,'basket selection must consume the quantities edited in preview');
assert.match(chooseBasket,/set_basket_quantity/,'basket selection must apply edited quantities after start_basket');
assert.ok(chooseBasket.indexOf("start_basket")<chooseBasket.indexOf("set_basket_quantity"),'basket edits must be applied only after the basket exists in the cart');

// Abrir o checkout não deve ficar bloqueado esperando uma consulta auxiliar de políticas da cesta.
const checkoutPreviewIntercept=addon.match(/if\(action==='checkout_preview'\)\{[\s\S]*?(?=\n\s*if\(action==='confirm_order'\))/)?.[0]||'';
assert.match(checkoutPreviewIntercept,/lastCheckout=data\.checkout/,'checkout wrapper must retain checkout context');
assert.doesNotMatch(checkoutPreviewIntercept,/await helper\('basket_policies'\)/,'checkout preview must not wait for basket_policies before rendering');

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

// Todo o fluxo ativo deve usar o mesmo WhatsApp oficial exibido no site.
const officialWhatsApp='5565998150975';
const formerWhatsApp=/556584491018/;
assert.match(publicHome,new RegExp(officialWhatsApp),'public home must expose the official WhatsApp number');
assert.match(config,new RegExp(`whatsappFallback:'https://wa\\.me/${officialWhatsApp}'`),'Comprar fallback must use the official WhatsApp number');
assert.match(addon,/C\.whatsappFallback/,'Comprar message builder must derive its destination from the official runtime config');
assert.match(addon,new RegExp(`https://wa\\.me/${officialWhatsApp}`),'Comprar emergency fallback must use the official WhatsApp number');
assert.match(customerEdge,new RegExp(`WA_NUMBER='${officialWhatsApp}'`),'customer verification must use the official WhatsApp number');
assert.match(roomEdge,new RegExp(`phone='${officialWhatsApp}'`),'legacy room emergency fallback must use the official WhatsApp number');
assert.match(cestaReturn,new RegExp(`WHATSAPP_PHONE="${officialWhatsApp}"`),'basket return must use the official WhatsApp number');
for(const [name,source] of [['config',config],['Comprar checkout',addon],['customer verification',customerEdge],['legacy room',roomEdge],['basket return',cestaReturn]]){
  assert.doesNotMatch(source,formerWhatsApp,`${name} must not retain the former WhatsApp number`);
}

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
