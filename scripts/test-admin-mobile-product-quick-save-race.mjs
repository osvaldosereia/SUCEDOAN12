import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={window:{},String,Number,Object,Boolean,Array,Map,Set};
vm.createContext(context);
vm.runInContext(fs.readFileSync('vitrine/admin/products/mobile-quick-save.js','utf8'),context);

const calls=[],timers=[],states=new Map();
let resolveFirst,resolveSecond;
const products=[{id:'p1',sale_price_cents:200,cost_cents:0,gondola_number:null,expiration_date:null,active:true}];
const save=context.window.DonaAntoniaAdminMobileProductQuickSave.create({
  products:()=>products,
  api:()=>new Promise(resolve=>{calls.push(resolve);if(calls.length===1)resolveFirst=resolve;else if(calls.length===2)resolveSecond=resolve}),
  currentOperator:()=>({id:'operator'}),requireOperator:()=>({id:'operator'}),
  setSaveState:(id,key,value,error='')=>{const row=states.get(id)||{};row[key]=value;row.error=error;states.set(id,row)},
  errorMessage:error=>String(error),
  timers:{clear:()=>{},set:fn=>{timers.push(fn);return timers.length}},
  stockQueue:new Map(),stockZeroPending:new Set(),processStockQueue:()=>{}
});

save.state.drafts.set('p1',{sale_price_cents:100});
const first=save.flush('p1');
await Promise.resolve();
assert.equal(calls.length,1,'first save should start');
save.state.drafts.set('p1',{sale_price_cents:200});
const overlapping=save.flush('p1');
await Promise.resolve();
assert.equal(calls.length,1,'a second save for the same product must wait for the first');

resolveFirst({product:{sale_price_cents:100,cost_cents:0,gondola_number:null,expiration_date:null,active:true}});
await Promise.all([first,overlapping]);
assert.equal(products[0].sale_price_cents,200,'old response must not overwrite a newer draft');
assert.equal(timers.length,1,'latest draft should be scheduled after the first request');
const second=timers[0]();
await Promise.resolve();
assert.equal(calls.length,2,'latest draft should be sent after serialization');
resolveSecond({product:{sale_price_cents:200,cost_cents:0,gondola_number:null,expiration_date:null,active:true}});
await second;
assert.equal(products[0].sale_price_cents,200);
assert.equal(save.state.busy.has('p1'),false);
console.log('admin mobile product quick-save race: PASS');
