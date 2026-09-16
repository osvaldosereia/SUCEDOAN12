import test from 'node:test';
import assert from 'node:assert/strict';
import {decideQueueTransition} from '../job-state.js';

test('queueing an already queued job is idempotent and does not consume another attempt',()=>{
  const d=decideQueueTransition({status:'queued',attempt_count:1,max_attempts:3,requires_paid_approval:false},{paidApproved:false});
  assert.deepEqual(d,{ok:true,idempotent:true,status:'queued',attemptCount:1});
});

test('failed jobs retry until the configured attempt ceiling',()=>{
  const d=decideQueueTransition({status:'failed',attempt_count:1,max_attempts:3,requires_paid_approval:false},{paidApproved:false});
  assert.equal(d.ok,true);assert.equal(d.idempotent,false);assert.equal(d.status,'queued');assert.equal(d.attemptCount,2);
});

test('jobs stop retrying after max attempts',()=>{
  const d=decideQueueTransition({status:'failed',attempt_count:3,max_attempts:3,requires_paid_approval:false},{paidApproved:false});
  assert.equal(d.ok,false);assert.equal(d.error,'max_attempts_reached');
});

test('paid jobs never queue silently without explicit approval',()=>{
  const d=decideQueueTransition({status:'ready',attempt_count:0,max_attempts:3,requires_paid_approval:true},{paidApproved:false});
  assert.equal(d.ok,false);assert.equal(d.error,'paid_approval_required');
});

test('rendering and completed jobs are safe idempotent queue responses',()=>{
  assert.equal(decideQueueTransition({status:'rendering',attempt_count:1,max_attempts:3},{paidApproved:false}).idempotent,true);
  assert.equal(decideQueueTransition({status:'completed',attempt_count:1,max_attempts:3},{paidApproved:false}).idempotent,true);
});
