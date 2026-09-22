import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const app=readFileSync('comprar/app.js','utf8');
const baskets=readFileSync('comprar/baskets.js','utf8');
const checkout=readFileSync('comprar/checkout.js','utf8');
const conversation=readFileSync('comprar/conversation.js','utf8');
const config=readFileSync('comprar/config.js','utf8');
const customerEdge=readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const roomEdge=readFileSync('supabase/functions/shopping-room-v1/index.ts','utf8');
const cestaReturn=readFileSync('cesta/whatsapp-return.js','utf8');
const publicHome=readFileSync('index.html','utf8');

assert.match(config,/basketStorefrontApi:\s*'[^']*basket-storefront-v1'/);
assert.match(baskets,/async function previewBasket/);
assert.match(baskets,/button\.textContent='Ver produtos'/);
const policy=baskets.match(/function basketPolicy[\s\S]*?(?=\n\s*function clearBasketConversation)/)?.[0]||'';
assert.match(policy,/min_quantity/);assert.match(policy,/max_quantity/);assert.match(policy,/quantity_editable/);
const preview=baskets.match(/async function previewBasket[\s\S]*?(?=\n\s*async function chooseBasket)/)?.[0]||'';
assert.match(preview,/basketStorefrontApi\('detail'/);
assert.doesNotMatch(preview,/start_basket/);assert.doesNotMatch(preview,/set_basket_quantity/);
assert.match(preview,/Quero esta cesta/);assert.match(preview,/Voltar às cestas/);

const choose=baskets.match(/async function chooseBasket[\s\S]*?(?=\n\s*function basketItemCount)/)?.[0]||'';
assert.match(choose,/api\('start_basket'/);assert.match(choose,/api\('set_basket_quantity'/);
assert.match(choose,/renderSelectedBasketSummary\(\)/);assert.match(choose,/state\.modules\.products\?\.renderEntry\?\.\(\{auto:true\}\)/);
assert.match(choose,/userDecision/);assert.match(choose,/assistantMessage/);
assert.match(baskets,/function renderSelectedBasketSummary/);assert.match(baskets,/function expandSelectedBasket/);

const openCheckout=checkout.match(/async function open\(button\)[\s\S]*?(?=\n\s*function render\()/)?.[0]||'';
assert.match(openCheckout,/state\.modules\.products\?\.waitForPending\?\.\(\)/);
assert.match(openCheckout,/refreshCheckout\(\)/);assert.match(openCheckout,/finally\s*\{/);assert.match(openCheckout,/setButtonBusy\(button,false\)/);
assert.match(openCheckout,/modules\.upsell\?\.stop/,'checkout deve encerrar upsell antes dos dados pessoais');
assert.match(app,/async function openCheckout\(button\)/);assert.match(app,/checkoutButton\.onclick=\(\)=>openCheckout\(checkoutButton\)/);assert.match(app,/cartButton\.onclick=\(\)=>openCheckout\(cartButton\)/);
assert.match(app,/function renderOrderReview/,'Ver pedido deve abrir resumo antes do checkout');

assert.doesNotMatch(checkout,/renderVerification/,'checkout web não deve mandar o cliente para confirmar cadastro no WhatsApp');
assert.doesNotMatch(checkout,/verification_status/,'checkout web não deve depender de polling de verificação');
assert.doesNotMatch(checkout,/checkoutDocument/,'checkout não deve exibir CPF');
assert.match(checkout,/function renderCheckoutForm/,'dados encontrados devem aparecer em formulário único');
for(const id of ['checkoutName','checkoutPhone','checkoutStreet','checkoutNumber','checkoutNeighborhood','checkoutComplement','checkoutReference','checkoutCity','checkoutState','checkoutPostal'])assert.match(checkout,new RegExp(id));
assert.match(checkout,/checkout-payments/);assert.match(checkout,/Confirmar e enviar pedido/);
assert.match(checkout,/function addressIssue/,'checkout fallback deve identificar campo de endereço faltante');
assert.match(checkout,/Informe o número da casa/,'checkout deve orientar número ausente');
assert.match(conversation,/const savedIssue=saved\?addressIssue\(saved\):null/,'endereço salvo deve ser validado antes de ser aceito');
assert.match(conversation,/saved&&!forceNew&&!savedIssue/,'somente endereço salvo completo pode pular a edição');
assert.match(conversation,/preserveAddressId:Boolean\(saved&&!forceNew\)/,'endereço salvo incompleto deve ser corrigido sem duplicar cadastro');
assert.match(conversation,/Informe o número da casa/,'checkout conversacional deve orientar número ausente');
assert.match(conversation,/focusCheckoutIssue/,'checkout conversacional deve focar o campo faltante');
assert.match(conversation,/fillAddressInputs\(data\.address\|\|\{\}\)/,'geolocalização deve preencher sem apagar dados digitados');
const finalAction=checkout.match(/async function confirmAndSend[\s\S]*?(?=\n\s*function renderSuccess)/)?.[0]||'';
assert.match(finalAction,/customerApi\('commit_customer'/);
assert.match(finalAction,/checkoutApi\('save_address'/);
assert.match(finalAction,/api\('set_payment'/);
assert.match(finalAction,/app\.confirmOrder\(payload\)/);
assert.match(finalAction,/local\.orderSaved=true/);
assert.match(finalAction,/openSavedWhatsApp\(\)/);

const whatsappBuilder=checkout.match(/function buildWhatsAppUrl[\s\S]*?(?=\n\s*function reserveWhatsAppWindow)/)?.[0]||'';
assert.match(whatsappBuilder,/app\.config\.whatsappFallback/);
assert.match(whatsappBuilder,/encodeURIComponent/);assert.match(whatsappBuilder,/order_number/);assert.match(whatsappBuilder,/paymentLabels/);assert.match(whatsappBuilder,/addressLine/);assert.match(whatsappBuilder,/items/);assert.match(whatsappBuilder,/total/);
assert.doesNotMatch(checkout,/setTimeout\(/,'WhatsApp final não pode depender de redirecionamento atrasado');
assert.doesNotMatch(checkout,/whatsapp:\/\//,'mobile deve usar wa.me, não custom scheme');
const success=checkout.match(/function renderSuccess[\s\S]*?(?=\n\s*app\.registerModule)/)?.[0]||'';
assert.match(success,/checkout-whatsapp-return/);assert.match(success,/local\.whatsappUrl/);assert.doesNotMatch(success,/confirm_order/);

assert.match(app,/DA_ADMIN_TEST_TRANSPORT/);assert.doesNotMatch(app,/window\.fetch\s*=/);assert.doesNotMatch(checkout,/window\.fetch\s*=/);
const officialWhatsApp='5565998150975',formerWhatsApp=/556584491018/;
assert.match(publicHome,new RegExp(officialWhatsApp));
assert.match(config,new RegExp(`whatsappFallback:'https://wa\\.me/${officialWhatsApp}'`));
assert.match(checkout,/app\.config\.whatsappFallback/);
assert.match(customerEdge,new RegExp(`WA_NUMBER='${officialWhatsApp}'`));
assert.match(roomEdge,new RegExp(`phone='${officialWhatsApp}'`));
assert.match(cestaReturn,new RegExp(`WHATSAPP_PHONE="${officialWhatsApp}"`));
for(const source of [config,checkout,customerEdge,roomEdge,cestaReturn])assert.doesNotMatch(source,formerWhatsApp);
console.log('basket_preview_checkout_whatsapp_v1_ok');