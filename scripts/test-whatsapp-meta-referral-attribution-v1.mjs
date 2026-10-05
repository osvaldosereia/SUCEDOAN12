import assert from 'node:assert/strict';
import fs from 'node:fs';

const corePath = new URL('../supabase/functions/_shared/whatsapp-core-v1.mjs', import.meta.url);
const { canonicalMessagesFromMeta } = await import(corePath.href);

const makePayload = (message) => ({ object: 'whatsapp_business_account', entry: [{ id: 'waba-1', changes: [{ field: 'messages', value: {
  metadata: { phone_number_id: 'phone-number-1' },
  contacts: [{ profile: { name: 'Cliente' }, wa_id: '5565999999999' }],
  messages: [{ from: '5565999999999', id: 'wamid.1', timestamp: '1790968000', type: 'text', text: { body: 'Oi' }, ...message }],
} }] }] });
const resolver = (phoneNumberId) => phoneNumberId === 'phone-number-1' ? 'account-1' : null;

const referral = {
  source_type: 'ad', source_id: '123456789', source_url: 'https://fb.me/ad/123',
  headline: 'Conheça a loja', body: 'Fale conosco', media_type: 'image', ctwa_clid: 'clid-abc',
};
const valid = canonicalMessagesFromMeta(makePayload({ referral }), resolver)[0];
assert.deepEqual(valid.message.metadata.referral, referral, 'referral Meta allowlisted deve sobreviver na metadata canônica');
assert.equal(valid.whatsapp_account_id, 'account-1', 'conta deve continuar sendo resolvida pelo phone_number_id');
assert.equal(valid.phone_e164, '+5565999999999', 'telefone deve continuar vindo do remetente Meta');
assert.equal(valid.provider_message_id, 'wamid.1', 'id deve continuar vindo da mensagem Meta');

const absent = canonicalMessagesFromMeta(makePayload({}), resolver)[0];
assert.equal(Object.hasOwn(absent.message.metadata, 'referral'), false, 'mensagem sem referral não deve fabricar atribuição');

const malformed = canonicalMessagesFromMeta(makePayload({ referral: {
  source_type: 'made_up', source_id: { unsafe: true }, source_url: 'https://example.test/' + 'x'.repeat(3000),
  headline: 'h'.repeat(1000), body: 5, media_type: 'image', ctwa_clid: 'c'.repeat(1000),
} }), resolver)[0];
assert.deepEqual(malformed.message.metadata.referral, { source_url: ('https://example.test/' + 'x'.repeat(3000)).slice(0, 2048), headline: 'h'.repeat(500), media_type: 'image', ctwa_clid: 'c'.repeat(512) }, 'campos referral precisam validar tipos e limites sem descartar campos válidos');

const migrationPath = new URL('../supabase/migrations/20261005173000_meta_whatsapp_referral_attribution_v1.sql', import.meta.url);
assert.ok(fs.existsSync(migrationPath), 'migration de persistência Meta deve existir');
const migration = fs.readFileSync(migrationPath, 'utf8');
const messageCapture = migration.split('create or replace function public.capture_whatsapp_conversation_attribution_v1')[1]?.split('create or replace function public.capture_meta_free_entry_window_v1')[0] || '';
const freeEntryCapture = migration.split('create or replace function public.capture_meta_free_entry_window_v1')[1]?.split('create or replace function public.ops2_admin_attendance_context_v1')[0] || '';
assert.match(messageCapture, /if\s+new\.direction\s*<>\s*'inbound'\s+then/i, 'somente mensagem inbound atualiza a conversa');
assert.match(messageCapture, /after insert or update of metadata, direction, received_at[\s\S]*on public\.whatsapp_messages_v1/i, 'trigger deve cobrir novas mensagens e preservação de metadados');
for (const field of ['source_type','source_id','source_url','headline','body','media_type','ctwa_clid']) assert.ok(messageCapture.includes(`'${field}'`), `migração deve limitar referral ao campo ${field}`);
assert.match(messageCapture, /source\s*=\s*case\s+v_source_type\s+when\s+'ad'\s+then\s+'meta_ad'\s+when\s+'post'\s+then\s+'organic'/i);
assert.match(messageCapture, /referral\s*=\s*case\s+when\s+v_referral\s*<>\s*'\{\}'::jsonb\s+then\s+v_referral\s+else\s+c\.referral/i, 'ausência de referral preserva atribuição existente');
assert.match(messageCapture, /greatest\(coalesce\(c\.last_inbound_at[\s\S]{0,240}new\.conversation_id[\s\S]{0,120}new\.whatsapp_account_id/i, 'entrega fora de ordem não pode retroceder a última mensagem');
assert.match(messageCapture, /service_window_expires_at\s*=\s*greatest[\s\S]{0,240}v_received_at\s*\+\s*interval\s+'24 hours'/i);
assert.match(messageCapture, /c\.id\s*=\s*new\.conversation_id\s+and\s+c\.whatsapp_account_id\s*=\s*new\.whatsapp_account_id/i, 'somente conversa da conta resolvida deve ser atualizada');
assert.match(freeEntryCapture, /after insert on public\.whatsapp_message_status_events_v1/i);
assert.match(freeEntryCapture, /new\.provider\s*<>\s*'meta'[\s\S]{0,140}referral_conversion/i);
assert.match(freeEntryCapture, /expiration_timestamp/i);
assert.match(freeEntryCapture, /v_epoch_text\s*!~\s*'\^\[0-9\]\{10,13\}\$'/i, 'timestamp não numérico ou fora do tamanho esperado deve ser ignorado');
assert.match(freeEntryCapture, /new\.message_id[\s\S]{0,180}m\.provider\s*=\s*'meta'[\s\S]{0,120}m\.whatsapp_account_id\s*=\s*c\.whatsapp_account_id/i);
assert.doesNotMatch(freeEntryCapture, /metadata\s*->\s*'referral'/i, 'referral sozinha não cria janela de 72h');
assert.match(migration, /set\s+search_path\s+to\s+''/i);
assert.match(migration, /revoke all on function public\.capture_whatsapp_conversation_attribution_v1\(\) from public, anon, authenticated/i);
assert.match(migration, /revoke all on function public\.capture_meta_free_entry_window_v1\(\) from public, anon, authenticated/i);

console.log('OK · contrato de referral Meta, janelas comprovadas e contexto Admin.');

