import fs from 'node:fs/promises';

const file = process.argv[2] || 'index.html';
const output = process.argv[3] || 'pagespeed-code-audit.md';
const source = await fs.readFile(file, 'utf8');

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const countOccurrences = name => (source.match(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g')) || []).length;

const declarations = new Map();
const functionPattern = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
let match;
while ((match = functionPattern.exec(source))) {
  const name = match[1];
  const line = source.slice(0, match.index).split('\n').length;
  const list = declarations.get(name) || [];
  list.push({ line, kind: 'function declaration' });
  declarations.set(name, list);
}

const assignmentPattern = /(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(/g;
while ((match = assignmentPattern.exec(source))) {
  const name = match[1];
  const line = source.slice(0, match.index).split('\n').length;
  const list = declarations.get(name) || [];
  list.push({ line, kind: 'function assignment' });
  declarations.set(name, list);
}

const duplicateDeclarations = [...declarations.entries()]
  .filter(([, items]) => items.length > 1)
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

const lowReference = [...declarations.entries()]
  .map(([name, items]) => ({ name, items, occurrences: countOccurrences(name) }))
  .filter(item => item.occurrences <= item.items.length)
  .sort((a, b) => a.occurrences - b.occurrences || a.name.localeCompare(b.name));

const repeatedMarkers = [];
for (const token of ['purgeBrowserRuntimeCaches', 'startDeploymentVersionWatch', 'ensureLatestDeployment', 'applyBannersData', 'renderHome', 'handleRoute', 'bindEvents']) {
  repeatedMarkers.push({ token, occurrences: countOccurrences(token) });
}

const lines = [
  '# Auditoria conservadora do index',
  '',
  `Arquivo analisado: \`${file}\``,
  `Tamanho: ${Buffer.byteLength(source)} bytes`,
  '',
  '> Este relatório lista candidatos. Nenhum item deve ser removido apenas por aparecer aqui.',
  '',
  '## Declarações ou atribuições repetidas',
  ''
];

if (!duplicateDeclarations.length) lines.push('Nenhuma declaração repetida detectada pelo analisador simples.');
for (const [name, items] of duplicateDeclarations) {
  lines.push(`- \`${name}\`: ${items.map(item => `${item.kind} na linha ${item.line}`).join('; ')}. Ocorrências totais do nome: ${countOccurrences(name)}.`);
}

lines.push('', '## Funções com baixa evidência de referência', '');
if (!lowReference.length) lines.push('Nenhum candidato detectado.');
for (const item of lowReference) {
  lines.push(`- \`${item.name}\`: ${item.occurrences} ocorrência(s); declaração(ões) nas linhas ${item.items.map(entry => entry.line).join(', ')}.`);
}

lines.push('', '## Marcadores críticos', '');
for (const item of repeatedMarkers) lines.push(`- \`${item.token}\`: ${item.occurrences} ocorrência(s).`);

lines.push('', '## Protocolo obrigatório antes de remover', '',
  '1. Confirmar que o nome não é chamado por HTML inline, atributos `on*`, timers, eventos ou `window`.',
  '2. Confirmar que não é uma implementação-base posteriormente envolvida por wrapper.',
  '3. Confirmar que uma redefinição posterior substitui integralmente a anterior em todas as rotas.',
  '4. Testar home, busca, categoria, produto, carrinho, checkout, banners, kits, cestas e WhatsApp.',
  '5. Remover em pequenos grupos e comparar comportamento e métricas antes/depois.'
);

await fs.writeFile(output, `${lines.join('\n')}\n`, 'utf8');
console.log(`Auditoria salva em ${output}`);
