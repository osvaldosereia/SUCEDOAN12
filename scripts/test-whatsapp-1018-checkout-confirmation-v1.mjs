import assert from 'node:assert/strict';
import {quote1018CanonicalCart} from '../supabase/functions/_shared/ana-1018-canonical-cart-quote-v1.mjs';
import {prepare1018CheckoutConfirmation as prepare} from '../supabase/functions/_shared/ana-1018-checkout-confirmation-v1.mjs';
const quote=quote1018CanonicalCart({city:'Cuiabá',catalog:[{key:'basket:kit@1',name:'Cesta',priceCents:8000,stock:3,hidden_adjustment_cents:2000},{key:'product:rice',name:'Arroz',priceCents:3000,stock:2}],lines:[{kind:'basket',id:'kit@1',quantity:1},{kind:'product',id:'rice',quantity:1}]});
const input={quote,customer:{name:'Cliente teste',phone:'65999999999',document:'12345678909'},
 delivery:{city:'Cuiabá',street:'Rua Exemplo',number:'100',neighborhood:'Centro'},
 paymentMethod:'pix_delivery',customerConfirmed:true};
const result=prepare(input);
assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.orderCreated,false);
assert.equal(result.confirmation.totalCents,11000);
for(const term of ['hidden','2000','adjustment','12345678909'])assert.ok(!JSON.stringify(result).includes(term),'private field leakage: '+term);
assert.equal(prepare({...input,customerConfirmed:false}).reason,'customer_confirmation_required');
assert.equal(prepare({...input,paymentMethod:'boleto'}).reason,'invalid_payment_method');
assert.equal(prepare({...input,delivery:{...input.delivery,city:'São Paulo'}}).reason,'structured_delivery_address_required');
assert.equal(prepare({...input,delivery:{...input.delivery,number:''}}).reason,'structured_delivery_address_required');
assert.equal(prepare({...input,customer:{...input.customer,phone:'123'}}).reason,'customer_identity_required');
assert.equal(prepare({...input,quote:{...quote,totalCents:10}}).reason,'canonical_quote_required');
console.log('PASS: checkout confirmation identity, complete address, consent, minimum, no hidden basket or document leakage');