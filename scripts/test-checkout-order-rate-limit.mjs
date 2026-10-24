import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [api, resilience] = await Promise.all([
  readFile(new URL('../supabase/functions/storefront-v2/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../checkout-resilience.js', import.meta.url), 'utf8')
]);
const helperStart = api.indexOf('async function allowOrderAttempt');
const helperEnd = api.indexOf('\nasync function submit(req', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'checkout rate guard helper must exist');
const helper = api.slice(helperStart, helperEnd);
const calls = [];
let reply = { data: true, error: null };
let shouldThrow = false;
const sandbox = {
  db: { rpc: async (...args) => { calls.push(args); if (shouldThrow) throw new Error('temporary'); return reply; } },
  txt: value => String(value ?? ''),
  console: { error: (...args) => calls.push(['log', ...args]) }
};
vm.runInNewContext(helper + '\nglobalThis.allowOrderAttempt = allowOrderAttempt;', sandbox);
assert.equal(await sandbox.allowOrderAttempt('v2:phone:hash', 10, 'phone'), true);
assert.equal(calls[0][0], 'consume_public_rate_limit');
assert.equal(calls[0][1].p_window_seconds, 60);
reply = { data: false, error: null };
assert.equal(await sandbox.allowOrderAttempt('v2:phone:hash', 10, 'phone'), false, 'only an actual limit hit blocks a checkout');
reply = { data: null, error: { message: 'rate table unavailable' } };
assert.equal(await sandbox.allowOrderAttempt('v2:phone:hash', 10, 'phone'), true, 'rate limit service errors must not reject orders');
shouldThrow = true;
assert.equal(await sandbox.allowOrderAttempt('v2:phone:hash', 10, 'phone'), true, 'transport errors must not reject orders');

const submitStart = api.indexOf('async function submit(req');
const submitEnd = api.indexOf('\nasync function ', submitStart + 1);
const submit = api.slice(submitStart, submitEnd);
assert.match(submit, /vitrine-direct:v2:ip:[^\n]+30,"ip"/);
assert.match(submit, /vitrine-direct:v2:phone:[^\n]+10,"phone"/);
assert.match(submit, /retry_after_seconds:60/);
assert.match(api, /"Retry-After":String\(r\.retry_after_seconds\)/);
assert.match(api, /storefront_order_rejected/);
assert.match(resilience, /aguarde até 1 minuto/);
assert.doesNotMatch(resilience, /aguarde alguns segundos e toque novamente/i);

console.log('Checkout retries are bounded, short-lived, and fail open if the limiter is unavailable.');
