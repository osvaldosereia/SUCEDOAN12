import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function requireText(source, pattern, message) {
  if (!source.includes(pattern)) throw new Error(message);
}

function forbidText(source, pattern, message) {
  if (source.includes(pattern)) throw new Error(message);
}

const loader = read('producao-v2/admin-produtivo.html');
requireText(
  loader,
  "const BUILD = params.get('admin_build') || String(Date.now());",
  'O Admin voltou a gerar uma build diferente em todo F5 e perdeu o cache dos módulos.',
);
requireText(
  loader,
  "fetch(`./index.html?admin_base=${encodeURIComponent(BUILD)}`, { cache: 'default' })",
  'O Admin base não está reutilizando o cache seguro da build atual.',
);
forbidText(
  loader,
  "const BUILD = `${params.get('admin_build') || 'direct'}-${Date.now()}`;",
  'Regressão: a build voltou a mudar em toda recarga.',
);

const deletion = read('producao-v2/js/product-delete-tools.js');
requireText(deletion, 'function scheduleEnhanceRows()', 'A lista não possui agendamento de atualização da exclusão em lote.');
requireText(deletion, 'tableObserver?.disconnect();', 'O observer não é pausado enquanto a própria rotina altera a tabela.');
requireText(deletion, 'new MutationObserver(() => scheduleEnhanceRows())', 'O observer não está protegido pelo agendador.');
requireText(deletion, 'requestAnimationFrame(() => {', 'O reprocessamento da tabela não está limitado a um frame.');
requireText(deletion, 'ensureSelectionControl(row, key);', 'A seleção múltipla deixou de ser instalada nas linhas.');
requireText(deletion, 'ensureDeleteAction(actions, key, enabled);', 'A exclusão individual deixou de ser instalada nas linhas.');
requireText(deletion, 'images: imagePaths(remote, cfg)', 'A exclusão deixou de localizar as imagens vinculadas ao produto.');
requireText(deletion, 'await deleteGithubImage(cfg, path', 'A exclusão deixou de apagar as imagens do GitHub.');
forbidText(deletion, 'new MutationObserver(enhanceRows)', 'Regressão: observer voltou a chamar diretamente a rotina que modifica a própria tabela.');
forbidText(deletion, 'selectCell.innerHTML =', 'Regressão: cada passagem voltou a recriar o checkbox e provocar mutações desnecessárias.');

console.log('Produção: cache do Admin, lista de produtos e exclusão com imagens protegidos contra regressão.');
