import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration='supabase/migrations/20261005170000_ana_customer_profile_confirmation_v1.sql';
const mirror='supabase/sql/20261005_ana_customer_profile_confirmation_v1.sql';
const workflow='.github/workflows/whatsapp-meta-central-ci.yml';

assert.equal(fs.existsSync(migration),true,'migration de confirmações da ANA deve existir');
assert.equal(fs.existsSync(mirror),true,'espelho SQL deve existir');
assert.equal(fs.existsSync(workflow),true,'workflow da central Meta deve existir');

const sql=fs.readFileSync(migration,'utf8');
const required=[
  'customer_profile_confirmation_requests_v1',
  'customer_id','conversation_id','suggestion_ids','expires_at',
  'outbound_message_id','confirmation_inbound_message_id',
  'ops2_ana_customer_confirmation_create_v1',
  'ops2_ana_customer_confirmation_pending_v1',
  'ops2_admin_attendance_customer_access_v1(true)',
  'cancelled','confirmed','corrected','expired','pending'
];
for(const token of required)assert.ok(sql.includes(token),`schema de confirmação deve conter ${token}`);
assert.match(sql,/interval\s+'30 minutes'/i,'solicitação deve expirar após 30 minutos');
assert.match(sql,/unique\s+index[\s\S]*conversation_id[\s\S]*where\s+status\s*=\s*'pending'/i,'deve existir somente uma solicitação ativa por conversa');
assert.match(sql,/else\s+'cancelled'[\s\S]*where\s+id=v_existing\.id/i,'criar solicitação nova deve cancelar a anterior da conversa');
assert.match(sql,/s\.conversation_id\s*=\s*p_conversation_id[\s\S]*s\.status\s*=\s*'pending'/i,'somente sugestões pendentes da conversa podem ser solicitadas');
assert.match(sql,/field_name='cpf_cnpj'[\s\S]*then\s+'\*\*\*'\|\|right\(regexp_replace/i,'CPF/CNPJ deve ser mascarado no resumo retornado');
assert.match(sql,/enable\s+row\s+level\s+security/i,'tabela deve ter RLS ativo');
assert.match(sql,/revoke\s+all\s+on\s+table[\s\S]*from\s+public\s*,\s*anon/i,'anon/public não devem acessar a tabela');
assert.equal(fs.readFileSync(mirror,'utf8'),sql,'espelho SQL deve ser idêntico à migration');

const workflowText=fs.readFileSync(workflow,'utf8');
assert.match(workflowText,/test-ana-customer-profile-confirmation-schema-v1\.mjs/,'contrato de confirmação deve rodar no CI');

console.log('ANA customer profile confirmation schema contract OK');

