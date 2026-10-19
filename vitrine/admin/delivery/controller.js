// Delivery owns its query, selection, drafts, route catalog and vehicle filter.
// Shared order data is accessed only through the explicit ports supplied at composition.
(function(global){
  function create({api,orders,detail,navigation,ui,formatters,orderView}){
  const {$,document,window,confirm,prompt,toast,currentOperator,requireOperator}={...ui,$:ui.query};
  const {esc,money,dateTime,normalize,formatPhone,errorMessage}=formatters;
  const {orderDisplayCode,relativeAge,statusPill,whatsappHref,mapsHrefFromAddress,orderSearchMatch,deliveredToday}=orderView;
  const {loadFiscal:loadCurrentOrderFiscal,paint:paintOrderDetail,refreshList:loadOrders,open:openOrder,openDanfe:openDanfeForOrder}=detail;
  const {today:renderToday}=navigation;
  const {loadFiscal:loadFiscalForOrders}=orders;
  const model=global.DonaAntoniaAdminDeliveryModel;
  const {deliveryPaymentMethodOptions,deliveryPaymentDefaultMethod,paymentAmountInput,parsePaymentAmountCents,dispatchPaymentSummary,deliveryStopAddress,deliveryStopTarget,deliveryStopMapsHref,runMapsHref}=model;
  let viewGeneration=0,routesGeneration=0;
  const state={expeditionQuery:'',expeditionSelected:[],expeditionDataStale:false,deliveryPaymentDraft:null,deliveryRuns:[],deliveryCatalog:{regions:[],drivers:[],vehicles:[]},deliveryPlan:{region_id:'',driver_id:'',vehicle_id:''},driverVehicle:'all',deliveryRunsError:false};
  function expeditionFiscalState(o){return model.expeditionFiscalState(o,orders.fiscal()[o?.id])}
  function fiscalAuthorizedForDispatch(o){
    return expeditionFiscalState(o).authorized===true;
  }

  function expeditionRow(o){
    const a=o.delivery_address_snapshot||{};
    const address=[a.street,a.number,a.district,a.city].filter(Boolean).join(', ')||'Endereço não informado';
    const payment=actualPaymentText(o)||(o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado');
    const fiscal=expeditionFiscalState(o),ret=o.delivery_return||null;
    const returnNote=ret
      ? '<small class="warn-text">'+(ret.status==='returning'?'Retornando ao depósito':ret.status==='returned_review'?'Retorno em revisão':'Retorno')+' · '+esc(ret.reason_label||'Motivo não informado')+'</small>'
      : '';
    const wa=whatsappHref(o.whatsapp_phone_e164||a.phone||'');
    const maps=mapsHrefFromAddress(a);
    const selected=state.expeditionSelected.includes(o.id);
    const deliveryActions=o.status==='out_for_delivery'
      ? (ret?.status==='returning'
        ? '<button class="quick-link primary-link" type="button" data-confirm-return="'+esc(o.id)+'">Confirmar retorno</button>'
        : '<button class="quick-link primary-link" type="button" data-confirm-delivery="'+esc(o.id)+'">Confirmar entrega</button><button class="quick-link" type="button" data-return-expedition="'+esc(o.id)+'">Não entregou</button>')
      : '';
    return '<div class="history-row dispatch-row">'+
      '<div>'+(o.status==='ready'&&fiscal.authorized?'<label class="dispatch-select"><input type="checkbox" data-dispatch-select="'+esc(o.id)+'" '+(selected?'checked':'')+'>#'+esc(orderDisplayCode(o))+'</label>':'<strong>#'+esc(orderDisplayCode(o))+'</strong>')+'<span class="sub">'+esc(relativeAge(o.created_at))+'</span>'+(o.status==='ready'?'<span class="sub '+(fiscal.authorized?'ok-text':'warn-text')+'">'+esc(fiscal.title)+'</span>':'')+'</div>'+
      '<div class="history-main"><strong>'+esc(o.customer_name||'Sem cliente')+'</strong><small>'+esc(address)+'</small>'+returnNote+'</div>'+
      '<div class="history-main"><strong>'+money(o.total_cents)+'</strong><small>'+esc(payment)+'</small>'+(o.status==='ready'?'<small class="'+(fiscal.authorized?'ok-text':'warn-text')+'">'+esc(fiscal.detail)+'</small>':'')+'</div>'+
      '<span>'+statusPill(o.status)+'</span>'+
      '<div class="dispatch-actions">'+
        (wa?'<a class="quick-link primary-link" href="'+esc(wa)+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
        (maps?'<a class="quick-link" href="'+esc(maps)+'" target="_blank" rel="noopener">Maps</a>':'')+
        (ret?.status==='returned_review'?'<button class="quick-link primary-link" type="button" data-resolve-return="'+esc(o.id)+'">Resolver retorno</button>':'')+
        (o.status==='ready'&&!fiscal.authorized&&ret?.status!=='returned_review'?'<button class="quick-link primary-link" type="button" data-expedition-fiscal="'+esc(o.id)+'">Resolver fiscal</button>':'')+
        (o.status==='ready'&&fiscal.authorized?'<button class="quick-link" type="button" data-expedition-danfe="'+esc(o.id)+'">Imprimir DANFE</button>':'')+
        deliveryActions+
        '<button class="quick-link" type="button" data-expedition-order="'+esc(o.id)+'">Abrir</button>'+
      '</div>'+
    '</div>';
  }
  function expeditionSection(title,subtitle,rows,empty){
    return '<section class="panel dispatch-section"><div class="history-title dispatch-head"><div><strong>'+esc(title)+'</strong><span>'+esc(subtitle)+'</span></div><b>'+rows.length+'</b></div>'+
      '<div>'+(rows.length?rows.map(expeditionRow).join(''):'<div class="history-empty">'+esc(empty)+'</div>')+'</div></section>';
  }
  async function returnOrderToExpedition(id,fromDetail=false){
    const o=(fromDetail?detail.get()?.order:null)||orders.get().find(x=>x.id===id);
    if(!o||o.status!=='out_for_delivery'){toast('Este pedido não está mais em entrega');return}
    if(o.delivery_return?.status==='returning'){toast('Este pedido já está retornando ao depósito');return}
    const choice=prompt(
      'Por que a entrega não foi concluída?\n\n1 - Cliente ausente\n2 - Endereço não encontrado\n3 - Cliente pediu reagendamento\n4 - Problema no pagamento\n5 - Cliente recusou / desistiu\n6 - Veículo / rota\n7 - Outro\n\nDigite o número:'
    );
    if(choice===null)return;
    const reasons={
      '1':['customer_absent','Cliente ausente'],
      '2':['address_not_found','Endereço não encontrado'],
      '3':['reschedule','Cliente pediu reagendamento'],
      '4':['payment_failed','Problema no pagamento'],
      '5':['customer_refused','Cliente recusou / desistiu'],
      '6':['vehicle_route','Veículo / rota'],
      '7':['other','Outro']
    };
    const selected=reasons[String(choice||'').trim()];
    if(!selected){toast('Escolha uma opção de 1 a 7');return}
    const noteInput=prompt('Observação opcional sobre a tentativa de entrega:','');
    if(noteInput===null)return;
    if(!confirm('Registrar como não entregue por "'+selected[1]+'"?\n\nA mercadoria continuará fora do estoque vendável até o retorno físico ser confirmado.'))return;
    try{
      await api('delivery_fail_register',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:o.id,reason_code:selected[0],note:String(noteInput||'').trim(),operator:currentOperator()||'Entrega'})
      });
      const data=await api('orders');orders.set(data.orders||[]);
      if(fromDetail){
        const fresh=await api('order',{id:o.id});detail.set(fresh);
        await loadCurrentOrderFiscal(false);paintOrderDetail();loadOrders();
      }
      if(navigation.currentTab()==='driver')paintDriverQueue();else if(navigation.currentTab()==='expedition')paintExpeditionBody();
      toast('Não entrega registrada · aguardando retorno físico');
    }catch(e){toast(errorMessage(e.message))}
  }
  async function confirmPhysicalDeliveryReturn(id){
    const o=orders.get().find(x=>x.id===id)||detail.get()?.order;
    const ret=o?.delivery_return;
    if(!o||!ret||ret.status!=='returning'){toast('Não existe retorno físico pendente para este pedido');return}
    const suggested=ret.recommended_disposition==='redelivery'?'redelivery':'review';
    const promptText=suggested==='redelivery'
      ? 'A mercadoria voltou fisicamente ao depósito?\n\nOK = voltou íntegra e continuará separada para REENTREGA.\nCancelar = não registrar agora.'
      : 'A mercadoria voltou fisicamente ao depósito?\n\nOK = enviar para REVISÃO, sem voltar ao estoque geral e sem nova saída.\nCancelar = não registrar agora.';
    if(!confirm(promptText))return;
    const operator=requireOperator();if(!operator)return;
    try{
      await api('delivery_return_confirm',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({case_id:ret.id,disposition:suggested,operator})
      });
      const data=await api('orders');orders.set(data.orders||[]);
      if(navigation.currentTab()==='driver')paintDriverQueue();else if(navigation.currentTab()==='expedition')paintExpeditionBody();
      if(detail.get()?.order?.id===id){const fresh=await api('order',{id});detail.set(fresh);paintOrderDetail()}
      toast(suggested==='redelivery'?'Retorno confirmado · pedido pronto para reentrega':'Retorno confirmado · bloqueado para revisão');
    }catch(e){toast(errorMessage(e.message))}
  }
  async function resolveDeliveryReturnReview(id){
    const o=orders.get().find(x=>x.id===id)||detail.get()?.order,ret=o?.delivery_return;
    if(!o||!ret||ret.status!=='returned_review'){toast('Este retorno não está mais aguardando revisão');return}
    $('#editorTitle').textContent='Revisar retorno';
    $('#editorBody').innerHTML='<div class="rule-notice warn"><strong>Pedido #'+esc(orderDisplayCode(o))+'</strong><div>'+esc(ret.reason_label||'Não entregue')+(ret.note?' · '+esc(ret.note):'')+'<br>A mercadoria já voltou fisicamente, mas continua fora do estoque vendável.</div></div>'+
      '<div class="section-title">O que aconteceu com a mercadoria?</div>'+
      '<div class="panel" style="padding:14px;margin-bottom:10px"><strong>Tudo íntegro e haverá nova tentativa</strong><p class="sub">Mantém os itens alocados ao mesmo pedido e libera para reentrega.</p><button class="primary" id="returnResolveRedelivery" type="button">LIBERAR PARA REENTREGA</button></div>'+
      '<div class="panel" style="padding:14px;margin-bottom:10px"><strong>Cliente desistiu e tudo voltou íntegro</strong><p class="sub">Cancela comercialmente e restaura todo o estoque local. O fiscal fica pendente de revisão no Bling.</p><button class="secondary" id="returnResolveCancel" type="button">CANCELAR E DEVOLVER AO ESTOQUE</button></div>'+
      '<div class="panel" style="padding:14px"><strong>Há avaria, falta ou item impróprio</strong><p class="sub">Não faça restauração total. Registre os itens no Estoque mobile para revisão.</p><button class="secondary" id="returnResolveDamage" type="button">IR PARA ESTOQUE MOBILE</button></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="returnResolveClose" type="button">Fechar</button>';
    $('#returnResolveClose').onclick=()=>$('#editor').close();
    $('#returnResolveDamage').onclick=()=>{$('#editor').close();navigation.stockIncident();toast('Leia cada item avariado ou faltante antes de resolver o retorno')};
    $('#returnResolveRedelivery').onclick=()=>submitDeliveryReturnResolution(o,'redelivery');
    $('#returnResolveCancel').onclick=()=>{
      if(!confirm('Confirme somente se TODOS os produtos voltaram fisicamente íntegros.\n\nO pedido será cancelado e o estoque local será restaurado por completo. O tratamento fiscal continuará pendente no Bling.'))return;
      submitDeliveryReturnResolution(o,'cancel_intact');
    };
    $('#editor').showModal();
  }
  async function submitDeliveryReturnResolution(o,action){
    const ret=o?.delivery_return;if(!ret)return;
    const operator=requireOperator();if(!operator)return;
    const buttons=[...document.querySelectorAll('#returnResolveRedelivery,#returnResolveCancel')];buttons.forEach(b=>b.disabled=true);
    try{
      const data=await api('delivery_return_resolve',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({case_id:ret.id,resolution_action:action,operator})
      });
      $('#editor').close();
      const rows=await api('orders');orders.set(rows.orders||[]);
      if(navigation.currentTab()==='expedition')paintExpeditionBody();else if(navigation.currentTab()==='today')renderToday();
      toast(action==='redelivery'?'Retorno revisado · liberado para reentrega':'Pedido cancelado · estoque íntegro restaurado · fiscal pendente');
      return data;
    }catch(e){toast(errorMessage(e.message));buttons.forEach(b=>b.disabled=false)}
  }

  function actualPaymentText(o){
    const parts=o?.payment_method_snapshot?.actual?.parts||[];
    return parts.length?parts.map(p=>(p.label||p.method)+' '+money(p.amount_cents)).join(' + '):'';
  }
  function paintDeliveryPaymentDraft(){
    const d=state.deliveryPaymentDraft;if(!d)return;
    const host=$('#deliveryPaymentParts');if(!host)return;
    host.innerHTML=d.parts.map((p,index)=>'<div class="form-grid delivery-payment-row" data-payment-index="'+index+'" style="align-items:end;margin-bottom:10px">'+
      '<label><span>Forma '+(d.parts.length>1?index+1:'')+'</span><select data-payment-method>'+deliveryPaymentMethodOptions(p.method)+'</select></label>'+
      '<label><span>Valor</span><input data-payment-amount inputmode="decimal" value="'+esc(paymentAmountInput(p.amount_cents))+'"></label>'+
      (index>0?'<button class="text danger" type="button" data-remove-payment-part="'+index+'">Remover</button>':'')+
    '</div>').join('');
    const sum=d.parts.reduce((s,p)=>s+Number(p.amount_cents||0),0),diff=Number(d.order.total_cents||0)-sum;
    $('#deliveryPaymentSum').innerHTML='<strong>'+money(sum)+'</strong><span class="'+(diff===0?'ok-text':'warn-text')+'">'+(diff===0?'Total confere':'Diferença '+money(Math.abs(diff))+(diff>0?' faltando':' a mais'))+'</span>';
    host.querySelectorAll('[data-payment-method]').forEach((el,index)=>el.onchange=()=>{d.parts[index].method=el.value});
    host.querySelectorAll('[data-payment-amount]').forEach((el,index)=>el.oninput=()=>{d.parts[index].amount_cents=parsePaymentAmountCents(el.value);const sum2=d.parts.reduce((s,p)=>s+Number(p.amount_cents||0),0),diff2=Number(d.order.total_cents||0)-sum2;$('#deliveryPaymentSum').innerHTML='<strong>'+money(sum2)+'</strong><span class="'+(diff2===0?'ok-text':'warn-text')+'">'+(diff2===0?'Total confere':'Diferença '+money(Math.abs(diff2))+(diff2>0?' faltando':' a mais'))+'</span>'});
    host.querySelectorAll('[data-remove-payment-part]').forEach(b=>b.onclick=()=>{d.parts.splice(Number(b.dataset.removePaymentPart),1);paintDeliveryPaymentDraft()});
    const split=$('#addDeliveryPaymentPart');if(split)split.disabled=d.parts.length>=2;
  }
  async function finalizeDeliveredOrder(o){
    const actual=o?.payment_method_snapshot?.actual||{};
    const parts=Array.isArray(actual.parts)?actual.parts:[];
    if(parts.length!==1)throw new Error('delivery_already_captured_requires_canonical_review');
    const method=String(parts[0]?.method||'').trim();
    const amount=Number(parts[0]?.amount_cents||0);
    if(!method||amount!==Number(o.total_cents||0))throw new Error('delivery_already_captured_requires_canonical_review');
    await api('order_delivery_complete_v3',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,method,amount_cents:amount,operator:currentOperator()||'Entrega',idempotency_key:'delivery-v3:'+o.id})});
    const data=await api('orders');orders.set(data.orders||[]);paintExpeditionBody();
  }
  async function captureDeliveryPaymentAndFinish(){
    const d=state.deliveryPaymentDraft;if(!d)return;
    const rows=[...document.querySelectorAll('.delivery-payment-row')];
    const parts=rows.map(row=>({method:row.querySelector('[data-payment-method]')?.value||'',amount_cents:parsePaymentAmountCents(row.querySelector('[data-payment-amount]')?.value||'')}));
    const total=parts.reduce((s,p)=>s+p.amount_cents,0);
    if(parts.some(p=>!p.method||p.amount_cents<=0)){toast('Informe a forma e o valor de cada pagamento');return}
    if(total!==Number(d.order.total_cents||0)){toast('Os pagamentos precisam somar exatamente '+money(d.order.total_cents));return}
    const operator=requireOperator();if(!operator)return;
    const btn=$('#deliveryPaymentConfirm');if(btn){btn.disabled=true;btn.textContent='SALVANDO…'}
    try{
      if(parts.length===1){
        await api('order_delivery_complete_v3',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.order.id,method:parts[0].method,amount_cents:parts[0].amount_cents,operator,idempotency_key:'delivery-v3:'+d.order.id})});
      }else{
        await api('order_payment_capture',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.order.id,parts,operator})});
        await api('order_delivery_finalize_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.order.id,operator,idempotency_key:'delivery-finalize-v4:'+d.order.id})});
      }
      const data=await api('orders');orders.set(data.orders||[]);paintExpeditionBody();
      $('#editor').close();state.deliveryPaymentDraft=null;
      toast('Entrega e pagamento registrados');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='CONFIRMAR ENTREGA E PAGAMENTO'}
    }
  }
  async function confirmDeliveryFromExpedition(id){
    const o=orders.get().find(x=>x.id===id);
    if(!o||o.status!=='out_for_delivery'){toast('Este pedido não está mais em entrega');return}
    if(o.payment_method_snapshot?.actual?.received){
      if(!confirm('O pagamento deste pedido já está registrado. Confirmar a entrega agora?'))return;
      try{await finalizeDeliveredOrder(o);toast('Entrega confirmada')}catch(e){toast(errorMessage(e.message))}
      return;
    }
    const planned=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Não informado';
    state.deliveryPaymentDraft={order:o,parts:[{method:deliveryPaymentDefaultMethod(o),amount_cents:Number(o.total_cents||0)}]};
    $('#editorTitle').textContent='Confirmar entrega';
    $('#editorBody').innerHTML='<div class="rule-notice"><strong>Pedido #'+esc(orderDisplayCode(o))+'</strong><div>'+esc(o.customer_name||'Cliente')+' · '+money(o.total_cents)+'<br>Previsto: '+esc(planned)+'</div></div>'+
      '<div class="section-title">Pagamento realmente recebido</div><div id="deliveryPaymentParts"></div>'+
      '<div class="dispatch-actions" style="justify-content:flex-start"><button class="secondary" id="addDeliveryPaymentPart" type="button">Dividir em 2 formas</button></div>'+
      '<div class="order-summary" style="margin-top:12px"><div class="summary-box"><small>Total do pedido</small><strong>'+money(o.total_cents)+'</strong></div><div class="summary-box"><small>Pagamentos</small><div id="deliveryPaymentSum"></div></div></div>'+
      '<div class="rule-notice" style="margin-top:12px"><strong>Se o pagamento falhou</strong><div>Não confirme a entrega. Feche esta janela e use “Não entregou” no pedido.</div></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="deliveryPaymentCancel" type="button">Cancelar</button><button class="primary" id="deliveryPaymentConfirm" type="button">CONFIRMAR ENTREGA E PAGAMENTO</button>';
    $('#deliveryPaymentCancel').onclick=()=>{state.deliveryPaymentDraft=null;$('#editor').close()};
    $('#deliveryPaymentConfirm').onclick=captureDeliveryPaymentAndFinish;
    $('#addDeliveryPaymentPart').onclick=()=>{const d=state.deliveryPaymentDraft;if(!d||d.parts.length>=2)return;d.parts.push({method:'credit_card',amount_cents:0});paintDeliveryPaymentDraft()};
    paintDeliveryPaymentDraft();$('#editor').showModal();
  }

  function selectedDispatchOrders(readyRows=null){
    const source=readyRows||orders.get().filter(o=>o.status==='ready');
    const ids=new Set(state.expeditionSelected);
    return source.filter(o=>ids.has(o.id));
  }
  function toggleDispatchSelection(id,checked){
    const ids=new Set(state.expeditionSelected);
    if(checked)ids.add(id);else ids.delete(id);
    state.expeditionSelected=[...ids];
    paintExpeditionBody();
  }
  function toggleAllReady(rows,checked){
    const ids=new Set(state.expeditionSelected);
    for(const o of rows)checked?ids.add(o.id):ids.delete(o.id);
    state.expeditionSelected=[...ids];
    paintExpeditionBody();
  }
  function dispatchPaymentSummaryText(rows){
    return dispatchPaymentSummary(rows).map(([label,total])=>label+': '+money(total)).join(' · ');
  }

  function printDispatchManifest(){
    const selected=orders.get().filter(o=>o.status==='ready'&&state.expeditionSelected.includes(o.id));
    if(!selected.length){toast('Selecione ao menos um pedido pronto');return}
    const total=selected.reduce((sum,o)=>sum+Number(o.total_cents||0),0);
    const rows=selected.map((o,index)=>{
      const a=o.delivery_address_snapshot||{};
      const address=[a.street,a.number,a.complement,a.district,a.city,a.state].filter(Boolean).join(', ')||a.raw_text||'ENDEREÇO NÃO INFORMADO';
      const phone=o.whatsapp_phone_e164||a.phone||'';
      const payment=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'NÃO INFORMADO';
      return '<tr>'+
        '<td>'+(index+1)+'</td>'+
        '<td><b>#'+esc(orderDisplayCode(o))+'</b><br>'+esc(o.customer_name||a.customer_name||a.recipient_name||'SEM CLIENTE')+(phone?'<br>'+esc(formatPhone(phone)):'')+'</td>'+
        '<td>'+esc(address)+'</td>'+
        '<td>'+esc(payment)+'</td>'+
        '<td class="right"><b>'+money(o.total_cents)+'</b></td>'+
        '<td class="sign"></td>'+
      '</tr>';
    }).join('');
    const paymentSummary=dispatchPaymentSummaryText(selected);
    const body='<div class="manifest-head"><h1>Dona Antônia · Romaneio de saída</h1><div>Gerado em '+esc(dateTime(new Date().toISOString()))+'</div><div><b>'+selected.length+' pedido(s)</b> · Total '+money(total)+'</div><div class="manifest-payments"><b>A receber:</b> '+esc(paymentSummary||'Nenhum pagamento informado')+'</div></div>'+
      '<table><thead><tr><th>#</th><th>Pedido / cliente</th><th>Endereço</th><th>Pagamento</th><th>Valor</th><th>Conferência</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<div class="manifest-foot"><div>Motorista: ____________________________________</div><div>Saída: ____:____</div><div>Retorno: ____:____</div></div>';
    openManifestPrint('Romaneio de saída',body);
  }
  function openManifestPrint(title,body){
    const w=window.open('','_blank','width=1000,height=760');
    if(!w){toast('Libere pop-ups para imprimir');return}
    const css='@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#000;font:11px Arial,sans-serif}.manifest-head{display:grid;grid-template-columns:1fr auto;gap:4px 16px;align-items:end;margin-bottom:8mm;border-bottom:2px solid #000;padding-bottom:4mm}.manifest-head h1{grid-column:1/-1;margin:0;font-size:20px}.manifest-head div:last-child{text-align:right}.manifest-payments{grid-column:1/-1;text-align:left!important;margin-top:2mm;padding-top:2mm;border-top:1px solid #000}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #000;padding:2.5mm;vertical-align:top}th{background:#eee;font-size:10px;text-align:left}th:nth-child(1),td:nth-child(1){width:6%}th:nth-child(2),td:nth-child(2){width:21%}th:nth-child(3),td:nth-child(3){width:30%}th:nth-child(4),td:nth-child(4){width:14%}th:nth-child(5),td:nth-child(5){width:12%}th:nth-child(6),td:nth-child(6){width:17%}.right{text-align:right}.sign{height:18mm}.manifest-foot{display:grid;grid-template-columns:1fr auto auto;gap:12mm;margin-top:8mm;padding-top:4mm;border-top:1px solid #000}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+css+'</style></head><body>'+body+'<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300));<\/script></body></html>');
    w.document.close();
  }

  async function loadDeliveryRuns(){
    const generation=++routesGeneration;
    try{
      const data=await api('ops_delivery_runs'),delivery=data.delivery||{};
      if(generation!==routesGeneration)return state.deliveryRuns;
      state.deliveryRunsError=false;
      state.deliveryRuns=delivery.runs||[];
      state.deliveryCatalog=delivery.catalog||state.deliveryCatalog||{regions:[],drivers:[],vehicles:[]};
      for(const key of ['region_id','driver_id','vehicle_id']){
        const bucket=key==='region_id'?'regions':key==='driver_id'?'drivers':'vehicles';
        const selected=state.deliveryPlan?.[key]||'';
        if(selected&&!(state.deliveryCatalog?.[bucket]||[]).some(x=>x.id===selected&&x.is_active!==false))state.deliveryPlan[key]='';
      }
      return state.deliveryRuns;
    }catch{
      if(generation===routesGeneration){state.deliveryRuns=[];state.deliveryRunsError=true}return [];
    }
  }
  function activeDeliveryRun(vehicle){return (state.deliveryRuns||[]).find(r=>r.vehicle_key===vehicle&&['planned','dispatched'].includes(r.status))||null}
  function smartDeliveryActive(kind){return (state.deliveryCatalog?.[kind]||[]).filter(x=>x.is_active!==false)}
  function smartDeliveryOptionHtml(kind,selected){
    const rows=smartDeliveryActive(kind),label=x=>kind==='regions'?(x.name+(x.city?' · '+x.city:'')):kind==='drivers'?x.name:(x.label+(x.plate?' · '+x.plate:''));
    return '<option value="">Não definido</option>'+rows.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(label(x))+'</option>').join('');
  }
  function smartDeliveryPlannerHtml(){
    if(state.deliveryRunsError)return '';
    const catalog=state.deliveryCatalog||{},empty=!(catalog.regions||[]).length&&!(catalog.drivers||[]).length&&!(catalog.vehicles||[]).length;
    return '<div class="panel" style="margin:0 0 12px;padding:12px"><div class="history-title"><div><strong>Organização da rota</strong><span>Região, entregador e veículo reais. Os campos podem ser ajustados depois.</span></div><button class="secondary" id="smartDeliverySettings" type="button">Configurar</button></div>'+
      (empty?'<div class="rule-notice warn" style="margin-top:10px"><strong>Cadastros ainda vazios</strong><div>A operação atual continua funcionando. Cadastre regiões, entregadores e veículos para ativar a organização inteligente.</div></div>':'')+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:10px">'+
        '<label><span class="sub">Região da rota</span><select id="deliveryPlanRegion" style="width:100%;min-height:42px">'+smartDeliveryOptionHtml('regions',state.deliveryPlan.region_id)+'</select></label>'+
        '<label><span class="sub">Entregador</span><select id="deliveryPlanDriver" style="width:100%;min-height:42px">'+smartDeliveryOptionHtml('drivers',state.deliveryPlan.driver_id)+'</select></label>'+
        '<label><span class="sub">Veículo</span><select id="deliveryPlanVehicle" style="width:100%;min-height:42px">'+smartDeliveryOptionHtml('vehicles',state.deliveryPlan.vehicle_id)+'</select></label>'+
      '</div></div>';
  }
  function smartDeliverySlug(v){return normalize(v).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)}
  function smartDeliveryCatalogRows(kind){
    const rows=state.deliveryCatalog?.[kind]||[];
    if(!rows.length)return '<div class="history-empty">Nenhum cadastro ainda.</div>';
    const label=x=>kind==='regions'?x.name:kind==='drivers'?x.name:x.label;
    const meta=x=>kind==='regions'?[x.code,x.city,x.state].filter(Boolean).join(' · '):kind==='drivers'?[x.phone_e164,x.home_region_id?'Região base definida':'Sem região base'].filter(Boolean).join(' · '):[x.plate,x.vehicle_type,x.capacity_units?'Cap. '+x.capacity_units:''].filter(Boolean).join(' · ');
    return rows.map(x=>'<button type="button" class="secondary" data-smart-edit="'+kind+'" data-smart-id="'+esc(x.id)+'" style="display:flex;width:100%;justify-content:space-between;text-align:left;margin:6px 0;padding:10px"><span><strong>'+esc(label(x))+'</strong><small style="display:block">'+esc(meta(x)||'Sem detalhes')+'</small></span><span>'+(x.is_active===false?'Inativo':'Editar')+'</span></button>').join('');
  }
  function openSmartDeliverySettings(){
    $('#editorTitle').textContent='Configuração das entregas';
    $('#editorBody').innerHTML='<div class="rule-notice"><strong>Smart Delivery</strong><div>Cadastre somente dados reais. Nada aqui altera pedidos ou o Bling.</div></div>'+
      '<div class="section-title">Regiões <button class="text" type="button" data-smart-new="regions">+ Adicionar</button></div>'+smartDeliveryCatalogRows('regions')+
      '<div class="section-title">Entregadores <button class="text" type="button" data-smart-new="drivers">+ Adicionar</button></div>'+smartDeliveryCatalogRows('drivers')+
      '<div class="section-title">Veículos <button class="text" type="button" data-smart-new="vehicles">+ Adicionar</button></div>'+smartDeliveryCatalogRows('vehicles');
    $('#editor').showModal();
    $('#editorBody').querySelectorAll('[data-smart-new]').forEach(b=>b.onclick=()=>openSmartDeliveryEntityForm(b.dataset.smartNew,null));
    $('#editorBody').querySelectorAll('[data-smart-edit]').forEach(b=>{
      const kind=b.dataset.smartEdit,row=(state.deliveryCatalog?.[kind]||[]).find(x=>x.id===b.dataset.smartId);
      b.onclick=()=>openSmartDeliveryEntityForm(kind,row||null);
    });
  }
  function openSmartDeliveryEntityForm(kind,row){
    const isRegion=kind==='regions',isDriver=kind==='drivers',title=isRegion?'Região':isDriver?'Entregador':'Veículo';
    const regionOptions='<option value="">Sem região base</option>'+smartDeliveryActive('regions').map(x=>'<option value="'+esc(x.id)+'" '+(x.id===row?.home_region_id?'selected':'')+'>'+esc(x.name)+'</option>').join('');
    $('#editorTitle').textContent=(row?'Editar ':'Novo ')+title.toLowerCase();
    if(isRegion){
      $('#editorBody').innerHTML='<div style="display:grid;gap:12px"><label>Nome<input id="smartName" value="'+esc(row?.name||'')+'" style="width:100%"></label><label>Código<input id="smartCode" value="'+esc(row?.code||'')+'" placeholder="gerado pelo nome se vazio" style="width:100%"></label><label>Cidade<input id="smartCity" value="'+esc(row?.city||'')+'" placeholder="Cuiabá ou Várzea Grande" style="width:100%"></label><label>Prioridade<input id="smartPriority" type="number" min="0" max="10000" value="'+esc(row?.priority??100)+'" style="width:100%"></label><label><input id="smartActive" type="checkbox" '+(row?.is_active===false?'':'checked')+'> Ativa</label><button class="primary" id="smartSave" type="button">Salvar região</button><button class="secondary" id="smartBack" type="button">Voltar</button></div>';
    }else if(isDriver){
      $('#editorBody').innerHTML='<div style="display:grid;gap:12px"><label>Nome<input id="smartName" value="'+esc(row?.name||'')+'" style="width:100%"></label><label>WhatsApp / telefone<input id="smartPhone" value="'+esc(row?.phone_e164||'')+'" placeholder="+5565..." style="width:100%"></label><label>Região base<select id="smartHomeRegion" style="width:100%">'+regionOptions+'</select></label><label><input id="smartActive" type="checkbox" '+(row?.is_active===false?'':'checked')+'> Ativo</label><button class="primary" id="smartSave" type="button">Salvar entregador</button><button class="secondary" id="smartBack" type="button">Voltar</button></div>';
    }else{
      $('#editorBody').innerHTML='<div style="display:grid;gap:12px"><label>Nome do veículo<input id="smartLabel" value="'+esc(row?.label||'')+'" placeholder="Ex.: Fiorino branca" style="width:100%"></label><label>Placa<input id="smartPlate" value="'+esc(row?.plate||'')+'" style="width:100%"></label><label>Tipo<input id="smartType" value="'+esc(row?.vehicle_type||'')+'" placeholder="Carro, utilitário..." style="width:100%"></label><label>Capacidade em volumes<input id="smartCapacity" type="number" min="1" value="'+esc(row?.capacity_units||'')+'" style="width:100%"></label><label><input id="smartActive" type="checkbox" '+(row?.is_active===false?'':'checked')+'> Ativo</label><button class="primary" id="smartSave" type="button">Salvar veículo</button><button class="secondary" id="smartBack" type="button">Voltar</button></div>';
    }
    $('#smartBack').onclick=openSmartDeliverySettings;
    $('#smartSave').onclick=async()=>{
      const btn=$('#smartSave');btn.disabled=true;btn.textContent='Salvando…';
      try{
        if(isRegion){
          const name=$('#smartName').value.trim(),code=$('#smartCode').value.trim()||smartDeliverySlug(name);
          await api('smart_delivery_region_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row?.id||null,name,code,city:$('#smartCity').value.trim(),state:'MT',priority:Number($('#smartPriority').value||100),is_active:$('#smartActive').checked})});
        }else if(isDriver){
          await api('smart_delivery_driver_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row?.id||null,name:$('#smartName').value.trim(),phone_e164:$('#smartPhone').value.trim(),home_region_id:$('#smartHomeRegion').value||null,is_active:$('#smartActive').checked})});
        }else{
          await api('smart_delivery_vehicle_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row?.id||null,label:$('#smartLabel').value.trim(),plate:$('#smartPlate').value.trim(),vehicle_type:$('#smartType').value.trim(),capacity_units:$('#smartCapacity').value?Number($('#smartCapacity').value):null,is_active:$('#smartActive').checked})});
        }
        const data=await api('smart_delivery_catalog');state.deliveryCatalog=data.catalog||{regions:[],drivers:[],vehicles:[]};toast(title+' salvo');openSmartDeliverySettings();
      }catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='Salvar '+title.toLowerCase()}
    };
  }
  async function planSelectedDeliveryRun(vehicle){
    if(state.deliveryRunsError){toast('Atualize as rotas antes de preparar uma saída');return}
    const selected=state.expeditionSelected.map(id=>orders.get().find(o=>o.id===id)).filter(o=>o&&o.status==='ready'&&fiscalAuthorizedForDispatch(o)&&!o.delivery_return?.dispatch_blocked);
    if(!selected.length){toast('Selecione os pedidos fiscalmente liberados');return}
    const label=vehicle==='car_1'?'Rota 1':'Rota 2',plan=state.deliveryPlan||{};
    const driver=smartDeliveryActive('drivers').find(x=>x.id===plan.driver_id),realVehicle=smartDeliveryActive('vehicles').find(x=>x.id===plan.vehicle_id),region=smartDeliveryActive('regions').find(x=>x.id===plan.region_id);
    const assignment=[region?.name,driver?.name,realVehicle?.label].filter(Boolean).join(' · ')||'sem atribuição operacional';
    if(!confirm('Preparar '+label+' com '+selected.length+' pedido(s)?\n\n'+assignment+'\n\nA ordem atual da seleção será usada como sequência inicial. Isso não marca a saída ainda.'))return;
    try{
      await api('ops_delivery_plan',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        vehicle_key:vehicle,order_ids:selected.map(o=>o.id),operator:currentOperator()||'Operação',
        region_id:plan.region_id||null,driver_id:plan.driver_id||null,vehicle_id:plan.vehicle_id||null
      })});
      await loadDeliveryRuns();toast(label+' preparada · '+selected.length+' parada(s)');paintExpeditionBody();
    }catch(e){toast(errorMessage(e.message))}
  }
  async function confirmRunLoading(runId){
    const run=(state.deliveryRuns||[]).find(x=>x.id===runId);if(!run)return;
    const pending=(run.stops||[]).filter(s=>['planned','out_for_delivery'].includes(s.status)&&!s.loaded_at).length;
    if(!pending){toast('Carga desta rota já está confirmada');return}
    if(!confirm('Confirmar '+pending+' parada(s) carregada(s) e sob custódia do entregador?'))return;
    try{
      await api('smart_delivery_loading_confirm',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({run_id:runId})});
      await loadDeliveryRuns();toast('Carga confirmada');if(navigation.currentTab()==='driver')paintDriverQueue();else paintExpeditionBody();
    }catch(e){toast(errorMessage(e.message))}
  }

  function smartRunSlotLabel(run){return run?.vehicle_key==='car_1'?'Rota 1':run?.vehicle_key==='car_2'?'Rota 2':'Rota'}
  function smartRunAssignmentText(run){return [run?.region?.name,run?.driver?.name,run?.vehicle?.label].filter(Boolean).join(' · ')||'Atribuição operacional pendente'}
  function smartRunCardHtml(run){
    const stops=run?.stops||[],pendingLoad=stops.filter(s=>['planned','out_for_delivery'].includes(s.status)&&!s.loaded_at).length,loaded=stops.filter(s=>s.loaded_at).length,maps=runMapsHref(run);
    const movable=run.status==='planned';
    return '<article class="panel" style="padding:12px;margin:0">'+
      '<div class="history-title"><div><strong>'+esc(smartRunSlotLabel(run))+' · '+esc(run.status==='dispatched'?'Em entrega':'Preparada')+'</strong><span>'+esc(smartRunAssignmentText(run))+'</span></div><b>'+stops.length+' parada(s)</b></div>'+
      '<div class="sub" style="margin:8px 0">'+loaded+' carregada(s)'+(pendingLoad?' · '+pendingLoad+' aguardando carga':' · carga conferida')+'</div>'+
      '<div class="dispatch-actions" style="margin-bottom:10px">'+
        (movable?'<button class="quick-link" type="button" data-smart-run-edit="'+esc(run.id)+'">Ajustar rota</button>':'')+
        (pendingLoad?'<button class="quick-link primary-link" type="button" data-smart-run-load="'+esc(run.id)+'">Confirmar carga</button>':'')+
        (maps?'<a class="quick-link" href="'+esc(maps)+'" target="_blank" rel="noopener">Maps</a>':'')+
      '</div>'+
      '<div style="display:grid;gap:6px">'+stops.map(s=>'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 8px;border:1px solid #e1e6e3;border-radius:9px"><span><strong>'+esc(String(s.sequence||'—'))+'. #'+esc(s.order_number||'—')+'</strong><small style="display:block">'+esc(s.customer_name||'Sem cliente')+(s.destination_confidence==='confirmed'?' · GPS confirmado':'')+'</small></span>'+(movable&&s.status==='planned'?'<button class="text" type="button" data-smart-stop-move="'+esc(s.stop_id)+'" data-smart-source-run="'+esc(run.id)+'">Mover</button>':'')+'</div>').join('')+'</div>'+
    '</article>';
  }
  function smartDeliveryRunsHtml(){
    if(state.deliveryRunsError)return '<div class="rule-notice warn">Não consegui carregar as rotas. Atualize antes de preparar ou alterar uma rota. <button class="text" id="retryDeliveryRuns" type="button">Tentar novamente</button></div>';
    const runs=(state.deliveryRuns||[]).filter(r=>['planned','dispatched'].includes(r.status));
    if(!runs.length)return '';
    return '<section style="margin:0 0 14px"><div class="history-title" style="margin-bottom:8px"><div><strong>Rotas de hoje</strong><span>Ajuste equipe, veículo, carga e distribuição das paradas.</span></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:10px">'+runs.map(smartRunCardHtml).join('')+'</div></section>';
  }
  function openSmartRunAssignment(runId){
    const run=(state.deliveryRuns||[]).find(r=>r.id===runId);if(!run)return;
    $('#editorTitle').textContent='Ajustar '+smartRunSlotLabel(run);
    $('#editorBody').innerHTML='<div class="rule-notice"><strong>Pedido não muda</strong><div>Esta ação só troca região, entregador ou veículo da rota.</div></div><div style="display:grid;gap:12px">'+
      '<label>Região<select id="smartRunRegion" style="width:100%">'+smartDeliveryOptionHtml('regions',run.region_id||'')+'</select></label>'+
      '<label>Entregador<select id="smartRunDriver" style="width:100%">'+smartDeliveryOptionHtml('drivers',run.driver_id||'')+'</select></label>'+
      '<label>Veículo<select id="smartRunVehicle" style="width:100%">'+smartDeliveryOptionHtml('vehicles',run.vehicle_id||'')+'</select></label>'+
      '<button class="primary" id="smartRunSave" type="button">Salvar atribuição</button></div>';
    $('#editor').showModal();
    $('#smartRunSave').onclick=async()=>{
      const btn=$('#smartRunSave');btn.disabled=true;btn.textContent='Salvando…';
      try{
        await api('smart_delivery_run_assign',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          run_id:run.id,region_id:$('#smartRunRegion').value||null,driver_id:$('#smartRunDriver').value||null,vehicle_id:$('#smartRunVehicle').value||null,operator:currentOperator()||'Operação'
        })});
        $('#editor').close();await loadDeliveryRuns();paintExpeditionBody();toast('Rota atualizada');
      }catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='Salvar atribuição'}
    };
  }
  function openSmartStopMove(stopId,sourceRunId){
    const source=(state.deliveryRuns||[]).find(r=>r.id===sourceRunId),stop=source?.stops?.find(s=>s.stop_id===stopId);
    const targets=(state.deliveryRuns||[]).filter(r=>r.id!==sourceRunId&&r.status==='planned'&&r.service_date===source?.service_date);
    if(!stop||!targets.length){toast('Não existe outra rota preparada para receber esta parada');return}
    $('#editorTitle').textContent='Mover parada #'+String(stop.order_number||'');
    $('#editorBody').innerHTML='<div class="rule-notice warn"><strong>Somente a rota muda</strong><div>O pedido e seu número permanecem os mesmos. A parada irá para o final da rota escolhida.</div></div><label>Rota de destino<select id="smartTargetRun" style="width:100%;min-height:42px">'+targets.map(r=>'<option value="'+esc(r.id)+'">'+esc(smartRunSlotLabel(r)+' · '+smartRunAssignmentText(r))+'</option>').join('')+'</select></label><button class="primary" id="smartMoveSave" type="button" style="margin-top:12px">Mover parada</button>';
    $('#editor').showModal();
    $('#smartMoveSave').onclick=async()=>{
      const btn=$('#smartMoveSave');btn.disabled=true;btn.textContent='Movendo…';
      try{
        await api('smart_delivery_stop_move',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stop_id:stopId,target_run_id:$('#smartTargetRun').value})});
        $('#editor').close();await loadDeliveryRuns();paintExpeditionBody();toast('Parada movida sem alterar o pedido');
      }catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='Mover parada'}
    };
  }

  async function bulkDispatchSelected(){
    const selected=orders.get().filter(o=>o.status==='ready'&&fiscalAuthorizedForDispatch(o)&&state.expeditionSelected.includes(o.id));
    if(!selected.length){toast('Selecione ao menos um pedido pronto');return}
    const total=selected.reduce((sum,o)=>sum+Number(o.total_cents||0),0);
    if(!confirm('Marcar '+selected.length+' pedido(s) como saiu para entrega?\n\nTotal da saída: '+money(total)))return;
    const btn=$('#bulkDispatchBtn');if(btn){btn.disabled=true;btn.textContent='Atualizando…'}
    let ok=0;const failed=[];
    for(const o of selected){
      try{
        await api('order_dispatch_start_v4',{},{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({id:o.id,operator:currentOperator()||'Expedição',idempotency_key:'dispatch-v4:'+o.id})
        });
        ok++;
        state.expeditionSelected=state.expeditionSelected.filter(id=>id!==o.id);
      }catch(e){failed.push('#'+orderDisplayCode(o))}
    }
    let refreshFailed=false;
    try{const data=await api('orders');orders.set(data.orders||[]);state.expeditionDataStale=false}catch{state.expeditionDataStale=true;refreshFailed=true}
    paintExpeditionBody();
    const result=failed.length?ok+' atualizado(s) · '+failed.length+' precisa(m) revisão':ok+' pedido(s) saíram para entrega';
    toast(refreshFailed?result+' · A lista pode estar desatualizada; atualize antes de continuar.':result);
  }
  function paintExpeditionBody(){
    const host=$('#expeditionBody');if(!host)return;
    if(state.expeditionDataStale){host.innerHTML='<div class="empty">A lista de pedidos está desatualizada. Atualize antes de continuar.<br><button class="text" id="retryExpeditionRefresh" type="button">Atualizar expedição</button></div>';$('#retryExpeditionRefresh').onclick=renderExpedition;return}
    const visible=orders.get().filter(o=>orderSearchMatch(o,state.expeditionQuery));
    const ready=visible.filter(o=>o.status==='ready');
    const dispatchableReady=ready.filter(fiscalAuthorizedForDispatch);
    const fiscalPendingReady=ready.filter(o=>!fiscalAuthorizedForDispatch(o));
    const readyIds=new Set(dispatchableReady.map(o=>o.id));
    state.expeditionSelected=state.expeditionSelected.filter(id=>readyIds.has(id));
    const delivery=visible.filter(o=>o.status==='out_for_delivery');
    const delivered=visible.filter(deliveredToday).slice(0,10);
    host.innerHTML='<div class="ops-cards">'+
        '<div class="ops-card"><small>Aguardando saída</small><strong>'+ready.length+'</strong><span>Pedidos já separados</span></div>'+
        '<div class="ops-card"><small>Em entrega</small><strong>'+delivery.length+'</strong><span>Pedidos na rua</span></div>'+
        '<div class="ops-card"><small>Entregues hoje</small><strong>'+visible.filter(deliveredToday).length+'</strong><span>Fechamento e fiscal</span></div>'+
      '</div>'+
      (ready.length?smartDeliveryPlannerHtml():'')+
      smartDeliveryRunsHtml()+
      (ready.length?(()=>{
        const selected=selectedDispatchOrders(dispatchableReady);
        const selectedTotal=selected.reduce((sum,o)=>sum+Number(o.total_cents||0),0);
        const paymentSummary=dispatchPaymentSummaryText(selected);
        return '<div class="dispatch-bulk"><label class="check"><input id="selectAllReady" type="checkbox" '+(dispatchableReady.length&&selected.length===dispatchableReady.length?'checked':'')+' '+(dispatchableReady.length?'':'disabled')+'><span>Selecionar os fiscalmente liberados desta lista</span></label><div class="dispatch-bulk-actions"><div><strong>'+selected.length+' selecionado(s) · '+money(selectedTotal)+'</strong>'+(paymentSummary?'<span class="sub">A receber: '+esc(paymentSummary)+'</span>':'')+(fiscalPendingReady.length?'<span class="sub warn-text">'+fiscalPendingReady.length+' com fiscal pendente</span>':'')+'</div><button class="secondary" id="planCar1" type="button" '+(selected.length&&!state.deliveryRunsError?'':'disabled')+'>Preparar Rota 1</button><button class="secondary" id="planCar2" type="button" '+(selected.length&&!state.deliveryRunsError?'':'disabled')+'>Preparar Rota 2</button><button class="secondary" id="printDispatchManifest" type="button" '+(selected.length?'':'disabled')+'>Imprimir romaneio</button><button class="primary" id="bulkDispatchBtn" type="button" '+(selected.length?'':'disabled')+'>Marcar saída</button></div></div>';
      })():'')+
      '<div class="dispatch-grid">'+
        expeditionSection('Aguardando saída','prontos para expedir',ready,'Nenhum pedido aguardando saída.')+
        expeditionSection('Em entrega','acompanhar até a confirmação',delivery,'Nenhum pedido em entrega.')+
        expeditionSection('Entregues hoje','Últimos entregues do dia · pagamento e fiscal',delivered,'Nenhuma entrega concluída hoje.')+
      '</div>';
    document.querySelectorAll('[data-expedition-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.expeditionOrder));
    document.querySelectorAll('[data-expedition-fiscal]').forEach(b=>b.onclick=()=>openOrder(b.dataset.expeditionFiscal));
    document.querySelectorAll('[data-expedition-danfe]').forEach(b=>b.onclick=()=>{const o=orders.get().find(x=>x.id===b.dataset.expeditionDanfe);if(o)openDanfeForOrder(o.id,orderDisplayCode(o))});
    document.querySelectorAll('[data-confirm-delivery]').forEach(b=>b.onclick=()=>confirmDeliveryFromExpedition(b.dataset.confirmDelivery));
    document.querySelectorAll('[data-return-expedition]').forEach(b=>b.onclick=()=>returnOrderToExpedition(b.dataset.returnExpedition,false));
    document.querySelectorAll('[data-confirm-return]').forEach(b=>b.onclick=()=>confirmPhysicalDeliveryReturn(b.dataset.confirmReturn));
    document.querySelectorAll('[data-resolve-return]').forEach(b=>b.onclick=()=>resolveDeliveryReturnReview(b.dataset.resolveReturn));
    document.querySelectorAll('[data-dispatch-select]').forEach(el=>el.onchange=e=>toggleDispatchSelection(el.dataset.dispatchSelect,e.target.checked));
    if($('#selectAllReady'))$('#selectAllReady').onchange=e=>toggleAllReady(dispatchableReady,e.target.checked);
    if($('#deliveryPlanRegion'))$('#deliveryPlanRegion').onchange=e=>state.deliveryPlan.region_id=e.target.value;
    if($('#deliveryPlanDriver'))$('#deliveryPlanDriver').onchange=e=>state.deliveryPlan.driver_id=e.target.value;
    if($('#deliveryPlanVehicle'))$('#deliveryPlanVehicle').onchange=e=>state.deliveryPlan.vehicle_id=e.target.value;
    if($('#smartDeliverySettings'))$('#smartDeliverySettings').onclick=openSmartDeliverySettings;
    if($('#retryDeliveryRuns'))$('#retryDeliveryRuns').onclick=renderExpedition;
    document.querySelectorAll('[data-smart-run-edit]').forEach(b=>b.onclick=()=>openSmartRunAssignment(b.dataset.smartRunEdit));
    document.querySelectorAll('[data-smart-run-load]').forEach(b=>b.onclick=()=>confirmRunLoading(b.dataset.smartRunLoad));
    document.querySelectorAll('[data-smart-stop-move]').forEach(b=>b.onclick=()=>openSmartStopMove(b.dataset.smartStopMove,b.dataset.smartSourceRun));
    if($('#planCar1'))$('#planCar1').onclick=()=>planSelectedDeliveryRun('car_1');
    if($('#planCar2'))$('#planCar2').onclick=()=>planSelectedDeliveryRun('car_2');
    if($('#printDispatchManifest'))$('#printDispatchManifest').onclick=printDispatchManifest;
    if($('#bulkDispatchBtn'))$('#bulkDispatchBtn').onclick=bulkDispatchSelected;
  }
  function driverRow(o,index){
    const a=o.delivery_address_snapshot||{},ret=o.delivery_return||null,stop=o.__delivery_stop||null;
    const address=[a.street,a.number,a.complement,a.district,a.city].filter(Boolean).join(', ')||a.raw_text||'Endereço não informado';
    const wa=whatsappHref(o.whatsapp_phone_e164||a.phone||''),maps=stop?deliveryStopMapsHref(stop):mapsHrefFromAddress(a);
    const payment=actualPaymentText(o)||(o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado');
    const returning=ret?.status==='returning',confidence=stop?.destination_confidence||'';
    const locationLabel=confidence==='confirmed'?'LOCALIZAÇÃO CONFIRMADA':confidence==='saved'?'LOCALIZAÇÃO SALVA':'ENDEREÇO SEM GPS CONFIRMADO';
    return '<article class="separation-tablet-card driver-card '+(returning?'problem':'')+'">'+
      '<div class="separation-tablet-top"><div><strong>Parada '+esc(stop?.sequence||index+1)+' · #'+esc(orderDisplayCode(o))+'</strong><div class="customer">'+esc(o.customer_name||a.customer_name||a.recipient_name||'Sem cliente')+'</div></div><strong>'+money(o.total_cents)+'</strong></div>'+
      '<div class="meta"><span>'+esc(payment)+'</span><span>'+esc(formatPhone(o.whatsapp_phone_e164||a.phone||''))+'</span></div>'+
      '<div class="rule-notice '+(returning?'warn':'')+'" style="margin-top:10px"><strong>'+(returning?'RETORNANDO · '+esc(ret.reason_label||'Não entregue'):esc(locationLabel))+'</strong><div>'+esc(address)+'</div></div>'+
      '<div class="separation-tablet-actions">'+
        (maps&&!returning?'<a class="primary wide" href="'+esc(maps)+'" target="_blank" rel="noopener">ABRIR MAPS</a>':'')+
        (wa?'<a class="secondary" href="'+esc(wa)+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
        (returning
          ? '<button class="primary wide" type="button" data-driver-returned="'+esc(o.id)+'">CONFIRMAR RETORNO AO DEPÓSITO</button>'
          : '<button class="primary wide" type="button" data-driver-delivered="'+esc(o.id)+'">✓ ENTREGUE</button><button class="secondary" type="button" data-driver-failed="'+esc(o.id)+'">NÃO ENTREGOU</button>')+
        '<button class="secondary" type="button" data-driver-open="'+esc(o.id)+'">Abrir pedido</button>'+
      '</div></article>';
  }
  function runOperationalLabel(run,fallback){
    if(!run)return fallback;
    return [run.region?.name,run.driver?.name,run.vehicle?.label].filter(Boolean).join(' · ')||fallback;
  }
  function driverVehicleToolbar(){
    if(state.deliveryRunsError)return '<div class="rule-notice warn">Não consegui carregar as rotas. <button class="text" id="retryDriverRoutes" type="button">Tentar novamente</button></div>';
    const selected=state.driverVehicle||'all',r1=activeDeliveryRun('car_1'),r2=activeDeliveryRun('car_2'),run=selected==='all'?null:activeDeliveryRun(selected),maps=runMapsHref(run);
    const loadPending=run?(run.stops||[]).filter(s=>['planned','out_for_delivery'].includes(s.status)&&!s.loaded_at).length:0;
    return '<div class="dispatch-bulk" style="margin-bottom:12px"><div class="dispatch-bulk-actions">'+
      '<button class="secondary '+(selected==='all'?'active':'')+'" type="button" data-driver-vehicle="all">Todos</button>'+
      '<button class="secondary '+(selected==='car_1'?'active':'')+'" type="button" data-driver-vehicle="car_1">'+esc(runOperationalLabel(r1,'Rota 1'))+(r1?' · '+(r1.stops||[]).length:'')+'</button>'+
      '<button class="secondary '+(selected==='car_2'?'active':'')+'" type="button" data-driver-vehicle="car_2">'+esc(runOperationalLabel(r2,'Rota 2'))+(r2?' · '+(r2.stops||[]).length:'')+'</button>'+
      (run&&loadPending?'<button class="secondary" type="button" data-driver-load="'+esc(run.id)+'">CONFIRMAR CARGA · '+loadPending+'</button>':'')+
      (run&&run.loaded_at?'<span class="pill">Carga conferida</span>':'')+
      (maps?'<a class="primary" href="'+esc(maps)+'" target="_blank" rel="noopener">ABRIR ROTA NO MAPS</a>':'')+
      '</div></div>';
  }
  function driverOrders(){
    const all=orders.get().filter(o=>o.status==='out_for_delivery'),vehicle=state.driverVehicle||'all';if(vehicle==='all')return all;
    const run=activeDeliveryRun(vehicle);if(!run)return [];const byId=new Map(all.map(o=>[o.id,o]));
    return (run.stops||[]).map(s=>{const o=byId.get(s.order_id);return o?{...o,__delivery_stop:s}:null}).filter(Boolean);
  }
  function paintDriverQueue(){
    const host=$('#driverQueue');if(!host)return;const q=normalize($('#driverSearch')?.value||'');let rows=driverOrders();if(q)rows=rows.filter(o=>orderSearchMatch(o,q));
    const shell=$('#driverRouteToolbar');if(shell){
      shell.innerHTML=driverVehicleToolbar();
      if($('#retryDriverRoutes'))$('#retryDriverRoutes').onclick=loadDriverQueue;
      shell.querySelectorAll('[data-driver-vehicle]').forEach(b=>b.onclick=()=>{state.driverVehicle=b.dataset.driverVehicle;paintDriverQueue()});
      shell.querySelectorAll('[data-driver-load]').forEach(b=>b.onclick=()=>confirmRunLoading(b.dataset.driverLoad));
    }
    host.innerHTML=rows.length?rows.map(driverRow).join(''):'<div class="empty">Nenhuma entrega em rota para esta seleção.</div>';
    host.querySelectorAll('[data-driver-delivered]').forEach(b=>b.onclick=()=>confirmDeliveryFromExpedition(b.dataset.driverDelivered));
    host.querySelectorAll('[data-driver-failed]').forEach(b=>b.onclick=()=>returnOrderToExpedition(b.dataset.driverFailed,false));
    host.querySelectorAll('[data-driver-returned]').forEach(b=>b.onclick=()=>confirmPhysicalDeliveryReturn(b.dataset.driverReturned));
    host.querySelectorAll('[data-driver-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.driverOpen));
  }
  async function loadDriverQueue(){
    const generation=++viewGeneration,content=$('#content'),host=$('#driverQueue');
    const isCurrent=()=>generation===viewGeneration&&navigation.currentTab()==='driver'&&content===$('#content')&&host&&host===$('#driverQueue');
    try{
      const [data]=await Promise.all([api('orders'),loadDeliveryRuns()]);
      if(!isCurrent())return;
      orders.set(data.orders||[]);paintDriverQueue();
    }catch(e){
      if(!isCurrent())return;
      host.innerHTML='<div class="empty">Não consegui carregar as entregas. <button class="text" id="retryDriver">Tentar novamente</button></div>';
      if($('#retryDriver'))$('#retryDriver').onclick=loadDriverQueue;
    }
  }
  async function renderDriver(){
    const content=$('#content');content.innerHTML='<div class="separation-tablet"><div class="page-head"><div><h1>Entregador</h1><p>Rota, endereço, navegação e conclusão da entrega.</p></div><button class="secondary" id="refreshDriver" type="button">Atualizar</button></div><div id="driverRouteToolbar"></div><div class="separation-tablet-toolbar"><input id="driverSearch" type="search" inputmode="search" autocomplete="off" placeholder="Pedido, cliente, telefone ou endereço"><button class="secondary" id="clearDriver" type="button">Limpar</button></div><div class="separation-tablet-list" id="driverQueue"><div class="loading">Carregando rota…</div></div></div>';
    $('#refreshDriver').onclick=loadDriverQueue;$('#driverSearch').oninput=paintDriverQueue;$('#clearDriver').onclick=()=>{$('#driverSearch').value='';paintDriverQueue();$('#driverSearch').focus()};
    await loadDriverQueue();
  }

  async function renderExpedition(){
    const generation=++viewGeneration;
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Expedição</h1><p>Pedidos prontos, em entrega e entregues em uma única fila operacional.</p></div><button class="secondary" id="refreshExpedition">Atualizar</button></div>'+
      '<div class="toolbar"><input id="expeditionSearch" type="search" placeholder="Buscar pedido, cliente, telefone ou endereço…" value="'+esc(state.expeditionQuery)+'"><button class="secondary" id="clearExpeditionSearch" type="button">Limpar</button></div>'+
      '<div id="expeditionBody"><div class="loading">Carregando expedição…</div></div>';
    const host=$('#expeditionBody');
    const isCurrent=()=>generation===viewGeneration&&navigation.currentTab()==='expedition'&&content===$('#content')&&host===$('#expeditionBody');
    $('#refreshExpedition').onclick=renderExpedition;
    $('#expeditionSearch').oninput=e=>{state.expeditionQuery=e.target.value;paintExpeditionBody()};
    $('#clearExpeditionSearch').onclick=()=>{state.expeditionQuery='';$('#expeditionSearch').value='';paintExpeditionBody()};
    try{
      const [data]=await Promise.all([api('orders'),loadDeliveryRuns()]);
      if(!isCurrent())return;
      orders.set(data.orders||[]);
      state.expeditionDataStale=false;
      const readyRows=orders.get().filter(o=>o.status==='ready');
      await loadFiscalForOrders(readyRows);
      if(!isCurrent())return;
      paintExpeditionBody();
    }catch(e){
      if(!isCurrent())return;
      host.innerHTML='<div class="empty">Não consegui carregar a expedição. <button class="text" id="retryExpedition">Tentar novamente</button></div>';
      if($('#retryExpedition'))$('#retryExpedition').onclick=renderExpedition;
    }
  }

  return Object.freeze({renderExpedition,renderDriver,returnOrderToExpedition,actualPaymentText});
  }
  global.DonaAntoniaAdminDelivery=Object.freeze({create});
})(window);
