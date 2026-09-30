import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSimplesCsv, buildSimplesHtml } from './export.ts';

const snapshot={
  period:{id:'p1',competence_month:'2026-09-01',version:1,status:'locked',rbt12:300000,effective_rate:0.0532,estimated_das_amount:532,calculated_at:'2026-09-30T13:00:00Z'},
  ruleSet:{code:'simples_2026_anexo_i_comercio',name:'Simples 2026 Anexo I - Comercio'},
  totals:{normal_resale:7000,icms_st:2000,monophase:1000,cancellation:0,return:0},
  issues:{blocking:0,warnings:1,total:1},
  memory:{nominalRate:0.073,deduction:5940,effectiveRate:0.0532},
  lines:[{source_document_id:'n1',access_key:'1'.repeat(44),tax_bucket:'normal_resale',recognized_amount:7000}],
};

test('CSV contains competence, rule, RBT12, segregated totals, DAS and timestamp',()=>{
  const csv=buildSimplesCsv(snapshot as any);
  for(const value of ['2026-09','simples_2026_anexo_i_comercio','300000','normal_resale','7000','532','2026-09-30T13:00:00Z']) assert.ok(csv.includes(value),`missing ${value}`);
});

test('HTML contains calculation memory and issue summary',()=>{
  const html=buildSimplesHtml(snapshot as any);
  for(const value of ['09/2026','Simples 2026 Anexo I - Comercio','RBT12','R$ 300.000,00','5,32%','R$ 532,00','1 aviso']) assert.ok(html.includes(value),`missing ${value}`);
});

test('exports are deterministic for the same locked snapshot',()=>{
  assert.equal(buildSimplesCsv(snapshot as any),buildSimplesCsv(snapshot as any));
  assert.equal(buildSimplesHtml(snapshot as any),buildSimplesHtml(snapshot as any));
});
