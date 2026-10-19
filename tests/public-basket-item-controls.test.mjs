import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = ['index.html', 'vitrine/index.html'];

for (const file of files) {
  test(`${file} exposes explicit remove control for editable basket items`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /data-b-remove=/, 'expected explicit basket remove control');
    assert.match(html, /Remover produto da cesta/, 'expected accessible remove label');
  });

  test(`${file} keeps basket quantity increment/decrement controls`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /data-b-dec=/);
    assert.match(html, /data-b-inc=/);
  });

  test(`${file} makes mold baskets editable too`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /data-mold-dec=/, 'expected mold decrement control');
    assert.match(html, /data-mold-inc=/, 'expected mold increment control');
    assert.match(html, /data-mold-remove=/, 'expected explicit mold remove control');
    assert.match(html, /function changeMoldQty\(/, 'expected mold quantity behavior');
    assert.doesNotMatch(html, /As quantidades do molde permanecem fixas\./);
  });

  test(`${file} spaces editable basket rows and controls`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /basket-item-card/);
    assert.match(html, /basket-item-actions/);
  });

  test(`${file} renders a swipeable carousel ordered by price with compact product names`, () => {
    const html=readFileSync(new URL(`../${file}`, import.meta.url),'utf8');
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
    assert.match(html,/\.basket-item-mold-card\s*\{[^}]*grid-template-columns:\s*86px\s+minmax\(0,1fr\)\s+auto/s);
    assert.match(html,/@media\s*\(max-width:\s*760px\)[\s\S]*?\.basket-item-option\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*grid-row:\s*3/s);
    assert.match(html,/\.sheet-inner\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
    assert.match(html,/\.sheet-scroll\s*\{[^}]*min-height:\s*0/s);
    assert.match(html,/\.basket-hero-compact\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });
}
