import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateInternalBetaReadiness } from '../../src/platform/releaseReadiness.ts';

const safeBase = {
  platform: 'android' as const,
  appEnvironment: 'homologation' as const,
  nativeArtifactValidated: true,
  nativeSecureSessionValidated: true,
  nativeDeepLinksValidated: true,
  isolationSuiteValidated: true,
  typecheckValidated: true,
  securityReviewComplete: true,
  privacyReviewComplete: true,
  storeMetadataPrepared: true,
  productionEnabled: false,
  realOrdersEnabled: false,
  realPushEnabled: false,
  externalExecutorsEnabled: false,
};

test('internal beta may be ready only with native validations and every real effect OFF', () => {
  assert.deepEqual(evaluateInternalBetaReadiness(safeBase), {
    ready: true,
    platform: 'android',
    blockers: [],
  });
});

test('missing native artifact and native security boundaries block beta readiness', () => {
  const result = evaluateInternalBetaReadiness({
    ...safeBase,
    platform: 'ios',
    nativeArtifactValidated: false,
    nativeSecureSessionValidated: false,
    nativeDeepLinksValidated: false,
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'native_artifact_missing',
    'native_secure_session_unvalidated',
    'native_deep_links_unvalidated',
  ]);
});

test('production environment and any real external effect block internal beta readiness', () => {
  const result = evaluateInternalBetaReadiness({
    ...safeBase,
    appEnvironment: 'production',
    productionEnabled: true,
    realOrdersEnabled: true,
    realPushEnabled: true,
    externalExecutorsEnabled: true,
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'homologation_environment_required',
    'production_must_stay_off',
    'real_orders_must_stay_off',
    'real_push_must_stay_off',
    'external_executors_must_stay_off',
  ]);
});

test('unexecuted isolation suite and typecheck are explicit fail-closed blockers', () => {
  const result = evaluateInternalBetaReadiness({
    ...safeBase,
    isolationSuiteValidated: false,
    typecheckValidated: false,
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'isolation_suite_unvalidated',
    'typecheck_unvalidated',
  ]);
});

test('privacy, security and store metadata are explicit independent gates', () => {
  const result = evaluateInternalBetaReadiness({
    ...safeBase,
    securityReviewComplete: false,
    privacyReviewComplete: false,
    storeMetadataPrepared: false,
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'security_review_incomplete',
    'privacy_review_incomplete',
    'store_metadata_incomplete',
  ]);
});
