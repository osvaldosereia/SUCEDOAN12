import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(path => path && existsSync(path));
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(path => path && existsSync(path));
const files = [...new Set([...tracked, ...untracked])];

const retainedPrefixes = [
  'supabase/',
  'projetos/whatsapp-atendimento-github/',
];

const retainedFiles = new Set([
  '.nojekyll',
  '404.html',
  'CNAME',
  'README.md',
  'index.html',
  '.gitignore',
  'docs/projects/whatsapp-atendimento-github/HANDOFF.md',
  'img/logoantonia5.png',
  'adicionar/index.html',
  'montar/index.html',
  'montar/app.js',
  'montar/styles.css',
  'orcamento/index.html',
  'orcamento/app-original.html',
  'orcamento/presets-bonini.json',
  'pedido/index.html',
  'pedido/customer-actions.js',
  'p/index.html',
  'vitrine/admin/index.html',
  'vitrine/admin/admin-feature-bridges.js',
  'vitrine/admin/admin-runtime.js',
  'vitrine/admin/basket-admin-section.js',
  'vitrine/admin/basket-guided-builder.js',
  'vitrine/admin/orders-visual-v1.js',
  'vitrine/admin/styles/admin-inline-overrides.css',
  'vitrine/admin/styles/admin-main.css',
  'vitrine/admin/styles/montar-existing-vitrine-only.css',
  'vitrine/admin/atendimento/index.html',
  'vitrine/admin/atendimento/attendance-app.js',
  'vitrine/admin/atendimento/attendance-auth.js',
  'vitrine/admin/atendimento/attendance-send.js',
  'vitrine/admin/atendimento/attendance-media-send.js',
  'vitrine/admin/atendimento/attendance.css',
  'vitrine/admin/whatsapp-lab/meta-flow/DYNAMIC-IMPLEMENTATION.md',
  'vitrine/admin/whatsapp-lab/meta-flow/flow-dynamic-v1.json',
  'vitrine/admin/whatsapp-lab/meta-flow/flow-dynamic-v2.json',
  'vitrine/admin/ana/ana-admin.js',
  'vitrine/admin/ana/ana-admin.css',
  'vitrine/admin/ana/ana-automation-library.js',
  'vitrine/admin/ana/ana-diagnostics.js',
  'vitrine/admin/ana/ana-knowledge.js',
  'vitrine/admin/runtime-src/01-core-navigation.part.js.txt',
  'vitrine/admin/runtime-src/02-order-support.part.js.txt',
  'vitrine/admin/runtime-src/03-operations.part.js.txt',
  'vitrine/admin/runtime-src/04-products.part.js.txt',
  'vitrine/admin/runtime-src/05-order-stock-review.part.js.txt',
  'vitrine/admin/runtime-src/07-customers.part.js.txt',
  'vitrine/admin/runtime-src/08-orders-detail.part.js.txt',
  'vitrine/admin/runtime-src/09-bootstrap.part.js.txt',
  'vitrine/admin/runtime-src/README.md',
  'scripts/build-vitrine-admin-runtime.mjs',
  'scripts/test-attendance-simple-chat.mjs',
  'scripts/test-vitrine-admin-navigation.mjs',
  'scripts/test-admin-ana-section-v1.mjs',
  'scripts/test-vitrine-admin-simple-products.mjs',
  'scripts/test-vitrine-admin-simple-baskets-customers.mjs',
  'scripts/test-vitrine-admin-repository-scope.mjs',
  'scripts/helpers/admin-ui-source.mjs',
  'scripts/test-admin-orders-fiscal-flow-v4.mjs',
  'scripts/test-admin-orders-clean-flow-v3.mjs',
  'scripts/test-order-separation-verified-gate-v4.mjs',
  'scripts/test-order-separation-completion-feedback-v4.mjs',
  'scripts/test-bling-hub-separation-stock-gate-v1.mjs',
  'scripts/test-montar-picking-v1.mjs',
  'scripts/test-orcamento-admin-integration.mjs',
  'scripts/test-orcamento-lazy-product-search.mjs',
  'scripts/test-orcamento-modos-v2.mjs',
  'scripts/test-orcamento-admin-integration.mjs',
  '.github/workflows/test-admin-orders-fiscal-flow-v4.yml',
  '.github/workflows/whatsapp-atendimento-github-publish.yml',
  '.github/workflows/montar-picking-ci.yml',
  '.github/workflows/vitrine-admin-core-ci.yml',
]);

const retainedAdminFiles = new Set(
  [...retainedFiles].filter(path => path.startsWith('vitrine/admin/'))
);

const outsideScope = files.filter(path =>
  !retainedFiles.has(path) &&
  !retainedPrefixes.some(prefix => path.startsWith(prefix))
);
const extraAdminFiles = files.filter(path =>
  path.startsWith('vitrine/admin/') && !retainedAdminFiles.has(path)
);

assert.equal(outsideScope.length, 0,
  'Tracked files remain outside the retained scope: ' + outsideScope.slice(0, 20).join(', '));
assert.equal(extraAdminFiles.length, 0,
  'Unselected Admin files remain: ' + extraAdminFiles.join(', '));

for (const required of [
  'supabase/config.toml',
  'vitrine/admin/index.html',
  'vitrine/admin/atendimento/index.html',
  'vitrine/admin/ana/ana-admin.js',
  'orcamento/index.html',
  'pedido/index.html',
  'p/index.html',
]) {
  assert.ok(files.includes(required), 'Required runtime file is missing: ' + required);
}

console.log('OK: ' + files.length + ' repository files are within the retained scope.');
