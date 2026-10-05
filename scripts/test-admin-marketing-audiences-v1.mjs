import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiPath='supabase/functions/admin-marketing-audiences-v1/index.ts';
assert.equal(fs.existsSync(apiPath),true,'Edge Admin de públicos/consentimentos deve existir');
const source=fs.readFileSync(apiPath,'utf8');

assert.match(source,/async\s+function\s+adminAuth\s*\(/,'API deve autenticar sessão Admin');
assert.match(source,/Authorization/i,'API deve exigir bearer Admin');
assert.match(source,/admin_users/,'API deve validar usuário ativo no cadastro Admin');
assert.match(source,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/,'service role deve existir somente server-side');
assert.doesNotMatch(source,/req\.headers\.get\([^)]*service|body\?\.(?:service_role|service_key)/i,'browser não pode fornecer service-role');

for(const action of ['overview','preview','consent_history','record_consent']){
  assert.match(source,new RegExp(`['"]${action}['"]`),`ação Admin ausente: ${action}`);
}
assert.match(source,/marketing_preview_audience_v1/,'preview deve chamar RPC server-side');
assert.match(source,/marketing_record_consent_v1/,'registro deve usar RPC canônica de consentimento');
assert.match(source,/marketing_customer_consent_current_v1/,'overview/histórico deve usar estado canônico');
assert.match(source,/marketing_consent_events_v1/,'histórico deve ler ledger append-only');

assert.match(source,/source\s*:\s*['"]admin_marketing['"]|p_source\s*:\s*['"]admin_marketing['"]/,'source do registro manual deve ser forçada no servidor');
assert.match(source,/consent_text_version[\s\S]*consent_text_snapshot/is,'opt-in deve exigir evidência textual/versionada');
assert.match(source,/decision[\s\S]*opt_in[\s\S]*(?:evidence|required|consent_text)/is,'opt-in sem evidência deve ser bloqueado');
assert.match(source,/opt_out[\s\S]*(?:reason|reason_code)/is,'opt-out manual deve registrar motivo explícito');

for(const forbidden of ['waba_id','phone_number_id','to_phone_e164','template_id','template_name','outbox_id','send','dispatch']){
  assert.match(source,new RegExp(forbidden,'i'),`campo/ação proibida deve ser reconhecida e bloqueada: ${forbidden}`);
}
assert.doesNotMatch(source,/graph\.facebook\.com|sendTemplateViaMeta|createTemplateViaMeta|whatsapp_outbox_v1/i,'API de públicos não pode chamar Graph/Meta nem outbox');

assert.match(source,/limit[\s\S]*(?:100|Math\.min)/is,'preview deve limitar paginação a no máximo 100');
assert.match(source,/masked_phone/i,'resposta de audiência deve permanecer mascarada');
assert.match(source,/phone_e164/i,'histórico autenticado pode devolver telefone canônico quando necessário');
assert.match(source,/payload_too_large|filters_too_large|request_too_large/i,'payload/filtros devem ter limite explícito');

console.log('PASS test-admin-marketing-audiences-v1');
