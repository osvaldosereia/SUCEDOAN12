import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const conversation=readFileSync('comprar/conversation.js','utf8');
const checkoutEdge=readFileSync('supabase/functions/shopping-checkout-v2/index.ts','utf8');
const duplicatePhoneFix=readFileSync('supabase/migrations/20260919154108_fix_web_checkout_duplicate_phone_binding_v1.sql','utf8');

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

assert.match(duplicatePhoneFix,/p_customer_id<>coalesce\(v_session\.customer_id,v_pending\)/,'cliente informado precisa continuar limitado ao cliente já vinculado ou localizado pela sessão');
assert.match(duplicatePhoneFix,/v_phone_owned_by_customer/,'checkout precisa reconhecer quando o cliente autorizado já é dono do telefone normalizado');
assert.match(duplicatePhoneFix,/v_conflict is not null[\s\S]{0,160}not v_phone_owned_by_customer/,'conflito só pode bloquear quando o telefone não pertence ao cliente autorizado');
assert.match(duplicatePhoneFix,/elsif v_conflict is null then[\s\S]{0,260}primary_whatsapp_e164=v_phone/,'telefone só deve ser reatribuído quando não existe outro cadastro conflitante');
assert.match(duplicatePhoneFix,/if v_conflict is null then[\s\S]{0,520}insert into public\.customer_phones/,'duplicidade legada não deve reatribuir customer_phones durante o checkout');

console.log('comprar_confirm_order_resilience_v1_ok');
