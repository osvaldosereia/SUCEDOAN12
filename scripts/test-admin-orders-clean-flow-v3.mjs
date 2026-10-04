import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const backend=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const publicView=fs.readFileSync('supabase/functions/order-public-view-v1/index.ts','utf8');
const publicPage=fs.readFileSync('pedido/index.html','utf8');
const migrationPath='supabase/migrations/20261004193000_orders_clean_flow_v3.sql';
assert.equal(fs.existsSync(migrationPath),true,'Pedidos V3 precisa de migration canônica para snapshot/entrega');
for(const legacyTest of [
  'scripts/test-admin-order-expedition-ui-hotfix.mjs',
  'scripts/test-admin-order-whatsapp-three-destinations-v1.mjs'
]) assert.equal(fs.existsSync(legacyTest),false,`Contrato legado de Pedidos não deve voltar: ${legacyTest}`);
const migration=fs.readFileSync(migrationPath,'utf8');

assert.ok(!admin.includes('/vitrine/admin/orders-unified-queue-v1.js'),'Pedidos V3 não pode depender de script que sobrepõe a UI canônica');
for(const id of ['confirmReadyOrders','orderFilters','orderIssueFilters'])assert.ok(!admin.includes(`id="${id}"`),`Controle legado ${id} deve sair da tela`);
assert.ok(!admin.includes('data-order-filter="separate"'),'Filtro legado Separar deve sair da tela');
assert.ok(!admin.includes('data-order-filter="ready"'),'Filtro legado Pronto deve sair da tela');
assert.ok(!admin.includes('data-order-filter="delivery"'),'Filtro legado Entrega deve sair da tela');
assert.ok(!admin.includes('data-order-filter="finalized"'),'Filtro legado Finalizado deve sair da tela');
assert.ok(!admin.includes('Confirmar aptos'),'Confirmação em massa deve sair da tela');
assert.ok(!admin.includes('Próxima ação:'),'Coluna/linha Próxima ação deve sair da gestão V3');
assert.ok(!admin.includes('data-tab="separation"'),'Separação não pode continuar como uma segunda seção paralela de Pedidos');

