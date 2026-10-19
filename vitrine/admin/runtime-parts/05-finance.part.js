  function clearFinanceSession(expectedToken=''){
    const current=financeSessionToken();
    if(expectedToken&&current&&current!==expectedToken)return false;
    sessionStorage.removeItem('da_finance_access_token_v1');
    state.financeCatalogs=null;
    return true;
  }
  async function adminStepUp(){return await financeStepUp()}
  async function financeStepUp(){
    const existing=financeSessionToken();
    if(existing)return existing;
    if(state.financeAuthPromise)return await state.financeAuthPromise;
    state.financeAuthPromise=(async()=>{
      try{
        const authRes=await fetch(FINANCE_AUTH_API,{
          method:'POST',
          headers:{'Content-Type':'application/json','apikey':FINANCE_PUBLIC_KEY},
          body:JSON.stringify({pin:'000000'}),
          cache:'no-store'
        });
        const auth=await authRes.json().catch(()=>({}));
        if(!authRes.ok||!auth?.ok)throw new Error(auth?.error||'admin_auto_auth_failed');
        const verifyRes=await fetch(FINANCE_VERIFY_API,{
          method:'POST',
          headers:{'Content-Type':'application/json','apikey':FINANCE_PUBLIC_KEY},
          body:JSON.stringify({token_hash:auth.token_hash,type:auth.verification_type||'email'}),
          cache:'no-store'
        });
        const verified=await verifyRes.json().catch(()=>({}));
        const token=String(verified?.access_token||'').trim();
        if(!verifyRes.ok||!token)throw new Error(verified?.msg||verified?.error_description||verified?.error||'admin_auto_session_failed');
        sessionStorage.setItem('da_finance_access_token_v1',token);
        return token;
      }finally{
        state.financeAuthPromise=null;
      }
    })();
    return await state.financeAuthPromise;
  }
  async function financeApi(operation,payload={},retryAuth=true){
    const token=await financeStepUp();
    const u=new URL(API);u.searchParams.set('action','bling_finance_action');
    const response=await fetch(u,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({operation,...payload}),
      cache:'no-store'
    });
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(response.status===401&&retryAuth){
      clearFinanceSession(token);
      return await financeApi(operation,payload,false);
    }
    if(!response.ok||data.ok===false)throw new Error(data.error||'service_error');
    return data;
  }
  async function loadFinanceCatalogs(force=false){
    if(state.financeCatalogs&&!force)return state.financeCatalogs;
    const data=await financeApi('catalogs');
    state.financeCatalogs={
      payment_methods:Array.isArray(data.payment_methods)?data.payment_methods:[],
      categories:Array.isArray(data.categories)?data.categories:[],
      financial_accounts:Array.isArray(data.financial_accounts)?data.financial_accounts:[],
      truncated:Boolean(data.truncated)
    };
    return state.financeCatalogs;
  }
  function financeFieldValue(v){
    return v==null?'':String(v);
  }
  function financeMoneyInput(v){
    const n=Number(v);
    return Number.isFinite(n)?n.toFixed(2).replace('.',','):'';
  }
  function financeSelectOptions(list,currentId,placeholder='Não informado'){
    const current=Number(currentId||0);
    const rows=(Array.isArray(list)?list:[]).filter(x=>Number(x?.id||0)>0);
    const hasCurrent=current&&rows.some(x=>Number(x.id)===current);
    const extra=current&&!hasCurrent?[{id:current,description:'Atual #'+current}]:[];
    return '<option value="">'+esc(placeholder)+'</option>'+
      [...extra,...rows].map(x=>'<option value="'+esc(x.id)+'" '+(Number(x.id)===current?'selected':'')+'>'+esc(x.description||x.name||('ID '+x.id))+'</option>').join('');
  }
  function financeCategoryRows(kind,catalogs){
    return (catalogs?.categories||[]).filter(c=>{
      const t=Number(c?.type||0);
      return !t||t===3||(kind==='payable'&&t===1)||(kind==='receivable'&&t===2);
    });
  }
  function financeCatalogDescription(area,id){
    const n=Number(id||0);if(!n)return '';
    const c=state.financeCatalogs||{};
    const rows=area==='payment'?c.payment_methods:area==='account'?c.financial_accounts:c.categories;
    return (rows||[]).find(x=>Number(x.id)===n)?.description||('#'+n);
  }
  function financeFormPayload(form){
    const value=name=>form.querySelector('[name="'+name+'"]')?.value?.trim()||'';
    const number=name=>{const raw=value(name).replace(/\./g,'').replace(',','.');const n=Number(raw);return Number.isFinite(n)&&n>0?n:null};
    const payload={
      vencimento:value('vencimento'),
      valor:number('valor'),
      contato_id:number('contato_id'),
      forma_pagamento_id:number('forma_pagamento_id'),
      dataEmissao:value('dataEmissao'),
      numeroDocumento:value('numeroDocumento'),
      competencia:value('competencia'),
      historico:value('historico'),
      portador_id:number('portador_id'),
      categoria_id:number('categoria_id')
    };
    Object.keys(payload).forEach(k=>{if(payload[k]===''||payload[k]===null)delete payload[k]});
    return payload;
  }
  function financeExtractDetail(kind,account){
    const a=account||{};
    return {
      vencimento:a.vencimento||'',
      valor:a.valor??'',
      contato_id:a.contato?.id||'',
      contato_nome:a.contato?.nome||'',
      forma_pagamento_id:a.formaPagamento?.id||'',
      dataEmissao:a.dataEmissao||'',
      numeroDocumento:a.numeroDocumento||'',
      competencia:a.competencia||'',
      historico:a.historico||'',
      portador_id:a.portador?.id||a.contaContabil?.id||'',
      categoria_id:a.categoria?.id||''
    };
  }
  function financeOpenDialog(title,body,actions=''){
    $('#editorTitle').textContent=title;
    $('#editorBody').innerHTML=body;
    $('#editorActions').innerHTML=actions||'<button class="secondary" id="financeClose" type="button">Fechar</button>';
    if($('#financeClose'))$('#financeClose').onclick=()=>$('#editor').close();
    if(!$('#editor').open)$('#editor').showModal();
  }
  function financeContactLabel(c){
    const parts=[c?.name||'',c?.trade_name||'',c?.document||''].filter(Boolean);
    return parts.join(' · ')||('Contato #'+String(c?.id||''));
  }
  function attachFinanceContactSearch(current={}){
    const input=$('#financeContactSearch'),hidden=$('#financeContactId'),host=$('#financeContactResults');
    if(!input||!hidden||!host)return;
    hidden.value=financeFieldValue(current.contato_id);
    if(current.contato_id){
      state.financeSelectedContact={id:Number(current.contato_id),name:current.contato_nome||('Contato #'+current.contato_id)};
      input.value=current.contato_nome||('Contato #'+current.contato_id);
    }else state.financeSelectedContact=null;

    input.oninput=()=>{
      hidden.value='';
      state.financeSelectedContact=null;
      clearTimeout(state.financeContactSearchTimer);
      const q=input.value.trim();
      if(q.length<2){
        host.innerHTML=q?'<small class="sub">Digite pelo menos 2 caracteres.</small>':'';
        return;
      }
      host.innerHTML='<small class="sub">Buscando no Bling…</small>';
      state.financeContactSearchTimer=setTimeout(async()=>{
        try{
          const data=await financeApi('contact_search',{query:q});
          const contacts=Array.isArray(data.contacts)?data.contacts:[];
          host.innerHTML=contacts.length
            ?'<div class="panel" style="margin-top:6px;padding:6px">'+contacts.map(c=>'<button type="button" class="text" data-finance-contact-id="'+esc(c.id)+'" style="display:block;width:100%;text-align:left;padding:9px 8px">'+esc(financeContactLabel(c))+'</button>').join('')+'</div>'
            :'<small class="sub">Nenhum contato encontrado.</small>';
          host.querySelectorAll('[data-finance-contact-id]').forEach(btn=>btn.onclick=()=>{
            const contact=contacts.find(c=>Number(c.id)===Number(btn.dataset.financeContactId));
            if(!contact)return;
            hidden.value=String(contact.id);
            input.value=financeContactLabel(contact);
            state.financeSelectedContact={id:Number(contact.id),name:financeContactLabel(contact)};
            host.innerHTML='';
          });
        }catch(e){
          host.innerHTML='<small class="danger-text">Não foi possível buscar contatos agora.</small>';
        }
      },320);
    };
  }
  function financeActionErrorMessage(error){
    const code=String(error?.message||error||'');
    const map={
      boleto_validation_failed:'Para usar boleto, informe histórico, selecione uma conta financeira apta, use vencimento de hoje em diante e mantenha o contato do Bling com e-mail e endereço completos.',
      validation_failed:'Revise os campos obrigatórios antes de continuar.',
      bling_finance_write_uncertain:'Resultado incerto. Não tente novamente sem revisar o lançamento no Bling.',
      finance_owner_required:'Somente o proprietário pode operar o financeiro.',
      finance_session_invalid:'A sessão financeira expirou. Tente novamente.'
    };
    return map[code]||code||'Não foi possível concluir a operação.';
  }
  async function openFinanceEditor(kind,id=0){
    const isReceive=kind==='receivable';
    let current={},catalogs={payment_methods:[],categories:[],financial_accounts:[]},catalogError=false;
    financeOpenDialog('Carregando…','<div class="loading">Consultando o Bling…</div>');
    try{
      catalogs=await loadFinanceCatalogs();
      if(id){
        const detail=await financeApi('detail',{kind,id});
        current=financeExtractDetail(kind,detail.account);
      }
    }catch(e){
      if(id){financeOpenDialog('Financeiro','<div class="empty">Não consegui carregar esse lançamento.</div>');return}
      catalogError=true;
    }
    const title=(id?'Editar ':'Novo ')+(isReceive?'conta a receber':'conta a pagar');
    const today=cuiabaDayKey(new Date());
    const categories=financeCategoryRows(kind,catalogs);
    financeOpenDialog(title,
      (catalogError?'<div class="rule-notice warn"><strong>Listas do Bling indisponíveis</strong><div>Tente novamente em instantes antes de salvar.</div></div>':'')+
      (catalogs.truncated?'<div class="rule-notice warn"><strong>Lista grande</strong><div>Alguns cadastros podem não aparecer. Use a busca de contato e revise os dados antes de confirmar.</div></div>':'')+
      '<form id="financeForm" class="form-grid">'+
        '<label><span>Vencimento *</span><input name="vencimento" type="date" required value="'+esc(current.vencimento||today)+'"></label>'+
        '<label><span>Valor *</span><input name="valor" inputmode="decimal" required value="'+esc(financeMoneyInput(current.valor))+'"></label>'+
        '<label class="span-2"><span>Contato no Bling *</span><input id="financeContactSearch" type="search" autocomplete="off" placeholder="Digite nome, CPF/CNPJ, e-mail ou código" value="'+esc(current.contato_nome||'')+'"><input id="financeContactId" name="contato_id" type="hidden" value="'+esc(financeFieldValue(current.contato_id))+'"><div id="financeContactResults"></div></label>'+
        '<label><span>Forma de pagamento</span><select id="financePaymentMethod" name="forma_pagamento_id">'+financeSelectOptions(catalogs.payment_methods,current.forma_pagamento_id,'Não informar')+'</select></label>'+
        '<label><span>Conta financeira / portador</span><select id="financePortador" name="portador_id">'+financeSelectOptions(catalogs.financial_accounts,current.portador_id,'Não informar')+'</select></label>'+
        '<label><span>Categoria</span><select name="categoria_id">'+financeSelectOptions(categories,current.categoria_id,'Não informar')+'</select></label>'+
        '<label><span>Data de emissão</span><input name="dataEmissao" type="date" value="'+esc(current.dataEmissao||today)+'"></label>'+
        '<label><span>Nº documento</span><input name="numeroDocumento" value="'+esc(current.numeroDocumento||'')+'"></label>'+
        '<label><span>Competência</span><input name="competencia" type="date" value="'+esc(current.competencia||'')+'"></label>'+
        '<label class="span-2"><span>Histórico</span><textarea id="financeHistory" name="historico">'+esc(current.historico||'')+'</textarea></label>'+
        '<div class="span-2 rule-notice warn" id="financeBoletoNote" style="display:none"><strong>Boleto exige conferência extra</strong><div>O contato precisa ter e-mail e endereço completos no Bling, o vencimento não pode estar no passado, e deve existir uma conta financeira apta para boleto. Salvar a conta não emite o boleto: a emissão continua sendo feita no Bling.</div></div>'+
      '</form>',
      '<button class="secondary" id="financeCancel" type="button">Cancelar</button><button class="primary" id="financePreview" type="button">Revisar antes de salvar</button>'
    );
    attachFinanceContactSearch(current);
    const paymentSelect=$('#financePaymentMethod'),portadorSelect=$('#financePortador'),historyField=$('#financeHistory'),dueField=$('#financeForm [name="vencimento"]'),boletoNote=$('#financeBoletoNote');
    const syncBoletoUi=()=>{
      const selected=(catalogs.payment_methods||[]).find(x=>Number(x.id)===Number(paymentSelect?.value||0));
      const boleto=Number(selected?.type||0)===15;
      if(boletoNote)boletoNote.style.display=boleto?'block':'none';
      if(portadorSelect)portadorSelect.required=boleto;
      if(historyField)historyField.required=boleto;
      if(dueField){
        if(boleto)dueField.min=today;
        else dueField.removeAttribute('min');
      }
    };
    if(paymentSelect)paymentSelect.onchange=syncBoletoUi;
    syncBoletoUi();
    $('#financeCancel').onclick=()=>$('#editor').close();
    $('#financePreview').onclick=async()=>{
      const form=$('#financeForm');
      const payload=financeFormPayload(form);
      if(!payload.contato_id){toast('Selecione um contato do Bling');return}
      try{
        const preview=await financeApi(id?'update_preview':'create_preview',{kind,id:id||undefined,payload});
        openFinanceConfirmation(preview,id?'update_execute':'create_execute',{kind,id:id||undefined,payload});
      }catch(e){toast(financeActionErrorMessage(e))}
    };
  }
  function financePreviewHtml(preview){
    const p=preview?.payload||{};
    const contactId=Number(p.contato?.id||0);
    const contactLabel=state.financeSelectedContact&&Number(state.financeSelectedContact.id)===contactId
      ?state.financeSelectedContact.name
      :(contactId?('Contato #'+contactId):'—');
    const rows=[
      ['Tipo',preview.kind==='receivable'?'Conta a receber':'Conta a pagar'],
      ['Operação',preview.operation==='settle'?'Baixa':preview.operation==='update'?'Edição':'Criação'],
      ['Vencimento',p.vencimento||'—'],
      ['Valor',p.valor!=null?Number(p.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'],
      ['Contato',contactLabel],
      ['Forma de pagamento',p.formaPagamento?.id?financeCatalogDescription('payment',p.formaPagamento.id):'—'],
      ['Conta financeira',p.portador?.id?financeCatalogDescription('account',p.portador.id):'—'],
      ['Categoria',p.categoria?.id?financeCatalogDescription('category',p.categoria.id):'—'],
      ['Data da baixa',p.data||'—']
    ];
    const boleto=preview?.boleto_policy?.is_boleto===true;
    return '<div class="rule-notice warn"><strong>Confirmação obrigatória</strong><div>Confira os dados. Esta ação será enviada ao Bling somente após você digitar CONFIRMAR.</div></div>'+
      (boleto?'<div class="rule-notice"><strong>Boleto preparado, não emitido</strong><div>Esta confirmação salva a conta a receber. A emissão do boleto é uma etapa separada no Bling e não será executada automaticamente por este Admin.</div></div>':'')+
      '<div class="panel" style="padding:12px">'+rows.filter(x=>x[1]!=='—').map(x=>'<div class="history-title"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join('')+'</div>'+
      (preview.warning?'<div class="rule-notice"><strong>Atenção</strong><div>'+esc(preview.warning)+'</div></div>':'')+
      '<label style="display:block;margin-top:12px"><span>Digite CONFIRMAR</span><input id="financeConfirmText" autocomplete="off"></label>';
  }
  function openFinanceConfirmation(preview,executeOperation,context){
    const idempotencyKey=crypto.randomUUID();
    financeOpenDialog('Confirmar operação financeira',financePreviewHtml(preview),
      '<button class="secondary" id="financeBack" type="button">Voltar</button><button class="primary" id="financeExecute" type="button" disabled>Confirmar no Bling</button>'
    );
    const input=$('#financeConfirmText'),button=$('#financeExecute');
    input.oninput=()=>button.disabled=input.value.trim()!=='CONFIRMAR';
    $('#financeBack').onclick=()=>$('#editor').close();
    button.onclick=async()=>{
      if(input.value.trim()!=='CONFIRMAR')return;
      button.disabled=true;button.textContent='Enviando…';
      try{
        await financeApi(executeOperation,{...context,confirmation:'CONFIRMAR',idempotency_key:idempotencyKey});
        $('#editor').close();toast('Operação registrada no Bling');state.finance=null;await renderFinance();
      }catch(e){
        button.disabled=false;button.textContent='Confirmar no Bling';
        toast(financeActionErrorMessage(e));
      }
    };
  }
  async function openFinanceSettlement(kind,id){
    financeOpenDialog('Baixa financeira','<div class="loading">Consultando o lançamento…</div>');
    try{
      const catalogs=await loadFinanceCatalogs();
      const detail=await financeApi('detail',{kind,id});
      const a=financeExtractDetail(kind,detail.account);
      const today=cuiabaDayKey(new Date());
      const categories=financeCategoryRows(kind,catalogs);
      financeOpenDialog(kind==='receivable'?'Registrar recebimento':'Registrar pagamento',
        '<div class="rule-notice warn"><strong>Baixa manual</strong><div>Isso registra a baixa no Bling. Não movimenta banco, PIX ou cartão.</div></div>'+
        '<form id="financeSettleForm" class="form-grid">'+
          '<label><span>Data da baixa *</span><input name="data" type="date" required value="'+esc(today)+'"></label>'+
          '<label><span>Valor recebido/pago</span><input name="valorRecebido" inputmode="decimal" value="'+esc(financeMoneyInput(detail.account?.valor))+'"></label>'+
          '<label><span>Conta financeira / portador *</span><select name="portador_id" required>'+financeSelectOptions(catalogs.financial_accounts,a.portador_id,'Selecione')+'</select></label>'+
          '<label><span>Categoria *</span><select name="categoria_id" required>'+financeSelectOptions(categories,a.categoria_id,'Selecione')+'</select></label>'+
          '<label><span>Juros</span><input name="juros" inputmode="decimal"></label>'+
          '<label><span>Desconto</span><input name="desconto" inputmode="decimal"></label>'+
          '<label><span>Acréscimo</span><input name="acrescimo" inputmode="decimal"></label>'+
          '<label><span>Tarifa</span><input name="tarifa" inputmode="decimal"></label>'+
          '<label class="span-2"><span>Histórico</span><textarea name="historico">'+esc(a.historico||'')+'</textarea></label>'+
        '</form>',
        '<button class="secondary" id="financeCancel" type="button">Cancelar</button><button class="primary" id="financeSettlePreview" type="button">Revisar baixa</button>'
      );
      $('#financeCancel').onclick=()=>$('#editor').close();
      $('#financeSettlePreview').onclick=async()=>{
        const form=$('#financeSettleForm');
        const get=name=>form.querySelector('[name="'+name+'"]')?.value?.trim()||'';
        const decimal=name=>{const v=get(name).replace(/\./g,'').replace(',','.');const n=Number(v);return v!==''&&Number.isFinite(n)&&n>=0?n:undefined};
        const portadorId=Number(get('portador_id'))||0,categoriaId=Number(get('categoria_id'))||0;
        if(!portadorId||!categoriaId){toast('Selecione conta financeira e categoria');return}
        const payload={
          data:get('data'),usarDataVencimento:false,portador_id:portadorId,categoria_id:categoriaId,
          historico:get('historico'),valorRecebido:decimal('valorRecebido'),juros:decimal('juros'),desconto:decimal('desconto'),acrescimo:decimal('acrescimo'),tarifa:decimal('tarifa')
        };
        Object.keys(payload).forEach(k=>payload[k]===undefined&&delete payload[k]);
        try{
          const preview=await financeApi('settle_preview',{kind,id,payload});
          openFinanceConfirmation(preview,'settle_execute',{kind,id,payload});
        }catch(e){toast(String(e?.message||'Não foi possível validar a baixa'))}
      };
    }catch(e){financeOpenDialog('Baixa financeira','<div class="empty">Não consegui carregar esse lançamento.</div>')}
  }
  async function openFinanceDetail(kind,id){
    financeOpenDialog('Detalhes financeiros','<div class="loading">Consultando o Bling…</div>');
    try{
      const d=await financeApi('detail',{kind,id});
      const a=d.account||{};
      financeOpenDialog(kind==='receivable'?'Conta a receber':'Conta a pagar',
        '<div class="panel" style="padding:14px">'+
          '<div class="history-title"><span>ID</span><strong>'+esc(a.id||id)+'</strong></div>'+
          '<div class="history-title"><span>Vencimento</span><strong>'+esc(dateOnly(a.vencimento))+'</strong></div>'+
          '<div class="history-title"><span>Valor</span><strong>'+esc(Number(a.valor||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</strong></div>'+
          '<div class="history-title"><span>Contato</span><strong>'+esc(a.contato?.nome||a.contato?.id||'—')+'</strong></div>'+
          '<div class="history-title"><span>Documento</span><strong>'+esc(a.numeroDocumento||'—')+'</strong></div>'+
          '<div class="history-title"><span>Histórico</span><strong>'+esc(a.historico||'—')+'</strong></div>'+
        '</div>',
        '<button class="secondary" id="financeClose" type="button">Fechar</button><button class="secondary" id="financeEditFromDetail" type="button">Editar</button><button class="primary" id="financeSettleFromDetail" type="button">Dar baixa</button>'
      );
      $('#financeClose').onclick=()=>$('#editor').close();
      $('#financeEditFromDetail').onclick=()=>openFinanceEditor(kind,id);
      $('#financeSettleFromDetail').onclick=()=>openFinanceSettlement(kind,id);
    }catch(e){financeOpenDialog('Detalhes financeiros','<div class="empty">Não consegui carregar os detalhes.</div>')}
  }
  function financeBoletoStatusLabel(v){
    return ({open:'Em aberto',received:'Recebido',partial:'Parcialmente recebido',returned:'Devolvido',partial_returned:'Parcialmente devolvido',cancelled:'Cancelado',unknown:'Situação não identificada'})[v]||v||'—';
  }
  async function openFinanceBoletos(originId){
    financeOpenDialog('Boletos','<div class="loading">Consultando o Bling…</div>');
    try{
      const d=await financeApi('boletos',{kind:'receivable',origin_id:originId});
      const rows=Array.isArray(d.boletos)?d.boletos:[],summary=d.summary||{};
      financeOpenDialog('Boletos vinculados',
        '<div class="rule-notice"><strong>Somente consulta</strong><div>Este Admin não emite nem cancela boletos. Emissão e cancelamento continuam no Bling.</div></div>'+
        (rows.length?'<div class="panel" style="padding:14px">'+
          (summary.total_cents?'<div class="history-title"><span>Total</span><strong>'+money(summary.total_cents)+'</strong></div>':'')+
          rows.map((b,i)=>'<div class="history-title" style="align-items:flex-start"><div><strong>Boleto '+(i+1)+'</strong><span class="sub">'+esc(b.external_number?'Código '+b.external_number:'ID '+(b.id||'—'))+'</span></div><div style="text-align:right"><strong>'+money(b.amount_cents)+'</strong><span class="sub">'+esc(dateOnly(b.due_date))+' · '+esc(financeBoletoStatusLabel(b.status_label))+'</span></div></div>').join('')+
        '</div>':'<div class="empty">Nenhum boleto retornado para essa origem.</div>')
      );
    }catch(e){financeOpenDialog('Boletos','<div class="empty">Não consegui consultar os boletos.</div>')}
  }
  async function openFinancialAccountDetail(id){
    financeOpenDialog('Conta financeira','<div class="loading">Consultando o Bling…</div>');
    try{
      const d=await financeApi('financial_account_detail',{id});
      const a=d.financial_account||{};
      financeOpenDialog('Conta financeira do Bling',
        '<div class="panel" style="padding:14px"><div class="history-title"><span>ID</span><strong>'+esc(a.id||id)+'</strong></div><div class="history-title"><span>Descrição</span><strong>'+esc(a.descricao||'—')+'</strong></div><div class="history-title"><span>Tipo</span><strong>'+esc(a.tipo||'—')+'</strong></div></div>'
      );
    }catch(e){financeOpenDialog('Conta financeira','<div class="empty">Não consegui carregar essa conta financeira.</div>')}
  }

  async function financeOverviewApi(token,retryAuth=true){
    const u=new URL(API);u.searchParams.set('action','bling_finance_overview');
    const response=await fetch(u,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:'{}',
      cache:'no-store'
    });
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(response.status===401&&retryAuth){
      clearFinanceSession(token);
      return await financeOverviewApi(await financeStepUp(),false);
    }
    if(!response.ok||data.ok===false)throw new Error(data.error||'service_error');
    return data;
  }
  async function renderFinance(){
    let token='';
    try{
      token=await financeStepUp();
    }catch(e){
      if(String(e?.message||'')==='finance_auth_cancelled'){
        toast('Financeiro continua bloqueado');
        renderMore();
        return;
      }
      toast(String(e?.message||'Não foi possível liberar o financeiro'));
      renderMore();
      return;
    }
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Financeiro · Bling</h1><p>Área protegida. Bling é a fonte oficial; inclusões, edições e baixas exigem prévia e confirmação humana.</p></div><div class="dispatch-actions"><button class="secondary" id="newPayable" type="button">+ A pagar</button><button class="secondary" id="newReceivable" type="button">+ A receber</button><button class="secondary" id="lockFinance" type="button">Bloquear financeiro</button><button class="secondary" id="refreshFinance">Atualizar</button></div></div>'+
      '<div class="rule-notice"><strong>Operação controlada</strong><div>Baixa apenas registra pagamento/recebimento no Bling. O sistema não faz transferência bancária e não cancela boletos automaticamente.</div></div>'+
      '<div id="financeBody"><div class="loading">Consultando financeiro no Bling…</div></div>';
    $('#refreshFinance').onclick=renderFinance;
    $('#lockFinance').onclick=()=>{clearFinanceSession();toast('Financeiro bloqueado');renderMore()};
    $('#newPayable').onclick=()=>openFinanceEditor('payable');
    $('#newReceivable').onclick=()=>openFinanceEditor('receivable');
    try{
      const data=await financeOverviewApi(token);
      state.finance=data.finance||{};
      paintFinance();
    }catch(e){
      const scope=String(e?.message||'')==='bling_finance_scope_missing';
      const auth=['finance_auth_required','finance_session_invalid','finance_owner_required'].includes(String(e?.message||''));
      $('#financeBody').innerHTML='<div class="empty">'+(scope?'A conexão atual do Bling ainda não possui permissão para o módulo financeiro.':auth?'A sessão financeira expirou ou não tem permissão.':'Não consegui carregar o financeiro do Bling agora.')+' <button class="text" id="retryFinance">Tentar novamente</button></div>';
      if($('#retryFinance'))$('#retryFinance').onclick=renderFinance;
    }
  }


