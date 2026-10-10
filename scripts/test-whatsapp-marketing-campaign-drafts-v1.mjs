import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261005004000_marketing_campaign_drafts_v1.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration de campanhas em rascunho deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

for(const table of ['marketing_campaigns_v1','marketing_campaign_snapshots_v1','marketing_campaign_snapshot_recipients_v1','marketing_campaign_events_v1']){
  assert.match(sql,new RegExp(`create\\s+table[\\s\\S]*${table}`,'i'),`tabela ausente: ${table}`);
}
for(const fn of ['marketing_create_campaign_v1','marketing_update_campaign_draft_v1','marketing_create_campaign_snapshot_v1','marketing_transition_campaign_v1','marketing_campaign_detail_v1']){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`,'i'),`RPC ausente: ${fn}`);
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]*from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,'i'),`${fn} deve ser service-role only`);
  assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]*to\\s+service_role`,'i'),`${fn} deve conceder apenas service_role`);
}

for(const status of ['draft','ready_for_review','approved','cancelled']) assert.match(sql,new RegExp(`['\"]${status}['\"]`,'i'),`status ${status} ausente`);
assert.doesNotMatch(sql,/['\"]scheduled['\"]|['\"]running['\"]/i,'Fase D não pode criar estado executável');
assert.match(sql,/revision\s+integer\s+not\s+null\s+default\s+1/i,'campanha deve ter revisão otimista');
assert.match(sql,/p_expected_revision/i,'update/transition deve usar optimistic locking');
assert.match(sql,/revision_conflict/i,'stale write deve retornar revision_conflict');
assert.match(sql,/upper\s*\(\s*category\s*\)\s*=\s*['\"]MARKETING['\"]/i,'template deve ser MARKETING');
assert.match(sql,/upper\s*\(\s*status\s*\)\s*=\s*['\"]APPROVED['\"]/i,'template deve estar APPROVED');
assert.match(sql,/template_not_sendable/i,'template inválido deve bloquear transição');
assert.match(sql,/marketing_audience_candidates_v2/i,'snapshot deve usar núcleo canônico de audiência');
assert.match(sql,/unique\s*\(\s*campaign_id\s*,\s*campaign_revision\s*\)/i,'snapshot deve ser idempotente por revisão');
assert.match(sql,/append_only|immutable|raise\s+exception[\s\S]*immutable/i,'snapshot/eventos devem ser protegidos contra mutação');
assert.match(sql,/eligible_at_snapshot/i,'recipient deve congelar elegibilidade técnica');
for(const field of ['exclusion_reasons','phone_e164','order_count','lifetime_value','last_purchase_at','city','neighborhood']) assert.match(sql,new RegExp(field,'i'),`evidência de snapshot ausente: ${field}`);
assert.match(sql,/campaign_invalid_transition/i,'transições inválidas devem falhar explicitamente');
assert.match(sql,/ready_for_review[\s\S]*approved/i,'aprovação administrativa deve existir');
assert.match(sql,/ready_for_review[\s\S]*draft/i,'retorno para rascunho deve existir');

assert.doesNotMatch(sql,/graph\.facebook\.com|sendTemplateViaMeta|pg_net|whatsapp_outbox|ops2_whatsapp_outbox|wamid|schedule|scheduler/i,'schema de rascunho não pode executar ou agendar mensagens');

console.log('PASS test-whatsapp-marketing-campaign-drafts-v1');
