import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261004233000_marketing_consent_ledger_v1.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration do ledger canônico de consentimento deve existir');

const sql=fs.readFileSync(migrationPath,'utf8');

// Ledger append-only e evidência suficiente.
assert.match(sql,/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.marketing_consent_events_v1/i);
for(const column of ['customer_id','phone_e164','decision','source','source_ref','source_event_key','consent_text_version','consent_text_snapshot','occurred_at','recorded_by','metadata','created_at']){
  assert.match(sql,new RegExp(`\\b${column}\\b`,'i'),`coluna obrigatória ausente no ledger: ${column}`);
}
assert.match(sql,/check\s*\([^)]*decision[^)]*(?:opt_in|opt_out)[^)]*(?:opt_in|opt_out)/is,'decision deve aceitar somente opt_in/opt_out');
assert.match(sql,/source_event_key[\s\S]*unique|unique[\s\S]*source_event_key/i,'source_event_key não nulo deve suportar idempotência por unicidade');
assert.match(sql,/before\s+update\s+or\s+delete\s+on\s+public\.marketing_consent_events_v1/is,'ledger deve bloquear UPDATE/DELETE por trigger append-only');

// RPC canônica e ACL.
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.marketing_record_consent_v1\s*\(/i);
assert.match(sql,/p_customer_id\s+uuid/i);
assert.match(sql,/p_decision\s+text/i);
assert.match(sql,/p_source\s+text/i);
assert.match(sql,/p_source_event_key\s+text\s+default\s+null/i);
assert.match(sql,/p_consent_text_version\s+text\s+default\s+null/i);
assert.match(sql,/p_consent_text_snapshot\s+text\s+default\s+null/i);
assert.match(sql,/p_occurred_at\s+timestamptz\s+default\s+now\(\)/i);
assert.match(sql,/p_recorded_by\s+text\s+default\s+['"]system['"]/i);
assert.match(sql,/p_metadata\s+jsonb\s+default\s+['"]?\{\}['"]?::jsonb/i);
assert.match(sql,/canonical_whatsapp_e164_br_v2/i,'RPC deve normalizar telefone canônico');
assert.match(sql,/invalid_decision|decision_invalid/i,'RPC deve rejeitar decisão fora de opt_in/opt_out');
assert.match(sql,/customer_not_found|invalid_customer/i,'RPC deve rejeitar cliente inexistente');
assert.match(sql,/source_event_key[\s\S]*(?:on\s+conflict|select)/i,'RPC deve tratar repetição de source_event_key de forma idempotente');
assert.match(sql,/update\s+public\.customers[\s\S]*marketing_opt_in/is,'RPC deve atualizar estado atual de customers na mesma chamada');
assert.match(sql,/insert\s+into\s+public\.marketing_consent_events_v1/is,'RPC deve inserir evidência mesmo em decisão explícita');
assert.match(sql,/set_config\s*\([^)]*marketing[^)]*true\s*\)/i,'RPC deve suprimir somente o trigger de segurança da própria atualização');
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.marketing_record_consent_v1[\s\S]*from\s+public\s*,?\s*anon\s*,?\s*authenticated/i);
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.marketing_record_consent_v1[\s\S]*to\s+service_role/i);
assert.doesNotMatch(sql,/grant\s+execute\s+on\s+function\s+public\.marketing_record_consent_v1[\s\S]*to\s+(?:anon|authenticated)/i);

// Estado atual: opt-in, opt-out ou nunca consentiu.
assert.match(sql,/create\s+(?:or\s+replace\s+)?view\s+public\.marketing_customer_consent_current_v1/i);
for(const state of ['opt_in','opt_out','never_consented'])assert.match(sql,new RegExp(state,'i'),`estado canônico ausente: ${state}`);

// Trigger de segurança para writes legados diretos.
assert.match(sql,/after\s+update\s+of\s+marketing_opt_in\s+on\s+public\.customers/i);
assert.match(sql,/customer_state_change/i,'mudança legada direta deve ser auditada com source customer_state_change');
assert.match(sql,/current_setting\s*\([^)]*marketing[^)]*true/i,'trigger deve respeitar suppressão local da RPC canônica');

// Backfill não pode transformar todo false antigo em opt-out.
assert.match(sql,/legacy_current_state/i,'opt-ins legados devem receber evidência de backfill');
assert.match(sql,/marketing_opt_in\s+is\s+true/i,'backfill de estado atual deve incluir apenas true');
assert.match(sql,/marketing_optout_events_v1|marketing_optout_events_v2/i,'backfill deve considerar evidência legada de opt-out quando existir');
assert.doesNotMatch(sql,/marketing_opt_in\s+is\s+false[\s\S]{0,240}legacy_current_state/i,'false sem evidência não pode ser inventado como opt-out');

// Opt-out manual do Atendimento passa pela RPC canônica.
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_admin_attendance_marketing_optout_v1\s*\(/i);
assert.match(sql,/marketing_record_consent_v1/i);
assert.match(sql,/attendance_manual_optout/i);
assert.match(sql,/marketing_repurchase_recalc_v1/i,'compatibilidade do recálculo de recompra deve ser preservada');

console.log('PASS test-whatsapp-marketing-consent-ledger-v1');
