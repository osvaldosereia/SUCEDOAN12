import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabFlowStore,safeLabFlowError} from '../src/flow-protocol.mjs';
import {makeFakeCatalog,makeFakeStock} from '../fixtures/fake-catalog.mjs';

const launch=()=>{
 const catalog=makeFakeCatalog(),inventory=makeFakeStock(catalog);
 const ctx={catalog,inventory,extrasCatalog:{}};
 const store=createLabFlowStore(ctx);
 const token='lab-flow-dynamic-catalog-001';
 store.register(token,'lab-2',1);
 return {ctx,store,token};
};
const exch=(screen,token,task,other={})=>({
 action:'data_exchange',screen,flow_token:token,data:{task,...other}
});
test('Changing a product price mid-session updates the Flow total without republishing',()=>{
 const {ctx,store,token}=launch();
 const first=store.handle(exch('CHOOSE_MODE',token,'choose_mode',{mode:'customize'}));
 const previous=first.data.total_label,firstId=first.data.selected_id;
 const model=ctx.catalog.models.find(m=>m.id==='lab-2'&&m.composition===1);
 const chosen=model.positions[0].options.find(o=>o.id===firstId);
 chosen.price_cents+=345;
 const current=store.refresh(token);
 assert.equal(current.screen,'PRODUCT_PILOT');
 assert.notEqual(current.data.total_label,previous);
 assert.equal(current.data.position_number,'1 de 23');
 assert.ok(!JSON.stringify(current).includes('hidden'));
});
test('A newly registered alternative appears without modifying the Flow structure',()=>{
 const {ctx,store,token}=launch();
 const first=store.handle(exch('CHOOSE_MODE',token,'choose_mode',{mode:'customize'}));
 const p=ctx.catalog.models.find(m=>m.id==='lab-2'&&m.composition===1).positions[0];
 p.options.push({id:'brand-new',name:'Nova marca no estoque',price_cents:2699,active:true});
 ctx.inventory['brand-new']=9;
 const current=store.refresh(token);
 assert.equal(current.data.options.length,first.data.options.length+1);
 assert.ok(current.data.options.some(o=>o.id==='brand-new'));
});
test('When stock runs out, the Flow disables the brand and refuses moving on',()=>{
 const {ctx,store,token}=launch();
 const first=store.handle(exch('CHOOSE_MODE',token,'choose_mode',{mode:'customize'}));
 ctx.inventory[first.data.selected_id]=0;
 const current=store.refresh(token);
 const option=current.data.options.find(o=>o.id===first.data.selected_id);
 assert.equal(option.enabled,false);
 assert.equal(current.data.quote_status,'unavailable');
 assert.throws(()=>store.handle(exch('PRODUCT_PILOT',token,'commit_product',{
   position_id:current.data.position_id,product_id:current.data.selected_id})),/insufficient_stock/);
 assert.equal(store.refresh(token).screen,'PRODUCT_PILOT');
 assert.equal(safeLabFlowError(new Error('insufficient_stock')).error_message,'insufficient_stock');
});
