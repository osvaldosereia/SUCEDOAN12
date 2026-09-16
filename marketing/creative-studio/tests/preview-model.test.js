import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPreviewModel} from '../preview-model.js';

test('builds a vertical preview from product plan assets and timeline',()=>{
  const model=buildPreviewModel({
    product:{name:'Desinfetante Flores do Campo',image_url:'https://example.com/p.webp',price:12.9,offer_price:9.9,is_offer:true},
    plan:{concept:'Um campo inteiro dentro do frasco',territory:'aroma floral',emotions:['freshness','surprise'],duration:18},
    assets:{summary:{ready:3,total:3},items:[{status:'procedural'},{status:'resolved_local'},{status:'acquired'}]},
    timeline:{camera:{mode:'cinematic_push'},scenes:[{start:0,end:6,summary:'Uma flor nasce'},{start:6,end:12,summary:'O campo toma a cena'},{start:12,end:18,summary:'Produto e oferta'}]}
  });
  assert.equal(model.aspect,'9:16');
  assert.equal(model.duration,18);
  assert.equal(model.scenes.length,3);
  assert.equal(model.camera,'cinematic_push');
  assert.equal(model.assetReady,'3/3');
  assert.equal(model.close.badge,'OFERTA');
  assert.equal(model.close.price,9.9);
  assert.equal(model.productImage,'https://example.com/p.webp');
});

test('preview remains useful when product has no image or asset requests',()=>{
  const model=buildPreviewModel({product:{name:'Produto',price:5},plan:{concept:'Ideia',territory:'humor',duration:15},assets:{summary:{ready:0,total:0},items:[]},timeline:{scenes:[]}});
  assert.equal(model.productImage,null);
  assert.equal(model.assetReady,'0/0');
  assert.equal(model.camera,'static_fallback');
});
