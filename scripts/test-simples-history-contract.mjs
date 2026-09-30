import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..');
const migration=path.join(root,'supabase/migrations/20260930150500_simples_monthly_revenue_history_v1.sql');
assert.ok(fs.existsSync(migration),'migration missing: simples_monthly_revenue_history_v1');
const sql=fs.readFileSync(migration,'utf8').toLowerCase();
assert.match(sql,/create\s+table\s+if\s+not\s+exists\s+public\.simples_monthly_revenue_history\b/,'history table missing');
assert.match(sql,/unique\s*\(\s*competence_month\s*\)/,'unique competence missing');
for(const col of ['gross_sales','returns_amount','net_revenue','document_count','return_document_count','source_hash','collection_status','collected_at'])assert.ok(sql.includes(col),`missing ${col}`);
for(const status of ['complete','incomplete','review_required','failed'])assert.ok(sql.includes(`'${status}'`),`missing status ${status}`);
assert.match(sql,/enable\s+row\s+level\s+security/,'RLS missing');
assert.match(sql,/revoke\s+all\s+on\s+public\.simples_monthly_revenue_history\s+from\s+anon\s*,\s*authenticated/,'server-only grants missing');
console.log('PASS Simples monthly history contract');
