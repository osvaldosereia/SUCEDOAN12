import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const backend=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const publicView=fs.readFileSync('supabase/functions/order-public-view-v1/index.ts','utf8');
const publicPage=fs.readFileSync('p/index.html','utf8');

assert.ok(!admin.includes('/vitrine/admin/orders-unified-queue-v1.js'),'Pedidos V3 não pode depender de script que sobrepõe a UI canônica');
for(const id of ['confirmReadyOrders','orderFilters','orderIssueFilters'])assert.ok(!admin.includes(`id="${id}"`),`Controle legado ${id} deve sair da tela`);
for(const text of ['Confirmar aptos','Próxima ação:','Todos</button><button','Separar</button><button','Pronto</button><button','Entrega</button><button','Finalizado</button>'])assert.ok(!admin.includes(text),`Fluxo legado ainda presente: ${text}`);

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
assert.ok(!completeBlock.includes('out_for_delivery'),'Concluir separação não pode mover automaticamente para entrega');
assert.match(completeBlock,/ops2_refresh_order_public_snapshot_v1/,'Conclusão precisa atualizar a vitrine pública');

assert.match(publicPage,/FALTOU/,'Vitrine pública precisa exibir item faltante');
assert.match(publicPage,/Valor abatido|Abatimento/,'Vitrine pública precisa mostrar abatimento quando houver');
assert.match(publicPage,/Total final/,'Vitrine pública precisa mostrar total final');
assert.match(publicView,/separation_state|missing_subtotal|final_total/,'Contrato público precisa transportar resultado da separação');

const detailStart=admin.indexOf('function paintOrderDetail');
assert.ok(detailStart>=0,'Pedido aberto precisa continuar no Admin canônico');
const detailEnd=admin.indexOf('\n  function ',detailStart+30);
const detailBlock=admin.slice(detailStart,detailEnd>detailStart?detailEnd:admin.length);
assert.match(detailBlock,/VITRINE CLIENTE/i,'Vitrine Cliente deve ficar dentro do pedido aberto');
assert.ok(!detailBlock.includes('Diagnóstico da integração'),'Pedido aberto não deve expor diagnóstico ERP/Bling no fluxo normal');
assert.ok(!detailBlock.includes('Antes de separar, revise o Bling'),'Bling não deve bloquear separação na UI V3');
assert.match(detailBlock,/o\.status===['"]delivered['"]/,'Fiscal só deve aparecer/ser operado depois de entregue');

assert.match(admin,/Forma prevista/,'Entrega deve mostrar forma prevista de pagamento');
assert.match(admin,/Forma recebida/,'Entrega deve permitir registrar forma recebida');
assert.match(admin,/Valor recebido/,'Entrega deve confirmar o valor recebido');
assert.match(admin,/CONFIRMAR ENTREGA/,'Entrega e pagamento devem ser confirmados numa única ação');

console.log('orders clean flow v3 contract: ok');
