import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('checkout item rows keep full width while only thumbnails receive fixed dimensions', () => {
  assert.match(styles, /\.checkout-row\s*\{[^}]*display:flex[^}]*width:100%/);
  assert.match(styles, /\.checkout-row img\s*\{[^}]*width:92px[^}]*height:92px/);
  assert.doesNotMatch(styles, /\.checkout-row\s*,\s*\.checkout-row img\s*\{/);
});

test('checkout shows compact quantity controls for basket components and removes noisy labels', () => {
  assert.match(app, /data-component-cart-qty=/);
  assert.match(app, /data-cart-qty=/);
  assert.doesNotMatch(app, /Incluído na cesta/);
  assert.match(styles, /\.component-row\{[^}]*padding:12px 0/);
  assert.match(styles, /\.qty-compact\{[^}]*flex:none/);
});

test('product cards swap add action for a visible cart quantity stepper', () => {
  assert.match(app, /product-card-qty/);
  assert.match(app, /data-product-qty=/);
  assert.match(app, /toast\('Adicionado'\)/);
  assert.doesNotMatch(app, /\$\{product\.name\} adicionado/);
});
