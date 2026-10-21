import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const start=source.indexOf('async function moldAvailableStockMap(');
const end=source.indexOf('\nfunction moldEffectivePriceCents',start);
assert.ok(start>=0&&end>start,'basket stock resolver exists');
const resolverSource=source.slice(start,end)
  .replace('productIds:string[]','productIds')
  .replaceAll('<string,number>','');

const now=Date.now();
const products=[
  {product_id:'bling-active',loose_sellable_stock:120,ean_sellable_stock:0,is_active:true,stock_authority:'bling'},
  {product_id:'ean-active',loose_sellable_stock:120,ean_sellable_stock:0,is_active:true,stock_authority:'legacy_shadow'},
  {product_id:'bling-inactive',loose_sellable_stock:0,ean_sellable_stock:null,is_active:false,stock_authority:'bling',link_status:'matched',bling_product_id:1,selected_deposit_id:1,sellable_virtual:200,basket_locked_quantity:25,mirror_observed_at:new Date(now-60_000).toISOString()},
  {product_id:'bling-stale',loose_sellable_stock:0,ean_sellable_stock:null,is_active:false,stock_authority:'bling',link_status:'matched',bling_product_id:1,selected_deposit_id:1,sellable_virtual:200,basket_locked_quantity:25,mirror_observed_at:new Date(now-49*60*60_000).toISOString()}
];
const reservations=[{product_id:'bling-active',quantity:2,status:'reserved',expires_at:new Date(now+60_000).toISOString()}];
const db={from(table){
  const rows=table==='storefront_ean_sellable_stock_v1'?products:reservations;
  const query={select(){return this},in(){return this},eq(){return this},then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject)}};
  return query;
}};
const resolver=new Function('db','INACTIVE_BASKET_STOCK_MAX_AGE_MS',`${resolverSource}; return moldAvailableStockMap;`)(db,48*60*60_000);
const stocks=await resolver(products.map(row=>row.product_id));

assert.equal(stocks.get('bling-active'),118,'Bling authority must use loose Bling stock and subtract active reservations even when an EAN row says zero');
assert.equal(stocks.get('ean-active'),0,'EAN authority must continue to respect a zero EAN count');
assert.equal(stocks.get('bling-inactive'),175,'inactive basket-only options may use a fresh matched Bling mirror');
assert.equal(stocks.get('bling-stale'),0,'inactive basket-only options must not use stale Bling stock');

console.log('Basket stock authority contract PASS');
