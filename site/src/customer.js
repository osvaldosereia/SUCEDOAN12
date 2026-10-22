export function normalizeWhatsapp(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 10) digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  if (digits.length !== 11 || !digits.slice(2).startsWith('9')) return '';
  return `+55${digits}`;
}

export function addressSummary(customer = {}) {
  const address = customer.address || {};
  return [address.street, address.number, address.complement, address.neighborhood || address.district, address.city].filter(Boolean).join(', ');
}
