import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration='supabase/migrations/20261005200000_marketing_template_lifecycle_rules_v1.sql';
const retryMigration='supabase/migrations/20261005201000_marketing_template_lifecycle_retry_v1.sql';
const edgePath='supabase/functions/admin-marketing-template-lifecycle-v1/index.ts';
const uiPath='vitrine/admin/marketing/template-lifecycle-panel.js';
assert.equal(fs.existsSync(migration),true,'migration de lifecycle deve existir');
assert.equal(fs.existsSync(retryMigration),true,'migration de retry seguro deve existir');
assert.equal(fs.existsSync(edgePath),true,'Edge Admin de lifecycle deve existir');
assert.equal(fs.existsSync(uiPath),true,'painel de limpeza de templates deve existir');
const sql=fs.readFileSync(migration,'utf8')+'\n'+fs.readFileSync(retryMigration,'utf8');
const edge=fs.readFileSync(edgePath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');

for(const fn of [
  'marketing_template_lifecycle_refresh_v1',
  'marketing_template_lifecycle_list_v1',
  'marketing_template_lifecycle_set_protected_v1',
  'marketing_template_lifecycle_approve_delete_v1',
  'marketing_template_lifecycle_mark_deleted_v1',
]){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`,'i'),`RPC ausente: ${fn}`);
  assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}`,'i'),`RPC deve ser service-role only: ${fn}`);
}
assert.match(sql,/upper\([^\n]*category[^\n]*\)\s*=\s*['"]MARKETING['"]/i,'limpeza automática deve considerar somente MARKETING');
assert.match(sql,/protected\s+is\s+true|l\.protected/i,'template protegido deve bloquear candidatura');
assert.match(sql,/interval\s+['"]60\s+days['"]/i,'candidatura deve exigir 60 dias sem uso');
assert.match(sql,/ready_for_review|approved|scheduled|running|paused/i,'campanha ativa/futura deve bloquear exclusão');
assert.match(sql,/status\s+not\s+in\s*\(\s*['"]completed['"]\s*,\s*['"]discarded['"]\s*,\s*['"]meta_rejected['"]\s*\)/i,'qualquer Estratégia não terminal deve bloquear exclusão');
assert.match(sql,/deletion_candidate/i,'lifecycle deve recomendar candidato antes de excluir');
assert.match(sql,/delete_approved/i,'lifecycle deve registrar aprovação humana antes da Meta');
assert.match(sql,/deleted_meta/i,'lifecycle deve registrar exclusão concluída na Meta');
assert.match(sql,/meta_missing[^\n]{0,120}true/i,'template excluído da Meta deve ficar inelegível para reuso');
assert.match(sql,/lifecycle_status\s*=\s*['"]delete_approved['"][\s\S]{0,1200}idempotent[\s\S]{0,200}true/i,'falha da Meta deve permitir retry idempotente após nova revalidação');
assert.match(sql,/template_campaign_dependency[\s\S]{0,1000}delete_approved|delete_approved[\s\S]{0,1000}template_campaign_dependency/i,'retry de exclusão deve revalidar dependências antes da Meta');
assert.doesNotMatch(sql,/delete\s+from\s+public\.whatsapp_templates_v1/i,'histórico local do template nunca deve ser apagado');
assert.doesNotMatch(sql,/graph\.facebook\.com|http_post|net\.http/i,'SQL de lifecycle não chama Meta diretamente');

assert.match(edge,/db\.auth\.getUser\s*\(/,'Edge deve validar sessão Admin');
assert.match(edge,/from\(["']admin_users["']\)/,'Edge deve exigir admin ativo');
assert.match(edge,/deleteTemplateViaMeta/,'Edge deve reutilizar transporte server-side existente');
assert.match(edge,/marketing_template_lifecycle_refresh_v1/,'Edge deve revalidar lifecycle antes de listar/excluir');
assert.match(edge,/marketing_template_lifecycle_approve_delete_v1/,'Edge deve registrar aprovação antes de chamar Meta');
assert.match(edge,/marketing_template_lifecycle_mark_deleted_v1/,'Edge deve preservar e marcar histórico após Meta');
assert.match(edge,/confirm[^\n]{0,120}true|confirm_delete[^\n]{0,120}true/i,'exclusão Meta deve exigir confirmação explícita no payload');
assert.doesNotMatch(edge,/campaigns_enabled\s*[:=]\s*true|ana_enabled\s*[:=]\s*true/i,'limpeza não pode ativar runtime');

for(const label of ['Revisar limpeza','Candidato à exclusão','Protegido','Excluir da Meta']) assert.ok(ui.includes(label),`painel deve mostrar: ${label}`);
assert.match(ui,/admin-marketing-template-lifecycle-v1/,'painel deve usar Edge dedicada');
assert.match(ui,/confirm_delete\s*:\s*true/,'browser deve enviar confirmação explícita apenas após ação humana');
assert.doesNotMatch(ui,/graph\.facebook\.com|META_WHATSAPP_ACCESS_TOKEN|service_role/i,'browser não pode chamar Meta ou conter segredo');

const templateCenter=fs.readFileSync('vitrine/admin/marketing/template-center.js','utf8');
assert.match(templateCenter,/template-lifecycle-panel\.js/,'Templates deve carregar painel de lifecycle sob demanda');
assert.match(templateCenter,/data-template-cleanup/,'Templates deve ter ação Revisar limpeza');
assert.match(templateCenter,/MARKETING[\s\S]{0,500}openTemplateLifecycle/i,'exclusão de template MARKETING deve passar pelo lifecycle, não pelo delete genérico');

const helper=fs.readFileSync('supabase/functions/_shared/whatsapp-meta-templates-v1.mjs','utf8');
assert.match(helper,/export\s+async\s+function\s+deleteTemplateViaMeta/,'deve reutilizar helper Meta de exclusão já existente');

const workflow=fs.readFileSync('.github/workflows/marketing-professional-ui-ci.yml','utf8');
assert.ok(workflow.includes('scripts/test-marketing-template-lifecycle-v1.mjs'),'CI principal deve executar lifecycle');
assert.ok(workflow.includes('supabase/functions/admin-marketing-template-lifecycle-v1/**'),'CI deve observar Edge de lifecycle');
assert.ok(workflow.includes('vitrine/admin/marketing/template-lifecycle-panel.js'),'CI deve observar painel de lifecycle');

console.log('marketing template lifecycle v1 contract: ok');
