import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=file=>fs.readFileSync(file,'utf8');
const app=read('vitrine-v3/app.js');
const baskets=read('vitrine-v3/baskets.js');
const checkout=read('vitrine-v3/checkout.js');
const state=read('vitrine-v3/state.js');
const css=read('vitrine-v3/styles.css')+'\n'+read('vitrine-v3/details.css')+'\n'+read('vitrine-v3/flow.css');
const migrations=fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).map(x=>read(`supabase/migrations/${x}`)).join('\n');

// Checkout precisa continuar simples, mas com foto pequena em cada item.
assert.match(checkout,/checkout-item-photo/,'checkout precisa renderizar foto do produto');
assert.match(checkout,/image_url/,'checkout precisa usar a imagem real do produto');

// Produtos das cestas devem abrir o mesmo detalhe/modal dos produtos avulsos.
assert.match(baskets,/data-open-product/,'produtos da composição da cesta precisam abrir o card do produto');

// O bloco “Total até agora” foi removido; o total continua acessível no botão Pedido.
assert.doesNotMatch(baskets,/Total até agora|basket-inline-total/,'não deve existir quadro “Total até agora” dentro da cesta');

// Itens removíveis podem ser reduzidos mesmo quando não permitem aumento.
assert.match(baskets,/canReduce\s*=\s*item\.removable===true/,'redução precisa respeitar removable');
assert.match(baskets,/canIncrease\s*=\s*item\.quantity_editable===true/,'aumento precisa respeitar quantity_editable');
assert.match(state,/reducing[\s\S]*item\.removable/,'estado precisa permitir redução de item removível');
assert.match(state,/increasing[\s\S]*item\.quantity_editable/,'estado precisa exigir quantity_editable para aumentar');
assert.match(migrations,/v_qty\s*<\s*v_bi\.quantity[\s\S]*v_bi\.removable/i,'servidor precisa aceitar redução de item removível');
assert.match(migrations,/v_qty\s*>\s*v_bi\.quantity[\s\S]*v_bi\.quantity_editable/i,'servidor precisa manter aumento restrito a item editável');

// Depois da cesta: Ofertas de Hoje em carrossel, até 10 cards; depois busca e chips.
assert.match(app,/Ofertas de Hoje/,'título de ofertas precisa ser “Ofertas de Hoje”');
assert.match(app,/limit\s*:\s*10/,'carrossel deve pedir no máximo 10 ofertas');
assert.match(app,/offer-carousel/,'ofertas precisam ser renderizadas em carrossel');
assert.match(app,/renderBasketDetail\([\s\S]*offerSectionMarkup\(\)[\s\S]*marketMarkup\(false\)/,'ordem deve ser cesta, ofertas, busca/chips sem repetir título de mercado');
assert.match(css,/\.offer-carousel/,'carrossel precisa de estilo próprio');
assert.match(css,/overflow-x\s*:\s*auto/,'carrossel precisa rolar horizontalmente');
assert.match(css,/flex\s*:\s*0\s+0\s+3[6-9]%/,'no celular devem aparecer aproximadamente 2,5 cards por tela');

console.log('storefront-v3-refinements contract ok');
