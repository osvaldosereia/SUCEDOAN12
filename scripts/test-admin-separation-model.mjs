import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const modulePath='vitrine/admin/orders/separation-model.js';
const source=fs.readFileSync(modulePath,'utf8');
const context={window:{}};
vm.runInNewContext(source,context,{filename:modulePath});
const model=context.window.DonaAntoniaAdminSeparationModel;
assert.ok(model,'separation model bridge is registered');
assert.ok(Object.isFrozen(model),'separation model contract is immutable');

const rows=model.separationItems({items:[
  {item_kind:'product',product_id:'p2',name_snapshot:'Arroz',quantity:1,image_url:'/arroz.png',gondola_number:2,shelf_label:'B2',gtin:'789.1'},
  {item_kind:'basket',components:[
    {product_id:'p1',name_snapshot:'Feijão',quantity:2,image_url:'/feijao.png',gondola_number:1,shelf_label:'A1',gtin:'7892',metadata:{loose_quantity:2,preassembled_units:0}},
    {product_id:'p1',name_snapshot:'Feijão',quantity:1,metadata:{loose_quantity:1,preassembled_units:1}}
  ]}
]});
assert.deepEqual(JSON.parse(JSON.stringify(rows)),[
  {name:'MONTAR · Feijão',quantity:2,image_url:'/feijao.png',gondola_number:1,shelf_label:'A1',gtin:'7892'},
  {name:'Arroz',quantity:1,image_url:'/arroz.png',gondola_number:2,shelf_label:'B2',gtin:'7891'},
  {name:'EXTRA · Feijão',quantity:1,image_url:'/img/logoantonia5.png',gondola_number:null,shelf_label:null,gtin:''}
]);
assert.deepEqual(JSON.parse(JSON.stringify(model.separationKitRefs({checkout_separation_plan:[
  {quantity:2,basket_name:'Cesta familiar',food:{mode:'lot',short_code:'AB1'},hygiene:{mode:'lot',short_code:'CD2'}},
  {quantity:1,food:{mode:'loose'}}
]}))),[
  {label:'CESTA ORIGINAL · permanece original',code:'AB1 + CD2',quantity:2,basket:'Cesta familiar'}
]);
assert.ok(Object.isFrozen(rows)===false,'each call returns its own mutable presentation data');
console.log('Admin separation model contract: PASS');
