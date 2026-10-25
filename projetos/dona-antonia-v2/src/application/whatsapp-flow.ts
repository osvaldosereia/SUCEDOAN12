import {
  normalizeCity,
  normalizeDigits,
  PAYMENT_METHODS,
  type CheckoutLineInput,
  type CheckoutOrderRequest,
  type PaymentMethod,
} from '../core/checkout-order';
import type { WhatsAppUtilityAccount } from './whatsapp-utility';

export interface WhatsAppFlowSubmissionInput {
  readonly providerAccount: string;
  readonly senderPhone: string;
  readonly messageId: string;
  readonly responseJson: string;
}

export interface WhatsAppFlowSubmission {
  readonly providerAccount: WhatsAppUtilityAccount;
  readonly messageId: string;
  readonly flowToken: string;
  readonly request: CheckoutOrderRequest;
}

const MAX_LINE_COUNT = 50;
const MAX_LINE_QUANTITY = 99;
const MAX_BASKET_QUANTITY = 99;

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Campo inválido: ${field}.`);
  return value as Record<string, unknown>;
}

function requiredText(
  record: Record<string, unknown>,
  field: string,
  options: { readonly minLength?: number; readonly maxLength?: number } = {},
): string {
  const value = record[field];
  const text = typeof value === 'string' ? value.trim() : '';
  const minLength = options.minLength ?? 1;
  const maxLength = options.maxLength ?? 160;
  if (text.length < minLength || text.length > maxLength)
    throw new Error(`Campo inválido: ${field}.`);
  return text;
}

function optionalText(
  record: Record<string, unknown>,
  field: string,
  maxLength = 160,
): string {
  const value = record[field];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > maxLength)
    throw new Error(`Campo inválido: ${field}.`);
  return value.trim();
}

function quantity(record: Record<string, unknown>, field: string, max: number): number {
  const value = record[field];
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max)
    throw new Error(`Quantidade inválida: ${field}.`);
  return value as number;
}

function parseLines(value: unknown, field: string, required: boolean): CheckoutLineInput[] {
  if (!Array.isArray(value)) {
    if (!required && (value === undefined || value === null)) return [];
    throw new Error(`Itens inválidos: ${field}.`);
  }
  if (value.length > MAX_LINE_COUNT) throw new Error(`Itens demais: ${field}.`);

  return value.map((entry, index) => {
    const line = asRecord(entry, `${field}[${index}]`);
    return {
      typeId: requiredText(line, 'typeId', { maxLength: 128 }),
      sku: requiredText(line, 'sku', { maxLength: 128 }),
      quantity: quantity(line, 'quantity', MAX_LINE_QUANTITY),
    };
  });
}

function normalizeBrazilianPhone(value: string): string {
  let digits = normalizeDigits(value);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13))
    digits = digits.slice(2);
  if (!/^\d{10,11}$/.test(digits)) throw new Error('Telefone WhatsApp inválido.');
  return digits;
}

function normalizeDeliveryDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Data de entrega inválida.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error('Data de entrega inválida.');
  return value;
}

function parseFlowResponse(responseJson: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseJson) as unknown;
  } catch {
    throw new Error('Resposta do WhatsApp Flow inválida.');
  }
  return asRecord(parsed, 'response_json');
}

export function parseWhatsAppFlowSubmission(
  input: WhatsAppFlowSubmissionInput,
): WhatsAppFlowSubmission {
  if (input.providerAccount !== '0975' && input.providerAccount !== '1018')
    throw new Error('Conta WhatsApp desconhecida.');
  if (typeof input.messageId !== 'string' || !input.messageId.trim() || input.messageId.length > 255)
    throw new Error('Identificador da mensagem inválido.');

  const response = parseFlowResponse(input.responseJson);
  const flowToken = requiredText(response, 'flow_token', { minLength: 16, maxLength: 120 });
  if (!/^[A-Za-z0-9_-]+$/.test(flowToken)) throw new Error('Identificador do Flow inválido.');

  const basketId = requiredText(response, 'basketId', { maxLength: 128 });
  const basketQuantity = quantity(response, 'basketQuantity', MAX_BASKET_QUANTITY);
  const basketLines = parseLines(response.basketLines, 'basketLines', true);
  const extraLines = parseLines(response.extraLines, 'extraLines', false);
  if (basketLines.length === 0) throw new Error('A cesta está vazia.');

  const customerName = requiredText(response, 'customerName', { minLength: 3, maxLength: 120 });
  const recipientName =
    optionalText(response, 'recipientName', 120) || customerName;
  const cityInput = requiredText(response, 'city', { maxLength: 80 });
  const city = normalizeCity(cityInput);
  if (!city) throw new Error('Cidade fora da área de entrega.');

  const rawPaymentMethod = requiredText(response, 'paymentMethod', { maxLength: 40 });
  if (!(PAYMENT_METHODS as readonly string[]).includes(rawPaymentMethod))
    throw new Error('Forma de pagamento inválida.');
  const paymentMethod = rawPaymentMethod as PaymentMethod;

  const postalCode = normalizeDigits(requiredText(response, 'postalCode', { maxLength: 16 }));
  if (!/^\d{8}$/.test(postalCode)) throw new Error('CEP inválido.');

  const request: CheckoutOrderRequest = {
    basketId,
    basketQuantity,
    basketLines,
    extraLines,
    customer: {
      name: customerName,
      phone: normalizeBrazilianPhone(input.senderPhone),
      address: {
        recipientName,
        postalCode,
        street: requiredText(response, 'street', { maxLength: 160 }),
        streetNumber: requiredText(response, 'streetNumber', { maxLength: 32 }),
        complement: optionalText(response, 'complement', 120),
        neighborhood: requiredText(response, 'neighborhood', { maxLength: 120 }),
        city,
        stateCode: 'MT',
        referenceNote: optionalText(response, 'referenceNote', 240),
      },
    },
    paymentMethod,
    deliveryDate: normalizeDeliveryDate(requiredText(response, 'deliveryDate', { maxLength: 10 })),
    idempotencyKey: `flow:${flowToken}`,
  };

  return {
    providerAccount: input.providerAccount,
    messageId: input.messageId.trim(),
    flowToken,
    request,
  };
}
