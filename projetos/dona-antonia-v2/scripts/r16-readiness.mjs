import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateR16Readiness } from '../src/application/rollout-readiness.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(projectRoot, 'docs');
const manifestPath = path.join(docsRoot, 'R16_EVIDENCE_MANIFEST.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const evidenceRefs = [
  ...Object.values(manifest.gates).flatMap((gate) => gate.evidenceRefs ?? []),
  ...(manifest.productionAuthorization.evidenceRefs ?? []),
];

for (const reference of evidenceRefs) {
  if (!reference.startsWith('docs/')) continue;
  const relativePath = reference.split('#', 1)[0];
  const absolutePath = path.resolve(projectRoot, relativePath);
  if (!absolutePath.startsWith(docsRoot + path.sep)) {
    throw new Error('Evidence path must stay under docs/: ' + reference);
  }
  await access(absolutePath);
}

const result = evaluateR16Readiness(manifest);
console.log(JSON.stringify(result, null, 2));
