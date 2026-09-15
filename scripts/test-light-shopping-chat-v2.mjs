import {existsSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync('comprar/index.html','utf8');
const js=readFileSync('comprar/chat-light-v2.js','utf8');
const css=readFileSync('comprar/chat-light-v2.css','utf8');
const edge=readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');
const ingestMakeEdge=readFileSync('supabase/functions/whatsapp-ingest-make-v1/index.ts','utf8');
assert.match(html,/chat-light-v2\.css/);
assert.match(html,/chat-light-v2\.js/);
assert.match(js,/Sua cesta/);
assert.match(js,/Adicionar mais produtos/);
assert.match(js,/Finalizar pedido/);
assert.match(js,/set_basket_quantity/);
assert.match(js,/loadMoreProducts/);
assert.match(js,/requestLocation/);
assert.match(html,/id="cartAddProducts"[^>]*>Adicionar produtos<\/button>/,'fixed cart bar must expose Add products');
assert.doesNotMatch(html,/id="cartBar" class="cart-bar hidden"/,'fixed cart bar must stay visible even with an empty cart');
assert.match(js,/\$\('cartAddProducts'\)\.onclick=renderExtraSelector/,'fixed Add products must reuse the existing product selector');
assert.match(js,/\$\('checkoutButton'\)\.disabled=n<=0/,'fixed Finish must stay visible but disabled while cart is empty');
assert.ok(existsSync('comprar/chat-checkout-quantity-v1.js'),'phone-first/quantity addon must exist');
assert.ok(existsSync('comprar/chat-checkout-quantity-v1.css'),'phone-first/quantity addon styles must exist');
assert.ok(existsSync('supabase/functions/shopping-chat-customer-v1/index.ts'),'customer lookup helper edge must exist');
assert.ok(existsSync('comprar/comprar-ux-polish-v1.css'),'Comprar UX polish stylesheet must exist');
assert.ok(existsSync('comprar/phone-retry-v1.js'),'phone retry helper must exist');
const addon=readFileSync('comprar/chat-checkout-quantity-v1.js','utf8');
const addonCss=readFileSync('comprar/chat-checkout-quantity-v1.css','utf8');
const uxCss=readFileSync('comprar/comprar-ux-polish-v1.css','utf8');
const phoneRetry=readFileSync('comprar/phone-retry-v1.js','utf8');
const customerEdge=readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
assert.match(html,/chat-checkout-quantity-v1\.css/,'addon styles must load in the public chat');
assert.match(html,/chat-checkout-quantity-v1\.js/,'addon must load in the public chat');
assert.match(html,/comprar-ux-polish-v1\.css/,'product carousel polish must load in the public chat');
assert.match(html,/phone-retry-v1\.js/,'phone retry helper must load in the public chat');
assert.ok(html.indexOf('chat-checkout-quantity-v1.js')<html.indexOf('chat-light-v2.js'),'addon must load before the main chat so it can enrich responses');
assert.match(addon,/quantity_editable/,'basket UI must honor whether each item can change quantity');
assert.match(addon,/qty-fixed/,'fixed basket items must not show misleading +/- controls');
assert.match(addon,/lookup_customer/,'checkout must look up an existing customer by phone before asking for the rest');
assert.match(addon,/checkoutPhoneLookup/,'checkout must start with the phone lookup step for anonymous customers');
assert.match(addon,/Confirmar pelo WhatsApp/,'existing web customers must prove number ownership through WhatsApp before saved data is shown');
assert.match(addon,/verification_status/,'checkout must be able to observe WhatsApp verification completion');
assert.match(addon,/confirm_order/,'checkout addon must observe order confirmation to build the WhatsApp continuation');
assert.match(addon,/Continuar no WhatsApp/,'successful checkout must provide an explicit WhatsApp continuation button');
assert.match(addon,/address-confirm-required/,'saved delivery addresses must require an explicit confirmation on every order');
assert.match(addon,/stopImmediatePropagation/,'order confirmation must be blocked until a saved address is explicitly chosen');
assert.match(addon,/save\.checked\s*=\s*true/,'a newly entered delivery address must always be saved');
assert.match(addonCss,/\.qty-fixed/,'fixed quantity state must be styled explicitly');
assert.match(addonCss,/\.address-confirm-required/,'explicit delivery address confirmation must have a visible prompt');
assert.match(customerEdge,/action==='lookup_customer'/,'helper API must expose the phone lookup action');
assert.match(customerEdge,/lookup_customer_by_phone/,'phone lookup must reuse the canonical customer lookup routine');
assert.match(customerEdge,/verification_required/,'existing customer lookup from the public web must not bind immediately');
assert.match(customerEdge,/action==='verification_status'/,'helper API must expose verification status without leaking PII');
assert.match(customerEdge,/basket_policies/,'helper API must expose basket editability metadata');
assert.match(ingestMakeEdge,/confirm_web_room_identity_from_whatsapp_v1/,'WhatsApp inbound must be able to confirm a pending web-room identity');
const policyMigration='supabase/migrations/20260912125000_chat_quantity_phone_address_confirmation_v2.sql';
assert.ok(existsSync(policyMigration),'quantity/phone policy migration must exist');
const migration=readFileSync(policyMigration,'utf8');
assert.match(migration,/quantity_editable\s*=\s*true/,'priced basket items must become quantity-editable');
assert.match(migration,/customer_phone_primary_guard/,'incoming WhatsApp numbers must remain secondary when different from the customer primary number');
const verifyMigration='supabase/migrations/20260912143000_web_room_identity_verification_and_whatsapp_return_v1.sql';
assert.ok(existsSync(verifyMigration),'web-room verification migration must exist');
const verifySql=readFileSync(verifyMigration,'utf8');
assert.match(verifySql,/confirm_web_room_identity_from_whatsapp_v1/,'migration must install WhatsApp proof-of-number verification');
assert.match(verifySql,/customer_verification_required/,'database must reject binding a pre-existing customer to an unverified direct web room');
assert.match(css,/\.basket-row/);
assert.match(css,/\.products-rail/);
assert.match(css,/\.checkout-stage/);
assert.match(edge,/\.order\('name'/);
assert.match(edge,/\.range\(offset,offset\+limit-1\)/);
assert.match(edge,/action==='filters'/);

// Product carousel UX: make the product photo more prominent and the title slightly more compact.
assert.match(uxCss,/\.product img\{[^}]*height:132px/,'product carousel image must be taller');
assert.match(uxCss,/\.product h3\{[^}]*font-size:13px/,'product carousel title must use a slightly smaller font');

// Phone lookup UX: a typo must not trap the customer in the new-customer form.
assert.match(phoneRetry,/checkoutPhoneRetry/,'not-found customer form must expose a retry action');
assert.match(phoneRetry,/Buscar novamente/,'retry action must clearly offer another phone search');
assert.match(phoneRetry,/delete stage\.dataset\.phoneFirstReady/,'retry must return to the existing phone-first lookup instead of duplicating customer lookup logic');
assert.match(phoneRetry,/input\.value=current/,'retry must preserve the corrected phone number when returning to lookup');

// Checkout UX: keep the review simple and turn GPS into a useful address shortcut.
assert.match(addon,/function simplifyOrderSummary/,'checkout addon must simplify the visible order review');
assert.match(addon,/line\.querySelectorAll\('span'\)\[1\]\?\.remove\(\)/,'checkout summary must remove the second per-item column (incluído/value)');
assert.match(addon,/reverse_geocode/,'GPS flow must request reverse geocoding');
assert.match(addon,/function applyLocatedAddress/,'GPS flow must fill the editable delivery address form');
assert.match(addon,/input\[name="address"\]\[value="new"\]/,'GPS flow must switch from a saved address to the editable address form before filling it');
assert.match(customerEdge,/action==='reverse_geocode'/,'customer helper must expose reverse geocoding');
assert.match(customerEdge,/nominatim\.openstreetmap\.org\/reverse/,'reverse geocoding must happen server-side instead of exposing a third-party call in the browser');
assert.match(customerEdge,/countrycodes=br/,'reverse geocoding must stay constrained to Brazilian addresses');
assert.match(addonCss,/\.checkout-order/,'checkout order summary must have dedicated compact styling');
assert.match(addonCss,/\.location-success/,'successful GPS address fill must be visually clear');

// Customer taxonomy v2: the public shopping room must expose the four simple entry choices
// and drive product browsing from the new customer-facing taxonomy instead of the legacy sales_category tree.
assert.match(js,/Cestas Básicas/,'start menu must expose Cestas Básicas');
assert.match(js,/Ofertas/,'start menu must expose Ofertas');
assert.match(js,/Para Você/,'start menu must expose Para Você');
assert.match(js,/Para Casa/,'start menu must expose Para Casa');
assert.match(js,/customerCategory/,'client state must track the selected customer category');
assert.match(js,/customerSubcategory/,'client state must track the selected customer subcategory');
assert.match(js,/customerSubsubcategory/,'client state must track the selected customer subsubcategory');
assert.match(edge,/customer_category/,'products API must filter by customer_category');
assert.match(edge,/customer_subcategory/,'products API must filter by customer_subcategory');
assert.match(edge,/customer_subsubcategory/,'products API must filter by customer_subsubcategory');
assert.match(edge,/subcategories/,'filters response must expose first-level customer subcategories');
assert.match(edge,/subsubcategories/,'filters response must expose second-level customer subsubcategories');

// The web storefront must be able to sell products that are valid for the web even when
// the legacy WhatsApp channel flag is disabled. WhatsApp writes keep their own helper/rules.
const webEligibilityMigration='supabase/migrations/20260914203500_web_shopping_room_product_eligibility_v1.sql';
assert.ok(existsSync(webEligibilityMigration),'web storefront eligibility migration must exist');
const webEligibilitySql=readFileSync(webEligibilityMigration,'utf8');
assert.match(webEligibilitySql,/create or replace function public\.set_cart_web_addon_quantity/i,'web storefront must have a channel-specific cart helper');
assert.match(webEligibilitySql,/v_cart:=public\.set_cart_web_addon_quantity\(v_cart_id,p_product_id,p_quantity\)/,'shopping room must use the web-specific helper');
const webHelper=webEligibilitySql.match(/create or replace function public\.set_cart_web_addon_quantity[\s\S]*?as \$function\$[\s\S]*?\$function\$;/i)?.[0]||'';
assert.match(webHelper,/physically_verified\s*=\s*true/i,'web helper must require physical verification');
assert.match(webHelper,/is_active\s*=\s*true/i,'web helper must require an active product');
assert.match(webHelper,/coalesce\(stock,0\)/i,'web helper must enforce stock');
assert.doesNotMatch(webHelper,/is_whatsapp_active/i,'web helper must not depend on the WhatsApp availability flag');

// Product +/- must feel immediate while remaining transactionally safe.
assert.match(js,/applyOptimisticProductDelta/,'product quantity must update local cart totals immediately');
assert.match(js,/syncProductQty/,'rapid quantity changes must be synchronized through a per-product queue');
assert.match(js,/_confirmedQuantity/,'client must remember the last server-confirmed quantity for rollback');
assert.match(js,/state\.product\.syncing/,'client must track pending quantity synchronization');
assert.doesNotMatch(js,/function changeProductQty[\s\S]{0,700}pointerEvents='none'/,'product card must not be locked while quantity is saving');
assert.match(js,/async function showCheckout\(\)\{if\(state\.product\.syncing>0\)/,'checkout must wait for pending product writes');
assert.match(js,/product_not_available:'Este produto não está disponível no momento\.'/,'raw product availability errors must be translated for customers');
assert.match(js,/quantity_exceeds_stock:'A quantidade escolhida é maior que o estoque disponível\.'/,'stock errors must be translated for customers');
assert.match(js,/quantity_exceeds_customer_limit:'Você pode adicionar até 6 unidades deste produto\.'/,'quantity cap errors must be translated for customers');
console.log('light_shopping_chat_v2_ok');
