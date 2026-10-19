import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const storefront=fs.readFileSync('vitrine/index.html','utf8');
const admin=fs.readFileSync('vitrine/admin/basket-mold-admin.js','utf8');
const gateway=fs.readFileSync('supabase/functions/admin-basket-molds-v1/index.ts','utf8');
const api=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const adminSection=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const extrasAdmin=fs.readFileSync('vitrine/admin/basket-mold-extras-admin.js','utf8');
const extrasMigration=fs.readFileSync('supabase/migrations/20261019100000_basket_mold_optional_items_v1.sql','utf8');

// Customer can see the three brand choices at once, with real product photos.
assert.match(storefront,/basket-option-grid/);
assert.match(api,/data\.compositions\|\|\[\]\)\.slice\(0,1\)/);
assert.match(api,/sub\.name\|\|String\(b\.name\)\.replace/);
assert.match(storefront,/alternatives\|\|\[\]\)\.slice\(0,3\)/);
assert.match(storefront,/safeImage\(a\.image_url\)/);
assert.match(storefront,/Object\.assign\(item,\{product_id:alt\.product_id,name:alt\.name,sku:alt\.sku,gtin:alt\.gtin,image_url:alt\.image_url\|\|''/);
assert.match(storefront,/\.sheet-scroll\{[^}]*flex:1 1 auto[^}]*min-height:0/);
assert.match(storefront,/\.sheet-action\{[^}]*flex:0 0 auto/);
assert.match(storefront,/safe-area-inset-bottom/);
assert.match(storefront,/BASKET_SIZE_DISPLAY_ORDER\s*=\s*\['grande','media','pequena','mini','economica'\]/);
assert.match(storefront,/function homeBasketSubcategories\(/);
const sizeOrderStart=storefront.indexOf('const BASKET_SIZE_DISPLAY_ORDER=');
const sizeOrderEnd=storefront.indexOf('function homeBasketGroupRecords(',sizeOrderStart);
assert.ok(sizeOrderStart>=0&&sizeOrderEnd>sizeOrderStart,'the public basket size ordering helper exists');
const sizeOrderHelpers=storefront.slice(sizeOrderStart,sizeOrderEnd);
const orderedSizes=vm.runInNewContext(`${sizeOrderHelpers};homeBasketSubcategories({slug:'cestas-completas',subcategories:[{name:'Mini'},{name:'Econômica'},{name:'Pequena'},{name:'Média'},{name:'Grande'},{name:'Outro tamanho'}]}).map(x=>x.name)`);
assert.equal(JSON.stringify(orderedSizes),JSON.stringify(['Grande','Média','Pequena','Mini','Econômica']));
assert.match(storefront,/data-mold-restore/);
assert.match(storefront,/function restoreMoldItem\(/);
assert.match(storefront,/querySelectorAll\('\[data-mold-restore\]'\)\.forEach/);

// Keep basket price calculations and the admin's hidden-value fields intact.
assert.match(storefront,/moldDraftTotalCents/);
assert.match(storefront,/hidden_adjustment_cents/);
assert.match(admin,/data-mold-hidden-adjustment/);

// Admin limits each position to three public brand choices without deleting legacy data.
assert.match(admin,/options\.length\s*>=\s*3/);
assert.match(admin,/até 3 marcas/i);
assert.match(storefront,/data-b-restore/);
assert.match(storefront,/function restoreBasketItem\(/);
assert.match(gateway,/positions\.some/);
assert.match(adminSection,/Produtos adicionais/);
assert.match(fs.readFileSync('vitrine/admin/index.html','utf8'),/basket-admin-section.js\?v=basket-personalization-v1/);
assert.match(extrasAdmin,/extras_save/);
assert.match(extrasAdmin,/Até 3 marcas/i);
assert.match(extrasMigration,/admin_save_basket_mold_optional_items_v1/);
assert.match(extrasMigration,/before insert on public\.basket_mold_position_options/);
assert.match(api,/items,extras/);
assert.match(storefront,/data-mold-extra-add/);
assert.match(storefront,/data\.extras\|\|\[\]/);
assert.match(gateway,/options\.length\s*>\s*3/);

console.log('basket personalization v1: PASS');
