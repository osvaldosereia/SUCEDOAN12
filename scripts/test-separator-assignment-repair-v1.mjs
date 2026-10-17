import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const admin=readFileSync('vitrine/admin/index.html','utf8');
const backend=readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const migration=readFileSync('supabase/sql/20261008_fix_separator_claudio_legacy_check_v1.sql','utf8');

const controls=[...admin.matchAll(/\{key:'(\w+)',label:'([^']+)'\}/g)].map(m=>({key:m[1],label:m[2]}));
for(const key of ['jose','claudio','jovenil','kelly']) assert.ok(controls.some(x=>x.key===key),'missing picker '+key);
for(const key of ['jose','claudio','jovenil','kelly','claudenil'])
  assert.ok(migration.includes("'"+key+"'"),'DB CHECK rejects '+key);
assert.match(migration,/drop constraint if exists order_separation_assignments_v1_separator_key_check/);
assert.doesNotMatch(migration,/update\s+public\.orders\b|delete\s+from\s+public\.orders\b/i,'do not modify order rows');
assert.match(backend,/async function orderSeparationAssign\(/);
assert.match(backend,/ops2_set_order_separator_v2/);
assert.match(backend,/ops2_set_order_separation_item_v2/);
assert.match(backend,/ops2_prepare_order_separation_completion_v2/);

function functionSource(from,to){
  const start=admin.indexOf(from),end=admin.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,'source extraction '+from);
  return admin.slice(start,end);
}
const assignSource=functionSource('async function assignOrderSeparator(', 'async function loadOrderSeparationSheet(');
const markSource=functionSource('async function setOrderSeparationItem(', 'async function resolveOriginalOrderCodeForPackaging(');
assert.match(admin,/body\.scrollTop=savedScroll/,'scroll stays at marked item');
assert.match(admin,/back\.dataset\.separationOrderId===String\(id\)/,'scroll belongs to same order');
assert.match(admin,/back\.dataset\.separationBusy==='1'/,'prevent duplicate writes');
for(const inline of [...admin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]) {
  if(inline[1].trim()) new Script(inline[1]);
}

let callCount=0,loadCount=0,refreshCount=0,lastPayload=null;
const actions=[],messages=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fakeApi=async (endpoint,params,opts)=>{
  assert.equal(endpoint,'order_separation_assign');
  callCount++;
  lastPayload=JSON.parse(opts.body);
  await sleep(20);
  return {ok:true,assignment:{separator_key:'claudio'}};
};
const buttons=[{dataset:{separatorKey:'claudio'},disabled:false,textContent:'Cláudio'},
 {dataset:{separatorKey:'jose'},disabled:false,textContent:'José'}];
const back={dataset:{},querySelectorAll:()=>buttons};
const choose=new Function('ORDER_SEPARATORS','api','toast','errorMessage','loadOrderSeparationSheet','refreshOrderSeparationBoard','confirm',
  assignSource+';return assignOrderSeparator;')(
    controls,fakeApi,msg=>messages.push(msg),e=>e,
    async()=>{loadCount++;},async()=>{refreshCount++;},()=>true
  );
const a=choose('11111111-1111-4111-8111-111111111111','claudio',null,back,buttons[0]);
const b=choose('11111111-1111-4111-8111-111111111111','claudio',null,back,buttons[0]);
assert.equal(back.dataset.separationBusy,'1');
assert.ok(buttons.every(btn=>btn.disabled),'all separator buttons locked while saving');
await Promise.all([a,b]);
assert.equal(callCount,1,'one assignment despite rapid double click');
assert.equal(lastPayload.separator_key,'claudio');
assert.equal(loadCount,1,'after saving reread server values');
assert.equal(refreshCount,1);
assert.equal(back.dataset.separationBusy,undefined,'assignment lock released');
assert.ok(messages.some(m=>m.includes('Cláudio')));

let itemCalls=0,itemRenders=0;
const itemButton={dataset:{orderItem:'22222222-2222-4222-8222-222222222222'},disabled:false,textContent:'SEPARADO',
 classList:{add:()=>{},remove:()=>{}}};
const itemBack={dataset:{separatorKey:'claudio',orderUpdatedAt:'2026-10-08T10:00:00Z'},
 querySelectorAll:()=>[itemButton]};
const saveItem=new Function('api','toast','separatorLabel','refreshOrderSeparationBoard','loadOrderSeparationSheet','errorMessage','setTimeout',
 markSource+';return setOrderSeparationItem;')(
 async(action,params,opts)=>{
   assert.equal(action,'order_separation_item_set');
   const body=JSON.parse(opts.body);
   assert.equal(body.state,'separated');assert.equal(body.separator_key,'claudio');
   assert.equal(body.expected_order_updated_at,'2026-10-08T10:00:00Z');
   itemCalls++;await sleep(20);
   return {order_updated_at:'2026-10-08T10:00:01Z',persisted:true};
 },msg=>messages.push(msg),()=> 'Cláudio',async()=>{},async()=>{itemRenders++;},e=>e,
 fn=>{queueMicrotask(fn);return 1}
);
const i1=saveItem('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 'separated','2026-10-08T10:00:00Z','claudio',itemBack,itemButton);
const i2=saveItem('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 'separated','2026-10-08T10:00:00Z','claudio',itemBack,itemButton);
await Promise.all([i1,i2]);
assert.equal(itemCalls,1,'no duplicate marking');
assert.equal(itemRenders,1);
assert.equal(itemBack.dataset.orderUpdatedAt,'2026-10-08T10:00:01Z');
assert.equal(itemBack.dataset.separationBusy,undefined);
console.log('PASS: all picker identifiers match schema, assignment and item marking persist once, scroll preserved, syntax valid.');
