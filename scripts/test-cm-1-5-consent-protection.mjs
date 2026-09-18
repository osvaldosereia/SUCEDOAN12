import fs from 'node:fs';
import assert from 'node:assert/strict';

const v1=fs.readFileSync('supabase/migrations/20260918190000_cm_1_5_consent_ledger_customer_protection_v1.sql','utf8');
const v2=fs.readFileSync('supabase/migrations/20260918192500_cm_1_5_canonical_consent_shopping_room_v2.sql','utf8');
const v3=fs.readFileSync('supabase/migrations/20260918194500_cm_1_5_consent_current_state_and_ledger_v3.sql','utf8');
const edge=fs.readFileSync('supabase/functions/customer-intelligence-v1/index.ts','utf8');
const app=fs.readFileSync('admin/app.js','utf8');

assert.match(v1,/customer_contact_suppressions/,'Suppression Engine precisa existir');
assert.match(v1,/marketing_contact_policy_v1/,'Política de contato precisa ser configurável');
assert.match(v1,/evaluate_customer_contact_eligibility_v1/,'Eligibility explicável precisa existir');
assert.match(v1,/marketing_consent_unknown/,'Sem consentimento explícito o marketing deve falhar fechado');
assert.match(v1,/order_in_progress/,'Pedido em andamento precisa ser guardrail');
assert.match(v1,/human_service_in_progress/,'Atendimento humano precisa ser guardrail');
assert.match(v1,/marketing_cooldown/,'Cooldown precisa ser guardrail');
assert.match(v2,/room_save_customer_preferences[\s\S]*record_customer_consent_v1/s,'Comprar precisa escrever no consentimento canônico');
assert.match(v2,/explicit_checkbox/,'Consentimento do Comprar precisa registrar método explícito');
assert.match(v3,/customer_channel_consent_events_v1/,'Ledger append-only separado do estado atual precisa existir');
assert.match(v3,/customer_channel_consents is CURRENT STATE/i,'Contrato deve deixar estado atual explícito');
assert.match(v3,/on conflict\(customer_id,channel,purpose\).*channel_identity_id is null and customer_email_id is null/s,'Estado atual global precisa usar upsert');
assert.match(v3,/customer_channel_consent_events_source_key_uidx/,'Ledger precisa de idempotência');
assert.match(v3,/marketing_opt_in=\(v_current\.status='granted'\)/,'Cache legado deve derivar do ledger/estado canônico');
assert.match(v3,/revoke all on table public\.customer_channel_consent_events_v1 from public,anon,authenticated/,'Ledger deve ser server-only');
assert.match(edge,/action==='contact_eligibility'/);
assert.match(edge,/action==='record_consent'/);
assert.match(edge,/manual_grant_requires_documented_evidence/,'Grant manual não pode ser silencioso');
assert.match(edge,/action==='suppress_contact'/);
assert.match(edge,/action==='release_suppression'/);
assert.match(app,/Proteção do cliente/);
assert.match(app,/Registrar pedido de não receber marketing/);
assert.doesNotMatch(v1+v2+v3,/openai|gpt-|gemini/i,'Consentimento e suppression devem ser determinísticos, sem custo de IA');

console.log('cm-1.5 consent ledger and customer protection contract ok');
