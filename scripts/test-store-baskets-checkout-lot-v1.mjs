import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/sql/20261005_store_basket_reservation_v1.sql','utf8');
const checkoutFiles=['supabase/functions/shopping-checkout-v2/index.ts','supabase/functions/shopping-chat-checkout-v2/index.ts'].filter(fs.existsSync).map(p=>fs.readFileSync(p,'utf8')).join('\n');
assert.match(sql,/quantity_available\s*=\s*quantity_built/i,'mounted lot must expose only built quantity');
assert.match(sql,/sale_enabled\s*=\s*true/i,'mounted lot must become sellable');
assert.match(checkoutFiles,/basket_stock_allocations|basket_sales_runtime_v1|basket_lot_public_availability_v1/i,'checkout must consume canonical basket lot availability');
assert.doesNotMatch(checkoutFiles,/basket_lot_component_reservations[\s\S]*insert|insert[\s\S]*basket_lot_component_reservations/i,'checkout must not reserve component stock again for mounted full baskets');
console.log('store baskets checkout lot contract v1: PASS');
