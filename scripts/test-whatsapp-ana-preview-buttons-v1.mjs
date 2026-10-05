import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync('vitrine/admin/atendimento/attendance-ana-preview.js','utf8');
const css=fs.readFileSync('vitrine/admin/atendimento/attendance.css','utf8');

for(const label of ['Usar no rascunho','Útil','Não usar','Gerar sugestão da ANA']){
  assert.doesNotMatch(ui,new RegExp(`el\\('button','',\\s*'${label.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}'`),`${label} não pode usar botão sem classe visual`);
}

assert.match(ui,/assistant-preview-actions/,'ações da ANA devem ter agrupamento visual próprio');
assert.match(ui,/assistant-preview-button/,'botões da ANA devem usar classe visual própria');
assert.match(ui,/assistant-preview-button primary/,'CTA principal da ANA deve ter variante primária');
assert.match(ui,/assistant-preview-button danger/,'ação “Não usar” deve ter variante de rejeição');

assert.match(css,/\.assistant-preview-actions\{/,'CSS deve estilizar o grupo de ações da ANA');
assert.match(css,/\.assistant-preview-review\{/,'CSS deve organizar avaliação da ANA');
assert.match(css,/\.assistant-preview-button\{/,'CSS deve estilizar os botões da ANA');
assert.match(css,/\.assistant-preview-button\.primary\{/,'CSS deve destacar o CTA principal');
assert.match(css,/\.assistant-preview-button\.danger\{/,'CSS deve diferenciar a rejeição');

console.log('ANA preview buttons contract OK');
