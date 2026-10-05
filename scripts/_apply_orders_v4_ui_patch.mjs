import fs from 'node:fs';

const uiFile='vitrine/admin/index.html';
const backendFile='supabase/functions/admin-products-live-v1/index.ts';
let ui=fs.readFileSync(uiFile,'utf8');
let backend=fs.readFileSync(backendFile,'utf8');

function replaceOnce(text,before,after,label){
  const first=text.indexOf(before);
  if(first<0)throw new Error(`anchor_missing:${label}`);
  if(text.indexOf(before,first+before.length)>=0)throw new Error(`anchor_not_unique:${label}`);
  return text.slice(0,first)+after+text.slice(first+before.length);
}
function replaceRange(text,start,end,replacement,label){
  const a=text.indexOf(start);if(a<0)throw new Error(`range_start_missing:${label}`);
  const b=text.indexOf(end,a+start.length);if(b<0)throw new Error(`range_end_missing:${label}`);
  return text.slice(0,a)+replacement+'\n  '+text.slice(b);
}

// Backend: preservar campos usados pelo Fechamento e devolver o fiscal V4 no mesmo nível do contrato anterior.
backend=replaceOnce(
  backend,
  'db.from("order_fiscal_controls").select("fiscal_status,fiscal_block_reason,dispatch_fiscal_status,dispatch_fiscal_authorized_at,bling_invoice_id,bling_invoice_number,sefaz_status,issued_at,dispatch_started_at").eq("order_id",oid).maybeSingle()',
  'db.from("order_fiscal_controls").select("fiscal_status,fiscal_block_reason,payment_status,payment_method,payment_source,settled_amount,payment_confirmed_at,dispatch_fiscal_status,dispatch_fiscal_authorized_at,bling_invoice_id,bling_invoice_number,sefaz_status,issued_at,dispatch_started_at").eq("order_id",oid).maybeSingle()',
  'backend_control_fields'
);
backend=replaceOnce(
  backend,
  'dispatch_started_at:control.dispatch_started_at||null,blockers,hard_blockers:uniqueHard,issue_enabled:issueEnabled,\n    readiness:elig.data||null,provider:remote',
  'dispatch_started_at:control.dispatch_started_at||null,blockers,hard_blockers:uniqueHard,issue_enabled:issueEnabled,\n    fiscal_status:control.fiscal_status||stage,fiscal_block_reason:control.fiscal_block_reason||null,\n    payment_status:control.payment_status||"pending",payment_method:control.payment_method||null,payment_source:control.payment_source||null,\n    settled_amount_cents:control.settled_amount==null?null:Math.round(Number(control.settled_amount||0)*100),payment_confirmed_at:control.payment_confirmed_at||null,\n    bling_invoice_id:invoiceId,bling_invoice_number:control.bling_invoice_number||invoice?.numero||remote.job?.bling_invoice_number||null,\n    dispatch_gate:remote.dispatch_gate||null,config:remote.config||null,readiness:elig.data||null,provider:remote',
  'backend_legacy_aliases'
);
backend=replaceOnce(
  backend,
  'return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,fiscal:x})}if(r.method==="POST"&&a==="order_fiscal_issue_v4")',
  'return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_fiscal_issue_v4")',
  'backend_fiscal_flat_response'
);

// UI: tags legíveis.
ui=ui.replace(/(\.order-v3-tag\{[^}]*font-size:)11px/,'$113px');

