from pathlib import Path

path=Path('vitrine/admin/index.html')
s=path.read_text(encoding='utf-8')

CSS='''
    /* basket-auto-suggestions-v1 */
    .basket-auto-grid{display:grid;gap:10px}.basket-auto-card{border:1px solid var(--line);border-radius:14px;padding:12px;background:#fff}.basket-auto-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.basket-auto-head h3{margin:0;font-size:15px}.basket-auto-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.basket-auto-metric{background:var(--soft);border-radius:10px;padding:8px}.basket-auto-metric small{display:block;color:var(--muted);font-size:10px}.basket-auto-metric strong{display:block;margin-top:2px}.basket-auto-item{display:grid;grid-template-columns:48px minmax(0,1fr) 110px;gap:10px;align-items:center;border-top:1px solid var(--line);padding:10px 0}.basket-auto-item:first-child{border-top:0}.basket-auto-item img{width:48px;height:48px;object-fit:contain;border:1px solid var(--line);border-radius:9px;background:#fff}.basket-auto-item .swap{font-size:11px;color:var(--muted);margin-top:3px}.basket-auto-settings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.basket-auto-families{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.basket-auto-family{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:6px 9px;background:#fff;font-size:11px;font-weight:750}.basket-auto-family input{width:16px;height:16px;min-height:0}.basket-auto-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.basket-auto-status{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}.basket-auto-status button{min-height:36px}.basket-auto-issues{margin-top:8px;border:1px solid #efd59b;background:#fffaf0;border-radius:10px;padding:8px 10px;color:#72520a;font-size:11px;line-height:1.4}.basket-auto-picker{display:grid;gap:8px}.basket-auto-picker-row{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px}.basket-auto-picker-row img{width:48px;height:48px;object-fit:contain}.basket-auto-picker-row strong{display:block;font-size:12px}.basket-auto-picker-row small{display:block;color:var(--muted);font-size:10px;margin-top:2px}
    @media(max-width:700px){.basket-auto-metrics{grid-template-columns:1fr 1fr}.basket-auto-settings{grid-template-columns:1fr}.basket-auto-item{grid-template-columns:42px minmax(0,1fr)}.basket-auto-item>button{grid-column:1/-1}.basket-auto-picker-row{grid-template-columns:42px minmax(0,1fr)}.basket-auto-picker-row button{grid-column:1/-1}}
'''
if '/* basket-auto-suggestions-v1 */' not in s:
    s=s.replace('</style>',CSS+'  </style>',1)

CONST="  const FINANCE_PUBLIC_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';"
ADD_CONST="""  const BASKET_AUTO_RPC='https://ssbesxgaijknwsjbsbcz.supabase.co/rest/v1/rpc/';"""
if ADD_CONST not in s:
    if CONST not in s: raise SystemExit('finance public key anchor not found')
    s=s.replace(CONST,CONST+'\n'+ADD_CONST,1)

