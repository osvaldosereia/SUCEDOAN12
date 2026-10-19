import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/index.html','utf8')+'\n'+fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');

assert.match(html,/data-tab="attendance"[^>]*>[\s\S]{0,120}<span>Atendimento<\/span>/,'menu Operação deve conter Atendimento');
assert.match(html,/function\s+renderAttendance\s*\(\s*\)/,'renderAttendance deve existir');
assert.match(html,/location\.assign\(['"]\/vitrine\/admin\/atendimento\/['"]\)/,'Admin deve navegar para a página standalone do Atendimento');
assert.match(html,/if\s*\(tab==='attendance'\)\s*renderAttendance\(\)/,'setTab deve carregar Atendimento sob demanda');
assert.doesNotMatch(html,/<iframe[^>]+src=["']\/vitrine\/admin\/atendimento\//i,'iframe não pode carregar no boot do Admin');

const runtime=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
assert.match(html,/<script src="\/vitrine\/admin\/admin-runtime\.js\?/,'runtime principal deve ser carregado externamente');
new Function(runtime);

console.log('OK · Atendimento abre em página standalone e runtime externo compila.');
