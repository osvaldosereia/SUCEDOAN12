import fs from 'node:fs';
import assert from 'node:assert/strict';

const api=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const guidedApi=fs.readFileSync('supabase/functions/admin-basket-guided-v1/index.ts','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const migrationPath='supabase/sql/20261004_basket_lot_reopen_and_model_admin_v1.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration for mounted-lot edit and model admin must exist');
const migration=fs.readFileSync(migrationPath,'utf8');

assert.match(migration,/reopen_basket_kit_lot_for_edit_v1/i,'migration must provide safe ready -> draft reopen');
for(const guard of ['lot_sale_must_be_disabled','lot_has_order_history','lot_already_changed','lot_is_dependency'])assert.match(migration,new RegExp(guard,'i'),`reopen must preserve ${guard}`);
assert.match(migration,/archive_basket_template_admin_v1/i,'basket model archive must exist');

assert.match(guidedApi,/reopen_basket_kit_lot_for_edit_v1/,'guided API must reuse safe lot reopening');
for(const action of ['lot_mount','lot_reopen','lot_cancel'])assert.match(guided,new RegExp(action),`guided UI must expose ${action}`);
assert.match(guided,/Marcar como montado/,'draft must expose explicit mounted action');
assert.match(guided,/Editar lote/,'reserved lot must expose edit action');
assert.match(guided,/Em montagem|Montado/,'guided editor must surface assembly states');

assert.match(section,/function printLot\(lot\)/,'canonical section must own pure lot printing');
assert.match(section,/@page\{size:A4 portrait/i,'print CSS must use A4 portrait');
assert.match(section,/grid-template-columns:repeat\(4,1fr\)/i,'print CSS must use four columns');
assert.match(section,/lot-print-card/,'print cards must exist');
assert.match(section,/sale_price_override/,'print must use saved lot sale value');
assert.match(section,/public_name/,'print must use saved public name');
assert.match(section,/data-basket-print/,'mounted/operational lot must expose print action');

assert.match(section,/data-basket-edit/,'commercial model must expose edit action');
assert.match(section,/Excluir modelo/,'commercial model must expose archive/delete action');
assert.match(section,/basket_archive/,'commercial model must archive through canonical API');
assert.doesNotMatch(section,/basket_kit_template_save|basket_kit_template_archive/,'canonical section must not manage an internal kit as a second commercial model');

// Legacy endpoints may stay for data compatibility, but are no longer an Admin UI dependency.
for(const action of ['basket_kit_lot_reopen','basket_kit_template_save','basket_kit_template_archive','basket_archive'])assert.match(api,new RegExp('"'+action+'"'),'legacy compatibility API must remain available during migration: '+action);

console.log('basket mounted edit, print and models contracts: PASS');
