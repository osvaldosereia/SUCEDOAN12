import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='vitrine/admin/baskets-operational-polish.js';
assert.ok(fs.existsSync(path),`missing ${path}`);
const ui=fs.readFileSync(path,'utf8');

for(const marker of ['Alterações não salvas','Salvar e continuar','Descartar','Voltar']){
  assert.ok(ui.includes(marker),`unsaved-change guard must expose ${marker}`);
}
assert.match(ui,/beforeunload/,'browser navigation must be protected while dirty');
assert.match(ui,/data-kit-nav-card|data-kit-new/,'kit navigation must be guarded');
assert.match(ui,/data-store-basket-card|data-store-new/,'store basket navigation must be guarded');
assert.match(ui,/kit_save/,'successful kit save must clear dirty state');
assert.match(ui,/action[^\n]{0,120}save|['"]save['"]/s,'successful basket save must clear dirty state');
assert.ok(ui.includes('Reservar para montagem'),'reservation label must describe reservation, not physical mounting');
assert.ok(ui.includes('Ajuste comercial da cesta'),'commercial adjustment must replace technical hidden-value label');
assert.doesNotMatch(ui,/basket_only/,'technical basket_only wording must not be exposed');
assert.ok(ui.includes('Duplicar'),'kit duplicate action must use operator language');
assert.match(ui,/data-kit-edit-stock/,'Bling stock field must be handled');
assert.match(ui,/readOnly|disabled/,'Bling-controlled stock must become read-only');
assert.ok(ui.includes('Capacidade pelo estoque avulso'),'ops capacity label must be explicit');
assert.match(ui,/font-size:\s*11px|font-size:\s*12px|font-size:\s*13px/,'operational typography floor must be raised');
console.log('baskets operational polish v1: PASS');