ui=replaceRange(ui,'function orderV3Milestones(o){','function orderV3Tags(o){',`function orderV3Milestones(o){const s=String(o?.status||'');return {confirmed:['confirmed','processing','ready','out_for_delivery','delivered'].includes(s),separated:['ready','out_for_delivery','delivered'].includes(s),dispatched:['out_for_delivery','delivered'].includes(s),delivered:s==='delivered',cancelled:s==='cancelled'}}
  function orderFiscalTagV4(o){
    const f=state.fiscalByOrder[o?.id]||null;
    if(o?.status==='ready'){
      if(!f)return '<span class="order-v3-tag neutral">NF-e…</span>';
      if(f.error)return '<span class="order-v3-tag warn">NF-e INDISPONÍVEL</span>';
      if(f.authorized===true||f.stage==='authorized')return '<span class="order-v3-tag ok">NF-e AUTORIZADA</span>';
      if(f.stage==='processing')return '<span class="order-v3-tag warn">NF-e EM PROCESSAMENTO</span>';
      if(f.stage==='rejected')return '<span class="order-v3-tag danger">NF-e REJEITADA</span>';
      if(f.stage==='blocked')return '<span class="order-v3-tag warn">NF-e BLOQUEADA</span>';
      return '<span class="order-v3-tag warn">NF-e PENDENTE</span>';
    }
    if(o?.status==='out_for_delivery')return '<span class="order-v3-tag ok">NF-e AUTORIZADA</span><span class="order-v3-tag">SAIU PARA ENTREGA</span>';
    return '';
  }`, 'ui_milestones');

ui=replaceRange(ui,'function orderV3Tags(o){','function orderRow(o){',`function orderV3Tags(o){const m=orderV3Milestones(o),tags=[];if(m.confirmed)tags.push('<span class="order-v3-tag">CONFIRMADO</span>');if(m.separated)tags.push('<span class="order-v3-tag">SEPARADO</span>');const fiscalTag=orderFiscalTagV4(o);if(fiscalTag)tags.push(fiscalTag);if(m.delivered)tags.push('<span class="order-v3-tag ok">ENTREGUE</span>');if(m.cancelled)tags.push('<span class="order-v3-tag cancelled">CANCELADO</span>');if(!tags.length)tags.push('<span class="order-v3-tag neutral">RECEBIDO</span>');if(orderCustomerDataPending(o))tags.push('<span class="order-v3-tag neutral" title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">AGUARDANDO DADOS DO CLIENTE</span>');return tags.join('')}`, 'ui_tags');

ui=replaceRange(ui,'function orderRow(o){','async function renderOrders(){',`function orderRow(o){
    const m=orderV3Milestones(o),disabled=m.cancelled?'disabled':'',f=state.fiscalByOrder[o.id]||null;let controls='';
    if(orderCustomerDataPending(o)){
      const label=!m.confirmed?'CONFIRMADO':!m.separated?'SEPARADO':o.status==='ready'?'NF-e':o.status==='out_for_delivery'?'ENTREGA':'';
      if(label)controls+='<button class="order-v3-control" type="button" disabled title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">'+label+'</button>';
    }else{
      if(!m.confirmed&&!m.cancelled)controls+='<button class="order-v3-control" type="button" data-v3-confirm="'+esc(o.id)+'">CONFIRMADO</button>';
      if(m.confirmed&&!m.separated&&!m.cancelled)controls+='<button class="order-v3-control" type="button" data-v3-separate="'+esc(o.id)+'">SEPARADO</button>';
      if(o.status==='ready'&&!m.cancelled){
        if(f?.authorized===true||f?.stage==='authorized')controls+='<button class="order-v3-control" type="button" data-v3-dispatch="'+esc(o.id)+'">SAIU PARA ENTREGA</button>';
        else if(f)controls+='<button class="order-v3-control" type="button" data-open-order="'+esc(o.id)+'">'+(f.stage==='blocked'||f.stage==='rejected'?'REVISAR NF-e':'EMITIR NF-e')+'</button>';
        else controls+='<button class="order-v3-control" type="button" disabled>NF-e…</button>';
      }
      if(o.status==='out_for_delivery'&&!m.delivered&&!m.cancelled){
        controls+='<button class="order-v3-control" type="button" data-v3-deliver="'+esc(o.id)+'">ENTREGUE</button>';
        controls+='<button class="order-v3-control" type="button" data-v3-delivery-fail="'+esc(o.id)+'">NÃO ENTREGUE</button>';
      }
    }
    return '<article class="order-v3-card"><div class="order-v3-head"><div><small>Código do pedido</small><strong>#'+esc(shortOrder(o.order_number||o.id))+'</strong></div><div><small>Data</small><strong>'+esc(dateTime(o.created_at))+'</strong></div><div><small>Cliente</small><strong>'+esc(o.customer_name||'Sem cliente')+'</strong></div><div><small>Total</small><strong>'+money(o.total_cents||0)+'</strong></div></div><div class="order-v3-tags">'+orderV3Tags(o)+'</div>'+(controls?'<div class="order-v3-controls">'+controls+'</div>':'')+'<div class="order-v3-actions"><button class="order-v3-action" type="button" data-v3-separation="'+esc(o.id)+'" '+disabled+'>ABRIR VITRINE SEPARAÇÃO</button><button class="order-v3-action primary" type="button" data-open-order="'+esc(o.id)+'">ABRIR PEDIDO</button></div></article>';
  }`, 'ui_order_row');

