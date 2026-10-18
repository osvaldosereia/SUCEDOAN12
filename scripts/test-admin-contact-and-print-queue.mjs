import fs from 'node:fs';
import assert from 'node:assert/strict';

function load(file,exportName){
  const root={};
  new Function('window',fs.readFileSync(file,'utf8'))(root);
  assert.ok(root[exportName],exportName);
  return root[exportName];
}
const contacts=load('vitrine/admin/orders/contact-actions.js','DonaAntoniaAdminOrderContactActions')
  .createOrderContactActions(()=>[],()=>'',()=>'',()=>'',String);
for(const [url,valid] of [
  ['https://www.google.com/maps/place/abc',true],
  ['https://maps.app.goo.gl/abc',true],
  ['https://www.google.com/maps.evil',false],
  ['https://www.google.com@evil.com/maps',false],
  ['https://www.google.com/maps?query=x',true],
]){
  assert.equal(Boolean(contacts.mapsHrefFromAddress({google_maps_url:url})),valid,url);
}
const panel=load('vitrine/admin/components/print-queue-panel.js','DonaAntoniaAdminPrintQueuePanel');
const render=panel.createPrintQueuePanel({
  orders:[{id:1,public_code:'AB123'},{id:2,public_code:'CD456'}],
  opsPrintQueue:{jobs:[{status:'pending',entity_id:'1'},{status:'failed',entity_id:'2',last_error:'erro'},{status:'done',entity_id:'3'}]}
},String,order=>order?.public_code||'—').renderOpsPrintQueue();
assert.match(render,/AB123/);
assert.match(render,/CD456/);
assert.doesNotMatch(render,/data-print-order="3"/);
assert.match(render,/data-print-order="1"/);
assert.match(render,/data-print-order="2"/);
console.log('Admin contact links and print queue contracts: PASS');
