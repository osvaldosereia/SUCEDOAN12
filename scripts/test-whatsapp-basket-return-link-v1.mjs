import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync('cesta/whatsapp-return.js','utf8');
const html=readFileSync('cesta/index.html','utf8');
const api=readFileSync('supabase/functions/basket-shop-v1/index.ts','utf8');

assert.match(js,/whatsapp:\/\/send\?phone=\$\{WHATSAPP_PHONE\}/,'mobile deve abrir diretamente o app do WhatsApp');
assert.doesNotMatch(js,/api\.whatsapp\.com\/send/,'mobile não deve cair na landing page api.whatsapp.com');
assert.match(js,/https:\/\/web\.whatsapp\.com\/send\?phone=\$\{WHATSAPP_PHONE\}/,'desktop deve usar WhatsApp Web');
assert.match(js,/body:JSON\.stringify\(\{action:"return",token,intent\}\)/,'registro de retorno deve ocorrer no backend antes da navegação');
assert.match(js,/if\(!response\.ok\|\|!data\.ok\)throw/,'retorno só pode navegar depois de confirmação do backend');
assert.match(js,/stopImmediatePropagation/,'helper deve impedir handler concorrente no clique de envio');
assert.match(js,/extras_done/,'fluxo de adicionais deve continuar sinalizando extras_done');
assert.match(js,/whatsappReturnFallback/,'se o deep link não abrir deve existir fallback visual');
assert.match(js,/whatsappReturnLink/,'fallback deve ser link real acionado por gesto do usuário');
assert.match(js,/Voltar ao WhatsApp/,'fallback deve ter CTA explícito');
assert.match(js,/voltar\\s\+para\\s\+cesta/i,'helper não pode interceptar retorno da vitrine de substituição');
assert.match(html,/whatsapp-return\.js\?v=\d+/,'helper versionado deve estar carregado na página da cesta');
assert.match(api,/action==="return"/,'API precisa aceitar retorno explícito da vitrine');
assert.match(api,/complete_whatsapp_basket_storefront_v1/,'backend determinístico deve concluir a seleção antes do retorno');
assert.match(api,/checkout_queued:Boolean\(data\?\.queued\)/,'API deve expor se o checkout foi enfileirado');

const postIndex=js.indexOf('body:JSON.stringify({action:"return",token,intent})');
const responseIndex=js.indexOf('if(!response.ok||!data.ok)');
const navIndex=js.indexOf('returnToConversation();');
assert.ok(postIndex>=0,'registro de retorno precisa existir');
assert.ok(responseIndex>postIndex,'resposta do backend precisa ser validada após o POST');
assert.ok(navIndex>responseIndex,'navegação só pode ocorrer depois da confirmação do backend');

console.log('PASS: retorno da vitrine salva no backend e abre o app do WhatsApp no mobile.');
