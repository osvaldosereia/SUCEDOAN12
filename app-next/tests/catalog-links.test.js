import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('admin separa links do mini catálogo e do site principal', () => {
  const html = read('admin-mini-catalogo.html');
  const script = read('admin-mini-catalogo.js');
  assert.match(html, /id="campaign-target-site"/);
  assert.match(html, /data-site-filter="mini"/);
  assert.match(html, /data-site-filter="main"/);
  assert.match(html, /data-new-site="mini"/);
  assert.match(html, /data-new-site="main"/);
  assert.match(html, /Novo link do mini catálogo/);
  assert.match(html, /Novo link do site principal/);
  assert.match(script, /targetSite: raw\.targetSite === 'main'.*\? 'main' : 'mini'/);
  assert.match(script, /COUPONS_URL = 'site\/cuponsativos\.json'/);
  assert.match(script, /function resetForm\(targetSite = ''\)/);
  assert.match(script, /resetForm\(button\.dataset\.newSite\)/);
  assert.match(script, /Salvar link do site principal/);
});

test('redirecionador mantém links antigos no mini catálogo', () => {
  const redirect = read('c/index.html');
  assert.match(redirect, /targetSite === 'main'.*\? 'main' : 'mini'/);
  assert.match(redirect, /complemente\/\$\{destinationHash\(campaign\)\}/);
});

test('site principal valida cupom no cadastro oficial', () => {
  const main = read('app-next/src/main.js');
  const commerce = read('app-next/src/commerce.js');
  assert.match(main, /route\?\.query\?\.get\('cupom'\)/);
  assert.match(main, /cart\.activateCoupon\(code\)/);
  assert.match(commerce, /getCouponByCode\(state\.coupons, code\)/);
  assert.match(commerce, /couponIsValid\(coupon\)/);
});
