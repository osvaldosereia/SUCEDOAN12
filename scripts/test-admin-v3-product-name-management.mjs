import fs from 'node:fs';
import assert from 'node:assert/strict';

const required=[
  'admin-v3/index.html',
  'admin-v3/nomes-produtos.html',
  'admin-v3/product-name-management.js',
  'admin-v3/product-name-management.css',
  'supabase/functions/admin-v3-product-names/index.ts'
];
for(const file of required) assert.ok(fs.existsSync(file),`faltando ${file}`);

const index=fs.readFileSync('admin-v3/index.html','utf8');
const page=fs.readFileSync('admin-v3/nomes-produtos.html','utf8');
const app=fs.readFileSync('admin-v3/product-name-management.js','utf8');
const css=fs.readFileSync('admin-v3/product-name-management.css','utf8');
const edge=fs.readFileSync('supabase/functions/admin-v3-product-names/index.ts','utf8');

assert.match(index,/nomes-produtos\.html/,'menu de Nomes dos produtos ausente');
assert.match(index,/Nomes dos produtos/,'rótulo do menu ausente');
assert.match(page,/Atualizar/,'tela deve ter atualização manual explícita');
assert.match(page,/Processar agora/,'gestor deve poder solicitar uma rodada imediata');
assert.doesNotMatch(app,/setInterval\s*\(/i,'tela de nomes não deve fazer polling automático');
assert.doesNotMatch(app,/setTimeout\s*\([^\n]*(?:loadData|normalizationApi)/i,'tela de nomes não deve agendar recargas automáticas');
assert.match(app,/Era/i,'rodadas devem mostrar nome anterior');
assert.match(app,/Ficou/i,'rodadas devem mostrar nome novo');
assert.match(app,/openProductEditor|data-edit-product/,'tela deve abrir o editor completo do produto');
assert.match(app,/Aprovar/,'revisão precisa permitir aprovação');
assert.match(app,/Manter nome atual/,'revisão precisa permitir manter o nome');
assert.match(app,/Editar e aplicar/,'revisão precisa permitir editar e aplicar');
assert.match(edge,/product_name_normalization_jobs/,'API deve consultar jobs de normalização');
assert.match(edge,/product_name_normalization_runs/,'API deve consultar rodadas de normalização');
for(const action of ['product_name_normalization','product_name_normalization_review','product_name_normalization_process_now']) assert.match(edge,new RegExp(action),`ação ${action} ausente`);
assert.match(edge,/dispatch_product_name_normalizer_v1/,'rodada manual deve reutilizar o dispatcher existente');
assert.match(css,/name-normalization/,'estilos da gestão de nomes ausentes');

// Regressão 2026-09-14: a tela ficava eternamente em "Carregando…" quando a primeira
// chamada do navegador falhava. A consulta desta subpágina não precisa forçar preflight
// CORS, pois a Edge Function já é pública (verify_jwt=false) e valida a origem.
assert.doesNotMatch(app,/headers\s*:\s*\{[^}]*apikey/i,'consulta de nomes não deve forçar preflight CORS com apikey');
assert.match(app,/renderLoadError/,'falha inicial deve substituir os estados Carregando por erro visível');
assert.match(app,/Não foi possível carregar os dados/i,'mensagem de falha precisa permanecer visível na tela');
assert.match(page,/product-name-management\.js\?v=20260914-2/,'HTML deve forçar a versão corrigida do JS para escapar do cache do GitHub Pages');

console.log('admin-v3 product name management contract ok');
