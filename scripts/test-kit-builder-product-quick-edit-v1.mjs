import fs from 'node:fs';
import assert from 'node:assert/strict';

const uiPath='vitrine/admin/kit-builder.js';
const productApiPath='supabase/functions/admin-products-live-v1/index.ts';
const kitApiPath='supabase/functions/admin-kit-builder-v1/index.ts';

assert.ok(fs.existsSync(uiPath),`missing ${uiPath}`);
const ui=fs.readFileSync(uiPath,'utf8');
const productApi=fs.readFileSync(productApiPath,'utf8');
const kitApi=fs.readFileSync(kitApiPath,'utf8');

assert.match(productApi,/async function quickProductSave\(/,'canonical product quick-save path must exist');
assert.match(productApi,/sale_price_cents/,'canonical price input must remain sale_price_cents');
assert.match(productApi,/cost_cents/,'canonical cost input must remain cost_cents');
assert.match(productApi,/async function setProductStockOfficial\(/,'canonical stock path must exist');
assert.match(productApi,/stock_quantity/,'canonical stock input must remain stock_quantity');
assert.match(productApi,/stockAuthority\(\)/,'official stock path must be authority-aware');

assert.match(ui,/async function saveProductInline\(/,'kit builder must expose one inline product save path');
assert.match(ui,/['"]product_quick_save['"]/,'cost/sale must use canonical product_quick_save');
assert.match(ui,/['"]product_stock_set['"]/,'stock must use canonical product_stock_set');
assert.match(ui,/sale_price_cents\s*:/,'UI must send sale_price_cents');
assert.match(ui,/cost_cents\s*:/,'UI must send cost_cents');
assert.match(ui,/stock_quantity\s*:/,'UI must send stock_quantity');
assert.match(ui,/invalid_cost|Custo[^\n]*negativo|custo[^\n]*negativo/i,'negative cost must be blocked before write');
assert.match(ui,/invalid_price|Venda[^\n]*negativo|pre[cç]o[^\n]*negativo/i,'negative sale price must be blocked before write');
assert.match(ui,/stock_authority|bling/i,'UI must surface stock-authority context/errors');

assert.doesNotMatch(kitApi,/from\(["']products["']\)\.update\([\s\S]{0,250}stock/i,'kit API must not create a second stock writer');
assert.doesNotMatch(kitApi,/product_stock_set|product_quick_save/i,'kit API must not proxy canonical product writes');
assert.doesNotMatch(ui,/fetch\([^\n]*admin-products-live-v1/i,'UI must use the stable Admin bridge, not call product edge URL directly');

console.log('kit builder product quick edit v1: PASS');
