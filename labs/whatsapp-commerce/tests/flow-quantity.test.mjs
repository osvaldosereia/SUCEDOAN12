import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeFakeCatalog,makeFakeStock} from '../fixtures/fake-catalog.mjs';
import {createLabFlowStore} from '../src/flow-protocol.mjs';

function launch(){
 const catalog=makeFakeCatalog(),inventory=makeFakeStock(catalog);
 const store=createLabFlowStore({catalog,inventory});
 const token='lab-flow-quantity-test-001';
 store.register(token,'lab-2',1);
 const request=(screen,task,data={})=>store.handle({
  action:'data_exchange',flow_token:token,screen,data:{task,...data}
 });
 return {store,token,request};
}
test('Editing quantity changes basket total without losing fixed hidden adjustments',()=>{
 const {request}=launch();
 const p=request('CHOOSE_MODE','choose_mode',{mode:'customize'});
 const baseline=p.data.total_label;
 assert.equal(p.data.quantity_label,'1');
 const next=request('PRODUCT_PILOT','commit_product',{
   position_id:p.data.position_id,product_id:p.data.selected_id,quantity:'2'
 });
 assert.equal(next.screen,'PRODUCT_PILOT');
 assert.equal(next.data.position_number,'2 de 23');
 assert.notEqual(next.data.total_label,baseline);
 assert.ok(!JSON.stringify(next).includes('hidden'));
});
test('Non-numeric or negative quantities cannot enter the basket',()=>{
 const {request}=launch();
 const p=request('CHOOSE_MODE','choose_mode',{mode:'customize'});
 for(const invalid of ['NaN','abc',-1,101,'1.5']){
  assert.throws(()=>request('PRODUCT_PILOT','commit_product',{
   position_id:p.data.position_id,product_id:p.data.selected_id,quantity:invalid
  }),/quantity_invalid/);
 }
 assert.equal(request('PRODUCT_PILOT','preview_product',{
   position_id:p.data.position_id,product_id:p.data.selected_id
 }).data.position_number,'1 de 23');
});
test('A removed product forces zero quantity and preserves navigation',()=>{
 const {request}=launch();
 const p=request('CHOOSE_MODE','choose_mode',{mode:'customize'});
 const next=request('PRODUCT_PILOT','commit_product',{
   position_id:p.data.position_id,product_id:'__REMOVE__',quantity:5
 });
 assert.equal(next.data.position_number,'2 de 23');
});
test('Flow JSON requests product quantity from the native form and initializes it',()=>{
 const f=JSON.parse(readFileSync(
  new URL('../flows/dynamic-paging.candidate.flow.json',import.meta.url),'utf8'));
 const screen=f.screens.find(s=>s.id==='PRODUCT_PILOT');
 const form=screen.layout.children[0];
 const qty=form.children.find(x=>x.name==='product_quantity');
 assert.equal(qty.type,'TextInput');
 assert.equal(qty['input-type'],'number');
 assert.equal(form['init-values'].product_quantity,'$'+'{data.quantity_label}');
 assert.equal(form.children.at(-1)['on-click-action'].payload.quantity,'$'+'{form.product_quantity}');
 assert.equal(screen.data.quantity_label.type,'string');
});
