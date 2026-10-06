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

  test(`${file} refuses to add a mold basket with every product removed`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /function addMoldBasketDraft\(\).*?Esta cesta ficou sem produtos\./, 'expected empty mold basket guard');
  });

  test(`${file} spaces editable basket rows and controls`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /basket-item-card/);
    assert.match(html, /basket-item-actions/);
  });
}
