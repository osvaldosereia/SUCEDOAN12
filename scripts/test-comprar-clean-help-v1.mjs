import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const file='comprar/help.js';
assert.doesNotThrow(()=>readFileSync(file,'utf8'),'help.js deve existir');
const js=readFileSync(file,'utf8');

assert.doesNotMatch(js,/window\.fetch\s*=/,'ajuda não pode interceptar fetch');
assert.doesNotMatch(js,/new\s+MutationObserver/,'ajuda não pode observar globalmente o DOM');
for(const forbidden of ['start_basket','set_quantity','basketStorefrontApi','productsApi','showBaskets','showProductsMenu']){
  assert.doesNotMatch(js,new RegExp(forbidden),`ajuda não pode conter fluxo comercial ${forbidden}`);
}
for(const id of ['helpToggle','composer','messageInput','photoInput','photoButton','micButton','sendButton']){
  assert.match(js,new RegExp(id),`ajuda deve usar ${id}`);
}
assert.match(js,/send_text/,'texto deve ir pela ação oficial send_text');
assert.match(js,/uploadMedia/,'foto e áudio devem usar o upload central');
assert.match(js,/MediaRecorder/,'ajuda deve manter gravação de áudio');
assert.match(js,/function\s+setCheckoutMode/,'checkout deve poder ocultar ajuda explicitamente');
assert.match(js,/registerModule\(['"]help['"]/,'ajuda deve ser módulo explícito');

console.log('OK: contrato de ajuda simples');
