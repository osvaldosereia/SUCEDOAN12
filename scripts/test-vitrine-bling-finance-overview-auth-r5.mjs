import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const admin=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

const internal=hub.slice(hub.indexOf('if(action==="vitrine_bling_hub_internal")'));
const overviewBlock=internal.slice(internal.indexOf('if(subaction==="finance_overview")'),internal.indexOf('if(subaction==="finance_action")'));
assert.match(overviewBlock,/blingHubFinanceAuthorizedUser\(sb,req\)/);
assert.match(overviewBlock,/financeUser\.ok/);
assert.match(overviewBlock,/blingHubFinanceOverview\(sb\)/);

const adminOverview=admin.slice(admin.indexOf('if \(action==="bling_finance_overview"\)'.replace('\\','')));
assert.match(admin,/action==="bling_finance_overview"/);
assert.match(admin,/blingHubControl\("finance_overview",\{\},authorization\)/);
assert.match(admin,/finance_auth_required/);

assert.match(html,/async function financeOverviewApi\(/);
assert.match(html,/action','bling_finance_overview/);
assert.match(html,/Authorization':'Bearer '\+token/);
assert.match(html,/token=await financeStepUp\(\)/);
assert.match(html,/Área protegida/);
assert.match(html,/Financeiro continua bloqueado/);
assert.match(html,/clearFinanceSession\(\);toast\('Financeiro bloqueado'\);renderMore\(\)/);

const renderStart=html.indexOf('async function renderFinance');
const renderEnd=html.indexOf('async function renderProducts',renderStart);
const render=html.slice(renderStart,renderEnd);
assert.ok(render.indexOf('financeStepUp()')>=0);
assert.ok(render.indexOf("financeOverviewApi(token)")>render.indexOf('financeStepUp()'));
assert.doesNotMatch(render,/api\('bling_finance_overview'/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length);
for(const source of scripts)new Function(source);

console.log('OK · Bling Finance R5 protege também o overview financeiro atrás do step-up owner');
