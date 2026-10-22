import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const legacyVitrine = readFileSync(new URL('../vitrine/index.html', import.meta.url), 'utf8');

test('root storefront exposes explicit remove control for editable basket items', () => {
  assert.match(html, /data-b-remove=/, 'expected explicit basket remove control');
  assert.match(html, /Remover produto da cesta/, 'expected accessible remove label');
});

test('root storefront keeps basket quantity increment/decrement controls', () => {
  assert.match(html, /data-b-dec=/);
  assert.match(html, /data-b-inc=/);
});

test('root storefront makes mold baskets editable too', () => {
  assert.match(html, /data-mold-dec=/, 'expected mold decrement control');
  assert.match(html, /data-mold-inc=/, 'expected mold increment control');
  assert.match(html, /data-mold-remove=/, 'expected explicit mold remove control');
  assert.match(html, /function changeMoldQty\(/, 'expected mold quantity behavior');
  assert.doesNotMatch(html, /As quantidades do molde permanecem fixas\./);
});

test('root storefront spaces editable basket rows and controls', () => {
  assert.match(html, /basket-item-card/);
  assert.match(html, /basket-item-actions/);
});

test('mold products render as vertical choice cards with quantity and selected price below', () => {
  const optionRenderer = html.match(/function moldItemOptions\([\s\S]*?(?=function moldExtraThemeRow)/)?.[0];
  const itemRenderer = html.match(/function moldItemRow\([\s\S]*?(?=function changeMoldQty)/)?.[0];
  assert.ok(optionRenderer, 'expected mold product option renderer');
  assert.ok(itemRenderer, 'expected mold basket item renderer');
  assert.match(optionRenderer,/basket-option-carousel-track/);
  assert.match(optionRenderer,/data-mold-option-track=/);
  assert.match(optionRenderer,/data-mold-option-choice=/);
  assert.match(optionRenderer,/safeImage\(a\.image_url\)/);
  assert.match(optionRenderer,/money\(a\.price_cents\)/);
  assert.match(html,/scroll-snap-type:x mandatory/);
  assert.match(html,/overflow-x:auto/);
  assert.match(html,/\.basket-option-choice\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(optionRenderer,/choicesList\.sort\(\(a,b\)=>Number\(a\.price_cents/);
  assert.doesNotMatch(optionRenderer,/data-mold-brand-toggle|Clique para trocar este produto/);
  assert.match(itemRenderer,/moldItemOptions\(x,i,pending\)/);
  assert.match(itemRenderer,/basket-selected-product-price[\s\S]*?money\(selected\.price_cents/);
  assert.ok(itemRenderer.indexOf('moldItemOptions(x,i,pending)') < itemRenderer.indexOf('data-mold-inc='), 'quantity controls must render after the carousel');
  assert.match(itemRenderer,/data-mold-dec=/);
  assert.match(itemRenderer,/data-mold-inc=/);
  assert.match(html,/return moldItemRow\(\{\.\.\.item,base_quantity:qty,quantity:qty,alternatives:\[\],alternatives_loaded:false,alternative_count:Number\(item\.alternative_count\|\|0\)\},i,true\)/,'opening preview keeps all controls safely disabled while stock is refreshing');
  assert.match(html,/function loadMoldOptions\(/);
  assert.match(html,/await api\('basket_mold_options'/);
  assert.match(html,/data-mold-option-load=/);
  assert.match(html,/carouselScroll=new Map/);
  assert.match(html,/\.basket-edit-list \.basket-item-card\s*\{[^}]*grid-template-columns:\s*86px\s+minmax\(0,1fr\)/s);
  assert.match(html,/\.basket-edit-list \.basket-item-mold-card\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)!important/s,'mold cards override the higher-specificity legacy basket grid on desktop');
  assert.match(html,/\.sheet-inner\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(html,/\.sheet-scroll\s*\{[^}]*min-height:\s*0/s);
  assert.match(html,/\.basket-hero-compact\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('/vitrine/ redirects to the canonical root without a duplicate storefront', () => {
  assert.match(legacyVitrine,/<meta http-equiv="refresh" content="0;url=\/">/);
  assert.match(legacyVitrine,/window\.location\.replace\('\/'\+window\.location\.search\+window\.location\.hash\)/);
  assert.doesNotMatch(legacyVitrine,/data-b-remove=|basket-item-card|checkoutWhatsappUnified|submit_order/);
});

test('optional product carousel stays inside the basket modal and scrolls horizontally', () => {
  assert.match(html, /\.basket-extras\{[^}]*grid-template-columns:minmax\(0,1fr\)/, 'the extras grid must not size itself to the full product row');
  assert.match(html, /\.basket-extra-theme\{[^}]*min-width:0/, 'theme cards must be allowed to shrink inside the modal');
  assert.match(html, /\.basket-extra-products\{[^}]*width:100%;min-width:0;max-width:100%;[^}]*overflow-x:auto/, 'the product row must be constrained and horizontally scrollable');
  assert.match(html, /\.basket-extra-product\{[^}]*flex:0 0 150px/, 'product cards must remain fixed-width carousel items');
});