MARKER='  async function renderBaskets(){'
FUNCTIONS=r'''
  async function basketAutoRpc(fn,payload={},retryAuth=true){
    const token=await adminStepUp();
    const response=await fetch(BASKET_AUTO_RPC+fn,{
      method:'POST',headers:{'Content-Type':'application/json','apikey':FINANCE_PUBLIC_KEY,'Authorization':'Bearer '+token},
      body:JSON.stringify(payload||{}),cache:'no-store'
    });
    if(response.status===401&&retryAuth){clearFinanceSession(token);return await basketAutoRpc(fn,payload,false)}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.message||data?.error||'basket_auto_rpc_failed');
    return data;
  }
  function basketAutoStatusLabel(v){return v==='approved'?'Aprovada':v==='rejected'?'Rejeitada':'Pendente'}
  function basketAutoBuildLabel(v){return v==='ready'?'Pronta para aprovar':'Precisa de atenção'}
  async function openBasketAutoSuggestions(status='pending'){
    $('#editorTitle').textContent='Sugestões automáticas de lotes';
    $('#editorBody').innerHTML='<div class="loading">Carregando sugestões…</div>';
    $('#editorActions').innerHTML='<button class="secondary" id="basketAutoClose" type="button">Fechar</button>';
    $('#basketAutoClose').onclick=()=>$('#editor').close();
    if(!$('#editor').open)$('#editor').showModal();
    try{state.basketAutoData=await basketAutoRpc('basket_lot_suggestions_admin_v1',{p_status:status});state.basketAutoStatus=status;paintBasketAutoSuggestions()}
    catch(e){$('#editorBody').innerHTML='<div class="empty">Não consegui carregar as sugestões.</div>'}
  }
  function paintBasketAutoSuggestions(){
    const d=state.basketAutoData||{},cfg=d.settings||{},rules=d.rules||[],rows=d.suggestions||[],status=state.basketAutoStatus||'pending';
    $('#editorTitle').textContent='Sugestões automáticas de lotes';
    $('#editorBody').innerHTML=
      '<div class="rule-notice"><strong>Automação segura</strong><div>O sistema apenas sugere. O estoque só é reservado depois que você aprova um lote.</div></div>'+
      '<div class="section-title">Configuração</div><div class="basket-auto-settings">'+
        '<label><span>Automação</span><select id="basketAutoEnabled"><option value="1" '+(cfg.enabled?'selected':'')+'>Ligada</option><option value="0" '+(!cfg.enabled?'selected':'')+'>Desligada</option></select></label>'+
        '<label><span>Quantidade por sugestão</span><input id="basketAutoQty" type="number" min="1" max="100" value="'+esc(cfg.lot_quantity||5)+'"></label>'+
        '<label><span>Variação máxima de preço</span><input id="basketAutoPct" type="number" min="0" max="100" step="1" value="'+esc(cfg.price_variation_pct||15)+'"></label></div>'+
      '<div class="basket-auto-families">'+rules.map(r=>'<label class="basket-auto-family"><input type="checkbox" data-basket-auto-family="'+esc(r.family_key)+'" '+(r.enabled?'checked':'')+'><span>'+esc(r.label)+'</span></label>').join('')+'</div>'+
      '<div class="basket-auto-actions"><button class="secondary" id="basketAutoSaveSettings" type="button">Salvar configuração</button><button class="primary" id="basketAutoGenerate" type="button">Gerar sugestões agora</button></div>'+
      '<div class="section-title">Fila</div><div class="basket-auto-status">'+
        '<button class="secondary" data-basket-auto-status="pending" type="button">Pendentes</button><button class="secondary" data-basket-auto-status="approved" type="button">Aprovadas</button><button class="secondary" data-basket-auto-status="rejected" type="button">Rejeitadas</button></div>'+
      '<div class="basket-auto-grid">'+(rows.length?rows.map(x=>'<article class="basket-auto-card"><div class="basket-auto-head"><div><h3>'+esc(x.basket_name)+'</h3><span class="sub">'+esc(dateTime(x.created_at))+' · '+esc(basketAutoStatusLabel(x.status))+'</span></div><span class="pill '+(x.buildability_status==='ready'?'':'warn')+'">'+esc(basketAutoBuildLabel(x.buildability_status))+'</span></div><div class="basket-auto-metrics"><div class="basket-auto-metric"><small>Montar</small><strong>'+esc(fmtQty(x.quantity_planned))+'</strong></div><div class="basket-auto-metric"><small>Soma itens</small><strong>'+esc(Number(x.component_sum||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</strong></div><div class="basket-auto-metric"><small>Preço cesta</small><strong>'+esc(Number(x.sale_price||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</strong></div><div class="basket-auto-metric"><small>Ajuste</small><strong>'+esc(Number(x.hidden_adjustment||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</strong></div></div>'+(Array.isArray(x.issues)&&x.issues.length?'<div class="basket-auto-issues">'+esc(x.issues.length)+' ponto(s) precisam de conferência antes de aprovar.</div>':'')+'<div class="basket-auto-actions"><button class="secondary" type="button" data-basket-auto-open="'+esc(x.id)+'">Abrir composição</button></div></article>').join(''):'<div class="history-empty">Nenhuma sugestão nesta situação.</div>')+'</div>';
    $('#editorActions').innerHTML='<button class="secondary" id="basketAutoClose" type="button">Fechar</button>';
    $('#basketAutoClose').onclick=()=>$('#editor').close();
    $('#basketAutoSaveSettings').onclick=saveBasketAutoSettings;
    $('#basketAutoGenerate').onclick=generateBasketAutoSuggestions;
    $('#editorBody').querySelectorAll('[data-basket-auto-status]').forEach(b=>b.onclick=()=>openBasketAutoSuggestions(b.dataset.basketAutoStatus));
    $('#editorBody').querySelectorAll('[data-basket-auto-open]').forEach(b=>b.onclick=()=>openBasketAutoSuggestionDetail(b.dataset.basketAutoOpen));
  }
  async function saveBasketAutoSettings(){
    const btn=$('#basketAutoSaveSettings'),families=[...$('#editorBody').querySelectorAll('[data-basket-auto-family]:checked')].map(x=>x.dataset.basketAutoFamily);
    btn.disabled=true;
    try{await basketAutoRpc('basket_lot_automation_settings_admin_v1',{p_enabled:$('#basketAutoEnabled').value==='1',p_lot_quantity:Number($('#basketAutoQty').value||5),p_price_variation_pct:Number($('#basketAutoPct').value||15),p_enabled_families:families,p_operator:requireOperator()});toast('Configuração salva');await openBasketAutoSuggestions(state.basketAutoStatus||'pending')}
    catch(e){toast('Não consegui salvar a configuração');btn.disabled=false}
  }
  async function generateBasketAutoSuggestions(){
    const btn=$('#basketAutoGenerate');btn.disabled=true;btn.textContent='Gerando…';
    try{const r=await basketAutoRpc('basket_lot_suggestion_generate_now_v1',{});toast('Sugestões atualizadas: '+String(r.generated_count||0));await openBasketAutoSuggestions('pending')}
    catch(e){toast('Não consegui gerar as sugestões');btn.disabled=false;btn.textContent='Gerar sugestões agora'}
  }
  function openBasketAutoSuggestionDetail(id,preserve=false){
    const base=(state.basketAutoData?.suggestions||[]).find(x=>String(x.id)===String(id));if(!base&&!state.basketAutoDraft)return;
    if(!preserve)state.basketAutoDraft=JSON.parse(JSON.stringify(base));
    const s=state.basketAutoDraft;if(!s)return;
    $('#editorTitle').textContent='Sugestão · '+(s.basket_name||'Cesta');
    $('#editorBody').innerHTML='<div class="form-grid"><label><span>Quantidade de cestas</span><input id="basketAutoDetailQty" type="number" min="1" max="500" value="'+esc(s.quantity_planned||5)+'"></label><div><span class="sub">Status</span><strong>'+esc(basketAutoBuildLabel(s.buildability_status))+'</strong></div></div>'+
      '<div class="section-title">Composição sugerida</div><div class="basket-auto-grid">'+(s.items||[]).map(i=>{const p=i.suggested_product||{},op=i.original_product||{},changed=String(i.original_product_id)!==String(i.suggested_product_id);return '<div class="basket-auto-item"><img src="'+esc(p.image_url||op.image_url||'/img/placeholder-produto.png')+'" alt=""><div><strong>'+esc(p.name||'Produto')+'</strong><span class="sub">'+esc(fmtQty(i.quantity_per_basket))+'× por cesta · estoque solto '+esc(fmtQty(p.loose_stock??i.loose_stock_snapshot??0))+'</span>'+(changed?'<div class="swap">Substitui: '+esc(op.name||'produto original')+' · variação '+esc(Number(i.price_delta_pct||0).toFixed(1))+'%</div>':'')+'</div><button class="secondary" type="button" data-basket-auto-change="'+esc(i.id)+'">Trocar produto</button></div>'}).join('')+'</div>'+
      (Array.isArray(s.issues)&&s.issues.length?'<div class="basket-auto-issues">Há '+esc(s.issues.length)+' alerta(s) de estoque. Você pode trocar os produtos e salvar; a aprovação fará uma nova conferência final.</div>':'');
    $('#editorActions').innerHTML='<button class="secondary" id="basketAutoBack" type="button">Voltar</button>'+(s.status==='pending'?'<button class="secondary danger" id="basketAutoReject" type="button">Rejeitar</button><button class="secondary" id="basketAutoSaveDraft" type="button">Salvar ajustes</button><button class="primary" id="basketAutoApprove" type="button">Salvar e aprovar lote</button>':'');
    $('#basketAutoBack').onclick=()=>openBasketAutoSuggestions(state.basketAutoStatus||'pending');
    $('#editorBody').querySelectorAll('[data-basket-auto-change]').forEach(b=>b.onclick=()=>openBasketAutoProductPicker(s.id,b.dataset.basketAutoChange));
    if($('#basketAutoSaveDraft'))$('#basketAutoSaveDraft').onclick=()=>saveBasketAutoSuggestion(false);
    if($('#basketAutoApprove'))$('#basketAutoApprove').onclick=()=>saveBasketAutoSuggestion(true);
    if($('#basketAutoReject'))$('#basketAutoReject').onclick=rejectBasketAutoSuggestion;
  }
  async function openBasketAutoProductPicker(suggestionId,itemId){
    const draft=state.basketAutoDraft,item=(draft?.items||[]).find(x=>String(x.id)===String(itemId));if(!item)return;
    $('#editorTitle').textContent='Trocar produto';
    $('#editorBody').innerHTML='<label><span>Buscar por nome, EAN ou código</span><input id="basketAutoProductSearch" type="search" placeholder="Digite pelo menos 2 caracteres"></label><div id="basketAutoProductResults" style="margin-top:10px"><div class="history-empty">Busque o produto que deseja usar nesta posição.</div></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="basketAutoPickerBack" type="button">Voltar</button>';
    $('#basketAutoPickerBack').onclick=()=>openBasketAutoSuggestionDetail(suggestionId,true);
    $('#basketAutoProductSearch').oninput=e=>{clearTimeout(state.basketItemSearchTimer);const q=String(e.currentTarget.value||'').trim();if(q.length<2){$('#basketAutoProductResults').innerHTML='<div class="history-empty">Digite pelo menos 2 caracteres.</div>';return}state.basketItemSearchTimer=setTimeout(()=>searchBasketAutoProducts(suggestionId,itemId,q),220)};
  }
  async function searchBasketAutoProducts(suggestionId,itemId,q){
    const host=$('#basketAutoProductResults');host.innerHTML='<div class="loading">Buscando…</div>';
    try{const data=await api('basket_product_search',{q,limit:15});host.innerHTML=(data.products||[]).length?'<div class="basket-auto-picker">'+(data.products||[]).map(p=>'<div class="basket-auto-picker-row"><img src="'+esc(p.image_url||'/img/placeholder-produto.png')+'" alt=""><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.sku||p.gtin||'')+' · '+esc(fmtQty(p.loose_stock||0))+' solto</small></div><button class="secondary" data-basket-auto-pick="'+esc(p.id)+'" type="button">Usar</button></div>').join('')+'</div>':'<div class="history-empty">Nenhum produto encontrado.</div>';host.querySelectorAll('[data-basket-auto-pick]').forEach(b=>b.onclick=()=>{const p=(data.products||[]).find(x=>String(x.id)===String(b.dataset.basketAutoPick));const item=(state.basketAutoDraft?.items||[]).find(x=>String(x.id)===String(itemId));if(!p||!item)return;item.suggested_product_id=p.id;item.suggested_product={id:p.id,name:p.name,sku:p.sku||'',gtin:p.gtin||'',image_url:p.image_url||'',loose_stock:Number(p.loose_stock||0),price:Number(p.price||p.sale_price_cents/100||0)};item.is_substituted=String(item.original_product_id)!==String(p.id);openBasketAutoSuggestionDetail(suggestionId,true)})}
    catch(e){host.innerHTML='<div class="history-empty">Falha ao buscar produtos.</div>'}
  }
  async function saveBasketAutoSuggestion(approve=false){
    const s=state.basketAutoDraft;if(!s)return;const qty=Math.max(1,Number($('#basketAutoDetailQty').value||s.quantity_planned||5));
    const btn=approve?$('#basketAutoApprove'):$('#basketAutoSaveDraft');if(btn){btn.disabled=true;btn.textContent=approve?'Aprovando…':'Salvando…'}
    try{
      await basketAutoRpc('basket_lot_suggestion_save_v1',{p_suggestion_id:s.id,p_quantity:qty,p_items:(s.items||[]).map(i=>({id:i.id,suggested_product_id:i.suggested_product_id})),p_operator:requireOperator()});
      if(approve){await basketAutoRpc('basket_lot_suggestion_approve_v1',{p_suggestion_id:s.id,p_operator:requireOperator()});toast('Lote criado e pronto para uso interno')}else toast('Sugestão atualizada');
      state.basketAutoDraft=null;await openBasketAutoSuggestions('pending');
    }catch(e){const m=String(e?.message||'');toast(m.includes('insufficient_loose_stock')?'O estoque mudou e não permite aprovar este lote. Ajuste a composição.':'Não consegui salvar esta sugestão');if(btn)btn.disabled=false}
  }
  async function rejectBasketAutoSuggestion(){
    const s=state.basketAutoDraft;if(!s||!confirm('Rejeitar esta sugestão?'))return;
    try{await basketAutoRpc('basket_lot_suggestion_reject_v1',{p_suggestion_id:s.id,p_operator:requireOperator()});toast('Sugestão rejeitada');state.basketAutoDraft=null;await openBasketAutoSuggestions('pending')}
    catch(e){toast('Não consegui rejeitar a sugestão')}
  }
'''
if 'async function basketAutoRpc(' not in s:
    if MARKER not in s: raise SystemExit('renderBaskets anchor not found')
    s=s.replace(MARKER,FUNCTIONS+'\n'+MARKER,1)

