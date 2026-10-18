import assert from 'node:assert/strict';
import fs from 'node:fs';

const file='admin-v3/marketing-operations-readonly-v1.js';
assert.ok(fs.existsSync(file),'private read-only Marketing operations module must exist');
const src=fs.readFileSync(file,'utf8');

assert.match(src,/Authorization:`Bearer \$\{a\.access_token\}`/,'operations module must send bearer JWT');
assert.match(src,/admin-marketing-workflow-v1/,'operations module must use protected workflow edge');
assert.match(src,/call\('workflow_overview'/,'operations module must load calendar/approval/publication queue read model');
assert.match(src,/call\('editor_overview'/,'operations module must load campaign/render queue read model');
assert.match(src,/external_side_effect!==false/,'operations module must fail closed unless responses prove no external side effect');
assert.match(src,/Campanhas/,'operations module must expose campaign summary');
assert.match(src,/Calendário/,'operations module must expose calendar summary');
assert.match(src,/Fila/,'operations module must expose queue summary');
assert.match(src,/Aprovação/,'operations module must expose approval summary');
assert.ok(!/call\('(submit_review|approve_asset|schedule_job|unschedule_job|publish|execute|requeue)'/.test(src),'read-only operations module must not call mutation or rollout actions');
assert.ok(!/setInterval\s*\(/.test(src),'read-only operations module must not poll automatically');
assert.ok(!/graph\.facebook\.com|api\.pinterest\.com|mybusiness\.googleapis\.com|api\.openai\.com|generativelanguage\.googleapis\.com/i.test(src),'operations module must not call external providers directly');

const publicAdmin=fs.readFileSync('admin/app-lite.js','utf8');
assert.ok(!publicAdmin.includes('marketing-operations-readonly-v1'),'public Admin must not load private Marketing operations module');

console.log('marketing-operations-readonly-v1 contract: ok');
