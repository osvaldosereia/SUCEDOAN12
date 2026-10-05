import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration='supabase/migrations/20261005160000_ana_customer_profile_suggestions_v1.sql';
const mirror='supabase/sql/20261005_ana_customer_profile_suggestions_v1.sql';

assert.equal(fs.existsSync(migration),true,'migration de sugestões da ANA deve existir');
assert.equal(fs.existsSync(mirror),true,'espelho SQL de sugestões da ANA deve existir');

const sql=fs.readFileSync(migration,'utf8');
for(const token of [
  'customer_profile_extraction_runs_v1',
  'customer_profile_suggestions_v1',
  'ops2_admin_ana_customer_profile_context_v1',
  'ops2_admin_ana_customer_profile_suggestions_v1',
  'evidence_message_ids',
  'reviewed_accepted',
  'reviewed_rejected',
  'ambiguous_phone',
  'resolve_customer_by_phone_v1',
  'whatsapp_messages_v1',
  'ops2_admin_attendance_customer_access_v1(false)'
]) assert.match(sql,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`SQL deve conter ${token}`);

for(const field of ['name','cpf_cnpj','email','postal_code','street','number','complement','neighborhood','city','state','reference']){
  assert.match(sql,new RegExp(`'${field}'`),`field_name deve aceitar ${field}`);
}

assert.match(sql,/unique[\s\S]*run_id[\s\S]*field_name[\s\S]*normalized_value/i,'deve impedir sugestão duplicada no mesmo run');
assert.match(sql,/revoke[\s\S]*anon/i,'anon não pode escrever/ler diretamente as tabelas');
assert.match(sql,/grant execute[\s\S]*authenticated[\s\S]*service_role/i,'RPCs devem ser expostas somente a sessão autenticada/service role');
assert.match(sql,/limit\s+30/i,'contexto deve limitar histórico a 30 mensagens');

const mirrorSql=fs.readFileSync(mirror,'utf8');
assert.equal(mirrorSql,sql,'espelho SQL deve ser idêntico à migration');

console.log('ANA customer profile schema contract OK');
