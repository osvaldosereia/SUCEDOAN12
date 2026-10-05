import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');

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

// A troca de produto do lote deve retornar a família inteira: sem limite de preço, embalagem, estoque ou top 7.
const apiStart=edge.indexOf('async function basketKitProductSuggestions(u:URL)');
const apiEnd=edge.indexOf('\nfunction ',apiStart+20);
assert.ok(apiStart>0&&apiEnd>apiStart,'endpoint de sugestões do lote deve existir');
const apiFn=edge.slice(apiStart,apiEnd);
assert.ok(apiFn.includes('basket_lot_substitution_products'),'endpoint deve usar o cadastro explícito da família');
assert.ok(!apiFn.includes('basket_lot_automation_settings'),'endpoint não pode depender da configuração da automação antiga');
assert.ok(!apiFn.includes('price_variation_pct'),'preço não pode limitar membros da família');
assert.ok(!apiFn.includes('basketKitPackageCompatible'),'embalagem não pode ocultar membro autorizado da família');
assert.ok(!apiFn.includes('slice(0,7)'),'família não pode ser truncada para sete sugestões');
assert.ok(apiFn.includes('loose_stock'),'endpoint deve devolver estoque de cada sugestão');

// No fluxo canônico novo, as famílias alimentam os carrosséis do editor guiado.
// O botão global legado de sugestões não deve mais ser exposto no topo.
assert.ok(!admin.includes('id="basketProductSuggestions"'),'botão legado de Sugestões de produtos deve sair do topo de Cestas/Kits');
assert.ok(guided.includes('family_key'),'editor guiado deve preservar a família configurada de cada posição');
assert.ok(guided.includes("call('position_products'"),'editor guiado deve buscar produtos/famílias pela API protegida');
assert.ok(guided.includes('Carregar produtos')||guided.includes('IntersectionObserver'),'carrosséis guiados devem carregar produtos sob demanda');
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