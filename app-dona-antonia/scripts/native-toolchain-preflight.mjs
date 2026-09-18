import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

function probe(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
  });

  return {
    available: !result.error && result.status === 0,
    detail: (result.stdout || result.stderr || result.error?.message || '').trim().split('\n')[0] || null,
  };
}

export function evaluateNativeToolchain(snapshot) {
  const androidBlockers = [];
  const iosBlockers = [];

  if (!snapshot.node.available) {
    androidBlockers.push('node_missing');
    iosBlockers.push('node_missing');
  }
  if (!snapshot.npm.available) {
    androidBlockers.push('npm_missing');
    iosBlockers.push('npm_missing');
  }
  if (!snapshot.capacitorDependenciesInstalled) {
    androidBlockers.push('capacitor_dependencies_missing');
    iosBlockers.push('capacitor_dependencies_missing');
  }

  if (!snapshot.java.available) androidBlockers.push('java_missing');
  if (!snapshot.androidSdkConfigured) androidBlockers.push('android_sdk_missing');
  if (!snapshot.adb.available) androidBlockers.push('adb_missing');

  if (!snapshot.xcodebuild.available) iosBlockers.push('xcode_missing');

  return {
    android: {
      readyForNativeBuild: androidBlockers.length === 0,
      blockers: androidBlockers,
    },
    ios: {
      readyForNativeBuild: iosBlockers.length === 0,
      blockers: iosBlockers,
    },
  };
}

export function collectNativeToolchainSnapshot({
  env = process.env,
  projectRoot = ROOT,
} = {}) {
  return {
    node: probe('node'),
    npm: probe('npm'),
    java: probe('java', ['-version']),
    adb: probe('adb', ['version']),
    xcodebuild: probe('xcodebuild', ['-version']),
    androidSdkConfigured: Boolean(env.ANDROID_HOME || env.ANDROID_SDK_ROOT),
    capacitorDependenciesInstalled:
      existsSync(resolve(projectRoot, 'node_modules/@capacitor/cli/package.json'))
      && existsSync(resolve(projectRoot, 'node_modules/@capacitor/core/package.json')),
  };
}

function main() {
  const snapshot = collectNativeToolchainSnapshot();
  const result = evaluateNativeToolchain(snapshot);

  console.log(JSON.stringify({
    environment: 'homologation',
    snapshot,
    result,
  }, null, 2));

  const requireArg = process.argv.find((arg) => arg.startsWith('--require='));
  if (!requireArg) return;

  const required = requireArg.slice('--require='.length);
  if (required === 'android' && !result.android.readyForNativeBuild) {
    process.exitCode = 1;
  } else if (required === 'ios' && !result.ios.readyForNativeBuild) {
    process.exitCode = 1;
  } else if (required !== 'android' && required !== 'ios') {
    console.error('unknown --require target; use android or ios');
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
