import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRevenueLine } from './classifier.ts';

const day='2026-09-15';
const profile={reviewStatus:'auto_validated',stStatus:'not_applicable'} as const;
const strictRule=(kind:'icms_st'|'monophase')=>({id:`${kind}-1`,version:1,taxBucket:kind,applicationMode:'strict_auto',status:'active',effectiveFrom:'2026-01-01',effectiveTo:'2026-12-31',confidence:0.99,evidence:{source:'official'}} as const);

test('validated ordinary resale is classified as normal', () => {
  const r=classifyRevenueLine({transactionKind:'sale',date:day,fiscalProfile:profile});
  assert.equal(r.taxBucket,'normal_resale');
  assert.equal(r.status,'classified');
  assert.deepEqual(r.reliefComponents,[]);
});

test('proven ST rule removes ICMS component', () => {
  const r=classifyRevenueLine({transactionKind:'sale',date:day,fiscalProfile:{reviewStatus:'auto_validated',stStatus:'applicable'},stRule:strictRule('icms_st')});
  assert.equal(r.taxBucket,'icms_st');
  assert.equal(r.status,'classified');
  assert.deepEqual(r.reliefComponents,['icms']);
  assert.equal(r.ruleId,'icms_st-1');
});

test('proven monophase rule removes PIS and Cofins components', () => {
  const r=classifyRevenueLine({transactionKind:'sale',date:day,fiscalProfile:profile,monophaseRule:strictRule('monophase')});
  assert.equal(r.taxBucket,'monophase');
  assert.deepEqual(r.reliefComponents,['pis','cofins']);
});

test('line can combine ST and monophase relief without inventing a new bucket', () => {
  const r=classifyRevenueLine({transactionKind:'sale',date:day,fiscalProfile:{reviewStatus:'auto_validated',stStatus:'applicable'},stRule:strictRule('icms_st'),monophaseRule:strictRule('monophase')});
  assert.equal(r.taxBucket,'icms_st');
  assert.deepEqual(r.reliefComponents,['icms','pis','cofins']);
  assert.deepEqual(r.tags.sort(),['icms_st','monophase']);
});

test('unresolved fiscal profile states always require manual review', () => {
  for (const reviewStatus of ['pending','blocked']) {
    const r=classifyRevenueLine({transactionKind:'sale',date:day,fiscalProfile:{reviewStatus,stStatus:'unknown'}});
    assert.equal(r.taxBucket,'manual_review');
    assert.equal(r.status,'manual_review');
  }
  for (const stStatus of ['candidate','unknown','conflict']) {
    const r=classifyRevenueLine({transactionKind:'sale',date:day,fiscalProfile:{reviewStatus:'auto_validated',stStatus}});
    assert.equal(r.taxBucket,'manual_review');
  }
});

test('rule outside effective dates requires manual review', () => {
  const r=classifyRevenueLine({transactionKind:'sale',date:'2027-01-10',fiscalProfile:{reviewStatus:'auto_validated',stStatus:'applicable'},stRule:strictRule('icms_st')});
  assert.equal(r.taxBucket,'manual_review');
  assert.match(r.reason??'',/effective/i);
});

test('cancellation and return override ordinary sale classification', () => {
  assert.equal(classifyRevenueLine({transactionKind:'cancellation',date:day,fiscalProfile:profile}).taxBucket,'cancellation');
  assert.equal(classifyRevenueLine({transactionKind:'return',date:day,fiscalProfile:profile}).taxBucket,'return');
});
