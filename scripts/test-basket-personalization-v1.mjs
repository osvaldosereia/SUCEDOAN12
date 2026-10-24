import fs from 'node:fs';
import assert from 'node:assert/strict';

const storefront=fs.readFileSync('vitrine/index.html','utf8');
const admin=fs.readFileSync('vitrine/admin/basket-mold-admin.js','utf8');
const gateway=fs.readFileSync('supabase/functions/admin-basket-molds-v1/index.ts','utf8');
const api=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const adminSection=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const extrasAdmin=fs.readFileSync('vitrine/admin/basket-mold-extras-admin.js','utf8');
const legacyMigration=fs.readFileSync('supabase/migrations/20261019100000_basket_mold_optional_items_v1.sql','utf8');
const themesMigration=fs.readFileSync('supabase/migrations/20261020004000_shared_basket_extra_themes_v1.sql','utf8');

assert.match(storefront,/basket-option-grid/);
assert.match(storefront,/function moldItemOptions/);
assert.match(storefront,/\.slice\(0,10\)/);
assert.match(storefront,/safeImage\(a\.image_url\)/);
assert.match(storefront,/data-mold-option-choice/);
assert.match(storefront,/data-mold-restore/);
assert.match(storefront,/moldDraftTotalCents/);
assert.match(admin,/data-mold-hidden-adjustment/);
assert.match(admin,/public_composition_count:d\.public_composition_count/);
assert.match(gateway,/positions\.some/);
assert.match(gateway,/options\.length\s*>\s*3/);
assert.match(adminSection,/Produtos adicionais/);

assert.match(extrasAdmin,/extra_themes_editor/);
assert.match(extrasAdmin,/extra_themes_save/);
assert.match(extrasAdmin,/data-add-theme/);
assert.match(extrasAdmin,/data-search-go/);
assert.match(extrasAdmin,/data-up/);
assert.match(legacyMigration,/admin_save_basket_mold_optional_items_v1/);
assert.match(themesMigration,/basket_extra_themes/);
assert.match(themesMigration,/basket_extra_theme_products/);
assert.match(api,/items,extras/);
assert.match(api,/from\("basket_extra_themes"\)/);
assert.match(storefront,/data-extra-theme-toggle/);
assert.match(storefront,/data-extra-product-add/);
assert.match(storefront,/basket-extra-products/);
assert.match(storefront,/data\.extras\|\|\[\]/);

console.log('basket personalization and shared extras v1: PASS');
