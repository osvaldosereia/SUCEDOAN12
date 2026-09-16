import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const edge=readFileSync(new URL('../../../supabase/functions/creative-studio-jobs-v1/index.ts',import.meta.url),'utf8');
const worker=readFileSync(new URL('../../../scripts/creative-studio-render-worker.mjs',import.meta.url),'utf8');

test('jobs edge keeps the flattened render-job contract and idempotent creation',()=>{
  assert.match(edge,/job\.product_id/);
  assert.match(edge,/job\.product_snapshot/);
  assert.match(edge,/estimated_cost_brl/);
  assert.match(edge,/idempotency_key/);
  assert.match(edge,/attempt_count/);
  assert.match(edge,/max_attempts/);
  assert.match(edge,/paid_approved/);
  assert.doesNotMatch(edge,/job\?\.product\?\.id/);
});

test('jobs edge exposes settings memory create queue get and list without touching Comprar',()=>{
  for(const action of ['settings','memory','create','queue','get','list'])assert.match(edge,new RegExp(`action==='${action}'`));
  assert.doesNotMatch(edge,/admin-orders-comprar|shopping-chat|shopping-room/);
});

test('render worker claims atomically and only finishes or fails its own lease',()=>{
  assert.match(worker,/creative_studio_recover_stale_jobs/);
  assert.match(worker,/creative_studio_claim_job/);
  assert.match(worker,/creative_studio_complete_job/);
  assert.match(worker,/creative_studio_fail_job/);
  assert.match(worker,/workerId/);
  assert.doesNotMatch(worker,/status=eq\.queued&select=\*&order=created_at\.asc&limit=1/);
});
