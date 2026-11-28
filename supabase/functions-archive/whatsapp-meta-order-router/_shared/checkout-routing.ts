export const CHECKOUT_BASKET_REPLY_PREFIX = "wa-gh-basket:";
export const CHECKOUT_ACTION_PREFIX = "wa-gh-";

export function isCheckoutStartText(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 1000) return false;
  const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  const withoutGreeting = normalized.replace(/^(?:(?:oi|ola)[\s,!.]*)/, "");
  return /^(?:(?:(?:quero|gostaria de)\s+)?(?:comprar|pedir|montar)\s+(?:(?:uma|minha|a)\s+)?cestas?\b.*|(?:quero|gostaria de)\s+(?:(?:uma|minha|a)\s+)?cestas?\b.*|(?:(?:quero|gostaria de)\s+)?fazer\s+(?:um\s+)?pedido\s+(?:de\s+)?(?:(?:uma|a)\s+)?cestas?\b.*)$/i.test(withoutGreeting);
}
