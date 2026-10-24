import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration='supabase/migrations/20261005003000_basket_postdeploy_hardening_v1.sql';
assert.equal(fs.existsSync(migration),true,`missing ${migration}`);
const sql=fs.readFileSync(migration,'utf8');

assert.match(sql,/create\s+index\s+if\s+not\s+exists\s+basket_kit_templates_category_id_idx\s+on\s+public\.basket_kit_templates\s*\(\s*category_id\s*\)/i,'category FK must have a covering index');
assert.match(sql,/revoke\s+execute\s+on\s+function\s+public\.apply_basket_kit_lot_commercial_v3\s*\(\s*uuid\s*,\s*text\s*,\s*numeric\s*,\s*text\s*,\s*uuid\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,'commercial mutation helper must not be public');
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.apply_basket_kit_lot_commercial_v3\s*\(\s*uuid\s*,\s*text\s*,\s*numeric\s*,\s*text\s*,\s*uuid\s*\)\s+to\s+service_role/i,'service role must retain access');

console.log('basket postdeploy hardening: PASS');
