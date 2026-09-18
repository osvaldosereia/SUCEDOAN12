import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919081000_cm_1_acceptance_lifecycle_evidence_v1.sql','utf8');

assert.match(migration,/cm1_acceptance_checklist_v1/);
assert.match(migration,/cm1-acceptance-v1\.1/);
assert.match(migration,/v_opportunity_total/);
assert.match(migration,/v_opportunity_closed/);
assert.match(migration,/status in \('dismissed','converted','expired'\)/);
assert.match(migration,/when v_opportunity_total>0 and v_opportunity_closed>0 then 'verified'/);
assert.match(migration,/closed_lifecycle/);
assert.match(migration,/historical_total/);
assert.match(migration,/aguardando lifecycle real sem fixture persistente/);
assert.doesNotMatch(migration,/insert into public\.|update public\.|delete from public\./i);
assert.doesNotMatch(migration,/graph\.facebook\.com|openai\.com\/v1|\/messages\b/i);

console.log('CM-1 acceptance lifecycle evidence: OK');
