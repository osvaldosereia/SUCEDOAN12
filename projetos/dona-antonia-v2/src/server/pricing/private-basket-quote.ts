/** Este módulo é exclusivo do backend. Nunca importar no site público. */
export interface PrivatePricingInput {
  productSubtotalCents: number;
  privateBasketAdjustmentCents: number;
}
export interface PublicQuote {
  totalCents: number;
}
const assertMoney = (value:number) => {
  if(!Number.isSafeInteger(value)||value<0)throw new Error('Valor monetário inválido');
};
/**
 * O campo privado é armazenado no admin/banco e somado NO SERVIDOR.
 * Somente totalCents deve ser exposto para o cliente; não enviar o valor interno.
 */
export function calculateBasketQuote(input:PrivatePricingInput):PublicQuote {
  assertMoney(input.productSubtotalCents);
  assertMoney(input.privateBasketAdjustmentCents);
  const totalCents=input.productSubtotalCents+input.privateBasketAdjustmentCents;
  assertMoney(totalCents);
  return {totalCents};
}
