export const CHECKOUT_BASKET_REPLY_PREFIX = "wa-gh-basket:";
export const CHECKOUT_ACTION_PREFIX = "wa-gh-";

export function isCheckoutStartText(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 1000) return false;
  const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  return /^(?:(?:oi|ola)[\s,!.]*)?(?:(?:quero|gostaria de)\s+(?:(?:comprar|pedir)\b.*|(?:uma\s+)?cesta\b.*|fazer\s+(?:um\s+)?pedido(?:\s+(?:de\s+)?cesta\b.*)?)|(?:comprar|pedir)(?:\s+(?:uma\s+)?cesta\b.*)?|fazer\s+(?:um\s+)?pedido(?:\s+(?:de\s+)?cesta\b.*)?|cestas?\s+basicas?(?:\b.*)?|cesta|pedido)$/i.test(normalized);
}
