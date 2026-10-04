import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');

// RED/GREEN contract: configured family suggestions must be first-class data, not an empty search-only picker.
assert.ok(admin.includes('function basketConfiguredFamilyForProduct('),'picker deve expor helper de família configurada');
const start=admin.indexOf('  function basketConfiguredFamilyForProduct(');
const end=admin.indexOf('\n  function ',start+12);
assert.ok(start>0&&end>start,'helper de família configurada deve ser isolado');
const ctx={};vm.createContext(ctx);vm.runInContext(admin.slice(start,end),ctx);
const catalog={families:[
  {family_key:'sabonete',label:'Sabonete',enabled:true,products:[
    {id:'a',name:'Francis Rosa',sku:'P-A',gtin:'7891',loose_stock:12},
    {id:'b',name:'Francis Pink',sku:'P-B',gtin:'7892',loose_stock:8}
  ]},
  {family_key:'arroz',label:'Arroz',enabled:true,products:[{id:'c',name:'Arroz 5kg',loose_stock:30}]}
]};
const fam=vm.runInContext(`basketConfiguredFamilyForProduct(${JSON.stringify(catalog)},'b')`,ctx);
assert.equal(fam.family_key,'sabonete');
assert.equal(fam.products.length,2,'troca deve receber todos os produtos autorizados da família');

assert.ok(admin.includes('Sugestões configuradas'),'picker deve identificar visualmente as sugestões configuradas');
assert.ok(admin.includes('data-basket-auto-family-pick'),'cards configurados devem ser selecionáveis sem busca prévia');
assert.ok(admin.includes('loose_stock'),'cards de sugestão devem exibir estoque solto');
assert.ok(admin.includes('packaging'),'cards de sugestão devem manter embalagem quando disponível');

// Adicionar vários produtos não pode repintar o editor inteiro e apagar busca/resultados.
const searchFnStart=admin.indexOf('  async function searchBasketSubstitutionFamilyProducts(');
const searchFnEnd=admin.indexOf('\n  async function ',searchFnStart+12);
const searchFn=admin.slice(searchFnStart,searchFnEnd);
assert.ok(searchFn.includes('renderBasketFamilyAuthorizedProducts()'),'adição deve atualizar apenas a lista de autorizados');
assert.ok(!searchFn.includes('paintBasketSubstitutionFamilyEditor()'),'adição não pode resetar busca e resultados');

// Categorias já possuem tela própria; abrir não pode disparar o render da aba em paralelo.
const catStart=admin.indexOf('  async function openBasketCategoriesAdmin()');
const catEnd=admin.indexOf('\n  async function ',catStart+12);
const catFn=admin.slice(catStart,catEnd);
assert.ok(catStart>0&&catEnd>catStart,'gestão de categorias deve existir');
assert.ok(!catFn.includes("setActiveTab('baskets')"),'gestão de categorias não deve rerenderizar Cestas ao abrir');
assert.ok(catFn.includes('basket_categories_admin'),'gestão de categorias deve carregar a API existente');

// Composição deve usar cards organizados e ações agrupadas.
assert.ok(admin.includes('basket-auto-compose-card'),'composição deve usar card dedicado');
assert.ok(admin.includes('basket-auto-compose-actions'),'ações do produto devem ficar agrupadas');
assert.ok(admin.includes('basket-auto-compose-meta'),'card deve organizar código, estoque e preço');

console.log('BASKET_FAMILY_PICKER_UX_V1_OK');
