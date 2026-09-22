import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const scriptsDir = path.join(repoRoot, 'scripts');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'test-admin-v3.yml');

const workflow = fs.readFileSync(workflowPath, 'utf8');
const papoTests = fs.readdirSync(scriptsDir)
  .filter((name) => /^test-.*papoai.*\.mjs$/i.test(name))
  .sort();

const missing = papoTests.filter((name) => !workflow.includes(`scripts/${name}`));

if (missing.length) {
  console.error('PapoAI tests missing from test-admin-v3.yml:');
  for (const name of missing) console.error(`- scripts/${name}`);
  process.exit(1);
}

console.log(`PapoAI CI coverage OK: ${papoTests.length} tests registered.`);
