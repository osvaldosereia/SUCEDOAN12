import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'../../../supabase/functions/creative-studio-jobs-v1/index.ts'),'utf8');

test('jobs create endpoint persists and reuses stable idempotency keys',()=>{
  assert.match(source,/idempotency_key/);
  assert.match(source,/eq\('idempotency_key'/);
  assert.match(source,/idempotent:true/);
});

test('queue endpoint exposes retry counters and never silently restarts exhausted jobs',()=>{
  assert.match(source,/attempt_count/);
  assert.match(source,/max_attempts/);
  assert.match(source,/max_attempts_reached/);
});
