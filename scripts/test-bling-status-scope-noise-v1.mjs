import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

assert.match(hub,/domain==="order"&&operation==="sync_order_status"/);
assert.match(hub,/status_updates_enabled!==true/);
assert.match(hub,/reason:"order_status_updates_disabled"/);
assert.match(hub,/queued:false,skipped:true/);
assert.match(hub,/skipped_status_jobs:skippedStatusJobs/);
assert.match(hub,/status_sync_skipped:skippedStatusJobs>0/);

assert.match(vitrine,/let blingStatusSyncSkippedReason=""/);
assert.match(vitrine,/\.data\?\.queued===true/);
assert.match(vitrine,/\.data\?\.skipped===true/);
assert.match(vitrine,/bling_status_sync_skipped_reason:blingStatusSyncSkippedReason\|\|null/);

console.log('OK · situação Bling sem permissão não gera job de erro previsível');
