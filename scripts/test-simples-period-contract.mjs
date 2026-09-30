import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const migration = path.join(root, 'supabase/migrations/20260930133000_simples_nacional_pre_apuracao_v1.sql');
assert.ok(fs.existsSync(migration), 'migration missing: 20260930133000_simples_nacional_pre_apuracao_v1.sql');
const sql = fs.readFileSync(migration, 'utf8').toLowerCase();
const tables = [
  'simples_rule_sets','simples_tax_classification_rules','simples_periods',
  'simples_revenue_lines','simples_reconciliation_issues','simples_validation_runs',
  'simples_homologation_checks'
];
for (const table of tables) {
  assert.match(sql, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`), `missing table ${table}`);
  assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`), `RLS missing for ${table}`);
}
assert.match(sql, /unique\s*\(\s*competence_month\s*,\s*version\s*\)/, 'missing unique competence/version');
for (const s of ['draft','review_required','ready','locked','superseded']) assert.ok(sql.includes(`'${s}'`), `missing period status ${s}`);
for (const s of ['classified','manual_review','blocked']) assert.ok(sql.includes(`'${s}'`), `missing line status ${s}`);
for (const s of ['open','resolved','ignored_with_reason']) assert.ok(sql.includes(`'${s}'`), `missing issue status ${s}`);
assert.match(sql, /create\s+(or\s+replace\s+)?function\s+public\.get_simples_period_gate_v1\s*\(/, 'gate function missing');
assert.match(sql, /create\s+(or\s+replace\s+)?function\s+public\.guard_simples_locked_snapshot_v1\s*\(/, 'lock guard function missing');
assert.match(sql, /create\s+trigger\s+trg_guard_simples_locked_snapshot_v1/, 'lock guard trigger missing');
assert.ok(sql.includes('simples_periods_competence_status_idx'), 'period competence/status index missing');
assert.ok(sql.includes('simples_revenue_lines_period_product_idx'), 'revenue period/product index missing');
assert.ok(sql.includes('simples_reconciliation_issues_period_status_idx'), 'issue period/status index missing');
console.log('PASS simples period contract');
