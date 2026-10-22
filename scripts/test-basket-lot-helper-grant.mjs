import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20261022205411_basket_lot_helper_direct_execute_revoke.sql',
  'utf8',
);
const sql = migration.replace(/--.*$/gm, '').toLowerCase();

assert.match(
  sql,
  /revoke\s+execute\s+on\s+function\s+public\.basket_lot_admin_allowed_v1\s*\(\s*\)\s+from\s+authenticated\s*;/,
  'only the directly callable basket-lot authorization helper loses authenticated EXECUTE',
);
assert.equal(
  (sql.match(/\brevoke\s+execute\b/g) || []).length,
  1,
  'the migration must not revoke unrelated RPCs',
);
assert.doesNotMatch(
  sql,
  /revoke\s+(all|execute)\s+on\s+all\s+functions|from\s+public\s*,\s*anon\s*,\s*authenticated/,
  'the migration must not apply a blanket grant change',
);
assert.match(
  migration,
  /rollback:\s*grant\s+execute\s+on\s+function\s+public\.basket_lot_admin_allowed_v1\(\)\s+to\s+authenticated/i,
  'the exact grant rollback must be documented',
);

console.log('PASS: direct authenticated EXECUTE is removed only from the basket-lot authorization helper');
