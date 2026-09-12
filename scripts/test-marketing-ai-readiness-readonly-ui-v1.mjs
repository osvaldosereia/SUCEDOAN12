import assert from 'node:assert/strict';
import fs from 'node:fs';

const file='admin-v3/marketing-ai-readiness-readonly-v1.js';
assert.ok(fs.existsSync(file),'private AI readiness UI must exist');
const src=fs.readFileSync(file,'utf8');

assert.ok(!/fetch\(|XMLHttpRequest|axios|Authorization|Bearer |localStorage|sessionStorage/.test(src),'AI readiness UI must stay local-only and credential-free');
assert.ok(!/graph\.facebook\.com|api\.pinterest\.com|googleapis\.com|api\.openai\.com|generativelanguage\.googleapis\.com/.test(src),'AI readiness UI must not call providers directly');
assert.match(src,/marketing-ai-preflight-v1/,'AI readiness UI must accept only the AI preflight contract');
assert.match(src,/provider_call_allowed/,'AI readiness UI must validate provider-call prohibition');
assert.match(src,/external_side_effect/,'AI readiness UI must validate side-effect prohibition');
assert.match(src,/network_allowed/,'AI readiness UI must validate network prohibition');
assert.match(src,/estimated_cost_cents/,'AI readiness UI must display estimated cost');
assert.match(src,/blockers/,'AI readiness UI must display blockers');
assert.ok(!/publish|execute|requeue|schedule|approve/i.test(src.replace(/marketing-ai-preflight-v1/g,'')),'AI readiness UI must not expose rollout actions');

console.log('PASS: dormant AI readiness UI is local-only, cost-aware, and non-executing.');
