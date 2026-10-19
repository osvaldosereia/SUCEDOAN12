import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('vitrine/admin/runtime-parts/06-baskets-products.part.js','utf8');
const start=source.indexOf('  async function flushMobileProductQuickSave(id){');
const end=source.indexOf('\n  // Atalho de estoque:',start);
assert.ok(start>=0&&end>start,'quick-save controller source must exist');

const calls=[],timers=[],states=new Map();
let resolveFirst,resolveSecond;
const context={
  state:{products:[{id:'p1',sale_price_cents:200,cost_cents:0,gondola_number:null,expiration_date:null,active:true}]},
  mobileProductQuickDrafts:new Map([['p1',{sale_price_cents:100}]]),
  mobileProductQuickTimers:new Map(),mobileProductQuickBusy:new Set(),mobileProductStockQueue:new Map(),stockZeroPending:new Set(),
  currentOperator:()=>({id:'operator'}),requireOperator:()=>({id:'operator'}),
  setMobileProductSaveState:(id,key,value,error='')=>{const row=states.get(id)||{};row[key]=value;row.error=error;states.set(id,row)},
  processMobileProductStockQueue:()=>{},errorMessage:error=>String(error),
  clearTimeout:()=>{},setTimeout:fn=>{timers.push(fn);return timers.length},
  api:()=>new Promise(resolve=>{calls.push(resolve);if(calls.length===1)resolveFirst=resolve;else if(calls.length===2)resolveSecond=resolve})
};
vm.runInNewContext(source.slice(start,end)+'\n;globalThis.flush=flushMobileProductQuickSave;',context);

const first=context.flush('p1');
await Promise.resolve();
assert.equal(calls.length,1,'first save should start');
context.mobileProductQuickDrafts.set('p1',{sale_price_cents:200});
const overlapping=context.flush('p1');
await Promise.resolve();
assert.equal(calls.length,1,'a second save for the same product must wait for the first');

resolveFirst({product:{sale_price_cents:100,cost_cents:0,gondola_number:null,expiration_date:null,active:true}});
await Promise.all([first,overlapping]);
assert.equal(context.state.products[0].sale_price_cents,200,'old response must not overwrite a newer draft');
assert.equal(timers.length,1,'latest draft should be scheduled after the first request finishes');
const second=timers[0]();
await Promise.resolve();
assert.equal(calls.length,2,'latest draft should be sent after serialization');
resolveSecond({product:{sale_price_cents:200,cost_cents:0,gondola_number:null,expiration_date:null,active:true}});
await second;
assert.equal(context.state.products[0].sale_price_cents,200);
assert.equal(context.mobileProductQuickBusy.has('p1'),false);
console.log('admin mobile product quick-save race: PASS');
