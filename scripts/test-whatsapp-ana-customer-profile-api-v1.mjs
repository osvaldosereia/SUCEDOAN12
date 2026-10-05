import assert from 'node:assert/strict';
import fs from 'node:fs';

const edgePath='supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts';
const configPath='supabase/config.toml';
const migrationPath='supabase/migrations/20261005160000_ana_customer_profile_suggestions_v1.sql';
assert.equal(fs.existsSync(edgePath),true,'Edge de extração cadastral da ANA deve existir');

const edge=fs.readFileSync(edgePath,'utf8');
const config=fs.readFileSync(configPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');

for(const token of [
  'ana-customer-profile-policy-v1.mjs',
  'ops2_admin_ana_customer_profile_context_v1',
  'ops2_ana_customer_profile_persist_v1',
  'customer_profile_extraction_runs_v1',
  'customer_profile_suggestions_v1',
  'snapshot_key',
  'evidence_message_ids',
  'ambiguous_phone',
  'admin_session_invalid',
  'extract',
  'list'
]) assert.match(edge,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`Edge deve conter ${token}`);

assert.match(edge,/auth\.getUser\(/,'Edge deve validar bearer Admin server-side');
assert.match(edge,/allowedEvidence|allowed_evidence|evidenceSet|evidence_set/i,'Edge deve validar evidence IDs contra contexto');
assert.match(edge,/snapshotKey|snapshot_key/i,'Edge deve deduplicar a mesma fotografia da conversa');
assert.match(edge,/if\s*\([^)]*ambiguous_phone|error\s*===\s*["']ambiguous_phone["']/i,'telefone ambíguo deve abortar antes do modelo');
assert.match(migration,/create\s+or\s+replace\s+function\s+public\.ops2_admin_ana_customer_profile_extract_access_v1\s*\(\s*\)/i,'migration deve expor wrapper writer-safe específico da ANA');
assert.match(migration,/ops2_admin_attendance_customer_access_v1\(true\)/i,'wrapper da ANA deve delegar ao helper canônico com escrita');
assert.match(migration,/grant\s+execute\s+on\s+function\s+public\.ops2_admin_ana_customer_profile_extract_access_v1\(\)[\s\S]*authenticated/i,'wrapper writer-safe deve ser chamável por sessão autenticada');
assert.match(edge,/ops2_admin_ana_customer_profile_extract_access_v1/,'extract deve chamar wrapper writer-safe da ANA');
assert.doesNotMatch(edge,/db\.rpc\(["']ops2_admin_attendance_customer_access_v1["']/,'Edge não deve chamar diretamente helper service-role-only');
const writeGatePos=edge.indexOf('ops2_admin_ana_customer_profile_extract_access_v1');
const modelCallPos=edge.lastIndexOf('generateProfile(context)');
assert.ok(writeGatePos>0&&modelCallPos>writeGatePos,'gate de escrita deve ocorrer antes da geração/persistência de sugestões');

assert.match(migration,/create\s+or\s+replace\s+function\s+public\.ops2_ana_customer_profile_persist_v1/i,'persistência de run+sugestões deve ser transacional no Postgres');
assert.match(migration,/ops2_valid_cpf_cnpj_v1/i,'persistência deve validar CPF/CNPJ deterministicamente');
assert.match(migration,/from\s+public\.customers[\s\S]*cpf_cnpj/i,'persistência deve detectar CPF/CNPJ pertencente a outro cliente');
assert.doesNotMatch(edge,/from\(["']customer_profile_extraction_runs_v1["']\)\.insert/,'Edge não deve criar run fora da transação de persistência');
assert.doesNotMatch(edge,/from\(["']customer_profile_suggestions_v1["']\)\.insert/,'Edge não deve inserir sugestões fora da transação de persistência');

for(const forbidden of [
  '.from("customers").update',
  ".from('customers').update",
  '.from("customer_addresses").insert',
  ".from('customer_addresses').insert",
  '.from("customer_emails").insert',
  ".from('customer_emails').insert"
]) assert.equal(edge.includes(forbidden),false,`Fase 1 não pode gravar cadastro canônico: ${forbidden}`);

assert.match(config,/\[functions\.admin-whatsapp-ana-customer-profile-v1\][\s\S]*verify_jwt\s*=\s*true/i,'nova Edge deve exigir JWT no gateway');

console.log('ANA customer profile API contract OK');
