import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration='supabase/migrations/20261005163000_ana_customer_profile_review_v1.sql';
const mirror='supabase/sql/20261005_ana_customer_profile_review_v1.sql';
const edge='supabase/functions/admin-whatsapp-ana-customer-profile-v1/index.ts';
const api='vitrine/admin/atendimento/attendance-customer-api.js';
const ui='vitrine/admin/atendimento/attendance-customer-profile.js';

assert.equal(fs.existsSync(migration),true,'migration de review deve existir');
assert.equal(fs.existsSync(mirror),true,'espelho SQL de review deve existir');
const sql=fs.readFileSync(migration,'utf8');
for(const token of ['ops2_admin_ana_customer_profile_review_v1','ops2_admin_ana_customer_profile_metrics_v1','ops2_admin_attendance_customer_access_v1(true)','reviewed_accepted','reviewed_rejected','ops2_valid_cpf_cnpj_v1'])assert.match(sql,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`review SQL deve conter ${token}`);
assert.match(sql,/p_outcome[\s\S]*accepted[\s\S]*rejected/i,'review aceita somente accepted/rejected');
assert.match(sql,/field_name\s*=\s*'cpf_cnpj'[\s\S]*ops2_valid_cpf_cnpj_v1/i,'CPF deve ser revalidado deterministicamente');
assert.match(sql,/recommendation\s*=\s*'ignore'[\s\S]*suggestion_not_usable|suggestion_not_usable[\s\S]*recommendation/i,'sugestão marcada ignore não pode ser aceita como utilizável');
assert.match(sql,/from\s+public\.customers[\s\S]*cpf_cnpj[\s\S]*cpf_cnpj_belongs_to_other_customer/i,'review deve bloquear CPF/CNPJ pertencente a outro cliente');
assert.match(sql,/status\s*=\s*case[\s\S]*reviewed_accepted[\s\S]*reviewed_rejected/i,'review deve persistir status auditável');
assert.equal(fs.readFileSync(mirror,'utf8'),sql,'espelho SQL deve ser idêntico');

const edgeSource=fs.readFileSync(edge,'utf8');
assert.match(edgeSource,/action===\s*["']review["']/,'Edge deve expor action review');
assert.match(edgeSource,/action===\s*["']metrics["']/,'Edge deve expor action metrics');
assert.match(edgeSource,/ops2_admin_ana_customer_profile_review_v1/,'Edge review usa RPC protegida');
assert.match(edgeSource,/ops2_admin_ana_customer_profile_metrics_v1/,'Edge metrics usa RPC');
for(const forbidden of ['.from("customers").update',".from('customers').update",'.from("customer_addresses").insert',".from('customer_addresses').insert"])assert.equal(edgeSource.includes(forbidden),false,'review não pode gravar cadastro canônico');

const apiSource=fs.readFileSync(api,'utf8');
assert.match(apiSource,/customerProfileReview/,'API UI deve expor review');
assert.match(apiSource,/customerProfileMetrics/,'API UI deve expor métricas');
const uiSource=fs.readFileSync(ui,'utf8');
assert.match(uiSource,/customerProfileReview/,'Usar/Descartar deve registrar review');
assert.match(uiSource,/['"]accepted['"]/,'Usar no formulário deve marcar accepted');
assert.match(uiSource,/['"]rejected['"]/,'Descartar deve marcar rejected');
assert.doesNotMatch(uiSource,/customerSave\s*\(/,'aceite ainda não salva automaticamente no cadastro');

console.log('ANA customer profile review contract OK');
