import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const uiPath='vitrine/admin/basket-guided-builder.js';
assert.equal(fs.existsSync(uiPath),true,'guided builder UI module must exist');
const ui=fs.readFileSync(uiPath,'utf8');

assert.match(admin,/basket-guided-builder\.js/,'admin must load guided builder UI');
assert.match(admin,/DonaAntoniaGuidedBridge/,'admin must expose a narrow bridge to the guided UI');
assert.match(admin,/DonaAntoniaBasketGuided[^\n]*open/,'existing Cestas\/Kits flow must route into guided builder');
assert.match(admin,/data-commercial-new[\s\S]{0,1800}DonaAntoniaBasketGuided/,'Novo lote must use the guided builder');

for(const label of ['Dados comerciais','Itens da cesta/kit','Resumo','Criar lote / reservar','Marcar como montado']){
  assert.match(ui,new RegExp(label.replace('/','\\/'),'i'),`guided UI must show ${label}`);
}
for(const action of ['model_editor','position_products','model_save','lot_preview','lot_reserve','lot_update','lot_mount','lot_cancel','lot_reopen']){
  assert.match(ui,new RegExp(`["']${action}["']`),`guided UI must call ${action}`);
}

assert.match(ui,/IntersectionObserver|Carregar produtos/i,'product carousels must lazy-load');
assert.match(ui,/position_label/i,'positions must expose editable terms');
assert.match(ui,/family_key/i,'positions must preserve configured family');
assert.match(ui,/search_query/i,'positions must preserve textual fallback');
assert.match(ui,/removable/i,'positions must preserve removable rule');
assert.match(ui,/quantity_editable/i,'positions must preserve quantity editable rule');
assert.match(ui,/min_quantity/i,'positions must preserve min quantity');
assert.match(ui,/max_quantity/i,'positions must preserve max quantity');
assert.match(ui,/duplicate_confirmed|mesmo produto|produto repetido/i,'same SKU in two positions must require confirmation');

for(const stock of ['Total','Reservado','Avulso'])assert.match(ui,new RegExp(stock,'i'),`product cards must show ${stock} stock`);
for(const field of ['cost_price','sale_price','effective_sellable_stock','basket_locked_quantity','loose_stock'])assert.match(ui,new RegExp(field),`UI must consume ${field}`);
assert.match(ui,/Por cesta/i,'lot preview must show per-basket quantity');
assert.match(ui,/Necessário/i,'lot preview must show required total');
assert.match(ui,/Saldo/i,'lot preview must show post-reservation balance');
assert.match(ui,/insufficient|insuficiente|balance_after/i,'UI must surface insufficient stock');

for(const state of ['Em montagem','Montado','Pausado','Esgotado','Cancelado'])assert.match(ui,new RegExp(state,'i'),`UI must expose operational state ${state}`);
assert.match(ui,/Ativar venda/i,'sale activation must remain separate from mounting');
assert.match(ui,/Editar lote/i,'reserved lot must remain editable');
assert.match(ui,/Cancelar lote/i,'reserved lot must be cancellable when eligible');
assert.match(ui,/Duplicar lote|Imprimir lote|Ver composição/i,'legacy lot operations must remain represented');

const saveStart=ui.indexOf('async function saveModel');
const saveEnd=ui.indexOf('\n  async function ensureSavedForLot',saveStart+1);
assert.ok(saveStart>=0,'saveModel helper must exist');
assert.ok(saveEnd>saveStart,'saveModel boundary must be identifiable');
const saveBlock=ui.slice(saveStart,saveEnd);
assert.match(saveBlock,/model_save/,'saving model must call model_save');
assert.doesNotMatch(saveBlock,/lot_reserve/,'saving model must not reserve stock');

console.log('basket guided builder UI v1: PASS');
