import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const labelPrinter=readFileSync('admin/order-label-print-v1.js','utf8');

assert.match(labelPrinter,/@page\s*\{[^}]*size:\s*100mm 150mm/i,'a etiqueta deve continuar usando mídia vertical 100x150mm');
assert.match(labelPrinter,/\.shipping-label\{[^}]*height:\s*142mm/i,'cada etiqueta deve ter altura fixa igual à área imprimível');
assert.match(labelPrinter,/\.shipping-label\{[^}]*max-height:\s*142mm/i,'a etiqueta não pode crescer para uma segunda página');
assert.match(labelPrinter,/\.shipping-label\{[^}]*overflow:\s*hidden/i,'qualquer expansão de layout não pode criar uma página extra');
assert.match(labelPrinter,/\.shipping-label\{[^}]*break-inside:\s*avoid/i,'uma etiqueta nunca deve ser dividida entre páginas');
assert.doesNotMatch(labelPrinter,/\.shipping-label\{[^}]*min-height:\s*142mm/i,'altura mínima permite o conteúdo expandir e gerar página extra');
assert.match(labelPrinter,/const third=\[address\.city,address\.state\][\s\S]*CEP/i,'cidade, UF e CEP devem ocupar a mesma linha para economizar altura');
assert.match(labelPrinter,/\.label-brand\{[^}]*font-size:\s*10(?:\.5)?pt/i,'cabeçalho deve ser mais compacto');
assert.match(labelPrinter,/\.label-order strong\{[^}]*font-size:\s*15pt/i,'número do pedido deve permanecer destacado sem ocupar altura excessiva');
assert.match(labelPrinter,/\.label-main\{[^}]*font-size:\s*11\.5pt/i,'conteúdo principal deve ser compacto e legível');

console.log('comprar_order_label_single_page_contract_ok');
