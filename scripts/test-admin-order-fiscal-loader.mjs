import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {deferred} from './helpers/admin-delivery-fixture.mjs';
const path='vitrine/admin/orders/fiscal-loader.js';
assert.ok(fs.existsSync(path),'shared fiscal loader must be extracted');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path,'utf8'),context);
const create=context.window.DonaAntoniaAdminFiscalLoader.create;
{
  const cache={},requests=[];let active=0,maxActive=0;
  const loader=create({getCache:()=>cache,api:(_action,_params,options)=>{
    const id=JSON.parse(options.body).id,request=deferred();requests.push({id,...request});maxActive=Math.max(maxActive,++active);
    return request.promise.finally(()=>active--);
  }});
  const one=loader.load(['a','b','c','d'].map(id=>({id}))),two=loader.load([{id:'a'},{id:'e'}]);
  assert.equal(requests.length,3,'all callers share one concurrency limit');
  for(let i=0;i<5;i++){
    while(!requests[i])await new Promise(resolve=>setImmediate(resolve));
    requests[i].resolve({stage:requests[i].id});
  }
  await Promise.all([one,two]);
  assert.equal(maxActive,3);assert.equal(requests.length,5,'same order must not be fetched twice concurrently');
  assert.equal(cache.a.stage,'a');assert.ok(Object.isFrozen(loader));
}
{
  let cache={},waiting=deferred();const original=cache;
  const loader=create({getCache:()=>cache,api:()=>waiting.promise});
  const loading=loader.load([{id:'a'}]);cache.a={stage:'newer-from-order-detail'};
  waiting.resolve({stage:'older'});await loading;
  assert.equal(cache.a.stage,'newer-from-order-detail','batch must not overwrite a newer detail update');
  delete cache.a;waiting=deferred();const previous=loader.load([{id:'a'}]);
  cache={};const next=deferred();waiting.resolve({stage:'old-cache'});waiting=next;
  const current=loader.load([{id:'a'}]);next.resolve({stage:'current-cache'});
  await Promise.all([previous,current]);
  assert.equal(original.a,undefined,'retired cache must not receive late writes');
  assert.equal(cache.a.stage,'current-cache');
}
{
  const cache={};let calls=0;
  const loader=create({getCache:()=>cache,api:async()=>{calls++;throw Error('fiscal offline')}});
  await loader.load([{id:'a'}]);await loader.load([{id:'a'}]);
  assert.equal(cache.a.error,'fiscal offline');assert.equal(calls,1,'error is retained until explicit refresh, preserving the current retry contract');
}
console.log('Admin shared fiscal loader: PASS');
