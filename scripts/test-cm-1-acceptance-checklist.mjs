import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919063500_cm_1_homologation_acceptance_checklist_v2_fix.sql','utf8');
const html=fs.readFileSync('admin/relacionamento.html','utf8');
const js=fs.readFileSync('admin/relacionamento.js','utf8');
const runtime=fs.readFileSync('admin/runtime-config.js','utf8');

assert.match(migration,/cm1_acceptance_checklist_v1/);
assert.match(migration,/criteria_total',20/);
assert.match(migration,/external_activation_authorized',false/);
assert.match(migration,/cm1_complete',false/);
assert.match(migration,/ready_for_manual_canary/);
assert.match(migration,/relationship_command_summary_v1[\s\S]*'acceptance',public\.cm1_acceptance_checklist_v1\(\)/);

const keys=[
  'contact_ingested',
  'identity_resolved',
  'customer_360_updates',
  'conversation_event',
  'catalog_event',
  'search_event',
  'product_view_event',
  'cart_event',
  'order_event',
  'commercial_profile_recalculates',
  'affinities_update',
  'segment_changes',
  'opportunity_lifecycle',
  'consent_respected',
  'marketing_brain_suggests',
  'audit_complete',
  'no_improper_external_action',
  'ai_cost_measured',
  'deterministic_first',
  'meta_ready_architecture'
];
for(const key of keys)assert.match(migration,new RegExp(`'key','${key}'`),`critério ausente: ${key}`);
assert.equal(keys.length,20);

assert.match(migration,/record_catalog_interaction_v1/);
assert.match(migration,/evaluate_customer_contact_eligibility_v1/);
assert.match(migration,/marketing_strategy_brief_summary_v1/);
assert.match(migration,/marketing_external_side_effects_7d/);
assert.match(migration,/ai_side_effects_7d/);
assert.match(migration,/meta_control_plane_contract/);
assert.match(migration,/revoke all on function public\.cm1_acceptance_checklist_v1\(\) from public,anon,authenticated/);
assert.match(migration,/grant execute on function public\.cm1_acceptance_checklist_v1\(\) to service_role/);
assert.doesNotMatch(migration,/insert into public\.|update public\.|delete from public\.|graph\.facebook\.com|openai\.com\/v1/i,'acceptance checklist deve ser read-only');

assert.match(html,/data-panel="homologation"/);
assert.match(html,/20 critérios de saída da CM-1/);
assert.match(html,/id="acceptanceView"/);
assert.match(html,/id="manualGatesView"/);
assert.match(js,/function renderAcceptance\(\)/);
assert.match(js,/verified_count/);
assert.match(js,/implemented_count/);
assert.match(js,/blocked_count/);
assert.match(js,/Pronto para canary manual/);
assert.match(runtime,/relationshipUiEnabled:false/,'UI global deve continuar fechada');
assert.match(runtime,/customerOsSecureUiEnabled:false/,'Customer OS global deve continuar fechado');

console.log('cm-1 acceptance checklist contract ok');
