/** Contexto Bling permanece no backend. Não importar este módulo em componentes públicos. */
export interface BlingProductProfile {
  sku: string;
  /** ID gerado pelo Bling após integração — pode estar ausente no CSV inicial. */
  blingProductId: string | null;
  unit: 'UN';
  originCode: string | null;
  ncm: string | null;
  cest: string | null;
  gtin: string | null;
  packagingGtin: string | null;
  unitsPerCase: number | null;
  supplierName: string | null;
  supplierCode: string | null;
  purchaseCostCents: number;
  /** Armazena todas as 59 colunas oficiais, mantendo os nomes exatos. */
  originalImportFields: Readonly<Record<string, string>>;
}
/** CFOP/CST/CSOSN da saída dependem de UF, regime e operação, nunca do SKU isolado. */
export interface FiscalTransactionContext {
  destinationUf: string;
  operation: 'VENDA';
  cfop: string | null;
  taxSituationCode: string | null;
  taxRegime: string | null;
}
export function validateBlingProfile(value: BlingProductProfile): string[] {
  const errors: string[] = [];
  if (!value.sku.trim()) errors.push('SKU ausente');
  if (value.unit !== 'UN') errors.push('Unidade não é UN');
  if (value.ncm && !/^\d{8}$/.test(value.ncm)) errors.push('NCM deve ter oito dígitos');
  if (value.cest && !/^\d{7}$/.test(value.cest)) errors.push('CEST deve ter sete dígitos');
  if (value.gtin && !/^\d{8}$|^\d{12,14}$/.test(value.gtin)) errors.push('GTIN inválido');
  if (value.packagingGtin && !/^\d{8}$|^\d{12,14}$/.test(value.packagingGtin))
    errors.push('GTIN de embalagem inválido');
  if (
    value.unitsPerCase !== null &&
    (!Number.isSafeInteger(value.unitsPerCase) || value.unitsPerCase <= 0)
  )
    errors.push('Conversão de caixa inválida');
  if (!Number.isSafeInteger(value.purchaseCostCents) || value.purchaseCostCents < 0)
    errors.push('Custo inválido');
  return errors;
}
