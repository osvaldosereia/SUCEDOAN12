import assert from 'node:assert/strict';
import fs from 'node:fs';

const base='supabase/migrations/20261003201103_order_separation_v2.sql';
const completion='supabase/migrations/20261003201158_order_separation_v2_completion.sql';
const indexes='supabase/migrations/20261003201432_order_separation_v2_order_item_index.sql';

for(const path of [base,completion,indexes]) assert.ok(fs.existsSync(path),`remote-aligned migration missing: ${path}`);
const sql=fs.readFileSync(indexes,'utf8');
assert.match(sql,/create\s+index\s+if\s+not\s+exists\s+order_separation_items_order_item_idx/i,'order_item_id FK must have a covering index');
assert.match(sql,/order_separation_items_v1\s*\(\s*order_item_id\s*\)/i,'covering index must target order_separation_items_v1(order_item_id)');

console.log('OK · separation v2 migration history and FK index align with canonical Supabase');
