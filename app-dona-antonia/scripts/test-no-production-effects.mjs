import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, '..');

export const SAFE_DEFAULTS = Object.freeze({
  APP_ENV: 'homologation',
  MOBILE_APP_ENABLED: 'false',
  APP_ALLOW_REAL_ORDERS: 'false',
  APP_ALLOW_REAL_PUSH: 'false',
  APP_ALLOW_EXTERNAL_EXECUTORS: 'false',
});

const FORBIDDEN_HOSTS = [
  'ssbesxgaijknwsjbsbcz.supabase.co',
  'api.bling.com.br',
  'graph.facebook.com',
];

export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

export function validateSafetyConfig(config) {
  const errors = [];
  for (const [key, expected] of Object.entries(SAFE_DEFAULTS)) {
    if ((config[key] ?? '') !== expected) errors.push(`${key} must be ${expected}`);
  }
  for (const [key, value] of Object.entries(config)) {
    const normalized = String(value).toLowerCase();
    for (const host of FORBIDDEN_HOSTS) {
      if (normalized.includes(host.toLowerCase())) errors.push(`${key} points to forbidden production host ${host}`);
    }
  }
  return errors;
}

export function runNoProductionEffectsCheck({ rootDir = PROJECT_ROOT, runtimeEnv = process.env } = {}) {
  const sample = parseEnv(readFileSync(resolve(rootDir, '.env.example'), 'utf8'));
  const errors = validateSafetyConfig(sample);

  const relevantOverrides = {};
  for (const key of Object.keys(SAFE_DEFAULTS)) {
    if (runtimeEnv[key] !== undefined) relevantOverrides[key] = runtimeEnv[key];
  }
  if (Object.keys(relevantOverrides).length) {
    const merged = { ...sample, ...relevantOverrides };
    errors.push(...validateSafetyConfig(merged).map((e) => `runtime override: ${e}`));
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const result = runNoProductionEffectsCheck();
  if (!result.ok) {
    console.error('PRODUCTION-EFFECTS CHECK FAILED');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('PRODUCTION-EFFECTS CHECK OK (all real-effect gates OFF)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
