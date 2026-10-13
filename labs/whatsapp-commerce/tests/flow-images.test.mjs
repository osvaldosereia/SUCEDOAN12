import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {addFlowOptionImage,validateFlowImageOption,FLOW_OPTION_MAX_BYTES} from '../src/flow-images.mjs';
import {createLabFlowStore} from '../src/flow-protocol.mjs';
import {makeFakeCatalog,makeFakeStock} from '../fixtures/fake-catalog.mjs';
const png=Buffer.from([137,80,78,71,13,10,26,10,0,1,2,3,4,5,6,7,8,9]);
test('Native radio thumbnail is embedded as valid Base64 image, not a URL',()=>{
 const o=addFlowOptionImage({id:'rice',title:'Arroz marca de teste'},png);
 assert.equal(o.image,png.toString('base64'));
 assert.equal(o['alt-text'],'Arroz marca de teste');
 assert.ok(!JSON.stringify(o).includes('http'));
 assert.deepEqual(validateFlowImageOption(o),o);
});
test('Too-large image is rejected, exactly as native Flow limits require',()=>{
 assert.throws(()=>addFlowOptionImage({title:'Arroz'},Buffer.alloc(FLOW_OPTION_MAX_BYTES+1)),/image_exceeds_meta_option_limit/);
});
test('Malicious image types are not embedded in the Flow',()=>{
 assert.throws(()=>addFlowOptionImage({title:'Produto'},Buffer.from('<svg onload="alert(1)"/>')),/unsupported_image_format/);
 assert.throws(()=>addFlowOptionImage({title:'Produto'},Buffer.from('GIF89a  123')),/unsupported_image_format/);
 assert.throws(()=>addFlowOptionImage({title:'Produto'},Buffer.from('not a product image')),/unsupported_image_format/);
});
test('Untrusted Base64 is validated before exposure to a customer',()=>{
 assert.throws(()=>validateFlowImageOption({image:'%%%'}),/image_base64_invalid/);
});
test('Product image appears in dynamic Flow only when a trusted preprocessed buffer exists',()=>{
 const catalog=makeFakeCatalog(),model=catalog.models.find(x=>x.id==='lab-2'&&x.composition===1),id=model.positions[0].default_id;
 const ctx={catalog,inventory:makeFakeStock(catalog),extrasCatalog:{},
   imagesByProductId:{[id]:png}};
 const store=createLabFlowStore(ctx),token='lab-flow-image-test-10000';
 store.register(token,'lab-2',1);
 const result=store.handle({action:'data_exchange',screen:'CHOOSE_MODE',flow_token:token,data:{task:'choose_mode',mode:'customize'}});
 assert.equal(result.data.options.find(x=>x.id===id).image,png.toString('base64'));
 assert.equal(result.data.options.find(x=>x.id===id)['alt-text'].length>0,true);
 assert.ok(!JSON.stringify(result).includes('image_url'));
});
test('Invalid optional product photo falls back to selectable text without blocking checkout',()=>{
 const catalog=makeFakeCatalog(),model=catalog.models.find(x=>x.id==='lab-2'&&x.composition===1),id=model.positions[0].default_id;
 const ctx={catalog,inventory:makeFakeStock(catalog),extrasCatalog:{},
   imagesByProductId:{[id]:Buffer.alloc(FLOW_OPTION_MAX_BYTES+50)}};
 const store=createLabFlowStore(ctx),token='lab-flow-image-test-20000';
 store.register(token,'lab-2',1);
 const result=store.handle({action:'data_exchange',screen:'CHOOSE_MODE',flow_token:token,data:{task:'choose_mode',mode:'customize'}});
 assert.ok(!result.data.options.find(x=>x.id===id).image);
 assert.ok(result.data.options.find(x=>x.id===id).title);
});
