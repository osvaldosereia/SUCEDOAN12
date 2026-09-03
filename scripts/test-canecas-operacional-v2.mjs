import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync('admin-canecas/index.html','utf8');
const deleteGithub=fs.readFileSync('admin-canecas/mug-delete-github-v1.js','utf8');
const catalogRefresh=fs.readFileSync('admin-canecas/li-catalog-refresh-github-v1.js','utf8');
const links=fs.readFileSync('admin-canecas/personalization-test-link-v1.js','utf8');
const dual=fs.readFileSync('admin-canecas/li-dual-sync-v3.js','utf8');
const categories=fs.readFileSync('admin-canecas/mug-inline-category-v3.js','utf8');
const worker=fs.readFileSync('scripts/sincronizar-loja-integrada-v5.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/sincronizar-canecafacil-loja-integrada.yml','utf8');

assert.match(index,/mug-delete-github-v1\.js/,'Admin deve carregar exclusão GitHub.');
assert.match(index,/li-catalog-refresh-github-v1\.js/,'Admin deve carregar recarga de catálogo GitHub-only.');

assert.match(deleteGithub,/acao:'remover'/,'Exclusão publicada deve entrar na fila como remover.');
assert.match(deleteGithub,/sync_via:'github_actions'/,'Remoção deve ser identificada como GitHub Actions.');
assert.match(deleteGithub,/stopImmediatePropagation\(\)/,'Camada GitHub deve impedir o handler legado de exclusão via Make.');
assert.doesNotMatch(deleteGithub,/hook\.[a-z0-9-]+\.make\.com/i,'Exclusão GitHub não deve possuir webhook Make.');
assert.match(deleteGithub,/hasLiEvidenceWithoutId/,'Exclusão deve bloquear produto possivelmente publicado sem ID remoto.');

assert.match(catalogRefresh,/catalog_refs/,'Recarga deve ler o catálogo persistido pelo GitHub.');
assert.match(catalogRefresh,/stopImmediatePropagation\(\)/,'Recarga GitHub deve bloquear o refresh legado via Make.');
assert.doesNotMatch(catalogRefresh,/hook\.[a-z0-9-]+\.make\.com/i,'Recarga normal de categorias não deve chamar Make.');

assert.match(links,/new URL\(`produto\/\$\{encodeURIComponent\(alias\)\}\.html`,STOREFRONT\)/,'Ver/Testar deve usar a página pública real do produto.');
assert.match(links,/cf_personalizador','Teste público deve ativar o personalizador na página real.');

assert.match(dual,/GitHub é o caminho padrão/,'Publicação normal deve declarar GitHub como padrão.');
assert.match(dual,/Publicar selecionadas · Make/,'Make deve permanecer explicitamente como reserva.');
assert.match(categories,/catalog_refs/,'Categoria do grid deve vir do catálogo real persistido.');
assert.match(categories,/solicitado_por: 'admin_categoria_catalogo_github'/,'Troca de categoria publicada deve entrar na fila GitHub.');

assert.match(worker,/text\(item\.acao\) !== 'remover'/,'V5 deve selecionar somente ações de remoção.');
assert.match(worker,/ativo: false/,'Retirada deve desativar produto remoto.');
assert.match(worker,/removido: true/,'Retirada deve marcar produto remoto como removido.');
const confirmIndex=worker.indexOf('const confirmed = await li');
const deleteIndex=worker.indexOf("await fbDelete(`produtos/");
assert.ok(confirmIndex>=0&&deleteIndex>confirmIndex,'Firebase só pode ser apagado depois da leitura de confirmação da Loja Integrada.');
assert.match(worker,/await import\('\.\/sincronizar-loja-integrada-v4\.mjs'\)/,'V5 deve preservar o sincronizador V4 normal após retiradas.');

assert.match(workflow,/sincronizar-loja-integrada-v5\.mjs/,'Workflow principal deve executar V5.');
assert.match(workflow,/cron: '\*\/5 \* \* \* \*'/,'Sincronização deve continuar rodando a cada 5 minutos.');

console.log('OK · Canecas V2: GitHub padrão, retirada confirmada, categorias automáticas e links públicos validados.');