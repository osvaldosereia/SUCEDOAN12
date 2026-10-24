export const R16_V2_PROJECT_ID = 'hjudhofluihkxykwekir';

const expectedTestSkus = ['R16-TEST-ARROZ', 'R16-TEST-FEIJAO', 'R16-TEST-OLEO'] as const;

export type ReadinessStatus = 'blocked' | 'ready-to-start-isolated-staging';
export type R16EvidenceStatus = 'pending' | 'verified';

export interface R16EvidenceRecord {
  status: R16EvidenceStatus | 'out-of-scope';
  verifiedAt: string | null;
  evidenceRefs: readonly string[];
}

export interface R16ReadinessManifest {
  schemaVersion: 1;
  projectId: string;
  gates: {
    stagingUrl: R16EvidenceRecord & {
      url: string | null;
      httpStatus: number | null;
      verifiedProjectId: string | null;
    };
    testSeed: R16EvidenceRecord & {
      projectId: string | null;
      skus: readonly string[];
      stockUnitsBySku: Readonly<Record<string, number>>;
    };
    operators: R16EvidenceRecord & {
      operatorRefs: readonly string[];
    };
    backupRestore: R16EvidenceRecord & {
      backupSha256: string | null;
      restoredSchemaSha256: string | null;
      restoreTargetProjectId: string | null;
      costUsd: number | null;
    };
  };
  productionAuthorization: R16EvidenceRecord;
}

export interface R16ReadinessCheck {
  id: string;
  required: boolean;
  passed: boolean;
  detail: string;
}

export interface R16ReadinessResult {
  status: ReadinessStatus;
  roundCompleted: false;
  checks: readonly R16ReadinessCheck[];
}

function isValidDate(value: string | null): boolean {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function isValidEvidenceRef(value: string): boolean {
  if (value.startsWith('docs/')) {
    const filePath = value.split('#')[0] ?? '';
    return (
      !/\s/.test(value) &&
      !filePath.includes('\\') &&
      filePath
        .split('/')
        .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    );
  }

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function hasReviewedEvidence(record: R16EvidenceRecord): boolean {
  return (
    record.status === 'verified' &&
    isValidDate(record.verifiedAt) &&
    Array.isArray(record.evidenceRefs) &&
    record.evidenceRefs.length > 0 &&
    record.evidenceRefs.every(
      (reference) => typeof reference === 'string' && isValidEvidenceRef(reference),
    )
  );
}

function isHttpsUrl(value: string | null): boolean {
  if (value === null) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function hasExpectedSeed(manifest: R16ReadinessManifest): boolean {
  const seed = manifest.gates.testSeed;
  if (
    !Array.isArray(seed.skus) ||
    seed.stockUnitsBySku === null ||
    typeof seed.stockUnitsBySku !== 'object'
  ) {
    return false;
  }
  const skus = [...seed.skus].sort();
  const stockSkus = Object.keys(seed.stockUnitsBySku).sort();
  const expectedSkus = [...expectedTestSkus].sort();
  return (
    hasReviewedEvidence(seed) &&
    seed.projectId === R16_V2_PROJECT_ID &&
    manifest.projectId === R16_V2_PROJECT_ID &&
    JSON.stringify(skus) === JSON.stringify(expectedSkus) &&
    JSON.stringify(stockSkus) === JSON.stringify(expectedSkus) &&
    expectedTestSkus.every((sku) => seed.stockUnitsBySku[sku] === 30)
  );
}

function hasVerifiedStagingUrl(manifest: R16ReadinessManifest): boolean {
  const gate = manifest.gates.stagingUrl;
  return (
    hasReviewedEvidence(gate) &&
    manifest.projectId === R16_V2_PROJECT_ID &&
    gate.verifiedProjectId === R16_V2_PROJECT_ID &&
    isHttpsUrl(gate.url) &&
    Number.isInteger(gate.httpStatus) &&
    gate.httpStatus !== null &&
    gate.httpStatus >= 200 &&
    gate.httpStatus < 300
  );
}

function hasIsolatedOperators(manifest: R16ReadinessManifest): boolean {
  const refs = manifest.gates.operators.operatorRefs;
  return (
    hasReviewedEvidence(manifest.gates.operators) &&
    Array.isArray(refs) &&
    refs.length >= 2 &&
    refs.length <= 3 &&
    new Set(refs).size === refs.length &&
    refs.every(
      (reference) => typeof reference === 'string' && /^op_[A-Za-z0-9_-]{8,}$/.test(reference),
    )
  );
}

function hasZeroCostRestore(manifest: R16ReadinessManifest): boolean {
  const gate = manifest.gates.backupRestore;
  return (
    hasReviewedEvidence(gate) &&
    /^[a-f0-9]{64}$/i.test(gate.backupSha256 ?? '') &&
    /^[a-f0-9]{64}$/i.test(gate.restoredSchemaSha256 ?? '') &&
    typeof gate.restoreTargetProjectId === 'string' &&
    gate.restoreTargetProjectId.trim().length > 0 &&
    gate.restoreTargetProjectId !== manifest.projectId &&
    gate.costUsd === 0
  );
}

export function evaluateR16Readiness(manifest: R16ReadinessManifest): R16ReadinessResult {
  const manifestValid = manifest.schemaVersion === 1 && manifest.projectId === R16_V2_PROJECT_ID;
  const stagingPassed = manifestValid && hasVerifiedStagingUrl(manifest);
  const seedPassed = manifestValid && hasExpectedSeed(manifest);
  const operatorsPassed = manifestValid && hasIsolatedOperators(manifest);
  const backupRestorePassed = manifestValid && hasZeroCostRestore(manifest);
  const productionAuthorizationPassed = hasReviewedEvidence(manifest.productionAuthorization);
  const checks: R16ReadinessCheck[] = [
    {
      id: 'staging-url',
      required: true,
      passed: stagingPassed,
      detail: stagingPassed
        ? 'URL HTTPS acessível e vinculada ao Supabase V2; evidência registrada.'
        : 'Falta URL HTTPS acessível e evidência de vínculo ao Supabase V2; não usar produção.',
    },
    {
      id: 'test-seed',
      required: true,
      passed: seedPassed,
      detail: seedPassed
        ? 'Três SKUs R16 fictícios com estoque 30, verificados na V2 e com evidência.'
        : 'Falta comprovar os três SKUs fictícios e estoque 30 no Supabase V2.',
    },
    {
      id: 'operators',
      required: true,
      passed: operatorsPassed,
      detail: operatorsPassed
        ? 'Dois ou três operadores isolados têm referências de evidência registradas.'
        : 'Definir evidências de dois ou três operadores isolados; não incluir dados pessoais.',
    },
    {
      id: 'backup-restore',
      required: true,
      passed: backupRestorePassed,
      detail: backupRestorePassed
        ? 'Backup e restore verificados em alvo separado, custo zero e hashes registrados.'
        : 'Falta ensaio de backup/restore em alvo separado, sem custo e com hashes de verificação.',
    },
    {
      id: 'production-authorization',
      required: false,
      passed: productionAuthorizationPassed,
      detail: productionAuthorizationPassed
        ? 'Autorização produtiva registrada separadamente.'
        : 'Autorização produtiva é gate separado e não bloqueia o pré-voo isolado de staging.',
    },
  ];

  return {
    status: checks.every((check) => !check.required || check.passed)
      ? 'ready-to-start-isolated-staging'
      : 'blocked',
    roundCompleted: false,
    checks,
  };
}
