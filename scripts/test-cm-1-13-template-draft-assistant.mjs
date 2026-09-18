import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919021000_cm_1_13_template_draft_assistant_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/admin-whatsapp-direct-v1/index.ts','utf8');
const html=fs.readFileSync('admin/marketing.html','utf8');
const js=fs.readFileSync('admin/marketing.js','utf8');
const api=fs.readFileSync('admin/marketing-api.js','utf8');
const runtime=fs.readFileSync('admin/runtime-config.js','utf8');
const css=fs.readFileSync('admin/marketing.css','utf8');

for(const token of [
  'local_status','strategy_brief_id','creative_asset_id','variable_schema',
  'validation_status','validation_report','source_kind','ai_generated',
  'active_meta_version','validate_whatsapp_template_draft_v1',
  'save_whatsapp_template_draft_v1','whatsapp_template_draft_summary_v1'
]){
  assert.match(migration,new RegExp(token),'missing CM-1.13 structure '+token);
}
assert.match(migration,/template_manual_enabled',true/);
assert.match(migration,/template_ai_enabled',false/);
assert.match(migration,/template_ai_max_daily_calls',0/);
assert.match(migration,/template_submit_enabled',false/);
assert.match(migration,/template_auto_submit_enabled',false/);
assert.match(migration,/meta_submission_performed',false/);
assert.match(migration,/external_side_effect',false/);
assert.match(migration,/variable_sequence_has_gap/);
assert.match(migration,/meta_policy_registry_not_yet_verified/);
assert.match(migration,/marketing_template_requires_consent_and_customer_protection/);
assert.match(migration,/enabled=false/,'Draft save must keep runtime template disabled');
assert.match(migration,/meta_status=case when v_changed then 'not_submitted'/);
assert.match(migration,/revoke all on function public\.save_whatsapp_template_draft_v1/);
assert.doesNotMatch(migration,/graph\.facebook\.com|message_templates.*POST/i,'CM-1.13 migration cannot submit to Meta');

assert.match(edge,/action==="template_library"/);
assert.match(edge,/action==="template_versions"/);
assert.match(edge,/action==="template_validate"/);
assert.match(edge,/action==="template_save_draft"/);
assert.match(edge,/action==="template_ai_draft"/);
assert.match(edge,/template_ai_enabled!==true/);
assert.match(edge,/template_ai_budget_closed/);
assert.match(edge,/template_ai_daily_limit_reached/);
assert.match(edge,/save_whatsapp_template_draft_v1/);
assert.match(edge,/legacy_template_write_disabled/);
assert.match(edge,/Não afirme que o template está aprovado pela Meta/);
assert.match(edge,/meta_submission_performed:false/);
assert.match(edge,/external_side_effect:false/);

assert.match(runtime,/whatsappDirectAdminFunction:'admin-whatsapp-direct-v1'/);
assert.match(api,/getWhatsAppTemplateLibrary/);
assert.match(api,/validateWhatsAppTemplateDraft/);
assert.match(api,/saveWhatsAppTemplateDraft/);
assert.match(api,/createAiWhatsAppTemplateDraft/);

assert.match(html,/CM-1\.13 · DRAFT ONLY/);
assert.match(html,/Templates oficiais do WhatsApp/);
assert.match(html,/Nenhum template é submetido à Meta nesta etapa/);
assert.match(html,/id="templateDraftForm"/);
assert.match(html,/id="createAiTemplateDraft"[^>]*disabled/);
assert.match(html,/Submit Meta OFF/);

assert.match(js,/renderTemplateAssistant/);
assert.match(html,/Salvar DRAFT/);
assert.match(js,/Nenhuma submissão à Meta foi feita/);
assert.match(js,/Gate de IA fechado: nenhuma chamada paga será feita/);
assert.match(js,/getWhatsAppTemplateVersions/);
assert.match(css,/CM-1\.13 Template Draft Assistant/);

console.log('cm-1.13 template draft assistant contract ok');
