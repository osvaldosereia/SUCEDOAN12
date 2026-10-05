import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const adminPath='vitrine/admin/index.html';
const hubPath='supabase/functions/admin-service-intelligence-v1/index.ts';
let admin=fs.readFileSync(adminPath,'utf8');
let hub=fs.readFileSync(hubPath,'utf8');

const oldMilestones=`  function orderV3Milestones(o){const s=String(o?.status||'');return {confirmed:['confirmed','processing','ready','out_for_delivery','delivered'].includes(s),separated:['ready','out_for_delivery','delivered'].includes(s),dispatched:['out_for_delivery','delivered'].includes(s),delivered:s==='delivered',cancelled:s==='cancelled'}}`;
const newMilestones=`  function orderSeparationCompletedV4(o){const s=String(o?.status||'');if(['out_for_delivery','delivered'].includes(s))return true;const f=state.fiscalByOrder[o?.id]||(state.currentOrder?.order?.id===o?.id?state.currentOrderFiscal:null);return s==='ready'&&f?.readiness?.separation_completed===true}\n  function orderV3Milestones(o){const s=String(o?.status||'');return {confirmed:['confirmed','processing','ready','out_for_delivery','delivered'].includes(s),separated:orderSeparationCompletedV4(o),dispatched:['out_for_delivery','delivered'].includes(s),delivered:s==='delivered',cancelled:s==='cancelled'}}`;
if(!admin.includes(oldMilestones))throw new Error('milestones anchor not found');
admin=admin.replace(oldMilestones,newMilestones);

const oldTags=`  function orderV3Tags(o){const m=orderV3Milestones(o),tags=[];if(m.confirmed)tags.push('<span class="order-v3-tag">CONFIRMADO</span>');if(m.separated)tags.push('<span class="order-v3-tag">SEPARADO</span>');const fiscalTag=orderFiscalTagV4(o);if(fiscalTag)tags.push(fiscalTag);if(m.delivered)tags.push('<span class="order-v3-tag ok">ENTREGUE</span>');if(m.cancelled)tags.push('<span class="order-v3-tag cancelled">CANCELADO</span>');if(!tags.length)tags.push('<span class="order-v3-tag neutral">RECEBIDO</span>');if(orderCustomerDataPending(o))tags.push('<span class="order-v3-tag neutral" title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">AGUARDANDO DADOS DO CLIENTE</span>');return tags.join('')}`;
const newTags=`  function orderV3Tags(o){const m=orderV3Milestones(o),tags=[],f=state.fiscalByOrder[o?.id]||(state.currentOrder?.order?.id===o?.id?state.currentOrderFiscal:null);if(m.confirmed)tags.push('<span class="order-v3-tag">CONFIRMADO</span>');if(m.separated)tags.push('<span class="order-v3-tag">SEPARADO</span>');else if(o?.status==='ready'&&f?.readiness?.separation_completed===false)tags.push('<span class="order-v3-tag warn">SEPARAÇÃO PENDENTE</span>');const fiscalTag=orderFiscalTagV4(o);if(fiscalTag)tags.push(fiscalTag);if(m.delivered)tags.push('<span class="order-v3-tag ok">ENTREGUE</span>');if(m.cancelled)tags.push('<span class="order-v3-tag cancelled">CANCELADO</span>');if(!tags.length)tags.push('<span class="order-v3-tag neutral">RECEBIDO</span>');if(orderCustomerDataPending(o))tags.push('<span class="order-v3-tag neutral" title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">AGUARDANDO DADOS DO CLIENTE</span>');return tags.join('')}`;
if(!admin.includes(oldTags))throw new Error('tags anchor not found');
admin=admin.replace(oldTags,newTags);

