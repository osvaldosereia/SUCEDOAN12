import assert from 'node:assert/strict';
import { evidenceState, filterRecentRepetition, buildCreativeMemory, dailyPlanV2 } from './marketing-round13-learning-planner-v2.mjs';

assert.equal(evidenceState({ publications: 2, touchpoints: 99 }).status, 'insufficient_data');
assert.equal(evidenceState({ publications: 3, touchpoints: 5 }).status, 'observational');
assert.equal(evidenceState({ publications: 30, touchpoints: 50 }).rankingEnabled, false);

const recent = [{ productId: 'p1', hook: 'preco', format: 'card', channel: 'instagram_feed' }];
const candidates = [
  { productId: 'p1', hook: 'preco', format: 'card', channel: 'instagram_feed' },
  { productId: 'p2', hook: 'economia', format: 'card', channel: 'facebook_post' },
];
assert.deepEqual(filterRecentRepetition(candidates, recent), [candidates[1]]);
assert.equal(buildCreativeMemory([...recent, ...recent])[0].occurrences, 2);

const plan = dailyPlanV2({ candidates, recent, evidence: { publications: 0, touchpoints: 0 }, limits: { maxCandidates: 2, maxCostCents: 0 } });
assert.equal(plan.mode, 'dry_run');
assert.equal(plan.decision, 'SUGGEST');
assert.equal(plan.candidates.length, 1);
assert.equal(plan.draftGate.enabled, false);
assert.equal(plan.wouldCreateDraft, false);
assert.equal(plan.wouldSchedule, false);
assert.equal(plan.wouldPublish, false);
assert.equal(plan.aiUsed, false);
assert.equal(plan.externalSideEffect, false);

const empty = dailyPlanV2({ candidates: recent, recent });
assert.equal(empty.decision, 'NO_ACTION');

console.log('marketing round13 learning/planner v2: ok');
