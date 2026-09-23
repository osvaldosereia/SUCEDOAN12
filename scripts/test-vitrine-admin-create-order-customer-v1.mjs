import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/async function blingHubEnsureCustomerNow\(sb:any,customerIdRaw:any\)/);
assert.match(hub,/if\(!blingHubValidCpfCnpj\(doc\)\)/);
assert.match(hub,/p_source_system:"canonical_ssbes"/);
assert.match(hub,/p_idempotency_key:"canonical_ssbes:customer:"\+customerId\+":"\+stamp/);
assert.match(hub,/allow_create:true,requested_from:"order_preflight"/);
assert.match(hub,/blingHubProcessCustomerJobs\(sb/);
assert.match(hub,/subaction==="ensure_customer_now"/);

assert.match(vitrine,/ensure_customer_now/);
assert.match(vitrine,/async function ensureBlingCustomerForOrder\(orderId:string\)/);
assert.match(vitrine,/customer_missing_bling_contact_id/);
assert.match(vitrine,/action==="bling_create_order_customer"/);
assert.match(vitrine,/const after=await previewBlingOrderSync\(id\)/);

assert.match(html,/Cadastrar cliente no Bling/);
assert.match(html,/async function createCurrentOrderCustomerInBling\(\)/);
assert.match(html,/O Hub confere o CPF antes de criar para evitar duplicidade/);
assert.match(html,/bling_create_order_customer/);
assert.match(html,/Cliente vinculado ao Bling · pedido revalidado/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · cadastro explícito de cliente do pedido no Bling');
