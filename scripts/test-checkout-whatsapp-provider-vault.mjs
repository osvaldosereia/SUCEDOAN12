import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/admin-orders-v1/index.ts','utf8');
const sql=fs.readFileSync('supabase/sql/20261001_papoai_order_provider_vault_v1.sql','utf8');

assert.match(fn,/ops2_papoai_order_provider_url_v1/,'dispatcher must fall back to Vault RPC');
assert.match(fn,/await\s+providerUrl\(channel\)/,'dispatcher must resolve provider URL asynchronously');
assert.match(fn,/PAPOAI_ORDER_TEMPLATE_WEBHOOK_0975_URL/,'0975 env secret remains supported');
assert.match(fn,/PAPOAI_ORDER_TEMPLATE_WEBHOOK_1018_URL/,'1018 env secret remains supported');
assert.doesNotMatch(fn,/canary_dispatch/,'temporary public canary endpoint must not remain');

assert.match(sql,/vault\.decrypted_secrets/,'provider RPC must read encrypted Vault secrets');
assert.match(sql,/papoai_order_template_webhook_0975_url_v1/,'0975 Vault secret name must be fixed');
assert.match(sql,/papoai_order_template_webhook_1018_url_v1/,'1018 Vault secret name must be fixed');
assert.match(sql,/revoke all[\s\S]*anon,authenticated/i,'RPC must not be executable by client roles');
assert.match(sql,/grant execute[\s\S]*service_role/i,'RPC must be service-role only');

console.log('checkout WhatsApp provider Vault contract: OK');
