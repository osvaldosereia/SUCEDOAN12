import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('supabase/functions/order-addon-public-v1/index.ts','utf8');
const page=fs.readFileSync('adicionar/index.html','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

assert.match(config,/\[functions\.order-addon-public-v1\][\s\S]*verify_jwt\s*=\s*false/i,'public capability gateway must be explicitly configured');

assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/,'gateway must keep privileged DB access server-side');
assert.match(edge,/crypto\.subtle\.digest\(["']SHA-256["']/i,'raw capability token must be SHA-256 hashed in the Edge Function');
assert.match(edge,/ops3_get_order_addon_session_v1/,'every public session must be validated through the service-role RPC');
assert.match(edge,/ops3_add_items_to_existing_order_v1/,'mutation must delegate to the atomic same-order RPC');
assert.doesNotMatch(edge,/p_order_id|order_id\s*:/i,'gateway must never forward browser-controlled order_id to the mutation');
assert.match(edge,/consume_public_rate_limit/,'gateway must be rate limited');
assert.match(edge,/donaantonia\.com\.br/,'CORS must be restricted to Dona Antônia origins');
assert.match(edge,/Cache-Control[^\n]*no-store/i,'capability responses must never be cached');
assert.match(edge,/X-Robots-Tag[^\n]*noindex/i,'capability responses must remain non-indexable');

assert.match(edge,/action===["']session["']/,'safe session read action required');
assert.match(edge,/action===["']products["']/,'token-bound product listing required');
assert.match(edge,/action===["']add_items["']/,'token-bound add-items action required');
assert.match(edge,/\.from\(["']products["']\)/,'catalog rows must come from canonical products');
assert.match(edge,/ops2_loose_sellable_stock_v1/,'listing must filter through canonical loose sellable stock');
assert.match(edge,/offer_price/,'listing must expose canonical offer price when applicable');
assert.doesNotMatch(edge,/customer_snapshot|delivery_address|phone_e164|cpf|cnpj/i,'quick-add gateway must not expose customer PII');

assert.match(page,/name="robots" content="noindex,nofollow,noarchive"/i,'quick storefront must not be indexed');
assert.match(page,/name="referrer" content="no-referrer"/i,'capability token must not leak through referrers');
assert.match(page,/Acrescentar ao pedido|Adicionar ao pedido/i,'same-order intent must be explicit');
assert.match(page,/order-addon-public-v1/,'page must use dedicated capability gateway');
assert.match(page,/URLSearchParams/,'page must read its capability token from URL');
assert.match(page,/crypto\.randomUUID/,'browser must generate idempotency request keys');
assert.match(page,/product_id[^\n]*quantity|quantity[^\n]*product_id/i,'browser payload must contain only product identity and quantity');
assert.doesNotMatch(page,/order_id\s*:/i,'browser add-items payload must never send order_id');
assert.doesNotMatch(page,/body:\{action:'add_items'[\s\S]{0,500}(?:unit_price|price|total)\s*:/i,'browser mutation payload must never send trusted financial values');
assert.match(page,/Adicionar ao mesmo pedido|Adicionar ao pedido/i,'CTA must make same-order behavior clear');
assert.match(page,/@media\(max-width:640px\)/i,'mobile-specific layout required');
assert.match(page,/position:sticky|position:fixed/i,'mobile action summary must remain reachable');

console.log('PASS: quick-add public storefront is capability-bound, no-PII, mobile-first and same-order safe');
