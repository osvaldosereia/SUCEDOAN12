import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOMOLOGATION_PERFORMANCE_BUDGET,
  evaluatePerformanceBudget,
} from '../../src/platform/performanceBudget.ts';

test('homologation performance budget accepts measurements within all limits', () => {
  assert.deepEqual(evaluatePerformanceBudget({
    firstRenderMs:2000,
    routeTransitionMs:200,
    jsBundleGzipBytes:300_000,
    cssBundleGzipBytes:80_000,
    staticAssetBytes:2_000_000,
  }), {
    passed:true,
    exceeded:[],
  });
});

test('performance budget reports each exceeded metric independently', () => {
  const result=evaluatePerformanceBudget({
    firstRenderMs:HOMOLOGATION_PERFORMANCE_BUDGET.firstRenderMs+1,
    routeTransitionMs:100,
    jsBundleGzipBytes:HOMOLOGATION_PERFORMANCE_BUDGET.jsBundleGzipBytes+1,
    cssBundleGzipBytes:10,
    staticAssetBytes:10,
  });

  assert.equal(result.passed,false);
  assert.deepEqual(result.exceeded,['firstRenderMs','jsBundleGzipBytes']);
});

test('invalid negative or non-finite measurements fail closed', () => {
  const result=evaluatePerformanceBudget({
    firstRenderMs:Number.NaN,
    routeTransitionMs:-1,
    jsBundleGzipBytes:0,
    cssBundleGzipBytes:0,
    staticAssetBytes:0,
  });

  assert.equal(result.passed,false);
  assert.deepEqual(result.exceeded,['firstRenderMs','routeTransitionMs']);
});
