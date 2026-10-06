import fs from 'node:fs';
import assert from 'node:assert/strict';

const ux=fs.readFileSync('checkout-resilience.js','utf8');
const site=fs.readFileSync('index.html','utf8');
const mirror=fs.readFileSync('vitrine/index.html','utf8');

assert.equal(site,mirror,'public storefront mirrors must stay identical');

// Telefone: uma unica acao visivel e consulta automatica.
assert.match(ux,/checkoutWhatsappUnified/,'checkout must expose one unified WhatsApp field');
assert.match(ux,/formatUnifiedPhone/,'unified WhatsApp must be formatted for human reading');
assert.match(ux,/scheduleAutomaticLookup/,'valid WhatsApp must trigger customer lookup automatically');
assert.doesNotMatch(ux,/Digite seu WhatsApp e toque em Continuar\./,'checkout must not require a Continue step after phone entry');
assert.match(ux,/lookup\.hidden=true|lookup\.style\.display='none'/,'legacy lookup button must not be a visible required step');

// CPF/CNPJ segue obrigatorio para cliente novo.
assert.match(ux,/!known&&!digits\(draft\.document,14\)/,'new customers must still provide CPF/CNPJ');
assert.match(ux,/Digite seu CPF ou CNPJ\./,'new customer must get a direct CPF/CNPJ validation message');

// Produtos precisam ficar sempre visiveis para o cliente conferir antes de confirmar.
assert.doesNotMatch(ux,/function collapseOrderSummary\(/,'order items must not be hidden behind a collapsible summary');
assert.doesNotMatch(ux,/da-checkout-cart-summary/,'checkout must not hide product list inside details');
assert.doesNotMatch(ux,/Ver ou alterar produtos/,'product list must already be visible without an extra disclosure action');

// Checkout calmo: rerenders nao podem jogar a tela para outro ponto.
assert.match(site,/previousCheckoutScrollTop/,'checkout repaint must remember current scroll position');
assert.match(site,/sheetBody\.scrollTop=previousCheckoutScrollTop/,'checkout repaint must restore current scroll position');

// Endereco cadastrado ja vale como confirmado; so existe a acao de trocar.
assert.doesNotMatch(site,/id=\\?"confirmAddress\\?"/,'saved address must not require a confirmation button');
assert.doesNotMatch(ux,/Confirme se este é o endereço da entrega/,'validation must not require confirming a saved address');
assert.match(site,/id=\\?"editAddress\\?"/,'saved address must still offer an edit action');
assert.match(site,/state\.addressConfirmed=data\.found&&data\.customer\?\.registration_complete===true/,'complete saved address must be accepted automatically after lookup');

// Marketing: uma frase + checkbox, sem abrir formulario inteiro.
assert.match(site,/Quero receber ofertas semanais por WhatsApp/,'marketing choice must use one plain-language sentence');
assert.match(site,/checkoutMarketingExisting/,'existing customer must get an inline marketing checkbox');
assert.match(site,/saveCheckoutMarketingPreference/,'existing marketing preference must save without entering edit mode');
assert.doesNotMatch(site,/editMarketingPreference/,'checkout must not show the old confusing marketing edit button');
assert.match(site,/marketingChecked=c\.marketing_opt_in===true/,'new customer marketing checkbox must start unchecked unless the customer explicitly opted in');

// Primeira data disponivel ja vem selecionada.
assert.match(site,/state\.checkoutDeliveryDate=state\.deliveryOptions\[0\]\?\.date\|\|''/,'first available delivery date must be selected automatically');
assert.match(ux,/da-date-options/,'delivery dates must be rendered as large choice cards');
assert.match(ux,/checkoutDeliveryDate/,'canonical delivery-date select must remain the source of truth');

// Menos texto e controles grandes.
assert.doesNotMatch(ux,/Você não precisa digitar tudo novamente/,'checkout must avoid redundant explanatory copy');
assert.doesNotMatch(ux,/Toque no dia em que deseja receber/,'delivery section must not repeat obvious instructions');
assert.match(ux,/font-size:16px/,'typed form values must use at least 16px');
assert.match(ux,/min-height:52px/,'primary form controls must have generous touch height');
assert.match(ux,/@media\(max-width:560px\)[\s\S]*\.payments\{grid-template-columns:1fr!important/,'mobile payment choices must use one column');
assert.match(ux,/Trocar endereço/,'saved-address action must use short plain language');

// Rodape simples: total + uma acao dominante.
assert.match(ux,/da-checkout-final-total/,'checkout footer must keep total visible');
assert.match(ux,/Confirmar pedido/,'final CTA must use plain-language confirmation wording');

console.log('simple public checkout UX contract: OK');
