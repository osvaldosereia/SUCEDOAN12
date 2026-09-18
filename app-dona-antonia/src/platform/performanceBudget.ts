export interface PerformanceMeasurement {
  firstRenderMs: number;
  routeTransitionMs: number;
  jsBundleGzipBytes: number;
  cssBundleGzipBytes: number;
  staticAssetBytes: number;
}

export interface PerformanceBudget {
  firstRenderMs: number;
  routeTransitionMs: number;
  jsBundleGzipBytes: number;
  cssBundleGzipBytes: number;
  staticAssetBytes: number;
}

export const HOMOLOGATION_PERFORMANCE_BUDGET: PerformanceBudget = {
  firstRenderMs: 2500,
  routeTransitionMs: 300,
  jsBundleGzipBytes: 350_000,
  cssBundleGzipBytes: 100_000,
  staticAssetBytes: 2_500_000,
};

export type PerformanceBudgetKey = keyof PerformanceBudget;

export interface PerformanceBudgetResult {
  passed: boolean;
  exceeded: PerformanceBudgetKey[];
}

function validMetric(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function evaluatePerformanceBudget(
  measurement: PerformanceMeasurement,
  budget: PerformanceBudget = HOMOLOGATION_PERFORMANCE_BUDGET,
): PerformanceBudgetResult {
  const exceeded: PerformanceBudgetKey[] = [];

  for (const key of Object.keys(budget) as PerformanceBudgetKey[]) {
    const measured = measurement[key];
    const limit = budget[key];
    if (!validMetric(measured) || measured > limit) {
      exceeded.push(key);
    }
  }

  return {
    passed: exceeded.length === 0,
    exceeded,
  };
}
