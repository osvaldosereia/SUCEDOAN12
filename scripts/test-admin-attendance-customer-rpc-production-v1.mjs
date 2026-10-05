import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlPath='supabase/migrations/20261005112000_attendance_customer_browser_rpc_v1.sql';
const uiPath='vitrine/admin/atendimento/attendance-customer-api.js';
const workflowPath='.github/workflows/attendance-papoai-send-ci.yml';

assert.equal(fs.existsSync(sqlPath),true,'migration browser-safe deve existir');
const sql=fs.readFileSync(sqlPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');
const workflow=fs.readFileSync(workflowPath,'utf8');

for(const fn of [
  'ops2_admin_attendance_customer_reconcile_browser_v1',
  'ops2_admin_attendance_customer_search_browser_v1',
  'ops2_admin_attendance_customer_editor_browser_v1',
  'ops2_admin_attendance_customer_link_browser_v1',
  'ops2_admin_attendance_customer_create_browser_v1',
  'ops2_admin_attendance_customer_save_browser_v1'
]){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}`,'i'),`${fn} deve existir`);
  assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]*?to\\s+authenticated`,'i'),`${fn} deve ser executável apenas por sessão autenticada`);
}
assert.match(sql,/auth\.uid\(\)/i,'RPCs devem usar a identidade autenticada');
assert.match(sql,/admin_users[\s\S]*is_active\s*=\s*true/i,'RPCs devem validar admin ativo');
assert.match(sql,/role[\s\S]*viewer/i,'operações de escrita devem bloquear viewer');
assert.match(sql,/wa_contact_e164/i,'criação deve obter telefone da conversa no servidor');
assert.match(sql,/ops2_admin_customer_save_v2/i,'criação/edição devem reutilizar persistência canônica');
assert.match(sql,/ops2_admin_attendance_reconcile_customer_v1/i,'wrapper deve reutilizar reconciliação canônica service-role');
assert.match(sql,/ops2_admin_attendance_link_customer_v1/i,'wrapper deve reutilizar vínculo canônico service-role');

assert.match(ui,/\/rest\/v1\/rpc\//,'frontend deve usar RPC autenticada já homologada pela Central');
assert.doesNotMatch(ui,/functions\/v1\/admin-attendance-customer-v1/,'frontend de produção não deve depender da Edge bloqueada');
assert.match(ui,/ops2_admin_attendance_customer_create_browser_v1/,'frontend deve usar wrapper de criação');
assert.match(ui,/ops2_admin_attendance_customer_save_browser_v1/,'frontend deve usar wrapper de edição');
assert.match(workflow,/test-admin-attendance-customer-rpc-production-v1\.mjs/,'CI deve executar contrato de produção');

console.log('PASS: fallback RPC autenticado do cliente no Atendimento');