assert.match(admin,/function\s+orderRow\s*\(/,'A lista deve continuar sendo renderizada pela implementação canônica do Admin');
assert.match(admin,/created_at/,'Pedidos precisam continuar ordenáveis por chegada');
assert.match(admin,/CONFIRMADO/,'Card precisa ter marco CONFIRMADO');
assert.match(admin,/SEPARADO/,'Card precisa ter marco SEPARADO');
assert.match(admin,/ENTREGUE/,'Card precisa ter marco ENTREGUE');
assert.match(admin,/ABRIR VITRINE SEPARA[CÇ][AÃ]O/i,'Card precisa abrir a separação');
assert.match(admin,/ABRIR PEDIDO/i,'Card precisa abrir o pedido');
assert.match(admin,/orders-bottom-sheet/,'Separação deve existir como bottom sheet dentro do Admin');
assert.match(admin,/data-separation-state="separated"/,'Separação precisa ter botão SEPARADO por item');
assert.match(admin,/data-separation-state="missing"/,'Separação precisa ter botão FALTOU por item');
assert.match(admin,/CONCLUIR SEPARA[CÇ][AÃ]O/i);
assert.doesNotMatch(admin,/window\.open\(`?\/?vitrine\/admin\/separacao/i,'Separação V3 não abre nova aba');

const completeStart=backend.indexOf('async function orderSeparationComplete');
assert.ok(completeStart>=0,'Backend precisa manter conclusão canônica da separação');
const completeEnd=backend.indexOf('\nasync function ',completeStart+20);
const completeBlock=backend.slice(completeStart,completeEnd>completeStart?completeEnd:backend.length);
assert.ok(!completeBlock.includes('status:"out_for_delivery"'),'Concluir separação não pode mover automaticamente para entrega');
assert.match(completeBlock,/status:"ready"/,'Concluir separação deve terminar no marco interno ready/separado');
assert.match(completeBlock,/ops2_refresh_order_public_snapshot_v1/,'Conclusão precisa atualizar a vitrine pública');

const deliveryStart=backend.indexOf('async function completeDeliveryV3');
assert.ok(deliveryStart>=0,'Backend precisa manter conclusão V3 da entrega');
const deliveryEnd=backend.indexOf('\nasync function ',deliveryStart+20);
const deliveryBlock=backend.slice(deliveryStart,deliveryEnd>deliveryStart?deliveryEnd:backend.length);
assert.match(deliveryBlock,/ops3_complete_delivery_v1/,'Entrega V3 deve confirmar pagamento e entrega atomicamente');
assert.match(deliveryBlock,/ops2_ensure_delivered_attended/,'Entrega V3 deve concluir o pedido como Atendido no Bling');
assert.match(deliveryBlock,/review_bling/,'Falha de sincronização Bling deve gerar revisão sem desfazer a entrega');

assert.match(migration,/separation_state/,'Snapshot público precisa transportar estado de separação por item');
assert.match(migration,/missing_subtotal/,'Snapshot público precisa transportar abatimento');
assert.match(migration,/original_total/,'Snapshot público precisa transportar total original');
assert.match(migration,/final_total/,'Snapshot público precisa transportar total final');
assert.match(migration,/ops3_complete_delivery_v1/,'Entrega+pagamento deve ser uma operação canônica única');
assert.match(migration,/ops3_reopen_order_v1/,'Reabertura precisa ser uma operação protegida no banco');
assert.match(migration,/release_vitrine_order_stock_v1/,'Reabertura precisa liberar a reserva antes de voltar a editar');
assert.match(migration,/status='delivered'/,'Operação de entrega deve concluir delivered');

assert.match(publicPage,/FALTOU/,'Vitrine pública precisa exibir item faltante');
assert.match(publicPage,/Valor abatido|Abatimento/,'Vitrine pública precisa mostrar abatimento quando houver');
assert.match(publicPage,/Total final/,'Vitrine pública precisa mostrar total final');
assert.ok(!publicPage.includes('SEPARATION_TAPS'),'Vitrine do cliente não pode continuar escondendo um fluxo operacional de separação');
assert.ok(!publicPage.includes('completeSeparation'),'Vitrine do cliente é somente acompanhamento do pedido');
assert.ok(!publicView.includes('complete_separation'),'Endpoint público não pode aceitar conclusão operacional de separação');
assert.match(publicView,/req\.method!=="GET"|req\.method != "GET"/,'Endpoint público V3 deve ser somente leitura');

const detailStart=admin.indexOf('function paintOrderDetail');
assert.ok(detailStart>=0,'Pedido aberto precisa continuar no Admin canônico');
const detailEnd=admin.indexOf('\n  function ',detailStart+30);
const detailBlock=admin.slice(detailStart,detailEnd>detailStart?detailEnd:admin.length);
assert.match(detailBlock,/VITRINE CLIENTE/i,'Vitrine Cliente deve ficar dentro do pedido aberto');
assert.match(detailBlock,/REABRIR PEDIDO/i,'Pedido confirmado ainda não separado deve poder ser reaberto com segurança');
assert.ok(!detailBlock.includes('Diagnóstico da integração'),'Pedido aberto não deve expor diagnóstico ERP/Bling no fluxo normal');
assert.ok(!detailBlock.includes('Antes de separar, revise o Bling'),'Bling não deve bloquear separação na UI V3');
assert.match(detailBlock,/o\.status===['"]delivered['"]/,'Fiscal só deve aparecer/ser operado depois de entregue');

assert.match(admin,/Forma prevista/,'Entrega deve mostrar forma prevista de pagamento');
assert.match(admin,/Forma recebida/,'Entrega deve permitir registrar forma recebida');
assert.match(admin,/Valor recebido/,'Entrega deve confirmar o valor recebido');
assert.match(admin,/CONFIRMAR ENTREGA/,'Entrega e pagamento devem ser confirmados numa única ação');
assert.match(backend,/order_delivery_complete_v3/,'Admin backend precisa expor a entrega+pagamento V3');
assert.match(backend,/order_reopen_v3/,'Admin backend precisa expor a reabertura segura V3');

console.log('orders clean flow v3 contract: ok');
