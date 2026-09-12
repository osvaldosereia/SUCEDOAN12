import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20260912131700_whatsapp_flow_v67_atomic_terminal_handoff_claim.sql', import.meta.url), 'utf8').toLowerCase();

assert.match(sql, /returning id into v_claimed_session_id/);
assert.match(sql, /v_homologation_no_order:=v_claimed_session_id is not null/);
assert.match(sql, /no_order_handoff_claimed_atomically/);
assert.match(sql, /revoke all on function public\.process_whatsapp_flow_nfm_reply_legacy_v1\(uuid,uuid,jsonb\) from public,anon,authenticated/);
assert.match(sql, /grant execute on function public\.process_whatsapp_flow_nfm_reply_legacy_v1\(uuid,uuid,jsonb\) to service_role/);
assert.match(sql, /whatsapp_live_canary_percent,0\)=1/);
assert.match(sql, /not coalesce\(a\.experience_orchestrator_enabled,false\)/);
assert.match(sql, /not coalesce\(a\.whatsapp_flow_data_exchange_enabled,false\)/);
assert.match(sql, /not coalesce\(a\.whatsapp_flow_send_enabled,false\)/);
assert.match(sql, /not coalesce\(a\.whatsapp_flow_commercial_write_enabled,false\)/);
assert.match(sql, /not coalesce\(a\.bling_order_sync_enabled,false\)/);

console.log('PASS v67 atomic terminal handoff contract');
