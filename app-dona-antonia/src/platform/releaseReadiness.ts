export type StorePlatform = 'android' | 'ios';

export interface InternalBetaReadinessInput {
  platform: StorePlatform;
  nativeArtifactValidated: boolean;
  nativeSecureSessionValidated: boolean;
  nativeDeepLinksValidated: boolean;
  securityReviewComplete: boolean;
  privacyReviewComplete: boolean;
  storeMetadataPrepared: boolean;
  productionEnabled: boolean;
  realOrdersEnabled: boolean;
  realPushEnabled: boolean;
  externalExecutorsEnabled: boolean;
}

export type InternalBetaBlocker =
  | 'native_artifact_missing'
  | 'native_secure_session_unvalidated'
  | 'native_deep_links_unvalidated'
  | 'security_review_incomplete'
  | 'privacy_review_incomplete'
  | 'store_metadata_incomplete'
  | 'production_must_stay_off'
  | 'real_orders_must_stay_off'
  | 'real_push_must_stay_off'
  | 'external_executors_must_stay_off';

export interface InternalBetaReadinessResult {
  ready: boolean;
  platform: StorePlatform;
  blockers: InternalBetaBlocker[];
}

export function evaluateInternalBetaReadiness(
  input: InternalBetaReadinessInput,
): InternalBetaReadinessResult {
  const blockers: InternalBetaBlocker[] = [];

  if (!input.nativeArtifactValidated) blockers.push('native_artifact_missing');
  if (!input.nativeSecureSessionValidated) blockers.push('native_secure_session_unvalidated');
  if (!input.nativeDeepLinksValidated) blockers.push('native_deep_links_unvalidated');
  if (!input.securityReviewComplete) blockers.push('security_review_incomplete');
  if (!input.privacyReviewComplete) blockers.push('privacy_review_incomplete');
  if (!input.storeMetadataPrepared) blockers.push('store_metadata_incomplete');

  if (input.productionEnabled) blockers.push('production_must_stay_off');
  if (input.realOrdersEnabled) blockers.push('real_orders_must_stay_off');
  if (input.realPushEnabled) blockers.push('real_push_must_stay_off');
  if (input.externalExecutorsEnabled) blockers.push('external_executors_must_stay_off');

  return {
    ready: blockers.length === 0,
    platform: input.platform,
    blockers,
  };
}
