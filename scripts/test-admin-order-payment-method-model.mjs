import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const modulePath='vitrine/admin/orders/payment-method.js';
const context={window:{}};
vm.runInNewContext(fs.readFileSync(modulePath,'utf8'),context,{filename:modulePath});
const model=context.window.DonaAntoniaAdminOrderPaymentMethod;
assert.ok(model,'order payment method model is registered');
const normalize=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const {deliveryMethodV3,deliveryMethodOptionsV3,orderV3PaymentOptions}=model.create(normalize);

assert.deepEqual([
  deliveryMethodV3('PIX'),deliveryMethodV3('Dinheiro'),deliveryMethodV3('Cartão de crédito'),
  deliveryMethodV3('Cartão alimentação'),deliveryMethodV3('Cartão refeição'),deliveryMethodV3('boleto')
],['pix','cash','credit_card','food_card','meal_card','other']);
assert.equal(deliveryMethodOptionsV3('cash'),[
  '<option value="pix" >PIX</option>','<option value="cash" selected>Dinheiro</option>',
  '<option value="credit_card" >Cartão de crédito</option>','<option value="food_card" >Cartão alimentação</option>',
  '<option value="meal_card" >Cartão refeição</option>','<option value="other" >Outro</option>'
].join(''));
assert.equal(orderV3PaymentOptions('Crédito'),[
  '<option value="pix" >PIX</option>','<option value="cash" >Dinheiro</option>',
  '<option value="credit_card" selected>Cartão de crédito</option>','<option value="food_card" >Cartão alimentação</option>',
  '<option value="meal_card" >Cartão refeição</option>'
].join(''));
console.log('Admin order payment method model contract: PASS');
