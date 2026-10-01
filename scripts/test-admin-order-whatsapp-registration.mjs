import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(p)=>fs.readFileSync(p,'utf8');
const exists=(p)=>fs.existsSync(p);

const adminApi=read('supabase/functions/admin-products-live-v1/index.ts');
const storefront=read('supabase/functions/storefront-v2/index.ts');
const adminHtml=read('vitrine/admin/index.html');
const registrationHtml=read('cadastro/index.html');

const tokenSql='supabase/sql/20261001_order_registration_link_v1.sql';
const outboxSql='supabase/sql/20261001_admin_order_whatsapp_outbox_v1.sql';
const claimSql='supabase/sql/20261001_admin_order_whatsapp_claim_order_v1.sql';
const outbound='supabase/functions/admin-orders-v1/index.ts';

assert.ok(exists(tokenSql),'missing order registration token migration');
assert.ok(exists(outboxSql),'missing admin order whatsapp outbox migration');
assert.ok(exists(claimSql),'missing order-scoped outbox claim migration');
assert.ok(exists(outbound),'missing reused admin orders whatsapp gateway');
assert.ok(!exists('supabase/functions/whatsapp-order-outbound-v1/index.ts'),'must not consume an extra Edge Function slot');

const token=read(tokenSql);
const outbox=read(outboxSql);
const claim=read(claimSql);
const gateway=read(outbound);

for(const name of ['ops2_issue_order_registration_link_v1','ops2_resolve_order_registration_link_v1','ops2_consume_order_registration_link_v1']) assert.ok(token.includes(name),`missing ${name}`);
assert.match(token,/digest\s*\([^)]*sha256/i,'token must be stored/compared through SHA-256 digest');
assert.match(token,/interval\s+'24 hours'/i,'token must expire in 24 hours');
assert.match(token,/consumed_at/i,'token must be single use');
assert.match(token,/phone_e164/i,'token must be bound to phone');
assert.match(token,/customer_id/i,'token consume must link customer');
assert.match(token,/order_already_linked/i,'must guard reassignment to a different customer');
assert.match(token,/token_expired/i,'must reject expired token');
assert.match(token,/token_already_used/i,'must reject token reuse');
assert.match(token,/phone_mismatch/i,'must reject a different phone');

assert.ok(storefront.includes('order_token'),'storefront customer_register must accept order_token');
assert.ok(storefront.includes('ops2_consume_order_registration_link_v1'),'storefront must consume order token after registration');
assert.match(outbox,/recipient_kind/i,'outbox needs recipient_kind');
assert.match(outbox,/unique\s*\(\s*order_id\s*,\s*message_kind\s*,\s*recipient_kind\s*\)/i,'outbox must be idempotent per recipient');
assert.ok(outbox.includes('ops2_enqueue_admin_order_whatsapp_v1'),'missing manual admin enqueue RPC');
assert.ok(outbox.includes('ops_0975'),'missing operational recipient');
assert.ok(outbox.includes('+5565998150975'),'missing operational phone');
assert.match(outbox,/channel_origin[^\n]*1018|['"]1018['"]/i,'operational copy must use 1018');
assert.match(outbox,/q\.status='failed'\s+then\s+'pending'/i,'failed messages must be safely requeued');
assert.ok(claim.includes('ops2_claim_order_whatsapp_outbox_v1'),'gateway must claim only requested order');

assert.ok(gateway.includes('PAPOAI_ORDER_TEMPLATE_WEBHOOK_0975_URL'),'missing provider slot 0975');
assert.ok(gateway.includes('PAPOAI_ORDER_TEMPLATE_WEBHOOK_1018_URL'),'missing provider slot 1018');
assert.ok(gateway.includes('service:"admin-orders-v1"'),'gateway must use the retired admin-orders-v1 slot');
assert.ok(!gateway.includes('https://app.papoai.net/'),'must not hardcode PapoAI webhook URL');
assert.ok(gateway.includes('provider_ambiguous_failure'),'gateway must mark ambiguous provider failure');
assert.ok(gateway.includes('providerReadiness'),'gateway must expose provider readiness');
assert.match(gateway,/if\(!readiness\.ready\)return respond\(\{ok:false,error:"provider_not_configured"/,'gateway must fail closed before claiming queue items');

for(const action of ['order_whatsapp_send','order_registration_link_issue','order_registration_link_status']) assert.ok(adminApi.includes(action),`admin API missing ${action}`);
assert.ok(adminApi.includes('ops2_enqueue_admin_order_whatsapp_v1'),'admin send action must call enqueue RPC');
assert.ok(adminApi.includes('ops2_issue_order_registration_link_v1'),'admin link issue action must call token RPC');
assert.ok(adminApi.includes('orderWhatsappGatewayReadiness'),'admin must check gateway readiness');
assert.ok(adminApi.includes('/functions/v1/admin-orders-v1'),'admin must use reused gateway slot');
assert.ok(adminApi.includes('order_whatsapp_provider_not_configured'),'admin must fail closed when template providers are missing');

for(const copy of ['WhatsApp e cadastro','Enviar pedido no WhatsApp','Gerar link de cadastro','Abrir WhatsApp com link','Copiar link']) assert.ok(adminHtml.includes(copy),`admin UI missing: ${copy}`);
assert.ok(adminHtml.includes("api('order_whatsapp_send'"),'admin UI must call order_whatsapp_send');
assert.ok(adminHtml.includes("api('order_registration_link_issue'"),'admin UI must call order_registration_link_issue');
assert.ok(adminHtml.includes('Envio do pedido aguardando configuração PapoAI'),'UI must explain disabled order sending');
assert.ok(adminHtml.includes("activeLink=link?.state==='active'"),'UI must prevent accidental active-link replacement');
assert.ok(!adminHtml.includes('/cadastro/?order_id='),'public link must not expose order_id');

assert.ok(registrationHtml.includes('order_token'),'registration page must preserve order_token');
assert.ok(registrationHtml.includes('resolve_order_token'),'registration page must resolve order token before submit');
assert.ok(registrationHtml.includes('order_token:savedOrderToken'),'registration page must submit order token');

console.log('admin order whatsapp registration contract OK');