OLD="""    content.innerHTML='<div class=\"page-head\"><div><h1>Cestas</h1><p>Monte os novos lotes sem alterar o que está sendo vendido hoje. A troca do site é manual.</p></div><button class=\"secondary\" id=\"refreshBaskets\" type=\"button\">Atualizar</button></div><div id=\"basketAdminBody\"><div class=\"loading\">Carregando cestas e kits…</div></div>';"""
NEW="""    content.innerHTML='<div class=\"page-head\"><div><h1>Cestas</h1><p>Monte os novos lotes sem alterar o que está sendo vendido hoje. A troca do site é manual.</p></div><div class=\"basket-auto-actions\"><button class=\"secondary\" id=\"basketAutoSuggestions\" type=\"button\">Sugestões automáticas</button><button class=\"secondary\" id=\"refreshBaskets\" type=\"button\">Atualizar</button></div></div><div id=\"basketAdminBody\"><div class=\"loading\">Carregando cestas e kits…</div></div>';"""
if 'id="basketAutoSuggestions"' not in s:
    if OLD not in s: raise SystemExit('basket page head anchor not found')
    s=s.replace(OLD,NEW,1)

OLD_CLICK="    $('#refreshBaskets').onclick=renderBaskets;"
NEW_CLICK="    $('#refreshBaskets').onclick=renderBaskets;\n    $('#basketAutoSuggestions').onclick=()=>openBasketAutoSuggestions('pending');"
if "$('#basketAutoSuggestions').onclick" not in s:
    if OLD_CLICK not in s: raise SystemExit('refresh basket anchor not found')
    s=s.replace(OLD_CLICK,NEW_CLICK,1)

path.write_text(s,encoding='utf-8')
print('basket auto suggestions admin patch applied')
