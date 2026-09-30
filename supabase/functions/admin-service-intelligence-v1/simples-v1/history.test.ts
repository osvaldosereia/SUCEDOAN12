import test from 'node:test';
import assert from 'node:assert/strict';
import { priorTwelveCompetences, summarizeMonthlyRevenue, buildRbt12FromHistory } from './history.ts';

test('priorTwelveCompetences returns exactly the 12 months before target competence',()=>{
  assert.deepEqual(priorTwelveCompetences('2026-09'),['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08']);
});

test('monthly history subtracts verified returns from authorized sales',()=>{
  const r=summarizeMonthlyRevenue({competenceMonth:'2026-08',sales:[{id:'s1',total:100},{id:'s2',total:50.55}],returns:[{id:'r1',total:20.05}]});
  assert.equal(r.collectionStatus,'complete');
  assert.equal(r.grossSales,150.55);
  assert.equal(r.returnsAmount,20.05);
  assert.equal(r.netRevenue,130.50);
  assert.equal(r.documentCount,2);
  assert.equal(r.returnDocumentCount,1);
});

test('returns above monthly sales require review instead of guessing carry-forward',()=>{
  const r=summarizeMonthlyRevenue({competenceMonth:'2026-08',sales:[{id:'s1',total:50}],returns:[{id:'r1',total:75}]});
  assert.equal(r.collectionStatus,'review_required');
  assert.equal(r.reviewReason,'return_carry_required');
  assert.equal(r.netRevenue,0);
});

test('invalid fiscal document totals make monthly history incomplete',()=>{
  const r=summarizeMonthlyRevenue({competenceMonth:'2026-08',sales:[{id:'s1',total:Number.NaN}],returns:[]});
  assert.equal(r.collectionStatus,'incomplete');
  assert.equal(r.reviewReason,'invalid_document_total');
});

test('RBT12 is built only from twelve complete contiguous history months',()=>{
  const months=priorTwelveCompetences('2026-09');
  const rows=months.map((m,i)=>({competenceMonth:m,netRevenue:1000+i,collectionStatus:'complete'}));
  const ok=buildRbt12FromHistory('2026-09',rows);
  assert.equal(ok.complete,true);
  assert.equal(ok.months.length,12);
  assert.equal(ok.rbt12,months.reduce((sum,_m,i)=>sum+1000+i,0));
  const blocked=buildRbt12FromHistory('2026-09',rows.map((x,i)=>i===3?{...x,collectionStatus:'review_required'}:x));
  assert.equal(blocked.complete,false);
  assert.ok(blocked.missingMonths.includes(months[3]));
});
