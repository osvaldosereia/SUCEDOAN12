export type ReadinessStatus = 'ready' | 'blocked';

export interface R16ReadinessInput {
  readonly stagingUrl: boolean;
  readonly testSeed: boolean;
  readonly operatorCount: number;
  readonly backupRestoreRehearsed: boolean;
  readonly productionAuthorization: boolean;
}

export interface R16ReadinessCheck {
  readonly id: string;
  readonly required: boolean;
  readonly passed: boolean;
  readonly detail: string;
}

export interface R16ReadinessResult {
  readonly status: ReadinessStatus;
  readonly checks: readonly R16ReadinessCheck[];
}

export function evaluateR16Readiness(input: R16ReadinessInput): R16ReadinessResult {
  const checks: R16ReadinessCheck[] = [
    {
      id: 'staging-url',
      required: true,
      passed: input.stagingUrl,
      detail: input.stagingUrl
        ? 'URL de staging V2 acessível para medição.'
        : 'Falta URL de staging V2 acessível; não usar produção.',
    },
    {
      id: 'test-seed',
      required: true,
      passed: input.testSeed,
      detail: input.testSeed
        ? 'Seed fictício vendável delimitado ao V2.'
        : 'Seed V2 ainda inativo/estoque zero.',
    },
    {
      id: 'operators',
      required: true,
      passed: input.operatorCount >= 2 && input.operatorCount <= 3,
      detail:
        input.operatorCount >= 2 && input.operatorCount <= 3
          ? `${input.operatorCount} operadores de teste definidos.`
          : 'Definir dois ou três operadores de teste isolados.',
    },
    {
      id: 'backup-restore',
      required: true,
      passed: input.backupRestoreRehearsed,
      detail: input.backupRestoreRehearsed
        ? 'Backup e restore controlados ensaiados.'
        : 'Backup/restore remoto ainda não foi ensaiado.',
    },
    {
      id: 'production-authorization',
      required: true,
      passed: input.productionAuthorization,
      detail: input.productionAuthorization
        ? 'Autorização explícita registrada para o piloto.'
        : 'Nenhuma autorização de produção; manter piloto bloqueado.',
    },
  ];

  return {
    status: checks.every((check) => !check.required || check.passed) ? 'ready' : 'blocked',
    checks,
  };
}
