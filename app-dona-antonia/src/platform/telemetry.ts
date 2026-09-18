export type TelemetryEventName =
  | 'app_open'
  | 'section_opened'
  | 'search'
  | 'basket_selected'
  | 'checkout_started'
  | 'checkout_completed'
  | 'push_opened'
  | 'reorder_started';

export type TelemetryPlatform = 'web' | 'pwa' | 'android' | 'ios';

type Payment = 'pix' | 'cash' | 'credit_card' | 'meal_card';
type Section = 'home' | 'catalog' | 'basket' | 'cart' | 'checkout' | 'order' | 'privacy';
type PushKind = 'transactional' | 'marketing';

export type TelemetryEvent =
  | { name: 'app_open'; properties: Record<string, never> }
  | { name: 'section_opened'; properties: { section: Section } }
  | { name: 'search'; properties: { queryLength: number; resultCount: number } }
  | { name: 'basket_selected'; properties: { itemCount: number; totalCents: number } }
  | { name: 'checkout_started'; properties: { itemCount: number; totalCents: number } }
  | { name: 'checkout_completed'; properties: { itemCount: number; totalCents: number; payment: Payment } }
  | { name: 'push_opened'; properties: { kind: PushKind } }
  | { name: 'reorder_started'; properties: { itemCount: number } };

export interface TelemetryEnvelope {
  name: TelemetryEventName;
  properties: Record<string, unknown>;
  appVersion: string;
  platform: TelemetryPlatform;
  occurredAt: number;
}

export interface TelemetryCollectorOptions {
  enabled?: boolean;
  appVersion?: string;
  platform?: TelemetryPlatform;
  now?: () => number;
  sink?: (event: TelemetryEnvelope) => Promise<void>;
}

export type TelemetryEmitResult =
  | { accepted: true; reason: 'sent' }
  | { accepted: false; reason: 'disabled' | 'invalid_event' | 'sink_unavailable' | 'sink_error' };

const EVENT_NAMES = new Set<TelemetryEventName>([
  'app_open',
  'section_opened',
  'search',
  'basket_selected',
  'checkout_started',
  'checkout_completed',
  'push_opened',
  'reorder_started',
]);

const SECTIONS = new Set<Section>([
  'home',
  'catalog',
  'basket',
  'cart',
  'checkout',
  'order',
  'privacy',
]);

const PAYMENTS = new Set<Payment>([
  'pix',
  'cash',
  'credit_card',
  'meal_card',
]);

const PUSH_KINDS = new Set<PushKind>([
  'transactional',
  'marketing',
]);

const FORBIDDEN_KEYS = new Set([
  'phone',
  'telephone',
  'cpf',
  'address',
  'street',
  'neighborhood',
  'message',
  'text',
  'freeText',
  'query',
  'email',
  'name',
  'advertisingId',
  'idfa',
  'gaid',
]);

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  const keys = Object.keys(value).sort();
  const target = [...expected].sort();
  return keys.length === target.length
    && keys.every((key, index) => key === target[index]);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function positiveOrZeroMoney(value: unknown): value is number {
  return nonNegativeInteger(value) && Number(value) <= 100_000_000;
}

function containsForbiddenKey(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => FORBIDDEN_KEYS.has(key));
}

export function validateTelemetryEvent(
  input: { name: TelemetryEventName; properties: Record<string, unknown> },
): input is TelemetryEvent {
  if (!EVENT_NAMES.has(input.name)) return false;
  if (!plainObject(input.properties)) return false;
  if (containsForbiddenKey(input.properties)) return false;

  const p = input.properties;

  switch (input.name) {
    case 'app_open':
      return hasExactKeys(p, []);

    case 'section_opened':
      return hasExactKeys(p, ['section'])
        && typeof p.section === 'string'
        && SECTIONS.has(p.section as Section);

    case 'search':
      return hasExactKeys(p, ['queryLength', 'resultCount'])
        && nonNegativeInteger(p.queryLength)
        && Number(p.queryLength) <= 200
        && nonNegativeInteger(p.resultCount);

    case 'basket_selected':
    case 'checkout_started':
      return hasExactKeys(p, ['itemCount', 'totalCents'])
        && nonNegativeInteger(p.itemCount)
        && positiveOrZeroMoney(p.totalCents);

    case 'checkout_completed':
      return hasExactKeys(p, ['itemCount', 'totalCents', 'payment'])
        && nonNegativeInteger(p.itemCount)
        && positiveOrZeroMoney(p.totalCents)
        && typeof p.payment === 'string'
        && PAYMENTS.has(p.payment as Payment);

    case 'push_opened':
      return hasExactKeys(p, ['kind'])
        && typeof p.kind === 'string'
        && PUSH_KINDS.has(p.kind as PushKind);

    case 'reorder_started':
      return hasExactKeys(p, ['itemCount'])
        && nonNegativeInteger(p.itemCount);

    default:
      return false;
  }
}

export function createTelemetryCollector(
  options: TelemetryCollectorOptions = {},
) {
  const enabled = options.enabled === true;
  const appVersion = options.appVersion ?? 'unknown-hml';
  const platform = options.platform ?? 'web';
  const now = options.now ?? Date.now;
  const sink = options.sink;

  return {
    async emit(event: TelemetryEvent): Promise<TelemetryEmitResult> {
      if (!enabled) {
        return { accepted: false, reason: 'disabled' };
      }

      if (!validateTelemetryEvent(event)) {
        return { accepted: false, reason: 'invalid_event' };
      }

      if (!sink) {
        return { accepted: false, reason: 'sink_unavailable' };
      }

      const envelope: TelemetryEnvelope = {
        name: event.name,
        properties: { ...event.properties },
        appVersion,
        platform,
        occurredAt: now(),
      };

      try {
        await sink(envelope);
        return { accepted: true, reason: 'sent' };
      } catch {
        return { accepted: false, reason: 'sink_error' };
      }
    },
  };
}
