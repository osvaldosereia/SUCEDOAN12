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

assert.match(guidedApi,/reopen_basket_kit_lot_for_edit_v1/,'guided compatibility API must reuse safe lot reopening');
for(const action of ['lot_mount','lot_reopen','lot_cancel'])assert.match(guided,new RegExp(action),`guided compatibility UI must preserve ${action}`);
assert.match(guided,/Marcar como montado/,'technical guided flow must still support mounted action');
assert.match(guided,/Editar lote/,'technical guided flow must still support reserved-lot edit');
assert.match(guided,/Em montagem|Montado/,'technical guided flow must still surface assembly states');

// O cutover deliberadamente remove edição/impressão/arquivamento do controlador normal.
assert.match(section,/Criador de Kits/,'normal operation must expose kit builder');
assert.match(section,/Cestas do Site/,'normal operation must expose store baskets');
for(const retired of ['Editar lote','Imprimir','Excluir modelo'])assert.doesNotMatch(section,new RegExp(retired,'i'),`normal operation must not expose ${retired}`);
assert.doesNotMatch(section,/data-basket-print|data-basket-edit|basket_archive|function printLot/,'simple controller must not own legacy lot/model actions');

// Legacy endpoints stay available for historical data and technical compatibility only.
for(const action of ['basket_kit_lot_reopen','basket_kit_template_save','basket_kit_template_archive','basket_archive'])assert.match(api,new RegExp('"'+action+'"'),'legacy compatibility API must remain available during migration: '+action);

console.log('basket mounted/edit compatibility retained; normal UI simplified: PASS');
