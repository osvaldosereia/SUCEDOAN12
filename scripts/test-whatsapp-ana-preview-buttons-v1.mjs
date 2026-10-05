import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync('vitrine/admin/atendimento/attendance-ana-preview.js','utf8');
const css=fs.readFileSync('vitrine/admin/atendimento/attendance.css','utf8');

for(const label of ['Usar no rascunho','Útil','Não usar','Gerar sugestão da ANA']){
  assert.doesNotMatch(ui,new RegExp(`el\\('button','',\\s*'${label.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}'`),`${label} não pode usar botão sem classe visual`);
}

assert.match(ui,/context-actions assistant-preview-actions/,'ações da ANA devem reutilizar o padrão visual da lateral');
assert.match(ui,/assistant-preview-button/,'botões da ANA devem ter classe semântica própria');
assert.match(ui,/assistant-preview-button primary-action/,'CTA principal da ANA deve usar a variante primária já existente');
assert.match(ui,/assistant-preview-review/,'avaliação da ANA deve manter agrupamento próprio');

assert.match(css,/\.context-actions button/,'CSS base da lateral deve estilizar botões de contexto');
assert.match(css,/\.context-actions \.primary-action/,'CSS base da lateral deve estilizar CTA primário');

console.log('ANA preview buttons contract OK');
