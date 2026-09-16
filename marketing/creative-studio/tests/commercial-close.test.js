import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCommercialClose} from '../commercial-close.js';

test('builds offer close only from real product pricing',()=>{
  const close=buildCommercialClose({name:'Café Extra Forte',price:19.9,offer_price:17.9,is_offer:true});
  assert.equal(close.productName,'Café Extra Forte');
  assert.equal(close.price,17.9);
  assert.equal(close.compareAt,19.9);
  assert.equal(close.badge,'OFERTA');
  assert.equal(close.cta,'Peça pelo WhatsApp');
});

test('never invents a discount when product is not a valid offer',()=>{
  const close=buildCommercialClose({name:'Arroz 5kg',price:32.9,is_offer:false,offer_price:20});
  assert.equal(close.price,32.9);
  assert.equal(close.compareAt,null);
  assert.equal(close.badge,null);
});

test('rejects invalid or nonpositive sale price instead of displaying fake value',()=>{
  const close=buildCommercialClose({name:'Produto',price:0,is_offer:false});
  assert.equal(close.price,null);
  assert.equal(close.priceText,'');
});
