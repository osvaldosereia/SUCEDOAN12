import fs from 'node:fs';
import assert from 'node:assert/strict';

const conversation = fs.readFileSync('comprar/conversation.js','utf8');

assert.match(conversation,/function\s+placeCheckoutStageAtEnd\s*\(/,'checkout deve controlar diretamente a posição do bloco de ferramenta');

const identificationStart=conversation.indexOf('async function renderIdentificationStep');
const identificationEnd=conversation.indexOf('async function renderAddressStep');
const identification=conversation.slice(identificationStart,identificationEnd);
assert.ok(identification.indexOf("await say('Qual é seu WhatsApp com DDD? Vou procurar seu cadastro.')")>=0,'pergunta do WhatsApp deve existir');
assert.ok(identification.indexOf('placeCheckoutStageAtEnd()')>identification.indexOf("await say('Qual é seu WhatsApp com DDD? Vou procurar seu cadastro.')"),'campo de WhatsApp só pode ser posicionado depois da pergunta');
assert.ok(identification.indexOf('checkout-turn-card')>identification.indexOf('placeCheckoutStageAtEnd()'),'campo deve ser renderizado depois do reposicionamento');

const addressStart=conversation.indexOf('async function renderAddressStep');
const addressEnd=conversation.indexOf('async function renderAddressForm');
const address=conversation.slice(addressStart,addressEnd);
assert.ok(address.indexOf('placeCheckoutStageAtEnd()')>=0,'endereço salvo deve ser posicionado no turno atual da conversa');
assert.ok(address.indexOf('checkout-address-preview')>address.indexOf('placeCheckoutStageAtEnd()'),'cartão do endereço deve surgir depois do reposicionamento');
assert.ok(address.indexOf("await ask({text:'Posso entregar neste endereço?'")>address.indexOf('checkout-address-preview'),'pergunta de confirmação deve vir depois de mostrar o endereço');

const addressFormStart=conversation.indexOf('async function renderAddressForm');
const addressFormEnd=conversation.indexOf('function readAddressForm');
const addressForm=conversation.slice(addressFormStart,addressFormEnd);
assert.ok(addressForm.indexOf('placeCheckoutStageAtEnd()')>addressForm.indexOf("await say('Confira seus dados de entrega.')"),'formulário manual deve aparecer depois da mensagem de orientação');

const confirmationStart=conversation.indexOf('async function renderConfirmationStep');
const confirmationEnd=conversation.indexOf('function reserveWhatsAppWindow');
const confirmation=conversation.slice(confirmationStart,confirmationEnd);
assert.ok(confirmation.indexOf('placeCheckoutStageAtEnd()')>confirmation.indexOf("await say('Perfeito. Confira tudo antes de confirmar:')"),'confirmação final deve ser posicionada depois da mensagem');

console.log('PASS: ordem visual do checkout segue a conversa');
