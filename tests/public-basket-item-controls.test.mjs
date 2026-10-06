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

  test(`${file} lays out mold alternatives and actions compactly on wide screens and phones`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /class="basket-item-option" data-mold-option=/, 'alternative selector should have its own grid column');
    assert.match(html, /\.basket-item-mold-card\s*\{[^}]*grid-template-columns:\s*44px\s+minmax\(100px,\.9fr\)\s+minmax\(140px,1\.2fr\)\s+auto/s, 'wide cards should fit image, details, selector, and controls on one line');
    assert.match(html, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.basket-item-option\s*\{[^}]*grid-column:\s*2\s*\/\s*-1/s, 'phone selector should use a compact second row');
    assert.match(html, /\.basket-item-mold-card\s+\.basket-item-actions\s*\{\s*grid-column:\s*4/s, 'wide screen actions should share the item row');
    assert.match(html, /\.basket-item-mold-card\s+\.basket-item-actions\s*\{\s*grid-column:\s*3/s, 'phone actions should fit the three-column layout');
    assert.match(html, /\.basket-item-actions\s*\{[^}]*grid-column:\s*3/s, 'phone actions should remain beside the product name');
    assert.match(html, /\.basket-edit-list \.basket-item-card\s*\{[^}]*align-items:\s*center/s);
  });
}
