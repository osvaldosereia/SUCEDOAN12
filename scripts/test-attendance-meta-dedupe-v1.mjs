import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../supabase/sql/20261002_whatsapp_meta_canonical_outbound_v1.sql', import.meta.url);
assert.equal(fs.existsSync(migrationPath), true, 'migration de canonical outbound Meta deve existir');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /ops2_admin_attendance_accept_meta_outbound_v1/i);
assert.match(sql, /v_outbox\.provider\s*<>\s*'meta'/i);

const acceptanceSection = sql.split('create or replace function public.ops2_admin_attendance_accept_meta_outbound_v1')[1] || '';
assert.ok(acceptanceSection, 'função de aceite Meta deve estar presente');
const insertSection = acceptanceSection.split('insert into public.whatsapp_messages_v1')[1]?.split('returning * into v_message')[0] || '';
assert.match(insertSection, /'outbound'/i, 'mensagem canônica deve ser outbound');
assert.match(insertSection, /'accepted'/i, 'Graph accepted deve criar status accepted');
assert.match(insertSection, /'human'/i, 'envio do Admin deve ter autoria humana');
assert.match(insertSection, /v_provider_message_id/i);
assert.match(acceptanceSection, /whatsapp_record_status_v1/i, 'aceite e replay de status devem usar contrato canônico');
assert.match(acceptanceSection, /whatsapp_webhook_events_v1/i, 'status capturado antes do send deve ser reconciliado');
assert.match(acceptanceSection, /message\.status\./i);
assert.match(acceptanceSection, /update\s+public\.whatsapp_outbox_v1/i);
assert.match(acceptanceSection, /message_id\s*=\s*v_message_id/i);
assert.match(acceptanceSection, /provider_message_id\s*=\s*v_provider_message_id/i);
assert.match(acceptanceSection, /status\s*=\s*'sent'/i, 'outbox usa sent como terminal de aceitação por limitação do enum atual');
assert.match(acceptanceSection, /last_outbound_at/i);
assert.match(acceptanceSection, /idempotent|already_accepted/i);

// O mesmo wamid pode chegar pelo PapoAI durante coexistência. Deve existir uma única
// mensagem canônica por conta para wamid, independentemente do provider que ecoou primeiro.
assert.match(sql, /create\s+unique\s+index[\s\S]+whatsapp_account_id\s*,\s*provider_message_id[\s\S]+provider_message_id\s+like\s+'wamid\\\.%'/i,
  'wamid precisa de unicidade cross-provider por conta');
assert.match(sql, /create\s+or\s+replace\s+function\s+public\.whatsapp_ingest_event_v1/i,
  'ingest precisa reconciliar shadow PapoAI sem depender apenas do índice provider-specific');
assert.match(sql, /v_existing_wamid_message_id/i,
  'ingest deve procurar mensagem canônica existente pelo wamid');
assert.match(sql, /unique_violation/i,
  'corrida entre Meta e shadow PapoAI deve falhar fechado e reconciliar a linha existente');
assert.match(sql, /provider\s*=\s*'meta'/i,
  'aceite do nosso backend deve promover a linha canônica para provider Meta quando necessário');
assert.match(acceptanceSection, /meta_acceptance/i,
  'metadata deve distinguir aceite Graph de delivery/read');

assert.match(sql, /grant execute on function public\.ops2_admin_attendance_accept_meta_outbound_v1/i);
assert.doesNotMatch(sql, /delete\s+from\s+public\.whatsapp_(messages|webhook_events|outbox)/i, 'reconciliação não deve apagar evidências');
assert.doesNotMatch(sql, /papoai_attendance_text_webhook/i);
assert.doesNotMatch(sql, /human_send_enabled\s*=\s*true/i, 'Task 4 não pode ligar gate');
assert.doesNotMatch(sql, /homologated_at\s*=\s*now/i, 'Task 4 não pode homologar canal');

console.log('OK · Meta acceptance cria outbound canônico por wamid, liga outbox e deduplica shadow PapoAI sem apagar evidências.');
