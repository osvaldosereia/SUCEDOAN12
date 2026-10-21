import fs from 'node:fs';
import assert from 'node:assert/strict';

// R5 release contract: public mold composition, loose-stock parity, truthful reservation state and fail-closed personalization.
const sqlPath='supabase/sql/20261006_basket_mold_storefront_checkout_v1.sql';
const apiPath='supabase/functions/storefront-v2/index.ts';
const rootPath='index.html';
const vitrinePath='vitrine/index.html';

assert.equal(fs.existsSync(sqlPath),true,'R5 checkout SQL must exist');
const sql=fs.readFileSync(sqlPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const root=fs.readFileSync(rootPath,'utf8');
const vitrine=fs.readFileSync(vitrinePath,'utf8');

assert.match(sql,/basket_mold/i,'checkout must have a mold-specific path');
assert.match(sql,/basket_mold_positions/i,'server must validate mold positions');
assert.match(sql,/basket_mold_position_options/i,'server must validate allowed product options');
assert.match(sql,/hidden_adjustment/i,'fixed hidden value must be applied server-side');
assert.match(sql,/ops2_loose_sellable_stock_v1/i,'selected mold products must be revalidated against canonical loose stock');
assert.match(sql,/basket_mold_component/i,'mold components must be recorded explicitly in order items');
assert.match(sql,/basket_mold_not_configured|basket_mold_unavailable/i,'missing mold must fail closed');
assert.match(sql,/basket_mold_option_invalid|basket_mold_component_invalid/i,'unapproved substitutions must fail closed');
assert.doesNotMatch(sql,/insert\s+into\s+public\.basket_stock_lots/i,'R5 must not create fake physical lots');

assert.match(api,/basket_mold_public_compositions_v2/i,'storefront must consume the canonical mold generator');
assert.match(api,/const \[gate,mq,bq,pq\]=await Promise\.all\(/,'independent basket configuration reads must be concurrent');
assert.match(api,/moldDetailComposition\(basketId\)/,'detail must reuse generator choices in memory');
assert.match(api,/MOLD_DETAIL_CACHE_MAX_AGE_MS=60_000/,'generator cache must be freshness bounded');
assert.match(api,/const \[products,available,extras\]=await Promise\.all\(/,'stock, price and extras remain fresh reads');
assert.match(api,/const \[products,available,extras\]=await Promise\.all\(/,'optional themes must not delay selected-product stock reads');
assert.match(api,/ops2_loose_sellable_stock_v1/i,'storefront mold detail must use canonical loose sellable stock');
assert.match(api,/loose_sellable_stock/i,'storefront mold detail must read loose sellable stock values');
assert.match(api,/mold_mode\s*:\s*true/i,'public cards must identify mold compositions');
assert.match(api,/composition_number/i,'public cards/details must keep composition identity');
assert.match(api,/basket_mold/i,'storefront API must expose mold detail/order payloads');
assert.match(api,/basket_mold_composition_invalid[^\n]+includes\(e\)\?409:400/i,'mold checkout conflicts must map to HTTP 409');
assert.doesNotMatch(api,/stock_reserved:false,reservation_timing:"on_confirmation"/i,'storefront must not override the database on-create reservation result');
assert.match(api,/stock_reserved:created\.data\?\.stock_reserved===true/i,'storefront event telemetry must reflect the database reservation result');
assert.match(api,/reservation_timing:created\.data\?\.reservation_timing\|\|null/i,'storefront event telemetry must reflect the database reservation timing');

for(const [name,html] of [['root',root],['vitrine',vitrine]]){
  assert.match(html,/type:\s*['"]basket_mold['"]/i,`${name} must put mold compositions in cart as basket_mold`);
  assert.match(html,/composition_number/i,`${name} must keep selected composition number`);
  assert.match(html,/position_id/i,`${name} must send selected mold positions`);
  assert.match(html,/item\.type===['"]basket_mold['"]|item\.type===\"basket_mold\"/i,`${name} checkout must recognize basket_mold cart lines`);
  assert.match(html,/lot_id:item\.type===['"]basket['"]\?\(item\.lot_id\|\|null\):null/i,`${name} physical lot id must remain gated to physical baskets only`);
  assert.match(html,/food_lot_id:item\.type===['"]basket['"]\?\(item\.food_lot_id\|\|null\):null/i,`${name} split food lot id must remain gated to physical baskets only`);
  assert.doesNotMatch(html,/lot_id:item\.type===['"]basket_mold['"]/i,`${name} must not attach a physical lot to mold compositions`);
  assert.doesNotMatch(html,/food_lot_id:item\.type===['"]basket_mold['"]/i,`${name} must not attach a split physical lot to mold compositions`);
  assert.match(html,/const previous=\{\.\.\.item\}[\s\S]*?if\(!ok\)Object\.assign\(item,previous\)/i,`${name} must roll back a mold option rejected during re-quote`);
}


const start=root.indexOf('function moldOptionShortName('),end=root.indexOf('function changeMoldQty(',start);
assert.ok(start>0&&end>start,'public vitrine must synchronize title, image and selected product');
const renderMoldRow=new Function('esc','safeImage','money','remainingStock','formatQty',root.slice(start,end)+'return moldItemRow;')(
  x=>String(x),x=>x,x=>String(x),()=>10,x=>String(x)
);
const sample={
  position_id:'p1',label:'Sabão em Pó Lavagem Perfeita OMO 700 g',
  product_id:'minuano',name:'Sabão em Pó Lavagem Perfeita OMO 700 g',
  image_url:'/old-omo.webp',quantity:1,stock_quantity:10,
  alternatives:[
    {product_id:'minuano',name:'Sabão em Pó Minuano 400 g',image_url:'/minuano.webp',packaging:'400 g',price_cents:522},
    {product_id:'oeste',name:'Sabão em Pó Oeste 800 g',image_url:'/oeste.webp',packaging:'800 g',price_cents:599}
  ]
};
const first=renderMoldRow(sample,0);
assert.match(first,/Clique para trocar este produto/);
assert.doesNotMatch(first,/data-mold-option-choice=/,'closed row must not create alternative product cards');
const openFirst=renderMoldRow(sample,0,true);
assert.match(openFirst,/data-mold-option-choice=/,'expanded row renders alternatives');
assert.match(renderMoldRow({...sample,alternatives:[],alternative_count:2,alternatives_loaded:false},0,true),/Carregando marcas…/,'lightweight response waits for a click');
assert.match(first,/<strong class="checkout-name">Sabão em Pó Minuano 400 g<\/strong>/);
assert.match(first,/<img\b[^>]*src="\/minuano.webp"[^>]*alt="Sabão em Pó Minuano 400 g">/);
assert.match(first,/data-product-detail="minuano"/);
assert.match(openFirst,/data-product-id="minuano" role="option" aria-selected="true"/);
assert.doesNotMatch(first,/<strong class="checkout-name">Sabão em Pó Lavagem Perfeita OMO 700 g<\/strong>/);
const second=renderMoldRow({...sample,product_id:'oeste'},0,true);
assert.match(second,/<strong class="checkout-name">Sabão em Pó Oeste 800 g<\/strong>/);
assert.match(second,/<img\b[^>]*src="\/oeste.webp"[^>]*alt="Sabão em Pó Oeste 800 g">/);
assert.match(second,/data-product-detail="oeste"/);
assert.match(second,/data-product-id="oeste" role="option" aria-selected="true"/);


const variants=Array.from({length:12},(_,i)=>({product_id:'product-'+i,name:'Marca '+i,image_url:'/test-'+i+'.webp',packaging:'1 kg',price_cents:1200-i*70,stock_quantity:100}));
const unsortedItem={...sample,product_id:'product-11',alternatives:variants};
const tenHtml=renderMoldRow(unsortedItem,0,true);
assert.equal((tenHtml.match(/data-mold-option-choice="0"/g)||[]).length,10,'at most ten available options');
assert.match(tenHtml,/class="basket-option-grid basket-option-carousel-track"/,'horizontal carousel track');
assert.match(tenHtml,/data-mold-option-arrow="0"/,'previous and next arrows');
assert.match(tenHtml,/data-mold-option-track="0"/,'preserve scroll offset on quote');
const ids=[...tenHtml.matchAll(/data-product-id="(product-\d+)" role="option"/g)].map(m=>m[1]);
assert.deepEqual(ids,Array.from({length:10},(_,i)=>'product-'+(11-i)),'ten alternatives must appear cheapest first');
assert.match(tenHtml,/data-product-id="product-11" role="option" aria-selected="true"/,'the lowest-priced in-stock option is selected first');
assert.doesNotMatch(tenHtml,/data-product-id="product-0" role="option"/,'the 11th and 12th expensive options are not visible');
assert.match(root,/scroll-snap-type:x mandatory/,'carousel must support touch scroll snapping');
assert.match(root,/carouselScroll=new Map/,'requoting must retain user carousel scroll position');
assert.match(api,/publicAlts=alts\.slice\(0,10\)/,'API exposes the ten cheapest available options');
assert.match(api,/const readIds=includeAlternatives\?productIds:selectedIds/,'initial lightweight response reads selected products only');
assert.match(api,/alternatives_loaded:false,alternatives:\[\]/,'lightweight response excludes alternatives');
assert.match(api,/action==="basket_mold_options"/,'separate lazy options route');
assert.match(root,/lightweight:1/,'initial basket request uses small payload');
assert.match(root,/lightweight:true/,'quote request uses small payload');
assert.match(root,/await api\('basket_mold_options'/,'alternative brands fetched after click');
assert.doesNotMatch(api,/randomized=alts\.slice/,'API must not randomize price ordering');

console.log('basket mold storefront R5: PASS');
