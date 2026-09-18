import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, '..');

const RUNTIME_PATHS = [
  'src',
  'public',
  'native',
  'android',
  'ios',
  'capacitor.config.ts',
  'vite.config.ts',
  '.env',
  '.env.local',
  '.env.production',
];

export const FORBIDDEN_RUNTIME_PATTERNS = [
  ['Comprar atual', /(?:https?:\/\/[^\s"'\x60]+)?\/comprar(?:\/|\b)/i],
  ['service role', /\b(?:service_role|SUPABASE_SERVICE_ROLE_KEY)\b/i],
  ['app habilitado em produção', /\bmobile_app_enabled\s*[:=]\s*["']?true\b/i],
  ['Supabase de produção atual', /\bssbesxgaijknwsjbsbcz\.supabase\.co\b/i],
  ['Bling', /\bapi\.bling\.com\.br\b/i],
  ['Meta Graph', /\bgraph\.facebook\.com\b/i],
];

function walk(path) {
  if (!existsSync(path)) return [];
  const st = statSync(path);
  if (st.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', '.git', 'build'].includes(entry.name)) return [];
    return walk(join(path, entry.name));
  });
}

export function inspectText(text, fileName = '<memory>') {
  const findings = [];
  for (const [label, pattern] of FORBIDDEN_RUNTIME_PATTERNS) {
    if (pattern.test(text)) findings.push({ file: fileName, label });
  }
  return findings;
}

export function runIsolationCheck({ rootDir = PROJECT_ROOT } = {}) {
  const findings = [];
  const scanned = [];
  for (const entry of RUNTIME_PATHS) {
    for (const file of walk(join(rootDir, entry))) {
      if (/\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf|zip|aab|apk)$/i.test(file)) continue;
      const rel = relative(rootDir, file).replaceAll('\\', '/');
      const text = readFileSync(file, 'utf8');
      scanned.push(rel);
      findings.push(...inspectText(text, rel));
    }
  }
  return { ok: findings.length === 0, findings, scanned };
}

function main() {
  const result = runIsolationCheck();
  if (!result.ok) {
    console.error('ISOLATION CHECK FAILED');
    for (const item of result.findings) console.error(`- ${item.file}: ${item.label}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ISOLATION CHECK OK (${result.scanned.length} runtime/config files scanned)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
