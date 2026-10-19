import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const path='vitrine/admin/delivery/model.js';
assert.ok(fs.existsSync(path),'delivery model must be extracted');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path,'utf8'),context);
const model=context.window.DonaAntoniaAdminDeliveryModel;
assert.ok(Object.isFrozen(model));
const address={street:'Rua A',number:'12',city:'Cuiabá'};
for(const [lat,lng] of [[null,null],[null,12],['',12],[' ',12],[91,10],[12,181]]){
  const target=model.deliveryStopTarget({address,destination_latitude:lat,destination_longitude:lng,destination_confidence:'confirmed'});
  assert.equal(target,'Rua A, 12, Cuiabá','missing or invalid GPS must fall back to the actual address');
}
assert.equal(model.deliveryStopTarget({destination_latitude:0,destination_longitude:0,destination_confidence:'saved'}),'0.0000000,0.0000000');
assert.equal(model.deliveryStopTarget({destination_latitude:'-15.6',destination_longitude:'-56.1',destination_confidence:'confirmed'}),'-15.6000000,-56.1000000');
assert.equal(model.deliveryStopTarget({address,destination_latitude:-15,destination_longitude:-56}),'Rua A, 12, Cuiabá');
assert.equal(model.runMapsHref({stops:[{status:'delivered',address}]}),'');
assert.equal(model.parsePaymentAmountCents('R$ 1.234,56'),123456);
assert.equal(model.parsePaymentAmountCents('12.34'),1234);
assert.equal(model.parsePaymentAmountCents('inválido'),0);
assert.equal(model.expeditionFiscalState({id:'a',status:'ready'},{}).authorized,false);
assert.equal(model.expeditionFiscalState({id:'a',status:'ready'},{dispatch_gate:{authorized:true,allowed:true}}).authorized,true);
assert.equal(model.expeditionFiscalState({id:'a',status:'ready',delivery_return:{dispatch_blocked:true}},{dispatch_gate:{authorized:true,allowed:true}}).authorized,false);
console.log('Admin delivery model: PASS');
