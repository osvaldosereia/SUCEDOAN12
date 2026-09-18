import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const html=readFileSync('comprar/index.html','utf8');
const rootHtml=readFileSync('index.html','utf8');
const css=readFileSync('comprar/styles.css','utf8');
const help=readFileSync('comprar/help.js','utf8');

assert.match(html,/viewport-fit=cover/,'mobile viewport must opt in to safe-area handling');
assert.match(css,/\.cart-bar\{[^}]*env\(safe-area-inset-bottom\)/s,'fixed order bar must stay above the phone home indicator');
assert.match(css,/\.products-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s,'products must stay in two columns on mobile');
assert.match(css,/@media\(max-width:420px\)/,'narrow phones must have a dedicated compact layout');
assert.match(css,/@media\(max-width:420px\)[\s\S]*?\.checkout-grid\{grid-template-columns:1fr\}/,'checkout form must become one column on narrow phones');
assert.match(css,/\.actions button,\.primary,\.secondary,\.confirm\{min-height:44px/,'primary actions must remain touch friendly');
assert.match(css,/\.products-filter-sticky\{[^}]*position:sticky/s,'mobile product filters must remain sticky');
assert.match(css,/\.chips-subcategories \.chip\{[^}]*font-size:12px/s,'subcategory chips must remain compact on phones');
assert.match(help,/setCheckoutMode/,'simple help must expose explicit checkout mode');
assert.match(help,/classList\.toggle\('hidden',checkoutMode\)/,'help button must hide explicitly during checkout');

for(const [name,source,prefix] of [['Comprar',html,'\\./'],['Raiz',rootHtml,'/comprar/']]){
  for(const file of ['config','app','baskets','products','checkout','help','admin-test-bridge']){
    assert.match(source,new RegExp(`${prefix}${file}\\.js\\?v=[^\"']+`),`${name} must load ${file} with the clean cache key`);
  }
  assert.match(source,new RegExp(`${prefix}styles\\.css\\?v=[^\"']+`),`${name} must load consolidated CSS with the clean cache key`);
}

console.log('comprar_mobile_v1_contract_ok');
