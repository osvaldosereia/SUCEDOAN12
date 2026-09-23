import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const vitrineAdmin=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const dispatch=fs.readFileSync('supabase/migrations/20260923151500_bling_hub_v2_supabase_dispatch_cycle.sql','utf8');
const canary=fs.readFileSync('supabase/migrations/20260923134500_bling_hub_v2_canary_gate.sql','utf8');
const webhook=fs.readFileSync('supabase/migrations/20260923153000_bling_hub_v2_webhook_inbox.sql','utf8');
const stockCoalesce=fs.readFileSync('supabase/migrations/20260923154000_bling_hub_v2_stock_queue_coalesce.sql','utf8');

assert.match(admin,/Make permanecem preservados/,'admin deve informar que Make foi preservado');
assert.match(admin,/Verificar prévia Bling/,'pedido deve ter prévia Bling');
assert.match(admin,/bling_preview_order_sync/,'admin deve chamar preview somente leitura');
assert.match(admin,/Pedidos vinculados/,'painel Bling deve exibir pedidos vinculados');
assert.match(admin,/Webhooks Bling/,'painel deve exibir caixa de entrada de webhooks');
assert.match(admin,/Fiscal \/ NF-e/,'painel deve exibir readiness fiscal');
assert.doesNotMatch(admin,/Enviar (?:pedido )?ao Bling/i,'admin não deve oferecer envio manual nesta fase');

assert.match(vitrineAdmin,/async function buildBlingOrderSnapshot/);
assert.match(vitrineAdmin,/sale_price_cents/,'cesta deve conseguir congelar preço pelo catálogo');
assert.match(vitrineAdmin,/catalog_at_separation/,'snapshot deve registrar origem do preço');
assert.match(vitrineAdmin,/queue_reason:reason/);
assert.match(vitrineAdmin,/first_separation/);
assert.match(vitrineAdmin,/preview_order_sync/);
assert.match(vitrineAdmin,/syncVitrineOrderHistory\(db,id,ORG_ID\)[\s\S]{0,500}queueBlingOrderSnapshot/,'cliente deve ser resolvido antes de enfileirar pedido');

assert.match(hub,/async function blingHubPreviewOrderSync/);
assert.match(hub,/async function blingHubProcessOrderJobs/);
assert.match(hub,/write_eligible/);
assert.match(hub,/first_separation_required/);
assert.match(hub,/stock_not_consumed/);
assert.match(hub,/minimum_order_not_met/);
assert.match(hub,/order_cancelled/);
assert.match(hub,/blingHubFindOrderByExternalKey/);
assert.match(hub,/duplicate_external_order_key/);
assert.match(hub,/order_creation_uncertain/);
assert.match(hub,/post_create_order_mismatch/);
assert.match(hub,/first_order_canary/);
assert.match(hub,/order_canary_passed/);
assert.match(hub,/order_canary_paused/);
assert.match(hub,/paused_after_canary_failure/);
assert.match(hub,/firstOrderCanary\?1:requestedLimit/,'primeiro pedido deve limitar worker a um único job');
assert.match(hub,/orders_enabled:false/,'falha insegura do primeiro canário deve desligar pedidos');
assert.match(hub,/external_write:false/);
assert.match(hub,/x-bling-signature-256/);
assert.match(hub,/blingWebhookHmacHex/);
assert.match(hub,/blingWebhookConstantTimeEqual/);
assert.match(hub,/bling-webhook-v2/);
assert.match(hub,/claim_bling_webhook_inbox_v2/);
assert.match(hub,/self_generated_observed/);
assert.match(hub,/local_mutation:false/);
assert.match(hub,/fiscal_readiness/);
assert.match(hub,/bling_invoice_prepare_enabled/);
assert.match(hub,/bling_invoice_send_enabled/);
assert.match(hub,/external_side_effect/);

assert.match(canary,/bling_hub_canary_allowlist_v2/);
assert.match(canary,/v_runtime\.mode='homologation'/);
assert.match(canary,/exists\([\s\S]*bling_hub_canary_allowlist_v2/);

assert.match(dispatch,/hub_enabled=true/,'cron deve falhar fechado se Hub estiver OFF');
assert.match(dispatch,/mode in \('homologation','live'\)/);
assert.match(dispatch,/bling-hub-v2-cycle/);
assert.match(dispatch,/\*\/2 \* \* \* \*/);

assert.match(webhook,/create table if not exists public\.bling_webhook_inbox_v2/);
assert.match(webhook,/event_id text primary key/);
assert.match(webhook,/claim_bling_webhook_inbox_v2/);
assert.match(webhook,/v_runtime\.webhooks_enabled is not true/);
assert.match(webhook,/status in \('held','received','retry'\)/);

assert.match(stockCoalesce,/p_domain='stock' and trim\(p_operation\)='set_stock'/);
assert.match(stockCoalesce,/superseded_stock_snapshot/);
assert.match(stockCoalesce,/status='pending'/);
assert.match(stockCoalesce,/attempts=0/);

const match=admin.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
assert.ok(match,'script inline do admin não encontrado');
new Function(match[1]);

console.log('OK vitrine Bling Hub V2: UI, snapshot, gates, idempotência e cron protegidos.');
