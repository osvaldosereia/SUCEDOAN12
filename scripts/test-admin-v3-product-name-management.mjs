import fs from 'node:fs';
import assert from 'node:assert/strict';

const required=[
  'admin/index.html',
  'admin/nomes-produtos-v3.html',
  'admin/product-name-management.css',
  'supabase/functions/admin-product-names-v1/index.ts'
];
for(const file of required) assert.ok(fs.existsSync(file),`faltando ${file}`);

const index=fs.readFileSync('admin/index.html','utf8');
const page=fs.readFileSync('admin/nomes-produtos-v3.html','utf8');
const css=fs.readFileSync('admin/product-name-management.css','utf8');
const edge=fs.readFileSync('supabase/functions/admin-product-names-v1/index.ts','utf8');

assert.match(index,/nomes-produtos-v3\.html/,'menu do Admin deve apontar para o runtime novo de Nomes dos produtos');
assert.match(index,/Nomes dos produtos/,'rótulo do menu ausente');
assert.match(page,/Atualizar/,'tela deve ter atualização manual explícita');
assert.match(page,/Processar agora/,'gestor deve poder solicitar uma rodada imediata');
assert.match(page,/Clique em Atualizar para consultar/,'tela não deve iniciar travada em Carregando');
assert.doesNotMatch(page,/<script[^>]+type=["']module["']/i,'runtime crítico não deve depender de ES modules nesta tela');
assert.doesNotMatch(page,/product-name-management\.js/i,'runtime novo deve ser autocontido e não depender do módulo que travou no Chrome');
assert.doesNotMatch(page,/setInterval\s*\(/i,'tela de nomes não deve fazer polling automático');
assert.match(page,/Era/i,'rodadas devem mostrar nome anterior');
assert.match(page,/Ficou/i,'rodadas devem mostrar nome novo');
assert.match(page,/openProductEditor|data-edit-product/,'tela deve abrir o editor completo do produto');
assert.match(page,/Aprovar/,'revisão precisa permitir aprovação');
assert.match(page,/Manter nome atual/,'revisão precisa permitir manter o nome');
assert.match(page,/Editar e aplicar/,'revisão precisa permitir editar e aplicar');
assert.match(page,/Não foi possível carregar os dados/i,'falha precisa permanecer visível na própria tela');
assert.match(page,/window\.__DA_NAMES_READY__\s*=\s*true/,'runtime deve expor marcador simples de diagnóstico');
assert.match(page,/response\.text\(\)/,'runtime deve aceitar resposta antes de converter JSON para diagnóstico mais claro');
assert.match(page,/admin-core-v1/,'editor de produto deve reutilizar a API atual do Admin');
assert.match(page,/admin-product-names-v1/,'gestão deve usar a API isolada de normalização');
assert.match(page,/processed_at/,'rodadas devem correlacionar itens pelo horário real de processamento');

const inlineScripts=[...page.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(Boolean);
assert.ok(inlineScripts.length>=1,'runtime inline ausente');
for(const source of inlineScripts) assert.doesNotThrow(()=>new Function(source),'JavaScript inline da gestão de nomes possui erro de sintaxe');

assert.match(edge,/product_name_normalization_jobs/,'API deve consultar jobs de normalização');
assert.match(edge,/product_name_normalization_runs/,'API deve consultar rodadas de normalização');
for(const action of ['product_name_normalization','product_name_normalization_review','product_name_normalization_process_now']) assert.match(edge,new RegExp(action),`ação ${action} ausente`);
assert.match(edge,/dispatch_product_name_normalizer_v1/,'rodada manual deve reutilizar o dispatcher existente');
assert.match(css,/name-normalization/,'estilos da gestão de nomes ausentes');

console.log('admin-v3 product name management contract ok');
