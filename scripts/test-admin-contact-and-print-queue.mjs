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
const noProblems=load('vitrine/admin/orders/contact-actions.js','DonaAntoniaAdminOrderContactActions')
  .createOrderContactActions(()=>undefined,()=>'',()=>'',()=>'',String);
assert.equal(noProblems.orderMissingDataRequest(null),null);
assert.equal(noProblems.orderAddressRequestHref(null),'');
assert.equal(noProblems.orderContactActionsHtml(null),'');
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

const orphanRender=panel.createPrintQueuePanel({orders:[],opsPrintQueue:{jobs:[{status:'pending',entity_id:'missing'}]}},String,order=>{assert.ok(order,'order code must not be called for orphan job');return order.public_code}).renderOpsPrintQueue();
const malformedQueue=panel.createPrintQueuePanel({
  orders:[{id:0,public_code:'ZZ000'}],opsPrintQueue:{jobs:[null,'failed',7,{status:'pending',entity_id:0}]}
},String,o=>o.public_code).renderOpsPrintQueue();
assert.match(malformedQueue,/data-print-order="0"/);
assert.equal((malformedQueue.match(/history-row/g)||[]).length,1);
assert.match(orphanRender,/Fila de impressão/);
assert.doesNotMatch(orphanRender,/data-print-order="missing"/);

assert.match(contacts.mapsHrefFromAddress({street:'Rua A',number:0,district:'Centro',city:'Cuiabá'}),/Rua%20A%2C%200%2C%20Centro%2C%20Cuiab/);

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e164=value=>String(value||'').replace(/\D/g,'');
const wa=value=>e164(value).length>=12?'https://wa.me/'+e164(value):'';
assert.equal(e164('+55 (65) 99999-9999'),'5565999999999');
assert.equal(wa('+55 (65) 99999-9999'),'https://wa.me/5565999999999');
const message=(value,body)=>wa(value)+'?text='+encodeURIComponent(body);
const order={customer_name:'Maria Silva',public_code:'AB123',whatsapp_phone_e164:'5565999999999',
  delivery_address_snapshot:{street:'Rua A',number:'12',district:'Centro',city:'Cuiabá',state:'MT'}};
for(const [problems,label,requestText] of [
  [['Cliente não identificado'],'Pedir nome','nome completo'],
  [['Endereço incompleto'],'Pedir endereço','endereço completo'],
  [['Cliente não identificado','Endereço incompleto'],'Pedir dados','nome completo e seu endereço completo']
]){
  let evaluations=0;
  const actions=load('vitrine/admin/orders/contact-actions.js','DonaAntoniaAdminOrderContactActions')
    .createOrderContactActions(()=>{evaluations++;return problems},wa,message,o=>o.public_code,escapeHtml);
  const request=actions.orderMissingDataRequest(order);
  assert.equal(request.label,label);
  assert.ok(decodeURIComponent(request.href).includes(requestText));
  assert.ok(decodeURIComponent(request.href).includes('AB123'));
  assert.equal(evaluations,1,'one diagnosis for direct request');
  evaluations=0;
  const address=actions.orderAddressRequestHref(order);
  assert.equal(address,problems.includes('Endereço incompleto')?request.href:'');
  assert.equal(evaluations,1,'address link must not recompute problems');
  evaluations=0;
  const html=actions.orderContactActionsHtml(order);
  assert.match(html,/WhatsApp/);
  assert.match(html,/Abrir no Maps/);
  assert.equal(evaluations,1,'contact HTML must reuse one diagnosis');
}
{
  const actions=load('vitrine/admin/orders/contact-actions.js','DonaAntoniaAdminOrderContactActions')
    .createOrderContactActions(()=>[],wa,message,o=>o.public_code,escapeHtml);
  assert.equal(actions.orderMissingDataRequest(order),null);
  assert.equal(actions.orderAddressRequestHref(order),'');
  assert.equal(actions.mapsHrefFromAddress({street:'Rua A',city:'Cuiabá'}),'','incomplete location must not build map URL');
  const html=actions.orderContactActionsHtml({...order,delivery_address_snapshot:{google_maps_url:'https://evil.example/path'}});
  assert.doesNotMatch(html,/evil\.example/,'untrusted map URL must not enter HTML');
}

console.log('Admin contact links and print queue contracts: PASS');