ui=replaceRange(ui,'async function loadOrders(){','function paintOrderRows(){',`async function loadOrders(){
    try{
      const data=await api('orders');state.orders=Array.isArray(data.orders)?data.orders:[];paintOrderRows();
      const fiscalRows=state.orders.filter(o=>o.status==='ready').sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,8);
      if(fiscalRows.length){await loadFiscalForOrders(fiscalRows);paintOrderRows()}
    }catch(e){const host=$('#orderRows');if(host)host.innerHTML='<div class="empty">Não consegui carregar os pedidos.</div>'}
  }`, 'ui_load_orders');

ui=replaceRange(ui,'function paintOrderRows(){','async function quickConfirmOrder',`function paintOrderRows(){const host=$('#orderRows');if(!host)return;const rows=state.orders.filter(o=>orderV3SearchMatch(o,state.orderQuery)).sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));host.innerHTML=rows.length?rows.map(orderRow).join(''):'<div class="empty">Nenhum pedido encontrado.</div>';host.querySelectorAll('[data-open-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.openOrder));host.querySelectorAll('[data-v3-confirm]').forEach(b=>b.onclick=()=>quickConfirmOrder(b.dataset.v3Confirm,b));host.querySelectorAll('[data-v3-separate],[data-v3-separation]').forEach(b=>b.onclick=()=>openOrderSeparationSheet(b.dataset.v3Separate||b.dataset.v3Separation));host.querySelectorAll('[data-v3-dispatch]').forEach(b=>b.onclick=()=>startOrderDispatchV4(b.dataset.v3Dispatch,b));host.querySelectorAll('[data-v3-deliver]').forEach(b=>b.onclick=()=>openOrderDeliveryConfirm(b.dataset.v3Deliver));host.querySelectorAll('[data-v3-delivery-fail]').forEach(b=>b.onclick=()=>returnOrderToExpedition(b.dataset.v3DeliveryFail,false))}
  async function startOrderDispatchV4(id,btn){
    const current=state.orders.find(o=>String(o.id)===String(id));
    if(!current||current.status!=='ready'){toast('Este pedido não está pronto para saída');return}
    const f=state.fiscalByOrder[id]||{};if(f.authorized!==true&&f.stage!=='authorized'){toast('A NF-e precisa estar autorizada antes da saída');return}
    if(!confirm('Confirmar que o pedido #'+shortOrder(current.order_number||current.id)+' SAIU PARA ENTREGA?'))return;
    if(btn){btn.disabled=true;btn.textContent='REGISTRANDO SAÍDA…'}
    try{await api('order_dispatch_start_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,operator:currentOperator()||'Expedição',idempotency_key:'dispatch-v4:'+id})});toast('Saída para entrega registrada');delete state.fiscalByOrder[id];await loadOrders();if(state.currentOrder?.order?.id===id)await openOrder(id)}catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='SAIU PARA ENTREGA'}}
  }
  async function quickConfirmOrder`, 'ui_paint_rows');

