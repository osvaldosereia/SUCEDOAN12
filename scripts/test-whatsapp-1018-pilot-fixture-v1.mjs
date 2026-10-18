import assert from 'node:assert/strict';
import {pilot1018} from '../supabase/functions/_shared/ana-1018-pilot-fixture-v1.mjs';
import {validateAnaConfiguration,routeAnaMessage,buildAnaRuntimeInstructions} from '../supabase/functions/_shared/ana-admin-config-v1.mjs';

const result=validateAnaConfiguration(pilot1018);
assert.deepEqual(result,{ok:true,errors:[]},'fixture must pass the existing production ANA validator');
assert.equal(pilot1018.triggers.every(t=>t.channels.length===1&&t.channels[0]==='1018'),true,'triggers must be channel-scoped');
assert.equal(pilot1018.triggers.every(t=>t.actions.every(a=>!['label','remove_label'].includes(a.type))),true,'no side-effectful label changes in fixture');
assert.equal(pilot1018.knowledge.some(k=>k.content.includes('valores internos ocultos')),true,'basket hidden values must remain confidential');
assert.match(buildAnaRuntimeInstructions(pilot1018),/Não revele valores internos ocultos/);
for(const scenario of pilot1018.test_cases){
  const outcome=routeAnaMessage(pilot1018,scenario.input,scenario.channel,{humanMode:false,customerLinked:false});
  const actual=outcome.path==='handoff'?'handoff':outcome.path==='fixed_reply'?'reply':outcome.path;
  assert.equal(actual,scenario.expected,`scenario ${scenario.key}: ${JSON.stringify(outcome)}`);
}
for(const input of ['Qual o preço da cesta?','Tem estoque?']){
 const out=routeAnaMessage(pilot1018,input,'1018');
 assert.notEqual(out.path,'ai','dynamic price/stock questions must never hallucinate');
}
const foreign=routeAnaMessage(pilot1018,'Quero falar com atendente','0975');
assert.notEqual(foreign.path,'handoff','pilot trigger must not route in 0975');
console.log('PASS: 1018 pilot fixture validates, routes five scenarios and preserves hidden basket values');
