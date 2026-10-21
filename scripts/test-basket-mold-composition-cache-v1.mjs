import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const start=source.indexOf('async function moldDetailComposition('),end=source.indexOf('async function moldDetail(',start);
assert.ok(start>0&&end>start,'detail composition cache helper exists');
const body=source.slice(start,end).replace('basketId:string','basketId').replace('(q:any)', '(q)');
let now=100000,lookupCount=0;
const firstResult={basket_id:'00000000-0000-4000-8000-000000000001',compositions:[{number:1,items:[{position_id:'p1',product_id:'a'}]}]};
const cache=new Map(),inFlight=new Map(),ttl=120000,maxAge=60000;
const fakeDb={rpc:(name,params)=>{
  assert.equal(name,'basket_mold_public_compositions_v2','only the canonical generator can fill the cache');
  assert.equal(params.p_basket_id,firstResult.basket_id);
  lookupCount++;
  return Promise.resolve({data:firstResult,error:null});
}};
const compose=new Function('db','Date','moldCompositionCache','moldDetailCompositionInFlight','MOLD_DETAIL_CACHE_MAX_AGE_MS','MOLD_COMPOSITION_CACHE_TTL_MS',body+';return moldDetailComposition;')(
  fakeDb,{now:()=>now},cache,inFlight,maxAge,ttl
);
const basket=firstResult.basket_id;
const [cold1,cold2]=await Promise.all([compose(basket),compose(basket)]);
assert.deepEqual(cold1,firstResult);
assert.deepEqual(cold2,firstResult);
assert.equal(lookupCount,1,'concurrent cold opens share a single generator request');
await compose(basket);
assert.equal(lookupCount,1,'subsequent opens reuse the same composition');
now+=59000;
await compose(basket);
assert.equal(lookupCount,1,'valid choices are reused before expiry');
now+=2000;
await compose(basket);
assert.equal(lookupCount,2,'expired choices are regenerated');
assert.equal(inFlight.size,0,'inflight promises are cleaned up');
assert.match(source,/const \[products,available,extras\]=await Promise\.all\(/,'products and stock stay outside the cache');
assert.match(source,/payload\?\.lightweight!==true/,'quotes keep canonical selection validation');
assert.match(source,/if\(!selectedId\|\|!candidateIds\.includes\(selectedId\)\)/,'selection cannot escape configured options');
console.log('Basket mold composition cache: concurrent dedup, expiry and live stock contracts PASS');
