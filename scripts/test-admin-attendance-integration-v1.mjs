import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/data-tab="attendance"[^>]*>[\s\S]{0,120}<span>Atendimento<\/span>/,'menu Operação deve conter Atendimento');
assert.match(html,/function\s+renderAttendance\s*\(\s*\)/,'renderAttendance deve existir');
assert.match(html,/\/vitrine\/admin\/atendimento\/\?embedded=1/,'módulo deve usar a rota standalone aprovada');
assert.match(html,/if\s*\(tab==='attendance'\)\s*renderAttendance\(\)/,'setTab deve carregar Atendimento sob demanda');
assert.match(html,/event\.origin\s*!==\s*location\.origin/,'bridge deve rejeitar outra origem');
assert.match(html,/data\?\.type\s*!==\s*'da-attendance'/,'bridge deve aceitar somente mensagens do módulo');
for(const action of ['open_order','open_customer','open_quote','new_sale'])assert.match(html,new RegExp(`['\"]${action}['\"]`),`bridge ausente: ${action}`);
assert.match(html,/dona_antonia_orcamento_draft_v1/,'orçamento deve reutilizar o draft existente');
assert.doesNotMatch(html,/<iframe[^>]+src=["']\/vitrine\/admin\/atendimento\//i,'iframe não pode carregar no boot do Admin');

const match=html.match(/<script>\s*\(\(\)=>\{([\s\S]*?)\}\)\(\);\s*<\/script>/);
assert.ok(match,'script principal do Admin não localizado');
new Function(match[1]);

console.log('OK · Atendimento integrado ao Admin com lazy load e bridge same-origin.');
