import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/order-public-view-v1/index.ts','utf8');
const page=fs.readFileSync('pedido/index.html','utf8');

assert.match(edge,/method_not_allowed/,'public endpoint must reject unsupported methods');
assert.doesNotMatch(edge,/complete_separation|checked_indexes|ops2_launch_physical_stock|ops2_set_order_separation_item_v2/i,'customer endpoint must not expose separation mutation');
assert.doesNotMatch(edge,/req\.method\s*===?\s*["']POST["']/i,'customer endpoint must not implement POST mutations');
assert.match(edge,/order_separation_items_v1/,'public endpoint must read current per-item separation state');
assert.match(edge,/order_separation_completions_v1/,'public endpoint must read completion totals');
assert.match(edge,/order_items/,'public endpoint must rebuild safe current item rows by canonical order item');
assert.match(edge,/order_number/,'public endpoint must return canonical order number');
assert.match(edge,/missing_adjustment/,'public endpoint must expose missing adjustment');
assert.match(edge,/original_total/,'public endpoint must expose original total');
assert.match(edge,/separation_state/,'public endpoint must expose per-item separation state');

assert.doesNotMatch(page,/SEPARATION_TAPS|SEPARATION_TAP_WINDOW_MS|handleProductTap|complete_separation|checked_indexes/i,'customer page must have no hidden separation gesture');
assert.doesNotMatch(page,/Concluir separa[cç][aã]o|SEPARADO<\/button>|EM FALTA<\/button>/i,'customer page must have no operational separation buttons');
assert.match(page,/Aguardando separa[cç][aã]o/i,'customer page must render pending state');
assert.match(page,/Separado/i,'customer page must render separated state');
assert.match(page,/Em falta/i,'customer page must render missing state');
assert.match(page,/missing_adjustment|Ajuste por falta/i,'customer page must show missing-value adjustment after completion');
assert.match(page,/data\.order_number|s\.order_number/i,'visible heading must use canonical order number');
assert.doesNotMatch(page,/data\.public_code\s*\|\||public_code\s*\|\|\s*s\.order_code/i,'public short code must not be the visible order number fallback');
assert.match(page,/product-card[^\n]*missing|state-missing|product-card\.missing/i,'missing products must remain visible with a distinct state');

console.log('OK · customer order storefront is read-only and shows separation progress');
