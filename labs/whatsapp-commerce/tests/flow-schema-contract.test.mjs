import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLabFlowStore,safeLabFlowScreenError} from '../src/flow-protocol.mjs';
import {makeFakeCatalog,makeFakeStock,fakeExtraCatalog} from '../fixtures/fake-catalog.mjs';

const candidate=JSON.parse(readFileSync(
 new URL('../flows/dynamic-paging.candidate.flow.json',import.meta.url),'utf8'));
const dataOf=(id)=>candidate.screens.find(s=>s.id===id).data;
const assertMatch=(result)=>{
 const keys=Object.keys(result.data||{}),allowed=Object.keys(dataOf(result.screen));
 for(const key of keys)assert.ok(allowed.includes(key),result.screen+': undeclared data '+key);
 return result;
};
test('All normal endpoint Flow screens return only declared dynamic keys',()=>{
 const catalog=makeFakeCatalog(),ctx={catalog,inventory:makeFakeStock(catalog),extrasCatalog:fakeExtraCatalog};
 const store=createLabFlowStore(ctx),token='lab-flow-schema-test-001';
 store.register(token,'lab-2',2);
 let r=assertMatch(store.handle({action:'INIT',flow_token:token}));
 assert.equal(r.screen,'CHOOSE_MODE');
 const x=(task,screen,data={})=>assertMatch(store.handle({
  action:'data_exchange',flow_token:token,screen,data:{task,...data}}));
 r=x('choose_mode','CHOOSE_MODE',{mode:'customize'});
 for(let i=0;i<23;i++){
  assert.equal(r.screen,'PRODUCT_PILOT');
  r=x('commit_product','PRODUCT_PILOT',{
   position_id:r.data.position_id,product_id:r.data.selected_id});
 }
 assert.equal(r.screen,'UPSELL');
 r=x('select_upsell','UPSELL',{extras:[]});
 assert.equal(r.screen,'CHECKOUT');
 r=x('checkout','CHECKOUT',{name:'Cliente fictício',address:'Rua de teste, 10',payment:'pix'});
 assert.equal(r.screen,'SIMULATED_FINISH');
});
test('All error responses retain declared fields in their current screen',()=>{
 const catalog=makeFakeCatalog(),ctx={catalog,inventory:makeFakeStock(catalog)};
 const store=createLabFlowStore(ctx),token='lab-flow-schema-test-002';
 store.register(token,'lab-1',1);
 assertMatch(safeLabFlowScreenError(new Error('screen_out_of_sync'),store,token));
});
