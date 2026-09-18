import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../orcamento/index.html', import.meta.url), 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';

assert.ok(inlineScript, 'script principal do orçamento não encontrado');
assert.doesNotThrow(() => new Function(inlineScript), 'JavaScript inline do orçamento deve compilar');

assert.match(html, /id="hideUnitPrice"/, 'controle do modo somente com itens ausente');
assert.match(html, /id="manualTotal"/, 'campo de total manual ausente');
assert.match(html, /id="useCalculatedTotal"/, 'ação para restaurar total calculado ausente');
assert.match(html, /id="quoteItemsPlain" class="items-only-grid"/, 'grade simplificada de itens ausente');
assert.match(html, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'modo simplificado deve usar duas colunas');
assert.match(html, /\.paper\.items-only-mode \.quote-table\{display:none\}/, 'tabela com valores deve sumir no modo simplificado');
assert.match(html, /\.paper\.items-only-mode \.items-only-grid\{display:grid\}/, 'grade de itens deve aparecer no modo simplificado');
assert.match(html, /quantity\)\*Math\.max\(0,i\.unitPrice\)/, 'subtotal interno deve continuar usando quantidade x valor unitário');
assert.match(html, /manualTotalOverride===null\?calculatedTotal/, 'total calculado deve ser padrão quando não há override');
assert.match(html, /options:\{hideUnitPrice:state\.hideUnitPrice,manualTotalOverride:state\.manualTotalOverride\}/, 'opções devem ser salvas no rascunho');
assert.match(html, /draft\.options\?\.hideUnitPrice===true/, 'rascunhos devem restaurar o modo simplificado');
assert.match(html, /manual===null\|\|manual===undefined\?null/, 'rascunhos antigos sem total manual devem continuar compatíveis');
assert.match(html, /\$\('quoteTable'\)\.hidden=itemsOnly/, 'tabela normal deve ser ocultada no modo simplificado');
assert.match(html, /\$\('quoteItemsPlain'\)\.hidden=!itemsOnly/, 'grade simplificada deve ser exibida no modo simplificado');
assert.match(html, /\$\('summarySubtotalRow'\)\.hidden=itemsOnly/, 'subtotal não deve aparecer no orçamento simplificado');
assert.match(html, /\$\('summaryDiscountRow'\)\.hidden=itemsOnly/, 'desconto não deve aparecer no orçamento simplificado');
assert.match(html, /itemsOnly\?'Itens do orçamento':'Produtos e valores'/, 'título deve mudar no modo simplificado');
assert.match(html, /class="items-only-card"/, 'itens simplificados devem possuir layout próprio');
assert.match(html, /class="item-qty"/, 'quantidade deve permanecer visível na grade de itens');
assert.match(html, /class="item-name"/, 'descrição deve permanecer visível na grade de itens');
assert.match(html, /formatMoney\(i\.quantity\*i\.unitPrice\)/, 'modo normal deve continuar exibindo total por item');

assert.match(html, /data-item-name=/, 'nome ou descrição do item deve ser editável');
assert.match(html, /data-item-code=/, 'código do item deve ser editável');
assert.match(html, /data-item-qty=/, 'quantidade do item deve continuar editável');
assert.match(html, /data-item-price=/, 'valor unitário do item deve continuar editável');
assert.match(html, /data-item-total=/, 'total da linha deve ser editável');
assert.match(html, /item\.name=e\.target\.value/, 'edição do nome deve atualizar o estado do orçamento');
assert.match(html, /item\.code=e\.target\.value/, 'edição do código deve atualizar o estado do orçamento');
assert.match(html, /parseMoney\(e\.target\.value\)\/Math\.max\(\.01,item\.quantity\)/, 'edição do total da linha deve recalcular o valor unitário');
assert.match(html, /id="payment" list="paymentOptions"/, 'forma de pagamento deve aceitar texto livre com sugestões');

console.log('OK · orçamento V2: itens totalmente editáveis + modo normal + modo somente com itens em duas colunas e total final.');
