import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921231515_harden_papoai_addon_resolution_v1.sql','utf8');
for(const x of ['semantic_score','exactness','ambiguous_product','v_top_semantic-v_second_semantic>=0.10'])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: safe addon resolver contract');
