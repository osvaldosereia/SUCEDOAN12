import { describe, expect, it } from 'vitest';
import { fiscalRetryState, validateFiscalContext, type FiscalContext } from './fiscal';

const context: FiscalContext = {
  destinationUf: 'MT',
  cfop: '5102',
  taxSituationCode: '102',
  taxRegime: 'SIMPLES_NACIONAL',
};

describe('orquestração fiscal V2', () => {
  it('valida contexto fiscal explícito sem deduzir regra tributária', () => {
    expect(validateFiscalContext(context)).toEqual([]);
    expect(validateFiscalContext({ ...context, cfop: '51' })).toContain('CFOP inválido.');
    expect(validateFiscalContext({ ...context, taxRegime: 'NORMAL' })).toEqual([]);
  });

  it('limita tentativas e permite reconciliação sem documento duplicado', () => {
    expect(fiscalRetryState(0, 3)).toEqual({ attempts: 1, retryable: true });
    expect(fiscalRetryState(2, 3)).toEqual({ attempts: 3, retryable: false });
  });
});
