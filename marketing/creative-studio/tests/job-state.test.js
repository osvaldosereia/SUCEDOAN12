import test from 'node:test';
import assert from 'node:assert/strict';
import {decideQueueTransition} from '../job-state.js';

const now='2026-09-16T17:00:00.000Z';

test('queueing an already queued job is idempotent and does not consume another attempt',()=>{
  const d=decideQueueTransition({status:'queued',attempt_count:1,max_attempts:3,requires_paid_approval:false},{paidApproved:false});
  assert.deepEqual(d,{ok:true,idempotent:true,status:'queued',attemptCount:1});
});

test('failed jobs return to queue without consuming an attempt until a worker claims them',()=>{
  const d=decideQueueTransition({status:'failed',attempt_count:1,max_attempts:3,requires_paid_approval:false},{paidApproved:false});
  assert.equal(d.ok,true);assert.equal(d.idempotent,false);assert.equal(d.status,'queued');assert.equal(d.attemptCount,1);
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

test('worker claim creates an exclusive lease and consumes exactly one render attempt',()=>{
  const d=decideQueueTransition({status:'queued',attempt_count:1,max_attempts:3},{action:'claim',workerId:'gha-108',now,leaseSeconds:900});
  assert.equal(d.ok,true);assert.equal(d.idempotent,false);assert.equal(d.status,'rendering');assert.equal(d.attemptCount,2);
  assert.equal(d.workerId,'gha-108');assert.equal(d.claimedAt,now);assert.equal(d.leaseExpiresAt,'2026-09-16T17:15:00.000Z');
});

test('worker cannot claim a job when the attempt ceiling is already exhausted',()=>{
  const d=decideQueueTransition({status:'queued',attempt_count:3,max_attempts:3},{action:'claim',workerId:'gha-109',now,leaseSeconds:900});
  assert.equal(d.ok,false);assert.equal(d.error,'max_attempts_reached');
});

test('expired rendering lease is requeued when another attempt remains',()=>{
  const d=decideQueueTransition({status:'rendering',attempt_count:1,max_attempts:3,worker_id:'dead-worker',lease_expires_at:'2026-09-16T16:59:00.000Z'},{action:'recover',now});
  assert.equal(d.ok,true);assert.equal(d.idempotent,false);assert.equal(d.status,'queued');assert.equal(d.attemptCount,1);
  assert.equal(d.workerId,null);assert.equal(d.leaseExpiresAt,null);assert.equal(d.lastError,'worker_lease_expired');
});

test('expired rendering lease becomes terminal when all attempts were consumed',()=>{
  const d=decideQueueTransition({status:'rendering',attempt_count:3,max_attempts:3,worker_id:'dead-worker',lease_expires_at:'2026-09-16T16:59:00.000Z'},{action:'recover',now});
  assert.equal(d.ok,true);assert.equal(d.status,'failed');assert.equal(d.exhausted,true);assert.equal(d.workerId,null);assert.equal(d.leaseExpiresAt,null);
});

test('active rendering lease is never stolen',()=>{
  const d=decideQueueTransition({status:'rendering',attempt_count:1,max_attempts:3,worker_id:'live-worker',lease_expires_at:'2026-09-16T17:10:00.000Z'},{action:'recover',now});
  assert.equal(d.ok,true);assert.equal(d.idempotent,true);assert.equal(d.status,'rendering');
});
