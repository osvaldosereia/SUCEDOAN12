import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const uiPath='vitrine/admin/basket-guided-builder.js';
assert.equal(fs.existsSync(uiPath),true,'guided builder UI module must exist');
const ui=fs.readFileSync(uiPath,'utf8');

assert.match(admin,/basket-guided-builder\.js\?v=guided-v3/,'admin must load guided builder v3');
assert.match(admin,/basket-admin-section\.js\?v=canonical-v3/,'admin must load canonical basket section v3');
assert.match(admin,/DonaAntoniaAdminBridge/,'admin must expose one stable bridge from its main runtime');
assert.doesNotMatch(admin,/DonaAntoniaGuidedBridge/,'retired basket-specific bridge must not remain');
assert.match(section,/function guided\(\)[^\n]*DonaAntoniaBasketGuided/,'canonical section must own one guided-builder adapter');
assert.match(section,/function openGuided\(/,'canonical cards must route through one openGuided path');
assert.match(section,/g\.open\(m\.commercial_id/,'openGuided must open the commercial model in the guided builder');
assert.doesNotMatch(section,/startBasketKitLotDraft|openBasketKitAdmin|openBasketCommercialEditor/,'canonical cards must not fall back to legacy composers');

for(const label of ['Dados comerciais','Itens da cesta/kit','Resumo','Criar lote / reservar','Marcar como montado','Nome público do lote','Preço final do lote','Tipo do lote vinculado','Escolher lote','Itens do lote vinculado']){
  assert.match(ui,new RegExp(label.replaceAll('/','\\/'),'i'),`guided UI must show ${label}`);
}
for(const action of ['model_editor','position_products','linkable_lots','model_save','lot_preview','lot_reserve','lot_update','lot_mount','lot_cancel','lot_reopen']){
  assert.match(ui,new RegExp(`["']${action}["']`),`guided UI must call ${action}`);
}

assert.match(ui,/IntersectionObserver|Carregar produtos/i,'product carousels must lazy-load');
for(const field of ['position_label','family_key','search_query','removable','quantity_editable','min_quantity','max_quantity'])assert.match(ui,new RegExp(field),`positions must preserve ${field}`);
assert.match(ui,/duplicate_confirmed|mesmo produto|produto repetido/i,'same SKU in two positions must require confirmation');
for(const stock of ['Total','Reservado','Avulso'])assert.match(ui,new RegExp(stock,'i'),`product cards must show ${stock} stock`);
for(const field of ['cost_price','sale_price','effective_sellable_stock','basket_locked_quantity','loose_stock'])assert.match(ui,new RegExp(field),`UI must consume ${field}`);
assert.match(ui,/Por cesta/i,'lot preview must show per-basket quantity');
assert.match(ui,/Necessário/i,'lot preview must show required total');
assert.match(ui,/Saldo/i,'lot preview must show post-reservation balance');
assert.match(ui,/insufficient|insuficiente|balance_after/i,'UI must surface insufficient stock');

for(const operational of ['Em montagem','Montado','Pausado','Esgotado','Cancelado'])assert.match(ui,new RegExp(operational,'i'),`UI must expose operational state ${operational}`);
assert.match(ui,/Ativar venda/i,'sale activation must remain separate from mounting');
assert.match(ui,/Editar lote/i,'reserved lot must remain editable');
assert.match(ui,/Cancelar lote/i,'reserved lot must be cancellable when eligible');
assert.match(ui,/applyDuplicateSeed/,'guided editor must support duplicate/existing lot as an exact snapshot seed');
assert.match(ui,/state\.lot\|\|state\?\.duplicateLot|state\?\.lot\|\|state\?\.duplicateLot/,'existing lot must take precedence over duplicate seed');

const saveStart=ui.indexOf('async function saveModel');
const saveEnd=ui.indexOf('\n  async function ensureSavedForLot',saveStart+1);
assert.ok(saveStart>=0&&saveEnd>saveStart,'saveModel helper must be identifiable');
const saveBlock=ui.slice(saveStart,saveEnd);
assert.match(saveBlock,/model_save/,'saving model must call model_save');
assert.match(saveBlock,/commercial:/,'saving model must include commercial fields');
assert.doesNotMatch(saveBlock,/lot_reserve/,'saving model must not reserve stock');

const reserveStart=ui.indexOf('async function reserveOrUpdateLot');
const reserveEnd=ui.indexOf('\n  async function mountLot',reserveStart+1);
assert.ok(reserveStart>=0&&reserveEnd>reserveStart,'lot reservation helper must be identifiable');
const reserve=ui.slice(reserveStart,reserveEnd);
for(const field of ['public_name','sale_price','linked_lot_id'])assert.match(reserve,new RegExp(field),`lot reservation must persist ${field}`);
assert.match(reserve,/lot_update/,'editing an assembling lot must update the same reservation');
assert.match(reserve,/lot_reserve/,'new lot must use canonical reservation action');

assert.match(section,/data-basket-new-lot/,'commercial Novo lote binding must exist');
assert.match(section,/openGuided\(modelFromCard\(btn\),'lot'\)/,'card Novo lote must open guided builder directly');
assert.match(section,/data-basket-edit-lot/,'current lot edit action must exist on canonical card');
assert.match(section,/function printLot\(lot\)/,'commercial print must be a pure lot function');
assert.doesNotMatch(section,/state\.basketKitDetail/,'printing must not mutate legacy basket detail state');
assert.match(section,/source_kind==='basket'[\s\S]*api\('basket_admin'/,'legacy/full basket lots must load from basket_admin only as a compatibility read');
assert.match(section,/api\('basket_kit_admin'/,'standalone/internal kit lots may load from basket_kit_admin only as a compatibility read');
assert.match(section,/basket_archive/,'commercial model deletion must use canonical basket_archive');
assert.match(section,/basket_has_live_lots/,'model deletion must explain live-lot safety block');
assert.doesNotMatch(section,/basketProductSuggestions|Sugestões de produtos/,'legacy global suggestions action must not return');

const createSql=fs.readFileSync('supabase/sql/20261004_basket_commercial_create_v1.sql','utf8');
assert.match(createSql,/v_prefix\s*:=\s*chr\([^;]+\)\s*\|\|\s*chr\(/i,'commercial model prefix must concatenate text with || in PostgreSQL');
const archiveSql=fs.readFileSync('supabase/sql/20261005_basket_commercial_archive_fix_v1.sql','utf8');
assert.match(archiveSql,/update\s+public\.basket_kit_templates[\s\S]*is_active\s*=\s*false/i,'commercial archive must deactivate its internal kit template atomically');
assert.match(archiveSql,/basket_has_live_lots/i,'commercial archive must reject live lots before archiving');

console.log('basket guided builder UI v3: PASS');
