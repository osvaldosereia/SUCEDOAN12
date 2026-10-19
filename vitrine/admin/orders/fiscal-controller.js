// Fiscal reads and mutations belong to the captured order, never the next editor.
(function(global){
  function create({api,session,cache,ui,formatters,orderView,view}){
    const {query:$,confirm,toast,currentOperator}=ui;
    const {esc,dateTime,money,errorMessage}=formatters;
    const {orderDisplayCode}=orderView;
    const busy=new Set(),feedback=new Map(),versions=new Map();
    const post=(action,payload)=>api(action,{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    function publish(id,fiscal,token){
      versions.set(id,(versions.get(id)||0)+1);
      cache()[id]=fiscal;
      if(session.isCurrent(token)){
        session.request('fiscal'); // Invalidate a read started before this mutation.
        session.fiscal=fiscal;
      }
    }
    async function readFiscal(id){
      const target=cache(),initial=target[id],version=(versions.get(id)||0)+1;versions.set(id,version);
      let fiscal;
      try{fiscal=await post('order_fiscal_status',{id})}
      catch(error){fiscal={error:String(error?.message||'fiscal_unavailable')}}
      if(versions.get(id)===version&&cache()===target&&target[id]===initial)target[id]=fiscal;
      return fiscal;
    }
    async function loadCurrentOrderFiscal(repaint=true){
      const id=session.detail?.order?.id;if(!id)return;
      const ticket=session.request('fiscal'),fiscal=await readFiscal(id);
      if(!session.accepts(ticket))return;
      session.fiscal=fiscal;
      if(repaint)view.paint();
      return fiscal;
    }
    async function loadCurrentOrderBlingPreview(repaint=true){
      const id=session.detail?.order?.id;if(!id)return;
      const ticket=session.request('preview');let preview;
      try{preview=await post('bling_preview_order_sync',{id})}
      catch(error){preview={error:String(error?.message||'bling_preview_unavailable')}}
      if(!session.accepts(ticket))return;
      session.preview=preview;
      if(repaint)view.paint();
    }
    async function withOrder(action){
      const order=session.detail?.order;if(!order||busy.has(String(order.id)))return;
      const id=String(order.id),token=session.capture();busy.add(id);view.paint();
      try{return await action(order,token)}
      finally{busy.delete(id);if(session.isCurrent(token))view.paint()}
    }
    async function recoverCurrentOrderBling(){
      const order=session.detail?.order;
      if(!order||order.status!=='ready'||busy.has(String(order.id)))return;
      if(!confirm('Recuperar a venda do pedido #'+orderDisplayCode(order)+' no Bling?\n\nSerá consultada a venda existente e atualizado seu vínculo e status, sem emitir NF-e nesta etapa.'))return;
      return withOrder(async(o,token)=>{
        try{
          const result=await post('order_fiscal_recover_bling_v1',{id:o.id,operator:currentOperator()||'Operação'});
          publish(o.id,result.fiscal||null,token);
          feedback.set(String(o.id),'Venda no Bling recuperada e confirmada como Verificado. '+(result.fiscal?.can_issue?'A NF-e está liberada para tentativa manual.':result.fiscal?.authorized?'NF-e já autorizada.':'Consulte a situação fiscal antes de prosseguir.'));
          toast('Venda recuperada no Bling · confira a NF-e');
        }catch(error){
          feedback.set(String(o.id),'Falha na recuperação: '+fiscalBlockReasonLabel(error?.message||'bling_recovery_failed')+'. Os itens separados foram preservados.');
          toast(feedback.get(String(o.id)));
        }finally{
          const fiscal=await readFiscal(o.id);
          if(session.isCurrent(token))session.fiscal=fiscal;
        }
      });
    }
    async function recheckCurrentOrderFiscal(){
      return withOrder(async(o,token)=>{
        try{
          const result=await post('order_fiscal_recheck_v1',{id:o.id}),f=result.fiscal||{},reason=result.reconcile?.reason||'';
          publish(o.id,result.fiscal||null,token);
          feedback.set(String(o.id),f.authorized?'Nota autorizada pela SEFAZ.'
            :f.invoice_id?'Nota '+(f.invoice_number||f.invoice_id)+' encontrada; situação: '+(f.sefaz_status||f.stage||'pendente')+'.'
            :reason==='invoice_not_found'?'Consulta concluída: nenhuma NF-e encontrada no Bling para esta venda.'
            :reason==='fiscal_dispatch_not_eligible'?'Consulta concluída: ainda existe bloqueio de vínculo ou de verificação da venda.'
            :'Consulta concluída: '+(f.stage||'pendente')+'. Nenhuma NF-e foi enviada nesta consulta.');
          toast(feedback.get(String(o.id)));
        }catch(error){
          feedback.set(String(o.id),'Não foi possível consultar o Bling: '+fiscalBlockReasonLabel(error?.message||'fiscal_status_unavailable'));
          toast(feedback.get(String(o.id)));
        }
      });
    }
    async function executeCurrentOrderFiscalCanary(){
      const order=session.detail?.order;if(!order||order.status!=='ready'||busy.has(String(order.id)))return;
      if(session.fiscal?.can_issue!==true){toast('A NF-e ainda não está liberada para emissão');return}
      if(!confirm('EMITIR NF-e do pedido #'+orderDisplayCode(order)+' agora?\n\nA emissão será enviada ao Bling/SEFAZ.'))return;
      return withOrder(async(o,token)=>{
        try{
          const result=await post('order_fiscal_issue_v4',{id:o.id,confirmation:'EMITIR_NFE',operator:currentOperator()||'Operação'});
          const fiscal=result.fiscal||result;publish(o.id,fiscal,token);
          toast(fiscal?.authorized?'NF-e autorizada':fiscal?.stage==='rejected'?'NF-e rejeitada · consulte a situação fiscal':result.requires_reconciliation?'Resultado da emissão ainda não confirmado · reconsulte antes de tentar novamente':'Solicitação enviada ao Bling · aguardando confirmação');
          const fresh=await readFiscal(o.id);if(session.isCurrent(token))session.fiscal=fresh;
        }catch(error){
          const current=await readFiscal(o.id);if(session.isCurrent(token))session.fiscal=current;
          const job=current.provider?.job||{},reason=job.error_detail||job.error_code||error?.message||'fiscal_issue_failed';
          const uncertain=(current.blockers||[]).includes('invoice_generation_recovery_required')||['generating','authorizing'].includes(String(job.status||''))||/uncertain|timeout|result.*unknown|resultado.*incerto/i.test(String(reason||''));
          toast(current.authorized?'NF-e autorizada após reconciliação':uncertain?'Resultado fiscal incerto · reconsulte/reconcilie a NF-e antes de tentar outra emissão':'Emissão fiscal não confirmada · '+fiscalBlockReasonLabel(reason));
        }
      });
    }
    async function startCurrentOrderDispatchV4(){
      const order=session.detail?.order;if(!order||order.status!=='ready'||busy.has(String(order.id)))return;
      const fiscal=session.fiscal||{};
      if(fiscal.authorized!==true&&fiscal.stage!=='authorized'){toast('A NF-e precisa estar autorizada antes da saída');return}
      if(!confirm('Confirmar que o pedido #'+orderDisplayCode(order)+' SAIU PARA ENTREGA?'))return;
      return withOrder(async(o,token)=>{
        try{
          await post('order_dispatch_start_v4',{id:o.id,operator:currentOperator()||'Expedição',idempotency_key:'dispatch-v4:'+o.id});
          toast('Saída para entrega registrada');delete cache()[o.id];
          await view.refreshList();if(session.isCurrent(token))await view.open(o.id);
        }catch(error){toast(errorMessage(error.message))}
      });
    }
    function openCurrentDanfe(){
      const o=session.detail?.order;if(!o)return;
      const fiscal=session.fiscal||{},gate=fiscal.dispatch_gate||{};
      if(fiscal.authorized!==true&&gate.authorized!==true){toast('A NF-e ainda não está autorizada');return}
      return view.openDanfe(o.id,orderDisplayCode(o));
    }
  function fiscalBlockReasonLabel(code){
    const map={
      delivery_not_confirmed:'Aguardando confirmação da entrega',
      payment_not_confirmed:'Aguardando confirmação do pagamento',
      payment_review_required:'Pagamento precisa de revisão',
      settled_amount_missing:'Valor recebido não informado',
      settled_amount_mismatch:'Valor recebido diferente do pedido',
      order_cancelled:'Pedido cancelado',
      order_returned:'Pedido devolvido',
      fiscal_control_missing:'Controle fiscal ainda não iniciado',
      fiscal_subtotal_item_sum_mismatch:'A soma dos produtos não confere com o subtotal fiscal',
      canonical_total_not_balanced:'O total do pedido não confere com subtotal, acréscimos e descontos',
      bling_order_not_linked:'O pedido ainda não está vinculado à venda no Bling',
      bling_order_not_verified:'A venda ainda não chegou ao status Verificado no Bling',
      invoice_generation_failed:'O Bling recebeu a solicitação, mas não conseguiu gerar a NF-e',
      fiscal_dispatch_preflight_failed:'A conferência fiscal encontrou dados inconsistentes',
      fiscal_dispatch_not_eligible:'O pedido ainda não está apto para emissão',
      invoice_generation_recovery_required:'Tentativa anterior teve erro ou tempo de resposta excedido. A recuperação automática está verificando a nota antes de permitir novo envio.',
      fiscal_status_unavailable:'Não foi possível consultar o retorno fiscal no Bling'
    };
    return map[code]||String(code||'').replaceAll('_',' ');
  }
  function fiscalDiagnosticHtml(f){
    if(!f||f.authorized===true)return '';
    const provider=f.provider||{},job=provider.job||{},readiness=f.readiness||{},raw=[
      ...(Array.isArray(f.hard_blockers)?f.hard_blockers:[]),
      ...(Array.isArray(f.blockers)?f.blockers:[]),
      job.error_code,f.fiscal_block_reason
    ].filter(Boolean),reasons=[...new Set(raw)].map(fiscalBlockReasonLabel);
    const detail=job.error_detail||provider.error_detail||provider.detail||'';
    const attempts=job.attempts!=null?Number(job.attempts):null;
    const lines=[];
    if(reasons.length)lines.push('<strong>Motivo identificado</strong><div>'+reasons.map(esc).join(' · ')+'</div>');
    if(detail)lines.push('<div style="margin-top:6px">'+esc(detail)+'</div>');
    if(readiness?.eligible===false&&readiness?.reason)lines.push('<div style="margin-top:6px">Pré-validação: '+esc(fiscalBlockReasonLabel(readiness.reason))+'</div>');
    if(attempts!=null)lines.push('<div style="margin-top:6px">Tentativas registradas: '+attempts+'</div>');
    const repair=f.fiscal_recovery||null,diagnosis=repair?.diagnostics||{};
    const repairLabels={
      started:'Verificação automática iniciada',
      existing_invoice_reconciled:'NF-e existente encontrada e reconciliada',
      existing_invoice_needs_authorization_or_review:'NF-e encontrada no Bling: aguarda autorização ou revisão',
      generation_result_uncertain_manual_reconcile_required:'O Bling não confirmou a geração; nenhuma nova nota foi criada para evitar duplicidade',
      unverified_ncm_requires_review:'NCM não possui documentação fiscal suficiente para correção automática',
      proposed_ncm_not_in_official_active_catalog:'Código proposto não consta na tabela NCM vigente',
      official_classif_unavailable:'Tabela oficial de NCM temporariamente indisponível',
      official_classif_data_unrecognized:'Tabela oficial de NCM precisa ser validada antes da correção',
      auto_invoice_authorized:'NF-e corrigida e autorizada automaticamente',
      auto_invoice_authorization_pending:'NF-e enviada; aguardando retorno da SEFAZ',
      auto_invoice_retry_failed:'Nova tentativa falhou; erro registrado',
      fiscal_preflight_blocked:'A conferência fiscal ainda possui bloqueios',
      unrecognized_fiscal_error:'Erro fiscal não reconhecido com segurança',
      separation_not_completed:'Separação física ainda não foi concluída',
      unable_to_identify_fiscal_products:'Não foi possível identificar inequivocamente o item fiscal',
      ambiguous_product_name:'Há ambiguidade entre os nomes dos produtos; bloqueio preventivo'
    };
    if(repair){
      const label=repairLabels[repair.stage]||String(repair.stage||'').replaceAll('_',' ');
      lines.push('<div style="margin-top:8px"><strong>Recuperação automática</strong><div>'+esc(label)+'</div></div>');
      const corrected=Array.isArray(diagnosis.corrected_products)?diagnosis.corrected_products.length:0;
      if(corrected)lines.push('<div>'+corrected+' produto(s) com NCM corrigido e conferido no Bling.</div>');
      if(Array.isArray(diagnosis.issues)&&diagnosis.issues.length)lines.push('<div>Itens para revisão: '+diagnosis.issues.length+'. Nenhum NCM será adivinhado.</div>');
      if(repair.created_at)lines.push('<div class="muted">Última análise: '+esc(dateTime(repair.created_at))+'</div>');
    }
    if(!lines.length&&f.stage==='pending')lines.push('<strong>Aguardando retorno do Bling</strong><div>A solicitação fiscal ainda não trouxe NF-e nem erro específico.</div>');
    return lines.length?'<div class="rule-notice warn" style="margin-top:8px">'+lines.join('')+'</div>':'';
  }

  function orderFiscalHtml(f,o){
    if(!f)return '<div class="rule-notice"><strong>Carregando controle fiscal…</strong><div>Consultando a situação da NF-e.</div></div>';
    if(f.error)return '<div class="rule-notice warn"><strong>NF-e INDISPONÍVEL</strong><div>A saída continua bloqueada até o controle fiscal voltar.</div></div>';
    const blockers=Array.isArray(f.blockers)?f.blockers:[];
    if(f.authorized===true||f.stage==='authorized')return '<div class="rule-notice"><strong>NF-e AUTORIZADA</strong><div>'+(f.invoice_number?'Nota '+esc(f.invoice_number)+' · ':'')+esc(f.sefaz_status||'Autorizada pela SEFAZ')+'</div></div>';
    if(f.stage==='processing')return '<div class="rule-notice warn"><strong>NF-e EM PROCESSAMENTO</strong><div>Aguarde a autorização. Não repita a geração da nota.</div></div>';
    if(f.stage==='rejected')return '<div class="rule-notice warn"><strong>NF-e REJEITADA</strong><div>'+esc(f.sefaz_status||blockers.map(fiscalBlockReasonLabel).join(' · ')||'Revise o retorno fiscal antes de tentar novamente.')+'</div></div>'+fiscalDiagnosticHtml(f);
    if(f.stage==='blocked')return '<div class="rule-notice warn"><strong>NF-e BLOQUEADA</strong><div>'+esc(blockers.map(fiscalBlockReasonLabel).join(' · ')||'Existem requisitos pendentes para emissão.')+'</div></div>'+fiscalDiagnosticHtml(f);
    return '<div class="rule-notice warn"><strong>NF-e PENDENTE</strong><div>A nota ainda não foi autorizada. Veja abaixo o retorno mais recente da integração.</div></div>'+fiscalDiagnosticHtml(f);
  }
  function fiscalCanaryActionHtml(f,o){
    if(!o||!['ready','out_for_delivery','delivered'].includes(o.status))return '';
    const busy=busy.has(String(o.id)),disabled=busy?' disabled':'';
    const latest=feedback.get(String(o.id))||'';
    const feedback=latest?'<div class="rule-notice" role="status" style="margin-top:8px"><strong>Última consulta / tentativa</strong><div>'+esc(latest)+'</div></div>':'';
    const check='<button class="secondary" id="refreshFiscalCanary" type="button"'+disabled+'>CONSULTAR BLING / NF-e</button>';
    if(o.status!=='ready')return feedback+(o.status==='out_for_delivery'?'<div class="rule-notice"><strong>SAIU PARA ENTREGA</strong><div>NF-e deve estar autorizada antes da expedição.</div></div>':'')+'<div class="print-actions">'+check+'</div>';
    if(f?.authorized===true||f?.stage==='authorized')return feedback+'<div class="print-actions"><button class="primary" id="startDispatchV4" type="button">SAIU PARA ENTREGA</button>'+check+'</div>';
    const blockers=[...(f?.hard_blockers||[]),...(f?.blockers||[])].map(String);
    const missingLink=blockers.some(x=>['bling_order_not_linked','bling_order_not_verified','external_order_key_missing'].includes(x));
    const recover=missingLink?'<button class="primary" id="recoverBlingOrder" type="button"'+disabled+'>RECUPERAR VENDA NO BLING</button>':'';
    const invoiceId=Number(f?.invoice_id||f?.bling_invoice_id||0);
    const issue=f?.can_issue===true&&!missingLink?'<button class="primary" id="executeFiscalCanary" type="button"'+disabled+'>'+(invoiceId?'TENTAR AUTORIZAR NF-e':'TENTAR EMITIR NF-e')+'</button>':'';
    const explanation=missingLink
      ?'<div class="muted" style="margin-top:8px">Recupera a venda existente e confirma o status Verificado. Não cria uma segunda venda para o mesmo pedido.</div>'
      :invoiceId?'<div class="muted" style="margin-top:8px">NF-e localizada no Bling. Consulte primeiro a situação antes de tentar autorizar; o sistema impede o reenvio quando a transmissão já está em andamento.</div>':'';
    return feedback+explanation+'<div class="print-actions" style="margin-top:8px">'+recover+issue+check+'</div>';
  }
    return Object.freeze({loadCurrentOrderFiscal,loadCurrentOrderBlingPreview,recoverCurrentOrderBling,recheckCurrentOrderFiscal,executeCurrentOrderFiscalCanary,startCurrentOrderDispatchV4,openCurrentDanfe,orderFiscalHtml,fiscalCanaryActionHtml,fiscalBlockReasonLabel});
  }
  global.DonaAntoniaAdminOrderFiscal=Object.freeze({create});
})(window);
