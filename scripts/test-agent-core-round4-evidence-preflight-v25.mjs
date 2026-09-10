import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910213727_dona_antonia_agent_core_round4_evidence_preflight_v25.sql','utf8');
const workflow=fs.readFileSync('.github/workflows/ci-dona-antonia-agent-core.yml','utf8');

function must(haystack,needle,label){
  if(!haystack.includes(needle)) throw new Error(`missing_${label}`);
}
function mustNot(haystack,needle,label){
  if(haystack.includes(needle)) throw new Error(`forbidden_${label}`);
}

must(migration,'get_agent_core_round4_homologation_evidence_preflight_v1','preflight_function');
must(migration,'get_agent_core_round4_consolidated_readiness_v16','consolidated_v16');
must(migration,"c.automation_cohort,'')='homologation'",'homologation_only');
must(migration,"c.mode='ai'",'ai_mode_required');
must(migration,'not coalesce(c.human_required,false)','human_required_block');
must(migration,'not coalesce(h.open_handoff,false)','handoff_block');
must(migration,'c.service_window_expires_at>now()','service_window_required');
must(migration,"'synthetic_backfill_allowed',false",'no_synthetic_backfill');
must(migration,"'writes_permitted',false",'writes_off');
must(migration,"'router_retirement_permitted',false",'retirement_off');
must(migration,"'pii_returned',false",'no_pii');
must(migration,"'requires_real_homologation_turns',true",'real_turns_required');
mustNot(migration,'insert into public.agent_core_pre_router_snapshots','no_fake_snapshots');
mustNot(migration,'update public.conversations','no_conversation_state_mutation');
must(workflow,'test-agent-core-round4-evidence-preflight-v25.mjs','workflow_v25_contract');

console.log('agent_core_round4_evidence_preflight_v25_contract_ok');
