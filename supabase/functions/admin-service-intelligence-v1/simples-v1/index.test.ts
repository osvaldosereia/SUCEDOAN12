import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimplesService } from './index.ts';

const basePeriod={id:'p1',competence_month:'2026-09-01',version:1,status:'draft',collection_status:'complete',rbt12:300000,estimated_das_amount:500};
function fake(overrides:any={}){
  const calls:any[]=[];
  const deps:any={
    findPeriodByCompetence:async()=>basePeriod,
    getPeriod:async()=>basePeriod,
    recalculatePeriod:async()=>({...basePeriod,status:'ready'}),
    listIssues:async()=>[],
    resolveIssue:async()=>({ok:true}),
    getGate:async()=>({ready:true,blocking_issue_count:0,warning_count:0,reasons:[]}),
    lockPeriod:async()=>({...basePeriod,status:'locked'}),
    saveHomologation:async(input:any)=>({id:'h1',...input}),
    getExportSnapshot:async()=>({period:basePeriod,ruleSet:{code:'r',name:'R'},totals:{},issues:{blocking:0,warnings:0,total:0},memory:{},lines:[]}),
    ...overrides,
  };
  for(const k of Object.keys(deps)) if(typeof deps[k]==='function'){
    const fn=deps[k]; deps[k]=async(...args:any[])=>{calls.push([k,...args]);return fn(...args)};
  }
  return {service:createSimplesService(deps),calls};
}

test('invalid competence returns 400',async()=>{
  const {service}=fake();
  const r=await service.dispatch({action:'simples_summary',method:'GET',query:{competence:'09/2026'},body:{},actor:{userId:'u1',role:'owner'}});
  assert.equal(r.status,400);
  assert.equal(r.body.error,'invalid_competence');
});

test('recalculate locked period returns 409 without recalculation',async()=>{
  const {service,calls}=fake({findPeriodByCompetence:async()=>({...basePeriod,status:'locked'})});
  const r=await service.dispatch({action:'simples_recalculate',method:'POST',query:{},body:{competence_month:'2026-09'},actor:{userId:'u1',role:'owner'}});
  assert.equal(r.status,409);
  assert.equal(r.body.error,'period_locked');
  assert.equal(calls.some(x=>x[0]==='recalculatePeriod'),false);
});

test('incomplete collection remains review_required',async()=>{
  const {service}=fake({recalculatePeriod:async()=>({...basePeriod,status:'review_required',collection_status:'incomplete',blocking_issue_count:1})});
  const r=await service.dispatch({action:'simples_recalculate',method:'POST',query:{},body:{competence_month:'2026-09'},actor:{userId:'u1',role:'owner'}});
  assert.equal(r.status,200);
  assert.equal(r.body.period.status,'review_required');
  assert.equal(r.body.period.collection_status,'incomplete');
});

test('blocking gate rejects lock',async()=>{
  const {service,calls}=fake({getGate:async()=>({ready:false,blocking_issue_count:2,warning_count:0,reasons:['blocking_issues']})});
  const r=await service.dispatch({action:'simples_lock',method:'POST',query:{},body:{period_id:'p1'},actor:{userId:'u1',role:'owner'}});
  assert.equal(r.status,409);
  assert.equal(r.body.error,'period_not_ready');
  assert.equal(calls.some(x=>x[0]==='lockPeriod'),false);
});

test('clean gate allows lock',async()=>{
  const {service}=fake();
  const r=await service.dispatch({action:'simples_lock',method:'POST',query:{},body:{period_id:'p1'},actor:{userId:'u1',role:'owner'}});
  assert.equal(r.status,200);
  assert.equal(r.body.period.status,'locked');
});

test('insufficient RBT12 is returned as explicit review block',async()=>{
  const {service}=fake({recalculatePeriod:async()=>({...basePeriod,status:'review_required',rbt12:null,metadata:{block_reason:'rbt12_history_incomplete'}})});
  const r=await service.dispatch({action:'simples_recalculate',method:'POST',query:{},body:{competence_month:'2026-09'},actor:{userId:'u1',role:'owner'}});
  assert.equal(r.status,200);
  assert.equal(r.body.period.rbt12,null);
  assert.equal(r.body.period.metadata.block_reason,'rbt12_history_incomplete');
});

test('unknown export period returns 404',async()=>{
  const {service}=fake({getPeriod:async()=>null});
  const r=await service.dispatch({action:'simples_export',method:'GET',query:{period_id:'missing',format:'csv'},body:{},actor:{userId:'u1',role:'owner'}});
  assert.equal(r.status,404);
  assert.equal(r.body.error,'period_not_found');
});

test('v1 rejects any filing or payment action',async()=>{
  const {service}=fake();
  for(const action of ['transmit_pgdas','pay_das','simples_transmit_pgdas','simples_pay_das']){
    const r=await service.dispatch({action,method:'POST',query:{},body:{},actor:{userId:'u1',role:'owner'}});
    assert.equal(r.status,400);
    assert.equal(r.body.error,'unknown_action');
  }
});
