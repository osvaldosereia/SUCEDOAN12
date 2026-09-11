import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync('supabase/migrations/20260911012500_whatsapp_flow_v32_live_session_audit_v2.sql', 'utf8');

assert.match(sql, /get_whatsapp_flow_v32_live_session_audit_v2/);
assert.match(sql, /get_whatsapp_flow_v31_live_session_audit_v1/);
assert.match(sql, /flow-cestas-comercial-v8-stable/);
assert.match(sql, /whatsapp_flow_exchange_events/);
assert.match(sql, /whatsapp_flow_request_guard/);
assert.match(sql, /response_payload is not null and response_cached_at is not null/);
assert.match(sql, /historical_error_count/);
assert.match(sql, /post_v32_error_count/);
assert.match(sql, /replay_cache_observed/);
assert.match(sql, /replay_cache_coverage_complete/);
assert.match(sql, /v_current_screen='PERSONALIZAR'/);
assert.match(sql, /CUSTOMIZE_OR_CONTINUE/);
assert.match(sql, /SECTION_TERM_DIRECT_SEARCH_OR_FINISH/);
assert.match(sql, /NFM_REPLY_OR_LOCATION/);
assert.match(sql, /current_runtime_ok/);
assert.match(sql, /pii_returned[^\n]*false/);
assert.match(sql, /writes_executed[^\n]*false/);
assert.match(sql, /revoke all on function public\.get_whatsapp_flow_v32_live_session_audit_v2\(uuid\) from public,anon,authenticated/);
assert.match(sql, /grant execute on function public\.get_whatsapp_flow_v32_live_session_audit_v2\(uuid\) to service_role/);
assert.doesNotMatch(sql, /\binsert\s+into\b/i);
assert.doesNotMatch(sql, /\bupdate\s+public\./i);
assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
assert.doesNotMatch(sql, /customer_name|phone|street|address_summary|locator_value/i);

console.log('V32 live session audit contract: ok');
