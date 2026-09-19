import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TEST_ROOT = join(ROOT, 'tests');

function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });
}

function normalized(file) {
  return relative(ROOT, file).replaceAll('\\', '/');
}

export function classifyTestFile(path) {
  if (/^tests\/unit\/[^/]+\.test\.ts$/.test(path)) return 'unit';
  if (/^tests\/contract\/[^/]+\.test\.ts$/.test(path)) return 'contract';
  if (/^tests\/security\/[^/]+\.test\.ts$/.test(path)) return 'security';
  if (/^tests\/e2e\/[^/]+\.spec\.ts$/.test(path)) return 'e2e';
  if (path === 'tests/isolation/isolation.test.mjs') return 'isolation';
  if (/^tests\/fixtures\//.test(path)) return 'fixture';
  return null;
}

export function verifyTestLayout({ testRoot = TEST_ROOT } = {}) {
  const files = walk(testRoot).filter((file) => statSync(file).isFile()).map(normalized);
  const executable = files.filter((path) => /\.(?:test\.ts|spec\.ts|test\.mjs)$/.test(path));
  const uncovered = executable.filter((path) => !classifyTestFile(path));
  const groups = executable.reduce((acc, path) => {
    const group = classifyTestFile(path);
    if (group) acc[group] = (acc[group] ?? 0) + 1;
    return acc;
  }, {});

  const requiredGroups = ['unit', 'contract', 'security', 'e2e', 'isolation'];
  const missingGroups = requiredGroups.filter((group) => !groups[group]);

  return {
    ok: uncovered.length === 0 && missingGroups.length === 0,
    filesScanned: files.length,
    executableTests: executable.length,
    groups,
    uncovered,
    missingGroups,
  };
}

function main() {
  const result = verifyTestLayout();
  if (!result.ok) {
    console.error('TEST LAYOUT CHECK FAILED');
    if (result.uncovered.length) {
      console.error('Uncovered executable test files:');
      for (const file of result.uncovered) console.error('- '+file);
    }
    if (result.missingGroups.length) {
      console.error('Missing test groups: '+result.missingGroups.join(', '));
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    'TEST LAYOUT CHECK OK '
    + '('+result.executableTests+' executable tests; '
    + JSON.stringify(result.groups)+')'
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
