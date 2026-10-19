  async function loadXmlCatalog(){
    const host=$('#xmlCatalogBody');if(!host||!state.xmlCatalogOpen)return;
    host.innerHTML='<div class="loading">Carregando catálogo de XMLs…</div>';
    try{
      const values=await Promise.all([
        purchaseApi('xml_catalog_list',{limit:30,offset:Number(state.xmlCatalogOffset||0),
          search:state.xmlCatalogSearch||'',status:state.xmlCatalogFilter||''}),
        purchaseApi('xml_catalog_progress')
      ]);
      state.xmlCatalogData=values[0];state.xmlCatalogProgress=values[1];
      host.innerHTML=xmlCatalogDisplayHtml();bindXmlCatalogInner();
    }catch(e){
      host.innerHTML='<div class="empty">Não foi possível carregar o catálogo XML. <button class="secondary" id="xmlCatalogRetry">Tentar novamente</button></div>';
      if($('#xmlCatalogRetry'))$('#xmlCatalogRetry').onclick=loadXmlCatalog;
    }
  }

  function paintPurchases(){
    const host=$('#purchaseBody');if(!host)return;
    const d=state.purchaseXml||{},docs=Array.isArray(d.documents)?d.documents:[],reviews=Array.isArray(d.review_items)?d.review_items:[],runs=Array.isArray(d.runs)?d.runs:[],settings=d.settings||{},integration=d.integration||{};
    const browse=state.purchaseBlingBrowse||{},blingDocs=Array.isArray(browse.documents)?browse.documents:[],window=d.filter||browse.window||{};
    const importedIds=new Set(docs.map(x=>Number(x.bling_nfe_id||0)).filter(Boolean));
    const importedKeys=new Set(docs.map(x=>String(x.document_key||'')).filter(Boolean));
    const notImported=blingDocs.filter(x=>!importedIds.has(Number(x.bling_nfe_id||0))&&!(x.access_key&&importedKeys.has(String(x.access_key))));
    // Financial details do not belong in the daily purchase list.
    const attentionDocs=docs.filter(x=>x.processing_status==='review_required'||x.processing_status==='failed'||x.receipt_status==='review');
    const ready=docs.filter(x=>x.receipt_status==='ready').length;
    const last=runs[0]||null;
    const lastAutomatic=runs.find(x=>x.source==='bling_daily')||null;
    const runSource=last?.source==='bling_daily'?'Rotina automática':last?.source==='bling_manual'?'Importação manual':last?.source==='manual_xml'||last?.source==='bulk_xml'?'XML enviado':'Execução';
    const runStatus=last?.status==='completed'?'Concluída':last?.status==='completed_with_review'?'Concluída com revisão':last?.status==='failed'?'Falhou':last?.status==='running'?'Em andamento':String(last?.status||'');
    host.innerHTML=
      '<div class="purchase-simple-stats" aria-label="Resumo das notas">'+
        '<div><small>Notas</small><strong>'+docs.length+'</strong></div>'+
        '<div><small>Para conferir</small><strong>'+attentionDocs.length+'</strong></div>'+
        '<div><small>Prontas</small><strong>'+ready+'</strong></div>'+
      '</div>'+
      (lastAutomatic?'<div class="purchase-sync-timestamp">Última sincronização automática: '+esc(dateTime(lastAutomatic.started_at||lastAutomatic.created_at))+
        ' · '+esc(lastAutomatic.documents_seen||0)+' notas consultadas · '+esc(lastAutomatic.documents_failed||0)+' falhas</div>':'')+
      (notImported.length?'<div class="purchase-safe purchase-danger"><strong>'+notImported.length+' nota(s) de compra ainda não importada(s)</strong><small>Use “Buscar no Bling” para importar as notas de compra/entrada encontradas no período.</small></div>':'')+
      '<section class="panel purchase-notes-panel">'+
        '<div class="purchase-notes-header"><div><strong>Notas de entrada</strong><span class="sub" id="purchaseVisibleCount">'+docs.length+' nota(s) na lista</span></div>'+
          '<div class="purchase-notes-search"><input id="purchaseQuickSearch" type="search" aria-label="Pesquisar notas" placeholder="Buscar fornecedor, NF-e ou CNPJ/CPF" value="'+esc(state.purchaseQuery||'')+'">'+
          '<select id="purchaseQuickStatus" aria-label="Filtrar notas">'+
            '<option value="all" '+(!state.purchaseQuickStatus||state.purchaseQuickStatus==='all'?'selected':'')+'>Todas</option>'+
            '<option value="attention" '+(state.purchaseQuickStatus==='attention'?'selected':'')+'>Para conferir</option>'+
            '<option value="ready" '+(state.purchaseQuickStatus==='ready'?'selected':'')+'>Prontas para entrada</option>'+
            '<option value="received" '+(state.purchaseQuickStatus==='received'?'selected':'')+'>Recebidas</option>'+
          '</select></div></div>'+
        (docs.length?docs.slice().sort((a,b)=>{
          const rank=x=>x.receipt_status==='received'?3:x.receipt_status==='ready'?2:
            attentionDocs.some(y=>y.id===x.id)?0:1;
          return rank(a)-rank(b)||String(b.issued_at||'').localeCompare(String(a.issued_at||''));
        }).map(x=>{
          const needsReview=attentionDocs.some(y=>y.id===x.id);
          const isReceived=x.receipt_status==='received';
          const isReady=x.receipt_status==='ready';
          const primaryStatus=needsReview?'Para conferir':isReceived?'Recebida':isReady?'Pronta para entrada':'Importada';
          const primaryClass=needsReview?'warn':'';
          const filterStatus=needsReview?'attention':isReceived?'received':isReady?'ready':'other';
          const invoiceNumber=x.number||x.document_number||x.invoice_number||null;
          const docRef=invoiceNumber?'NF '+String(invoiceNumber):'NF-e · '+String(x.document_key||'').slice(-8);
          const searchable=[x.supplier_name,x.supplier_document,x.supplier_tax_id,x.recipient_document,x.document_key,x.number,x.document_number,x.invoice_number].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
          return '<div class="purchase-doc-block" data-purchase-filter-row data-purchase-search="'+esc(searchable)+'" data-purchase-status="'+filterStatus+'" data-purchase-attention="'+(needsReview?'1':'0')+'" data-purchase-ready="'+(isReady?'1':'0')+'" data-purchase-received="'+(isReceived?'1':'0')+'">'+
            '<div class="purchase-doc-row purchase-simple-row purchase-doc-clickable '+(state.purchaseExpandedId===x.id?'expanded':'')+'" data-purchase-toggle="'+esc(x.id)+'">'+
              '<div class="purchase-note-ref"><strong>'+esc(docRef)+'</strong><small>'+esc(dateOnly(String(x.issued_at||'').slice(0,10)))+'</small></div>'+
              '<div class="history-main"><strong>'+esc(x.supplier_name||'Fornecedor não identificado')+'</strong><small>'+purchaseMoney(x.total_amount)+' · '+esc(x.item_count||0)+' item(ns) · '+esc(x.recipient_kind||'NF-e')+'</small></div>'+
              '<div class="purchase-note-status"><span class="pill '+primaryClass+'">'+primaryStatus+'</span><small>'+esc(x.receipt_status==='received'?'Estoque verificado':'Produtos e recebimento')+'</small></div>'+
              '<div class="purchase-actions"><button class="secondary" type="button" data-purchase-open="'+esc(x.id)+'">Conferir</button><button class="text" type="button" data-purchase-xml="'+esc(x.id)+'">XML</button></div>'+
            '</div><div class="purchase-doc-expanded" data-purchase-detail="'+esc(x.id)+'" style="display:none"></div></div>';
        }).join(''):'<div class="empty">Nenhuma nota importada neste período. Clique em “Buscar no Bling” ou “Importar XML”.</div>')+
        '<div class="empty" id="purchaseNoFilterResults" style="display:none">Nenhuma nota corresponde à pesquisa.</div>'+
      '</section>'+
      '<details id="purchaseAdvanced" class="panel purchase-extra" '+(state.purchaseAdvancedOpen?'open':'')+'><summary>Ferramentas avançadas: catálogo, produtos e integração</summary>'+
      (!state.purchaseAdvancedLoaded||state.purchaseAdvancedError?'<div class="purchase-compact-note">'+esc(state.purchaseAdvancedError|| (state.purchaseAdvancedLoading?'Carregando índice…':'Abra para carregar a conferência avançada.'))+'</div>'+(state.purchaseAdvancedError?'<button class="secondary" type="button" id="purchaseRetryAdvanced">Tentar novamente</button>':''):'')+
      purchaseCatalogQueueHtml()+
      xmlCatalogSectionHtml()+
      ((d.stale_runs_closed||d.stale_documents_repaired)?'<div class="bling-banner"><strong>Processamento corrigido</strong><small>'+(d.stale_runs_closed?esc(d.stale_runs_closed)+' importação antiga encerrada. ':'')+(d.stale_documents_repaired?esc(d.stale_documents_repaired)+' nota(s) tiveram o status recomposto.':'')+'</small></div>':'')+
      (last?'<div class="bling-banner"><strong>'+esc(runSource)+' · '+esc(runStatus)+'</strong><small>'+dateTime(last.started_at||last.created_at)+' · '+esc(last.documents_processed||0)+' nova(s) · '+esc(last.documents_duplicate||0)+' já existente(s) · '+esc(last.documents_failed||0)+' falha(s)</small></div>':'')+
      '<details id="purchaseBlingCompare" class="panel" style="margin-top:8px" '+(state.purchaseBlingCompareOpen?'open':'')+'><summary class="history-title" style="cursor:pointer;padding:8px 10px"><div><strong>Comparar com o Bling</strong><span>Consulta sob demanda, não bloqueia a lista de notas.</span></div><b>'+(state.purchaseBlingCompareLoaded?blingDocs.length:'—')+'</b></summary>'+
      (!state.purchaseBlingCompareLoaded?
        '<div class="purchase-compact-note">'+esc(state.purchaseBlingCompareError|| (state.purchaseBlingCompareLoading?'Consultando o Bling…':'Abra para consultar as notas registradas no Bling.'))+'</div>'+
        (state.purchaseBlingCompareError?'<button type="button" class="secondary" id="purchaseRetryBlingCompare">Tentar novamente</button>':'')
        :'')+
        (state.purchaseBlingCompareLoaded && blingDocs.length?blingDocs.map(x=>{
          const imported=importedIds.has(Number(x.bling_nfe_id||0))||(x.access_key&&importedKeys.has(String(x.access_key)));
          return '<div class="purchase-doc-row">'+
            '<div><strong>'+esc(x.issued_at?dateOnly(String(x.issued_at).slice(0,10)):'—')+'</strong><span class="sub">#'+esc(x.number||x.bling_nfe_id||'—')+'</span></div>'+
            '<div class="history-main"><strong>'+esc(x.contact_name||'Fornecedor não identificado')+'</strong><small>'+purchaseMoney(x.total_amount)+(x.contact_document?' · '+esc(x.contact_document):'')+'</small></div>'+
            '<div><span class="pill '+(imported?'':'warn')+'">'+(imported?'Já importada':'Falta importar')+'</span></div>'+
            '<div class="sub">'+esc(x.access_key?String(x.access_key).slice(-10):'—')+'</div><div></div><div></div><div></div>'+
          '</div>';
        }).join(''):state.purchaseBlingCompareLoaded?'<div class="empty">Nenhuma nota registrada no Bling nesse período.</div>':'')+
      '</details>'+
      '</details>';
    const purchaseQuickSearch=$('#purchaseQuickSearch');
    const purchaseQuickStatus=$('#purchaseQuickStatus');
    const filterPurchasesOnScreen=()=>{
      state.purchaseQuery=String(purchaseQuickSearch?.value||'').trim().toLocaleLowerCase('pt-BR');
      state.purchaseQuickStatus=String(purchaseQuickStatus?.value||'all');
      let shown=0;
      host.querySelectorAll('[data-purchase-filter-row]').forEach(row=>{
        const matchesText=!state.purchaseQuery||String(row.dataset.purchaseSearch||'').includes(state.purchaseQuery);
        const matchesStatus=state.purchaseQuickStatus==='all'||row.dataset['purchase'+state.purchaseQuickStatus[0].toUpperCase()+state.purchaseQuickStatus.slice(1)]==='1';
        const show=matchesText&&matchesStatus;
        row.style.display=show?'':'none';
        if(show)shown++;
      });
      const count=$('#purchaseVisibleCount');if(count)count.textContent=shown+' nota(s) na lista';
      const empty=$('#purchaseNoFilterResults');if(empty)empty.style.display=docs.length&&shown===0?'block':'none';
    };
    if(purchaseQuickSearch)purchaseQuickSearch.oninput=filterPurchasesOnScreen;
    if(purchaseQuickStatus)purchaseQuickStatus.onchange=filterPurchasesOnScreen;
    filterPurchasesOnScreen();
    bindPurchaseCatalogQueue();
    bindXmlCatalog();
    const advanced=$('#purchaseAdvanced');
    if(advanced)advanced.ontoggle=()=>{
      state.purchaseAdvancedOpen=advanced.open;
      if(advanced.open&&!state.purchaseAdvancedLoaded&&!state.purchaseAdvancedLoading&&!state.purchaseAdvancedError)loadPurchaseAdvanced();
    };
    const advancedRetry=$('#purchaseRetryAdvanced');
    if(advancedRetry)advancedRetry.onclick=()=>{
      state.purchaseAdvancedError='';
      loadPurchaseAdvanced();
    };
    const compare=$('#purchaseBlingCompare');
    if(compare)compare.ontoggle=()=>{
      state.purchaseBlingCompareOpen=compare.open;
      if(compare.open&&!state.purchaseBlingCompareLoaded&&!state.purchaseBlingCompareLoading&&!state.purchaseBlingCompareError)loadPurchaseBlingComparison();
    };
    const compareRetry=$('#purchaseRetryBlingCompare');
    if(compareRetry)compareRetry.onclick=()=>{
      state.purchaseBlingCompareError='';
      loadPurchaseBlingComparison();
    };
    host.querySelectorAll('[data-purchase-toggle]').forEach(row=>row.onclick=e=>{if(e.target.closest('button,a,input,label'))return;togglePurchaseDocument(row.dataset.purchaseToggle)});
    host.querySelectorAll('[data-purchase-open]').forEach(b=>b.onclick=e=>{e.stopPropagation();togglePurchaseDocument(b.dataset.purchaseOpen,true)});
    host.querySelectorAll('[data-purchase-xml]').forEach(b=>b.onclick=e=>{e.stopPropagation();downloadPurchaseXml(b.dataset.purchaseXml)});
    host.querySelectorAll('[data-purchase-conversion]').forEach(b=>b.onclick=()=>setPurchaseConversion(b.dataset.purchaseConversion));
    if($('#refreshPaymentAccounts'))$('#refreshPaymentAccounts').onclick=refreshPurchasePaymentAccounts;
    if($('#savePaymentAccounts'))$('#savePaymentAccounts').onclick=savePurchasePaymentAccounts;
    const expanded=state.purchaseExpandedId;
    if(expanded&&state.purchaseDetailCache?.[expanded]){
      const row=document.querySelector('[data-purchase-toggle="'+CSS.escape(expanded)+'"]');if(row)row.classList.add('expanded');
      renderPurchaseDocumentInline(expanded,state.purchaseDetailCache[expanded]);
    }
  }
  async function runPurchaseBlingSync(){
    if(!purchaseCustomRangeReady()){toast('Informe um período válido');return}
    const b=$('#purchaseBlingSync');if(b){b.disabled=true;b.textContent='Buscando e importando…'}
    try{
      const r=await purchaseApi('bling_sync',purchaseFilterPayload());
      if(Number(r.documents_seen||0)===0)toast('Nenhuma nota de compra/entrada encontrada pela API do Bling. Notas apenas Ciente não estão incluídas.');
      else toast('Importação concluída: '+String(r.processed||0)+' nova(s) · '+String(r.duplicates||0)+' já existente(s)'+(Number(r.failed||0)?' · '+String(r.failed)+' falha(s)':''));
      state.purchaseDetailCache={};state.purchaseExpandedId=null;
      state.purchaseAdvancedLoaded=false;
      await loadPurchases();
    }catch(e){toast(errorMessage(e.message))}
    finally{if(b){b.disabled=false;b.textContent='Buscar no Bling'}}
  }
  async function importCatalogOnlyXmlFiles(files){
    const input=$('#purchaseXmlCatalogOnlyInput');if(input)input.value='';
    const valid=(files||[]).filter(f=>/\.xml$/i.test(f.name)||/xml/i.test(f.type||''));
    if(!valid.length){toast('Selecione arquivos XML');return}
    if(!confirm('Catalogar '+valid.length+' XML(s) sem cadastrar produtos, alterar estoque, custos, NCM ou financeiro?'))return;
    const button=$('#purchaseXmlCatalogOnly');
    if(button){button.disabled=true;button.textContent='Catalogando XMLs…'}
    let ok=0,dup=0,fail=0,items=0;
    try{
      for(let i=0;i<valid.length;i+=5){
        const part=valid.slice(i,i+5),payload=[];
        for(const file of part)payload.push({name:file.name,xml:await file.text()});
        const r=await purchaseApi('xml_catalog_only_import',{files:payload});
        ok+=Number(r.processed||0);dup+=Number(r.duplicates||0);
        fail+=Number(r.failed||0);items+=Number(r.items||0);
      }
      toast('Catálogo: '+ok+' nota(s), '+items+' itens'+(dup?' · '+dup+' repetida(s)':'')+(fail?' · '+fail+' erro(s)':''));
      await loadPurchases();
    }catch(e){toast(errorMessage(e.message))}
    finally{if(button){button.disabled=false;button.textContent='Enviar XMLs ao catálogo'}}
  }

  async function importPurchaseXmlFiles(files){
    if(!files?.length)return;
    const input=$('#purchaseXmlInput');if(input)input.value='';
    const valid=files.filter(f=>/\.xml$/i.test(f.name)||/xml/i.test(f.type||''));
    if(!valid.length){toast('Selecione arquivos XML');return}
    let ok=0,fail=0;
    try{
      for(let i=0;i<valid.length;i+=10){
        const chunk=valid.slice(i,i+10),payload=[];
        for(const file of chunk)payload.push({name:file.name,xml:await file.text()});
        const r=await purchaseApi('manual_import',{files:payload});
        ok+=Number(r.processed||0)+Number(r.duplicates||0);fail+=Number(r.failed||0);
      }
      toast('XML: '+ok+' concluído(s)'+(fail?' · '+fail+' falha(s)':''));
      state.purchaseDetailCache={};state.purchaseExpandedId=null;
      state.purchaseAdvancedLoaded=false;
      await loadPurchases();
    }catch(e){toast(errorMessage(e.message))}
  }
  async function downloadPurchaseXml(id){
    try{const r=await purchaseApi('xml_url',{id});if(r.url)window.open(r.url,'_blank','noopener')}catch(e){toast(errorMessage(e.message))}
  }
  async function receivePurchaseDocument(id){
    if(!confirm('Preparar esta nota para conferência de entrada no Bling? O Admin não soma estoque local. Confirme somente depois de revisar produtos, quantidades, lotes e validades.'))return;
    try{
      const r=await purchaseApi('confirm_receipt',{document_id:id,confirmation:'CONFIRMAR_ENTRADA'});
      if(r?.result?.status==='awaiting_bling_receipt'){
        toast('Entrada preparada. Faça ou confirme o recebimento no Bling e depois clique em “Verificar entrada no Bling”.');
      }else{
        toast(r?.message||'Recebimento preparado');
      }
      state.purchaseDetailCache[id]=await purchaseApi('document',{id});
      state.purchaseExpandedId=id;
      state.purchaseXml=await purchaseApi('summary',purchaseFilterPayload());
      paintPurchases();
    }catch(e){toast(errorMessage(e.message))}
  }
  async function verifyPurchaseReceipt(id){
    const btn=document.querySelector('[data-purchase-verify-receipt="'+CSS.escape(id)+'"]');
    if(btn){btn.disabled=true;btn.textContent='Verificando Bling…'}
    try{
      const r=await purchaseApi('verify_receipt_plan',{document_id:id,confirmation:'VERIFICAR_ENTRADA_BLING'});
      if(r?.result?.verified===true){
        toast(r?.lot_materialization?.materialized_lots!=null?'Entrada confirmada · '+r.lot_materialization.materialized_lots+' lote(s) registrado(s)':'Entrada confirmada pelo estoque físico do Bling');
      }else if(Number(r?.result?.stale_items||0)>0){
        toast('O Bling ainda não atualizou o saldo depois da preparação. Atualize novamente após o recebimento.');
      }else{
        toast('A entrada ainda não apareceu integralmente no estoque físico do Bling.');
      }
      state.purchaseDetailCache[id]=await purchaseApi('document',{id});
      state.purchaseExpandedId=id;
      state.purchaseXml=await purchaseApi('summary',purchaseFilterPayload());
      paintPurchases();
    }catch(e){toast(errorMessage(e.message))}
    finally{if(btn){btn.disabled=false;btn.textContent='Verificar entrada no Bling'}}
  }
  async function setPurchaseConversion(id){
    const row=(state.purchaseXml?.review_items||[]).find(x=>x.id===id)||{};
    const suggested=Number(row?.metadata?.suggested_conversion_factor||0)>1?String(row.metadata.suggested_conversion_factor):'';
    const factorRaw=prompt('Quantas UNIDADES de venda existem em 1 '+String(row.purchase_unit||'embalagem')+'? Ex.: caixa com 24 unidades = 24.',suggested);
    if(factorRaw===null)return;
    const factor=Number(String(factorRaw).replace(',','.'));
    if(!Number.isFinite(factor)||factor<=1){toast('Para caixa/fardo/pacote, o fator deve ser maior que 1');return}
    try{
      await purchaseApi('set_conversion',{item_id:id,conversion_factor:factor,base_unit:'UN'});
      toast('Conversão para UN salva. Revise custo e preço na nota.');
      const docId=row.document_id;
      if(docId){state.purchaseDetailCache[docId]=await purchaseApi('document',{id:docId});state.purchaseExpandedId=docId}
      state.purchaseXml=await purchaseApi('summary',purchaseFilterPayload());
      paintPurchases();
    }catch(e){toast(errorMessage(e.message))}
  }

  async function renderBling(){
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Integração Bling · Técnico</h1><p>Diagnóstico da integração. A operação normal de pedidos, produtos e clientes não deve depender desta tela. Os cenários antigos do Make permanecem preservados, mas ficam fora do novo runtime.</p></div><button class="secondary" id="refreshBling">Atualizar</button></div>'+
      '<div class="bling-banner" id="blingRuntimeBanner"><strong>Carregando estado do Hub…</strong><small>Consultando quais domínios estão ativos e quais continuam bloqueados.</small></div>'+
      '<div id="blingStatus"><div class="loading">Carregando status…</div></div>';
    $('#refreshBling').onclick=()=>loadBlingStatus();
    await Promise.all([loadBlingStatus(),loadOpsShadowReadiness()]);
    if($('#blingStatus')&&state.opsShadow)$('#blingStatus').insertAdjacentHTML('beforebegin',renderOpsShadowReadiness());
  }

  function yesNo(value,yes='OK',no='Pendente'){
    return value?'<span class="ok-text">'+esc(yes)+'</span>':'<span class="warn-text">'+esc(no)+'</span>';
  }

  async function loadOpsShadowReadiness(){
    try{const data=await api('ops_shadow_readiness');state.opsShadow=data.readiness||{};return state.opsShadow}catch{state.opsShadow=null;return null}
  }
