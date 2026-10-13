import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLocationRequest,readInboundLocation,attachSimulatedLocation} from '../src/location.mjs';

test('Location request uses native WhatsApp interactive format without sending',()=>{
 const m=buildLocationRequest('5565998887777');
 assert.deepEqual(m,{
  messaging_product:'whatsapp',recipient_type:'individual',to:'5565998887777',
  type:'interactive',interactive:{type:'location_request_message',
  body:{text:'Para encontrar sua casa, toque em Enviar localização 📍'},
  action:{name:'send_location'}}
 });
});
test('Inbound location is attributed only to requested phone and never confirms the home automatically',()=>{
 const value={messages:[{type:'location',from:'5565998887777',id:'wamid.location.test.0001',
  location:{latitude:-15.601,longitude:-56.096,name:'Local de teste',address:'Rua fictícia'}}]};
 const result=readInboundLocation(value,{expectedPhone:'5565998887777'});
 assert.equal(result.customer_phone,'5565998887777');
 assert.equal(result.latitude,-15.601);
 const d=attachSimulatedLocation({status:'DRAFT'},result,'5565998887777');
 assert.equal(d.location.confirmed,false);
 assert.equal(d.location.source,'whatsapp_location');
});
test('Rejects location from another contact and malformed coordinates',()=>{
 const value={messages:[{type:'location',from:'5565998887777',id:'wamid.location.test.0001',
  location:{latitude:-15.601,longitude:-56.096}}]};
 assert.throws(()=>readInboundLocation(value,{expectedPhone:'5565999999999'}),/location_message_not_unique_or_missing/);
 value.messages[0].location.latitude=91;
 assert.throws(()=>readInboundLocation(value,{expectedPhone:'5565998887777'}),/coordinates_invalid/);
});
test('Location webhook is not silently matched if two messages are present',()=>{
 const value={messages:[1,2].map(i=>({type:'location',from:'5565998887777',
 id:'wamid.location.test.'+i,location:{latitude:-15.6,longitude:-56.0}}))};
 assert.throws(()=>readInboundLocation(value,{expectedPhone:'5565998887777'}),/location_message_not_unique_or_missing/);
});
test('No location attaches to a finished order',()=>{
 assert.throws(()=>attachSimulatedLocation({status:'CONFIRMED'},
 {customer_phone:'5565998887777'},'5565998887777'),/draft_finalized/);
});

test('Standard WhatsApp wamid identifiers with Base64 separators remain supported',()=>{
 const sample={messages:[{
  type:'location',from:'5565998887777',id:'wamid.HBgMNTU2NTk5ODg4Nzc3NxUCABIYFjNF+AQ==',
  location:{latitude:-15.6,longitude:-56.0}
 }]};
 assert.match(readInboundLocation(sample,{expectedPhone:'5565998887777'}).message_id,/^wamid/);
});
