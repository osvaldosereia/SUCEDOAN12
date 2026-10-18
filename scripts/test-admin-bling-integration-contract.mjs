import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
function section(a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return s.slice(i,j)}
const bridge=section('async function hub(','async function ops2LiveRuntime(');
const gate=section('async function ops2LiveRuntime(','async function postCutoverOrder(');
const sync=section('async function syncConfirmedOrderToBling(','async function ');
const oauth=section('async function blingOauthBegin(','async function blingStatusCatalogProbe(');
for(const p of [/get_bling_hub_key_v2/,/AbortSignal\.timeout\(120000\)/,/bling_bridge_not_configured/,/bling_reauthentication_required/,/invalid_bling_response/])assert.match(bridge,p);
for(const p of [/hub_enabled/,/orders_enabled/,/stock_enabled/,/webhooks_enabled/,/ops2_live_cutover_at/])assert.match(gate,p);
for(const p of [/postCutoverOrder/,/ops2_ensure_order_state/,/review_bling/,/enqueue_job/,/sync_order_status/,/idempotency_key:"ops2:live-order-state-retry:"/,/ops_open_attention_v1/,/order_bling_sync_failed/])assert.match(sync,p);
for(const p of [/auth\?\.role!=="owner"/,/get_bling_api_credentials_v1/,/crypto\.randomUUID/,/sha256Hex\(state\)/,/10\*60\*1000/,/nonce_sha256/,/merge_bling_hub_runtime_metadata_v2/])assert.match(oauth,p);
console.log('Admin Bling sync auth retry and error contract: PASS');
