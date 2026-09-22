import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922033000_papoai_product_choice_up_to_10_v1.sql','utf8');
assert.ok(sql.includes("least(coalesce(p_limit,3),10)"));
assert.ok(sql.includes("p_selection>10"));
console.log('PASS: product choices support up to 10 options');
