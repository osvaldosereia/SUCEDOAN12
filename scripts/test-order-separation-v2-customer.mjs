import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/order-public-view-v1/index.ts','utf8');
const page=fs.readFileSync('pedido/index.html','utf8');
const shortPage=fs.readFileSync('p/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20261003201103_order_separation_v2.sql','utf8');

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

// Backward compatibility: orders created before V2 have no separation rows.
assert.match(edge,/legacySeparated=\["ready","out_for_delivery","delivered"\]\.includes\(String\(currentStatus\|\|""\)\)/,'legacy terminal/in-flight orders must be treated as already separated for display');
assert.match(edge,/state\?\.state\|\|\s*\(legacySeparated\?"separated":"pending"\)/,'pre-V2 confirmed/processing orders without separation rows must present as pending, not mutate history');
assert.doesNotMatch(edge,/ops2_init_order_separation_v2/,'public read path must never initialize editable separation state');
assert.match(migration,/if v_order\.status in \('confirmed','processing'\)[\s\S]*ops2_init_order_separation_v2/i,'only confirmed/processing orders may be initialized into editable separation');
assert.doesNotMatch(migration,/v_order\.status in \([^)]*ready[^)]*\)[\s\S]{0,240}ops2_init_order_separation_v2/i,'ready/out_for_delivery/delivered orders must never be moved back into editable separation');

// Completion is additive: missing state/adjustment comes from V2 rows while original purchase identity survives.
assert.match(edge,/completion\?\.original_total\?\?originalSnapshot\.total\?\?currentTotal/,'pre-V2 order without completion must keep original total');
assert.match(edge,/completion\?\.missing_subtotal\?\?0/,'pre-V2 order without completion must have zero missing adjustment');
assert.match(edge,/order_number:canonicalOrderNumber/,'completed or legacy orders must keep orders.order_number as visible identity');
assert.match(edge,/public_code:row\.public_code/,'public routing code must remain available only as routing metadata');
assert.match(shortPage,/\/pedido\/\?k=/,'existing short-link token route must continue redirecting to the customer order page');

assert.doesNotMatch(page,/SEPARATION_TAPS|SEPARATION_TAP_WINDOW_MS|handleProductTap|complete_separation|checked_indexes/i,'customer page must have no hidden separation gesture');
assert.doesNotMatch(page,/Concluir separa[cç][aã]o|SEPARADO<\/button>|EM FALTA<\/button>/i,'customer page must have no operational separation buttons');
assert.match(page,/Aguardando separa[cç][aã]o/i,'customer page must render pending state');
assert.match(page,/Separado/i,'customer page must render separated state');
assert.match(page,/Em falta/i,'customer page must render missing state');
assert.match(page,/missing_adjustment|Ajuste por falta/i,'customer page must show missing-value adjustment after completion');
assert.match(page,/data\.order_number|s\.order_number/i,'visible heading must use canonical order number');
assert.doesNotMatch(page,/data\.public_code\s*\|\||public_code\s*\|\|\s*s\.order_code/i,'public short code must not be the visible order number fallback');
assert.match(page,/product-card[^\n]*missing|state-missing|product-card\.missing/i,'missing products must remain visible with a distinct state');

console.log('OK · customer order storefront is read-only, backward compatible and shows separation progress');
