import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const html=readFileSync('comprar/index.html','utf8');
const rootHtml=readFileSync('index.html','utf8');
const visual=readFileSync('comprar/storefront-visual-v2.css','utf8');
const product=readFileSync('comprar/product-detail-v1.css','utf8');
const checkout=readFileSync('comprar/checkout-final-v2.css','utf8');
const visualJs=readFileSync('comprar/storefront-visual-v2.js','utf8');

assert.match(html,/viewport-fit=cover/,'mobile viewport must opt in to safe-area handling');
assert.match(visual,/safe-area-inset-top/,'sticky mobile header must respect the top safe area');
assert.match(visual,/\.cart-bar\{[^}]*safe-area-inset-bottom/s,'fixed order bar must stay above the phone home indicator');
assert.match(visual,/\.timeline\{[^}]*safe-area-inset-bottom/s,'page content must leave room for the mobile safe area and fixed order bar');
assert.match(visual,/\.help-toggle\{[^}]*safe-area-inset-bottom/s,'help control must not collide with the bottom safe area');

assert.match(product,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'products must stay in two columns on mobile');
assert.match(product,/@media\(max-width:380px\)/,'narrow phones must have a dedicated compact layout');
assert.match(product,/\.product-detail-sheet\{[^}]*env\(safe-area-inset-bottom\)/s,'product detail sheet must respect bottom safe area');

assert.match(checkout,/\.checkout-v2-form input[^}]*font-size:16px/s,'checkout inputs must avoid mobile browser zoom');
assert.match(checkout,/@media\(max-width:520px\)[\s\S]*?\.checkout-v2-grid\{grid-template-columns:1fr\}/,'checkout form must become one column on phones');
assert.match(checkout,/\.checkout-v2-primary[^}]*min-height:48px/s,'primary checkout actions must have touch-friendly height');

assert.match(visualJs,/document\.querySelector\('\.checkout-v2-stage'\)/,'mobile helper must detect checkout mode');
assert.match(visualJs,/help\.classList\.toggle\('hidden',checkout\)/,'help button must be hidden while checkout is active');

// Correções críticas do WhatsApp devem furar o cache dos celulares já usados pelos clientes.
for(const [name,source,prefix] of [['Comprar',html,'\\./'],['Raiz',rootHtml,'/comprar/']]){
  assert.match(source,new RegExp(`${prefix}config\\.js\\?v=20260915-02`),`${name} must load the updated WhatsApp config with a fresh cache key`);
  assert.match(source,new RegExp(`${prefix}chat-checkout-quantity-v1\\.js\\?v=20260915-03`),`${name} must load the old-number-free checkout script with a fresh cache key`);
}

console.log('comprar_mobile_v1_contract_ok');
