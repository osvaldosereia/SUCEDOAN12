import fs from 'node:fs';
import assert from 'node:assert/strict';

const guidedApiPath='supabase/functions/admin-basket-guided-v1/index.ts';
const kitApiPath='supabase/functions/admin-kit-builder-v1/index.ts';
const uiPath='vitrine/admin/basket-guided-builder.js';
for(const path of [guidedApiPath,kitApiPath,uiPath])assert.ok(fs.existsSync(path),`missing ${path}`);

const guidedApi=fs.readFileSync(guidedApiPath,'utf8');
const kitApi=fs.readFileSync(kitApiPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');

assert.match(kitApi,/['"]kits['"]/,'canonical kit builder API must expose kits list');
assert.match(kitApi,/from\("assembly_kits"\)/,'canonical catalog must read assembly_kits');
assert.match(kitApi,/from\("assembly_kit_items"\)/,'canonical catalog must summarize assembly_kit_items');
assert.match(kitApi,/\.eq\("is_active",true\)/,'canonical catalog must expose active recipes only');
assert.match(kitApi,/cost_total/,'catalog must expose recipe cost total');
assert.match(kitApi,/sale_total/,'catalog must expose recipe sale total');
assert.match(guidedApi,/['"]recipe_kits_save['"]/,'guided API must keep canonical recipe-link save action');

assert.match(ui,/admin-kit-builder-v1/,'guided UI must reuse canonical kit builder API');
assert.match(ui,/['"]kits['"]/,'guided UI must load internal-kit catalog');
assert.match(ui,/['"]recipe_kits_save['"]/,'guided UI must save linked internal kits');
assert.match(ui,/Kits internos/,'guided UI must show a Kits internos section');
assert.match(ui,/Vincular receita não reserva estoque/,'UI must make stock semantics explicit');
assert.match(ui,/data-bg-recipe-kit-qty/,'linked kit quantity must be editable');
assert.match(ui,/data-bg-recipe-kit-required/,'linked kit required flag must be editable');
assert.match(ui,/data-bg-recipe-kit-remove/,'linked kit must be removable');
assert.match(ui,/data-bg-recipe-kit-add/,'available recipe kit must be addable');
assert.match(ui,/state\.recipeKits\s*=\s*\(data\.recipe_kits\|\|\[\]\)/,'linked recipe kits must initialize from model_editor');
assert.match(ui,/state\.recipeKitCatalog/,'UI must keep available recipes in state');
assert.match(ui,/kit_id\s*:\s*k\.kit_id/,'save payload must include kit_id');
assert.match(ui,/quantity\s*:\s*Number\(k\.quantity/,'save payload must include quantity');
assert.match(ui,/is_required\s*:\s*k\.is_required/,'save payload must include required flag');
assert.doesNotMatch(ui,/recipe_kits_save[\s\S]{0,350}(lot_reserve|basket_stock_lots|basket_lot_component_reservations)/,'recipe link saving must not reserve physical stock');

console.log('basket recipe kits UI contract OK');
