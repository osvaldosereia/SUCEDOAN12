import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=file=>fs.readFileSync(file,'utf8');
const app=read('vitrine-v3/app.js');
const baskets=read('vitrine-v3/baskets.js');
const cart=read('vitrine-v3/cart.js');
const checkout=read('vitrine-v3/checkout.js');
const products=read('vitrine-v3/products.js');
const styles=read('vitrine-v3/styles.css')+'\n'+read('vitrine-v3/details.css')+'\n'+read('vitrine-v3/flow.css');

assert.match(products,/data-extra-plus[^>]*disabled|disabled[^>]*data-extra-plus/,'lista de produtos precisa desabilitar + quando atingir estoque');
assert.match(products,/data-modal-extra-minus[^>]*disabled|disabled[^>]*data-modal-extra-minus/,'modal precisa ter estado mínimo explícito e permitir remoção até zero');
assert.match(app,/modalQty=Math\.max\(0,/,'modal deve permitir reduzir quantidade até zero para remover do pedido');
assert.match(cart,/data-cart-extra-plus[\s\S]*qty>=stock\?'disabled'/,'carrinho precisa desabilitar + no limite de estoque');

assert.match(cart,/cart-row-photo/,'carrinho precisa mostrar miniatura do produto');
assert.match(cart,/filter\(item=>Number\(item\.quantity\|\|0\)>0\)/,'carrinho não deve listar componente da cesta com quantidade zero');
assert.match(cart,/aria-label="Diminuir/,'controles do carrinho precisam ter rótulos acessíveis');

assert.match(checkout,/data-back-shopping/,'checkout precisa ter ação explícita para voltar à compra');
assert.match(checkout,/checkout-phone-help/,'telefone precisa explicar por que está sendo pedido');
assert.match(app,/data-back-shopping/,'app precisa tratar retorno do checkout preservando contexto da cesta');

assert.match(app,/lastCartFocus/,'drawer precisa lembrar o foco anterior');
assert.match(app,/closeCart[^]*focus/,'fechar drawer precisa restaurar foco');
assert.match(app,/Produto adicionado ao pedido/,'feedback de adição precisa ser específico');

assert.match(baskets,/Quantidade fixa|quantidade fixa/i,'item não editável precisa comunicar que a quantidade é fixa');
assert.match(styles,/:focus-visible/,'interface precisa ter estado de foco visível para navegação por teclado');
assert.match(styles,/button:disabled/,'botões desabilitados precisam ter estado visual consistente');
assert.match(styles,/env\(safe-area-inset-bottom\)/,'barra móvel precisa respeitar área segura do dispositivo');

assert.match(baskets,/fetchpriority="high"/,'primeiras cestas precisam priorizar carregamento das imagens');

console.log('storefront-v3 senior ux polish contract ok');
