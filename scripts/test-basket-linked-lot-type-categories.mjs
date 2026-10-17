import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const guidedApi=fs.readFileSync('supabase/functions/admin-basket-guided-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/sql/20261004_basket_fixed_categories_v1.sql','utf8');

assert.doesNotMatch(admin,/id="kitLotLinkedType"|id="kitLotLinkedLot"/,'seletor legado de lote vinculado não deve continuar no runtime principal');
assert.ok(guided.includes('id="bgLotLinkedType"'),'editor guiado deve ter seletor do tipo do lote vinculado');
assert.ok(guided.includes('id="bgLotLinkedLot"'),'editor guiado deve manter seletor do lote vinculado');
assert.match(guided,/\(state\.linkableLots\|\|\[\]\)\.filter\([^\n]*business_type/,'lista guiada de lotes vinculáveis deve ser filtrada pelo tipo escolhido');
assert.match(guided,/bgLotLinkedType[^\n]*change|change[^\n]*bgLotLinkedType/,'trocar o tipo do lote vinculado deve atualizar o fluxo');
assert.ok(guided.includes('Itens do lote vinculado'),'editor guiado deve mostrar os itens do lote vinculado');
assert.match(guided,/linked\.items[\s\S]*bg-linked-item/,'itens do lote vinculado devem aparecer no resumo canônico');
assert.match(guided,/linked_lot_id\s*:/,'criar/atualizar lote deve enviar linked_lot_id');

assert.match(guidedApi,/["']linkable_lots["']/,'API guiada deve expor consulta de lotes vinculáveis');
assert.match(guidedApi,/basket_stock_lots/,'consulta guiada deve usar lotes canônicos');
assert.match(guidedApi,/business_type/,'consulta guiada deve devolver tipo operacional');
assert.match(guidedApi,/basket_stock_lot_items/,'consulta guiada deve devolver itens do lote vinculado');
assert.match(guidedApi,/ops2_loose_sellable_stock_v1/,'consulta guiada deve devolver estoque dos itens vinculados');
assert.match(guidedApi,/loose_stock/,'itens vinculados devem informar estoque avulso');

for(const label of ['Cestas Completas','Cestas Só Alimento','Kits Limpeza e Higiene','Kits Limpeza','Kits Higiene']){
  assert.ok(migration.includes(label),`migration deve garantir a categoria ${label}`);
}
assert.match(guided,/Categoria/,'editor guiado deve editar a categoria comercial pelo cadastro oficial');
assert.ok(!admin.includes('Nova categoria</span><input'),'categorias de cesta não devem depender de criação livre por texto');

console.log('basket linked lot type + categories canonical: ok');
