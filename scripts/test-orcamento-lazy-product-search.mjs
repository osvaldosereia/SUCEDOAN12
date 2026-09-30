import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('orcamento/app-original.html','utf8');

assert.doesNotMatch(html,/for\(let page=0;page<100;page\+\+\)/,'Orçamento não deve paginar o catálogo inteiro ao abrir');
assert.match(html,/async function fetchAdminProducts\(q\)/,'Busca de produtos deve receber o termo pesquisado');
assert.match(html,/adminGet\('products',\{limit:40,offset:0,active:'true',q:query\}\)/,'Busca deve consultar no máximo 40 produtos por termo');
assert.match(html,/function scheduleProductSearch\(\)/,'Busca deve usar debounce');
assert.match(html,/\$\('productSearch'\)\.addEventListener\('input',scheduleProductSearch\)/,'Campo de produto deve usar busca sob demanda');
assert.match(html,/Busca sob demanda/,'Tela deve deixar claro que o catálogo não é pré-carregado');

const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.ok(scripts.length,'Script principal do orçamento não encontrado');
for(const script of scripts)assert.doesNotThrow(()=>new Function(script),'JavaScript inline do orçamento deve compilar');

console.log('OK · orçamento usa busca de produtos sob demanda sem pré-carga total.');
