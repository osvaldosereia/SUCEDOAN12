import assert from 'node:assert/strict';
import {build1018CanonicalOrderPayload as build} from '../supabase/functions/_shared/ana-1018-canonical-order-payload-v1.mjs';
const basket='11111111-1111-4111-8111-111111111111',product='22222222-2222-4222-8222-222222222222',
 pos='33333333-3333-4333-8333-333333333333',lot='44444444-4444-4444-8444-444444444444';
const quote={ok:true,readOnly:true,orderCreated:false,totalCents:11500,deliveryCity:'Cuiabá'};
const customer={name:'Teste interno 1018',phone:'65999999999',document:'12345678909'};
const delivery={street:'Rua Teste',number:'100',neighborhood:'Centro',city:'Cuiabá',postal_code:'78000000'};
const base={quote,customer,delivery,paymentMethod:'pix_delivery',deliveryDate:'2026-10-15'};
const mold={basket:{id:basket,mold_mode:true,composition_number:2,stock_quantity:4},
 items:[{position_id:pos,product_id:product,quantity:1}]};
const a=build({...base,lines:[{kind:'basket',id:basket+'@2',quantity:1}],basketDetails:new Map([[basket+'@2',mold]])});
assert.equal(a.ok,true,JSON.stringify(a));assert.equal(a.payload.items[0].type,'basket_mold');
assert.equal(a.payload.items[0].composition_number,2);
assert.deepEqual(a.payload.items[0].components,[{position_id:pos,product_id:product,quantity:1}]);
assert.equal('items' in a.payload.items[0],false,'canonical SQL only reads components');
assert.equal(a.payload.payment_method,'PIX','canonical SQL accepts PIX, not pix_delivery');
assert.equal(a.payload.checkout_registration.street,'Rua Teste');
assert.equal(a.payload.checkout_registration.document,'12345678909');
assert.equal(a.payload.whatsapp_phone,'+5565999999999');
assert.equal(a.orderCreated,false);
const split={basket:{id:basket,split_mode:true,food_lot_id:lot,stock_quantity:2},
 items:[{product_id:product,base_quantity:1,component_group:'food'}]};
const b=build({...base,lines:[{kind:'basket',id:basket,quantity:1}],basketDetails:new Map([[basket,split]])});
assert.equal(b.ok,true);assert.equal(b.payload.items[0].food_lot_id,lot);
assert.equal(b.payload.items[0].components[0].component_group,'food');
assert.equal(build({...base,lines:[{kind:'basket',id:basket+'@2',quantity:1}],
 basketDetails:new Map([[basket+'@2',{...mold,basket:{...mold.basket,composition_number:3}}]])}).reason,'composition_mismatch');
assert.equal(build({...base,lines:[{kind:'product',id:product,quantity:1}],paymentMethod:'boleto'}).reason,'invalid_payment_method');
assert.equal(build({...base,lines:[{kind:'product',id:product,quantity:1}],delivery:{...delivery,city:'Rondonópolis'}}).reason,'registration_address_required');
assert.equal(build({...base,lines:[{kind:'product',id:product,quantity:31}]}).reason,'invalid_quantity');
for(const [payment,label] of Object.entries({cash_delivery:'Dinheiro',credit_delivery:'Cartão de crédito',meal_card_delivery:'Cartão alimentação/refeição'})){
 const p=build({...base,lines:[{kind:'product',id:product,quantity:1}],paymentMethod:payment});
 assert.equal(p.ok,true);assert.equal(p.payload.payment_method,label);
}
assert.equal(JSON.stringify(a).includes('hidden_adjustment_cents'),false,'no hidden basket pricing in order payload');
console.log('PASS: official mold components, split lots, registration, payments, stock bounds; order not created');