const oldAction=`<div class="order-v3-actions"><button class="order-v3-action" type="button" data-v3-separation="'+esc(o.id)+'" '+disabled+'>ABRIR VITRINE SEPARAÇÃO</button><button class="order-v3-action primary" type="button" data-open-order="'+esc(o.id)+'">ABRIR PEDIDO</button></div>`;
const newAction=`<div class="order-v3-actions"><button class="order-v3-action" type="button" data-v3-separation="'+esc(o.id)+'" '+disabled+'>'+(m.separated?'✓ SEPARAÇÃO CONCLUÍDA':o.status==='ready'?'CONTINUAR SEPARAÇÃO':'ABRIR VITRINE SEPARAÇÃO')+'</button><button class="order-v3-action primary" type="button" data-open-order="'+esc(o.id)+'">ABRIR PEDIDO</button></div>`;
if(!admin.includes(oldAction))throw new Error('separation action anchor not found');
admin=admin.replace(oldAction,newAction);

const oldComplete=`  async function completeOrderSeparation(id,expected,back,btn){btn.disabled=true;btn.textContent='CONCLUINDO…';try{const result=await api('order_separation_complete',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:id,expected_order_updated_at:expected,operator:currentOperator()||'Separação'})});toast(Number(result.missing_subtotal||0)>0?'Separação concluída · faltas abatidas do pedido':'Separação concluída');closeOrderSeparationSheet();await loadOrders();if(state.currentOrder?.order?.id===id)await openOrder(id)}catch(e){toast(errorMessage(e.message));await loadOrderSeparationSheet(id,back)}}`;
const newComplete=`  async function completeOrderSeparation(id,expected,back,btn){btn.disabled=true;btn.textContent='CONCLUINDO…';try{const result=await api('order_separation_complete',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:id,expected_order_updated_at:expected,operator:currentOperator()||'Separação'})});toast(Number(result.missing_subtotal||0)>0?'✓ Separação concluída com sucesso · faltas abatidas do pedido':'✓ Separação concluída com sucesso');closeOrderSeparationSheet();await loadOrders();if(state.currentOrder?.order?.id===id)await openOrder(id)}catch(e){toast('A separação NÃO foi concluída · '+errorMessage(e.message));await loadOrderSeparationSheet(id,back)}}`;
if(!admin.includes(oldComplete))throw new Error('complete handler anchor not found');
admin=admin.replace(oldComplete,newComplete);

const putAnchor=`function blingHubOrderPutPayload(current:any,desired:any){`;
if(!hub.includes(putAnchor))throw new Error('bling put payload anchor not found');
const helper=`function blingHubRebalanceInstallmentsForTotal(parcelas:any,totalRaw:number){\n  const rows=Array.isArray(parcelas)?parcelas.map((p:any)=>({...p})):[];\n  const total=Math.round(Number(totalRaw||0)*100)/100;\n  if(!rows.length||!Number.isFinite(total)||total<0)return rows;\n  const values=rows.map((p:any)=>Math.max(0,Number(p?.valor||0)));\n  const current=Math.round(values.reduce((sum:number,v:number)=>sum+v,0)*100)/100;\n  if(Math.abs(current-total)<0.005)return rows;\n  const denominator=current>0?current:rows.length;\n  let used=0;\n  return rows.map((p:any,index:number)=>{\n    const weight=current>0?values[index]/denominator:1/rows.length;\n    const valor=index===rows.length-1?Math.round((total-used)*100)/100:Math.round((total*weight)*100)/100;\n    used=Math.round((used+valor)*100)/100;\n    return {...p,valor};\n  });\n}\n`;
hub=hub.replace(putAnchor,helper+putAnchor);
const assignAnchor=`  Object.assign(payload,desired||{});`;
if(!hub.includes(assignAnchor))throw new Error('bling payload assign anchor not found');
hub=hub.replace(assignAnchor,assignAnchor+`\n  if(Array.isArray(payload.parcelas)&&Number.isFinite(Number(desired?.total)))payload.parcelas=blingHubRebalanceInstallmentsForTotal(payload.parcelas,Number(desired?.total));`);

fs.writeFileSync(adminPath,admin);
fs.writeFileSync(hubPath,hub);
execFileSync(process.execPath,['scripts/test-order-separation-completion-feedback-v4.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/test-order-separation-verified-gate-v4.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/test-admin-orders-fiscal-flow-v4.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/test-admin-orders-clean-flow-v3.mjs'],{stdio:'inherit'});
console.log('separation completion feedback v4 patch applied');
