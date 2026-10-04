import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');

// Produto -> família -> todos os membros autorizados são sugestões de troca.
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
  {family_key:'arroz',label:'Arroz',enabled:true,products:[
    {id:'c',name:'Arroz Koblenz 5 kg',loose_stock:30},
    {id:'d',name:'Arroz Bonini 5 kg',loose_stock:40},
    {id:'e',name:'Arroz Urbano 5 kg',loose_stock:0}
  ]}
]};
const fam=vm.runInContext(`basketConfiguredFamilyForProduct(${JSON.stringify(catalog)},'d')`,ctx);
assert.equal(fam.family_key,'arroz');
assert.equal(fam.products.length,3,'troca deve receber todos os produtos autorizados da família');

assert.ok(admin.includes('Sugestões configuradas'),'picker deve identificar visualmente as sugestões configuradas');
assert.ok(admin.includes('data-basket-auto-family-pick'),'cards configurados devem ser selecionáveis sem busca prévia');
assert.ok(admin.includes('loose_stock'),'cards de sugestão devem exibir estoque solto');
assert.ok(admin.includes('packaging'),'cards de sugestão devem manter embalagem quando disponível');
assert.ok(admin.includes('Sem estoque'),'sugestão sem estoque deve ficar claramente sinalizada');

// A aba deve ser somente o catálogo de sugestões por família, sem gerador/fila automática.
assert.ok(admin.includes('id="basketProductSuggestions"'),'Cestas deve expor botão Sugestões de produtos');
assert.ok(admin.includes('>Sugestões de produtos</button>'),'botão deve usar o novo nome');
assert.ok(admin.includes("$('#basketProductSuggestions').onclick=openBasketSubstitutionCatalog;"),'botão deve abrir diretamente o catálogo de famílias');
assert.ok(admin.includes("$('#editorTitle').textContent='Sugestões de produtos';"),'catálogo deve usar o novo título');
assert.ok(admin.includes('Produtos da mesma família aparecem como sugestões de troca entre si.'),'catálogo deve explicar a regra de família');
assert.ok(!admin.includes('Sugestões automáticas de lotes'),'tela antiga de sugestões automáticas deve sair do Admin');
assert.ok(!admin.includes('Gerar sugestões agora'),'geração manual automática deve sair do Admin');
assert.ok(!admin.includes('Automação segura'),'configuração da automação deve sair do Admin');
assert.ok(!admin.includes("basket_lot_suggestion_generate_now_v1"),'Admin não deve chamar gerador automático');
assert.ok(!admin.includes("basket_lot_suggestions_admin_v1"),'Admin não deve carregar fila automática');

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

// Composição manual de lotes continua organizada e independente do antigo gerador.
assert.ok(admin.includes('basket-auto-compose-card'),'composição deve usar card dedicado');
assert.ok(admin.includes('basket-auto-compose-actions'),'ações do produto devem ficar agrupadas');
assert.ok(admin.includes('basket-auto-compose-meta'),'card deve organizar código, estoque e preço');

console.log('BASKET_FAMILY_PICKER_UX_V1_OK');
