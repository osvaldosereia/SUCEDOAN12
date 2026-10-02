import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const path='supabase/sql/20261001_admin_attendance_v1.sql';
assert.ok(existsSync(path),`${path} deve existir`);
const sql=readFileSync(path,'utf8');

const required=[
  'create table if not exists public.attendance_conversation_state_v1',
  'create or replace function public.ops2_admin_attendance_queue_v1',
  'create or replace function public.ops2_admin_attendance_conversation_v1',
  'create or replace function public.ops2_admin_attendance_context_v1',
  'create or replace function public.ops2_admin_attendance_mark_read_v1',
  'create or replace function public.ops2_admin_attendance_follow_up_v1',
  'alter table public.attendance_conversation_state_v1 enable row level security'
];
for(const marker of required) assert.match(sql,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),`marcador ausente: ${marker}`);

assert.match(sql,/conversation_id\s+uuid\s+primary\s+key/i);
assert.match(sql,/last_read_message_id\s+uuid/i);
assert.match(sql,/last_read_at\s+timestamptz/i);
assert.match(sql,/follow_up_at\s+timestamptz/i);
assert.match(sql,/updated_at\s+timestamptz\s+not\s+null/i);
assert.match(sql,/references\s+public\.conversations\s*\(id\)/i);
assert.match(sql,/references\s+public\.whatsapp_messages_v1\s*\(id\)/i);

for(const role of ['public','anon','authenticated']){
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.attendance_conversation_state_v1\\s+from\\s+${role}`,'i'));
}
assert.match(sql,/grant\s+(select|insert|update|delete|all)[^;]*on\s+table\s+public\.attendance_conversation_state_v1\s+to\s+service_role/i);

const fns=[
  'ops2_admin_attendance_queue_v1',
  'ops2_admin_attendance_conversation_v1',
  'ops2_admin_attendance_context_v1',
  'ops2_admin_attendance_mark_read_v1',
  'ops2_admin_attendance_follow_up_v1'
];
for(const fn of fns){
  for(const role of ['public','anon','authenticated']) assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}[^;]*from\\s+${role}`,'i'),`${fn}: revoke ${role}`);
  assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}[^;]*to\\s+service_role`,'i'),`${fn}: service_role execute`);
}

assert.match(sql,/p_limit\s+integer\s+default\s+50/i);
assert.match(sql,/p_filter\s+text\s+default\s+'all'/i);
assert.match(sql,/p_limit\s+integer\s+default\s+30/i);
assert.match(sql,/least\s*\(\s*50\s*,\s*greatest\s*\(\s*1\s*,/i);
assert.match(sql,/direction\s*=\s*'inbound'/i);
assert.doesNotMatch(sql,/coalesce\(c\.updated_at\s*,\s*'epoch'::timestamptz\)/i,'updated_at administrativo não pode definir recência da conversa');
assert.match(sql,/coalesce\(lm\.message_at\s*,\s*'epoch'::timestamptz\)/i,'última mensagem real deve participar da atividade da conversa');
assert.match(sql,/from\s+filtered\s+q\s+order\s+by\s+q\.last_activity_at\s+desc/i,'fila deve ordenar primeiro pela atividade mais recente');
assert.doesNotMatch(sql,/order\s+by\s+\(q\.unread_count>0\s+or\s+q\.human_required/i,'não lidas/humano não podem furar a ordem cronológica da fila');
assert.match(sql,/p_before\s+is\s+null\s+or/i);
assert.match(sql,/order\s+by[\s\S]{0,180}message_at\s+asc/i);
assert.match(sql,/ops2_customer_registration_state_v1/i);
assert.match(sql,/regexp_replace[\s\S]{0,250}cpf_cnpj/i);
assert.match(sql,/limit\s+10/i);
assert.match(sql,/message_not_in_conversation/i);
assert.match(sql,/follow_up_must_be_future/i);

console.log('OK · fila da Central usa atividade real mais recente, sem prioridade artificial de não lidas.');