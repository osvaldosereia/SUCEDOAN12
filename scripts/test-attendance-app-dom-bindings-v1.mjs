import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('vitrine/admin/atendimento/index.html', 'utf8');
const app = fs.readFileSync('vitrine/admin/atendimento/attendance-app.js', 'utf8');
const pageIds = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const directBindings = [...app.matchAll(/\$\('#([^']+)'\)\.(?:on[a-z]+)\s*=/g)].map((match) => match[1]);
const missingTargets = [...new Set(directBindings.filter((id) => !pageIds.has(id)))];

assert.deepEqual(missingTargets, [], `attendance-app.js binds handlers to absent elements: ${missingTargets.join(', ')}`);
assert.doesNotMatch(app, /PapoAI|papoai/i, 'native attendance core must not retain a PapoAI dependency');
assert.match(page, /attendance-app\.js\?v=(?:attendance-papoai-retired-v1|ana-identified-catalog-v1|mobile-chat-v1)/, 'page must bust the stale attendance script cache');

console.log('PASS attendance-app DOM binding contract');
