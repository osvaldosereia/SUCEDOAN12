import { describe, expect, it } from 'vitest';
import { evaluateR16Readiness } from './rollout-readiness';

describe('R16 rollout readiness', () => {
  it('blocks the pilot while any human or staging gate is missing', () => {
    const result = evaluateR16Readiness({
      stagingUrl: false,
      testSeed: false,
      operatorCount: 0,
      backupRestoreRehearsed: false,
      productionAuthorization: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.checks.filter((check) => !check.passed)).toHaveLength(5);
  });

  it('requires exactly two or three isolated operators', () => {
    const base = {
      stagingUrl: true,
      testSeed: true,
      backupRestoreRehearsed: true,
      productionAuthorization: true,
    } as const;

    expect(evaluateR16Readiness({ ...base, operatorCount: 1 }).status).toBe('blocked');
    expect(evaluateR16Readiness({ ...base, operatorCount: 2 }).status).toBe('ready');
    expect(evaluateR16Readiness({ ...base, operatorCount: 3 }).status).toBe('ready');
    expect(evaluateR16Readiness({ ...base, operatorCount: 4 }).status).toBe('blocked');
  });
});
