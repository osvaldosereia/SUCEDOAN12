from pathlib import Path

admin=Path('vitrine/admin/index.html')
s=admin.read_text(encoding='utf-8')

css='''
    /* basket-suggestion-editor-v2 */
    .basket-auto-item.substituted{border:1px solid #e7c15c;background:#fffaf0;border-radius:12px;padding:10px;margin-top:6px}
    .basket-auto-item.manual-added{border:1px dashed #9fb7aa;background:#f7fbf8;border-radius:12px;padding:10px;margin-top:6px}
    .basket-auto-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:900;background:#fff0c8;color:#77510a;margin-top:5px}
    .basket-auto-line-tools{display:flex;gap:6px;align-items:end;flex-wrap:wrap}.basket-auto-line-tools label{width:90px;margin:0}.basket-auto-line-tools input{min-height:38px;padding:7px 8px}.basket-auto-summary-v2{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}.basket-auto-summary-v2>div{background:var(--soft);border-radius:10px;padding:9px}.basket-auto-summary-v2 small{display:block;color:var(--muted);font-size:10px}.basket-auto-summary-v2 strong{display:block;margin-top:2px}.basket-auto-add-row{display:flex;justify-content:flex-start;margin-top:10px}
    @media(max-width:700px){.basket-auto-summary-v2{grid-template-columns:1fr 1fr}.basket-auto-item.substituted,.basket-auto-item.manual-added{grid-template-columns:42px minmax(0,1fr)}.basket-auto-line-tools{grid-column:1/-1}.basket-auto-line-tools label{flex:1 1 100px;width:auto}.basket-auto-line-tools button{flex:1 1 110px}}
'''
if '/* basket-suggestion-editor-v2 */' not in s:
    anchor='  </style>'
    assert anchor in s
    s=s.replace(anchor,css+anchor,1)

