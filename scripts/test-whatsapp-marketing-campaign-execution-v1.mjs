import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261005014000_marketing_campaign_execution_v1.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration de execução de campanhas deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

for(const table of ['marketing_campaign_execution_runtime_v1','marketing_campaign_dispatches_v1']){
  assert.match(sql,new RegExp(`create\\s+table[\\s\\S]*${table}`,'i'),`tabela ausente: ${table}`);
}

assert.match(sql,/mode\s+text\s+not\s+null\s+default\s+['"]off['"]/i,'runtime deve nascer em mode=off');
assert.match(sql,/check\s*\(\s*mode\s+in\s*\(\s*['"]off['"]\s*,\s*['"]canary['"]\s*,\s*['"]live['"]\s*\)\s*\)/i,'runtime deve limitar mode a off/canary/live');
assert.match(sql,/whatsapp_account_id[\s\S]*references\s+public\.whatsapp_accounts/i,'runtime/dispatch deve pertencer a conta WhatsApp');

for(const status of ['scheduled','running','paused','completed','failed']){
  assert.match(sql,new RegExp(`['\"]${status}['\"]`,'i'),`estado executável ausente: ${status}`);
}
for(const status of ['pending','claimed','skipped','accepted','retry','uncertain','failed']){
  assert.match(sql,new RegExp(`['\"]${status}['\"]`,'i'),`estado de dispatch ausente: ${status}`);
}

for(const field of ['snapshot_id','campaign_id','customer_id','whatsapp_account_id','outbox_id','attempt_count','available_at','claimed_at','provider_message_id','last_error','skip_reason','created_at','updated_at']){
  assert.match(sql,new RegExp(`\\b${field}\\b`,'i'),`campo de dispatch ausente: ${field}`);
}
assert.match(sql,/unique\s*\(\s*snapshot_id\s*,\s*customer_id\s*\)/i,'dispatch deve ser único por snapshot/customer');
assert.match(sql,/snapshot_id[\s\S]*references\s+public\.marketing_campaign_snapshots_v1/i,'dispatch deve referenciar snapshot');
assert.match(sql,/campaign_id[\s\S]*references\s+public\.marketing_campaigns_v1/i,'dispatch deve referenciar campanha');
assert.match(sql,/customer_id[\s\S]*references\s+public\.customers/i,'dispatch deve referenciar cliente');
assert.match(sql,/outbox_id[\s\S]*references\s+public\.whatsapp_outbox_v1/i,'dispatch deve referenciar outbox canônica');

const rpcs=[
  'marketing_schedule_campaign_v1',
  'marketing_pause_campaign_v1',
  'marketing_resume_campaign_v1',
  'marketing_materialize_dispatches_v1',
  'marketing_claim_dispatch_batch_v1',
  'marketing_revalidate_dispatch_v1',
  'marketing_finish_dispatch_v1',
];
for(const fn of rpcs){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`,'i'),`RPC ausente: ${fn}`);
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]*from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,'i'),`${fn} deve ser service-role only`);
  assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]*to\\s+service_role`,'i'),`${fn} deve conceder execute a service_role`);
}

assert.match(sql,/campaigns_enabled/i,'schedule/claim deve respeitar kill-switch de campanhas');
assert.match(sql,/marketing_campaign_execution_runtime_v1/i,'schedule/claim deve consultar runtime próprio');
assert.match(sql,/mode\s*=\s*['"]off['"]|mode\s*<>\s*['"]off['"]|mode\s+in\s*\([^)]*canary[^)]*live/i,'runtime off deve bloquear execução');
assert.match(sql,/campaigns_disabled/i,'gate fechado deve retornar campaigns_disabled');
assert.match(sql,/marketing_campaign_snapshot_recipients_v1/i,'materialização deve partir do snapshot congelado');
assert.match(sql,/marketing_customer_consent_current_v1|marketing_consent_events_v1/i,'revalidação deve consultar consentimento atual');
assert.match(sql,/whatsapp_templates_v1/i,'revalidação deve consultar template atual');
assert.match(sql,/upper\s*\([^)]*category[^)]*\)\s*=\s*['"]MARKETING['"]/i,'template deve continuar MARKETING');
assert.match(sql,/upper\s*\([^)]*status[^)]*\)\s*=\s*['"]APPROVED['"]/i,'template deve continuar APPROVED');
assert.match(sql,/skip_reason/i,'revalidação negativa deve produzir motivo de skip');
assert.match(sql,/for\s+update\s+skip\s+locked/i,'claim concorrente deve usar SKIP LOCKED');
assert.match(sql,/campaign:[^'\n]*snapshot:[^'\n]*customer:/i,'outbox deve usar idempotency key por campaign/snapshot/customer');
assert.match(sql,/whatsapp_enqueue_outbound_v1|insert\s+into\s+public\.whatsapp_outbox_v1/i,'dispatch deve reutilizar outbox canônica');

assert.doesNotMatch(sql,/graph\.facebook\.com|sendTemplateViaMeta/i,'SQL de execução não pode implementar cliente Graph');
assert.doesNotMatch(sql,/create\s+or\s+replace\s+function\s+public\.[^(]*(?:set|update|promote)[^(]*execution_runtime/i,'Task 1 não pode expor RPC para promover runtime');

const wamidFixPath='supabase/migrations/20261005025000_marketing_campaign_wamid_regex_fix_v1.sql';
assert.equal(fs.existsSync(wamidFixPath),true,'migration de correção do WAMID deve existir');
const wamidFix=fs.readFileSync(wamidFixPath,'utf8');
assert.match(wamidFix,/create\s+or\s+replace\s+function\s+public\.marketing_finish_dispatch_v1\s*\(/i,'fix deve substituir marketing_finish_dispatch_v1');
assert.equal(wamidFix.includes("p_provider_message_id !~ '^wamid\\.'"),true,'WAMID deve aceitar prefixo literal wamid.');
assert.equal(wamidFix.includes("p_provider_message_id !~ '^wamid\\\\.'"),false,'regex não pode exigir barra invertida literal antes do ponto');
assert.match(wamidFix,/revoke\s+all\s+on\s+function\s+public\.marketing_finish_dispatch_v1[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,'fix deve manter RPC service-role only');
assert.match(wamidFix,/grant\s+execute\s+on\s+function\s+public\.marketing_finish_dispatch_v1[\s\S]*to\s+service_role/i,'fix deve manter grant service_role');

console.log('PASS test-whatsapp-marketing-campaign-execution-v1');