ui=replaceRange(ui,'async function openOrder(id){','function orderV3SeparationMap(){',`async function openOrder(id){
    $('#editorTitle').textContent='Pedido';$('#editorBody').innerHTML='<div class="loading">Carregando pedido…</div>';$('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Fechar</button>';$('#cancelEditor').onclick=()=>$('#editor').close();if(!$('#editor').open)$('#editor').showModal();
    try{const data=await api('order',{id});state.currentOrder=data;state.currentOrderFiscal=null;try{if(['confirmed','processing','ready','out_for_delivery','delivered'].includes(data.order?.status)){const sep=await api('order_separation_get',{id});data.separation=sep.separation||sep}}catch{}if(['ready','out_for_delivery','delivered'].includes(data.order?.status))await loadCurrentOrderFiscal(false);paintOrderDetail()}catch(e){$('#editorBody').innerHTML='<div class="empty">Não consegui abrir este pedido.</div>'}
  }`, 'ui_open_order');

ui=ui.replace('O pedido está pronto para entrega.</div></div>','O pedido está pronto para emissão da NF-e.</div></div>');
ui=ui.replace("if(!order||!orderV3Milestones(order).separated||orderV3Milestones(order).delivered){toast('O pedido precisa estar separado antes da entrega');return}","if(!order||order.status!=='out_for_delivery'||orderV3Milestones(order).delivered){toast('O pedido precisa ter SAÍDO PARA ENTREGA antes da confirmação');return}");

ui=replaceRange(ui,'function orderFiscalHtml(f,o){','function fiscalCanaryActionHtml(f,o){',`function orderFiscalHtml(f,o){
    if(!f)return '<div class="rule-notice"><strong>Carregando controle fiscal…</strong><div>Consultando a situação da NF-e.</div></div>';
    if(f.error)return '<div class="rule-notice warn"><strong>NF-e INDISPONÍVEL</strong><div>A saída continua bloqueada até o controle fiscal voltar.</div></div>';
    const blockers=Array.isArray(f.blockers)?f.blockers:[];
    if(f.authorized===true||f.stage==='authorized')return '<div class="rule-notice"><strong>NF-e AUTORIZADA</strong><div>'+(f.invoice_number?'Nota '+esc(f.invoice_number)+' · ':'')+esc(f.sefaz_status||'Autorizada pela SEFAZ')+'</div></div>';
    if(f.stage==='processing')return '<div class="rule-notice warn"><strong>NF-e EM PROCESSAMENTO</strong><div>Aguarde a autorização. Não repita a geração da nota.</div></div>';
    if(f.stage==='rejected')return '<div class="rule-notice warn"><strong>NF-e REJEITADA</strong><div>'+esc(f.sefaz_status||blockers.join(' · ')||'Revise o retorno fiscal antes de tentar novamente.')+'</div></div>';
    if(f.stage==='blocked')return '<div class="rule-notice warn"><strong>NF-e BLOQUEADA</strong><div>'+esc(blockers.map(fiscalBlockReasonLabel).join(' · ')||'Existem requisitos pendentes para emissão.')+'</div></div>';
    return '<div class="rule-notice warn"><strong>NF-e PENDENTE</strong><div>Separação concluída. Emita e aguarde a autorização antes da saída para entrega.</div></div>';
  }`, 'ui_fiscal_html');

