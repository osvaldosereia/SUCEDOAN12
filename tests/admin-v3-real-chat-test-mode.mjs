import assert from 'node:assert/strict';
import fs from 'node:fs';

const required=[
  'admin-v3/atendimento.html',
  'admin-v3/chat-real-test.js',
  'admin-v3/chat-real-test.css',
  'comprar/index.html',
  'comprar/config.js',
  'comprar/admin-test-bridge.js',
  'supabase/functions/shopping-chat-admin-test-v1/index.ts',
  'supabase/migrations/20260914162000_shopping_chat_admin_test_preview_v1.sql'
];
for(const file of required) assert.ok(fs.existsSync(file),`faltando ${file}`);

const admin=fs.readFileSync('admin-v3/atendimento.html','utf8');
const controller=fs.readFileSync('admin-v3/chat-real-test.js','utf8');
const css=fs.readFileSync('admin-v3/chat-real-test.css','utf8');
const buy=fs.readFileSync('comprar/index.html','utf8');
const config=fs.readFileSync('comprar/config.js','utf8');
const bridge=fs.readFileSync('comprar/admin-test-bridge.js','utf8');
const edge=fs.readFileSync('supabase/functions/shopping-chat-admin-test-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260914162000_shopping_chat_admin_test_preview_v1.sql','utf8');

assert.match(admin,/id=["']testChatFrame["']/,'aba Testar deve conter o Chat Comprar real');
assert.match(admin,/id=["']testNewSession["']/,'deve permitir iniciar novo teste isolado');
assert.match(admin,/id=["']testDiagnostics["']/,'deve mostrar diagnóstico do teste');
assert.match(admin,/allow=["'][^"']*microphone[^"']*camera[^"']*geolocation/i,'iframe deve permitir testar áudio, foto e localização');
assert.match(admin,/chat-real-test\.js/);
assert.match(admin,/chat-real-test\.css/);

assert.match(controller,/admin_test=1/,'teste deve abrir Comprar em modo admin_test');
assert.match(controller,/da-admin-test-auth/,'Admin deve entregar autenticação ao iframe por postMessage');
assert.match(controller,/da-admin-test-diagnostic/,'Admin deve receber diagnóstico do chat real');
assert.match(controller,/const\s+esc\s*=|function\s+esc\s*\(/,'diagnóstico deve escapar texto antes de montar HTML');
assert.match(controller,/esc\(e\.error/,'mensagens de erro do diagnóstico devem ser escapadas');
assert.doesNotMatch(controller,/access_token=.*admin_test|admin_test=.*access_token/i,'token admin não pode ir na URL');

assert.match(buy,/admin-test-bridge\.js/,'Comprar deve carregar o adaptador de teste');
assert.match(bridge,/admin_test/);
assert.match(bridge,/adminTestApi/,'confirm_order de teste deve usar API administrativa separada');
assert.match(bridge,/DA_ADMIN_TEST_TRANSPORT/,'bridge deve expor transporte explícito para o núcleo do Comprar');
assert.match(bridge,/confirmOrder/,'transporte deve expor apenas confirmação de pedido');
assert.match(bridge,/Authorization/,'API administrativa deve receber Bearer token fora da URL');
assert.match(bridge,/da-admin-test-ready/);
assert.match(bridge,/da-admin-test-diagnostic/);
assert.doesNotMatch(bridge,/window\.fetch\s*=/,'modo de teste não pode interceptar fetch global');
assert.doesNotMatch(bridge,/new\s+MutationObserver/,'modo de teste não pode corrigir DOM por observer global');
assert.match(config,/adminTestApi:\s*['"][^'"]+shopping-chat-admin-test-v1/);

assert.match(edge,/auth\.getUser/,'API de teste deve validar JWT do Admin');
assert.match(edge,/admin_users/,'API de teste deve exigir usuário administrativo ativo');
assert.match(edge,/room_confirm_order_preview_v1/,'API de teste deve usar confirmação dry-run');
assert.match(edge,/payment_method_required/);
assert.doesNotMatch(edge,/room_confirm_order\s*['"`)]|confirm_cart_order/,'API de teste não pode criar pedido real');

assert.match(migration,/create or replace function public\.room_confirm_order_preview_v1/i);
assert.match(migration,/customer_identification_required/);
assert.match(migration,/customer_document_required/);
assert.match(migration,/delivery_address_required/);
assert.match(migration,/empty_cart/);
assert.doesNotMatch(migration,/insert\s+into\s+public\.orders|confirm_cart_order\s*\(/i,'dry-run não pode inserir/converter pedido');
assert.match(migration,/revoke execute on function public\.room_confirm_order_preview_v1/i);
assert.match(migration,/grant execute on function public\.room_confirm_order_preview_v1[^;]+service_role/i);

assert.match(css,/chat-real-test-frame/);
console.log('admin real Chat Comprar test mode contract ok');
