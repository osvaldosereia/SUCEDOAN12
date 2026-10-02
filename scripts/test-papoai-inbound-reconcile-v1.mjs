import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/sql/20261002_papoai_inbound_reconcile_v1.sql';
assert.ok(fs.existsSync(path),`${path} deve existir`);
const sql=fs.readFileSync(path,'utf8');

assert.match(sql,/create or replace function public\.ops2_reconcile_papoai_inbound_v1\s*\(/i);
assert.match(sql,/p_since\s+timestamptz/i);
assert.match(sql,/p_limit\s+integer\s+default\s+500/i);
assert.match(sql,/least\s*\(\s*500\s*,\s*greatest\s*\(\s*1\s*,/i,'batch deve ser limitado a 500');
assert.match(sql,/payload#>>'\{event,type\}'/i,'evento objeto event.type deve ser reconhecido');
assert.match(sql,/message\.received/i);
assert.match(sql,/metadata->>'canonical_message_id'/i,'somente capturas ainda não espelhadas devem entrar');
assert.match(sql,/whatsapp_ingest_event_v1/i,'reconciliação deve usar ingestão canônica idempotente');
assert.doesNotMatch(sql,/insert\s+into\s+public\.whatsapp_messages_v1/i,'não pode inserir mensagens diretamente');
assert.match(sql,/legacy_capture_id/i);
assert.match(sql,/legacy_event_key/i);
assert.match(sql,/canonical_mirror/i);
assert.match(sql,/canonical_message_id/i);
assert.match(sql,/canonical_event_id/i);
assert.match(sql,/has_provider_url/i,'metadata segura deve registrar apenas presença da URL de mídia');
assert.match(sql,/location/i,'localização deve ser preservada quando coordenadas forem válidas');
assert.match(sql,/processed/i);
assert.match(sql,/duplicates/i);
assert.match(sql,/skipped/i);
assert.match(sql,/errors/i);
for(const role of ['public','anon','authenticated'])assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.ops2_reconcile_papoai_inbound_v1[^;]*from\\s+${role}`,'i'));
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.ops2_reconcile_papoai_inbound_v1[^;]*to\s+service_role/i);

console.log('OK · reconciliação inbound reutiliza ingestão canônica, é limitada e idempotente.');
