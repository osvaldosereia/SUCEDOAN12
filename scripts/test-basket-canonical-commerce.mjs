import fs from 'node:fs';
import assert from 'node:assert/strict';

const p='supabase/sql/20261004_basket_canonical_commerce_v1.sql';
assert.ok(fs.existsSync(p),'canonical basket SQL must exist');
const s=fs.readFileSync(p,'utf8');
assert.match(s,/create or replace view public\.basket_lot_public_availability_v1/i);
assert.match(s,/create or replace view public\.basket_commercial_catalog_v1/i);
assert.match(s,/effective_sellable_stock/i,'component health must use effective physical/sellable stock');
assert.doesNotMatch(s,/component_health[\s\S]{0,900}loose_sellable_stock/i,'component eligibility must not depend on loose stock');
assert.match(s,/least\s*\(b\.own_available\s*,\s*x\.own_available\)/i,'linked lots must publish the minimum stock');
for(const reason of ['available','draft','paused','depleted','component_out_of_stock','linked_lot_unavailable','model_inactive','category_inactive']) assert.ok(s.includes("'"+reason+"'"),reason+' must be represented');
assert.match(s,/row_number\(\) over\(partition by m\.commercial_id order by a\.built_at,a\.created_at,a\.lot_id\)/i,'public lot selection must be FIFO');
assert.match(s,/check \(basket_id is not null or category_id is not null\)/i,'standalone commercial kits must require a category');
assert.match(s,/create or replace view public\.basket_current_lot_v1[\s\S]*from public\.basket_lot_public_availability_v1 a/i,'legacy wrapper must derive from canonical availability');
assert.match(s,/create or replace view public\.basket_current_kit_lot_v2[\s\S]*from public\.basket_lot_public_availability_v1 a/i,'kit wrapper must derive from canonical availability');
assert.match(s,/where k\.basket_id is null/i,'only standalone kit templates become public commercial models');
console.log('basket canonical commerce contract: PASS');
