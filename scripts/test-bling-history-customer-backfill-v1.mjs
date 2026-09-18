import fs from 'node:fs';
import assert from 'node:assert/strict';

const queue=fs.readFileSync('supabase/migrations/20260918023500_bling_customer_backfill_queue_v1.sql','utf8');
const schedule=fs.readFileSync('supabase/migrations/20260918025000_schedule_bling_customer_backfill_v1.sql','utf8');
const promotion=fs.readFileSync('supabase/migrations/20260918030500_bling_history_safe_batch_promotion_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/bling-history-customer-backfill-v1/index.ts','utf8');

assert.match(queue,/bling_history_customer_backfill_queue/);
assert.match(queue,/bling_contact_id bigint not null unique/);
assert.match(queue,/claim_bling_history_customer_backfill_v1/);
assert.match(queue,/finish_bling_history_customer_backfill_v1/);
assert.match(queue,/bling_history_customer_backfill_summary_v1/);
assert.match(queue,/from public\.customers c/);
assert.match(queue,/where c\.bling_contact_id is not null/);

assert.match(schedule,/cron\.schedule/);
assert.match(schedule,/bling-history-customer-backfill-v1/);
assert.match(schedule,/invoke_bling_history_customer_backfill_v1/);
assert.match(schedule,/cron\.unschedule/,'fila deve parar o cron ao terminar');
assert.match(schedule,/stale_running_recovered/);

assert.match(promotion,/promote_bling_history_ready_batch_v1/);
assert.match(promotion,/status_id=9/);
assert.match(promotion,/canonical_status='delivered'/);
assert.match(promotion,/bling_contact_id','document_exact','phone_exact/);
assert.match(promotion,/severity='blocking'/);
assert.match(promotion,/promotion_enabled=v_old_gate/,'gate deve ser restaurado');

assert.match(edge,/idContato/);
assert.match(edge,/idsSituacoes\[\]/);
assert.match(edge,/batch_size/);
assert.match(edge,/Math\.min\(Number\(body\?\.batch_size\)\|\|5,10\)/);
assert.match(edge,/promote_bling_history_ready_batch_v1/);
assert.match(edge,/claim_bling_history_import_lock_v1/);
assert.match(edge,/release_bling_history_import_lock_v1/);
assert.doesNotMatch(edge,/make\.com|hook\.make/i);

console.log('PASS: backfill histórico Bling por cliente V1');
