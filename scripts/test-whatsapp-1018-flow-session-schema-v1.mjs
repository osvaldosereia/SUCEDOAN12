import assert from 'node:assert/strict';
import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/20261013_whatsapp_1018_flow_sessions_v1.sql','utf8');
const mirror=fs.readFileSync('supabase/sql/20261013_whatsapp_1018_flow_sessions_v1.sql','utf8');
assert.equal(migration,mirror,'migration and SQL mirror must match');
for(const text of [
 'private.whatsapp_1018_flow_sessions_v1','flow_token_sha256 text not null unique',
 'inbound_message_id text unique','status in (\'pending\',\'consumed\',\'expired\',\'cancelled\')',
 "interval '30 minutes'",'for update','session_already_consumed','replayed',
 "slug='dona-antonia-1018'","phone_e164='+5565984491018'",
 "auth.role() is distinct from 'service_role'",
 'ops2_1018_flow_session_register_v1','ops2_1018_flow_session_consume_v1',
 'release_generation bigint not null',"mode='pilot' for share",
 'pilot_rolled_back_or_changed','pilot_not_active_or_generation_changed',
 'revoke all on function','grant execute on function'
])assert.ok(migration.includes(text),text);
assert.doesNotMatch(migration,/grant (?:all|execute) on .* to (?:anon|authenticated)/i);
assert.doesNotMatch(migration,/create trigger|http_post|net\.http|whatsapp-ana-worker-v1/i);
console.log('PASS: private 1018 Flow session schema and idempotent consume SQL contract');
