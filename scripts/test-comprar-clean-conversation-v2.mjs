import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => fs.existsSync(new URL(`../${path}`, import.meta.url));

assert.ok(exists('comprar/conversation.js'), 'Comprar V2 deve carregar um controlador conversacional próprio');
assert.ok(exists('comprar/conversation.css'), 'Comprar V2 deve ter estilos conversacionais isolados');
assert.ok(exists('comprar/checkout-ux-fixes.js'), 'checkout deve ter correções de UX isoladas');
assert.ok(exists('comprar/checkout-ux-fixes.css'), 'checkout deve ter estilos próprios para controles novos');

const index = read('comprar/index.html');
const conversation = read('comprar/conversation.js');
const checkoutFixes = read('comprar/checkout-ux-fixes.js');
const checkoutFixStyles = read('comprar/checkout-ux-fixes.css');
const styles = read('comprar/conversation.css');
const baseStyles = read('comprar/styles.css');
const baskets = read('comprar/baskets.js');
const products = read('comprar/products.js');
const app = read('comprar/app.js');

assert.match(index, /conversation\.css\?v=/, 'CSS conversacional deve ser versionado no Comprar');
assert.match(index, /conversation\.js\?v=/, 'controlador conversacional deve ser carregado e versionado');
assert.match(index, /checkout-ux-fixes\.css\?v=/, 'CSS dos ajustes do checkout deve estar carregado');
assert.match(index, /checkout-ux-fixes\.js\?v=/, 'ajustes do checkout devem estar carregados');
assert.ok(index.indexOf('conversation.js') > index.indexOf('help.js'), 'controlador V2 deve carregar depois dos módulos legados e antes do start');
assert.ok(index.indexOf('checkout-ux-fixes.js') > index.indexOf('conversation.js'), 'ajustes devem carregar depois do controlador conversacional');
assert.ok(index.indexOf('checkout-ux-fixes.js') < index.indexOf('DA_COMPRAR_APP.start'), 'ajustes devem assumir o checkout antes do start');