start=s.index('  function openBasketAutoSuggestionDetail(')
end=s.index('  async function rejectBasketAutoSuggestion()',start)
block=r'''  function basketAutoDraftTotals(){
    const d=state.basketAutoDraft||{},items=d.items||[];
    const component=items.reduce((sum,i)=>sum+Number(i.suggested_product?.price??i.suggested_unit_price??0)*Number(i.quantity_per_basket||0),0);
    const sale=Number(d.sale_price||0);
    return {component,hidden:sale-component};
  }
  function openBasketAutoSuggestionDetail(id,preserve=false){
    const base=(state.basketAutoData?.suggestions||[]).find(x=>String(x.id)===String(id));if(!base&&!state.basketAutoDraft)return;
    if(!preserve)state.basketAutoDraft=JSON.parse(JSON.stringify(base));
    const s=state.basketAutoDraft;if(!s)return;
    (s.items||[]).forEach((x,i)=>{x.position_order=Number(x.position_order??i);x.quantity_per_basket=Number(x.quantity_per_basket||1)});
    const t=basketAutoDraftTotals();
    $('#editorTitle').textContent='Sugestão · '+(s.basket_name||'Cesta');
    $('#editorBody').innerHTML='<div class="form-grid">'+
      '<label><span>Quantidade de cestas</span><input id="basketAutoDetailQty" type="number" min="1" max="500" value="'+esc(s.quantity_planned||5)+'"></label>'+
      '<label><span>Preço de venda por cesta</span><input id="basketAutoDetailSalePrice" type="number" min="0" step="0.01" value="'+esc(Number(s.sale_price||0).toFixed(2))+'"></label></div>'+
      '<div class="basket-auto-summary-v2"><div><small>Status</small><strong>'+esc(basketAutoBuildLabel(s.buildability_status))+'</strong></div><div><small>Itens por cesta</small><strong>'+esc((s.items||[]).length)+'</strong></div><div><small>Soma dos produtos</small><strong>'+esc(t.component.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</strong></div><div><small>Ajuste interno</small><strong>'+esc(t.hidden.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</strong></div></div>'+
      '<div class="section-title">Composição sugerida</div><div class="basket-auto-grid">'+(s.items||[]).map((i,index)=>{const p=i.suggested_product||{},op=i.original_product||{},changed=String(i.original_product_id)!==String(i.suggested_product_id),added=!i.id;return '<div class="basket-auto-item '+(changed?'substituted ':'')+(added?'manual-added':'')+'"><img src="'+esc(p.image_url||op.image_url||'/img/placeholder-produto.png')+'" alt=""><div><strong>'+esc(p.name||'Produto')+'</strong><span class="sub">Estoque solto '+esc(fmtQty(p.loose_stock??i.loose_stock_snapshot??0))+' · '+esc(Number(p.price??i.suggested_unit_price??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))+'</span>'+(changed?'<div class="basket-auto-badge">SUBSTITUÍDO</div><div class="swap">Original: '+esc(op.name||'produto original')+(i.price_delta_pct!=null?' · variação '+esc(Number(i.price_delta_pct||0).toFixed(1))+'%':'')+'</div>':added?'<div class="basket-auto-badge">ADICIONADO MANUALMENTE</div>':'')+'</div><div class="basket-auto-line-tools"><label><span>Qtd./cesta</span><input type="number" min="0.001" max="100" step="0.001" value="'+esc(i.quantity_per_basket)+'" data-basket-auto-line-qty="'+index+'"></label><button class="secondary" type="button" data-basket-auto-change="'+index+'">Trocar</button><button class="text danger" type="button" data-basket-auto-remove="'+index+'">Remover</button></div></div>'}).join('')+'</div>'+
      '<div class="basket-auto-add-row"><button class="secondary" id="basketAutoAddProduct" type="button">+ Adicionar produto</button></div>'+
      (Array.isArray(s.issues)&&s.issues.length?'<div class="basket-auto-issues">Há '+esc(s.issues.length)+' alerta(s) de estoque. Salve os ajustes para recalcular antes de aprovar.</div>':'');
    $('#editorActions').innerHTML='<button class="secondary" id="basketAutoBack" type="button">Voltar</button>'+(s.status==='pending'?'<button class="secondary danger" id="basketAutoReject" type="button">Rejeitar</button><button class="secondary" id="basketAutoSaveDraft" type="button">Salvar ajustes</button><button class="primary" id="basketAutoApprove" type="button">Salvar e aprovar lote</button>':'');
    $('#basketAutoBack').onclick=()=>openBasketAutoSuggestions(state.basketAutoStatus||'pending');
    $('#basketAutoDetailQty').onchange=e=>{s.quantity_planned=Math.max(1,Math.floor(Number(e.currentTarget.value||1)))};
    $('#basketAutoDetailSalePrice').onchange=e=>{s.sale_price=Math.max(0,Number(e.currentTarget.value||0));openBasketAutoSuggestionDetail(s.id,true)};
    $('#editorBody').querySelectorAll('[data-basket-auto-line-qty]').forEach(el=>el.onchange=()=>{const i=Number(el.dataset.basketAutoLineQty);if(!s.items?.[i])return;s.items[i].quantity_per_basket=Math.max(.001,Number(el.value||1));openBasketAutoSuggestionDetail(s.id,true)});
    $('#editorBody').querySelectorAll('[data-basket-auto-change]').forEach(b=>b.onclick=()=>openBasketAutoProductPicker(s.id,Number(b.dataset.basketAutoChange)));
    $('#editorBody').querySelectorAll('[data-basket-auto-remove]').forEach(b=>b.onclick=()=>{if((s.items||[]).length<=1){toast('A cesta precisa ter pelo menos um produto');return}s.items.splice(Number(b.dataset.basketAutoRemove),1);s.items.forEach((x,i)=>x.position_order=i);openBasketAutoSuggestionDetail(s.id,true)});
    $('#basketAutoAddProduct').onclick=()=>openBasketAutoProductPicker(s.id,null);
    if($('#basketAutoSaveDraft'))$('#basketAutoSaveDraft').onclick=()=>saveBasketAutoSuggestion(false);
    if($('#basketAutoApprove'))$('#basketAutoApprove').onclick=()=>saveBasketAutoSuggestion(true);
    if($('#basketAutoReject'))$('#basketAutoReject').onclick=rejectBasketAutoSuggestion;
  }
  async function openBasketAutoProductPicker(suggestionId,index){
    const draft=state.basketAutoDraft;if(!draft)return;
    $('#editorTitle').textContent=index===null?'Adicionar produto':'Trocar produto';
    $('#editorBody').innerHTML='<label><span>Buscar por nome, EAN ou código</span><input id="basketAutoProductSearch" type="search" placeholder="Digite pelo menos 2 caracteres"></label><div id="basketAutoProductResults" style="margin-top:10px"><div class="history-empty">Busque o produto que deseja usar.</div></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="basketAutoPickerBack" type="button">Voltar</button>';
    $('#basketAutoPickerBack').onclick=()=>openBasketAutoSuggestionDetail(suggestionId,true);
    $('#basketAutoProductSearch').oninput=e=>{clearTimeout(state.basketItemSearchTimer);const q=String(e.currentTarget.value||'').trim();if(q.length<2){$('#basketAutoProductResults').innerHTML='<div class="history-empty">Digite pelo menos 2 caracteres.</div>';return}state.basketItemSearchTimer=setTimeout(()=>searchBasketAutoProducts(suggestionId,index,q),220)};
  }
  async function searchBasketAutoProducts(suggestionId,index,q){
    const host=$('#basketAutoProductResults');host.innerHTML='<div class="loading">Buscando…</div>';
    try{
      const data=await api('basket_product_search',{q,limit:15});
      host.innerHTML=(data.products||[]).length?'<div class="basket-auto-picker">'+(data.products||[]).map(p=>'<div class="basket-auto-picker-row"><img src="'+esc(p.image_url||'/img/placeholder-produto.png')+'" alt=""><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.sku||p.gtin||'')+' · '+esc(fmtQty(p.loose_stock||0))+' solto</small></div><button class="secondary" data-basket-auto-pick="'+esc(p.id)+'" type="button">Usar</button></div>').join('')+'</div>':'<div class="history-empty">Nenhum produto encontrado.</div>';
      host.querySelectorAll('[data-basket-auto-pick]').forEach(b=>b.onclick=()=>{
        const p=(data.products||[]).find(x=>String(x.id)===String(b.dataset.basketAutoPick));if(!p)return;
        const product={id:p.id,name:p.name,sku:p.sku||'',gtin:p.gtin||'',image_url:p.image_url||'',loose_stock:Number(p.loose_stock||0),price:Number(p.price??p.sale_price_cents/100??0)};
        if(index===null){
          state.basketAutoDraft.items.push({id:null,template_item_id:null,original_product_id:p.id,suggested_product_id:p.id,quantity_per_basket:1,position_order:state.basketAutoDraft.items.length,original_unit_price:product.price,suggested_unit_price:product.price,price_delta_pct:0,is_substituted:false,loose_stock_snapshot:product.loose_stock,stock_ok_snapshot:true,original_product:{...product},suggested_product:{...product}});
        }else{
          const item=state.basketAutoDraft?.items?.[index];if(!item)return;
          item.suggested_product_id=p.id;item.suggested_product=product;item.suggested_unit_price=product.price;item.loose_stock_snapshot=product.loose_stock;item.is_substituted=String(item.original_product_id)!==String(p.id);
          const original=Number(item.original_unit_price??item.original_product?.price??0);item.price_delta_pct=original>0?((product.price-original)/original*100):null;
        }
        openBasketAutoSuggestionDetail(suggestionId,true);
      });
    }catch(e){host.innerHTML='<div class="history-empty">Falha ao buscar produtos.</div>'}
  }
  async function saveBasketAutoSuggestion(approve=false){
    const s=state.basketAutoDraft;if(!s)return;
    const qty=Math.max(1,Math.floor(Number($('#basketAutoDetailQty')?.value||s.quantity_planned||5)));
    const sale=Math.max(0,Number($('#basketAutoDetailSalePrice')?.value||s.sale_price||0));
    if(!(s.items||[]).length){toast('A cesta precisa ter pelo menos um produto');return}
    const btn=approve?$('#basketAutoApprove'):$('#basketAutoSaveDraft');if(btn){btn.disabled=true;btn.textContent=approve?'Aprovando…':'Salvando…'}
    try{
      const saved=await basketAutoRpc('basket_lot_suggestion_save_v2',{p_suggestion_id:s.id,p_quantity:qty,p_sale_price:sale,p_items:(s.items||[]).map((i,index)=>({id:i.id||null,suggested_product_id:i.suggested_product_id,quantity_per_basket:Number(i.quantity_per_basket||1),position_order:index})),p_operator:requireOperator()});
      if(approve&&saved.buildability_status!=='ready'){toast('A composição foi salva, mas ainda falta estoque para aprovar.');state.basketAutoDraft=null;await openBasketAutoSuggestions('pending');return}
      if(approve){await basketAutoRpc('basket_lot_suggestion_approve_v1',{p_suggestion_id:s.id,p_operator:requireOperator()});toast('Lote criado fora do site. Ative quando quiser vender.')}else toast('Sugestão atualizada');
      state.basketAutoDraft=null;await openBasketAutoSuggestions('pending');
    }catch(e){const m=String(e?.message||'');toast(m.includes('insufficient_loose_stock')||m.includes('requires_attention')?'O estoque não permite aprovar este lote. Ajuste a composição.':'Não consegui salvar esta sugestão');if(btn)btn.disabled=false}
  }
'''
s=s[:start]+block+s[end:]
admin.write_text(s,encoding='utf-8')

