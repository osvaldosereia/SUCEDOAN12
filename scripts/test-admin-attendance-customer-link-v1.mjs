import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261005104500_attendance_customer_link_v1.sql';
const sqlMirrorPath='supabase/sql/20261005_attendance_customer_link_v1.sql';
const edgePath='supabase/functions/admin-attendance-customer-v1/index.ts';
const uiPath='vitrine/admin/atendimento/attendance-customer.js';
const cssPath='vitrine/admin/atendimento/attendance-customer.css';
const loaderPath='vitrine/admin/atendimento/attendance-human-ai.js';
const configPath='supabase/config.toml';
const workflowPath='.github/workflows/attendance-papoai-send-ci.yml';

for(const [path,label] of [
  [migrationPath,'migration de identidade do Atendimento'],
  [sqlMirrorPath,'espelho SQL da migration'],
  [edgePath,'Edge Function administrativa isolada'],
  [uiPath,'módulo de cliente da lateral'],
  [cssPath,'estilos do cliente da lateral']
]){
  assert.equal(fs.existsSync(path),true,`${label} deve existir em ${path}`);
}

const sql=fs.readFileSync(migrationPath,'utf8');
const mirror=fs.readFileSync(sqlMirrorPath,'utf8');
const edge=fs.readFileSync(edgePath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const loader=fs.readFileSync(loaderPath,'utf8');
const config=fs.readFileSync(configPath,'utf8');
const workflow=fs.readFileSync(workflowPath,'utf8');

assert.equal(mirror.trim(),sql.trim(),'espelho SQL deve ser idêntico à migration');

for(const fn of [
  'ops2_admin_attendance_reconcile_customer_v1',
  'ops2_admin_attendance_customer_search_v1',
  'ops2_admin_attendance_link_customer_v1'
]){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}`,'i'),`${fn} deve existir`);
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]*?from\\s+public,\\s*anon,\\s*authenticated`,'i'),`${fn} não pode ser executável diretamente pelo navegador`);
  assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]*?to\\s+service_role`,'i'),`${fn} deve ser service-role-only`);
}

assert.match(sql,/resolve_customer_by_phone_v1/i,'reconciliação deve reutilizar o resolvedor canônico com variantes BR');
assert.match(sql,/for\s+update/i,'vínculo deve serializar a conversa antes de alterar customer_id');
assert.match(sql,/match_status[^\n]*ambiguous|ambiguous[^\n]*match_status/i,'identidade ambígua deve permanecer explícita');
assert.match(sql,/update\s+public\.whatsapp_messages_v1[\s\S]*customer_id/i,'mensagens antigas da conversa devem receber o customer_id quando seguro');

assert.match(edge,/admin_users/i,'Edge de cliente deve validar usuário administrativo');
assert.match(edge,/admin_auth_required|admin_session_invalid/i,'Edge deve falhar fechado sem sessão admin');
for(const action of ['status','search','editor','reconcile','link','create','save'])assert.match(edge,new RegExp(`["']${action}["']`),`Edge deve expor action ${action}`);
assert.match(edge,/WRITE_ACTIONS\.has\(action\)[\s\S]{0,220}auth\.role\s*===\s*["']viewer["']/i,'viewer pode consultar, mas não pode reconciliar/vincular/criar/editar cliente');
assert.match(edge,/ops2_admin_attendance_reconcile_customer_v1/,'Edge deve chamar RPC de reconciliação');
assert.match(edge,/ops2_admin_attendance_customer_search_v1/,'Edge deve chamar RPC de busca');
assert.match(edge,/ops2_admin_attendance_link_customer_v1/,'Edge deve chamar RPC de vínculo');
assert.match(edge,/ops2_admin_customer_save_v2/,'criação/edição deve reutilizar persistência canônica de clientes');
assert.match(edge,/wa_contact_e164/i,'criação deve buscar o telefone a partir da conversa no servidor');
assert.match(edge,/canonical_whatsapp_e164_br_v2/i,'telefone da conversa deve ser normalizado no servidor');
assert.doesNotMatch(edge,/META_WHATSAPP_ACCESS_TOKEN|sendTextViaMeta|sendAttendanceMediaViaMeta|PAPOAI/i,'backend de cliente não deve tocar em transporte WhatsApp/Meta/PapoAI');
assert.match(config,/\[functions\.admin-attendance-customer-v1\][\s\S]*?verify_jwt\s*=\s*false/i,'Edge de cliente deve usar o mesmo gateway interno do Admin e validar Bearer por conta própria');

assert.match(ui,/Cadastrar cliente/,'estado sem cliente deve oferecer cadastro inline');
assert.match(ui,/Buscar cadastro/,'estado sem cliente deve oferecer busca de existente');
assert.match(ui,/Editar aqui/,'cliente vinculado deve poder ser editado inline');
assert.match(ui,/customer_reconcile|action:\s*['"]reconcile['"]/i,'UI deve tentar reconciliação automática');
assert.match(ui,/queue-card\.selected/,'UI deve trabalhar a partir da conversa selecionada');
assert.match(ui,/readOnly\s*:\s*true|readOnly\s*=\s*true|readonly/i,'WhatsApp da criação deve ser somente leitura');
assert.match(ui,/MutationObserver/,'módulo deve se acoplar apenas ao card/contexto renderizado');
assert.doesNotMatch(ui,/\battempted\b/,'polling/redesenho do mesmo cliente não pode bloquear um novo card por estado global de tentativa');
assert.match(ui,/attendanceCustomerActive\s*=\s*['"]loading['"]|dataset\.attendanceCustomerActive\s*=\s*['"]loading['"]/,'cada card em reconciliação deve marcar seu próprio estado para evitar loops');
assert.doesNotMatch(ui,/send_text|send_media|META_WHATSAPP|PAPOAI/i,'módulo de cliente não deve tocar no transporte de mensagens');

assert.match(css,/attendance-customer/i,'CSS deve ficar isolado pelo namespace attendance-customer');
assert.match(loader,/attendance-customer\.js\?v=customer-(?:link|profile)-v1/,'um módulo carregado diretamente pela página deve importar o cliente lateral com versão compatível');
assert.match(workflow,/node scripts\/test-admin-attendance-customer-link-v1\.mjs/,'CI do Atendimento deve executar o novo contrato');
assert.match(workflow,/node --experimental-strip-types --check supabase\/functions\/admin-attendance-customer-v1\/index\.ts/,'CI deve validar a sintaxe TypeScript da nova Edge');

console.log('PASS: contrato de identificação/vínculo/cadastro de cliente no Atendimento');
