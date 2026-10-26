import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'vitrine/admin/runtime-src');
const output = join(root, 'vitrine/admin/admin-runtime.js');
const parts = [
  '01-core-navigation.part.js.txt',
  '02-order-support.part.js.txt',
  '03-operations.part.js.txt',
  '04-products.part.js.txt',
  '05-order-stock-review.part.js.txt',
  '07-customers.part.js.txt',
  '08-orders-detail.part.js.txt',
  '09-bootstrap.part.js.txt',
];

const expected = (await Promise.all(parts.map(part => readFile(join(source, part), 'utf8')))).join('');
if (process.argv.includes('--check')) {
  const actual = await readFile(output, 'utf8');
  if (actual !== expected) {
    console.error(`Admin runtime is out of sync. Run: node scripts/build-vitrine-admin-runtime.mjs`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${parts.length} source parts match ${relative(root, output)} (${expected.length} characters)`);
  }
} else {
  await writeFile(output, expected, 'utf8');
  console.log(`Generated ${relative(root, output)} from ${parts.length} source parts`);
}
