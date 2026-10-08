import assert from 'node:assert/strict';
import {classifyAnaPostPurchaseRequest,buildAnaPostPurchaseReply} from '../supabase/functions/_shared/ana-post-purchase-intent-v1.mjs';
for(const phrase of ['Esqueci um produto','Esqueci de colocar arroz no pedido','Posso acrescentar mais uma coisa no meu pedido?','Quero adicionar feijao ao pedido que ja fiz','Faltou sabonete']){
  const result=classifyAnaPostPurchaseRequest(phrase);
  assert.equal(result?.intent,'order_addon_request',phrase);
  assert.equal(result?.may_mutate_order,false);
}
for(const phrase of ['Quero cancelar o pedido','Esqueci a senha','Esqueci de pagar o Pix','Nao quero adicionar nada ao pedido','Quero adicionar ao carrinho','Tem promocao de arroz?'])assert.equal(classifyAnaPostPurchaseRequest(phrase),null,phrase);
const url='https://www.donaantonia.com.br/adicionar/#t='+('A'.repeat(43));
assert.equal(buildAnaPostPurchaseReply({status:'eligible',addonUrl:url,orderNumber:'DA-1234'}).decision,'suggest');
assert.equal(buildAnaPostPurchaseReply({status:'eligible',addonUrl:'invalid'}).decision,'handoff');
assert.equal(buildAnaPostPurchaseReply({status:'closed'}).decision,'handoff');
console.log('PASS: ANA V3 post-purchase intent and safe reply');
