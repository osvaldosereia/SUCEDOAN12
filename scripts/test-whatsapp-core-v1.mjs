import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const sqlPath = path.join(root, 'supabase/sql/20260930_whatsapp_meta_native_core_v1.sql');
assert.ok(fs.existsSync(sqlPath), 'core SQL migration must exist');
const extraPaths = [
  path.join(root, 'supabase/sql/20261001_whatsapp_meta_native_core_indexes_v1.sql'),
  path.join(root, 'supabase/sql/20261001_whatsapp_meta_native_timestamp_guard_v1.sql'),
];
const sql = fs.readFileSync(sqlPath, 'utf8') + '\n' + extraPaths.filter(fs.existsSync).map(p=>fs.readFileSync(p,'utf8')).join('\n');

const tables = [
  'whatsapp_channel_runtime_v1','whatsapp_webhook_events_v1','whatsapp_messages_v1',
  'whatsapp_message_status_events_v1','whatsapp_media_v1','whatsapp_templates_v1',
  'whatsapp_outbox_v1','marketing_optout_events_v2',
];
for (const table of tables) {
  assert.match(sql, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`, 'i'), `${table} must be created`);
  assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'), `${table} must enable RLS`);
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon\\s*,\\s*authenticated`, 'i'), `${table} must revoke anon/authenticated`);
}

for (const fn of ['whatsapp_resolve_conversation_v1','whatsapp_ingest_event_v1','whatsapp_record_status_v1','whatsapp_enqueue_outbound_v1']) {
  assert.match(sql, new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i'), `${fn} RPC must exist`);
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}`, 'i'), `${fn} must not be public`);
}

assert.match(sql, /unique\s*\(\s*provider\s*,\s*whatsapp_account_id\s*,\s*provider_event_id\s*\)/i, 'webhook provider event idempotency key required');
assert.match(sql, /unique\s*\(\s*whatsapp_account_id\s*,\s*provider\s*,\s*provider_message_id\s*\)/i, 'message external idempotency key required');
assert.match(sql, /idempotency_key\s+text\s+not\s+null\s+unique/i, 'outbox idempotency key required');
assert.match(sql, /check\s*\(\s*provider\s+in\s*\(\s*'papoai'\s*,\s*'meta'\s*\)\s*\)/i, 'provider check required');
assert.match(sql, /check\s*\(\s*direction\s+in\s*\(\s*'inbound'\s*,\s*'outbound'\s*\)\s*\)/i, 'message direction check required');
assert.match(sql, /check\s*\(\s*status\s+in\s*\(\s*'queued'\s*,\s*'claimed'\s*,\s*'sent'\s*,\s*'failed'\s*,\s*'cancelled'\s*\)\s*\)/i, 'outbox status check required');
assert.match(sql, /inbound_provider\s*,\s*outbound_provider[\s\S]*'papoai'\s*,\s*'papoai'/i, 'initial runtime must keep PapoAI providers');
assert.match(sql, /capture_enabled[\s\S]*send_enabled[\s\S]*true[\s\S]*true/i, 'initial runtime must preserve capture/send while PapoAI is provider');
assert.match(sql, /outbound_provider\s*=\s*'meta'[\s\S]{0,200}homologated_at\s+is\s+null/i, 'Meta send path must require homologation');
assert.match(sql, /status_rank/i, 'status projection must use semantic rank');
assert.match(sql, /when\s+v_current_status\s*=\s*'read'[\s\S]*then\s+false/i, 'read must not regress');
assert.match(sql, /marketing_optout_events_v2/i, 'provider-neutral opt-out trail required');
assert.match(sql, /last_inbound_at\s*=\s*case[\s\S]*greatest\s*\(/i, 'historical backfill must never regress last_inbound_at');
assert.match(sql, /last_outbound_at\s*=\s*case[\s\S]*greatest\s*\(/i, 'historical backfill must never regress last_outbound_at');

for (const indexName of ['whatsapp_messages_reply_to_idx','whatsapp_templates_account_idx','whatsapp_outbox_account_idx','whatsapp_outbox_conversation_idx','whatsapp_outbox_customer_idx','whatsapp_outbox_message_idx','whatsapp_outbox_template_idx','marketing_optout_events_v2_message_idx']) {
  assert.match(sql, new RegExp(`create\\s+index\\s+if\\s+not\\s+exists\\s+${indexName}`, 'i'), `${indexName} must cover foreign key`);
}

console.log('PASS whatsapp core structural contract');
