import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync('supabase/migrations/20260910185000_marketing_attribution_foundation_v10.sql','utf8');

for (const token of [
  'attribution_recording_enabled boolean not null default false',
  'create table if not exists public.marketing_attribution_touchpoints',
  "touchpoint_type in ('click','conversation','order')",
  'evidence_key text not null unique',
  'before update or delete on public.marketing_attribution_touchpoints',
  'security invoker',
  'marketing_attribution_recording_disabled',
  'conversation_parent_must_be_click',
  'order_parent_invalid',
  'idempotency_conflict',
  "'inferred_attribution',false",
  "'external_side_effect',false",
]) {
  assert.ok(migration.includes(token), `missing attribution safety token: ${token}`);
}

assert.ok(/revoke all on table public\.marketing_attribution_touchpoints from public, anon, authenticated;/i.test(migration));
assert.ok(/grant select, insert on table public\.marketing_attribution_touchpoints to service_role;/i.test(migration));
assert.ok(/revoke all on function public\.record_marketing_attribution_touchpoint_v1[\s\S]*from public, anon, authenticated;/i.test(migration));
assert.ok(/grant execute on function public\.record_marketing_attribution_touchpoint_v1[\s\S]*to service_role;/i.test(migration));
assert.ok(!/security definer/i.test(migration), 'attribution migration must not use SECURITY DEFINER');
assert.ok(!/http_request|net\.http|fetch\(|graph\.facebook|pinterest\.com|mybusiness\.googleapis/i.test(migration), 'attribution foundation must not call external providers');

console.log('marketing attribution deterministic safety contract: ok');
