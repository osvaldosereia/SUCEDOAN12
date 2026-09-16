import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const file='comprar/checkout.js';
assert.doesNotThrow(()=>readFileSync(file,'utf8'),'checkout.js deve existir');
const js=readFileSync(file,'utf8');

assert.doesNotMatch(js,/window\.fetch\s*=/,'checkout não pode interceptar fetch');
assert.doesNotMatch(js,/new\s+MutationObserver/,'checkout não pode depender de observer global');
assert.match(js,/async\s+function\s+open\s*\(/,'Ver pedido deve ter abertura explícita');
const openStart=js.indexOf('async function open');
const renderStart=js.indexOf('function render',openStart);
const openBlock=js.slice(openStart,renderStart>openStart?renderStart:undefined);
assert.match(openBlock,/waitForPending/,'checkout deve aguardar apenas sincronizações de produto pendentes');
assert.match(openBlock,/refreshCheckout\s*\(/,'checkout deve buscar preview por função explícita');
const refreshStart=js.indexOf('async function refreshCheckout');
const openFunctionStart=js.indexOf('async function open',refreshStart);
const refreshBlock=js.slice(refreshStart,openFunctionStart>refreshStart?openFunctionStart:undefined);
assert.match(refreshBlock,/api\(['"]checkout_preview['"]\)/,'refresh explícito deve chamar checkout_preview diretamente');
assert.match(openBlock,/finally/,'botão deve ser sempre liberado');
for(const action of ['lookup_customer','commit_customer','save_address','set_payment']){
  assert.match(js,new RegExp(action),`checkout deve usar ação ${action}`);
}
assert.doesNotMatch(js,/verification_status/,'checkout não deve depender de confirmação intermediária pelo WhatsApp');
assert.doesNotMatch(js,/checkoutDocument/,'checkout não deve renderizar CPF');
for(const fn of ['renderIdentification','renderCheckoutForm','requestLocation','readCheckoutForm','confirmAndSend','openSavedWhatsApp','renderSuccess']){
  assert.match(js,new RegExp(`function\\s+${fn}|async\\s+function\\s+${fn}`),`checkout deve implementar ${fn}`);
}
for(const id of ['checkoutName','checkoutPhone','checkoutStreet','checkoutNumber','checkoutNeighborhood','checkoutComplement','checkoutReference','checkoutCity','checkoutState','checkoutPostal']){
  assert.match(js,new RegExp(id),`checkout deve renderizar ${id}`);
}
assert.match(js,/checkout-payments/,'formas de pagamento devem aparecer no mesmo formulário');
assert.match(js,/Confirmar e enviar pedido/,'ação final deve salvar e enviar o pedido');
assert.match(js,/customerApi\('commit_customer'/,'cliente deve ser confirmado no clique final');
assert.match(js,/checkoutApi\('save_address'/,'endereço deve ser salvo no clique final');
assert.match(js,/api\('set_payment'/,'pagamento deve ser salvo no clique final');
assert.match(js,/app\.confirmOrder/,'confirmação deve usar transporte central compatível com Admin');
assert.match(js,/orderSaved/,'checkout deve impedir persistência duplicada do pedido');
assert.match(js,/whatsappUrl/,'checkout deve preservar a URL final do WhatsApp');
assert.match(js,/commercial_total/,'resumo final deve aceitar total comercial quando o backend não enviar total');
assert.match(js,/dataset\.busy/,'botões críticos devem ter trava local contra clique duplo');
assert.doesNotMatch(js,/setTimeout\s*\(/,'handoff do WhatsApp não pode depender de atraso');
assert.doesNotMatch(js,/whatsapp:\/\//,'handoff deve usar link universal wa.me');

console.log('OK: contrato limpo de checkout');
