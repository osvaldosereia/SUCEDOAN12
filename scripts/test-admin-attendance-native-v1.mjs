import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const page=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const css=fs.readFileSync('vitrine/admin/atendimento/attendance.css','utf8');

assert.doesNotMatch(admin,/attendanceFrame|<iframe[^>]+atendimento/i,'Atendimento não pode ser embutido em iframe');
assert.doesNotMatch(admin,/data\?\.type\s*!==\s*['"]da-attendance['"]|parent\.postMessage/,'Admin não deve depender de bridge postMessage para Atendimento');
assert.match(admin,/location\.(?:assign|href)\s*\(?['"]\/vitrine\/admin\/atendimento\//,'menu Atendimento deve navegar para a rota administrativa nativa');

assert.doesNotMatch(page,/attendance-layout-v3(?:-bridge|-polish)?\.(?:js|css)/,'página final não pode carregar camadas layout-v3');
assert.doesNotMatch(page,/src=['"]\.\/attendance\.js['"]/,'página final não deve carregar o core legado attendance.js');
assert.match(page,/src=['"]\.\/attendance-app\.js['"]/,'página final deve carregar o core nativo único');
assert.equal((page.match(/<link[^>]+rel=['"]stylesheet['"]/g)||[]).length,1,'Atendimento deve carregar uma única folha de estilo própria');
assert.doesNotMatch(page,/\?embedded=1|parent\.document|postMessage/,'página final deve ser independente de embedding');

assert.match(css,/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*\}/i,'elementos com hidden devem ser realmente removidos do layout, inclusive o estado Carregando conversa');

console.log('OK · arquitetura do Atendimento é nativa e estados hidden não ocupam espaço no layout.');
