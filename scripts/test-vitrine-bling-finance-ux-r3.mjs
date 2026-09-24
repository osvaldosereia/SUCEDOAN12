import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/async function blingHubFinanceCatalogs\(/);
assert.match(hub,/async function blingHubFinanceContactSearch\(/);
assert.match(hub,/\/formas-pagamentos\?situacao=1/);
assert.match(hub,/\/categorias\/receitas-despesas\?tipo=0&situacao=1/);
assert.match(hub,/\/contatos\?/);
assert.match(hub,/criterio:"1"/);
assert.match(hub,/operation==="catalogs"/);
assert.match(hub,/operation==="contact_search"/);

const actionStart=hub.indexOf('async function blingHubFinanceAction');
const actionEnd=hub.indexOf('\nfunction blingHubDigits',actionStart);
const action=hub.slice(actionStart,actionEnd);
const confirmPos=action.indexOf('human_confirmation_required');
const executeTokenPos=action.indexOf('const token=await blingHubOauth(sb);',confirmPos);
assert.ok(confirmPos>0,'confirmation gate missing');
assert.ok(executeTokenPos>confirmPos,'OAuth refresh must occur after human confirmation for writes');

assert.match(html,/loadFinanceCatalogs/);
assert.match(html,/financeContactSearch/);
assert.match(html,/contact_search/);
assert.match(html,/Digite nome, CPF\/CNPJ, e-mail ou código/);
assert.match(html,/select[^>]*name="forma_pagamento_id"/);
assert.match(html,/select[^>]*name="portador_id"/);
assert.match(html,/select[^>]*name="categoria_id"/);
assert.match(html,/Selecione um contato do Bling/);
assert.match(html,/Selecione conta financeira e categoria/);
assert.doesNotMatch(html,/ID do contato no Bling/);
assert.doesNotMatch(html,/ID forma de pagamento/);
assert.doesNotMatch(html,/ID conta financeira \/ portador/);
assert.doesNotMatch(html,/ID categoria/);
assert.match(html,/if\(!\$\('#editor'\)\.open\)\$\('#editor'\)\.showModal\(\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length);
for(const source of scripts)new Function(source);

console.log('OK · Bling Finance R3 troca IDs por seletores e busca de contato sem relaxar confirmação');
