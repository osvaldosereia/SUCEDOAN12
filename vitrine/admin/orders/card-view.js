// Order card markup. Status and readiness decisions stay in the shared card model.
(function(global){
  function create({escapeHtml,money,dateTime,orderDisplayCode,separationMoney,orderCardPhone,cardModel,customerReadiness,listState,statusKey,fiscalByOrder}){
    const esc=escapeHtml;
    const {orderV3Milestones,orderSeparationSummary,separatorLabel,orderCardOperationalTags}=cardModel;
    const {isOrderCustomerDataPending:orderCustomerDataPending,orderCustomerDataPendingReasons}=customerReadiness;
    function render(order){
      const milestones=orderV3Milestones(order),fiscal=fiscalByOrder(order.id)||null,separation=orderSeparationSummary(order),assignment=separation.assignment||{},counts=separation.counts||{},assigned=Boolean(assignment.separator_key),separator=assignment.separator_label||separatorLabel(assignment.separator_key),separatedCount=Number(counts.separated||0),missingCount=Number(counts.missing||0),checked=separatedCount+missingCount,totalItems=Number(counts.total||0),pendingCount=Math.max(0,Number(counts.pending??(totalItems-checked))||0),missingValue=Number(separation.missing_subtotal||counts.missing_subtotal||0),progressPct=totalItems>0?Math.max(0,Math.min(100,Math.round((checked/totalItems)*100))):0;
      let stage='received',stageLabel='RECEBIDO';
      if(milestones.cancelled){stage='cancelled';stageLabel='CANCELADO'}
      else if(milestones.delivered){stage='done';stageLabel='ENTREGUE'}
      else if(order.status==='out_for_delivery'){stage='delivery';stageLabel='SAIU PARA ENTREGA'}
      else if(milestones.separated){stage='separated';stageLabel='PEDIDO JÁ SEPARADO'}
      else if(assigned&&milestones.confirmed){stage='separating';stageLabel='EM SEPARAÇÃO · '+separator.toUpperCase()}
      else if(milestones.confirmed){stage='waiting';stageLabel='AGUARDANDO SEPARAÇÃO'}
      const cardClass=['waiting','separating','separated','delivery','done'].includes(stage)?' '+stage:'';
      let progress='';
      if(milestones.confirmed&&totalItems>0&&!milestones.delivered&&!milestones.cancelled){
        const progressTitle=milestones.separated?'Separação concluída':assigned?'Separação em andamento':'Itens para separar';
        progress='<div class="order-v3-progress"><div class="order-v3-progress-head"><span>'+esc(progressTitle)+'</span><strong>'+checked+' de '+totalItems+' itens</strong></div><div class="order-v3-progress-bar" aria-label="Progresso da separação" aria-valuemin="0" aria-valuemax="'+totalItems+'" aria-valuenow="'+checked+'"><i style="width:'+progressPct+'%"></i></div><div class="order-v3-progress-foot"><span class="ok">'+separatedCount+' separado'+(separatedCount===1?'':'s')+'</span><span>'+pendingCount+' pendente'+(pendingCount===1?'':'s')+'</span>'+(missingCount?'<span class="missing">'+missingCount+' faltou'+(missingCount===1?'':'aram')+(missingValue>0?' · − '+esc(separationMoney(missingValue)):'')+'</span>':'')+(assigned&&assignment.assigned_at&&!milestones.separated?'<span>Iniciado '+esc(dateTime(assignment.assigned_at))+'</span>':'')+'</div></div>';
      }
      let controls='';
      if(orderCustomerDataPending(order)){
        controls='<button class="order-v3-control" type="button" disabled title="'+esc(orderCustomerDataPendingReasons(order).join(' · '))+'">AGUARDANDO DADOS DO CLIENTE</button>';
      }else if(!milestones.confirmed&&!milestones.cancelled){
        controls='<button class="order-v3-control" type="button" data-v3-confirm="'+esc(order.id)+'">CONFIRMAR PEDIDO</button>';
      }else if(order.status==='ready'&&!milestones.cancelled){
        if(fiscal?.authorized===true||fiscal?.stage==='authorized')controls='<button class="order-v3-control" type="button" data-v3-dispatch="'+esc(order.id)+'">SAIU PARA ENTREGA</button>';
        else if(fiscal)controls='<button class="order-v3-control" type="button" data-open-order="'+esc(order.id)+'">'+(fiscal.stage==='blocked'||fiscal.stage==='rejected'?'REVISAR NF-e':'ACOMPANHAR NF-e')+'</button>';
        else controls='<button class="order-v3-control" type="button" disabled>NF-e automática…</button>';
      }else if(order.status==='out_for_delivery'&&!milestones.delivered&&!milestones.cancelled){
        controls='<button class="order-v3-control" type="button" data-v3-deliver="'+esc(order.id)+'">ENTREGUE</button><button class="order-v3-control" type="button" data-v3-delivery-fail="'+esc(order.id)+'">NÃO ENTREGUE</button>';
      }
      const separationLabel=milestones.separated?'VER SEPARAÇÃO':assigned?'CONTINUAR SEPARAÇÃO':'INICIAR SEPARAÇÃO';
      const primaryAction=milestones.confirmed&&!milestones.delivered&&!milestones.cancelled?'<button class="order-v3-action main '+(milestones.separated?'secondary-action':'primary')+'" type="button" data-v3-separation="'+esc(order.id)+'">'+separationLabel+'</button>':'';
      const supportTags=orderCardOperationalTags(order,milestones),manualSelected=listState.manualQueueIds.has(String(order.id));
      const manualEligible=statusKey(order)==='confirmed'&&order.status==='confirmed';
      const manualQueueButton=(manualEligible||(manualSelected&&listState.orderStatusTab==='manual'&&!milestones.separated))?'<button class="order-v3-action secondary-action" type="button" data-manual-queue-'+(manualSelected?'remove':'add')+'="'+esc(order.id)+'">'+(manualSelected?'RETIRAR DE SEPARAR AGORA':'SEPARAR AGORA')+'</button>':'';
      return '<article class="order-v3-card'+cardClass+'"><div class="order-v3-topline"><span class="order-v3-stage '+esc(stage)+'">'+esc(stageLabel)+'</span><strong class="order-v3-money">'+money(order.total_cents||0)+'</strong></div><div class="order-v3-identity"><strong>#'+esc(orderDisplayCode(order))+' · '+esc(order.customer_name||'Sem cliente')+'</strong><small><span class="order-v3-phone">Tel. '+esc(orderCardPhone(order))+'</span><span>'+esc(dateTime(order.created_at))+'</span></small></div>'+(!milestones.confirmed&&!milestones.cancelled?'<div class="order-v3-do-not-build">NÃO MONTAR ESSE PEDIDO</div>':'')+progress+(supportTags?'<div class="order-v3-tags">'+supportTags+'</div>':'')+(controls?'<div class="order-v3-controls">'+controls+'</div>':'')+'<div class="order-v3-actions">'+primaryAction+manualQueueButton+'<button class="order-v3-action secondary-action" type="button" data-order-chat="'+esc(order.id)+'">💬 VER CONVERSA</button><button class="order-v3-action '+(primaryAction?'secondary-action':'primary')+'" type="button" data-open-order="'+esc(order.id)+'">ABRIR PEDIDO</button></div></article>';
    }
    return Object.freeze({render});
  }
  global.DonaAntoniaAdminOrderCardView=Object.freeze({create});
})(window);
