import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../orcamento/enhancements-v2.js', import.meta.url),'utf8');
const css=readFileSync(new URL('../orcamento/enhancements-v2.css', import.meta.url),'utf8');

assert.match(js,/let generalMultiplier=1;/,'novo orçamento deve iniciar sempre com multiplicador 1');
assert.doesNotMatch(js,/localStorage\.getItem\([^)]*MULTIPLIER/i,'multiplicador não deve herdar valor de outro orçamento');
assert.doesNotMatch(js,/dispatchEvent\(/,'multiplicador não deve disparar eventos em cada produto');
assert.doesNotMatch(js,/multiplyPreviewItems/,'multiplicador não deve reescrever as linhas de produtos');
assert.doesNotMatch(js,/MutationObserver/,'multiplicador não pode usar MutationObserver; isso já causou loop e travamento da tela');
assert.doesNotMatch(js,/topSave\.textContent\s*=/,'complemento do multiplicador não deve sobrescrever o texto do botão nativo de salvar');
assert.match(js,/const unit=baseFinalTotal\(\),total=unit\*generalMultiplier/,'total deve ser valor de uma cesta vezes quantidade de cestas');
assert.match(js,/quoteMultiplierUnitValue/,'painel deve mostrar valor de uma cesta');
assert.match(js,/quoteMultiplierTotalValue/,'painel deve mostrar total do orçamento');
assert.match(js,/summaryBasketCountRow/,'PDF deve mostrar quantidade de cestas');
assert.match(js,/summaryBasketUnitRow/,'PDF deve mostrar valor de uma cesta');
assert.match(js,/composição de 1 cesta/i,'prévia deve deixar claro que itens representam uma cesta');
assert.match(js,/payload\.total_cents=Math\.round\(Number\(payload\.total_cents\|\|0\)\*generalMultiplier\)/,'histórico deve salvar o valor total multiplicado');
assert.match(css,/quote-multiplier-values/,'resumo do multiplicador deve possuir estilo próprio');

console.log('OK · multiplicador sem loop: 1 cesta base × quantidade de cestas, sem alterar produtos.');
