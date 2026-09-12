import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMarketingAiPreflight } from './marketing-ai-preflight-v1.mjs';

const closedRuntime={
  enabled:false,
  execution_mode:'off',
  kill_switch:true,
  generation_enabled:false,
  ai_image_enabled:false,
  ai_video_enabled:false,
  max_daily_ai_cost_cents:0,
  max_daily_ai_image_generations:0,
  max_daily_ai_video_seconds:0
};

const image=buildMarketingAiPreflight({
  mode:'ai',
  media_kind:'image',
  requested_units:1,
  unit_cost_cents:7,
  runtime:closedRuntime
});
assert.equal(image.schema_version,'marketing-ai-preflight-v1');
assert.equal(image.external_side_effect,false);
assert.equal(image.network_allowed,false);
assert.equal(image.credentials_required_now,false);
assert.equal(image.provider_call_allowed,false);
assert.equal(image.dry_run,true);
assert.equal(image.estimated_cost_cents,7);
assert.ok(image.blockers.includes('marketing_disabled'));
assert.ok(image.blockers.includes('kill_switch_on'));
assert.ok(image.blockers.includes('execution_mode_not_live'));
assert.ok(image.blockers.includes('generation_disabled'));
assert.ok(image.blockers.includes('ai_image_gate_off'));
assert.ok(image.blockers.includes('ai_cost_budget_zero'));
assert.ok(image.blockers.includes('ai_image_budget_zero'));
assert.equal(image.allowed,false);
assert.ok(image.idempotency_key.startsWith('marketing-ai-preflight-v1:'));

const same=buildMarketingAiPreflight({mode:' ai ',media_kind:'image',requested_units:1,unit_cost_cents:7,runtime:closedRuntime});
assert.equal(image.idempotency_key,same.idempotency_key);

const video=buildMarketingAiPreflight({
  mode:'hybrid',
  media_kind:'video',
  requested_units:12,
  unit_cost_cents:3,
  runtime:{...closedRuntime,enabled:true,execution_mode:'live',kill_switch:false,generation_enabled:true,ai_video_enabled:true,max_daily_ai_cost_cents:100,max_daily_ai_video_seconds:60}
});
assert.equal(video.estimated_cost_cents,36);
assert.equal(video.allowed,true);
assert.deepEqual(video.blockers,[]);

const overBudget=buildMarketingAiPreflight({
  mode:'ai',media_kind:'video',requested_units:61,unit_cost_cents:3,
  runtime:{...closedRuntime,enabled:true,execution_mode:'live',kill_switch:false,generation_enabled:true,ai_video_enabled:true,max_daily_ai_cost_cents:100,max_daily_ai_video_seconds:60}
});
assert.equal(overBudget.allowed,false);
assert.ok(overBudget.blockers.includes('ai_cost_budget_exceeded'));
assert.ok(overBudget.blockers.includes('ai_video_budget_exceeded'));

const noAi=buildMarketingAiPreflight({mode:'no_ai',media_kind:'image',requested_units:1,unit_cost_cents:7,runtime:closedRuntime});
assert.equal(noAi.ai_requested,false);
assert.equal(noAi.allowed,true);
assert.equal(noAi.estimated_cost_cents,0);
assert.deepEqual(noAi.blockers,[]);

assert.throws(()=>buildMarketingAiPreflight({mode:'ai',media_kind:'audio',requested_units:1,unit_cost_cents:1,runtime:closedRuntime}),/unsupported_media_kind/);
assert.throws(()=>buildMarketingAiPreflight({mode:'ai',media_kind:'image',requested_units:0,unit_cost_cents:1,runtime:closedRuntime}),/requested_units_invalid/);
assert.throws(()=>buildMarketingAiPreflight({mode:'ai',media_kind:'image',requested_units:1,unit_cost_cents:-1,runtime:closedRuntime}),/unit_cost_invalid/);

const source=fs.readFileSync('scripts/marketing-ai-preflight-v1.mjs','utf8');
for(const forbidden of [
  'fetch(', 'XMLHttpRequest', 'axios', 'https.request', 'http.request',
  'Authorization', 'Bearer ', 'api_key', 'access_token', 'client_secret', 'service_role',
  'api.openai.com', 'generativelanguage.googleapis.com', 'graph.facebook.com'
]) assert.ok(!source.includes(forbidden),`AI preflight must stay provider-free/offline: ${forbidden}`);

console.log('PASS: Marketing AI preflight is deterministic, budget-aware, provider-free and gate-closed.');
