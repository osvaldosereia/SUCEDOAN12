import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const file='comprar/products.js';
assert.doesNotThrow(()=>readFileSync(file,'utf8'),'products.js deve existir');
const js=readFileSync(file,'utf8');

assert.doesNotMatch(js,/window\.fetch\s*=/,'produtos não podem interceptar fetch');
assert.doesNotMatch(js,/new\s+MutationObserver/,'produtos não podem observar globalmente o DOM');
for(const name of ['generation','desiredQuantity','confirmedQuantity','syncing','pendingProductSyncs','waitForPending']){
  assert.match(js,new RegExp(`\\b${name}\\b`),`produtos devem implementar ${name}`);
}
for(const label of ['Para Você','Para Casa','Ofertas','Buscar produto','Todos']){
  assert.match(js,new RegExp(label),`produtos devem conter ${label}`);
}
assert.match(js,/chips-categories/,'categorias principais devem ter linha própria');
assert.match(js,/chips-subcategories/,'subcategorias devem ter linha própria');
assert.match(js,/products-filter-sticky/,'busca e filtros devem ter contêiner sticky');
assert.match(js,/async\s+function\s+syncProduct/,'sincronização deve ter loop explícito por produto');
const syncStart=js.indexOf('async function syncProduct');
const waitStart=js.indexOf('async function waitForPending');
const syncBlock=js.slice(syncStart,waitStart>syncStart?waitStart:undefined);
assert.match(syncBlock,/while\s*\(/,'sincronização deve consolidar cliques em loop');
assert.doesNotMatch(syncBlock.slice(syncBlock.indexOf('{')+1),/\bsyncProduct\s*\(/,'loop não pode se chamar recursivamente');
assert.match(js,/registerPendingProductSync/,'cada sincronização deve ser registrada no estado central');
assert.match(js,/set_quantity/,'produto deve persistir quantidade pela API oficial');
assert.match(js,/if\s*\(\s*requestGeneration\s*!==\s*generation\s*\)/,'respostas antigas de filtros/listagem devem ser ignoradas');
assert.match(js,/openDetail/,'detalhe do produto deve pertencer ao mesmo módulo');
assert.match(js,/closeDetail/,'detalhe deve fechar sem módulo decorador');

console.log('OK: contrato limpo de produtos');
