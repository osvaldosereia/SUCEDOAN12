import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const admin=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/async function blingHubFinanceAuthorizedUser\(/);
assert.match(hub,/finance_auth_required/);
assert.match(hub,/finance_session_invalid/);
assert.match(hub,/finance_owner_required/);
assert.match(hub,/sb\.auth\.getUser\(token\)/);
assert.match(hub,/admin\.role!==["']owner["']/);
assert.match(hub,/actor_user_id:actorUserId/);

const internal=hub.slice(hub.indexOf('if(action==="vitrine_bling_hub_internal")'));
const authPos=internal.indexOf('blingHubFinanceAuthorizedUser');
const actionPos=internal.indexOf('blingHubFinanceAction(sb,body');
assert.ok(authPos>=0&&actionPos>authPos,'finance action must validate owner before executing');

assert.match(admin,/Access-Control-Allow-Headers["']:\s*["']content-type,authorization["']/);
assert.match(admin,/authorization=req\.headers\.get\(["']Authorization["']\)/);
assert.match(admin,/finance_auth_required/);
assert.match(admin,/blingHubControl\(["']finance_action["'],payload\|\|\{\},authorization\)/);
assert.match(admin,/\.\.\.\(authorization\?\{["']Authorization["']:authorization\}:\{\}\)/);

assert.match(html,/FINANCE_AUTH_API=.*admin-pin-auth-v1/);
assert.match(html,/FINANCE_VERIFY_API=.*\/auth\/v1\/verify/);
assert.match(html,/sessionStorage\.setItem\(["']da_finance_access_token_v1["']/);
assert.match(html,/sessionStorage\.removeItem\(["']da_finance_access_token_v1["']/);
assert.doesNotMatch(html,/localStorage\.setItem\(["']da_finance_access_token_v1/);
assert.match(html,/PIN administrativo/);
assert.match(html,/pattern=["']\[0-9\]\{6\}["']/);
assert.match(html,/Authorization["']:\s*["']Bearer ["']\+token/);
assert.match(html,/Bloquear financeiro/);
assert.doesNotMatch(html,/service[_-]?role/i);
assert.doesNotMatch(html,/PIN[^\n]{0,30}value=["'][0-9]{6}["']/i);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length);
for(const source of scripts)new Function(source);

console.log('OK · Bling Finance R4 exige step-up PIN e sessão owner para ações sensíveis');
