import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.doesNotMatch(
  html,
  /frame\.src\s*=\s*['"]\/vitrine\/admin\/atendimento\/\?embedded=1['"]/,
  'Atendimento não pode usar caminho absoluto: quebra quando o Admin está sob /br/'
);
assert.match(
  html,
  /frame\.src\s*=\s*['"]\.\/atendimento\/\?embedded=1['"]/,
  'Atendimento deve usar caminho relativo ao diretório atual do Admin'
);

console.log('OK · iframe do Atendimento acompanha o prefixo atual do Admin.');
