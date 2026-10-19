import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/admin-orders-v1/index.ts','utf8');
assert.match(fn,/sendTemplateViaMeta/,'current checkout dispatcher must use the canonical Meta transport');
assert.match(fn,/META_WHATSAPP_ACCESS_TOKEN/,'Meta access token remains server-side');
assert.match(fn,/META_WHATSAPP_GRAPH_VERSION/,'Meta Graph version remains server-side');
assert.match(fn,/ORDER_TEMPLATE_BY_CHANNEL/,'the approved template is selected by canonical channel');
assert.doesNotMatch(fn,/ops2_papoai_order_provider_url_v1/,'current checkout must not call the retired PapoAI Vault provider');
assert.doesNotMatch(fn,/PAPOAI_ORDER_TEMPLATE_WEBHOOK_(0975|1018)_URL/,'current checkout must not use legacy arbitrary webhooks');
assert.doesNotMatch(fn,/canary_dispatch/,'temporary public canary endpoint must not remain');

console.log('checkout Meta provider boundary contract: OK');
