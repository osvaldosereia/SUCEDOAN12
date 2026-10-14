import assert from 'node:assert/strict';
import {map1018CanonicalBaskets} from '../supabase/functions/_shared/ana-1018-canonical-basket-preview-v1.mjs';
const payload={ok:true,baskets:[{id:'abc',card_key:'abc@1',name:'Cesta Completa',category_name:'Cestas Completas',display_price_cents:14990,stock_quantity:3,hidden_adjustment_cents:2200,conditional_hidden_applied_cents:500,conditional_hidden_enabled:true,conditional_hidden_product_id:'private',carousel_items:[{product_id:'secret'}]},{id:'def',name:'Indisponivel',display_price_cents:7000,stock_quantity:0}]};
const r=map1018CanonicalBaskets({payload});
assert.equal(r.ok,true);assert.equal(r.rows.length,1);assert.equal(r.rows[0].priceCents,14990);
assert.equal(r.rows[0].cardKey,'abc@1');
for(const value of ['hidden','2200','500','private','secret'])assert.ok(!JSON.stringify(r).includes(value),'leak: '+value);
assert.equal(map1018CanonicalBaskets({payload:{ok:true}}).ok,false);
console.log('PASS 1018 basket privacy: canonical display price only, no hidden adjustments');
