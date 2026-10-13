import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {mkdtempSync,readFileSync,writeFileSync,statSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createSingleProcessLabFileStorage} from '../src/lab-file-storage.mjs';
import {createLabFlowStore} from '../src/flow-protocol.mjs';
import {makeFakeCatalog,makeFakeStock,fakeExtraCatalog} from '../fixtures/fake-catalog.mjs';

const context=()=>{
 const catalog=makeFakeCatalog();
 return {catalog,inventory:makeFakeStock(catalog),extrasCatalog:fakeExtraCatalog};
};
const token='lab-flow-durable-test-0001';
const x=(screen,task,data={})=>({action:'data_exchange',flow_token:token,screen,data:{task,...data}});
test('Lab purchase resumes after a process restart without losing chosen brand or quote',t=>{
 const folder=mkdtempSync(join(tmpdir(),'da-lab-flow-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const file=join(folder,'state.lab.json'),storage=createSingleProcessLabFileStorage(file),ctx=context();
 let store=createLabFlowStore(ctx,{storage});
 store.register(token,'lab-2',1);
 let first=store.handle(x('CHOOSE_MODE','choose_mode',{mode:'customize'}));
 const alt=first.data.options.find(o=>o.id!==first.data.selected_id&&o.id!=='__REMOVE__');
 first=store.handle(x('PRODUCT_PILOT','preview_product',{
   position_id:first.data.position_id,product_id:alt.id
 }));
 const expected={selected:first.data.selected_id,total:first.data.total_label};
 assert.equal(statSync(file).mode & 0o777,0o600);
 store=null; // Simulated serverless restart
 const resumed=createLabFlowStore(ctx,{storage});
 const status=resumed.refresh(token);
 assert.equal(status.screen,'PRODUCT_PILOT');
 assert.equal(status.data.selected_id,expected.selected);
 assert.equal(status.data.total_label,expected.total);
 assert.ok(!readFileSync(file,'utf8').includes('hidden_adjustment'));
});
test('Simulated completion and idempotency survive a restart',t=>{
 const folder=mkdtempSync(join(tmpdir(),'da-lab-orders-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const storage=createSingleProcessLabFileStorage(join(folder,'state.lab.json')),ctx=context();
 let store=createLabFlowStore(ctx,{storage});
 store.register(token,'lab-1',1);
 store.handle(x('CHOOSE_MODE','choose_mode',{mode:'ready'}));
 store.handle(x('UPSELL','select_upsell',{extras:[]}));
 store.handle(x('CHECKOUT','checkout',{
   name:'Cliente fictício',address:'Rua fictícia de teste, 20',payment:'pix'
 }));
 const first=store.confirmSimulatedOnly(token,'event-0001');
 assert.equal(first.existing,false);
 const firstRef=first.order.reference;
 store=null;
 const restarted=createLabFlowStore(ctx,{storage});
 const second=restarted.confirmSimulatedOnly(token,'event-0001');
 assert.equal(second.existing,true);
 assert.equal(second.order.reference,firstRef);
 assert.equal(restarted.stats().simulatedOrders,1);
});
test('Expired tokens cannot be restarted from local snapshots',t=>{
 const folder=mkdtempSync(join(tmpdir(),'da-lab-exp-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const storage=createSingleProcessLabFileStorage(join(folder,'state.lab.json')),ctx=context();
 let clock=1000,store=createLabFlowStore(ctx,{storage,ttlMs:1000,now:()=>clock});
 store.register(token,'lab-2',1);
 clock=2100;
 const restarted=createLabFlowStore(ctx,{storage,ttlMs:1000,now:()=>clock});
 assert.throws(()=>restarted.refresh(token),/session_missing/);
});
test('Corrupted state fails closed instead of silently resetting orders',t=>{
 const folder=mkdtempSync(join(tmpdir(),'da-lab-bad-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const path=join(folder,'state.lab.json');
 writeFileSync(path,'{BROKEN',{mode:0o600});
 const storage=createSingleProcessLabFileStorage(path);
 assert.throws(()=>storage.load(),/lab_snapshot_corrupt/);
 assert.throws(()=>createLabFlowStore(context(),{storage}),/lab_snapshot_corrupt/);
});
test('Local storage rejects invalid destination paths and unsafe names',()=>{
 assert.throws(()=>createSingleProcessLabFileStorage('relative.lab.json'),/lab_storage_absolute_path_required/);
 assert.throws(()=>createSingleProcessLabFileStorage('/tmp/customer-db.json'),/lab_storage_extension_required/);
});
