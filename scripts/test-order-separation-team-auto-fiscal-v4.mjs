import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const backend=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const publicPage=fs.readFileSync('pedido/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20261007120000_order_separation_team_auto_fiscal_v4.sql','utf8');

for(const [key,label] of [['jose','José'],['claudio','Cláudio'],['jovenil','Jovenil'],['kelly','Kelly']]){
  assert.ok(admin.includes(`key:'${key}',label:'${label}'`),`Admin precisa do separador ${label}`);
  assert.ok(migration.includes(`when '${key}' then '${label}'`),`Banco precisa do separador ${label}`);
}
assert.match(admin,/data-separator-key/);
assert.match(admin,/Trocar a separação para/);
assert.match(admin,/EM SEPARAÇÃO ·/);
assert.match(admin,/order-v3-progress-bar/);
assert.match(admin,/SALVANDO…/);
assert.match(admin,/✓ SALVO/);
assert.match(admin,/NÃO SALVO/);
assert.match(admin,/ANOTE O NÚMERO DO PEDIDO NA EMBALAGEM/);
assert.match(admin,/PEDIDO JÁ SEPARADO/);
assert.match(admin,/orders-packaging-sheet/);
assert.match(admin,/showSeparationPackagingNotice/);
assert.match(admin,/back\.dataset\.orderUpdatedAt/);
assert.match(admin,/bling_approval_pending/);
assert.match(admin,/orderCardPhone/);
assert.match(admin,/Tel\. /);
assert.match(admin,/INTEGRAÇÃO PENDENTE/);
assert.match(admin,/orders-separation-qty strong\{font-size:(?:2[7-9]|3\d)px/);
assert.match(backend,/order_separation_board/);
assert.match(admin,/setInterval\(refreshOrderSeparationBoard,5000\)/);
assert.match(backend,/separator_required/);
assert.match(backend,/requestedSeparator!==separator/);

assert.doesNotMatch(publicPage,/id="talkWhatsapp"/);
assert.doesNotMatch(publicPage,/id="printVitrine"/);
assert.doesNotMatch(publicPage,/Voltar à vitrine/);
assert.match(publicPage,/out_for_delivery:'Em entrega'/);

assert.match(migration,/dispatch_fiscal_human_issue_enabled=true/);
assert.match(migration,/dispatch_invoice_generate_enabled=false/);
assert.match(migration,/dispatch_invoice_authorize_enabled=false/);
assert.match(backend,/autoIssueFiscalAfterSeparation/);
assert.match(backend,/fiscal_dispatch_canary_human_execute/);
assert.match(backend,/EdgeRuntime/);
const start=backend.indexOf('async function orderSeparationComplete');
const end=backend.indexOf('\nasync function completeDeliveryV3',start);
const block=backend.slice(start,end);
assert.match(block,/p_phase:"completed"/);
assert.match(block,/order-separation-notify-v1/);
assert.match(block,/runSeparationPostCompletionIntegrations/);
assert.doesNotMatch(block,/ops2_launch_physical_stock/);
assert.match(backend,/async function orderDispatchStartV4[\s\S]*ops2_launch_physical_stock/);
assert.match(backend,/fiscal_authorization_required_before_dispatch/);

console.log('order separation team + auto fiscal v4 contract: ok');

const itemStart=backend.indexOf('async function orderSeparationItemSet');
const itemEnd=backend.indexOf('\nasync function markSeparationNeedsAttention',itemStart);
const itemBlock=backend.slice(itemStart,itemEnd);
assert.ok(itemBlock.indexOf('ops2_set_order_separation_item_v2') < itemBlock.indexOf('syncConfirmedOrderToBling'),'Persistir o item antes de depender do Bling');
assert.match(itemBlock,/persisted:true/);
assert.match(itemBlock,/warning/);
const completeStart2=backend.indexOf('async function orderSeparationComplete');
const completeEnd2=backend.indexOf('\nasync function completeDeliveryV3',completeStart2);
const completeBlock2=backend.slice(completeStart2,completeEnd2);
assert.ok(completeBlock2.indexOf('syncConfirmedOrderToBling') < completeBlock2.indexOf('ops2_prepare_order_separation_completion_v2'),'Conclusão mantém gate do Bling');

const sepCompleteStart=backend.indexOf('async function orderSeparationComplete');
const sepCompleteEnd=backend.indexOf('\nasync function completeDeliveryV3',sepCompleteStart);
const sepCompleteBlock=backend.slice(sepCompleteStart,sepCompleteEnd);
assert.ok(!sepCompleteBlock.includes('syncConfirmedOrderToBling'),'Conclusão operacional não depende do Bling antes do prepare');
assert.match(sepCompleteBlock,/ops2_prepare_order_separation_completion_v2/);
assert.match(sepCompleteBlock,/runSeparationPostCompletionIntegrations/);
assert.match(sepCompleteBlock,/order_number:prep\.data\?\.order_number/);
