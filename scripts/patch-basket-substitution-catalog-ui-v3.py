from pathlib import Path

p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')

css='''
    /* basket-substitution-catalog-v3 */
    .basket-family-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.basket-family-card{border:1px solid var(--line);border-radius:13px;padding:12px;background:#fff}.basket-family-card.off{opacity:.68}.basket-family-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.basket-family-products{display:grid;gap:7px;margin-top:10px}.basket-family-product{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:7px}.basket-family-product img{width:42px;height:42px;object-fit:contain;border-radius:8px;background:#fff}.basket-family-product strong,.basket-family-product small{display:block}.basket-family-product small{color:var(--muted);font-size:10px;margin-top:2px}.basket-family-search-results{display:grid;gap:7px;margin-top:8px}.basket-family-note{font-size:11px;color:var(--muted);line-height:1.45;margin:8px 0}.basket-family-editor-head{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:10px}
    @media(max-width:700px){.basket-family-grid{grid-template-columns:1fr}.basket-family-editor-head{grid-template-columns:1fr}.basket-family-product{grid-template-columns:38px minmax(0,1fr)}.basket-family-product>button{grid-column:1/-1}}
'''
if '/* basket-substitution-catalog-v3 */' not in s:
    anchor='  </style>'
    assert anchor in s
    s=s.replace(anchor,css+anchor,1)

old="'<div class=\"basket-auto-actions\"><button class=\"secondary\" id=\"basketAutoSaveSettings\" type=\"button\">Salvar configuração</button><button class=\"primary\" id=\"basketAutoGenerate\" type=\"button\">Gerar sugestões agora</button></div>'+"
new="'<div class=\"basket-auto-actions\"><button class=\"secondary\" id=\"basketAutoSaveSettings\" type=\"button\">Salvar configuração</button><button class=\"secondary\" id=\"basketAutoManageCatalog\" type=\"button\">Gerenciar substituições</button><button class=\"primary\" id=\"basketAutoGenerate\" type=\"button\">Gerar sugestões agora</button></div>'+"
assert old in s
s=s.replace(old,new,1)

old_bind="    $('#basketAutoSaveSettings').onclick=saveBasketAutoSettings;\n    $('#basketAutoGenerate').onclick=generateBasketAutoSuggestions;"
new_bind="    $('#basketAutoSaveSettings').onclick=saveBasketAutoSettings;\n    $('#basketAutoManageCatalog').onclick=openBasketSubstitutionCatalog;\n    $('#basketAutoGenerate').onclick=generateBasketAutoSuggestions;"
assert old_bind in s
s=s.replace(old_bind,new_bind,1)

