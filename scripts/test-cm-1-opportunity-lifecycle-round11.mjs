import fs from 'node:fs';
import assert from 'node:assert/strict';

const engine=fs.readFileSync('supabase/migrations/20260918233000_cm_1_10_opportunity_engine_v1.sql','utf8');
const observer=fs.readFileSync('supabase/migrations/20260919080000_cm_1_homologation_evidence_observer_v1.sql','utf8');
const acceptance=fs.readFileSync('supabase/migrations/20260919081000_cm_1_acceptance_lifecycle_evidence_v1.sql','utf8');

for(const status of ['suggested','suppressed','dismissed','converted','expired']) {
  assert.match(engine,new RegExp(`'${status}'`),`missing lifecycle status ${status}`);
}
assert.match(engine,/set status='expired'[\s\S]*status in \('suggested','suppressed'\)/,'expiry must only close open lifecycle states');
assert.match(engine,/expires_at<=now\(\)/,'expiry must be clock-driven, never anticipated');
assert.match(engine,/status not in \('dismissed','converted'\)/,'refresh must preserve human dismissal/conversion terminal states');
assert.match(observer,/clock_expired_still_open/,'observer must expose overdue-open anomaly');
assert.match(observer,/next_expiry_at/,'observer must expose next natural expiry');
assert.match(observer,/lifecycle_closed_observed/,'observer must expose persisted closed lifecycle evidence');
assert.match(acceptance,/status in \('dismissed','converted','expired'\)/,'acceptance must count only persisted terminal lifecycle states');
assert.match(acceptance,/v_opportunity_total>0 and v_opportunity_closed>0 then 'verified'/,'criterion 13 must require real persisted closed lifecycle evidence');
assert.doesNotMatch(observer+acceptance,/update public\.customer_marketing_opportunities|insert into public\.customer_marketing_opportunities/i,'read models must remain read-only');

console.log('CM-1 round 11 opportunity lifecycle contract ok');
