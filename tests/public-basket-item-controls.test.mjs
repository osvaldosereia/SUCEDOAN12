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

  test(`${file} keeps mold basket cards comfortable and horizontal on phones`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /class="basket-item-option" data-mold-option=/, 'alternative selector should have its own grid column');
    assert.match(html, /\.basket-edit-list \.basket-item-card\s*\{[^}]*grid-template-columns:\s*68px\s+minmax\(0,1fr\)/s, 'cards should give the product photo meaningful width on desktop');
    assert.match(html, /\.basket-edit-list \.basket-item-card \.checkout-thumb\s*\{[^}]*width:\s*64px[^}]*height:\s*64px/s, 'product photo should remain large and square');
    assert.match(html, /\.basket-item-mold-card\s*\{[^}]*grid-template-columns:\s*68px\s+minmax\(160px,\.9fr\)\s+minmax\(180px,1\.1fr\)\s+auto/s, 'wide cards should place image, details, selector, and actions in one row');
    assert.match(html, /\.basket-item-actions \.checkout-qty\s*\{[^}]*grid-template-columns:\s*44px\s+32px\s+44px[^}]*overflow:\s*visible/s, 'quantity buttons must not shrink or clip the minus glyph');
    assert.match(html, /\.basket-item-actions \.checkout-qty button\s*\{[^}]*min-width:\s*44px[^}]*height:\s*44px/s, 'quantity controls should have comfortable touch targets');
    assert.match(html, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.basket-edit-list \.basket-item-card\s*\{[^}]*grid-template-columns:\s*68px\s+minmax\(0,1fr\)/s, 'narrow cards should keep a large photo with a two-column horizontal layout');
    assert.match(html, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.basket-item-mold-card \.basket-item-actions\s*\{[^}]*grid-column:\s*2[^}]*grid-row:\s*2/s, 'narrow controls should occupy their own row beside the photo');
    assert.match(html, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.basket-item-option\s*\{[^}]*grid-column:\s*2\s*\/\s*-1[^}]*grid-row:\s*3/s, 'narrow alternative selector should stay available on a quiet third row');
    assert.match(html, /\.sheet-inner\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s, 'sheet should keep the action bar outside the scrolling region');
    assert.match(html, /\.sheet-scroll\s*\{[^}]*min-height:\s*0/s, 'scroll area should shrink above the fixed action bar instead of covering content');
  });
}
