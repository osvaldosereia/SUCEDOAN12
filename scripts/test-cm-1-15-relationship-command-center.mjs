import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919040000_cm_1_15_relationship_command_center_v1.sql','utf8');
const customerEdge=fs.readFileSync('supabase/functions/customer-intelligence-v1/index.ts','utf8');
const runtime=fs.readFileSync('admin/runtime-config.js','utf8');
const html=fs.readFileSync('admin/relacionamento.html','utf8');
const js=fs.readFileSync('admin/relacionamento.js','utf8');
const api=fs.readFileSync('admin/relationship-api.js','utf8');
const css=fs.readFileSync('admin/relacionamento.css','utf8');
const index=fs.readFileSync('admin/index.html','utf8');
const registry=fs.readFileSync('admin/module-registry.js','utf8');

for(const token of [
  'relationship_brand_summary_v1',
  'relationship_quality_summary_v1',
  'relationship_command_summary_v1',
  'customer_commercial_profile_summary_v1',
  'segment_engine_summary_v1',
  'opportunity_engine_summary_v1',
  'product_marketing_readiness_summary_v1',
  'marketing_strategy_brief_summary_v1',
  'whatsapp_template_draft_summary_v1',
  'get_meta_control_plane_snapshot_v1',
  'channel_provider_adapter_summary_v1'
]){
  assert.match(migration,new RegExp(token),'missing CM-1.15 read model '+token);
}
assert.match(migration,/external_side_effect',false/);
assert.match(migration,/revoke all on function public\.relationship_command_summary_v1\(\) from public,anon,authenticated/);
assert.match(migration,/grant execute on function public\.relationship_command_summary_v1\(\) to service_role/);
assert.doesNotMatch(migration,/insert into public\.marketing_campaigns|graph\.facebook\.com|openai|gpt-|gemini/i,'Central read model cannot execute campaigns/providers/AI');

assert.match(customerEdge,/action==='relationship_overview'/);
assert.match(customerEdge,/action==='relationship_audit'/);
assert.match(customerEdge,/relationship_command_summary_v1/);
assert.match(customerEdge,/read_only:true/);
assert.match(customerEdge,/external_side_effect:false/);
assert.match(customerEdge,/action==='identity_conflicts'/);
assert.match(customerEdge,/action==='identity_review'/);
assert.match(customerEdge,/identity_review_note_required/);
assert.match(customerEdge,/review_only_no_merge/);
assert.doesNotMatch(customerEdge,/action==='relationship_[^']+'[\s\S]{0,1000}graph\.facebook\.com/i);

assert.match(runtime,/relationshipUiEnabled:false/,'Relationship UI must remain behind manual canary gate');
assert.match(runtime,/relationshipCanaryEnabled:true/);
assert.match(runtime,/relationshipCanaryParam:'relationship_os'/);
assert.match(runtime,/relationshipCanaryValue:'canary'/);

assert.match(html,/Central de Relacionamento/);
for(const label of ['Visão Geral','Clientes','Segmentos','Oportunidades','Produtos','Marcas','Marketing Brain','Templates','Meta Foundation','Qualidade dos Dados','Auditoria']){
  assert.match(html,new RegExp(label));
}
assert.match(html,/Ações externas OFF/);
assert.match(html,/Somente leitura/);
assert.match(html,/id="pinForm"/);

assert.match(api,/CONFIG\.customerOsFunction/,'Reuse existing secure Customer Intelligence edge');
assert.match(api,/getCustomerOsAccessToken/);
assert.match(api,/relationship_overview/);
assert.match(api,/relationship_audit/);
assert.match(api,/getIdentityConflicts/);
assert.match(api,/reviewIdentityConflict/);

assert.match(js,/function canaryAllowed/);
assert.match(js,/relationshipUiEnabled===true/);
assert.match(js,/authenticateCustomerOsWithPin/);
assert.match(js,/getRelationshipOverview/);
assert.match(js,/getRelationshipAudit/);
assert.match(js,/zero ação externa/);
assert.match(js,/data-identity-review/);
assert.match(js,/Vincular avaliação ao cadastro escolhido/);
assert.match(js,/Nenhum candidato é seguro/);
assert.match(js,/sem mesclar cadastros/);
assert.match(css,/relationship-shell/);
assert.match(css,/identity-review-card/);
assert.match(registry,/id:'relationship'[\s\S]*?label:'Central de Relacionamento'[\s\S]*?gate:'relationship'/,'Central de Relacionamento must remain in canonical gated navigation');
assert.match(index,/admin-shell-v2\.js/,'Admin must load canonical shell navigation');

console.log('cm-1.15 relationship command center contract ok');
