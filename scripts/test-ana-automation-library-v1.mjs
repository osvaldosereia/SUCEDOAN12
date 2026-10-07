import assert from 'node:assert/strict';
import fs from 'node:fs';
import {listAnaAutomationTemplates,buildAnaAutomationTemplate} from '../vitrine/admin/ana/ana-automation-library.js';

const templates=listAnaAutomationTemplates();
const expected=['humano','reclamacao','catalogo','fazer-pedido','pagamento','area-entrega','horario','cestas','limpeza','higiene','bebe','pet','opt-out'];
assert.deepEqual(templates.map(item=>item.key),expected,'library must expose the 13 approved models in stable order');

const labels=[
  {id:'00000000-0000-4000-8000-000000000001',name:'INT_CESTAS'},
  {id:'00000000-0000-4000-8000-000000000002',name:'INT_LIMPEZA'},
  {id:'00000000-0000-4000-8000-000000000003',name:'INT_HIGIENE'},
  {id:'00000000-0000-4000-8000-000000000004',name:'INT_BEBE'},
  {id:'00000000-0000-4000-8000-000000000005',name:'INT_PET'}
];

for(const item of templates){
  const built=buildAnaAutomationTemplate(item.key,{labels,key:`test-${item.key}`});
  assert.equal(built.enabled,false,`${item.key} must enter the draft disabled`);
  assert.deepEqual(built.channels,['all']);
  assert.equal(built.match,'phrase');
  assert.ok(built.phrases.length>0,`${item.key} must have phrases`);
  assert.ok(built.actions.length>0,`${item.key} must have actions`);
  for(const action of built.actions)assert.ok(['fixed_reply','label','handoff','continue_ai'].includes(action.type),`unsafe action in ${item.key}`);
}

const basket=buildAnaAutomationTemplate('cestas',{labels,key:'test-cestas'});
assert.deepEqual(basket.actions,[{type:'label',label_id:labels[0].id},{type:'continue_ai'}]);

assert.throws(
  ()=>buildAnaAutomationTemplate('bebe',{labels:labels.filter(item=>item.name!=='INT_BEBE'),key:'test-bebe'}),
  /INT_BEBE/,
  'interest template must fail closed when its label is unavailable'
);

const optOut=buildAnaAutomationTemplate('opt-out',{labels,key:'test-optout'});
assert.deepEqual(optOut.actions,[{type:'handoff'}],'opt-out must not mutate marketing consent through generic ANA actions');

const source=fs.readFileSync('vitrine/admin/ana/ana-automation-library.js','utf8');
assert.doesNotMatch(source,/MKT_OK|NAO_CONTATAR|marketing_consent_events_v1|set.*consent/i,'template library must stay separate from marketing consent mutation');

console.log('PASS: ANA automation template library is safe, editable and interest-label aware');
