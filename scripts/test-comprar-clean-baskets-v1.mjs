import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const file='comprar/baskets.js';
assert.doesNotThrow(()=>readFileSync(file,'utf8'),'baskets.js deve existir');
const js=readFileSync(file,'utf8');

assert.doesNotMatch(js,/window\.fetch\s*=/,'cestas não podem interceptar fetch');
assert.doesNotMatch(js,/new\s+MutationObserver/,'cestas não podem corrigir DOM por observer global');
for(const label of ['Ver produtos','Voltar às cestas','Escolher esta cesta','Finalizar pedido','Adicionar mais produtos']){
  assert.match(js,new RegExp(label),`fluxo deve conter ${label}`);
}
assert.match(js,/async\s+function\s+previewBasket/,'deve existir prévia explícita');
assert.match(js,/basketStorefrontApi\(['"]detail['"]/,'prévia deve ler detalhe da cesta');
const previewStart=js.indexOf('async function previewBasket');
const chooseStart=js.indexOf('async function chooseBasket');
assert.ok(previewStart>=0&&chooseStart>previewStart,'funções de prévia e escolha devem ser separadas');
const previewBlock=js.slice(previewStart,chooseStart);
assert.doesNotMatch(previewBlock,/start_basket/,'prévia não pode incluir cesta no carrinho');
const chooseEnd=js.indexOf('function renderSelectedBasket',chooseStart);
const chooseBlock=js.slice(chooseStart,chooseEnd>chooseStart?chooseEnd:undefined);
assert.match(chooseBlock,/start_basket/,'só a confirmação deve iniciar a cesta');
assert.match(chooseBlock,/set_basket_quantity/,'quantidades alteradas devem ser aplicadas após escolher');
assert.match(chooseBlock,/renderEntry\s*\(\s*\{\s*auto\s*:\s*true/,'etapa 2 deve abrir automaticamente após escolher');
assert.match(js,/basket-finish-anchor/,'Finalizar deve possuir âncora de rolagem acima da etapa 2');
assert.match(js,/quantity_editable/,'prévia deve respeitar política de edição');
assert.match(js,/min_quantity/,'prévia deve respeitar mínimo');
assert.match(js,/max_quantity/,'prévia deve respeitar máximo');
assert.match(js,/restoreFromOpen/,'sessão com cesta existente deve poder ser restaurada');

console.log('OK: contrato limpo de cestas');
