import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20261008031500_order_addon_reservation_origin_v1.sql','utf8');
assert.match(sql,/source in \('vitrine','storefront_v2','manual_whatsapp','papoai','reorder'\)/);
assert.match(sql,/pg_get_functiondef\('public\.reserve_vitrine_order_stock_v1\(uuid\)'::regprocedure\)/);
assert.match(sql,/raise exception/);
assert.doesNotMatch(sql,/insert into public\.orders/i);
console.log('PASS: storefront_v2 canonical reservation origin allowlist');
