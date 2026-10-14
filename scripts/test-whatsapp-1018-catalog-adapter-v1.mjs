import assert from 'node:assert/strict';
import {project1018Catalog} from '../supabase/functions/_shared/ana-1018-catalog-adapter-v1.mjs';
const products=[
 {id:'1',name:'Arroz Dubom',active:true,stock:4,priceCents:2590,category:'Mercearia',imageUrl:'https://example.com/arroz.jpg'},
 {id:'2',name:'Cesta econômica',kind:'basket',active:true,stock:2,priceCents:5500,customerBasketPriceCents:7990,hiddenAdjustmentCents:2490,category:'Cestas'},
 {id:'3',name:'Indisponível',active:true,stock:0,priceCents:500,category:'Mercearia'},
 {id:'4',name:'Vencido',active:false,stock:9,priceCents:500,category:'Mercearia'},
 {id:'5',name:'Sem preço',active:true,stock:4,priceCents:null,category:'Mercearia'}
];
const out=project1018Catalog({products});assert.equal(out.ok,true);assert.equal(out.rows.length,2);
assert.equal(out.rows[1].priceCents,7990);assert.doesNotMatch(JSON.stringify(out),/hiddenAdjustment|2490|5500/);
assert.equal(project1018Catalog({products,query:'arroz'}).rows.length,1);
assert.equal(project1018Catalog({products,category:'Cestas'}).rows.length,1);
assert.equal(project1018Catalog({products,limit:51}).reason,'invalid_limit');
assert.equal(project1018Catalog({products:[{id:'6',name:'Falha',active:true,stock:3,priceCents:undefined}]}).rows.length,0);
console.log('PASS 1018 catalog projection: no out-of-stock, no hidden basket adjustments, no unpriced items');
