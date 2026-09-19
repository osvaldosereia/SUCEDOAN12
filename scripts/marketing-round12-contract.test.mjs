import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync(new URL('../supabase/functions/admin-marketing-insights-v1/index.ts',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../admin/marketing-api.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260919001500_marketing_round12_channel_metrics_v1.sql',import.meta.url),'utf8');

assert.match(edge,/action==="channel_metrics"/);
assert.match(edge,/marketing_channel_metrics_read_model_v1/);
assert.match(edge,/collection\?\.enabled!==false/);
assert.match(edge,/collection\?\.automatic!==false/);
assert.match(edge,/external_side_effect!==false/);
assert.match(api,/getMarketingChannelMetrics/);
assert.match(api,/action:'channel_metrics'/);
assert.match(migration,/revoke all on public\.marketing_channel_metric_snapshots from anon, authenticated/);
assert.match(migration,/grant select, insert on public\.marketing_channel_metric_snapshots to service_role/);
assert.match(migration,/evidence_key text not null unique/);
assert.match(migration,/'enabled',false/);
assert.match(migration,/'automatic',false/);
assert.match(migration,/'external_side_effect',false/);
assert.doesNotMatch(migration,/http|fetch\(|net\./i);
console.log('marketing-round12-contract: ok');
