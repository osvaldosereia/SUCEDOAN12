import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const backend=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const blingBridge=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const migrationPath='supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql';

assert.equal(fs.existsSync(migrationPath),true,'Pedidos V4 precisa da migration canônica de prontidão fiscal/saída/entrega');
const migration=fs.readFileSync(migrationPath,'utf8');

// Banco: emissão fiscal após separação; saída/entrega exigem autorização fiscal.
for(const fn of ['refresh_order_fiscal_readiness_v1','preview_bling_invoice_eligibility_v1','ops2_fiscal_dispatch_preflight_v1','ops4_start_dispatch_v1','ops3_complete_delivery_v1']){
  assert.ok(migration.includes(fn),`Migration V4 precisa definir ${fn}`);
}
assert.match(migration,/dispatch_fiscal_status[^;]*authorized|authorized[^;]*dispatch_fiscal_status/s,'Saída/entrega precisa exigir fiscal autorizado');
assert.match(migration,/order_payment_settlements/,'Entrega continua exigindo settlement real');
assert.match(migration,/order_separation_completions_v1/,'Prontidão fiscal precisa conhecer a separação concluída');
assert.match(migration,/stock_applied/,'Prontidão fiscal precisa exigir estoque da separação aplicado');
assert.match(migration,/payment_required_for_invoice'\s*,\s*false/,'Pagamento real não pode ser pré-requisito para emitir a NF-e');

const dispatchStart=migration.indexOf('create or replace function public.ops4_start_dispatch_v1');
assert.ok(dispatchStart>=0,'Migration precisa criar a operação canônica de saída V4');
const dispatchEnd=migration.indexOf('create or replace function public.ops3_complete_delivery_v1',dispatchStart);
const dispatchBlock=migration.slice(dispatchStart,dispatchEnd>dispatchStart?dispatchEnd:migration.length);
assert.match(dispatchBlock,/dispatch_fiscal_status\s+not\s+in\s*\(\s*'authorized'\s*,\s*'not_required'\s*\)/i,'SAIU PARA ENTREGA deve exigir autorização fiscal mesmo se o runtime estiver em observe');

const deliveryStart=migration.indexOf('create or replace function public.ops3_complete_delivery_v1');
const deliveryBlock=migration.slice(deliveryStart);
assert.match(deliveryBlock,/order_not_out_for_delivery/,'Entrega nova só pode ocorrer depois da saída física');
assert.match(deliveryBlock,/fiscal_authorization_required_before_delivery/,'Entrega deve exigir autorização fiscal antes de criar settlement');
assert.match(deliveryBlock,/dispatch_not_started/,'Entrega deve exigir marco de saída persistido');
assert.match(migration,/out_for_delivery/,'Pedidos legados em rota precisam continuar reconhecidos');
assert.match(migration,/delivered/,'Pedidos legados entregues precisam continuar reconciliáveis/idempotentes');

// Backend Admin: uma única orquestração, sobre a ponte Bling existente.
for(const action of ['order_fiscal_status','order_fiscal_issue_v4','order_dispatch_start_v4','delivery_fail_register']){
  assert.ok(backend.includes(action),`Backend Admin precisa expor ${action}`);
}
for(const fn of ['orderFiscalStatusV4','orderFiscalIssueV4','orderDispatchStartV4']){
  assert.ok(backend.includes(`function ${fn}`)||backend.includes(`async function ${fn}`),`Backend precisa implementar ${fn}`);
}
assert.match(backend,/fiscal_dispatch_canary_human_execute/,'Emissão V4 deve reutilizar a execução fiscal humana canônica do Bling');
assert.match(backend,/ops2_launch_physical_stock/,'Saída V4 deve manter a baixa física canônica no Bling quando ele é a autoridade');
assert.match(backend,/ops4_start_dispatch_v1/,'Saída V4 precisa usar RPC canônica depois da baixa física');
assert.match(backend,/ops3_complete_delivery_v1/,'Entrega V4 deve preservar a operação atômica de pagamento+entrega');
assert.doesNotMatch(backend,/ready:\["delivered"/,'order_update genérico não pode pular NF-e/saída indo direto de ready para delivered');
assert.ok(!fs.existsSync('scripts/_apply_orders_v4_backend_patch.mjs'),'Patch temporário do backend não pode permanecer no produto');
assert.ok(!fs.existsSync('.github/workflows/_temp-orders-v4-backend-patch.yml'),'Workflow temporário de patch não pode permanecer no produto');
assert.ok(!fs.existsSync('scripts/_apply_orders_v4_ui_patch.mjs'),'Patch temporário da UI não pode permanecer no produto');
assert.ok(!fs.existsSync('.github/workflows/_temp-orders-v4-ui-patch.yml'),'Workflow temporário da UI não pode permanecer no produto');
assert.ok(!fs.existsSync('scripts/_fix_orders_v4_browser_syntax.mjs'),'Corretor temporário de sintaxe não pode permanecer no produto');
assert.ok(!fs.existsSync('.github/workflows/_temp-orders-v4-browser-syntax-fix.yml'),'Workflow temporário de sintaxe não pode permanecer no produto');
assert.ok(!fs.existsSync('scripts/_apply_orders_v4_tag_styles.mjs'),'Patch temporário de estilos não pode permanecer no produto');
assert.ok(!fs.existsSync('.github/workflows/_temp-orders-v4-tag-styles.yml'),'Workflow temporário de estilos não pode permanecer no produto');

// Bridge Bling: geração a partir do Pedido de Venda existente, reconciliação antes de POST e DANFE.
assert.match(blingBridge,/blingHubVitrineDispatchFiscalPreview/,'Bridge Bling precisa manter o preflight fiscal existente');
assert.match(blingBridge,/\/pedidos\/vendas\/.*\/gerar-nfe/s,'Bridge deve gerar NF-e a partir do pedido de venda já sincronizado');
assert.match(blingBridge,/blingHubFindNfeByExternalKey/,'Bridge deve reconciliar NF-e existente antes de gerar outra');
assert.match(blingBridge,/blingHubVitrineDanfePdf/,'Bridge deve manter o DANFE canônico');

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
assert.match(admin,/\.order-v3-tag\.warn\s*\{/,'Estado fiscal de atenção precisa de estilo próprio');
assert.match(admin,/\.order-v3-tag\.danger\s*\{/,'NF-e rejeitada precisa de estilo visual de perigo próprio');
assert.match(admin,/\.order-v3-tag\.ok\s*\{/,'NF-e autorizada precisa de estilo visual de sucesso próprio');

const detailStart=admin.indexOf('function paintOrderDetail(){');
const detailEnd=admin.indexOf('\n  function blingPreflightOperationalBlockers',detailStart);
assert.ok(detailStart>=0&&detailEnd>detailStart,'Teste precisa localizar o pedido aberto canônico');
const detailBlock=admin.slice(detailStart,detailEnd);
assert.match(detailBlock,/\['ready','out_for_delivery','delivered'\]\.includes\(o\.status\)[\s\S]*orderFiscalHtml/,'Pedido aberto deve mostrar Fiscal / NF-e desde SEPARADO/ready');
assert.doesNotMatch(detailBlock,/milestones\.separated&&!milestones\.delivered&&!milestones\.cancelled[\s\S]{0,240}deliverOrderV3/,'Pedido SEPARADO ainda não pode oferecer CONFIRMAR ENTREGA antes da saída');
assert.match(detailBlock,/o\.status==='out_for_delivery'[\s\S]{0,420}deliverOrderV3/,'CONFIRMAR ENTREGA só deve aparecer depois de SAIU PARA ENTREGA');
assert.match(detailBlock,/deliveryFailedV4[\s\S]{0,180}ENTREGA NÃO CONCLUÍDA/,'Pedido em rota precisa oferecer ENTREGA NÃO CONCLUÍDA no pedido aberto');
assert.match(detailBlock,/startDispatchV4/,'Pedido aberto autorizado precisa ligar a ação SAIU PARA ENTREGA');

console.log('orders fiscal flow v4 contract: ok');
