import assert from 'node:assert/strict';
import {analyzeAnaAutomationDraft} from '../vitrine/admin/ana/ana-diagnostics.js';

const rule=(overrides={})=>({
  key:'a',name:'A',enabled:true,priority:50,channels:['all'],match:'phrase',
  phrases:['pedido'],exclude_phrases:[],conditions:[],actions:[{type:'handoff'}],...overrides
});

let result=analyzeAnaAutomationDraft([
  rule({key:'a',name:'A',phrases:['pedido'],actions:[{type:'handoff'}]}),
  rule({key:'b',name:'B',phrases:['pedido'],actions:[{type:'fixed_reply',response_text:'ok'}]})
]);
assert.ok(result.criticalCount>=1,'same phrase + same priority + different outcome must be critical');
assert.ok(result.issues.some(item=>item.code==='same_phrase_same_priority'));

result=analyzeAnaAutomationDraft([
  rule({key:'a',conditions:[{type:'customer_linked',value:true}]}),
  rule({key:'b',conditions:[{type:'customer_linked',value:false}]})
]);
assert.equal(result.criticalCount,0,'mutually exclusive conditions must not collide');
assert.equal(result.warningCount,0,'mutually exclusive conditions must not warn');

result=analyzeAnaAutomationDraft([
  rule({key:'a',channels:['0975']}),
  rule({key:'b',channels:['1018']})
]);
assert.equal(result.issues.length,0,'disjoint channels must not collide');

result=analyzeAnaAutomationDraft([
  rule({key:'a',phrases:['pedido']}),
  rule({key:'b',phrases:['pedido atrasou']})
]);
assert.ok(result.issues.some(item=>item.code==='specificity_overlap'&&item.severity==='warning'),'specificity overlap must be visible but not critical');

result=analyzeAnaAutomationDraft([
  rule({key:'a',phrases:['quero comprar'],exclude_phrases:['quero comprar']})
]);
assert.ok(result.issues.some(item=>item.code==='include_exclude_conflict'&&item.severity==='critical'));

result=analyzeAnaAutomationDraft([
  rule({key:'a',actions:[
    {type:'label',label_id:'00000000-0000-4000-8000-000000000001'},
    {type:'remove_label',label_id:'00000000-0000-4000-8000-000000000001'},
    {type:'continue_ai'}
  ]})
]);
assert.ok(result.issues.some(item=>item.code==='label_direction_conflict'&&item.severity==='critical'));

console.log('PASS: ANA draft diagnostics detect collisions while respecting channels and conditions');
