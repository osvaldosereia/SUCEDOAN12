import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/sql/20261021_ean_capture_storefront_stock_authority_v1.sql','utf8');
const api=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const view='public.storefront_ean_sellable_stock_v1';
assert.match(sql,/CREATE OR REPLACE VIEW public\.storefront_ean_sellable_stock_v1/i);
assert.match(sql,/security_invoker\s*=\s*true/i);
assert.match(sql,/WHERE c\.matched_product_id=s\.product_id AND c\.sync_status='found'/i);
assert.match(sql,/ORDER BY c\.created_at DESC,c\.id DESC/i);
assert.match(sql,/FLOOR\(LEAST\(e\.quantity, p\.stock\)\)/i);
assert.match(sql,/p\.validity_date<CURRENT_DATE/i);
assert.match(sql,/e\.expires_on<CURRENT_DATE/i);
assert.match(sql,/COALESCE\(p\.price,0\)<=0/i);
assert.match(sql,/r\.status='consumed'.*COALESCE\(r\.consumed_at,r\.updated_at,r\.created_at\)>e\.created_at/i);
assert.match(sql,/r\.status IN \('reserved','allocated'\)/i);
assert.match(sql,/REVOKE ALL ON public\.storefront_ean_sellable_stock_v1 FROM PUBLIC, anon, authenticated/i);
assert.match(sql,/GRANT SELECT ON public\.storefront_ean_sellable_stock_v1 TO service_role/i);
assert.match(sql,/ean_stock_checkout_patch_anchor_mismatch/);
assert.match(sql,/ean_stock_reservation_patch_anchor_mismatch/);
assert.match(sql,/v_available:=greatest\(0,v_effective\)/);
assert.match(sql,/if v_effective is not null then/i);
assert.match(sql,/basket_component_fresh_sellable_stock_v1/);
assert.match(api,/db\.from\("storefront_ean_sellable_stock_v1"\)/);
assert.match(api,/ean_sellable_stock\?\?r\.loose_sellable_stock/);
assert.match(api,/base-\(eanAvailable\?0:/);
assert.equal((api.match(/db\.from\("ops2_loose_sellable_stock_v1"\)/g)||[]).length,0,'public API must use the same checkout source');

// Public EAN lists must omit items rejected by checkout while paginating without duplicates.
assert.match(api,/candidate\.stock_quantity>0&&candidate\.price_available/);
assert.match(api,/p\.is_whatsapp_active!==true/);
assert.match(api,/next_offset:cursor<ordered\.length\?cursor:null/);
const start=api.indexOf('async function productList('),end=api.indexOf('async function oneProduct(',start);
assert.ok(start>0&&end>start);
const definition=api.slice(start,end).replace('url:URL','url').replaceAll(':any','').replace('const publicRows[]=[]','const publicRows=[]');
const products=[
  {id:'a',price:5,is_active:true,is_whatsapp_active:true},
  {id:'b',price:0,is_active:true,is_whatsapp_active:true},
  {id:'c',price:3,is_active:true,is_whatsapp_active:true},
  {id:'d',price:8,is_active:true,is_whatsapp_active:true},
  {id:'e',price:4,is_active:true,is_whatsapp_active:true},
  {id:'f',price:2,is_active:false,is_whatsapp_active:false}
];
const balances=new Map([['a',4],['b',8],['c',0],['d',9],['e',2],['f',30]]);
const query={select(){return this},in(){return this},limit(){return this},eq(){return this},or(){return this},
 then(resolve){return Promise.resolve({data:products,error:null}).then(resolve)}};
const getList=new Function('db','eanCaptureProductIds','sellableMap','pub','txt','safeQ','clamp',
 definition+'; return productList;')(
 {from:()=>query},async()=>products.map(x=>x.id),
 async ids=>new Map(ids.map(id=>[id,balances.get(id)||0])),
 (p,stock)=>({id:p.id,stock_quantity:stock,price_available:p.price>0}),
 v=>String(v||''),v=>String(v||''),(v,min,max)=>Math.min(max,Math.max(min,Number(v)))
);
const first=await getList(new URL('https://example.test/?limit=2'));
assert.deepEqual(first.products.map(x=>x.id),['a','d']);
assert.equal(first.next_offset,4);
const second=await getList(new URL('https://example.test/?limit=2&offset='+first.next_offset));
assert.deepEqual(second.products.map(x=>x.id),['e']);
assert.equal(second.next_offset,null);

console.log('EAN public stock authority contracts PASS: latest scan, expiration, pricing, consumed and pending reservations, checkout and public stock parity');
