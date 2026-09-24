import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const admin=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.equal(fs.existsSync('supabase/functions/bling-finance-actions-v1/index.ts'),false,'R2 deve reutilizar o Hub existente, sem nova Edge Function');
assert.equal(fs.existsSync('scripts/bling-finance-oauth-sync-r2.mjs'),false,'bootstrap OAuth temporário não deve permanecer');

assert.match(hub,/async function blingHubFinanceAction\(/);
assert.match(hub,/financial_account_detail/);
assert.match(hub,/\/contas\/receber\/boletos\?/);
assert.match(hub,/create_preview/);
assert.match(hub,/update_preview/);
assert.match(hub,/settle_preview/);
assert.match(hub,/create_execute/);
assert.match(hub,/update_execute/);
assert.match(hub,/settle_execute/);
assert.match(hub,/human_confirmation_required/);
assert.match(hub,/confirmation_phrase:"CONFIRMAR"/);
assert.match(hub,/idempotency_key_already_used/);
assert.match(hub,/finance_action_uncertain/);
assert.match(hub,/automatic_retry:false/);
assert.match(hub,/reserve_bling_hub_rate_slot_v2/);
assert.match(hub,/status===401/);
assert.match(hub,/status===403/);
assert.match(hub,/status===429/);
assert.match(hub,/usarDataVencimento/);
assert.match(hub,/portador\.id/);
assert.match(hub,/categoria\.id/);
assert.doesNotMatch(hub,/contas\/receber\/boletos\/cancelar/);

assert.match(admin,/"finance_action"/);
assert.match(admin,/action==="bling_finance_action"/);
assert.match(admin,/blingHubControl\("finance_action",payload\|\|\{\},authorization\)/);

assert.match(html,/\+ A pagar/);
assert.match(html,/\+ A receber/);
assert.match(html,/Revisar antes de salvar/);
assert.match(html,/Revisar baixa/);
assert.match(html,/Digite CONFIRMAR/);
assert.match(html,/confirmation:'CONFIRMAR'/);
assert.match(html,/crypto\.randomUUID\(\)/);
assert.match(html,/Não movimenta banco, PIX ou cartão/);
assert.match(html,/não cancela boletos automaticamente/);
assert.doesNotMatch(html,/cancelar.*boleto/i);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length);
for(const source of scripts)new Function(source);

console.log('OK · Bling Finance R2 mantém preview, confirmação humana, idempotência e fail-closed');
