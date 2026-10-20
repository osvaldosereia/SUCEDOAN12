import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20261020004000_shared_basket_extra_themes_v1.sql','utf8');
const admin=fs.readFileSync('vitrine/admin/basket-mold-extras-admin.js','utf8');
const edge=fs.readFileSync('supabase/functions/admin-basket-molds-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const ui=fs.readFileSync('vitrine/index.html','utf8');

assert.match(migration,/create table if not exists public\.basket_extra_themes/);
assert.match(migration,/create table if not exists public\.basket_extra_theme_products/);
assert.match(migration,/enable row level security/);
assert.match(migration,/a\.role <> 'viewer'/);
assert.match(migration,/admin_save_basket_extra_themes_v1/);
assert.match(migration,/jsonb_array_elements\(p_themes\)/);
assert.doesNotMatch(migration,/jsonb_array_length\(p_themes\)\s*>/);

assert.match(edge,/action==="extra_themes_editor"/);
assert.match(edge,/action==="extra_themes_save"/);
assert.match(admin,/data-add-theme/);
assert.match(admin,/data-search-go/);
assert.match(admin,/data-up/);
assert.match(admin,/order defines|define a ordem na vitrine/i);

assert.match(storefront,/from\("basket_extra_themes"\)/);
assert.match(storefront,/loose_sellable_stock|moldAvailableStockMap/);
assert.match(storefront,/is_active===true&&available>0/);
assert.match(storefront,/products:t\.items/);

assert.match(ui,/data-extra-theme-toggle/);
assert.match(ui,/data-extra-product-add/);
assert.match(ui,/basket-extra-products/);
assert.match(ui,/d\.openExtraThemes\|\|\[\]/);
assert.match(ui,/scroll-snap-type:x mandatory/);

console.log('shared basket extra themes v1: PASS');
