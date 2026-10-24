export const CHECKOUT_MINIMUM_CENTS = 7500;
export const DELIVERY_CITIES = ['Cuiabá', 'Várzea Grande'] as const;
export type DeliveryCity = (typeof DELIVERY_CITIES)[number];
export const PAYMENT_METHODS = [
  'PIX',
  'DINHEIRO',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
  'VALE_ALIMENTACAO',
  'VALE_REFEICAO',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface CheckoutAddress {
  recipientName: string;
  postalCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: DeliveryCity;
  stateCode: 'MT';
  referenceNote: string;
}

export interface CheckoutCustomer {
  name: string;
  phone: string;
  address: CheckoutAddress;
}

export interface CheckoutLineInput {
  typeId: string;
  sku: string;
  quantity: number;
}

export interface CheckoutOrderRequest {
  basketId: string;
  basketQuantity: number;
  basketLines: readonly CheckoutLineInput[];
  extraLines: readonly CheckoutLineInput[];
  customer: CheckoutCustomer;
  paymentMethod: PaymentMethod;
  deliveryDate: string;
  idempotencyKey: string;
}

export interface CheckoutValidationContext {
  now?: Date;
  holidays?: readonly string[];
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizeCity(value: string): DeliveryCity | null {
  const normalized = fold(value);
  if (normalized === 'cuiaba') return 'Cuiabá';
  if (normalized === 'varzea grande') return 'Várzea Grande';
  return null;
}

export function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localDateParts(now: Date): { date: string; hour: number; weekday: number } {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cuiaba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);
  const part = (type: string) => formatted.find((item) => item.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')),
    weekday: weekdayMap[part('weekday')] ?? -1,
  };
}

export function validateCheckoutRequest(
  request: CheckoutOrderRequest,
  totalCents: number,
  context: CheckoutValidationContext = {},
): string[] {
  const errors: string[] = [];
  if (!Number.isSafeInteger(totalCents) || totalCents < CHECKOUT_MINIMUM_CENTS)
    errors.push(`O pedido mínimo é de R$ ${CHECKOUT_MINIMUM_CENTS / 100}`);
  if (
    !request.basketId.trim() ||
    !Number.isInteger(request.basketQuantity) ||
    request.basketQuantity < 1
  )
    errors.push('Escolha uma cesta válida.');
  if (!request.basketLines.some((line) => line.quantity > 0)) errors.push('A cesta está vazia.');
  if (!request.customer.name.trim() || request.customer.name.trim().length < 3)
    errors.push('Informe seu nome completo.');
  if (!/^\d{10,11}$/.test(normalizeDigits(request.customer.phone)))
    errors.push('Informe um WhatsApp válido.');
  const address = request.customer.address;
  if (!normalizeCity(address.city)) errors.push('Entregamos apenas em Cuiabá e Várzea Grande.');
  if (address.stateCode !== 'MT') errors.push('Informe um endereço em Mato Grosso.');
  if (!/^\d{8}$/.test(normalizeDigits(address.postalCode))) errors.push('Informe um CEP válido.');
  for (const [label, value] of [
    ['logradouro', address.street],
    ['número', address.streetNumber],
    ['bairro', address.neighborhood],
  ] as const) {
    if (!value.trim()) errors.push(`Informe o ${label}.`);
  }
  if (!PAYMENT_METHODS.includes(request.paymentMethod)) errors.push('Forma de pagamento inválida.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.deliveryDate))
    errors.push('Escolha uma data de entrega válida.');
  const local = localDateParts(context.now ?? new Date());
  const holidays = new Set(context.holidays ?? []);
  if (request.deliveryDate === local.date && local.hour >= 12)
    errors.push('O horário de corte de hoje já passou; escolha outra data.');
  const delivery = new Date(`${request.deliveryDate}T12:00:00-04:00`);
  if (Number.isNaN(delivery.valueOf())) errors.push('Escolha uma data de entrega válida.');
  else {
    const deliveryParts = localDateParts(delivery);
    if (deliveryParts.weekday === 0) errors.push('Não fazemos entregas aos domingos.');
    if (holidays.has(request.deliveryDate)) errors.push('Não fazemos entregas em feriados.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(request.idempotencyKey))
    errors.push('Identificador de pedido inválido.');
  return errors;
}
