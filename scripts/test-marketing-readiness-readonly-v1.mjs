import assert from 'node:assert/strict';
import fs from 'node:fs';

const file='admin-v3/marketing-readiness-readonly-v1.js';
assert.ok(fs.existsSync(file),'private read-only Marketing metrics/readiness module must exist');
const src=fs.readFileSync(file,'utf8');

assert.match(src,/Authorization:`Bearer \$\{a\.access_token\}`/,'readiness module must send bearer JWT');
assert.match(src,/admin-marketing-insights-v1/,'readiness module must use protected insights edge');
assert.match(src,/call\('metrics'/,'readiness module must load internal metrics');
assert.match(src,/call\('overview'/,'readiness module must load runtime channel gates');
assert.match(src,/external_side_effect!==false/,'readiness module must fail closed unless responses prove no external side effect');
assert.match(src,/Status WhatsApp/,'readiness must show WhatsApp Status');
assert.match(src,/Stories Instagram/,'readiness must show Instagram Stories');
assert.match(src,/Stories Facebook/,'readiness must show Facebook Stories');
assert.match(src,/Carrossel Instagram/,'readiness must show Instagram carousel');
assert.match(src,/Pinterest/,'readiness must show Pinterest');
assert.match(src,/Google Perfil da Empresa/,'readiness must show Google Business Profile');
assert.match(src,/OFF/,'readiness must make closed gates explicit');
assert.match(src,/7 dias|30 dias|90 dias/,'readiness must support bounded metric windows');
assert.ok(!/call\('(publish|execute|schedule_job|approve_asset|requeue|kill|create_|update_)/.test(src),'read-only readiness module must not call mutations or rollout actions');
assert.ok(!/setInterval\s*\(/.test(src),'read-only readiness module must not poll automatically');
assert.ok(!/graph\.facebook\.com|api\.pinterest\.com|mybusiness\.googleapis\.com|api\.openai\.com|generativelanguage\.googleapis\.com/i.test(src),'readiness module must not call external providers directly');

const publicAdmin=fs.readFileSync('admin/app-lite.js','utf8');
assert.ok(!publicAdmin.includes('marketing-readiness-readonly-v1'),'public Admin must not load private Marketing readiness module');

console.log('marketing-readiness-readonly-v1 contract: ok');
