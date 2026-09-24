import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('driver-app/app.js','utf8');
const html=fs.readFileSync('driver-app/index.html','utf8');
const css=fs.readFileSync('driver-app/style.css','utf8');

assert.match(app,/collectionPayments/);
assert.match(app,/addPaymentRow/);
assert.match(app,/payment_method:row\.method/);
assert.match(app,/collection:\{payments\}/);
assert.match(app,/credit_card/);
assert.match(app,/food_meal_card/);
assert.match(app,/A soma precisa ser exatamente/);
assert.match(app,/PIX\/cartões ficaram aguardando conciliação/);
assert.doesNotMatch(app,/collectionMethod/);
assert.doesNotMatch(app,/cashTenderLabel/);

assert.match(html,/id="paymentRows"/);
assert.match(html,/id="addPaymentBtn"/);
assert.match(html,/id="paymentTotals"/);
assert.match(html,/Não informe número completo do cartão ou CVV/);
assert.doesNotMatch(html,/id="collectionMethod"/);
assert.doesNotMatch(html,/id="collectionAmount"/);

assert.match(css,/\.payment-row/);
assert.match(css,/\.payment-totals\.ok/);
assert.match(css,/button:disabled/);

console.log('OK driver split-payment UI R1');
