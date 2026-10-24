export const R15_TARGETS = {
  lcpMs: 2_500,
  inpMs: 200,
  cls: 0.1,
  syntheticCatalogSize: 802,
  operatorCount: 3,
  maxOperatorMs: 2_000,
} as const;

export type AuditStatus = 'pass' | 'fail' | 'not-measured';

export interface CoreWebVitalsSample {
  readonly lcpMs?: number;
  readonly inpMs?: number;
  readonly cls?: number;
}

export interface MetricResult {
  readonly actual: number | null;
  readonly target: number;
  readonly status: AuditStatus;
}

export interface CoreWebVitalsResult {
  readonly lcp: MetricResult;
  readonly inp: MetricResult;
  readonly cls: MetricResult;
  readonly status: AuditStatus;
}

const metric = (actual: number | undefined, target: number, lowerIsBetter = true): MetricResult => {
  if (actual === undefined || !Number.isFinite(actual)) {
    return { actual: null, target, status: 'not-measured' };
  }
  const passed = lowerIsBetter ? actual <= target : actual >= target;
  return { actual, target, status: passed ? 'pass' : 'fail' };
};

export function evaluateCoreWebVitals(sample: CoreWebVitalsSample): CoreWebVitalsResult {
  const result = {
    lcp: metric(sample.lcpMs, R15_TARGETS.lcpMs),
    inp: metric(sample.inpMs, R15_TARGETS.inpMs),
    cls: metric(sample.cls, R15_TARGETS.cls),
  };
  const statuses = Object.values(result).map(({ status }) => status);
  const status: AuditStatus = statuses.includes('fail')
    ? 'fail'
    : statuses.every((item) => item === 'pass')
      ? 'pass'
      : 'not-measured';
  return { ...result, status };
}

export interface SyntheticLoadProbe {
  readonly catalogSize: number;
  readonly operatorCount: number;
  readonly maxOperatorMs: number;
}

export interface SyntheticLoadResult extends SyntheticLoadProbe {
  readonly requiredCatalogSize: number;
  readonly requiredOperatorCount: number;
  readonly maxOperatorMsTarget: number;
  readonly status: AuditStatus;
}

export function evaluateSyntheticLoad(probe: SyntheticLoadProbe): SyntheticLoadResult {
  const catalogPass = probe.catalogSize >= R15_TARGETS.syntheticCatalogSize;
  const operatorsPass =
    probe.operatorCount >= 2 && probe.operatorCount <= R15_TARGETS.operatorCount;
  const durationPass = probe.maxOperatorMs <= R15_TARGETS.maxOperatorMs;
  return {
    ...probe,
    requiredCatalogSize: R15_TARGETS.syntheticCatalogSize,
    requiredOperatorCount: R15_TARGETS.operatorCount,
    maxOperatorMsTarget: R15_TARGETS.maxOperatorMs,
    status: catalogPass && operatorsPass && durationPass ? 'pass' : 'fail',
  };
}
