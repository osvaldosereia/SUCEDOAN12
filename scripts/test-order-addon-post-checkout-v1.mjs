import fs from 'node:fs';
import assert from 'node:assert/strict';

const sf=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const root=fs.readFileSync('index.html','utf8');
const vitrine=fs.readFileSync('vitrine/index.html','utf8');
const pedido=fs.readFileSync('pedido/index.html','utf8');
const shortPage=fs.readFileSync('p/index.html','utf8');
const resilience=fs.readFileSync('checkout-resilience.js','utf8');

assert.equal(root,vitrine,'root and /vitrine storefronts must remain byte-identical');

assert.match(sf,/function randomAddonCapability|function issueOrderAddonLink/,'storefront backend must own capability issuance');
assert.match(sf,/crypto\.getRandomValues/,'write capability must use cryptographic randomness');
assert.match(sf,/new Uint8Array\(32\)/,'capability must carry at least 256 bits of randomness');
assert.match(sf,/await sha\(token\)/,'only the token hash may be sent to persistence');
assert.match(sf,/ops3_create_order_addon_session_v1/,'checkout must create add-on session through service-role RPC');
assert.match(sf,/p_order_id:orderId/,'server may bind the newly created canonical order internally');
assert.match(sf,/p_token_hash:tokenHash/,'session persistence must receive only token hash');
assert.doesNotMatch(sf,/p_token_hash:token\b/,'raw capability token must never be persisted');
assert.match(sf,/feature_disabled/,'rollout OFF must fail open without invalidating checkout');
assert.match(sf,/https:\/\/donaantonia\.com\.br\/adicionar\/#t=/,'checkout must return the quick-add URL only after safe issuance');
assert.match(sf,/order_addon_url/,'checkout response must expose optional quick-add URL');
assert.match(sf,/order_public_url_with_addon/,'checkout may attach the write capability only in a URL fragment');
assert.match(sf,/if\(orderId\).*issueOrderAddonLink/s,'capability issuance must happen only after canonical order creation');
assert.doesNotMatch(sf,/console\.(?:log|error)\([^\n]*(?:token|tokenHash)/i,'capability material must never be logged');

assert.match(root,/function orderAddonUrl\(saved\)/,'success UI must validate the returned quick-add URL');
assert.match(root,/Adicionar produtos ao mesmo pedido|Acrescentar produtos ao mesmo pedido/,'checkout success must expose the same-order CTA');
assert.match(root,/saved\?\.order_addon_url/,'CTA must depend on backend-issued capability');
assert.doesNotMatch(root,/crypto\.getRandomValues[\s\S]{0,300}order_addon/i,'browser must never mint order write capabilities');

assert.match(resilience,/order_addon_url/,'stock-adjusted checkout success must preserve quick-add CTA');
assert.match(resilience,/Adicionar produtos ao mesmo pedido|Acrescentar produtos ao mesmo pedido/,'stock-adjusted success must expose same-order CTA when eligible');

assert.match(pedido,/new URLSearchParams\(location\.hash\.replace\(\/\^#\//,''\)\)/,'public order page must read optional write capability only from fragment');
assert.match(pedido,/Adicionar produtos ao mesmo pedido|Acrescentar produtos ao mesmo pedido/,'public order page must expose quick-add CTA when capability is present');
assert.match(pedido,/current_status[^\n]*storefront_received|storefront_received[^\n]*current_status/,'public order CTA must disappear after order advances');
assert.match(pedido,/\/adicionar\/#t=/,'public order CTA must forward capability only as fragment');

assert.match(shortPage,/location\.hash/,'short public order redirect must preserve capability fragment');

console.log('PASS: post-checkout capability issuance and same-order CTA remain server-issued, optional and rollout-gated');
