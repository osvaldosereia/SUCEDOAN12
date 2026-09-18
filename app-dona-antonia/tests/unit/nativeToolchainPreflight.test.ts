import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateNativeToolchain } from '../../scripts/native-toolchain-preflight.mjs';

function available(detail='ok') {
  return { available:true, detail };
}

function missing() {
  return { available:false, detail:null };
}

const ready = {
  node:available(),
  npm:available(),
  java:available(),
  adb:available(),
  xcodebuild:available(),
  androidSdkConfigured:true,
  capacitorDependenciesInstalled:true,
};

test('native preflight marks Android and iOS ready only when their requirements exist', () => {
  const result=evaluateNativeToolchain(ready);
  assert.equal(result.android.readyForNativeBuild,true);
  assert.equal(result.ios.readyForNativeBuild,true);
  assert.deepEqual(result.android.blockers,[]);
  assert.deepEqual(result.ios.blockers,[]);
});

test('Android blockers are explicit and do not fabricate readiness', () => {
  const result=evaluateNativeToolchain({
    ...ready,
    java:missing(),
    adb:missing(),
    androidSdkConfigured:false,
    capacitorDependenciesInstalled:false,
  });

  assert.equal(result.android.readyForNativeBuild,false);
  assert.deepEqual(result.android.blockers,[
    'capacitor_dependencies_missing',
    'java_missing',
    'android_sdk_missing',
    'adb_missing',
  ]);
});

test('iOS readiness requires actual Xcode and Capacitor dependencies', () => {
  const result=evaluateNativeToolchain({
    ...ready,
    xcodebuild:missing(),
    capacitorDependenciesInstalled:false,
  });

  assert.equal(result.ios.readyForNativeBuild,false);
  assert.deepEqual(result.ios.blockers,[
    'capacitor_dependencies_missing',
    'xcode_missing',
  ]);
});
