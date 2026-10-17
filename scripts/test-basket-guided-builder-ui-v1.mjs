import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const uiPath='vitrine/admin/basket-guided-builder.js';
assert.equal(fs.existsSync(uiPath),true,'guided compatibility UI module must exist');
const ui=fs.readFileSync(uiPath,'utf8');

assert.match(admin,/basket-guided-builder\.js\?v=guided-v3/,'admin may load guided compatibility builder during migration');
assert.match(admin,/basket-admin-section\.js\?v=canonical-v3/,'admin must load the simple basket section controller');
assert.match(admin,/DonaAntoniaAdminBridge/,'admin must expose one stable bridge from its main runtime');
assert.doesNotMatch(admin,/DonaAntoniaGuidedBridge/,'retired basket-specific bridge must not remain');
assert.doesNotMatch(section,/DonaAntoniaBasketGuided|function openGuided|data-basket-new-lot|data-basket-edit-lot/,'normal section must not route users into guided lot operations');
assert.match(section,/DonaAntoniaKitBuilder/,'normal section must route recipe work to Kit Builder');
assert.match(section,/DonaAntoniaStoreBaskets/,'normal section must route external baskets to Store Baskets');

// Technical guided flow remains intact for historical lots and backend compatibility.
for(const label of ['Dados comerciais','Itens da cesta/kit','Resumo','Criar lote / reservar','Marcar como montado','Nome público do lote','Preço final do lote','Tipo do lote vinculado','Escolher lote','Itens do lote vinculado']){
  assert.match(ui,new RegExp(label.replaceAll('/','\\/'),'i'),`guided compatibility UI must show ${label}`);
}
for(const action of ['model_editor','position_products','linkable_lots','model_save','lot_preview','lot_reserve','lot_update','lot_mount','lot_cancel','lot_reopen']){
  assert.match(ui,new RegExp(`["']${action}["']`),`guided compatibility UI must call ${action}`);
}

assert.match(ui,/IntersectionObserver|Carregar produtos/i,'compatibility product carousels must lazy-load');
for(const field of ['position_label','family_key','search_query','removable','quantity_editable','min_quantity','max_quantity'])assert.match(ui,new RegExp(field),`positions must preserve ${field}`);
assert.match(ui,/duplicate_confirmed|mesmo produto|produto repetido/i,'same SKU in two positions must require confirmation');
for(const stock of ['Total','Reservado','Avulso'])assert.match(ui,new RegExp(stock,'i'),`guided product cards must show ${stock} stock`);
for(const field of ['cost_price','sale_price','effective_sellable_stock','basket_locked_quantity','loose_stock'])assert.match(ui,new RegExp(field),`guided UI must consume ${field}`);
assert.match(ui,/Por cesta/i,'lot preview must show per-basket quantity');
assert.match(ui,/Necessário/i,'lot preview must show required total');
assert.match(ui,/Saldo/i,'lot preview must show post-reservation balance');
assert.match(ui,/insufficient|insuficiente|balance_after/i,'guided UI must surface insufficient stock');

for(const operational of ['Em montagem','Montado','Pausado','Esgotado','Cancelado'])assert.match(ui,new RegExp(operational,'i'),`guided compatibility UI must expose operational state ${operational}`);
assert.match(ui,/Ativar venda/i,'technical sale activation must remain separate from mounting');
assert.match(ui,/Editar lote/i,'technical reserved lot must remain editable');
assert.match(ui,/Cancelar lote/i,'technical reserved lot must be cancellable when eligible');
assert.match(ui,/applyDuplicateSeed/,'guided compatibility editor must support duplicate/existing lot snapshot');
assert.match(ui,/state\.lot\|\|state\?\.duplicateLot|state\?\.lot\|\|state\?\.duplicateLot/,'existing lot must take precedence over duplicate seed');

const saveStart=ui.indexOf('async function saveModel');
const saveEnd=ui.indexOf('\n  async function ensureSavedForLot',saveStart+1);
assert.ok(saveStart>=0&&saveEnd>saveStart,'saveModel helper must be identifiable');
const saveBlock=ui.slice(saveStart,saveEnd);
assert.match(saveBlock,/model_save/,'saving technical model must call model_save');
assert.match(saveBlock,/commercial:/,'saving technical model must include commercial fields');
assert.doesNotMatch(saveBlock,/lot_reserve/,'saving model must not reserve stock');

const reserveStart=ui.indexOf('async function reserveOrUpdateLot');
const reserveEnd=ui.indexOf('\n  async function mountLot',reserveStart+1);
assert.ok(reserveStart>=0&&reserveEnd>reserveStart,'lot reservation helper must be identifiable');
const reserve=ui.slice(reserveStart,reserveEnd);
for(const field of ['public_name','sale_price','linked_lot_id'])assert.match(reserve,new RegExp(field),`technical lot reservation must persist ${field}`);
assert.match(reserve,/lot_update/,'editing an assembling lot must update the same reservation');
assert.match(reserve,/lot_reserve/,'new technical lot must use canonical reservation action');

const createSql=fs.readFileSync('supabase/sql/20261004_basket_commercial_create_v1.sql','utf8');
assert.match(createSql,/v_prefix\s*:=\s*chr\([^;]+\)\s*\|\|\s*chr\(/i,'legacy commercial prefix must use PostgreSQL concatenation correctly');
const archiveSql=fs.readFileSync('supabase/sql/20261005_basket_commercial_archive_fix_v1.sql','utf8');
assert.match(archiveSql,/update\s+public\.basket_kit_templates[\s\S]*is_active\s*=\s*false/i,'technical archive must deactivate its internal kit template atomically');
assert.match(archiveSql,/basket_has_live_lots/i,'technical archive must reject live lots before archiving');

console.log('basket guided compatibility layer: PASS');
