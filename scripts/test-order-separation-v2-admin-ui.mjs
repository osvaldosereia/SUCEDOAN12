import assert from 'node:assert/strict';
import fs from 'node:fs';

const htmlPath='vitrine/admin/separacao/index.html';
const jsPath='vitrine/admin/separacao/separation.js';
assert.ok(fs.existsSync(htmlPath),`missing ${htmlPath}`);
assert.ok(fs.existsSync(jsPath),`missing ${jsPath}`);
const html=fs.readFileSync(htmlPath,'utf8');
const js=fs.readFileSync(jsPath,'utf8');

assert.match(html,/Separação do pedido/i,'page must identify the operational separation context');
assert.match(html,/id="orderNumber"/,'page must render canonical order number');
assert.match(html,/id="items"/,'page must render separation items');
assert.match(html,/id="completeSeparation"/,'page must own the Admin-only completion button');
assert.match(html,/CONCLUIR SEPARA[CÇ][AÃ]O/i,'completion copy must be explicit');

assert.match(js,/da_finance_access_token_v1/,'page must reuse the existing Admin session token');
assert.match(js,/admin-products-live-v1/,'page must use the canonical Admin gateway');
assert.match(js,/order_separation_get/,'page must read canonical separation state');
assert.match(js,/order_separation_item_set/,'page must persist per-item state');
assert.match(js,/order_separation_complete/,'page must complete through the Admin API');
assert.match(js,/expected_order_updated_at/,'writes must carry the optimistic order version');
assert.match(js,/separator_key/,'writes must carry the active separator when known');

assert.match(js,/SEPARADO/,'each item must expose a SEPARADO button');
assert.match(js,/EM FALTA/,'each item must expose an EM FALTA button');
assert.doesNotMatch(js,/SEPARATION_TAPS|handleProductTap|dblclick|double.?tap/i,'Admin storefront must not use hidden tap gestures');
assert.match(js,/pending[^\n]*===?\s*0|counts\?\.pending[^\n]*===?\s*0/i,'completion must require zero pending items');
assert.match(js,/missing_subtotal|missingAmount/i,'completion confirmation must summarize missing amount');
assert.match(js,/final_total|finalTotal/i,'completion confirmation must summarize final total');
assert.match(js,/separated[^\n]*missing|missing[^\n]*separated/i,'completion confirmation must include separated/missing counts');
assert.match(js,/409|stale_order_version|order_version_conflict/i,'stale two-device writes must reload instead of overwriting silently');
assert.match(js,/location\.reload|loadSeparation\(/i,'conflict handling must reload canonical server state');
assert.match(js,/data\.order_number|separation\.order_number/i,'page must display canonical orders.order_number');
assert.doesNotMatch(js,/public_code/i,'Admin separation page must not display public short code as order number');

console.log('OK · dedicated Admin separation storefront contract');
