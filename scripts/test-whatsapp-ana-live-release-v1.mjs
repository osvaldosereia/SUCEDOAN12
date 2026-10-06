import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261006120000_whatsapp_ana_live_send_v1.sql','utf8');
const sqlMirror=fs.readFileSync('supabase/sql/20261006_whatsapp_ana_live_send_v1.sql','utf8');
const worker=fs.readFileSync('supabase/functions/whatsapp-ana-worker-v1/index.ts','utf8');
const webhook=fs.readFileSync('supabase/functions/whatsapp-meta-webhook-v1/index.ts','utf8');
const policy=fs.readFileSync('supabase/functions/_shared/ana-live-policy-v1.mjs','utf8');

assert.equal(sqlMirror,migration,'deployable migration and SQL reference copy must match');
for(const name of ['ops2_ana_enqueue_live_job_v1','ops2_ana_claim_live_v1','ops2_ana_begin_live_send_v1','ops2_ana_accept_live_outbound_v1','ops2_ana_finish_live_job_v1','ops2_ana_fail_live_send_v1'])
  assert.match(migration,new RegExp(`create or replace function public\\.${name}`,'i'),`${name} must exist`);
assert.match(migration,/ana_enabled is not true[\s\S]*send_enabled is not true/i,'live enqueue must respect channel kill switches');
assert.match(migration,/outbound_provider is distinct from 'meta'/i,'live sends must only use the homologated Meta provider');
assert.match(migration,/interval '24 hours'/i,'live sends must respect the WhatsApp service window');
assert.match(migration,/purpose,message_type,payload,provider,status,metadata[\s\S]*'ai_attendance'/i,'outbox must be typed as an AI attendance send');
assert.match(migration,/sender_kind,sender_ref,sent_at,metadata[\s\S]*'ana_ai','ana'/i,'canonical outbound must be recorded as ANA, never human');
assert.match(migration,/revoke all on function public\.ops2_ana_enqueue_live_job_v1\(uuid\) from public,anon,authenticated/i,'live enqueue RPC must not be public');
assert.match(policy,/score>=minConfidence/,'automatic send must require the high-confidence threshold');
assert.match(worker,/shouldSendAnaLiveReply/,'worker must apply live-send confidence policy');
assert.match(worker,/ops2_attendance_ai_gate_v1[\s\S]*generateAnaDryRunSuggestion[\s\S]*ops2_attendance_ai_gate_v1[\s\S]*ops2_ana_begin_live_send_v1/i,'worker must check human control before and after generation and before send');
assert.match(worker,/sendTextViaMeta/,'live worker must use the existing Meta transport');
assert.match(worker,/ops2_ana_accept_live_outbound_v1/,'live worker must persist Meta acceptance canonically');
assert.match(webhook,/ops2_ana_enqueue_live_job_v1/,'Meta inbound must enqueue ANA work');
assert.match(webhook,/EdgeRuntime\.waitUntil/,'ANA response generation must not block the Meta webhook acknowledgment');
assert.match(webhook,/mode:\s*"live"/,'Meta webhook must invoke live worker mode');

console.log('PASS test-whatsapp-ana-live-release-v1');
