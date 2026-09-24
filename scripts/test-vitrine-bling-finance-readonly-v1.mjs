import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const admin=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/async function blingHubFinanceOverview\(/);
assert.match(hub,/\/contas\/receber\?/);
assert.match(hub,/\/contas\/pagar\?/);
assert.match(hub,/\/contas-contabeis\?/);
assert.match(hub,/finance_readonly_overview/);
assert.match(hub,/external_write:false/);
assert.match(hub,/subaction==="finance_overview"/);
assert.match(hub,/finance_receivables/);
assert.match(hub,/finance_payables/);
assert.match(hub,/finance_accounts/);

assert.match(admin,/finance_overview/);
assert.match(admin,/action==="bling_finance_overview"/);
assert.match(admin,/blingHubControl\("finance_overview"\)/);

assert.match(html,/Financeiro · Bling/);
assert.match(html,/bling_finance_overview/);
assert.match(html,/Bling é a fonte oficial/);
assert.match(html,/Contas financeiras do Bling/);
assert.match(html,/Prioridades financeiras/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length);
for(const source of scripts)new Function(source);

console.log('OK · Financeiro Bling R1 somente leitura preserva segurança e contratos do Admin');
