import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateDelivery} from '../src/delivery-policy.mjs';

test('Before noon in Cuiabá can deliver same open weekday',()=>{
 const r=estimateDelivery('2026-10-13T15:59:00Z',{city:'Cuiabá'}); // 11:59 Cuiabá UTC-4
 assert.equal(r.delivery_date,'2026-10-13');assert.equal(r.same_day,true);
});
test('At 12:00 local order gets next open day',()=>{
 const r=estimateDelivery('2026-10-13T16:00:00Z',{city:'Várzea Grande'});
 assert.equal(r.delivery_date,'2026-10-14');assert.equal(r.after_cutoff,true);
});
test('Saturday after noon skips Sunday',()=>{
 const r=estimateDelivery('2026-10-17T17:20:00Z',{city:'Cuiabá'});
 assert.equal(r.delivery_date,'2026-10-19');
});
test('Holiday closures skip the date even before noon',()=>{
 const r=estimateDelivery('2026-10-12T13:00:00Z',{
   city:'Cuiabá',closedDates:['2026-10-12']});
 assert.equal(r.delivery_date,'2026-10-13');
});
test('Blocked Monday and Sunday skip to Tuesday',()=>{
 const r=estimateDelivery('2026-10-17T19:00:00Z',{
   city:'Cuiabá',closedDates:['2026-10-19']});
 assert.equal(r.delivery_date,'2026-10-20');
});
test('Outside service area fails closed',()=>{
 assert.throws(()=>estimateDelivery('2026-10-13T15:00:00Z',{city:'Rondonópolis'}),
 /delivery_outside_service_area/);
});
test('Malformed date or closure config cannot silently generate delivery promise',()=>{
 assert.throws(()=>estimateDelivery('invalid',{city:'Cuiabá'}),/invalid_instant/);
 assert.throws(()=>estimateDelivery('2026-10-13T15:00:00Z',{city:'Cuiabá',closedDates:['garbage']}),
 /invalid_closure_dates/);
});
