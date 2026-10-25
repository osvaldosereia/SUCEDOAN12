import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { R16ReadinessManifest } from './rollout-readiness';
import { evaluateR16Readiness } from './rollout-readiness';

const projectId = 'hjudhofluihkxykwekir';
const seedSkus = ['R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO'];
const date = '2026-10-25';

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

function privateSitesPreviewManifest(): R16ReadinessManifest {
  const previewUrl = 'https://dona-antonia-v2-admin-preview.juniorsereia.chatgpt.site/admin/';
  const githubSourceCommitSha = 'bd894392d62e2fa0208209b60ca78ff7227800f1';
  const base = readyManifest({ stagingUrl: previewUrl });

  return {
    ...base,
    gates: {
      ...base.gates,
      stagingUrl: {
        ...base.gates.stagingUrl,
        httpStatus: null,
        evidenceRefs: [
          previewUrl,
          `https://github.com/osvaldosereia/SUCEDOAN12/commit/${githubSourceCommitSha}`,
        ],
        siteDeployment: {
          deploymentId: 'appgdep_6add6d1b4af081919ad862777fa97241',
          status: 'succeeded',
          access: 'owner-only',
          versionNumber: 4,
          siteSourceCommitSha: '0f825c25279c338fe62c230148bc5c8a3fa4fbe1',
          githubSourceCommitSha,
          browserVerifiedAt: date,
        },
      },
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
    expect(evaluateR16Readiness(readyManifest({ operatorRefs: ['op_r16_owner_01'] })).status).toBe(
      'ready-to-start-isolated-staging',
    );
    expect(
      evaluateR16Readiness(
        readyManifest({
          operatorRefs: ['op_r16_operator_01', 'op_r16_operator_02'],
        }),
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

  it('accepts a private Sites deployment when its HTTP status is not exposed but browser render is verified', () => {
    const result = evaluateR16Readiness(privateSitesPreviewManifest());
    expect(result.status).toBe('ready-to-start-isolated-staging');
    expect(result.checks.find((check) => check.id === 'staging-url')?.passed).toBe(true);
  });

  it('requires the Sites preview to be successful, owner-only and linked to its source commit', () => {
    const valid = privateSitesPreviewManifest();
    const validGate = valid.gates.stagingUrl;
    const validDeployment = validGate.siteDeployment;
    if (validDeployment === null || validDeployment === undefined) {
      throw new Error('The private Sites evidence fixture must include deployment details.');
    }

    const invalidDeployments = [
      { ...validDeployment, status: 'failed' as const },
      { ...validDeployment, access: 'public' as const },
      { ...validDeployment, githubSourceCommitSha: 'not-a-commit' },
      { ...validDeployment, browserVerifiedAt: '2026-10-24' },
    ];

    for (const siteDeployment of invalidDeployments) {
      const manifest: R16ReadinessManifest = {
        ...valid,
        gates: {
          ...valid.gates,
          stagingUrl: { ...validGate, siteDeployment },
        },
      };
      expect(
        evaluateR16Readiness(manifest).checks.find((check) => check.id === 'staging-url')?.passed,
      ).toBe(false);
    }

    const missingSourceLink: R16ReadinessManifest = {
      ...valid,
      gates: {
        ...valid.gates,
        stagingUrl: { ...validGate, evidenceRefs: [validGate.url ?? ''] },
      },
    };
    expect(
      evaluateR16Readiness(missingSourceLink).checks.find((check) => check.id === 'staging-url')
        ?.passed,
    ).toBe(false);
  });

  it('does not accept a staging URL without HTTP or successful deployment evidence', () => {
    const base = readyManifest();
    const manifest = {
      ...base,
      gates: {
        ...base.gates,
        stagingUrl: { ...base.gates.stagingUrl, httpStatus: null },
      },
    };

    const result = evaluateR16Readiness(manifest);
    expect(result.status).toBe('blocked');
    expect(result.checks.find((check) => check.id === 'staging-url')?.passed).toBe(false);

    const failedHttpStatus = privateSitesPreviewManifest();
    failedHttpStatus.gates.stagingUrl.httpStatus = 503;
    const failedHttpResult = evaluateR16Readiness(failedHttpStatus);
    expect(failedHttpResult.status).toBe('blocked');
    expect(failedHttpResult.checks.find((check) => check.id === 'staging-url')?.passed).toBe(false);
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
