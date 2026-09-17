import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync('comprar/personalized-start-v1.js','utf8');
const css=fs.readFileSync('comprar/personalized-start-v1.css','utf8');
const html=fs.readFileSync('comprar/index.html','utf8');

assert.match(ui,/state\.customer\?\.id/,'personalização exige cliente identificado');
assert.match(ui,/repeatLastPurchase\?\.getCache/);
assert.match(ui,/frequentPurchases\?\.getCache/);
assert.match(ui,/favorite\.purchase_count\|\|0\)<2/,'cesta favorita precisa de recorrência real');
assert.match(ui,/repeat\.addon_count/,'atalho de cesta deve evitar duplicação quando a última compra é equivalente');
assert.match(ui,/basket_customization_detected/);
assert.match(ui,/Comprar minha cesta de sempre/);
assert.match(ui,/Ou compre diferente/);
assert.match(ui,/start-chips/,'opções normais devem permanecer disponíveis');
assert.doesNotMatch(ui,/start-chips[^\n]*\.remove\(/,'não deve esconder as opções normais');
assert.match(ui,/Atalhos para você/);
assert.match(ui,/Como quer comprar hoje\?/);

assert.match(css,/personalized-start-shortcuts/);
assert.match(css,/grid-template-columns:repeat\(2/);
assert.match(css,/@media\(max-width:560px\)/);

const identity=html.indexOf('papo-identity-ui.js');
const repeat=html.indexOf('repeat-purchase-v1.js');
const frequent=html.indexOf('frequent-purchases-v1.js');
const personalized=html.indexOf('personalized-start-v1.js');
const start=html.indexOf('window.DA_COMPRAR_APP.start()');

assert.ok(identity>=0);
assert.ok(repeat>identity);
assert.ok(frequent>repeat);
assert.ok(personalized>frequent);
assert.ok(start>personalized);
assert.match(html,/personalized-start-v1\.css/);

console.log('PASS: início personalizado V1');
