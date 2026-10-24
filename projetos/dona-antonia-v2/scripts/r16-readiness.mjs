const bool = (value) => value === 'true' || value === '1';
const operatorCount = Number(process.env.DA_V2_OPERATOR_COUNT ?? 0);
const checks = [
  {
    id: 'staging-url',
    passed: Boolean(process.env.DA_V2_STAGING_URL),
    detail: 'URL isolada de staging V2 acessível.',
  },
  {
    id: 'test-seed',
    passed: bool(process.env.DA_V2_TEST_SEED),
    detail: 'Seed fictício vendável somente na V2.',
  },
  {
    id: 'operators',
    passed: operatorCount >= 2 && operatorCount <= 3,
    detail: 'Dois ou três operadores isolados.',
  },
  {
    id: 'backup-restore',
    passed: bool(process.env.DA_V2_BACKUP_RESTORE),
    detail: 'Backup/restore controlado ensaiado.',
  },
  {
    id: 'production-authorization',
    passed: bool(process.env.DA_V2_PRODUCTION_AUTHORIZATION),
    detail: 'Autorização explícita de piloto produtivo.',
  },
];
const result = {
  round: 'R16',
  status: checks.every(({ passed }) => passed) ? 'ready' : 'blocked',
  checks,
  note: 'Bloqueado é resultado esperado até homologação; este script não publica nem altera dados.',
};
console.log(JSON.stringify(result, null, 2));
