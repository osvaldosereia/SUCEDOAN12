import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.ok(admin.includes('id="kitLotLinkedType"'),'editor deve ter seletor do tipo do lote vinculado');
assert.ok(admin.includes('id="kitLotLinkedLot"'),'editor deve manter seletor do lote vinculado');
assert.match(admin,/linkableLots\.filter\([^\n]*business_type/,'lista de lotes vinculáveis deve ser filtrada pelo tipo escolhido');
assert.match(admin,/kitLotLinkedType[^\n]*onchange|onchange[^\n]*kitLotLinkedType/,'trocar o tipo do lote vinculado deve atualizar o fluxo');
assert.ok(admin.includes('Itens do lote vinculado'),'editor deve mostrar os itens do lote vinculado');
assert.match(admin,/linkedLot\.items[\s\S]*kit-draft-line/,'itens do lote vinculado devem usar o mesmo layout de linha da composição');

for(const label of ['Cestas Completas','Cestas Só Alimento','Kits Limpeza e Higiene','Kits Limpeza','Kits Higiene']){
  assert.ok(admin.includes(label),`categorias fixas devem incluir ${label}`);
}
assert.ok(!admin.includes('Nova categoria</span><input'),'categorias de cesta não devem depender de criação livre por texto');

console.log('basket linked lot type + categories contract: ok');
