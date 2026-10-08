import assert from 'node:assert/strict';
import {rankAnaAddonProducts} from '../supabase/functions/_shared/ana-addon-recommendations-v1.mjs';
const products=[
{id:'rice',name:'Arroz',is_active:true,loose_sellable_stock:20,effective_price:25,category:'mercearia'},
{id:'soap',name:'Sabão',is_active:true,loose_sellable_stock:15,effective_price:7,category:'limpeza',is_offer:true,offer_price:6},
{id:'milk',name:'Leite',is_active:true,loose_sellable_stock:0,effective_price:6,category:'mercearia'},
{id:'oil',name:'Óleo',is_active:true,loose_sellable_stock:3,effective_price:9,category:'mercearia'},
{id:'inactive',name:'Inativo',is_active:false,loose_sellable_stock:50,effective_price:2},
{id:'badprice',name:'Inválido',is_active:true,loose_sellable_stock:50,effective_price:-1}
];
const args={products,orderProductIds:['rice'],basketComplementIds:['soap'],coPurchaseCounts:{oil:10},interestCategories:['limpeza'],limit:12};
const ranked=rankAnaAddonProducts(args);
assert.equal(ranked[0].product_id,'soap');
assert.ok(ranked[0].reasons.includes('basket_complement'));
assert.ok(ranked[0].reasons.includes('interest'));
assert.ok(ranked[0].reasons.includes('offer'));
assert.ok(ranked.some(x=>x.product_id==='oil'&&x.reasons.includes('co_purchase')));
assert.ok(ranked.some(x=>x.product_id==='rice'&&x.already_in_order));
assert.ok(!ranked.some(x=>['milk','inactive','badprice'].includes(x.product_id)));
assert.deepEqual(rankAnaAddonProducts(args),ranked);
assert.ok(rankAnaAddonProducts({...args,limit:1}).length===1);
assert.ok(rankAnaAddonProducts({...args,limit:100}).length<=12);
console.log('PASS: deterministic recommendations, canonical stock gates and ranking');