ui=replaceRange(ui,'function fiscalCanaryActionHtml(f,o){','async function executeCurrentOrderFiscalCanary(){',`function fiscalCanaryActionHtml(f,o){
    if(!f||f.error||!o||!['ready','out_for_delivery','delivered'].includes(o.status))return '';
    if(o.status==='ready'&&(f.authorized===true||f.stage==='authorized'))return '<div class="print-actions"><button class="primary" id="startDispatchV4" type="button">SAIU PARA ENTREGA</button><button class="secondary" id="refreshFiscalCanary" type="button">ATUALIZAR NF-e</button></div>';
    if(o.status==='ready'&&f.can_issue===true)return '<div class="rule-notice warn" style="margin-top:8px"><strong>NF-e PENDENTE</strong><div>A emissão depende de confirmação humana. O sistema não repete a geração automaticamente.</div><div class="print-actions"><button class="primary" id="executeFiscalCanary" type="button">EMITIR NF-e</button><button class="secondary" id="refreshFiscalCanary" type="button">ATUALIZAR</button></div></div>';
    if(o.status==='ready')return '<div class="print-actions"><button class="secondary" id="refreshFiscalCanary" type="button">ATUALIZAR NF-e</button></div>';
    if(o.status==='out_for_delivery')return '<div class="rule-notice"><strong>SAIU PARA ENTREGA</strong><div>NF-e autorizada. Confirme a entrega e o pagamento somente quando a entrega ocorrer.</div></div>';
    return '';
  }`, 'ui_fiscal_actions');

ui=replaceRange(ui,'async function executeCurrentOrderFiscalCanary(){','async function openDanfeForOrder',`async function executeCurrentOrderFiscalCanary(){
    const o=state.currentOrder?.order;if(!o||o.status!=='ready')return;
    const f=state.currentOrderFiscal||{};if(f.can_issue!==true){toast('A NF-e ainda não está liberada para emissão');return}
    if(!confirm('EMITIR NF-e do pedido #'+shortOrder(o.order_number||o.id)+' agora?\n\nA emissão será enviada ao Bling/SEFAZ.'))return;
    const btn=$('#executeFiscalCanary');if(btn){btn.disabled=true;btn.textContent='EMITINDO NF-e…'}
    try{const result=await api('order_fiscal_issue_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,confirmation:'EMITIR_NFE',operator:currentOperator()||'Operação'})});state.currentOrderFiscal=result.fiscal||result;state.fiscalByOrder[o.id]=state.currentOrderFiscal;toast(state.currentOrderFiscal?.authorized?'NF-e autorizada':'NF-e enviada; aguardando autorização');await loadCurrentOrderFiscal(true)}catch(e){toast(errorMessage(e?.message||'fiscal_issue_failed'));await loadCurrentOrderFiscal(true)}
  }
  async function startCurrentOrderDispatchV4(){
    const o=state.currentOrder?.order;if(!o||o.status!=='ready')return;
    const f=state.currentOrderFiscal||{};if(f.authorized!==true&&f.stage!=='authorized'){toast('A NF-e precisa estar autorizada antes da saída');return}
    if(!confirm('Confirmar que o pedido #'+shortOrder(o.order_number||o.id)+' SAIU PARA ENTREGA?'))return;
    const btn=$('#startDispatchV4');if(btn){btn.disabled=true;btn.textContent='REGISTRANDO SAÍDA…'}
    try{await api('order_dispatch_start_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,operator:currentOperator()||'Expedição',idempotency_key:'dispatch-v4:'+o.id})});toast('Saída para entrega registrada');delete state.fiscalByOrder[o.id];await loadOrders();await openOrder(o.id)}catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='SAIU PARA ENTREGA'}}
  }
  async function openDanfeForOrder`, 'ui_fiscal_execute');

ui=ui.replace("if(gate.authorized!==true&&!fiscal.bling_invoice_id){","if(fiscal.authorized!==true&&gate.authorized!==true&&!fiscal.bling_invoice_id&&!fiscal.invoice_id){");

