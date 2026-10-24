import { describe, expect, it } from 'vitest';
import { evaluateCoreWebVitals, evaluateSyntheticLoad, R15_TARGETS } from './homologation-audit';

describe('R15 homologation audit', () => {
  it('passes Core Web Vitals only when every metric is measured and within target', () => {
    expect(evaluateCoreWebVitals({ lcpMs: 2_400, inpMs: 180, cls: 0.04 })).toMatchObject({
      status: 'pass',
    });
    expect(evaluateCoreWebVitals({ lcpMs: 2_400, inpMs: 180 })).toMatchObject({
      status: 'not-measured',
    });
    expect(evaluateCoreWebVitals({ lcpMs: 2_600, inpMs: 180, cls: 0.04 })).toMatchObject({
      status: 'fail',
    });
  });

  it('keeps the R15 performance targets explicit', () => {
    expect(R15_TARGETS).toEqual({
      lcpMs: 2_500,
      inpMs: 200,
      cls: 0.1,
      syntheticCatalogSize: 802,
      operatorCount: 3,
      maxOperatorMs: 2_000,
    });
  });

  it('requires at least 802 catalog items and two to three operators', () => {
    expect(
      evaluateSyntheticLoad({ catalogSize: 802, operatorCount: 3, maxOperatorMs: 250 }),
    ).toMatchObject({ status: 'pass' });
    expect(
      evaluateSyntheticLoad({ catalogSize: 801, operatorCount: 3, maxOperatorMs: 250 }),
    ).toMatchObject({ status: 'fail' });
    expect(
      evaluateSyntheticLoad({ catalogSize: 802, operatorCount: 4, maxOperatorMs: 250 }),
    ).toMatchObject({ status: 'fail' });
  });
});
