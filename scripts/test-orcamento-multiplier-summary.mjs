import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../orcamento/enhancements-v2.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../orcamento/enhancements-v2.css',import.meta.url),'utf8');

assert.match(js,/quoteMultiplierUnitValue/,'painel deve mostrar valor de uma cesta');
assert.match(js,/quoteMultiplierTotalValue/,'painel deve mostrar total multiplicado');
assert.match(js,/summaryBasketCountRow/,'PDF deve mostrar quantidade de cestas');
assert.match(js,/summaryBasketUnitRow/,'PDF deve mostrar valor unitário da cesta');
assert.match(js,/total\s*\/\s*generalMultiplier/,'valor de uma cesta deve derivar do total final dividido pelo multiplicador aplicado');
assert.match(js,/Total das .* cestas/,'total do PDF deve identificar o multiplicador');
assert.match(css,/quote-multiplier-values/,'resumo de valores do multiplicador deve possuir estilo próprio');

console.log('OK · resumo do multiplicador exibe quantidade, valor unitário e total no editor/PDF.');
