import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const edge=readFileSync(new URL('../supabase/functions/whatsapp-meta-direct-v1/index.ts',import.meta.url),'utf8');
const admin=readFileSync(new URL('../supabase/functions/admin-whatsapp-direct-v1/index.ts',import.meta.url),'utf8');
const storefront=readFileSync(new URL('../supabase/functions/storefront-v2/index.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../admin-v3/whatsapp-direct.js',import.meta.url),'utf8');

assert.match(edge,/graph\.facebook\.com/);
assert.match(edge,/META_WHATSAPP_ACCESS_TOKEN/);
assert.match(edge,/x-hub-signature-256/i);
assert.match(edge,/FINALIZAR PEDIDO/);
assert.match(edge,/WAITING_ADDRESS/);
assert.match(edge,/WAITING_LOCATION/);
assert.match(edge,/human_support/);
assert.doesNotMatch(edge,/bling/i);
assert.doesNotMatch(edge,/openai/i);
assert.doesNotMatch(edge,/cta_url/i);

assert.match(admin,/url_buttons_not_allowed/);
assert.match(admin,/category:\"UTILITY\"/);
assert.match(admin,/meta_credentials_missing/);
assert.doesNotMatch(admin,/bling/i);

assert.match(storefront,/FINALIZAR PEDIDO #\$\{value\}/);
assert.match(page,/1080/);
assert.match(page,/1920/);
assert.match(page,/logoantonia5\.png/);
assert.match(page,/quantity/);
assert.match(page,/public_phone/);
assert.doesNotMatch(page,/cta_url/i);

console.log('whatsapp-direct-meta-v1 contract: ok');
