import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const app=readFileSync('comprar/app.js','utf8');

assert.doesNotMatch(app,/window\.fetch\s*=/,'o núcleo comercial não pode sobrescrever window.fetch');
assert.doesNotMatch(app,/new\s+MutationObserver/,'o núcleo comercial não pode observar globalmente o DOM');
assert.match(app,/window\.DA_COMPRAR_APP\s*=/,'o app deve expor uma única interface central');
assert.match(app,/pendingProductSyncs/,'o estado central deve rastrear sincronizações pendentes por produto');
assert.match(app,/function\s+post\s*\(/,'o app deve possuir cliente HTTP central');
for(const name of ['api','productApi','customerApi','checkoutApi','basketStorefrontApi','setCart','registerModule','start']){
  assert.match(app,new RegExp(`\\b${name}\\b`),`interface central deve expor ${name}`);
}
for(const key of ['session','customer','baskets','selectedBasket','basketItems','cart','checkout','payment','productFilters','pendingProductSyncs']){
  assert.match(app,new RegExp(`\\b${key}\\b`),`estado central deve conter ${key}`);
}
assert.match(app,/DA_ADMIN_TEST_TRANSPORT/,'o núcleo deve aceitar transporte explícito do modo Admin V3');
assert.match(app,/confirm_order/,'o transporte de teste deve ser usado somente na confirmação do pedido');

console.log('OK: contrato arquitetural do Comprar limpo');
