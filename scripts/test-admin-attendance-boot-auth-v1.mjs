import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('vitrine/admin/atendimento/attendance-app.js','utf8');

assert.match(app,/import\s*\{[^}]*ensureAttendanceToken[^}]*\}\s*from\s*['"]\.\/attendance-auth\.js['"]/,'boot deve importar ensureAttendanceToken do cliente compartilhado');
assert.match(app,/async function boot\(\)[\s\S]*await ensureAttendanceToken\(\)/,'boot deve garantir sessão válida antes de carregar contas e fila');
assert.doesNotMatch(app,/\badminToken\s*\(/,'boot não pode chamar helper adminToken removido pelo refactor');

console.log('OK · boot do Atendimento usa o cliente compartilhado de autenticação sem referência removida.');
