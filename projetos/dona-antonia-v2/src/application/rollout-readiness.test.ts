import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { R16ReadinessManifest } from './rollout-readiness';
import { evaluateR16Readiness } from './rollout-readiness';

const projectId = 'hjudhofluihkxykwekir';
const seedSkus = ['R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO'];
const date = '2026-10-24';

function pendingManifest(): R16ReadinessManifest {
  return {
    schemaVersion: 1,
    projectId,
    gates: {
      stagingUrl: {
        status: 'pending',
        url: null,
        httpStatus: null,
        verifiedProjectId: null,
        verifiedAt: null,
        evidenceRefs: [],
      },
      testSeed: {
        status: 'verified',
        projectId,
        skus: seedSkus,
        stockUnitsBySku: {
          'R16-TEST-ARROZ': 30,
          'R16-TEST-FEIJAO': 30,
          'R16-TEST-OLEO': 30,
        },
        verifiedAt: date,
        evidenceRefs: ['docs/R16_PREP_CHECKLIST.md'],
      },
      operators: {
        status: 'pending',
        operatorRefs: [],
        verifiedAt: null,
        evidenceRefs: [],
      },
      backupRestore: {
        status: 'pending',
        backupSha256: null,
        restoredSchemaSha256: null,
        restoreTargetProjectId: null,
        costUsd: null,
        verifiedAt: null,
        evidenceRefs: [],
      },
    },
    productionAuthorization: {
      status: 'out-of-scope',
      verifiedAt: null,
      evidenceRefs: [],
    },
  };
}

function readyManifest(
  options: {
    operatorRefs?: string[];
    operatorEvidenceRefs?: string[];
    stagingProjectId?: string;
    stagingUrl?: string;
    seedEvidenceRefs?: string[];
    backupRestoreTargetProjectId?: string;
    backupRestoreCostUsd?: number;
  } = {},
): R16ReadinessManifest {
  return {
    ...pendingManifest(),
    gates: {
      stagingUrl: {
        status: 'verified',
        url: options.stagingUrl ?? 'https://staging.example.test',
        httpStatus: 200,
        verifiedProjectId: options.stagingProjectId ?? projectId,
        verifiedAt: date,
        evidenceRefs: ['docs/R16_PREP_CHECKLIST.md'],
      },
      testSeed: {
        status: 'verified',
        projectId,
        skus: seedSkus,
        stockUnitsBySku: {
          'R16-TEST-ARROZ': 30,
          'R16-TEST-FEIJAO': 30,
          'R16-TEST-OLEO': 30,
        },
        verifiedAt: date,
        evidenceRefs: options.seedEvidenceRefs ?? ['docs/R16_PREP_CHECKLIST.md'],
      },
      operators: {
        status: 'verified',
        operatorRefs: options.operatorRefs ?? ['op_r16_operator_01', 'op_r16_operator_02'],
        verifiedAt: date,
        evidenceRefs: options.operatorEvidenceRefs ?? ['docs/R16_PREP_CHECKLIST.md'],
      },
      backupRestore: {
        status: 'verified',
        backupSha256: 'a'.repeat(64),
        restoredSchemaSha256: 'b'.repeat(64),
        restoreTargetProjectId: options.backupRestoreTargetProjectId ?? 'r16-disposable-local',
        costUsd: options.backupRestoreCostUsd ?? 0,
        verifiedAt: date,
        evidenceRefs: ['docs/R16_PREP_CHECKLIST.md'],
      },
    },
    productionAuthorization: {
      status: 'out-of-scope',
      verifiedAt: null,
      evidenceRefs: [],
    },
  };
}

describe('R16 rollout readiness', () => {
  it('keeps the current evidence blocked while the staging, operator and restore gates are pending', () => {
    const result = evaluateR16Readiness(pendingManifest());

    expect(result.status).toBe('blocked');
    expect(result.roundCompleted).toBe(false);
    expect(result.checks.filter((check) => check.required && !check.passed)).toHaveLength(3);
  });

  it('accepts one to three distinct operator evidence references', () => {
    expect(
      evaluateR16Readiness(readyManifest({ operatorRefs: ['op_r16_owner_01'] })).status,
    ).toBe('ready-to-start-isolated-staging');
    expect(
      evaluateR16Readiness(
        readyManifest({ operatorRefs: ['op_r16_operator_01', 'op_r16_operator_02'] }),
      ).status,
    ).toBe('ready-to-start-isolated-staging');
    const duplicateOperators = readyManifest();
    duplicateOperators.gates.operators.operatorRefs = ['op_r16_operator_01', 'op_r16_operator_01'];
    expect(evaluateR16Readiness(duplicateOperators).status).toBe('blocked');
    expect(
      evaluateR16Readiness(
        readyManifest({
          operatorRefs: ['op_r16_operator_01', 'op_r16_operator_02', 'op_r16_operator_03'],
        }),
      ).status,
    ).toBe('ready-to-start-isolated-staging');
    expect(
      evaluateR16Readiness(
        readyManifest({
          operatorRefs: [
            'op_r16_operator_01',
            'op_r16_operator_02',
            'op_r16_operator_03',
            'op_r16_operator_04',
          ],
        }),
      ).status,
    ).toBe('blocked');
  });

  it('does not treat a status flag without linked evidence as verified', () => {
    const result = evaluateR16Readiness(
      readyManifest({
        operatorEvidenceRefs: [],
        seedEvidenceRefs: [],
      }),
    );

    expect(result.status).toBe('blocked');
    expect(result.checks.find((check) => check.id === 'operators')?.passed).toBe(false);
    expect(result.checks.find((check) => check.id === 'test-seed')?.passed).toBe(false);
  });

  it('requires staging to identify the isolated V2 project and HTTPS response', () => {
    expect(
      evaluateR16Readiness(readyManifest({ stagingProjectId: 'production-project' })).status,
    ).toBe('blocked');
    expect(
      evaluateR16Readiness(readyManifest({ stagingUrl: 'http://staging.example.test' })).status,
    ).toBe('blocked');
  });

  it('requires a zero-cost restore to a separate target with SHA-256 evidence', () => {
    expect(
      evaluateR16Readiness(readyManifest({ backupRestoreTargetProjectId: projectId })).status,
    ).toBe('blocked');
    expect(evaluateR16Readiness(readyManifest({ backupRestoreCostUsd: 0.01 })).status).toBe(
      'blocked',
    );
  });

  it('rejects manifests with an unsupported schema version', () => {
    const invalidVersion = {
      ...readyManifest(),
      schemaVersion: 2,
    } as unknown as R16ReadinessManifest;

    expect(evaluateR16Readiness(invalidVersion).status).toBe('blocked');
  });

  it('keeps production authorization separate from isolated staging readiness', () => {
    const result = evaluateR16Readiness(readyManifest());

    expect(result.status).toBe('ready-to-start-isolated-staging');
    expect(result.checks.find((check) => check.id === 'production-authorization')).toMatchObject({
      required: false,
      passed: false,
    });
  });

  it('ignores legacy environment flags and reads the committed evidence manifest', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', 'scripts/r16-readiness.mjs'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          DA_V2_STAGING_URL: 'https://fake.example.test',
          DA_V2_TEST_SEED: 'true',
          DA_V2_OPERATOR_COUNT: '3',
          DA_V2_BACKUP_RESTORE: 'true',
          DA_V2_PRODUCTION_AUTHORIZATION: 'true',
        },
      },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe('blocked');
  });
});
