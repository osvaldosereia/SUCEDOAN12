import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('supabase/functions/admin-marketing-brain-v1/index.ts','utf8');
const foundation=fs.readFileSync('supabase/migrations/20260919004000_cm_1_11_marketing_brain_observe_suggest_foundation_v1.sql','utf8');

// OBSERVE is deterministic-first and does not require paid/external AI.
assert.match(edge,/deterministicOpportunityBrief/);
assert.match(edge,/action==="opportunity_observe"/);
assert.match(edge,/created_campaign:false,external_side_effect:false/);

// SUGGEST remains fail-closed unless both explicit gates are true.
assert.match(edge,/opportunity_suggest_enabled!==true\|\|meta\.strategy_ai_enabled!==true/);
assert.match(edge,/opportunity_suggest_budget_closed/);
assert.match(foundation,/'opportunity_suggest_enabled',false/);
assert.match(foundation,/'opportunity_suggest_max_daily_calls',0/);

// Cost/audit ledger is idempotent and records both estimated and actual cost.
assert.match(edge,/ai_action_executions/);
assert.match(edge,/idempotency_key:idempotencyKey/);
assert.match(edge,/estimated_cost_brl:cost,actual_cost_brl:cost/);
assert.match(edge,/upsert\(row,\{onConflict:"action_key,idempotency_key"\}\)/);

// No campaign/publication side effect belongs to opportunity OBSERVE/SUGGEST.
assert.match(edge,/create_campaign:false/);
assert.match(edge,/side_effect_performed:false/);

console.log('cm-1 round12 marketing brain/cost fail-closed contract ok');
