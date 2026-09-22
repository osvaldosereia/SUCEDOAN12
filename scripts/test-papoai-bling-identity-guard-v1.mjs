import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922070000_papoai_bling_identity_guard_v1.sql','utf8');
for(const x of [
'get_papoai_commerce_bling_identity_readiness_v1',
"'cpf_cnpj_required_for_bling_resolution'",
"'bling_contact_already_bound'",
"'document_available_for_resolution'",
'customer_snapshot=v_snapshot',
"'use_bling_contact_id_else_require_cpf_cnpj'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: PapoAI Bling identity guard contract');
