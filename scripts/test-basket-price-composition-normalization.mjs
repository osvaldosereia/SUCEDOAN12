import assert from 'node:assert/strict';
import fs from 'node:fs';

const MIG='supabase/migrations/20261006133000_basket_price_composition_normalization.sql';
const ADMIN='vitrine/admin/basket-mold-admin.js';

assert.equal(fs.existsSync(MIG),true,'migration de normalização deve existir');
const sql=fs.readFileSync(MIG,'utf8');
const admin=fs.readFileSync(ADMIN,'utf8');

assert.match(sql,/basket_transition_commercial_price_v1/,'deve existir uma única função de preço para a transição');
assert.match(sql,/basket_lot_commercial_price_v1[\s\S]*basket_transition_commercial_price_v1/,'checkout legado deve usar o mesmo preço de transição');
assert.match(sql,/basket_commercial_catalog_v1[\s\S]*basket_transition_commercial_price_v1/,'catálogo público deve usar o mesmo preço de transição');
assert.match(sql,/mold_kind[\s\S]*food_only[\s\S]*papel\s+higi/i,'moldes só alimento devem remover posição de papel higiênico');
assert.match(sql,/l[aá]men[\s\S]*caldo/i,'variação de caldo deve ser removida das posições de lámen');
assert.match(sql,/rosquinha[\s\S]*P0061/i,'rosquinha Rancheiro deve ser preservada/restaurada nas posições de Rosquinha');
assert.doesNotMatch(sql,/update\s+public\.basket_stock_lots\s+set\s+quantity_/i,'migration não pode alterar quantidade física de lotes');

assert.match(admin,/Produtos\s*\+\s*Ajuste\s*=\s*Total/,'Admin deve explicar a fórmula do preço');
assert.match(admin,/price_preview/,'Admin deve exibir prévia das composições persistidas');
assert.match(admin,/effective_price/,'Admin deve mostrar preço efetivo das opções');

console.log('OK · preço único, composição higienizada e fórmula auditável no Admin.');
