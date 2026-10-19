import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8')+'\n'+fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
assert.match(html,/async function start\(\)[\s\S]*?if\(!uuid\.test\(sharedSeparationId\)\)\{setTab\('today'\);return\}/,'Admin deve abrir a Central quando não há rota profunda');
assert.doesNotMatch(html,/async function start\(\)\{[\s\S]{0,200}api\('health'\)/,'Startup não deve bloquear esperando health antes da Central');

const runtime=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
assert.match(html,/<script src="\/vitrine\/admin\/admin-runtime\.js\?/,'runtime externo não encontrado');
assert.doesNotThrow(()=>new Function(runtime),'JavaScript do Admin deve compilar');
console.log('OK · Admin abre a Central sem roundtrip health redundante.');