// Fiscal passa a aparecer a partir de SEPARADO.
ui=ui.replace(/const fiscal=o\.status==='delivered'\?'<div class=\\"order-v3-section\\"><h3>Fiscal \/ NF-e<\/h3><div id=\\"orderFiscalStatus\\">'\+orderFiscalHtml\(state\.currentOrderFiscal,o\)\+'<\/div>'\+fiscalCanaryActionHtml\(state\.currentOrderFiscal,o\)\+'<div class=\\"print-actions\\">'\+\(\(state\.currentOrderFiscal\?\.dispatch_gate\?\.authorized===true\|\|state\.currentOrderFiscal\?\.bling_invoice_id\)\?'<button class=\\"secondary\\" id=\\"printDanfe\\" type=\\"button\\">Imprimir DANFE<\/button>':''\)\+'<\/div><\/div>':'';/,
`const fiscal=['ready','out_for_delivery','delivered'].includes(o.status)?'<div class="order-v3-section"><h3>Fiscal / NF-e</h3><div id="orderFiscalStatus">'+orderFiscalHtml(state.currentOrderFiscal,o)+'</div>'+fiscalCanaryActionHtml(state.currentOrderFiscal,o)+'<div class="print-actions">'+((state.currentOrderFiscal?.danfe_available||state.currentOrderFiscal?.authorized||state.currentOrderFiscal?.bling_invoice_id)?'<button class="secondary" id="printDanfe" type="button">Imprimir DANFE</button>':'')+'</div></div>':'';`);

ui=ui.replace("(milestones.separated&&!milestones.delivered&&!milestones.cancelled?'<button class=\\\"primary\\\" id=\\\"deliverOrderV3\\\" type=\\\"button\\\" '+(customerPending?'disabled title=\\\"Complete os dados essenciais do cliente\\\"':'')+'>CONFIRMAR ENTREGA</button>':'')","(o.status==='out_for_delivery'&&!milestones.delivered&&!milestones.cancelled?'<button class=\\\"primary\\\" id=\\\"deliverOrderV3\\\" type=\\\"button\\\" '+(customerPending?'disabled title=\\\"Complete os dados essenciais do cliente\\\"':'')+'>CONFIRMAR ENTREGA</button><button class=\\\"secondary\\\" id=\\\"deliveryFailedV4\\\" type=\\\"button\\\">ENTREGA NÃO CONCLUÍDA</button>':'')");
ui=ui.replace("if($('#deliverOrderV3'))$('#deliverOrderV3').onclick=()=>openOrderDeliveryConfirm(o.id);","if($('#deliverOrderV3'))$('#deliverOrderV3').onclick=()=>openOrderDeliveryConfirm(o.id);if($('#deliveryFailedV4'))$('#deliveryFailedV4').onclick=()=>returnOrderToExpedition(o.id,true);if($('#startDispatchV4'))$('#startDispatchV4').onclick=startCurrentOrderDispatchV4;");

// Legado visual não pode sugerir atalhos que o backend V4 já bloqueia.
ui=ui.replace("else if(!mustFix&&o.status==='ready'&&fiscalDispatchBlocked)primary='<button class=\\\"primary\\\" type=\\\"button\\\" disabled>Fiscal pendente antes da saída</button>';\n    else if(!mustFix&&o.status==='ready')primary='<button class=\\\"primary\\\" id=\\\"advanceOrder\\\" data-next=\\\"out_for_delivery\\\" type=\\\"button\\\">Marcar saída para entrega</button>';\n    else if(!mustFix&&o.status==='out_for_delivery')primary='<button class=\\\"primary\\\" id=\\\"advanceOrder\\\" data-next=\\\"delivered\\\" type=\\\"button\\\">Confirmar entrega</button>';","else if(!mustFix&&o.status==='ready')primary='<button class=\\\"primary\\\" type=\\\"button\\\" disabled>NF-e pendente · abra o pedido</button>';\n    else if(!mustFix&&o.status==='out_for_delivery')primary='<button class=\\\"primary\\\" type=\\\"button\\\" disabled>Entrega em rota · abra o pedido</button>'; ");

fs.writeFileSync(uiFile,ui);
fs.writeFileSync(backendFile,backend);
console.log('Pedidos V4 UI/backend compatibility patch applied');