assert.match(conversation, /function\s+ask\s*\(/, 'deve existir helper de pergunta conversacional');
assert.match(conversation, /function\s+choose\s*\(/, 'deve existir helper de escolha conversacional');
assert.match(conversation, /Ana está digitando/, 'deve existir indicador de digitação');
assert.match(conversation, /MIN_DELAY\s*=\s*800/, 'cadência mínima deve ser perceptível');
assert.match(conversation, /MAX_DELAY\s*=\s*1500/, 'cadência máxima deve ser calma sem ficar lenta demais');
assert.match(conversation, /async\s+function\s+revealTool\s*\(/, 'cards e ferramentas devem surgir após estado de digitação');
assert.match(conversation, /async\s+function\s+afterBasketSelected\s*\(/, 'pós-cesta deve ter sequência conversacional própria');
assert.match(conversation, /padrão/, 'confirmação deve dizer quando a cesta ficou padrão');
assert.match(conversation, /com alterações/, 'confirmação deve dizer quando a cesta foi alterada');
assert.match(conversation, /Antes de finalizarmos/, 'Ana deve orientar o próximo passo antes de mostrar opções');
assert.match(conversation, /await\s+typing\([^)]*\)[\s\S]*quickReplies\(/, 'chips devem aparecer somente depois de um novo indicador de digitação');
assert.match(baskets, /afterBasketSelected/, 'cesta escolhida deve delegar a sequência ao controlador conversacional');
assert.doesNotMatch(baskets, /Sua cesta já está no pedido\. Quer acrescentar alguma coisa\?/, 'não deve despejar confirmação e próxima pergunta na mesma fala');

assert.match(conversation, /Ver 6 ofertas de hoje/);
assert.match(conversation, /Procurar outros produtos/);
assert.match(conversation, /Não, revisar meu pedido/);
assert.match(conversation, /showOffers/);
assert.match(conversation, /offer_price/);
assert.match(conversation, /Number\(product\.stock/);
assert.match(conversation, /Number\(product\.offer_price\).*<.*Number\(product\.price\)/s, 'oferta deve ter desconto real');
assert.match(conversation, /renderIdentificationStep/);
assert.match(conversation, /renderAddressStep/);
assert.match(conversation, /renderPaymentStep/);
assert.match(conversation, /renderConfirmationStep/);
assert.match(conversation, /commit_customer/);
assert.match(conversation, /save_address/);
assert.match(conversation, /set_payment/);
assert.match(conversation, /confirmOrder/);
assert.match(conversation, /state\.modules\.upsell\.renderAfterBasket\s*=\s*\(\)\s*=>\s*false/);
assert.match(conversation, /state\.modules\.upsell\.renderBeforeCheckout\s*=\s*\(\)\s*=>\s*false/);
assert.match(conversation, /order-review-actions/);
assert.match(conversation, /stopImmediatePropagation/);
assert.match(conversation, /function\s+consumeStartChoices\s*\(/);

// Checkout deve manter a ordem visual: mensagens explicativas primeiro e ferramenta depois.
assert.match(checkoutFixes, /function\s+placeCheckoutToolLast\s*\(/, 'checkout precisa reposicionar a ferramenta na vez correta');
assert.match(checkoutFixes, /stage\.contains\(record\.target\)/, 'somente mudanças dentro da ferramenta do checkout devem disparar reposicionamento');
assert.match(checkoutFixes, /checkout-turn-card,\.checkout-address-preview/, 'telefone e endereço devem seguir a mesma regra de ordem');
assert.match(checkoutFixes, /new\s+MutationObserver/, 'ordem deve acompanhar as trocas de ferramenta sem reescrever o fluxo conversacional');

// Alterar extras abre lista editável com quantidade inclusive zero.
assert.match(checkoutFixes, /function\s+renderExtrasEditor\s*\(/, 'revisão deve ter editor de produtos extras');
assert.match(checkoutFixes, /data-extra-minus/, 'editor de extras precisa botão de diminuir quantidade');
assert.match(checkoutFixes, /data-extra-plus/, 'editor de extras precisa botão de aumentar quantidade');
assert.match(checkoutFixes, /Math\.max\(0,Number\(target/, 'quantidade deve aceitar zero sem ficar negativa');
assert.match(checkoutFixes, /state\.modules\.products[\s\S]*changeQuantity/, 'editor deve reutilizar o sincronismo oficial de produtos');
assert.match(checkoutFixes, /data-review-products/, 'clique em Alterar deve ser interceptado para abrir a lista');

// Limpar carrinho deve ficar explícito e reiniciar a compra usando o endpoint correto.
assert.match(checkoutFixes, /Limpar carrinho/, 'revisão do pedido deve mostrar botão visível para reiniciar a compra');
assert.match(checkoutFixes, /shopping-room-reset-v1/, 'limpeza deve chamar o endpoint oficial atual');
assert.match(checkoutFixes, /reset_cart/, 'limpeza deve zerar cesta e adicionais no servidor');
assert.match(checkoutFixStyles, /\.clear-cart-visible/, 'ação de limpar precisa destaque visual próprio');
assert.match(checkoutFixStyles, /\.extras-editor-qty/, 'seletor de quantidade deve ter layout explícito');

assert.match(styles, /\.conversation-quick-replies/);
assert.match(styles, /\.conversation-typing/);
assert.match(styles, /\.conversation-offers-grid/);
assert.match(styles, /@media\s*\(max-width:\s*520px\)/);
assert.match(styles, /body\s*\{[^}]*font-size:\s*16px/i);
assert.match(styles, /\.conversation-message\s*,\s*\.bubble\s*\{[^}]*font-size:\s*18px/i);
assert.match(styles, /\.conversation-typing[^}]*font-size:\s*(15\.5|16)px/i, 'indicador de digitação deve ser visível para público idoso');
assert.match(styles, /\.conversation-typing-dots\s+i[^}]*width:\s*7px[^}]*height:\s*7px/i, 'reticências do indicador devem ficar mais visíveis');
assert.match(styles, /\.conversation-quick-reply[^}]*min-height:\s*48px/i);
assert.match(styles, /\.basket-row\s+img\s*\{[^}]*width:\s*68px[^}]*height:\s*68px/i);
assert.match(styles, /\.basket-row\s+h3\s*\{[^}]*font-size:\s*15\.5px/i);
assert.match(styles, /\.chips-categories\s+\.chip\s*\{[^}]*font-size:\s*16px/i);
assert.match(styles, /\.chips-subcategories\s+\.chip\s*\{[^}]*font-size:\s*14\.5px/i);
assert.match(styles, /\.conversation-offers-grid\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/i);
assert.doesNotMatch(styles, /\.conversation-offers-grid\s*\{[^}]*overflow-x:\s*auto/i);
assert.match(baseStyles, /\.products-grid\s*\{[^}]*display:grid[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/i);

assert.match(conversation, /async\s+function\s+addOfferProduct\s*\(/);
assert.match(conversation, /waitForPending/);
assert.match(conversation, /aria-busy/);
assert.match(conversation, /cartProductIds\(\)\.has/);
assert.match(products, /waitForPending/);
assert.match(app, /renderBeforeCheckout/);

new Function(conversation);
new Function(checkoutFixes);
console.log('PASS: Comprar Conversacional V2 — contrato estrutural e cadência humana');
