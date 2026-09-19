export type HmlEnvironment = 'homologation' | 'production' | 'development';

export type HmlBoundaryContext = {
  environment: HmlEnvironment;
  productionEnabled: boolean;
  subjectId: string;
};

export type HmlBoundaryResult = { accepted: boolean; blockers: string[] };

const TEST_SUBJECT_PREFIX = 'TEST-SUBJECT-';
const TEST_PRODUCT_PREFIX = 'TEST-PRODUCT-';
const TEST_CART_PREFIX = 'TEST-CART-';
const TEST_OPERATION_PREFIX = 'TEST-OP-';
const TEST_IDEMPOTENCY_PREFIX = 'TEST-IDEMPOTENCY-';
const TEST_PAIR_PREFIX = 'TEST-PAIR-';
const TEST_SESSION_PREFIX = 'TEST-SESSION-';
const TEST_TELEMETRY_PREFIX = 'TEST-TELEMETRY-';
const TEST_PRIVACY_PREFIX = 'TEST-PRIVACY-';

function baseBlockers(context: HmlBoundaryContext): string[] {
  const blockers: string[] = [];
  if (context.environment !== 'homologation') blockers.push('environment_not_homologation');
  if (context.productionEnabled) blockers.push('production_enabled');
  if (!context.subjectId.startsWith(TEST_SUBJECT_PREFIX)) blockers.push('subject_not_synthetic');
  return blockers;
}

export function validateBootstrapContract(input: HmlBoundaryContext & { externalRequests: number }): HmlBoundaryResult {
  const blockers = baseBlockers(input);
  if (input.externalRequests !== 0) blockers.push('bootstrap_external_request_forbidden');
  return { accepted: blockers.length === 0, blockers };
}

export function validateCatalogContract(input: HmlBoundaryContext & { productIds: readonly string[]; pricesCents: readonly number[] }): HmlBoundaryResult {
  const blockers = baseBlockers(input);
  if (input.productIds.length !== input.pricesCents.length) blockers.push('catalog_shape_mismatch');
  if (input.productIds.some((id) => !id.startsWith(TEST_PRODUCT_PREFIX))) blockers.push('catalog_product_not_synthetic');
  if (input.pricesCents.some((price) => !Number.isSafeInteger(price) || price < 0)) blockers.push('catalog_invalid_price');
  return { accepted: blockers.length === 0, blockers };
}

export function validateCheckoutContract(input: HmlBoundaryContext & {
  cartId: string; operationId: string; idempotencyKey: string; itemProductIds: readonly string[];
  presentedTotalCents: number; authoritativeTotalCents: number;
}): HmlBoundaryResult {
  const blockers = baseBlockers(input);
  if (!input.cartId.startsWith(TEST_CART_PREFIX)) blockers.push('cart_not_synthetic');
  if (!input.operationId.startsWith(TEST_OPERATION_PREFIX)) blockers.push('operation_not_synthetic');
  if (!input.idempotencyKey.startsWith(TEST_IDEMPOTENCY_PREFIX)) blockers.push('idempotency_key_not_synthetic');
  if (input.itemProductIds.length === 0) blockers.push('checkout_empty_cart');
  if (input.itemProductIds.some((id) => !id.startsWith(TEST_PRODUCT_PREFIX))) blockers.push('checkout_product_not_synthetic');
  if (!Number.isSafeInteger(input.presentedTotalCents) || input.presentedTotalCents < 0) blockers.push('invalid_presented_total');
  if (!Number.isSafeInteger(input.authoritativeTotalCents) || input.authoritativeTotalCents < 0) blockers.push('invalid_authoritative_total');
  if (input.presentedTotalCents !== input.authoritativeTotalCents) blockers.push('authoritative_total_mismatch');
  return { accepted: blockers.length === 0, blockers };
}

export function validatePairingBoundary(input: HmlBoundaryContext & {
  challengeId: string; sessionToken: string; consumed: boolean; expiresAtMs: number; nowMs: number;
}): HmlBoundaryResult {
  const blockers = baseBlockers(input);
  if (!input.challengeId.startsWith(TEST_PAIR_PREFIX)) blockers.push('pairing_challenge_not_synthetic');
  if (!input.sessionToken.startsWith(TEST_SESSION_PREFIX)) blockers.push('pairing_session_not_synthetic');
  if (input.consumed) blockers.push('pairing_challenge_already_consumed');
  if (!Number.isSafeInteger(input.expiresAtMs) || !Number.isSafeInteger(input.nowMs) || input.expiresAtMs <= input.nowMs) blockers.push('pairing_challenge_expired');
  return { accepted: blockers.length === 0, blockers };
}

export function validateTelemetryBoundary(input: HmlBoundaryContext & {
  eventId: string; containsPii: boolean; containsFreeText: boolean; containsAdvertisingId: boolean; externalSinkCalls: number;
}): HmlBoundaryResult {
  const blockers = baseBlockers(input);
  if (!input.eventId.startsWith(TEST_TELEMETRY_PREFIX)) blockers.push('telemetry_event_not_synthetic');
  if (input.containsPii) blockers.push('telemetry_pii_forbidden');
  if (input.containsFreeText) blockers.push('telemetry_free_text_forbidden');
  if (input.containsAdvertisingId) blockers.push('telemetry_advertising_id_forbidden');
  if (input.externalSinkCalls !== 0) blockers.push('telemetry_external_sink_forbidden');
  return { accepted: blockers.length === 0, blockers };
}

export function validatePrivacyBoundary(input: HmlBoundaryContext & {
  requestId: string; operation: 'access' | 'delete'; targetSubjectId: string; externalWrites: number;
}): HmlBoundaryResult {
  const blockers = baseBlockers(input);
  if (!input.requestId.startsWith(TEST_PRIVACY_PREFIX)) blockers.push('privacy_request_not_synthetic');
  if (!input.targetSubjectId.startsWith(TEST_SUBJECT_PREFIX)) blockers.push('privacy_target_not_synthetic');
  if (input.targetSubjectId !== input.subjectId) blockers.push('privacy_subject_mismatch');
  if (input.externalWrites !== 0) blockers.push('privacy_external_write_forbidden');
  return { accepted: blockers.length === 0, blockers };
}
