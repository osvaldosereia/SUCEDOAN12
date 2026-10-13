import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabFlowStore,safeLabFlowScreenError} from '../src/flow-protocol.mjs';
import {makeFakeCatalog,makeFakeStock} from '../fixtures/fake-catalog.mjs';
import {readFileSync} from 'node:fs';

const ctx=()=>{
 const catalog=makeFakeCatalog();
 return {catalog,inventory:makeFakeStock(catalog),extrasCatalog:{}};
};
test('Server errors return current screen and all required data',()=>{
 const store=createLabFlowStore(ctx());
 const token='lab-flow-errors-0001';
 store.register(token,'lab-2',2);
 const reply=safeLabFlowScreenError(new Error('screen_out_of_sync'),store,token);
 assert.equal(reply.screen,'CHOOSE_MODE');
 assert.match(reply.data.error_message,/etapa mudou/);
 assert.match(reply.data.total_label,/R\$/);
 assert.ok(reply.data.basket_name);
 assert.ok(!JSON.stringify(reply).includes('hidden_adjustment'));
});
test('After an unavailable product, errors re-render all brand options',()=>{
 const source=ctx();
 const store=createLabFlowStore(source);
 const token='lab-flow-errors-0002';
 store.register(token,'lab-2',1);
 const reply=store.handle({action:'data_exchange',flow_token:token,screen:'CHOOSE_MODE',data:{task:'choose_mode',mode:'customize'}});
 source.inventory[reply.data.selected_id]=0;
 const failure=safeLabFlowScreenError(new Error('insufficient_stock'),store,token);
 assert.equal(failure.screen,'PRODUCT_PILOT');
 assert.equal(failure.data.position_number,'1 de 23');
 assert.equal(failure.data.options.find(o=>o.id===reply.data.selected_id).enabled,false);
 assert.match(failure.data.error_message,/sem estoque/);
 assert.equal(failure.data.selected_id,reply.data.selected_id);
});
test('Every JSON dynamic screen declares its error_message',()=>{
 for(const path of ['pilot.draft.flow.json','dynamic-paging.candidate.flow.json']){
  const file=new URL('../flows/'+path,import.meta.url);
  const flow=JSON.parse(readFileSync(file,'utf8'));
  for(const screen of flow.screens){
   assert.equal(screen.data.error_message.type,'string',path+': '+screen.id);
  }
 }
});
