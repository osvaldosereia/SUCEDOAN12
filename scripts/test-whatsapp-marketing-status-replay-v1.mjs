import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261005031500_marketing_campaign_status_replay_v1.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration de replay de status Meta de campanhas deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.marketing_accept_meta_dispatch_v1\s*\(/i,'fix deve substituir aceite Meta de campanha');
assert.match(sql,/whatsapp_webhook_events_v1/i,'aceite deve buscar webhooks Meta pendentes');
assert.match(sql,/event_type\s+like\s+['"]message\.status\.%['"]/i,'replay deve limitar eventos de status');
assert.match(sql,/status\s*=\s*['"]received['"]/i,'replay deve processar somente eventos ainda recebidos');
for(const status of ['sent','delivered','read','failed','cancelled']){
  assert.match(sql,new RegExp(`['\"]${status}['\"]`,'i'),`replay deve reconhecer status ${status}`);
}
assert.match(sql,/whatsapp_record_status_v1/i,'replay deve usar ledger canônico de status');
assert.match(sql,/set\s+status\s*=\s*['"]normalized['"]/i,'evento reaplicado deve virar normalized');
assert.match(sql,/pending_statuses_replayed/i,'resultado deve informar quantos status foram reaplicados');
assert.match(sql,/v_duplicate|duplicate/i,'aceite idempotente deve continuar capaz de replayar status pendentes');
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.marketing_accept_meta_dispatch_v1[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,'RPC deve continuar service-role only');
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.marketing_accept_meta_dispatch_v1[\s\S]*to\s+service_role/i,'RPC deve manter grant para service_role');

console.log('PASS test-whatsapp-marketing-status-replay-v1');
