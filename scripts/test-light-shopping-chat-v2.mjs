import {existsSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const html=readFileSync('comprar/index.html','utf8');
const app=readFileSync('comprar/app.js','utf8');
const baskets=readFileSync('comprar/baskets.js','utf8');
const products=readFileSync('comprar/products.js','utf8');
const checkout=readFileSync('comprar/checkout.js','utf8');
const help=readFileSync('comprar/help.js','utf8');
const css=readFileSync('comprar/styles.css','utf8');
const edge=readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');
const customerEdge=readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const ingestMakeEdge=readFileSync('supabase/functions/whatsapp-ingest-make-v1/index.ts','utf8');

// Runtime limpo e único.
assert.match(html,/styles\.css\?v=20260915-05/);
for(const file of ['app','baskets','products','checkout','help'])assert.match(html,new RegExp(`${file}\\.js\\?v=20260915-05`));
for(const old of ['chat-light-v2.js','chat-checkout-quantity-v1.js','checkout-final-v2.js','chat-helper-menu.js','phone-retry-v1.js'])assert.doesNotMatch(html,new RegExp(old.replaceAll('.','\\.')));
for(const [name,source] of [['app',app],['baskets',baskets],['products',products],['checkout',checkout],['help',help]]){
  assert.doesNotMatch(source,/window\.fetch\s*=/,`${name} must not replace window.fetch`);
  assert.doesNotMatch(source,/new\s+MutationObserver/,`${name} must not patch DOM with global MutationObserver`);
}

// Shell e carrinho: uma única fonte de estado e ações diretas.
assert.match(html,/id="cartAddProducts"[^>]*>Adicionar produtos<\/button>/,'fixed cart bar must expose Add products');
assert.doesNotMatch(html,/id="cartBar" class="cart-bar hidden"/,'fixed cart bar must stay visible even with an empty cart');
assert.match(app,/pendingProductSyncs:new Map\(\)/,'central state must own product synchronization');
assert.match(app,/function setCart\(/,'central app must own cart updates');
assert.match(app,/checkout\.disabled=count<=0/,'fixed Ver pedido must stay disabled while cart is empty');
assert.match(app,/addProducts\.onclick=\(\)=>openAddProductsStage/,'fixed Add products must use the single stage-2 entry point');
assert.match(app,/checkoutButton\.onclick=\(\)=>openCheckout/,'fixed Ver pedido must use the single checkout path');

// Cestas: prévia editável sem carrinho e escolha abre imediatamente a etapa 2.
assert.match(baskets,/Sua cesta/);
assert.match(baskets,/Adicionar mais produtos/);
assert.match(baskets,/Finalizar pedido/);
assert.match(baskets,/set_basket_quantity/);
assert.match(baskets,/quantity_editable/,'basket UI must honor whether each item can change quantity');
const preview=baskets.match(/async function previewBasket[\s\S]*?(?=\n\s*async function chooseBasket)/)?.[0]||'';
assert.doesNotMatch(preview,/start_basket|set_basket_quantity/,'preview must remain local until explicit basket choice');
const choose=baskets.match(/async function chooseBasket[\s\S]*?(?=\n\s*function renderSelectedBasket)/)?.[0]||'';
assert.match(choose,/api\('start_basket'/);
assert.match(choose,/renderSelectedBasket\(\)/);
assert.match(choose,/state\.modules\.products\?\.renderEntry\?\.\(\{auto:true\}\)/,'after choosing a basket, stage 2 must open automatically');
assert.match(choose,/scrollTo\(finish,\{block:'start'\}\)/,'scroll must retain Finalizar pedido directly above stage 2');

// Produtos: filtros sticky, taxonomia simples, paginação manual e sincronização por produto.
for(const label of ['Para Você','Para Casa','Ofertas','Buscar produto','Todos'])assert.match(products,new RegExp(label));
assert.match(products,/products-filter-sticky/);
assert.match(products,/chips-categories/);
assert.match(products,/chips-subcategories/);
assert.match(products,/generation/,'stale filter/page responses must be invalidated');
assert.match(products,/desiredQuantity/);
assert.match(products,/confirmedQuantity/);
assert.match(products,/async function syncProduct/);
assert.match(products,/while\(sync\.desiredQuantity!==sync\.confirmedQuantity\)/,'rapid +/- must coalesce in a per-product loop');
assert.match(products,/registerPendingProductSync/,'only the affected product write must be tracked');
assert.doesNotMatch(products,/pointerEvents='none'/,'product grid must not freeze while a quantity is saving');
assert.match(products,/set_quantity/,'product quantity must use the official cart API');
assert.doesNotMatch(products,/addEventListener\(['"]scroll['"]/,'scroll must not load more products');
assert.match(products,/data-products-more/,'product pagination must expose Ver mais');
assert.match(css,/\.products-filter-sticky\{[^}]*position:sticky/s,'search and chips must remain sticky');
assert.match(css,/\.chips-subcategories \.chip\{[^}]*font-size:12px/s,'subcategory chips must be smaller and discreet');
assert.match(css,/\.products-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s,'mobile product grid must remain two columns');
assert.match(edge,/\.order\('name'/);
assert.match(edge,/\.range\(offset,offset\+limit-1\)/);
assert.match(edge,/action==='filters'/);
assert.match(edge,/customer_category/);
assert.match(edge,/customer_subcategory/);
assert.match(edge,/customer_subsubcategory/);
assert.match(edge,/subcategories/);
assert.match(edge,/subsubcategories/);

// Checkout: telefone primeiro, dados editáveis no chat e um único clique final.
assert.match(checkout,/lookup_customer/,'checkout must look up an existing customer by phone');
assert.match(checkout,/checkoutPhoneLookup/,'anonymous checkout must begin with phone lookup');
assert.match(checkout,/renderCheckoutForm/,'existing/new customer must continue in the same chat form');
assert.doesNotMatch(checkout,/Confirmar pelo WhatsApp/,'lookup must not leave the checkout to verify WhatsApp ownership');
assert.doesNotMatch(checkout,/verification_status/,'checkout must not poll an intermediate WhatsApp verification');
assert.doesNotMatch(checkout,/checkoutDocument/,'checkout must never render CPF');
for(const id of ['checkoutName','checkoutPhone','checkoutStreet','checkoutNumber','checkoutNeighborhood','checkoutCity','checkoutState','checkoutPostal'])assert.match(checkout,new RegExp(id));
assert.match(checkout,/checkout-payments/,'payment options must be in the same form');
assert.match(checkout,/Confirmar e enviar pedido/,'final action must be explicit');
assert.match(checkout,/reverse_geocode/,'GPS shortcut must reverse-geocode server-side');
assert.match(checkout,/commit_customer/,'customer changes must persist at final confirmation');
assert.match(checkout,/save_address/,'delivery address must persist at final confirmation');
assert.match(checkout,/set_payment/,'payment must persist at final confirmation');
assert.match(checkout,/app\.confirmOrder/,'final order must use the single app transport');
assert.match(checkout,/local\.orderSaved=true/,'final order must not be persisted twice');
const openCheckout=checkout.match(/async function open\(button\)[\s\S]*?(?=\n\s*function render\()/)?.[0]||'';
assert.match(openCheckout,/waitForPending/,'checkout must wait for pending product writes');
assert.match(openCheckout,/finally/,'checkout must recover its trigger on every path');
assert.match(openCheckout,/setButtonBusy\(button,false\)/);
assert.match(customerEdge,/action==='lookup_customer'/);
assert.match(customerEdge,/lookup_customer_by_phone/);
assert.match(customerEdge,/profile:/,'customer lookup must return sanitized checkout profile');
assert.match(customerEdge,/action==='commit_customer'/);
assert.doesNotMatch(customerEdge,/verification_required/,'customer edge must not require intermediate WhatsApp verification');
assert.doesNotMatch(customerEdge,/action==='verification_status'/,'customer edge must not expose obsolete verification polling');
assert.match(customerEdge,/action==='reverse_geocode'/);
assert.match(customerEdge,/nominatim\.openstreetmap\.org\/reverse/);
assert.match(customerEdge,/countrycodes=br/);
// O ingest ainda pode reconhecer mensagens antigas de verificação de sessões históricas; o checkout novo não depende disso.
assert.match(ingestMakeEdge,/confirm_web_room_identity_from_whatsapp_v1/);

// Ajuda simples: só conversa/mídia; nunca catálogo ou carrinho.
assert.match(help,/send_text/);
assert.match(help,/uploadMedia/);
assert.match(help,/setCheckoutMode/);
assert.doesNotMatch(help,/start_basket|set_quantity|productsApi|renderPicker/,'simple Help must never alter shopping state');

// Políticas antigas continuam no banco por compatibilidade, sem controlar o novo checkout web.
const policyMigration='supabase/migrations/20260912125000_chat_quantity_phone_address_confirmation_v2.sql';
assert.ok(existsSync(policyMigration),'quantity/phone policy migration must exist');
const migration=readFileSync(policyMigration,'utf8');
assert.match(migration,/quantity_editable\s*=\s*true/,'priced basket items must become quantity-editable');
assert.match(migration,/customer_phone_primary_guard/,'incoming WhatsApp numbers must remain secondary when different from primary');
const verifyMigration='supabase/migrations/20260912143000_web_room_identity_verification_and_whatsapp_return_v1.sql';
assert.ok(existsSync(verifyMigration),'historical web-room verification migration must remain available for compatibility');
const verifySql=readFileSync(verifyMigration,'utf8');
assert.match(verifySql,/confirm_web_room_identity_from_whatsapp_v1/);
const webEligibilityMigration='supabase/migrations/20260914203500_web_shopping_room_product_eligibility_v1.sql';
assert.ok(existsSync(webEligibilityMigration),'web storefront eligibility migration must exist');
const webEligibilitySql=readFileSync(webEligibilityMigration,'utf8');
assert.match(webEligibilitySql,/create or replace function public\.set_cart_web_addon_quantity/i);
assert.match(webEligibilitySql,/v_cart:=public\.set_cart_web_addon_quantity\(v_cart_id,p_product_id,p_quantity\)/);
const webHelper=webEligibilitySql.match(/create or replace function public\.set_cart_web_addon_quantity[\s\S]*?as \$function\$[\s\S]*?\$function\$;/i)?.[0]||'';
assert.match(webHelper,/physically_verified\s*=\s*true/i);
assert.match(webHelper,/is_active\s*=\s*true/i);
assert.match(webHelper,/coalesce\(stock,0\)/i);
assert.doesNotMatch(webHelper,/is_whatsapp_active/i);

console.log('light_shopping_chat_v2_ok');
