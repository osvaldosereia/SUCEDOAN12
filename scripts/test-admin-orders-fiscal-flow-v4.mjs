import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const backend=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const blingBridge=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const migrationPath='supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql';

assert.equal(
  fs.existsSync(migrationPath),
  true,
  'Pedidos V4 precisa da migration canônica de prontidão fiscal/saída/entrega'
);
const migration=fs.readFileSync(migrationPath,'utf8');

// Banco: emissão fiscal passa a depender da separação concluída e a saída/entrega da autorização.
for(const fn of [
  'refresh_order_fiscal_readiness_v1',
  'preview_bling_invoice_eligibility_v1',
  'ops2_fiscal_dispatch_preflight_v1',
  'ops4_start_dispatch_v1',
  'ops3_complete_delivery_v1'
]) assert.ok(migration.includes(fn),`Migration V4 precisa definir ${fn}`);
assert.match(migration,/dispatch_fiscal_status[^;]*authorized|authorized[^;]*dispatch_fiscal_status/s,'Saída/entrega precisa exigir fiscal autorizado');
assert.match(migration,/out_for_delivery/,'Saída física precisa persistir o estado operacional existente');
assert.match(migration,/order_payment_settlements/,'Entrega continua exigindo settlement real');
assert.match(migration,/order_separation_completions_v1/,'Prontidão fiscal precisa conhecer a separação concluída');
assert.match(migration,/stock_applied/,'Prontidão fiscal precisa exigir estoque da separação aplicado');
assert.match(migration,/payment_required_for_invoice'\s*,\s*false/,'Pagamento real não pode ser pré-requisito para emitir a NF-e');

const dispatchStart=migration.indexOf('create or replace function public.ops4_start_dispatch_v1');
assert.ok(dispatchStart>=0,'Migration precisa criar a operação canônica de saída V4');
const dispatchEnd=migration.indexOf('create or replace function public.ops3_complete_delivery_v1',dispatchStart);
const dispatchBlock=migration.slice(dispatchStart,dispatchEnd>dispatchStart?dispatchEnd:migration.length);
assert.match(
  dispatchBlock,
  /dispatch_fiscal_status\s+not\s+in\s*\(\s*'authorized'\s*,\s*'not_required'\s*\)/i,
  'SAIU PARA ENTREGA deve exigir autorização fiscal mesmo se o runtime estiver em observe'
);

const deliveryStart=migration.indexOf('create or replace function public.ops3_complete_delivery_v1');
const deliveryBlock=migration.slice(deliveryStart);
assert.match(deliveryBlock,/order_not_out_for_delivery/,'Entrega nova só pode ocorrer depois da saída física');
assert.match(deliveryBlock,/fiscal_authorization_required_before_delivery/,'Entrega deve exigir autorização fiscal antes de criar settlement');
assert.match(deliveryBlock,/dispatch_not_started/,'Entrega deve exigir marco de saída persistido');

// Compatibilidade: estados antigos continuam reconhecidos, sem forçar reexecução do novo fluxo.
assert.match(migration,/out_for_delivery/,'Pedidos legados em rota precisam continuar reconhecidos');
assert.match(migration,/delivered/,'Pedidos legados entregues precisam continuar reconciliáveis/idempotentes');

// Backend Admin: manter uma única orquestração, reaproveitando a ponte Bling existente.
for(const action of ['order_fiscal_status','order_fiscal_issue_v4','order_dispatch_start_v4','delivery_fail_register']){
  assert.ok(backend.includes(action),`Backend Admin precisa expor ${action}`);
}
assert.match(backend,/order_fiscal_issue_v4/,'Emissão V4 precisa existir no backend canônico');
assert.match(backend,/ops4_start_dispatch_v1/,'Saída física V4 precisa usar RPC canônica');
assert.match(backend,/ops3_complete_delivery_v1/,'Entrega V4 deve preservar a operação atômica de pagamento+entrega');

// Bridge Bling: usar o mecanismo já existente, sem criar uma segunda integração fiscal paralela.
assert.match(blingBridge,/blingHubVitrineDispatchFiscalPreview/,'Bridge Bling precisa manter o preflight fiscal existente');
assert.match(blingBridge,/fiscal_dispatch|nfe/i,'Bridge Bling precisa manter a integração fiscal canônica');

// UI: depois de SEPARADO, a próxima etapa é fiscal, não entrega.
assert.match(admin,/NF-e PENDENTE/i,'Card/pedido aberto precisa tornar a pendência fiscal visível');
assert.match(admin,/NF-e AUTORIZADA/i,'Card/pedido aberto precisa tornar a autorização fiscal visível');
assert.match(admin,/EMITIR NF-e/i,'Pedido separado precisa oferecer emissão humana de NF-e');
assert.match(admin,/SAIU PARA ENTREGA/i,'Saída física precisa ser um marco explícito depois da autorização');
assert.match(admin,/ENTREGA NÃO CONCLUÍDA|NÃO ENTREGUE/i,'Fluxo precisa expor insucesso de entrega sem presumir pagamento');
assert.match(admin,/Forma prevista/i,'Entrega continua mostrando a forma prevista');
assert.match(admin,/Forma recebida/i,'Entrega continua registrando a forma realmente recebida');
assert.match(admin,/CONFIRMAR ENTREGA/i,'Entrega e pagamento continuam confirmados juntos');
assert.match(admin,/order-v3-tag[^}]*font-size:(?:12|13|14|15|16)px/s,'Tags operacionais precisam ser maiores/legíveis');

console.log('orders fiscal flow v4 contract: ok');
