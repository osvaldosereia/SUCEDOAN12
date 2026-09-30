import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
assert.match(html,/function start\(\)\{setTab\('today'\)\}/,'Admin deve abrir a Central diretamente');
assert.doesNotMatch(html,/async function start\(\)\{[\s\S]{0,200}api\('health'\)/,'Startup não deve bloquear esperando health antes da Central');

const match=html.match(/<script>\s*\(\(\)=>\{([\s\S]*?)\}\)\(\);\s*<\/script>/);
assert.ok(match,'Script principal do Admin não encontrado');
assert.doesNotThrow(()=>new Function(`(()=>{${match[1]}})();`),'JavaScript do Admin deve compilar');
console.log('OK · Admin abre a Central sem roundtrip health redundante.');
