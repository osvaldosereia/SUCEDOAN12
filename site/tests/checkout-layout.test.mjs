import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('checkout item rows keep full width while only thumbnails receive fixed dimensions', () => {
  assert.match(styles, /\.checkout-row\s*\{[^}]*display:flex[^}]*width:100%/);
  assert.match(styles, /\.checkout-row img\s*\{[^}]*width:92px[^}]*height:92px/);
  assert.doesNotMatch(styles, /\.checkout-row\s*,\s*\.checkout-row img\s*\{/);
});
