import assert from 'node:assert/strict';
import fs from 'node:fs';

const file='admin-v3/marketing-library-v1.js';
assert.ok(fs.existsSync(file),'private Marketing library must exist');
const src=fs.readFileSync(file,'utf8');

assert.match(src,/Authorization:`Bearer \$\{a\.access_token\}`/,'library must send bearer JWT');
assert.match(src,/admin-marketing-v1/,'library must use protected admin-marketing-v1 edge');
assert.match(src,/api\('overview'/,'library must load commands/templates from overview');
assert.match(src,/api\('create_command'/,'library must save command versions through create_command');
assert.match(src,/api\('create_template'/,'library must save template versions through create_template');
assert.match(src,/external_side_effect!==false/,'library must fail closed if overview does not prove no external side effect');
assert.match(src,/Nova versão|nova versão|Salvar nova versão/,'library must make append/version semantics explicit');
assert.match(src,/Comandos reutilizáveis|Biblioteca de comandos/,'library must expose reusable commands');
assert.match(src,/Modelos reutilizáveis|Biblioteca de modelos/,'library must expose reusable templates');
assert.match(src,/deterministic_renderer/,'library must support deterministic no-AI renderer hints');
assert.match(src,/requires_ai_gate/,'AI presets must remain explicitly gate-bound');
assert.match(src,/requires_cost_budget/,'AI presets must remain explicitly budget-bound');
assert.ok(!/api\('(publish|approve|enable|schedule|execute|requeue)'/.test(src),'library must not expose rollout or execution actions');
assert.ok(!/graph\.facebook\.com|api\.pinterest\.com|mybusiness\.googleapis\.com|api\.openai\.com|generativelanguage\.googleapis\.com/i.test(src),'library must not call external providers directly');

const publicAdmin=fs.readFileSync('admin/app-lite.js','utf8');
assert.ok(!publicAdmin.includes('marketing-library-v1'),'public Admin must not load private Marketing library');

const edge=fs.readFileSync('supabase/functions/admin-marketing-v1/index.ts','utf8');
assert.match(edge,/action==="create_command"/,'protected edge must expose create_command');
assert.match(edge,/create_marketing_command_draft_v1/,'create_command must delegate to versioned database RPC');
assert.match(edge,/action==="create_template"/,'protected edge must expose create_template');
assert.match(edge,/create_marketing_template_draft_v1/,'create_template must delegate to versioned database RPC');
assert.match(edge,/Deliberately absent: approve, schedule, publish, enable, canary, token write and paid-provider actions/,'edge must keep rollout and paid-provider actions absent');

console.log('marketing-library-v1 contract: ok');
