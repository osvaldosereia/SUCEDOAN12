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

test('root storefront renders a swipeable carousel ordered by price with compact product names', () => {
  assert.match(html,/class="basket-item-option" data-mold-option-wrap=/);
  assert.match(html,/class="basket-option-grid basket-option-carousel-track"/);
  assert.match(html,/data-mold-option-track=/);
  assert.match(html,/data-mold-option-arrow=/);
  assert.match(html,/scroll-snap-type:x mandatory/);
  assert.match(html,/overflow-x:auto/);
  assert.match(html,/scrollBy\(\{left:/);
  assert.match(html,/carouselScroll=new Map/);
  assert.match(html,/\.basket-item-mold-card \.checkout-copy \.checkout-name\{font-size:11\.3px/);
  assert.match(html,/\.basket-item-mold-card \.basket-option-grid\.basket-option-carousel-track/);
  assert.match(html,/\.basket-option-choice-price/);
  assert.match(html,/safeImage\(a\.image_url\)/);
  assert.doesNotMatch(html,/<select class="basket-item-option"/);
  assert.match(html,/\.basket-edit-list \.basket-item-card\s*\{[^}]*grid-template-columns:\s*86px\s+minmax\(0,1fr\)/s);
  assert.match(html,/\.basket-item-mold-card\s*\{[^}]*grid-template-columns:\s*(?:86px|clamp\([^)]*\))\s+minmax\(0,1fr\)\s+auto/s);
  assert.match(html,/@media\s*\(max-width:\s*760px\)[\s\S]*?\.basket-item-option\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*grid-row:\s*3/s);
  assert.match(html,/\.sheet-inner\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(html,/\.sheet-scroll\s*\{[^}]*min-height:\s*0/s);
  assert.match(html,/\.basket-hero-compact\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('root storefront initially hides alternative brands behind an accessible disclosure button', () => {
  assert.match(html,/data-mold-brand-toggle=/);
  assert.match(html,/Clique para trocar este produto/);
  assert.match(html,/data-mold-brand-toggle=.*aria-expanded=/);
  assert.match(html,/data-mold-brand-panel=/);
  assert.match(html,/\+\(expanded\?'':'hidden'\)/);
  assert.match(html,/\.basket-brand-panel\[hidden\]\{display:none!important\}/);
  assert.match(html,/const details=!expanded\?'':/);
  assert.match(html,/await api\('basket_mold_options'/);
  assert.match(html,/Carregando marcas…/);
  assert.match(html,/paintMoldBasketSheet\(\)/);
  assert.match(html,/d\.openOptionIndices\.add\(index\)/);
  assert.match(html,/d\.openOptionIndices\.delete\(index\)/);
  assert.match(html,/moldItemRow\(x,i,d\.openOptionIndices\?\.has\(i\)===true\)/);
  assert.match(html,/if\(count<=1\)return '';/);
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
