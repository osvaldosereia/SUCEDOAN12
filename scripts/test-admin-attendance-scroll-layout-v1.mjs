import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('vitrine/admin/atendimento/attendance.css','utf8');

assert.match(css,/\.conversation-pane\{[^}]*min-height:0[^}]*overflow:hidden[^}]*\}/,'painel da conversa deve ficar confinado à altura do workspace');
assert.match(css,/\.messages\{[^}]*flex:1[^}]*min-height:0[^}]*overflow(?:-y)?:auto[^}]*\}/,'histórico deve ser a área rolável da conversa');
assert.match(css,/\.composer\{[^}]*flex:0\s+0\s+auto[^}]*\}/,'composer deve permanecer fixo no rodapé da coluna');

console.log('OK · histórico rola dentro da conversa e composer permanece visível.');
