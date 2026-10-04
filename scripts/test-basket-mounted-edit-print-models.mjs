import fs from 'node:fs';
import assert from 'node:assert/strict';

const adminPath='vitrine/admin/index.html';
const apiPath='supabase/functions/admin-products-live-v1/index.ts';
const migrationPath='supabase/sql/20261004_basket_lot_reopen_and_model_admin_v1.sql';

const admin=fs.readFileSync(adminPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
assert.equal(fs.existsSync(migrationPath),true,'migration for mounted-lot edit and model admin must exist');
const migration=fs.readFileSync(migrationPath,'utf8');

assert.match(migration,/reopen_basket_kit_lot_for_edit_v1/i,'migration must provide safe ready -> draft reopen');
assert.match(migration,/lot_sale_must_be_disabled/i,'reopen must block lots active on site');
assert.match(migration,/lot_has_order_history/i,'reopen must block order history');
assert.match(migration,/lot_already_changed/i,'reopen must block consumed or dismantled lots');
assert.match(migration,/lot_is_dependency/i,'reopen must block lots used by another ready lot');
assert.match(migration,/save_basket_kit_template_admin_v1/i,'kit model save must be atomic in SQL');
assert.match(migration,/archive_basket_kit_template_admin_v1/i,'kit model archive must exist');
assert.match(migration,/archive_basket_template_admin_v1/i,'basket model archive must exist');

for(const action of ['basket_kit_lot_reopen','basket_kit_template_save','basket_kit_template_archive','basket_archive']){
  assert.match(api,new RegExp('"'+action+'"'),'admin API must expose '+action);
}
assert.match(api,/async function basketKitLotReopen\(/,'API must map safe lot reopening');
assert.match(api,/async function basketKitTemplateSave\(/,'API must save kit model');
assert.match(api,/async function basketKitTemplateArchive\(/,'API must archive kit model');
assert.match(api,/async function basketArchive\(/,'API must archive basket model');

const listStart=api.indexOf('async function basketKitsAdmin()');
const detailStart=api.indexOf('async function basketKitAdminDetail',listStart);
assert.ok(listStart>=0&&detailStart>listStart,'basket kit list function boundaries must exist');
const listCode=api.slice(listStart,detailStart);
assert.doesNotMatch(listCode,/await\s+db\.rpc\("next_basket_kit_short_code_v1"/,'basket list must not perform next-code N+1 RPC');
assert.match(listCode,/draft_lot_count/,'basket list must report drafts separately from mounted lots');

assert.match(admin,/Marcar como montado/,'draft must expose explicit mounted action');
assert.match(admin,/data-kit-lot-mount/,'lot list must bind mounted action');
assert.match(admin,/Editar lote/,'ready unused lot must expose edit action');
assert.match(admin,/data-kit-lot-edit/,'ready lot edit action must be addressable');
assert.match(admin,/basket_kit_lot_reopen/,'UI must reopen ready lot through API instead of duplicating it');
assert.match(admin,/Em edição/,'draft state must be presented as Em edição');
assert.match(admin,/Montados/,'kit detail must distinguish mounted quantity');
assert.match(admin,/Em edição.*draft|draft.*Em edição/is,'kit detail must surface draft lots');

assert.match(admin,/function printBasketKitLot\(/,'browser lot print function must exist');
assert.match(admin,/Imprimir lote/,'mounted lot must expose print action');
assert.match(admin,/@page\s*\{[^}]*size:\s*A4\s+portrait/is,'print CSS must use A4 portrait');
assert.match(admin,/grid-template-columns:\s*repeat\(4,\s*1fr\)/i,'print CSS must use four columns');
assert.match(admin,/lot-print-card[^]*flex-direction:\s*column/i,'print cards must be vertical');
assert.match(admin,/sale_price_override/,'lot row must have access to saved sale value');
assert.match(admin,/public_name/,'lot row must have access to saved public name');

assert.match(admin,/Editar modelo/,'kit model must expose edit action');
assert.match(admin,/Excluir modelo/,'models must expose archive/delete action');
assert.match(admin,/basket_kit_template_save/,'kit model UI must save through API');
assert.match(admin,/basket_kit_template_archive/,'kit model UI must archive through API');
assert.match(admin,/basket_archive/,'basket model UI must archive through API');

console.log('basket mounted edit, print and models contracts: PASS');
