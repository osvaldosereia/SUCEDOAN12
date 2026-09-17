import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => fs.existsSync(new URL(`../${path}`, import.meta.url));

assert.ok(exists('comprar/conversation.js'), 'Comprar V2 deve carregar um controlador conversacional próprio');
assert.ok(exists('comprar/conversation.css'), 'Comprar V2 deve ter estilos conversacionais isolados');

const index = read('comprar/index.html');
const conversation = read('comprar/conversation.js');
const styles = read('comprar/conversation.css');
const baseStyles = read('comprar/styles.css');
const baskets = read('comprar/baskets.js');
const app = read('comprar/app.js');

assert.match(index, /conversation\.css\?v=/, 'CSS conversacional deve ser versionado no Comprar');
assert.match(index, /conversation\.js\?v=/, 'controlador conversacional deve ser carregado e versionado');
assert.ok(index.indexOf('conversation.js') > index.indexOf('help.js'), 'controlador V2 deve carregar depois dos módulos legados e antes do start');
assert.ok(index.indexOf('conversation.js') < index.indexOf('DA_COMPRAR_APP.start'), 'controlador V2 deve assumir os módulos antes do start');

assert.match(conversation, /function\s+ask\s*\(/, 'deve existir helper de pergunta conversacional');
assert.match(conversation, /function\s+choose\s*\(/, 'deve existir helper de escolha conversacional');
assert.match(conversation, /Ana está digitando/, 'deve existir indicador de digitação');
assert.match(conversation, /450/);
assert.match(conversation, /850/);
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
assert.match(conversation, /state\.modules\.upsell\.renderAfterBasket\s*=\s*\(\)\s*=>\s*false/, 'upsell automático pós-cesta deve ser neutralizado');
assert.match(conversation, /state\.modules\.upsell\.renderBeforeCheckout\s*=\s*\(\)\s*=>\s*false/, 'upsell automático na revisão deve ser neutralizado');
assert.match(conversation, /originalProductsRenderEntry/);
assert.match(conversation, /options\?\.auto===true/, 'abertura automática de produtos pós-cesta deve virar prompt');
assert.match(conversation, /order-review-actions/);
assert.match(conversation, /stopImmediatePropagation/);
assert.match(conversation, /function\s+consumeStartChoices\s*\(/, 'menu inicial deve ser consumido após a primeira escolha sem continuar clicável no meio da conversa');
assert.match(conversation, /closest\('\.start-chips'\)[\s\S]*consumeStartChoices\(\)/, 'clique semântico inicial deve consumir o menu antes de abrir a próxima etapa');

assert.match(styles, /\.conversation-quick-replies/);
assert.match(styles, /\.conversation-typing/);
assert.match(styles, /\.conversation-offers-grid/);
assert.match(styles, /@media\s*\(max-width:\s*520px\)/);

// Acessibilidade visual: público com maior necessidade de legibilidade e toque confiável.
assert.match(styles, /body\s*\{[^}]*font-size:\s*16px/i, 'fonte-base do Comprar deve subir para 16px');
assert.match(styles, /\.conversation-message\s*,\s*\.bubble\s*\{[^}]*font-size:\s*18px/i, 'balões devem usar fonte maior e mais legível');
assert.match(styles, /\.conversation-quick-reply[^}]*min-height:\s*48px/i, 'respostas rápidas devem respeitar alvo de toque de 48px');
assert.match(styles, /\.start-chips\s+\.chip[^}]*min-height:\s*48px/i, 'botões iniciais da conversa devem seguir o mesmo alvo de toque');
assert.match(styles, /\.basket-row\s+img\s*\{[^}]*width:\s*68px[^}]*height:\s*68px/i, 'fotos dos produtos da cesta devem ser maiores');
assert.match(styles, /\.basket-row\s+h3\s*\{[^}]*font-size:\s*15\.5px/i, 'nomes dos produtos da cesta devem ser maiores');
assert.match(styles, /\.chips-categories\s+\.chip\s*\{[^}]*font-size:\s*16px/i, 'categorias devem ter hierarquia visual principal');
assert.match(styles, /\.chips-subcategories\s+\.chip\s*\{[^}]*font-size:\s*14\.5px/i, 'subcategorias devem ser menores e mais discretas');

// Produtos e ofertas sempre em grade; sem trilho/carrossel horizontal de cards.
assert.match(styles, /\.conversation-offers-grid\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/i, 'ofertas conversacionais devem usar grade');
assert.doesNotMatch(styles, /\.conversation-offers-grid\s*\{[^}]*overflow-x:\s*auto/i, 'ofertas não devem usar carrossel horizontal');
assert.match(baseStyles, /\.products-grid\s*\{[^}]*display:grid[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/i, 'produtos da loja devem permanecer em grade');

assert.match(baskets, /state\.modules\.products\?\.renderEntry\?\.\(\{auto:true\}\)/, 'contrato deve provar que o legado ainda chama auto:true e é interceptado pelo V2');
assert.match(app, /renderBeforeCheckout/, 'contrato deve provar que a revisão legada ainda chama upsell e é neutralizada pelo V2');

new Function(conversation);
console.log('PASS: Comprar Conversacional V2 — contrato estrutural');
