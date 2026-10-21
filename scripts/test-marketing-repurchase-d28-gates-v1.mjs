import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const cadence=await readFile(new URL('../supabase/migrations/20261021000100_marketing_repurchase_monthly_cadence_v1.sql',import.meta.url),'utf8');
const dispatch=await readFile(new URL('../supabase/migrations/20261021000200_marketing_repurchase_dispatch_v1.sql',import.meta.url),'utf8');
const worker=await readFile(new URL('../supabase/functions/whatsapp-repurchase-worker-v1/index.ts',import.meta.url),'utf8');
const config=await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8');

assert.match(cadence,/v_interval_days integer := 28/);
assert.match(cadence,/v_order\.confirmed_at \+ interval '28 days'/);
assert.match(cadence,/o\.cancelled_at is null/);
assert.match(cadence,/o\.returned_at is null/);
assert.match(cadence,/marketing_repurchase_order_after_write_v1/);
assert.match(cadence,/due_window_expired/);
assert.doesNotMatch(cadence,/update public\.marketing_repurchase_state_v1\s+set/i,'migration must not bulk-rewrite customer rows');

assert.match(dispatch,/enabled boolean not null default false/);
assert.ok(dispatch.includes("values(true,false)"),'runtime must be seeded OFF');
assert.match(dispatch,/order_id uuid not null unique/);
assert.ok(dispatch.includes("consent.consent_state='opt_in'"));
assert.ok(dispatch.includes("t.status='APPROVED'"));
assert.ok(dispatch.includes('a.is_active is true'));
assert.ok(dispatch.includes('r.campaigns_enabled is true and r.send_enabled is true'));
assert.ok(dispatch.includes('s.due_at>=mr.activated_at'));
assert.ok(dispatch.includes("s.due_at>=now()-interval '24 hours'"));
assert.ok(dispatch.includes("coalesce(o.status,'') not in ('cancelled','returned')"));
assert.equal((dispatch.match(/s\\.due_at=o\\.confirmed_at \\+ interval '28 days'/g)||[]).length,3,'claim, validation and worker count must reject legacy D+10 due dates');
assert.doesNotMatch(dispatch,/cron\.schedule\(/i,'no scheduler before approvals');

assert.ok(worker.includes('marketing_campaign_worker_internal_key_v1'));
assert.ok(worker.includes('safeEquals'));
assert.ok(worker.includes('marketing_repurchase_claim_due_v1'));
assert.ok(worker.includes('marketing_repurchase_validate_dispatch_v1'));
assert.ok(worker.includes('sendTemplateViaMeta'));
assert.match(config,/\[functions\.whatsapp-repurchase-worker-v1\][\s\S]*?verify_jwt = false/);

console.log('marketing repurchase D+28 gates: ok');
