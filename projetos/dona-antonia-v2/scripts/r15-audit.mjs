import { performance } from 'node:perf_hooks';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = resolve('src');
const dist = resolve('dist');
const catalogSize = 802;
const operatorCount = 3;
const maxOperatorMsTarget = 2_000;

function makeCatalog() {
  return Array.from({ length: catalogSize }, (_, index) => ({
    sku: `R15-${String(index + 1).padStart(4, '0')}`,
    name: `Produto de homologação ${index + 1}`,
    brand: index % 2 === 0 ? 'Dona Antônia' : 'Exemplo',
    category: index % 3 === 0 ? 'MERCEARIA BÁSICA' : 'LIMPEZA',
    priceCents: 100 + (index % 97),
    stock: index % 5,
    active: index % 7 !== 0,
  }));
}

function runOperator(catalog, operatorIndex) {
  const started = performance.now();
  for (let queryIndex = 0; queryIndex < 120; queryIndex += 1) {
    const query = String((queryIndex + operatorIndex) % 80);
    catalog
      .filter((product) => product.name.includes(query) || product.sku.includes(query))
      .filter((product) => product.active)
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 48);
  }
  return performance.now() - started;
}

function collectFiles(folder) {
  const files = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(file));
    else files.push(file);
  }
  return files;
}

const catalog = makeCatalog();
const operatorDurationsMs = Array.from({ length: operatorCount }, (_, index) =>
  runOperator(catalog, index),
);
const assets = collectFiles(dist)
  .filter((file) => /\.(?:js|css)$/.test(file))
  .map((file) => ({ file: file.slice(dist.length + 1), bytes: statSync(file).size }))
  .sort((left, right) => right.bytes - left.bytes);
const sourceFiles = collectFiles(src).filter(
  (file) => /\.(?:ts|tsx|css)$/.test(file) && !file.includes('.test.'),
);
const sourceText = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const secretPatterns = [
  /service_role/i,
  /sb_secret_/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /access_token\s*[:=]/i,
  /api\.bling\.com\.br/i,
];
const secretFindings = secretPatterns.filter((pattern) => pattern.test(sourceText)).map(String);
const accessibilitySpec = readFileSync(resolve('e2e/responsive-a11y.spec.ts'), 'utf8');

const result = {
  audit: 'R15',
  catalogSize: catalog.length,
  operatorCount,
  operatorDurationsMs: operatorDurationsMs.map((duration) => Number(duration.toFixed(2))),
  maxOperatorMs: Number(Math.max(...operatorDurationsMs).toFixed(2)),
  maxOperatorMsTarget,
  syntheticLoadStatus:
    catalog.length >= 802 && Math.max(...operatorDurationsMs) <= maxOperatorMsTarget
      ? 'pass'
      : 'fail',
  assetBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  largestAsset: assets[0] ?? null,
  secretFindings,
  accessibilitySuite: {
    file: 'e2e/responsive-a11y.spec.ts',
    axeBuilder:
      accessibilitySpec.includes('AxeBuilder') && accessibilitySpec.includes('wcag21aa')
        ? 'configured'
        : 'missing',
  },
};

console.log(JSON.stringify(result, null, 2));
if (
  result.syntheticLoadStatus !== 'pass' ||
  result.secretFindings.length > 0 ||
  result.accessibilitySuite.axeBuilder !== 'configured'
)
  process.exitCode = 1;
