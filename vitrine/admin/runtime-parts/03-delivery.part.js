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
    const selected=state.expeditionSelected.map(id=>state.orders.find(o=>o.id===id)).filter(o=>o&&o.status==='ready'&&fiscalAuthorizedForDispatch(o)&&!o.delivery_return?.dispatch_blocked);
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
      await loadDeliveryRuns();toast('Carga confirmada');if(state.tab==='driver')paintDriverQueue();else paintExpeditionBody();
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
    const selected=state.orders.filter(o=>o.status==='ready'&&fiscalAuthorizedForDispatch(o)&&state.expeditionSelected.includes(o.id));
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
    try{const data=await api('orders');state.orders=data.orders||[];state.expeditionDataStale=false}catch{state.expeditionDataStale=true;refreshFailed=true}
    paintExpeditionBody();
    const result=failed.length?ok+' atualizado(s) · '+failed.length+' precisa(m) revisão':ok+' pedido(s) saíram para entrega';
    toast(refreshFailed?result+' · A lista pode estar desatualizada; atualize antes de continuar.':result);
  }
  function paintExpeditionBody(){
    const host=$('#expeditionBody');if(!host)return;
    if(state.expeditionDataStale){host.innerHTML='<div class="empty">A lista de pedidos está desatualizada. Atualize antes de continuar.<br><button class="text" id="retryExpeditionRefresh" type="button">Atualizar expedição</button></div>';$('#retryExpeditionRefresh').onclick=renderExpedition;return}
    const visible=state.orders.filter(o=>orderSearchMatch(o,state.expeditionQuery));
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
        return '<div class="dispatch-bulk"><label class="check"><input id="selectAllReady" type="checkbox" '+(dispatchableReady.length&&selected.length===dispatchableReady.length?'checked':'')+' '+(dispatchableReady.length?'':'disabled')+'><span>Selecionar os fiscalmente liberados desta lista</span></label><div class="dispatch-bulk-actions"><div><strong>'+selected.length+' selecionado(s) · '+money(selectedTotal)+'</strong>'+(paymentSummary?'<span class="sub">A receber: '+esc(paymentSummary)+'</span>':'')+(fiscalPendingReady.length?'<span class="sub warn-text">'+fiscalPendingReady.length+' com fiscal pendente</span>':'')+'</div><button class="secondary" id="planCar1" type="button" '+(selected.length?'':'disabled')+'>Preparar Rota 1</button><button class="secondary" id="planCar2" type="button" '+(selected.length?'':'disabled')+'>Preparar Rota 2</button><button class="secondary" id="printDispatchManifest" type="button" '+(selected.length?'':'disabled')+'>Imprimir romaneio</button><button class="primary" id="bulkDispatchBtn" type="button" '+(selected.length?'':'disabled')+'>Marcar saída</button></div></div>';
      })():'')+
      '<div class="dispatch-grid">'+
        expeditionSection('Aguardando saída','prontos para expedir',ready,'Nenhum pedido aguardando saída.')+
        expeditionSection('Em entrega','acompanhar até a confirmação',delivery,'Nenhum pedido em entrega.')+
        expeditionSection('Entregues hoje','Últimos entregues do dia · pagamento e fiscal',delivered,'Nenhuma entrega concluída hoje.')+
      '</div>';
    document.querySelectorAll('[data-expedition-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.expeditionOrder));
    document.querySelectorAll('[data-expedition-fiscal]').forEach(b=>b.onclick=()=>openOrder(b.dataset.expeditionFiscal));
    document.querySelectorAll('[data-expedition-danfe]').forEach(b=>b.onclick=()=>{const o=state.orders.find(x=>x.id===b.dataset.expeditionDanfe);if(o)openDanfeForOrder(o.id,orderDisplayCode(o))});
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
    const all=state.orders.filter(o=>o.status==='out_for_delivery'),vehicle=state.driverVehicle||'all';if(vehicle==='all')return all;
    const run=activeDeliveryRun(vehicle);if(!run)return [];const byId=new Map(all.map(o=>[o.id,o]));
    return (run.stops||[]).map(s=>{const o=byId.get(s.order_id);return o?{...o,__delivery_stop:s}:null}).filter(Boolean);
  }
  function paintDriverQueue(){
    const host=$('#driverQueue');if(!host)return;const q=normalize($('#driverSearch')?.value||'');let rows=driverOrders();if(q)rows=rows.filter(o=>orderSearchMatch(o,q));
    const shell=$('#driverRouteToolbar');if(shell){
      shell.innerHTML=driverVehicleToolbar();
      shell.querySelectorAll('[data-driver-vehicle]').forEach(b=>b.onclick=()=>{state.driverVehicle=b.dataset.driverVehicle;paintDriverQueue()});
      shell.querySelectorAll('[data-driver-load]').forEach(b=>b.onclick=()=>confirmRunLoading(b.dataset.driverLoad));
    }
    host.innerHTML=rows.length?rows.map(driverRow).join(''):'<div class="empty">Nenhuma entrega em rota para esta seleção.</div>';
    host.querySelectorAll('[data-driver-delivered]').forEach(b=>b.onclick=()=>confirmDeliveryFromExpedition(b.dataset.driverDelivered));
    host.querySelectorAll('[data-driver-failed]').forEach(b=>b.onclick=()=>returnOrderToExpedition(b.dataset.driverFailed,false));
    host.querySelectorAll('[data-driver-returned]').forEach(b=>b.onclick=()=>confirmPhysicalDeliveryReturn(b.dataset.driverReturned));
    host.querySelectorAll('[data-driver-open]').forEach(b=>b.onclick=()=>openOrder(b.dataset.driverOpen));
  }
  async function loadDriverQueue(){const [data]=await Promise.all([api('orders'),loadDeliveryRuns()]);state.orders=data.orders||[];paintDriverQueue()}
  async function renderDriver(){
    const content=$('#content');content.innerHTML='<div class="separation-tablet"><div class="page-head"><div><h1>Entregador</h1><p>Rota, endereço, navegação e conclusão da entrega.</p></div><button class="secondary" id="refreshDriver" type="button">Atualizar</button></div><div id="driverRouteToolbar"></div><div class="separation-tablet-toolbar"><input id="driverSearch" type="search" inputmode="search" autocomplete="off" placeholder="Pedido, cliente, telefone ou endereço"><button class="secondary" id="clearDriver" type="button">Limpar</button></div><div class="separation-tablet-list" id="driverQueue"><div class="loading">Carregando rota…</div></div></div>';
    $('#refreshDriver').onclick=loadDriverQueue;$('#driverSearch').oninput=paintDriverQueue;$('#clearDriver').onclick=()=>{$('#driverSearch').value='';paintDriverQueue();$('#driverSearch').focus()};
    try{await loadDriverQueue()}catch(e){$('#driverQueue').innerHTML='<div class="empty">Não consegui carregar as entregas. <button class="text" id="retryDriver">Tentar novamente</button></div>';if($('#retryDriver'))$('#retryDriver').onclick=loadDriverQueue}
  }

  async function renderExpedition(){
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Expedição</h1><p>Pedidos prontos, em entrega e entregues em uma única fila operacional.</p></div><button class="secondary" id="refreshExpedition">Atualizar</button></div>'+
      '<div class="toolbar"><input id="expeditionSearch" type="search" placeholder="Buscar pedido, cliente, telefone ou endereço…" value="'+esc(state.expeditionQuery)+'"><button class="secondary" id="clearExpeditionSearch" type="button">Limpar</button></div>'+
      '<div id="expeditionBody"><div class="loading">Carregando expedição…</div></div>';
    $('#refreshExpedition').onclick=renderExpedition;
    $('#expeditionSearch').oninput=e=>{state.expeditionQuery=e.target.value;paintExpeditionBody()};
    $('#clearExpeditionSearch').onclick=()=>{state.expeditionQuery='';$('#expeditionSearch').value='';paintExpeditionBody()};
    try{
      const [data]=await Promise.all([api('orders'),loadDeliveryRuns()]);state.orders=data.orders||[];
      state.expeditionDataStale=false;
      const readyRows=state.orders.filter(o=>o.status==='ready');
      await loadFiscalForOrders(readyRows);
      paintExpeditionBody();
    }catch(e){
      $('#expeditionBody').innerHTML='<div class="empty">Não consegui carregar a expedição. <button class="text" id="retryExpedition">Tentar novamente</button></div>';
      if($('#retryExpedition'))$('#retryExpedition').onclick=renderExpedition;
    }
  }

