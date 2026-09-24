import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const marker='/* Dona Antônia · Vitrine Admin · Visual Standard V4 */';
const start=html.indexOf(marker);
const end=html.indexOf('</style>',start);

assert.ok(start>=0&&end>start,'visual standard V4 must exist inside style');
const css=html.slice(start,end);

assert.match(css,/--brand:#176b43/,'must use Dona Antônia brand green');
assert.match(css,/--brand-soft:#e7f3ec/,'must provide consistent brand soft state');
assert.match(css,/--canvas:#f6f8f6/,'must use shared Admin canvas');
assert.match(css,/--radius:14px/,'must use shared card radius');
assert.match(css,/--touch:44px/,'base touch target must remain 44px');
assert.match(css,/:where\(button,a,input,select,textarea\):focus-visible/,'keyboard focus must remain visible');
assert.match(css,/\.tab\.active\{background:var\(--brand-soft\)/,'active navigation must use shared visual language');
assert.match(css,/\.panel\{border:1px solid var\(--line\);border-radius:var\(--radius\)/,'panels must be standardized');
assert.match(css,/\.pill\{min-height:28px/,'status pills must be standardized');
assert.match(css,/\.ops-card\{min-height:108px/,'operational cards must keep consistent density');
assert.match(css,/dialog\{border-radius:18px/,'dialogs must use the common modal radius');
assert.match(css,/@media\(max-width:620px\)/,'phone adaptations must exist');
assert.match(css,/font-size:16px/,'phone form controls must avoid browser zoom');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/,'reduced motion must be respected');

assert.match(html,/async function renderToday\(\)/,'visual polish must preserve Today runtime');
assert.match(html,/async function renderProducts\(/,'visual polish must preserve Products runtime');
assert.match(html,/async function renderExpirations\(\)/,'visual polish must preserve Expiry runtime');
assert.match(html,/async function renderOrders\(/,'visual polish must preserve Orders runtime');

console.log('OK · Vitrine Admin Visual Standard V4: tokens, hierarchy, accessibility and responsive polish');
