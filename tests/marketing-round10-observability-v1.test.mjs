import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260918214000_marketing_round10_observability_v1.sql',import.meta.url),'utf8');

test('Round 10 observability is read-only and deterministic',()=>{
  assert.match(migration,/marketing_observability_read_model_v1/i);
  assert.match(migration,/mode','observe_only/i);
  assert.match(migration,/external_side_effect',false/i);
  assert.match(migration,/deterministic_only',true/i);
  assert.match(migration,/ai_used',false/i);
  assert.doesNotMatch(migration,/\b(insert|update|delete)\s+(into\s+|from\s+)?public\.marketing_/i);
});

test('Observability preserves autonomy gates and requires evidence',()=>{
  assert.match(migration,/minimum_publications',3/i);
  assert.match(migration,/minimum_touchpoints',5/i);
  assert.match(migration,/performance_claims_allowed/i);
  assert.match(migration,/auto_action',false/i);
  assert.match(migration,/auto_schedule',false/i);
  assert.match(migration,/auto_publish',false/i);
  assert.doesNotMatch(migration,/publishing_enabled\s*=\s*true/i);
  assert.doesNotMatch(migration,/execution_mode\s*=\s*'canary'/i);
});

test('Observability RPC is service-role only',()=>{
  assert.match(migration,/revoke all on function public\.marketing_observability_read_model_v1\(\) from public,anon,authenticated/i);
  assert.match(migration,/grant execute on function public\.marketing_observability_read_model_v1\(\) to service_role/i);
});