store=Path('supabase/functions/storefront-v2/index.ts')
t=store.read_text(encoding='utf-8')
repls=[
('db.from("basket_current_lot_v1").select("basket_id,lot_id,lot_code,quantity_available,built_at")','db.from("basket_current_lot_v1").select("basket_id,lot_id,lot_code,quantity_available,built_at,sale_price_override")'),
('id:b.id,name:b.name,display_price_cents:cents(b.base_price),image_url:b.image_url||"",\n    stock_quantity:Number(lot.quantity_available||0),lot_id:lot.lot_id,lot_code:lot.lot_code,split_mode:false','id:b.id,name:b.name,display_price_cents:cents(lot.sale_price_override??b.base_price),image_url:b.image_url||"",\n    stock_quantity:Number(lot.quantity_available||0),lot_id:lot.lot_id,lot_code:lot.lot_code,split_mode:false'),
('db.from("basket_current_lot_v1").select("lot_id,lot_code,quantity_available,built_at")','db.from("basket_current_lot_v1").select("lot_id,lot_code,quantity_available,built_at,sale_price_override")'),
('return {basket:{id:b.id,name:b.name,display_price_cents:cents(b.base_price),image_url:b.image_url||"",\n      split_mode:false,lot_id:lot.lot_id,lot_code:lot.lot_code,stock_quantity:Number(lot.quantity_available||0)},','return {basket:{id:b.id,name:b.name,display_price_cents:cents(lot.sale_price_override??b.base_price),image_url:b.image_url||"",\n      split_mode:false,lot_id:lot.lot_id,lot_code:lot.lot_code,stock_quantity:Number(lot.quantity_available||0)},'),
('db.from("basket_stock_lots").select("id,lot_code,quantity_available").eq("basket_id",id).eq("lot_kind","legacy_full").eq("status","ready").gt("quantity_available",0)','db.from("basket_stock_lots").select("id,lot_code,quantity_available,sale_price_override").eq("basket_id",id).eq("lot_kind","legacy_full").eq("sale_enabled",true).eq("status","ready").gt("quantity_available",0)'),
('let total=Number(b.base_price||0);\n  for(const r of rules||[])','let total=Number(lot.sale_price_override??b.base_price??0);\n  for(const r of rules||[])'),
('version:25','version:26')
]
for old,new in repls:
    if old not in t:
        raise SystemExit('storefront anchor missing: '+old[:90])
    t=t.replace(old,new,1)
store.write_text(t,encoding='utf-8')
print('basket suggestion editor v2 patch applied')
