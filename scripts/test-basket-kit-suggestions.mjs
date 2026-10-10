import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const src=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const code=src.slice(src.indexOf('function basketNorm('),src.indexOf('async function basketKitsAdmin('));
const ctx=vm.createContext({URL,tx:(v,n=500)=>String(v??'').slice(0,n),id:v=>v});
vm.runInContext(stripTypeScriptTypes(code),ctx);
const base={id:'rice',name:'Arroz 5kg',packaging:'5kg',price:20,subcategory:'Alimentos'};
const candidates=[
  {id:'other-rice',name:'Arroz 5kg',packaging:'5kg',price:21,subcategory:'Alimentos'},
  {id:'jelly',name:'Geleia 5kg',packaging:'5kg',price:20,subcategory:'Alimentos'},
  {id:'small-rice',name:'Arroz 1kg',packaging:'1kg',price:20,subcategory:'Alimentos'},
  {id:'expensive',name:'Arroz 5kg',packaging:'5kg',price:40,subcategory:'Alimentos'}
];
const stock=new Map([
  ['other-rice',{loose_sellable_stock:50}],
  ['small-rice',{loose_sellable_stock:40}],
  ['expensive',{loose_sellable_stock:0}],
  ['jelly',{loose_sellable_stock:50}]
]);
const catalog=new Map([['rice','arroz'],['other-rice','arroz'],['jelly','geleia'],['small-rice','arroz'],['expensive','arroz']]);
assert.deepEqual(
  Array.from(await ctx.basketKitSuggestions(base,candidates,stock,1,catalog,15),x=>x.id),
  ['other-rice','small-rice','expensive'],
  'todos os outros produtos da mesma família devem ser sugeridos; preço, embalagem e estoque não podem ocultá-los'
);
assert.equal((await ctx.basketKitSuggestions(base,candidates,stock,1,new Map(),15)).length,0,'produto sem família não admite inferência por categoria');
catalog.delete('rice');
assert.equal((await ctx.basketKitSuggestions(base,candidates,stock,1,catalog,15)).length,0,'produto removido do catálogo não produz alternativas');
assert.equal(ctx.basketKitPackageCompatible({name:'Arroz 1kg'},{name:'Arroz 1000g'}),true);
assert.equal(ctx.basketKitPackageCompatible({name:'Óleo 900ml'},{name:'Óleo 1l'}),true);
assert.equal(ctx.basketKitPackageCompatible({name:'Produto 1kg'},{name:'Produto 1l'}),false);
let enabled=false;
const reads=[];
// The remote database is replaced at its I/O boundary; route and family membership run unchanged.
ctx.db={from(table){const filters=[];reads.push({table,filters});const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},order(){return q},maybeSingle(){return q},then(resolve){const data=table==='basket_lot_substitution_products'?(filters.some(([k])=>k==='product_id')?{family_key:'arroz'}:[{product_id:'rice'},{product_id:'other-rice'},{product_id:'small-rice'},{product_id:'expensive'}]):table==='basket_lot_substitution_rules'?{enabled,label:'Arroz'}:table==='products'?[base,...candidates.filter(x=>x.id!=='jelly')]:null;return Promise.resolve({data,error:null}).then(resolve)}};return q}};
ctx.basketLooseStockMap=async()=>stock;
const url=new URL('https://example.test/?product_id=rice&quantity_per_kit=1');
assert.equal((await ctx.basketKitProductSuggestions(url)).suggestions.length,0,'família desativada não pode gerar alternativas na API');
assert.equal(reads.some(r=>r.table==='products'),false,'família desativada não consulta produtos');
enabled=true;
const apiResult=await ctx.basketKitProductSuggestions(url);
assert.equal(apiResult.family_key,'arroz');
assert.equal(apiResult.family_label,'Arroz');
assert.deepEqual(Array.from(apiResult.suggestions,x=>x.id),['other-rice','small-rice','expensive'],'API deve devolver a família inteira, com sem-estoque no fim');
assert.equal(apiResult.suggestions.find(x=>x.id==='expensive').loose_stock,0,'produto sem estoque continua visível');
assert.equal(reads.some(r=>r.table==='basket_lot_automation_settings'),false,'API não depende da automação antiga');
assert.deepEqual(reads.find(r=>r.table==='products').filters.find(([k])=>k==='id')[1],['rice','other-rice','small-rice','expensive'],'consulta deve limitar produtos à família cadastrada');
assert.equal((await ctx.basketKitProductSuggestions(new URL('https://example.test/?product_id=rice&quantity_per_kit=101'))).error,'invalid_quantity');
console.log('basket kit suggestions: PASS');
