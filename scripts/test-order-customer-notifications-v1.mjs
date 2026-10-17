import fs from 'node:fs';
import assert from 'node:assert/strict';

// Contrato canônico do código público e das notificações Utility do pedido.
const transport=fs.readFileSync('supabase/functions/admin-orders-v1/index.ts','utf8');
const adminApi=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const vitrineGateway=fs.readFileSync('supabase/functions/admin-order-vitrine-send-v1/index.ts','utf8');

const migrationPath='supabase/migrations/20261005_order_separation_customer_notify_v1.sql';
const notifierPath='supabase/functions/order-separation-notify-v1/index.ts';
assert.equal(fs.existsSync(migrationPath),true,'pós-separação precisa de migration idempotente');
assert.equal(fs.existsSync(notifierPath),true,'pós-separação precisa de dispatcher Meta dedicado');
const migration=fs.readFileSync(migrationPath,'utf8');
const notifier=fs.readFileSync(notifierPath,'utf8');

// Um único código humano: public_code (DAxxx). O order_number completo continua só técnico.
assert.match(transport,/pedidoorganizadosite0975v2/,'0975 deve usar confirmação organizada já aprovada');
assert.match(transport,/pedidoorganizadosite1018v2/,'1018 deve usar confirmação organizada já aprovada');
assert.match(transport,/publicOrderCode/,'dispatcher deve resolver explicitamente o código público curto');
assert.match(transport,/text:publicOrderCode/,'primeira identidade humana enviada ao template deve ser o código público');
assert.doesNotMatch(transport,/\{type:"text",text:details\.orderNumber\}/,'número técnico completo não pode continuar como identificação humana do template');
assert.match(vitrineGateway,/public_order_code/,'envio manual da vitrine deve conhecer o código público');
assert.doesNotMatch(vitrineGateway,/Pedido: \$\{short\}/,'envio manual não deve mostrar order_number técnico');
assert.match(adminApi,/public_code/,'API de pedidos do Admin deve transportar public_code');
assert.match(admin,/public_code/,'Admin deve mostrar public_code nos pedidos');
assert.match(admin,/function orderDisplayCode\(/,'Admin deve centralizar o código humano do pedido');
assert.doesNotMatch(admin,/shortOrder\(current\.order_number\|\|current\.id\)/,'confirmação de saída não pode mostrar número técnico');
assert.doesNotMatch(admin,/shortOrder\(j\.payload\?\.order_number\|\|j\.entity_id\)/,'fila de impressão não pode mostrar número técnico');
assert.doesNotMatch(admin,/openDanfeForOrder\(o\.id,o\.order_number\)/,'DANFE não pode receber número técnico para exibição');

// Pós-separação: independente do Bling e idempotente.
assert.match(migration,/order_separation_customer_notifications_v1/,'migration precisa guardar idempotência/status do aviso ao cliente');
assert.match(migration,/unique[^;]*order_id[^;]*notification_kind/is,'deve haver unicidade por pedido/tipo de notificação');
assert.match(notifier,/pedidopreparadook0975v1/,'0975 precisa de template de pedido completo');
assert.match(notifier,/pedidopreparadook1018v1/,'1018 precisa de template de pedido completo');
assert.match(notifier,/pedidopreparadoajuste0975v1/,'0975 precisa de template com faltas');
assert.match(notifier,/pedidopreparadoajuste1018v1/,'1018 precisa de template com faltas');
assert.match(notifier,/missing_items/,'notificador deve usar a lista persistida de itens faltantes');
assert.match(notifier,/missing_subtotal/,'notificador deve informar o abatimento');
assert.match(notifier,/final_total/,'notificador deve informar o novo total');
assert.match(notifier,/public_code/,'notificador deve usar somente o código público curto');
assert.match(notifier,/sendTemplateViaMeta/,'aviso deve usar Meta Utility template, inclusive fora da janela de 24h');
assert.match(notifier,/whatsapp_templates_v1/,'notificador deve consultar o cache canônico de templates Meta');
assert.match(notifier,/APPROVED/,'notificador só pode enviar template pós-separação aprovado pela Meta');
assert.match(notifier,/template_pending_approval/,'template pendente não pode virar falha definitiva do aviso');
assert.match(notifier,/status:"pending"/,'aviso deve permanecer pendente enquanto o template aguarda aprovação');

const completeStart=adminApi.indexOf('async function orderSeparationComplete');
assert.ok(completeStart>=0,'conclusão canônica da separação deve existir');
const completeEnd=adminApi.indexOf('\nasync function ',completeStart+20);
const completeBlock=adminApi.slice(completeStart,completeEnd>completeStart?completeEnd:adminApi.length);
assert.match(completeBlock,/order-separation-notify-v1/,'conclusão deve disparar o notificador de cliente');
const notifyAt=completeBlock.indexOf('order-separation-notify-v1');
const readyTransitionAt=completeBlock.indexOf('ready_transition_failed');
const completedAt=completeBlock.indexOf('p_phase:"completed"');
const integrationAt=completeBlock.indexOf('runSeparationPostCompletionIntegrations');
assert.ok(notifyAt>=0&&readyTransitionAt>=0&&completedAt>=0&&integrationAt>=0,'fluxo precisa concluir localmente, atualizar o cliente e só então iniciar integrações externas');
assert.ok(readyTransitionAt<completedAt&&completedAt<notifyAt&&notifyAt<integrationAt,'aviso ao cliente deve ocorrer após conclusão local e antes do Bling/NF-e em segundo plano');
assert.match(adminApi,/target_key:"verified"/,'sincronização Verificado no Bling deve continuar existindo no pós-conclusão');

console.log('order customer notifications v1 contract: ok');
