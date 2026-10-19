  function expeditionFiscalState(o){
    if(o?.status==='ready'&&o?.delivery_return?.dispatch_blocked===true)return {authorized:false,title:'Retorno em revisão',detail:'Inspecionar mercadoria antes de nova saída',kind:'warn'};
    if(o?.status!=='ready')return {authorized:true,title:'',detail:'',kind:'ok'};
    const f=state.fiscalByOrder[o.id];
    if(!f)return {authorized:false,title:'Fiscal carregando',detail:'Aguardando conferência',kind:'warn'};
    if(f.error)return {authorized:false,title:'Fiscal indisponível',detail:'Abra o pedido para revisar',kind:'warn'};
    const gate=f.dispatch_gate||{};
    if(gate.authorized===true&&gate.allowed===true){
      return {
        authorized:true,
        title:'Fiscal autorizado',
        detail:(gate.bling_invoice_number?'NF-e '+gate.bling_invoice_number:'Liberado para saída'),
        kind:'ok'
      };
    }
    return {
      authorized:false,
      title:'Fiscal pendente',
      detail:'Emitir NF-e antes da saída',
      kind:'warn'
    };
  }
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
    const o=(fromDetail?state.currentOrder?.order:null)||state.orders.find(x=>x.id===id);
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
      const data=await api('orders');state.orders=data.orders||[];
      if(fromDetail){
        const fresh=await api('order',{id:o.id});state.currentOrder=fresh;
        await loadCurrentOrderFiscal(false);paintOrderDetail();loadOrders();
      }
      if(state.tab==='driver')paintDriverQueue();else if(state.tab==='expedition')paintExpeditionBody();
      toast('Não entrega registrada · aguardando retorno físico');
    }catch(e){toast(errorMessage(e.message))}
  }
  async function confirmPhysicalDeliveryReturn(id){
    const o=state.orders.find(x=>x.id===id)||state.currentOrder?.order;
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
      const data=await api('orders');state.orders=data.orders||[];
      if(state.tab==='driver')paintDriverQueue();else if(state.tab==='expedition')paintExpeditionBody();
      if(state.currentOrder?.order?.id===id){const fresh=await api('order',{id});state.currentOrder=fresh;paintOrderDetail()}
      toast(suggested==='redelivery'?'Retorno confirmado · pedido pronto para reentrega':'Retorno confirmado · bloqueado para revisão');
    }catch(e){toast(errorMessage(e.message))}
  }
  async function resolveDeliveryReturnReview(id){
    const o=state.orders.find(x=>x.id===id)||state.currentOrder?.order,ret=o?.delivery_return;
    if(!o||!ret||ret.status!=='returned_review'){toast('Este retorno não está mais aguardando revisão');return}
    $('#editorTitle').textContent='Revisar retorno';
    $('#editorBody').innerHTML='<div class="rule-notice warn"><strong>Pedido #'+esc(orderDisplayCode(o))+'</strong><div>'+esc(ret.reason_label||'Não entregue')+(ret.note?' · '+esc(ret.note):'')+'<br>A mercadoria já voltou fisicamente, mas continua fora do estoque vendável.</div></div>'+
      '<div class="section-title">O que aconteceu com a mercadoria?</div>'+
      '<div class="panel" style="padding:14px;margin-bottom:10px"><strong>Tudo íntegro e haverá nova tentativa</strong><p class="sub">Mantém os itens alocados ao mesmo pedido e libera para reentrega.</p><button class="primary" id="returnResolveRedelivery" type="button">LIBERAR PARA REENTREGA</button></div>'+
      '<div class="panel" style="padding:14px;margin-bottom:10px"><strong>Cliente desistiu e tudo voltou íntegro</strong><p class="sub">Cancela comercialmente e restaura todo o estoque local. O fiscal fica pendente de revisão no Bling.</p><button class="secondary" id="returnResolveCancel" type="button">CANCELAR E DEVOLVER AO ESTOQUE</button></div>'+
      '<div class="panel" style="padding:14px"><strong>Há avaria, falta ou item impróprio</strong><p class="sub">Não faça restauração total. Registre os itens no Estoque mobile para revisão.</p><button class="secondary" id="returnResolveDamage" type="button">IR PARA ESTOQUE MOBILE</button></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="returnResolveClose" type="button">Fechar</button>';
    $('#returnResolveClose').onclick=()=>$('#editor').close();
    $('#returnResolveDamage').onclick=()=>{$('#editor').close();state.balanceMode='incident';setTab('balance');toast('Leia cada item avariado ou faltante antes de resolver o retorno')};
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
      const rows=await api('orders');state.orders=rows.orders||[];
      if(state.tab==='expedition')paintExpeditionBody();else if(state.tab==='today')renderToday();
      toast(action==='redelivery'?'Retorno revisado · liberado para reentrega':'Pedido cancelado · estoque íntegro restaurado · fiscal pendente');
      return data;
    }catch(e){toast(errorMessage(e.message));buttons.forEach(b=>b.disabled=false)}
  }

  function deliveryPaymentMethodOptions(selected=''){
    const rows=[['pix','PIX'],['cash','Dinheiro'],['credit_card','Cartão de crédito'],['food_card','Cartão alimentação'],['meal_card','Cartão refeição'],['other','Outro']];
    return rows.map(([v,l])=>'<option value="'+v+'" '+(v===selected?'selected':'')+'>'+l+'</option>').join('');
  }
  function deliveryPaymentDefaultMethod(o){
    const raw=String(o?.payment_method_snapshot?.method||'').toLowerCase();
    const map={pix:'pix',cash:'cash',dinheiro:'cash',credit:'credit_card',credit_card:'credit_card',card:'credit_card',food_card:'food_card',meal_card:'meal_card'};
    return map[raw]||'pix';
  }
  function paymentAmountInput(cents){return (Number(cents||0)/100).toFixed(2).replace('.',',')}
  function parsePaymentAmountCents(value){
    let s=String(value||'').trim().replace(/R\$/gi,'').replace(/\s+/g,'');
    if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
    const n=Number(s);return Number.isFinite(n)?Math.round(n*100):0;
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
    const data=await api('orders');state.orders=data.orders||[];paintExpeditionBody();
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
      const data=await api('orders');state.orders=data.orders||[];paintExpeditionBody();
      $('#editor').close();state.deliveryPaymentDraft=null;
      toast('Entrega e pagamento registrados');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='CONFIRMAR ENTREGA E PAGAMENTO'}
    }
  }
  async function confirmDeliveryFromExpedition(id){
    const o=state.orders.find(x=>x.id===id);
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
    const source=readyRows||state.orders.filter(o=>o.status==='ready');
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
  function dispatchPaymentSummary(rows){
    const map=new Map();
    for(const o of rows||[]){
      const label=String(o?.payment_method_snapshot?.label||o?.payment_method_snapshot?.method||'Não informado').trim()||'Não informado';
      map.set(label,(map.get(label)||0)+Number(o?.total_cents||0));
    }
    return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
  }
  function dispatchPaymentSummaryText(rows){
    return dispatchPaymentSummary(rows).map(([label,total])=>label+': '+money(total)).join(' · ');
  }

  function printDispatchManifest(){
    const selected=state.orders.filter(o=>o.status==='ready'&&state.expeditionSelected.includes(o.id));
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
    try{
      const data=await api('ops_delivery_runs'),delivery=data.delivery||{};
      state.deliveryRuns=delivery.runs||[];
      state.deliveryCatalog=delivery.catalog||state.deliveryCatalog||{regions:[],drivers:[],vehicles:[]};
      for(const key of ['region_id','driver_id','vehicle_id']){
        const bucket=key==='region_id'?'regions':key==='driver_id'?'drivers':'vehicles';
        const selected=state.deliveryPlan?.[key]||'';
        if(selected&&!(state.deliveryCatalog?.[bucket]||[]).some(x=>x.id===selected&&x.is_active!==false))state.deliveryPlan[key]='';
      }
      return state.deliveryRuns;
    }catch{
      state.deliveryRuns=[];return [];
    }
  }
  function activeDeliveryRun(vehicle){return (state.deliveryRuns||[]).find(r=>r.vehicle_key===vehicle&&['planned','dispatched'].includes(r.status))||null}
  function deliveryStopAddress(stop){const a=stop?.address||{};return [a.street,a.number,a.district,a.city,a.state].filter(Boolean).join(', ')||a.raw_text||''}
  function deliveryStopTarget(stop){
    const lat=Number(stop?.destination_latitude),lng=Number(stop?.destination_longitude);
    if(Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&stop?.destination_confidence)return lat.toFixed(7)+','+lng.toFixed(7);
    return deliveryStopAddress(stop);
  }
  function deliveryStopMapsHref(stop){
    const target=deliveryStopTarget(stop);
    return target?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(target):String(stop?.maps_url||'');
  }
  function runMapsHref(run){
    const stops=(run?.stops||[]).filter(s=>!['delivered','failed','cancelled'].includes(s.status)).slice(0,9);if(!stops.length)return '';
    if(stops.length===1)return deliveryStopMapsHref(stops[0]);
    const destination=deliveryStopTarget(stops[stops.length-1]);if(!destination)return '';
    const waypoints=stops.slice(0,-1).map(deliveryStopTarget).filter(Boolean);let url='https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(destination);
    if(waypoints.length)url+='&waypoints='+encodeURIComponent(waypoints.join('|'));return url;
  }
  function smartDeliveryActive(kind){return (state.deliveryCatalog?.[kind]||[]).filter(x=>x.is_active!==false)}
  function smartDeliveryOptionHtml(kind,selected){
    const rows=smartDeliveryActive(kind),label=x=>kind==='regions'?(x.name+(x.city?' · '+x.city:'')):kind==='drivers'?x.name:(x.label+(x.plate?' · '+x.plate:''));
    return '<option value="">Não definido</option>'+rows.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(label(x))+'</option>').join('');
  }
  function smartDeliveryPlannerHtml(){
    const catalog=state.deliveryCatalog||{},empty=!(catalog.regions||[]).length&&!(catalog.drivers||[]).length&&!(catalog.vehicles||[]).length;
    return '<div class="panel" style="margin:0 0 12px;padding:12px"><div class="history-title"><div><strong>Organização da rota</strong><span>Região, entregador e veículo reais. Os campos podem ser ajustados depois.</span></div><button class="secondary" id="smartDeliverySettings" type="button">Configurar</button></div>'+
      (empty?'<div class="rule-notice warn" style="margin-top:10px"><strong>Cadastros ainda vazios</strong><div>A operação atual continua funcionando. Cadastre regiões, entregadores e veículos para ativar a organização inteligente.</div></div>':'')+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:10px">'+
        '<label><span class="sub">Região da rota</span><select id="deliveryPlanRegion" style="width:100%;min-height:42px">'+smartDeliveryOptionHtml('regions',state.deliveryPlan.region_id)+'</select></label>'+
        '<label><span class="sub">Entregador</span><select id="deliveryPlanDriver" style="width:100%;min-height:42px">'+smartDeliveryOptionHtml('drivers',state.deliveryPlan.driver_id)+'</select></label>'+
        '<label><span class="sub">Veículo</span><select id="deliveryPlanVehicle" style="width:100%;min-height:42px">'+smartDeliveryOptionHtml('vehicles',state.deliveryPlan.vehicle_id)+'</select></label>'+
      '</div></div>';
  }
