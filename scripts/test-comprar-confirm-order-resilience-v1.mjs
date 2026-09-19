import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const conversation=readFileSync('comprar/conversation.js','utf8');
const checkoutEdge=readFileSync('supabase/functions/shopping-checkout-v2/index.ts','utf8');

const finalAction=conversation.match(/async function confirmAndSend[\s\S]*?(?=\n\s*function renderSuccess)/)?.[0]||'';
assert.match(finalAction,/checkoutApi\('finalize_order',payload\)/,'confirmação deve usar uma única chamada final ao checkout');
assert.doesNotMatch(finalAction,/customerApi\('commit_customer'/,'browser não deve depender de commit_customer separado no clique final');
assert.doesNotMatch(finalAction,/checkoutApi\('save_address'/,'browser não deve depender de save_address separado no clique final');
assert.doesNotMatch(finalAction,/api\('set_payment'/,'browser não deve depender de set_payment separado no clique final');
assert.match(finalAction,/app\.markOrderCompleted\(data\)/,'estado local deve ser encerrado somente após persistência');
assert.match(finalAction,/toast\(message\)/,'falha precisa ser visível para o cliente');

assert.match(checkoutEdge,/action==='finalize_order'/,'backend deve expor finalização consolidada');
assert.match(checkoutEdge,/room_commit_web_customer_v1/,'finalização deve vincular cliente');
assert.match(checkoutEdge,/room_save_address_v2/,'finalização deve persistir endereço');
assert.match(checkoutEdge,/room_confirm_web_order_v2/,'finalização deve persistir pedido e pagamento');
assert.match(checkoutEdge,/session\.status==='closed'&&isFinalAction/,'retry deve recuperar pedido já persistido');
assert.match(checkoutEdge,/catalog_session_id/,'recuperação idempotente deve usar a sessão do catálogo');
assert.match(conversation,/data-open-saved-whatsapp/,'sucesso deve oferecer fallback manual para abrir WhatsApp');

console.log('comprar_confirm_order_resilience_v1_ok');
