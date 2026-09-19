import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAccessibleControl, assertPerformanceBudget, recoveryActionFor, UX_LIMITS } from '../../src/app/uxReadiness.ts';

test('A7 constants preserve 320px viewport and 44px targets', () => {
  assert.equal(UX_LIMITS.minimumViewportPx, 320);
  assert.equal(UX_LIMITS.minimumTouchTargetPx, 44);
});

test('offline and error states have bounded deterministic recovery', () => {
  assert.equal(recoveryActionFor('offline'), 'use-cache');
  assert.equal(recoveryActionFor('error', 0), 'retry');
  assert.equal(recoveryActionFor('error', 2), 'retry');
  assert.equal(recoveryActionFor('error', 3), 'reload');
  assert.equal(recoveryActionFor('ready'), 'none');
  assert.throws(() => recoveryActionFor('error', -1), /invalid-recovery-attempts/);
});

test('performance budgets fail closed', () => {
  assert.doesNotThrow(() => assertPerformanceBudget({ initialJsBytes: 250_000, initialCssBytes: 80_000, criticalImageBytes: 350_000 }));
  assert.throws(() => assertPerformanceBudget({ initialJsBytes: 250_001, initialCssBytes: 1, criticalImageBytes: 1 }), /budget-exceeded:js/);
  assert.throws(() => assertPerformanceBudget({ initialJsBytes: 1, initialCssBytes: 80_001, criticalImageBytes: 1 }), /budget-exceeded:css/);
  assert.throws(() => assertPerformanceBudget({ initialJsBytes: 1, initialCssBytes: 1, criticalImageBytes: 350_001 }), /budget-exceeded:image/);
  assert.throws(() => assertPerformanceBudget({ initialJsBytes: Number.NaN, initialCssBytes: 1, criticalImageBytes: 1 }), /invalid-budget-value/);
});

test('interactive controls require size, label and keyboard reachability', () => {
  assert.doesNotThrow(() => assertAccessibleControl({ widthPx: 44, heightPx: 44, label: 'Abrir cesta', keyboardReachable: true }));
  assert.throws(() => assertAccessibleControl({ widthPx: 43, heightPx: 44, label: 'x', keyboardReachable: true }), /touch-target-too-small/);
  assert.throws(() => assertAccessibleControl({ widthPx: 44, heightPx: 44, label: ' ', keyboardReachable: true }), /accessible-label-required/);
  assert.throws(() => assertAccessibleControl({ widthPx: 44, heightPx: 44, label: 'x', keyboardReachable: false }), /keyboard-reachability-required/);
});
