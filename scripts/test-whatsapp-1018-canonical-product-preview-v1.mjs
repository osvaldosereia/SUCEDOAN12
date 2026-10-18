import assert from 'node:assert/strict';
import {map1018CanonicalProducts} from '../supabase/functions/_shared/ana-1018-canonical-product-preview-v1.mjs';
const payload={ok:true,offers:[{id:'a',name:'Cesta econômica',price_cents:7900,stock_quantity:2,hidden_adjustment:1700},{id:'b',name:'Sem estoque',price_cents:1200,stock_quantity:0},{id:'c',name:'Sem preço',stock_quantity:2}]};
const result=map1018CanonicalProducts({payload});
assert.equal(result.ok,true);assert.equal(result.rows.length,1);assert.equal(result.rows[0].price_cents,7900);
assert.doesNotMatch(JSON.stringify(result),/hidden_adjustment|1700/);
assert.equal(map1018CanonicalProducts({payload:{ok:true}}).ok,false);
console.log('PASS: canonical price, stock, hidden basket privacy and fail-closed mapping');