anchor='  function basketAutoDraftTotals(){'
assert anchor in s
block=r'''  async function openBasketSubstitutionCatalog(){
    $('#editorTitle').textContent='Produtos substituíveis';
    $('#editorBody').innerHTML='<div class="loading">Carregando famílias…</div>';
    $('#editorActions').innerHTML='<button class="secondary" id="basketFamilyBack" type="button">Voltar</button>';
    $('#basketFamilyBack').onclick=()=>openBasketAutoSuggestions(state.basketAutoStatus||'pending');
    try{
      state.basketSubstitutionCatalog=await basketAutoRpc('basket_lot_substitution_catalog_admin_v1',{});
      paintBasketSubstitutionCatalog();
    }catch(e){$('#editorBody').innerHTML='<div class="history-empty">Não consegui carregar as famílias de substituição.</div>'}
  }
  function paintBasketSubstitutionCatalog(){
    const families=state.basketSubstitutionCatalog?.families||[];
    $('#editorTitle').textContent='Produtos substituíveis';
    $('#editorBody').innerHTML='<div class="rule-notice"><strong>Lista explícita</strong><div>A automação só troca produtos que estiverem autorizados dentro da mesma família. Preço, embalagem e estoque continuam sendo conferidos.</div></div>'+
      '<div class="basket-auto-actions"><button class="primary" id="basketFamilyNew" type="button">+ Nova família</button></div>'+
      '<div class="section-title">Famílias</div><div class="basket-family-grid">'+
      (families.length?families.map(f=>'<article class="basket-family-card '+(f.enabled?'':'off')+'"><div class="basket-family-card-head"><div><strong>'+esc(f.label)+'</strong><span class="sub">'+esc(f.product_count||0)+' produto(s) autorizado(s)</span></div><span class="pill '+(f.enabled?'':'off')+'">'+(f.enabled?'ATIVA':'DESATIVADA')+'</span></div><div class="basket-auto-actions"><button class="secondary" data-basket-family-edit="'+esc(f.family_key)+'" type="button">Editar família</button></div></article>').join(''):'<div class="history-empty">Nenhuma família cadastrada.</div>')+'</div>';
    $('#editorActions').innerHTML='<button class="secondary" id="basketFamilyBack" type="button">Voltar</button>';
    $('#basketFamilyBack').onclick=()=>openBasketAutoSuggestions(state.basketAutoStatus||'pending');
    $('#basketFamilyNew').onclick=()=>openBasketSubstitutionFamilyEditor(null);
    $('#editorBody').querySelectorAll('[data-basket-family-edit]').forEach(b=>b.onclick=()=>openBasketSubstitutionFamilyEditor(b.dataset.basketFamilyEdit));
  }
  function openBasketSubstitutionFamilyEditor(key){
    const src=(state.basketSubstitutionCatalog?.families||[]).find(f=>String(f.family_key)===String(key));
    state.basketSubstitutionFamilyDraft=src?JSON.parse(JSON.stringify(src)):{family_key:null,label:'',enabled:true,products:[]};
    paintBasketSubstitutionFamilyEditor();
  }
  function paintBasketSubstitutionFamilyEditor(){
    const d=state.basketSubstitutionFamilyDraft;if(!d)return;
    $('#editorTitle').textContent=d.family_key?'Editar família':'Nova família';
    $('#editorBody').innerHTML='<div class="basket-family-editor-head"><label><span>Nome da família</span><input id="basketFamilyLabel" maxlength="80" value="'+esc(d.label||'')+'" placeholder="Ex.: Arroz"></label><label><span>Automação</span><select id="basketFamilyEnabled"><option value="1" '+(d.enabled!==false?'selected':'')+'>Ativa</option><option value="0" '+(d.enabled===false?'selected':'')+'>Desativada</option></select></label></div>'+
      '<div class="section-title">Produtos autorizados</div><div class="basket-family-note">Somente estes produtos poderão substituir uns aos outros nesta família. Ao adicionar um produto que esteja em outra família, ele será movido para esta.</div>'+
      '<div class="basket-family-products">'+((d.products||[]).length?(d.products||[]).map(p=>'<div class="basket-family-product"><img src="'+esc(p.image_url||'/img/placeholder-produto.png')+'" alt=""><div><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc(p.sku||p.gtin||'')+' · '+esc(p.packaging||'')+' · '+esc(fmtQty(p.loose_stock||0))+' solto</small></div><button class="text danger" data-basket-family-remove="'+esc(p.id)+'" type="button">Remover</button></div>').join(''):'<div class="history-empty">Nenhum produto autorizado nesta família.</div>')+'</div>'+
      '<div class="section-title">Adicionar produto</div><label><span>Buscar por nome, EAN ou código</span><input id="basketFamilyProductSearch" type="search" placeholder="Digite pelo menos 2 caracteres"></label><div id="basketFamilyProductResults" class="basket-family-search-results"><div class="history-empty">Busque um produto para adicionar.</div></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="basketFamilyCancel" type="button">Voltar</button><button class="primary" id="basketFamilySave" type="button">Salvar família</button>';
    $('#basketFamilyCancel').onclick=paintBasketSubstitutionCatalog;
    $('#basketFamilySave').onclick=saveBasketSubstitutionFamily;
    $('#basketFamilyLabel').oninput=e=>d.label=e.currentTarget.value;
    $('#basketFamilyEnabled').onchange=e=>d.enabled=e.currentTarget.value==='1';
    $('#editorBody').querySelectorAll('[data-basket-family-remove]').forEach(b=>b.onclick=()=>{d.products=(d.products||[]).filter(p=>String(p.id)!==String(b.dataset.basketFamilyRemove));paintBasketSubstitutionFamilyEditor()});
    $('#basketFamilyProductSearch').oninput=e=>{clearTimeout(state.basketItemSearchTimer);const q=String(e.currentTarget.value||'').trim();if(q.length<2){$('#basketFamilyProductResults').innerHTML='<div class="history-empty">Digite pelo menos 2 caracteres.</div>';return}state.basketItemSearchTimer=setTimeout(()=>searchBasketSubstitutionFamilyProducts(q),220)};
  }
  async function searchBasketSubstitutionFamilyProducts(q){
    const host=$('#basketFamilyProductResults');if(!host)return;host.innerHTML='<div class="loading">Buscando…</div>';
    try{
      const data=await api('basket_product_search',{q,limit:20});const rows=data.products||[],selected=new Set((state.basketSubstitutionFamilyDraft?.products||[]).map(p=>String(p.id)));
      host.innerHTML=rows.length?rows.map(p=>'<div class="basket-family-product"><img src="'+esc(p.image_url||'/img/placeholder-produto.png')+'" alt=""><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.sku||p.gtin||'')+' · '+esc(p.packaging||'')+' · '+esc(fmtQty(p.loose_stock||0))+' solto</small></div><button class="secondary" data-basket-family-add="'+esc(p.id)+'" type="button" '+(selected.has(String(p.id))?'disabled':'')+'>'+(selected.has(String(p.id))?'Adicionado':'Adicionar')+'</button></div>').join(''):'<div class="history-empty">Nenhum produto encontrado.</div>';
      host.querySelectorAll('[data-basket-family-add]').forEach(b=>b.onclick=()=>{const p=rows.find(x=>String(x.id)===String(b.dataset.basketFamilyAdd));if(!p)return;const d=state.basketSubstitutionFamilyDraft;if(!(d.products||[]).some(x=>String(x.id)===String(p.id)))d.products.push({id:p.id,name:p.name,sku:p.sku||'',gtin:p.gtin||'',packaging:p.packaging||'',price:Number(p.price??p.sale_price_cents/100??0),image_url:p.image_url||'',is_active:p.is_active!==false,loose_stock:Number(p.loose_stock||0)});paintBasketSubstitutionFamilyEditor()});
    }catch(e){host.innerHTML='<div class="history-empty">Falha ao buscar produtos.</div>'}
  }
  async function saveBasketSubstitutionFamily(){
    const d=state.basketSubstitutionFamilyDraft;if(!d)return;const label=String(d.label||'').trim();if(label.length<2){toast('Informe o nome da família');return}
    const operator=requireOperator();if(!operator)return;const btn=$('#basketFamilySave');if(btn){btn.disabled=true;btn.textContent='Salvando…'}
    try{
      await basketAutoRpc('basket_lot_substitution_family_save_admin_v1',{p_family_key:d.family_key||null,p_label:label,p_enabled:d.enabled!==false,p_product_ids:(d.products||[]).map(p=>p.id),p_operator:operator});
      toast('Família salva');state.basketSubstitutionCatalog=await basketAutoRpc('basket_lot_substitution_catalog_admin_v1',{});state.basketSubstitutionFamilyDraft=null;paintBasketSubstitutionCatalog();
    }catch(e){toast('Não consegui salvar esta família');if(btn){btn.disabled=false;btn.textContent='Salvar família'}}
  }
'''
s=s.replace(anchor,block+anchor,1)

p.write_text(s,encoding='utf-8')
