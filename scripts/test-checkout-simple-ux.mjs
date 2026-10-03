import fs from 'node:fs';
import assert from 'node:assert/strict';

const ux=fs.readFileSync('checkout-resilience.js','utf8');

// Telefone: uma unica acao visivel e consulta automatica.
assert.match(ux,/checkoutWhatsappUnified/,'checkout must expose one unified WhatsApp field');
assert.match(ux,/formatUnifiedPhone/,'unified WhatsApp must be formatted for human reading');
assert.match(ux,/scheduleAutomaticLookup/,'valid WhatsApp must trigger customer lookup automatically');
assert.doesNotMatch(ux,/Digite seu WhatsApp e toque em Continuar\./,'checkout must not require a Continue step after phone entry');
assert.match(ux,/lookup\.hidden=true|lookup\.style\.display='none'/,'legacy lookup button must not be a visible required step');

// CPF/CNPJ segue obrigatorio para cliente novo.
assert.match(ux,/!known&&!digits\(draft\.document,14\)/,'new customers must still provide CPF/CNPJ');
assert.match(ux,/Digite seu CPF ou CNPJ\./,'new customer must get a direct CPF/CNPJ validation message');

// Carrinho deixa o formulario comecar cedo, mas continua editavel.
assert.match(ux,/da-checkout-cart-summary/,'order items must be collapsible behind a compact summary');
assert.match(ux,/Ver ou alterar produtos/,'collapsed order summary must clearly offer product editing');

// Data deixa de depender de um select pequeno.
assert.match(ux,/da-date-options/,'delivery dates must be rendered as large choice cards');
assert.match(ux,/checkoutDeliveryDate/,'canonical delivery-date select must remain the source of truth');
assert.match(ux,/dispatchEvent\(new Event\('change'/,'date cards must update the canonical select');

// Controles grandes para celular e baixa familiaridade digital.
assert.match(ux,/font-size:16px/,'typed form values must use at least 16px');
assert.match(ux,/min-height:52px/,'primary form controls must have generous touch height');
assert.match(ux,/@media\(max-width:560px\)[\s\S]*\.payments\{grid-template-columns:1fr!important/,'mobile payment choices must use one column');
assert.match(ux,/Sim, entregar aqui/,'saved-address primary action must be explicit');
assert.match(ux,/Usar outro endereço/,'saved-address secondary action must be explicit');

// Rodape simples: total + uma acao dominante.
assert.match(ux,/da-checkout-final-total/,'checkout footer must keep total visible');
assert.match(ux,/Confirmar pedido/,'final CTA must use plain-language confirmation wording');

console.log('simple public checkout UX contract: OK');
