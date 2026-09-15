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
for(const action of ['lookup_customer','verification_status','identify','save_address','set_payment']){
  assert.match(js,new RegExp(action),`checkout deve usar ação ${action}`);
}
for(const fn of ['renderIdentification','renderVerification','renderNewCustomer','renderAddress','renderPayment','requestLocation','confirmOrder','renderSuccess']){
  assert.match(js,new RegExp(`function\\s+${fn}|async\\s+function\\s+${fn}`),`checkout deve implementar ${fn}`);
}
assert.match(js,/app\.confirmOrder/,'confirmação deve usar transporte central compatível com Admin V3');
assert.match(js,/orderSaved/,'checkout deve impedir persistência duplicada do pedido');
assert.match(js,/whatsapp_url/,'checkout deve preservar retorno oficial ao WhatsApp');
assert.match(js,/commercial_total/,'resumo final deve aceitar total comercial quando o backend não enviar total');
assert.match(js,/dataset\.busy/,'botões críticos devem ter trava local contra clique duplo');

console.log('OK: contrato limpo de checkout');
