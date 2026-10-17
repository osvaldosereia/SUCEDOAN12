from pathlib import Path
import re

API=Path('supabase/functions/admin-products-live-v1/index.ts')
ADMIN=Path('vitrine/admin/index.html')

def replace_once(text, old, new, label):
    n=text.count(old)
    if n!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {n}')
    return text.replace(old,new,1)

def sub_once(text, pattern, repl, label, flags=0):
    out,n=re.subn(pattern,repl,text,count=1,flags=flags)
    if n!=1:
        raise SystemExit(f'{label}: expected 1 regex match, got {n}')
    return out

# ---------------- API ----------------
s=API.read_text()
needle='"basket_kit_lot_draft_activate","basket_legacy_lot_release"'
if s.count(needle)!=2:
    raise SystemExit(f'action sets: expected 2 occurrences, got {s.count(needle)}')
s=s.replace(needle,'"basket_kit_lot_draft_activate","basket_kit_lot_reopen","basket_kit_template_save","basket_kit_template_archive","basket_archive","basket_legacy_lot_release"')

helper='''function nextBasketKitShortCodeFromLots(prefix:string,lots:any[]){
  const used=new Set((lots||[]).filter((l:any)=>["draft","ready"].includes(String(l.status))).map((l:any)=>String(l.short_code||"")));
  for(const digit of ["1","2","3","4","5","6","7","8","9","0"]){const code=String(prefix||"")+digit;if(!used.has(code))return code}
  return null;
}
'''
s=replace_once(s,'async function basketKitsAdmin(){',helper+'async function basketKitsAdmin(){','insert local next-code helper')
old='''    const ready=lots.filter((x:any)=>x.kit_template_id===k.id&&x.status==="ready"&&Number(x.quantity_available||0)>0);
    const saleReady=ready.filter((x:any)=>x.sale_enabled===true);
    const current=saleReady[0]||null;
    const nx=await db.rpc("next_basket_kit_short_code_v1",{p_kit_template_id:k.id});
    kits.push({...k,basket:Array.isArray(k.basket)?k.basket[0]:k.basket,template_item_count:ki.length,
      ready_quantity:ready.reduce((s:number,x:any)=>s+Number(x.quantity_available||0),0),ready_lot_count:ready.length,
      sale_ready_quantity:saleReady.reduce((s:number,x:any)=>s+Number(x.quantity_available||0),0),sale_ready_lot_count:saleReady.length,
      current_lot:current,next_short_code:nx.error?null:nx.data,max_build_from_template:Math.max(0,cap)});'''
new='''    const kitLots=lots.filter((x:any)=>x.kit_template_id===k.id);
    const ready=kitLots.filter((x:any)=>x.status==="ready"&&Number(x.quantity_available||0)>0);
    const drafts=kitLots.filter((x:any)=>x.status==="draft");
    const saleReady=ready.filter((x:any)=>x.sale_enabled===true);
    const current=saleReady[0]||null;
    kits.push({...k,basket:Array.isArray(k.basket)?k.basket[0]:k.basket,template_item_count:ki.length,
      ready_quantity:ready.reduce((sum:number,x:any)=>sum+Number(x.quantity_available||0),0),ready_lot_count:ready.length,
      draft_quantity:drafts.reduce((sum:number,x:any)=>sum+Number(x.quantity_built||0),0),draft_lot_count:drafts.length,
      sale_ready_quantity:saleReady.reduce((sum:number,x:any)=>sum+Number(x.quantity_available||0),0),sale_ready_lot_count:saleReady.length,
      current_lot:current,next_short_code:nextBasketKitShortCodeFromLots(k.code_prefix,kitLots),max_build_from_template:Math.max(0,cap)});'''
s=replace_once(s,old,new,'remove kit list N+1 and add drafts')
s=replace_once(s,
'  return {kits,summary:{kit_templates:kits.length,ready_units:kits.reduce((s:number,k:any)=>s+Number(k.ready_quantity||0),0),ready_lots:kits.reduce((s:number,k:any)=>s+Number(k.ready_lot_count||0),0)}};',
'  return {kits,summary:{kit_templates:kits.length,ready_units:kits.reduce((sum:number,k:any)=>sum+Number(k.ready_quantity||0),0),ready_lots:kits.reduce((sum:number,k:any)=>sum+Number(k.ready_lot_count||0),0),draft_units:kits.reduce((sum:number,k:any)=>sum+Number(k.draft_quantity||0),0),draft_lots:kits.reduce((sum:number,k:any)=>sum+Number(k.draft_lot_count||0),0)}};',
'kit list summary drafts')
s=replace_once(s,
'  const ready=[...lotRows].filter((x:any)=>x.status==="ready"&&x.quantity_available>0).sort((a:any,b:any)=>Date.parse(a.built_at)-Date.parse(b.built_at));\n  const saleReady=ready.filter((x:any)=>x.sale_enabled===true);',
'  const ready=[...lotRows].filter((x:any)=>x.status==="ready"&&x.quantity_available>0).sort((a:any,b:any)=>Date.parse(a.built_at)-Date.parse(b.built_at));\n  const drafts=lotRows.filter((x:any)=>x.status==="draft");\n  const saleReady=ready.filter((x:any)=>x.sale_enabled===true);',
'kit detail draft rows')
s=replace_once(s,
'    current_lot:saleReady[0]||null,last_lot:lotRows[0]||null,ready_quantity:ready.reduce((s:number,x:any)=>s+x.quantity_available,0),\n    sale_ready_quantity:saleReady.reduce((s:number,x:any)=>s+x.quantity_available,0),',
'    current_lot:saleReady[0]||null,last_lot:lotRows[0]||null,ready_quantity:ready.reduce((sum:number,x:any)=>sum+x.quantity_available,0),\n    draft_quantity:drafts.reduce((sum:number,x:any)=>sum+Number(x.quantity_built||0),0),draft_lot_count:drafts.length,\n    sale_ready_quantity:saleReady.reduce((sum:number,x:any)=>sum+x.quantity_available,0),',
'kit detail draft summary')

model_api='''async function basketKitTemplateSave(p:any,auth:any){
  const kid=id(p?.kit_template_id||p?.id),items=Array.isArray(p?.items)?p.items.slice(0,120):[];
  if(!kid)return {error:"invalid_kit_template",status:400};
  const q=await db.rpc("save_basket_kit_template_admin_v1",{p_kit_template_id:kid,p_name:tx(p?.name,180),p_code_prefix:tx(p?.code_prefix,2).toUpperCase(),p_items:items,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){const m=String(q.error.message||"").split("\\n")[0];const code=["kit_template_not_found","kit_template_name_invalid","kit_template_prefix_invalid","kit_template_items_invalid","kit_template_product_invalid","kit_template_product_duplicate","kit_template_product_unavailable","kit_template_quantity_invalid","kit_template_item_invalid","kit_template_source_item_invalid"].find(x=>m.includes(x))||"kit_template_save_failed";return {error:code,status:code==="kit_template_not_found"?404:400}}
  await opsEvent("basket.kit_template_updated","Modelo de kit atualizado.","basket",kid,{kit_template_id:kid,item_count:q.data?.item_count},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {template:q.data};
}
async function basketKitTemplateArchive(p:any,auth:any){
  const kid=id(p?.kit_template_id||p?.id);if(!kid)return {error:"invalid_kit_template",status:400};
  const q=await db.rpc("archive_basket_kit_template_admin_v1",{p_kit_template_id:kid,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){const m=String(q.error.message||"");if(m.includes("kit_template_has_live_lots"))return {error:"kit_template_has_live_lots",status:409};if(m.includes("kit_template_not_found"))return {error:"kit_template_not_found",status:404};throw q.error}
  await opsEvent("basket.kit_template_archived","Modelo de kit arquivado.","basket",kid,{kit_template_id:kid},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {template:q.data};
}
'''
s=replace_once(s,'async function basketKitLotCreate(p:any,auth:any){',model_api+'async function basketKitLotCreate(p:any,auth:any){','insert kit model API')

reopen_api='''async function basketKitLotReopen(p:any,auth:any){
  const lid=id(p?.lot_id);if(!lid)return {error:"invalid_lot",status:400};
  const q=await db.rpc("reopen_basket_kit_lot_for_edit_v1",{p_lot_id:lid,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){
    const m=String(q.error.message||"");
    for(const code of ["lot_sale_must_be_disabled","lot_has_order_history","lot_already_changed","lot_is_dependency","lot_not_editable","kit_lot_required"]){if(m.includes(code))return {error:code,status:409}}
    if(m.includes("lot_not_found"))return {error:"lot_not_found",status:404};throw q.error;
  }
  await opsEvent("basket.kit_lot_reopened","Lote reaberto para edição antes de novo fechamento da montagem.","basket",lid,{lot_id:lid,short_code:q.data?.short_code},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {draft:q.data};
}
'''
s=replace_once(s,'async function basketKitLotDraftDelete(p:any,auth:any){',reopen_api+'async function basketKitLotDraftDelete(p:any,auth:any){','insert lot reopen API')

basket_archive='''async function basketArchive(p:any,auth:any){
  const bid=id(p?.basket_id||p?.id);if(!bid)return {error:"invalid_basket",status:400};
  const q=await db.rpc("archive_basket_template_admin_v1",{p_basket_id:bid,p_operator:tx(p?.operator,80)||"Operação"});
  if(q.error){const m=String(q.error.message||"");if(m.includes("basket_has_active_kit_templates"))return {error:"basket_has_active_kit_templates",status:409};if(m.includes("basket_has_live_lots"))return {error:"basket_has_live_lots",status:409};if(m.includes("basket_not_found"))return {error:"basket_not_found",status:404};throw q.error}
  await opsEvent("basket.template_archived","Modelo de cesta arquivado.","basket",bid,{basket_id:bid},tx(p?.operator,80)||"Operação","human","dona_antonia");
  return {basket:q.data};
}
'''
s=replace_once(s,'async function basketSave(p:any,auth:any){',basket_archive+'async function basketSave(p:any,auth:any){','insert basket archive API')

route_marker='''if(r.method==="POST"&&a==="basket_kit_lot_draft_activate"){const x:any=await basketKitLotDraftActivate(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}'''
route_new=route_marker+'''if(r.method==="POST"&&a==="basket_kit_lot_reopen"){const x:any=await basketKitLotReopen(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_template_save"){const x:any=await basketKitTemplateSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="basket_kit_template_archive"){const x:any=await basketKitTemplateArchive(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}'''
s=replace_once(s,route_marker,route_new,'route kit lot reopen/model writes')
route_basket='''if(r.method==="POST"&&a==="basket_save"){const x:any=await basketSave(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}'''
s=replace_once(s,route_basket,'''if(r.method==="POST"&&a==="basket_archive"){const x:any=await basketArchive(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}'''+route_basket,'route basket archive')
s=s.replace('version:60,legacy_proxy:false','version:61,legacy_proxy:false',1)
API.write_text(s)

# ---------------- ADMIN ----------------
h=ADMIN.read_text()
# Main cards: a saved draft is an existing lot in progress, not “no lot”.
h=replace_once(h,
"  function kitAdminCard(k){\n    const label=k.kind==='hygiene'?'Limpeza e Higiene':(k.basket?.name||k.name).replace(/^Alimentos · /,'');",
"  function kitAdminCard(k){\n    const label=k.kind==='hygiene'?'Limpeza e Higiene':(k.basket?.name||k.name).replace(/^Alimentos · /,'');\n    const draftCount=Number(k.draft_lot_count||0);",
'kit card draft count')
h=replace_once(h,
"      '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:10px\"><div><span class=\"kit-code-badge\">'+esc(k.code_prefix)+'#</span></div><span class=\"pill '+(Number(k.ready_quantity||0)>0?'':'warn')+'\">'+(Number(k.ready_quantity||0)>0?'Montado':'Sem lote novo')+'</span></div>'+",
"      '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:10px\"><div><span class=\"kit-code-badge\">'+esc(k.code_prefix)+'#</span></div><span class=\"pill '+(Number(k.ready_quantity||0)>0?'':draftCount>0?'warn':'off')+'\">'+(Number(k.ready_quantity||0)>0?'Montado':draftCount>0?'Em edição':'Sem lote novo')+'</span></div>'+",
'kit card state pill')
h=replace_once(h,
"      '<div class=\"basket-kpis\"><div class=\"basket-kpi\"><small>Montados</small><strong>'+esc(k.ready_quantity||0)+'</strong></div><div class=\"basket-kpi\"><small>Ativos no site</small><strong>'+esc(k.sale_ready_quantity||0)+'</strong></div><div class=\"basket-kpi\"><small>Pode montar</small><strong>'+esc(k.max_build_from_template||0)+'</strong></div><div class=\"basket-kpi\"><small>Próximo código</small><strong>'+esc(k.next_short_code||'—')+'</strong></div></div>'+",
"      '<div class=\"basket-kpis\"><div class=\"basket-kpi\"><small>Montados</small><strong>'+esc(k.ready_quantity||0)+'</strong></div><div class=\"basket-kpi\"><small>Em edição</small><strong>'+esc(draftCount)+'</strong></div><div class=\"basket-kpi\"><small>Ativos no site</small><strong>'+esc(k.sale_ready_quantity||0)+'</strong></div><div class=\"basket-kpi\"><small>Pode montar</small><strong>'+esc(k.max_build_from_template||0)+'</strong></div><div class=\"basket-kpi\"><small>Próximo código</small><strong>'+esc(k.next_short_code||'—')+'</strong></div></div>'+",
'kit card draft KPI')

# Replace lot row completely.
lot_row_pattern=r"  function kitLotRow\(l\)\{[\s\S]*?\n  \}\n  function paintBasketKitAdmin\(\)\{"
lot_row_new='''  function kitLotRow(l){
    const code=l.short_code||l.lot_code||'—',displayName=l.public_name||code,isDraft=l.status==='draft';
    const canToggle=l.status==='ready'&&Number(l.quantity_available||0)>0;
    const canEdit=l.status==='ready'&&l.sale_enabled!==true&&Number(l.quantity_available||0)===Number(l.quantity_built||0);
    const price=Number(l.sale_price_override??l.own_sale_price_override??0);
    const linkedHygiene=(state.basketKitDetail?.hygiene_lots||[]).find(h=>String(h.id)===String(l.linked_hygiene_lot_id||''));
    return '<div class="basket-lot"><div class="basket-lot-head">'+
      '<div><strong style="font-size:16px">'+esc(displayName)+'</strong><small>Código físico '+esc(code)+' · '+(isDraft?'Em edição':esc(dateTime(l.built_at))+' · '+esc(l.built_by||'Operação'))+'</small>'+
        '<small><b>Valor: '+money(cents(price))+'</b>'+(linkedHygiene?' · Limpeza/Higiene: '+esc(linkedHygiene.public_name||linkedHygiene.short_code||linkedHygiene.lot_code||'lote'):'')+'</small></div>'+
      '<div><strong>'+(isDraft?esc(l.quantity_built):esc(l.quantity_available)+' / '+esc(l.quantity_built))+'</strong><small>'+(isDraft?'quantidade planejada':'disponível / montado')+'</small></div>'+
      '<div><span class="pill '+(l.status==='ready'?'':isDraft?'warn':'off')+'">'+esc(l.status==='ready'?'Montado':l.status==='depleted'?'Esgotado':l.status==='cancelled'?'Cancelado':'Em edição')+'</span></div>'+
      '<div><span class="pill '+(l.sale_enabled===true?'':'off')+'">'+(isDraft?'NÃO RESERVA ESTOQUE':l.sale_enabled===true?'ATIVO NO SITE':'FORA DO SITE')+'</span></div>'+
      '<div class="basket-row-actions">'+
        (isDraft?'<button class="primary" type="button" data-kit-lot-mount="'+esc(l.id)+'">Marcar como montado</button><button class="secondary" type="button" data-kit-lot-resume="'+esc(l.id)+'">Continuar editando</button><button class="text danger" type="button" data-kit-lot-draft-delete="'+esc(l.id)+'">Excluir rascunho</button>':
          (canToggle?'<button class="'+(l.sale_enabled===true?'secondary':'primary')+'" type="button" data-kit-lot-sale="'+esc(l.id)+'" data-enabled="'+(l.sale_enabled===true?'0':'1')+'">'+(l.sale_enabled===true?'Desativar no site':'Ativar no site')+'</button>':'')+
          (canEdit?'<button class="secondary" type="button" data-kit-lot-edit="'+esc(l.id)+'">Editar lote</button>':'')+
          (['ready','depleted'].includes(l.status)?'<button class="secondary" type="button" data-kit-lot-print="'+esc(l.id)+'">Imprimir lote</button>':'')+
          '<button class="secondary" type="button" data-kit-lot-copy="'+esc(l.id)+'">Duplicar</button><button class="text danger" type="button" data-kit-lot-delete="'+esc(l.id)+'">Excluir lote</button>')+
      '</div></div><div class="basket-lot-inline-strip" style="overflow-x:auto;overscroll-behavior-inline:contain;padding:0 12px 12px">'+lotCompositionCards(l.items||[],'quantity_per_kit')+'</div></div>';
  }
  function printBasketKitLot(lotId){
    const l=(state.basketKitDetail?.lots||[]).find(x=>String(x.id)===String(lotId));if(!l){toast('Lote não encontrado');return}
    const code=l.short_code||l.lot_code||'—',name=l.public_name||code,price=Number(l.sale_price_override??l.own_sale_price_override??0);
    const cards=(l.items||[]).map(x=>{const p=x.product||{},qty=Number(x.quantity_per_kit??x.quantity_per_basket??0);return '<article class="lot-print-card"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><div class="lot-print-name">'+esc(p.name||'Produto')+'</div><div class="lot-print-qty">'+esc(fmtQty(qty))+' × por kit</div></article>'}).join('');
    const w=window.open('','_blank','width=1100,height=850');if(!w){toast('Permita a janela de impressão no navegador');return}try{w.opener=null}catch{}
    w.document.open();w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>'+esc(name)+' · '+esc(code)+'</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17211b;margin:0}.lot-print-head{border-bottom:2px solid #17211b;padding-bottom:8px;margin-bottom:10px}.lot-print-head h1{font-size:20px;margin:0 0 5px}.lot-print-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px}.lot-print-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7mm 4mm}.lot-print-card{break-inside:avoid;border:1px solid #cfd7d1;border-radius:8px;display:flex;flex-direction:column;align-items:center;min-height:58mm;padding:4mm;text-align:center}.lot-print-card img{width:100%;height:34mm;object-fit:contain;margin-bottom:3mm}.lot-print-name{font-size:11px;font-weight:700;line-height:1.25}.lot-print-qty{font-size:13px;font-weight:800;margin-top:auto;padding-top:3mm}@media print{button{display:none}}</style></head><body><header class="lot-print-head"><h1>'+esc(name)+'</h1><div class="lot-print-meta"><div><b>Código</b><br>'+esc(code)+'</div><div><b>Valor</b><br>'+money(cents(price))+'</div><div><b>Quantidade do lote</b><br>'+esc(fmtQty(l.quantity_built||0))+'</div></div></header><main class="lot-print-grid">'+cards+'</main><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));<\/script></body></html>');w.document.close();
  }
  async function mountBasketKitLot(lotId){
    const op=requireOperator();if(!op)return;
    try{await api('basket_kit_lot_draft_activate',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lot_id:lotId,operator:op})});toast('Lote marcado como montado · continua fora do site');await openBasketKitAdmin(state.basketKitDetail.kit.id)}
    catch(e){const c=String(e?.message||'');toast(c==='insufficient_loose_stock'?'Falta estoque para marcar este lote como montado.':c==='lot_product_unavailable'?'Há produto indisponível neste lote.':'Não consegui concluir a montagem.')}
  }
  async function reopenBasketKitLot(lotId){
    const op=requireOperator();if(!op)return;if(!confirm('Reabrir este lote para edição? O estoque reservado por ele ficará disponível até você marcar como montado novamente.'))return;
    const kid=state.basketKitDetail?.kit?.id;
    try{await api('basket_kit_lot_reopen',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lot_id:lotId,operator:op})});await openBasketKitAdmin(kid);startBasketKitLotDraft(lotId);toast('Lote reaberto para edição')}
    catch(e){const c=String(e?.message||'');toast(c==='lot_sale_must_be_disabled'?'Desative o lote no site antes de editar.':c==='lot_has_order_history'?'Este lote já foi usado em pedido e deve permanecer no histórico.':c==='lot_already_changed'?'Este lote já teve unidades consumidas ou desmontadas e não pode voltar para edição.':c==='lot_is_dependency'?'Outro lote montado depende deste vínculo. Edite o vínculo primeiro.':'Não consegui reabrir o lote.')}
  }
  function paintBasketKitAdmin(){'''
h=sub_once(h,lot_row_pattern,lot_row_new,'replace kit lot row and print/reopen',flags=re.M)

# Detail header, KPIs, model buttons.
h=replace_once(h,
"      '<div class=\"page-head\"><div><button class=\"text\" id=\"backToBasketKits\" type=\"button\">← Cestas</button><h1>'+esc(title)+'</h1><p>O código físico usa '+esc(k.code_prefix)+' + 1 número. Duplique qualquer lote e altere somente o que mudou.</p></div><button class=\"primary\" id=\"newKitLot\" type=\"button\">+ Novo lote</button></div>'+",
"      '<div class=\"page-head\"><div><button class=\"text\" id=\"backToBasketKits\" type=\"button\">← Cestas</button><h1>'+esc(title)+'</h1><p>O código físico usa '+esc(k.code_prefix)+' + 1 número. Duplique qualquer lote e altere somente o que mudou.</p></div><div class=\"basket-toolbar\"><button class=\"secondary\" id=\"editKitTemplate\" type=\"button\">Editar modelo</button><button class=\"text danger\" id=\"archiveKitTemplate\" type=\"button\">Excluir modelo</button><button class=\"primary\" id=\"newKitLot\" type=\"button\">+ Novo lote</button></div></div>'+",
'kit detail model actions')
h=replace_once(h,
"      '<div class=\"bling-grid\"><div class=\"bling-card\"><small>Prefixo</small><strong>'+esc(k.code_prefix)+'#</strong></div><div class=\"bling-card\"><small>Prontos</small><strong>'+esc(d.ready_quantity||0)+'</strong></div><div class=\"bling-card\"><small>Capacidade do modelo</small><strong>'+esc(cap)+'</strong></div><div class=\"bling-card\"><small>Próximo código</small><strong>'+esc(d.next_short_code||'—')+'</strong></div></div>'+",
"      '<div class=\"bling-grid\"><div class=\"bling-card\"><small>Prefixo</small><strong>'+esc(k.code_prefix)+'#</strong></div><div class=\"bling-card\"><small>Montados</small><strong>'+esc(d.ready_quantity||0)+'</strong></div><div class=\"bling-card\"><small>Em edição</small><strong>'+esc(d.draft_lot_count||0)+'</strong><span class=\"sub\">'+esc(d.draft_quantity||0)+' unidade(s) planejada(s)</span></div><div class=\"bling-card\"><small>Capacidade do modelo</small><strong>'+esc(cap)+'</strong></div><div class=\"bling-card\"><small>Próximo código</small><strong>'+esc(d.next_short_code||'—')+'</strong></div></div>'+",
'kit detail KPIs')
h=replace_once(h,
"      '<details id=\"kitTemplateReference\" class=\"panel\" style=\"padding:14px;margin-bottom:14px\"><summary>Consultar modelo padrão · '+esc((d.items||[]).length)+' produtos</summary><p class=\"sub\">Referência para novos lotes. As alterações são feitas somente na composição do lote.</p>'+",
"      '<details id=\"kitTemplateReference\" class=\"panel\" style=\"padding:14px;margin-bottom:14px\"><summary>Consultar modelo padrão · '+esc((d.items||[]).length)+' produtos</summary><p class=\"sub\">Referência para novos lotes. Use <b>Editar modelo</b> para salvar alterações permanentes nos próximos lotes.</p>'+",
'kit model reference copy')
h=replace_once(h,
"    $('#newKitLot').onclick=()=>startBasketKitLotDraft(null);",
"    $('#newKitLot').onclick=()=>startBasketKitLotDraft(null);\n    $('#editKitTemplate').onclick=openBasketKitTemplateEditor;\n    $('#archiveKitTemplate').onclick=archiveBasketKitTemplate;",
'bind kit model buttons')
h=replace_once(h,
"    content.querySelectorAll('[data-kit-lot-resume]').forEach(btn=>btn.onclick=()=>startBasketKitLotDraft(btn.dataset.kitLotResume));",
"    content.querySelectorAll('[data-kit-lot-resume]').forEach(btn=>btn.onclick=()=>startBasketKitLotDraft(btn.dataset.kitLotResume));\n    content.querySelectorAll('[data-kit-lot-mount]').forEach(btn=>btn.onclick=()=>mountBasketKitLot(btn.dataset.kitLotMount));\n    content.querySelectorAll('[data-kit-lot-edit]').forEach(btn=>btn.onclick=()=>reopenBasketKitLot(btn.dataset.kitLotEdit));\n    content.querySelectorAll('[data-kit-lot-print]').forEach(btn=>btn.onclick=()=>printBasketKitLot(btn.dataset.kitLotPrint));",
'bind lot mount edit print')

# Model editor functions before draft capacity helper.
model_ui='''  function openBasketKitTemplateEditor(){
    const d=state.basketKitDetail;if(!d)return;
    state.basketKitTemplateDraft={name:d.kit.name||'',code_prefix:d.kit.code_prefix||'',items:(d.items||[]).map(x=>({id:x.id,product_id:x.product_id,source_template_item_id:x.source_template_item_id||null,quantity:Number(x.quantity||1),product:x.product}))};
    paintBasketKitTemplateEditor();if(!$('#editor').open)$('#editor').showModal();
  }
  function paintBasketKitTemplateEditor(){
    const draft=state.basketKitTemplateDraft;if(!draft)return;
    $('#editorTitle').textContent='Editar modelo do kit';
    $('#editorBody').innerHTML='<div class="form-grid"><label><span>Nome do modelo</span><input id="kitModelName" maxlength="180" value="'+esc(draft.name)+'"></label><label><span>Prefixo dos lotes</span><input id="kitModelPrefix" maxlength="2" value="'+esc(draft.code_prefix)+'" style="text-transform:uppercase"></label><label class="span-2"><span>Adicionar produto</span><input id="kitModelSearch" type="search" placeholder="Nome, EAN ou código"></label><div class="span-2" id="kitModelSearchResults"></div></div><div class="basket-component-list">'+draft.items.map((x,i)=>'<div class="basket-component-row"><img src="'+esc(x.product?.image_url||'/img/sem-foto.svg')+'" alt=""><div class="basket-component-main"><strong>'+esc(x.product?.name||'Produto')+'</strong><small>'+esc(x.product?.sku||x.product?.gtin||'')+'</small></div><label><span class="sub">Qtd. por kit</span><input class="basket-inline-input" data-kit-model-qty="'+i+'" type="number" min="1" max="100" step="1" value="'+esc(x.quantity)+'"></label><div></div><div class="basket-row-actions"><button class="text danger" type="button" data-kit-model-remove="'+i+'">Remover</button></div></div>').join('')+'</div>';
    $('#editorActions').innerHTML='<button class="secondary" id="cancelKitModel" type="button">Cancelar</button><button class="primary" id="saveKitModel" type="button">Salvar modelo</button>';
    $('#cancelKitModel').onclick=()=>$('#editor').close();$('#saveKitModel').onclick=saveBasketKitTemplate;
    $('#kitModelName').oninput=e=>draft.name=e.currentTarget.value;$('#kitModelPrefix').oninput=e=>draft.code_prefix=String(e.currentTarget.value||'').toUpperCase();
    $('#kitModelSearch').oninput=e=>{clearTimeout(state.basketKitTemplateSearchTimer);const q=String(e.currentTarget.value||'').trim();if(q.length<2){$('#kitModelSearchResults').innerHTML='';return}state.basketKitTemplateSearchTimer=setTimeout(()=>searchBasketKitTemplateProducts(q),220)};
    $('#editorBody').querySelectorAll('[data-kit-model-qty]').forEach(el=>el.oninput=()=>{draft.items[Number(el.dataset.kitModelQty)].quantity=Number(el.value)});
    $('#editorBody').querySelectorAll('[data-kit-model-remove]').forEach(btn=>btn.onclick=()=>{if(draft.items.length<=1){toast('O modelo precisa ter pelo menos um produto.');return}draft.items.splice(Number(btn.dataset.kitModelRemove),1);paintBasketKitTemplateEditor()});
  }
  async function searchBasketKitTemplateProducts(q){
    const host=$('#kitModelSearchResults');if(!host)return;host.innerHTML='<div class="loading">Buscando…</div>';
    try{const data=await api('basket_product_search',{q,limit:12});if($('#kitModelSearch')?.value.trim()!==q)return;host.innerHTML=(data.products||[]).length?'<div class="basket-product-picker-grid">'+data.products.map(p=>basketProductPickerCard(p,'data-kit-model-pick','Adicionar')).join('')+'</div>':'<div class="history-empty">Nenhum produto encontrado.</div>';host.querySelectorAll('[data-kit-model-pick]').forEach(btn=>btn.onclick=()=>{const p=data.products.find(x=>String(x.id)===String(btn.dataset.kitModelPick));if(!p)return;if(state.basketKitTemplateDraft.items.some(x=>String(x.product_id)===String(p.id))){toast('Este produto já está no modelo.');return}state.basketKitTemplateDraft.items.push({id:null,product_id:p.id,source_template_item_id:null,quantity:1,product:p});paintBasketKitTemplateEditor()})}catch{host.innerHTML='<div class="history-empty">Não consegui buscar produtos.</div>'}
  }
  async function saveBasketKitTemplate(){
    const d=state.basketKitDetail,draft=state.basketKitTemplateDraft,op=requireOperator();if(!d||!draft||!op)return;
    if(!String(draft.name||'').trim()||!/^[A-Z]{2}$/.test(String(draft.code_prefix||'').toUpperCase())||!draft.items.length||draft.items.some(x=>!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>100)){toast('Confira nome, prefixo de 2 letras e quantidades de 1 a 100.');return}
    const btn=$('#saveKitModel');btn.disabled=true;
    try{await api('basket_kit_template_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kit_template_id:d.kit.id,name:draft.name,code_prefix:draft.code_prefix,items:draft.items.map(x=>({id:x.id||null,product_id:x.product_id,source_template_item_id:x.source_template_item_id||null,quantity:Number(x.quantity)})),operator:op})});$('#editor').close();toast('Modelo salvo');await openBasketKitAdmin(d.kit.id)}
    catch(e){const c=String(e?.message||'');toast(c==='kit_template_product_duplicate'?'O mesmo produto não pode aparecer duas vezes no modelo.':c==='kit_template_product_unavailable'?'Há produto inativo no modelo.':'Não consegui salvar o modelo.');btn.disabled=false}
  }
  async function archiveBasketKitTemplate(){
    const d=state.basketKitDetail,op=requireOperator();if(!d||!op)return;if(!confirm('Excluir este modelo de kit? Lotes e pedidos históricos serão preservados.'))return;
    try{await api('basket_kit_template_archive',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kit_template_id:d.kit.id,operator:op})});toast('Modelo excluído');await renderBaskets()}
    catch(e){toast(String(e?.message||'')==='kit_template_has_live_lots'?'Há lote em edição ou montado neste modelo. Exclua/finalize os lotes antes.':'Não consegui excluir o modelo.')}
  }
'''
h=replace_once(h,'  function basketKitDraftCapacityFromItems(items){',model_ui+'  function basketKitDraftCapacityFromItems(items){','insert kit model editor')

# Explicit “mark mounted” copy in composer.
h=replace_once(h,
"    $('#activateKitLotDraft').textContent='Confirmar montagem de '+fmtQty(draft.quantity)+' kit'+(draft.quantity===1?'':'s');",
"    $('#activateKitLotDraft').textContent='Marcar como montado · '+fmtQty(draft.quantity)+' kit'+(draft.quantity===1?'':'s');",
'composer mounted label')

# Basket model archive button and action.
h=replace_once(h,
"<div class=\"basket-toolbar\"><button class=\"secondary\" id=\"editBasketMeta\" type=\"button\">Editar cesta</button></div></div>'+",
"<div class=\"basket-toolbar\"><button class=\"secondary\" id=\"editBasketMeta\" type=\"button\">Editar cesta</button><button class=\"text danger\" id=\"archiveBasket\" type=\"button\">Excluir modelo</button></div></div>'+",
'basket archive button')
h=replace_once(h,
"    $('#editBasketMeta').onclick=openBasketMetaEditor;",
"    $('#editBasketMeta').onclick=openBasketMetaEditor;\n    $('#archiveBasket').onclick=archiveBasketModel;",
'bind basket archive')
basket_ui='''  async function archiveBasketModel(){
    const b=state.basketDetail?.basket,op=requireOperator();if(!b||!op)return;if(!confirm('Excluir este modelo de cesta? Lotes e pedidos históricos serão preservados.'))return;
    try{await api('basket_archive',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({basket_id:b.id,operator:op})});toast('Modelo de cesta excluído');await renderBaskets()}
    catch(e){const c=String(e?.message||'');toast(c==='basket_has_active_kit_templates'?'Esta cesta ainda possui modelo(s) de kit ativo(s). Exclua os kits primeiro.':c==='basket_has_live_lots'?'Esta cesta ainda possui lote em edição ou montado.':'Não consegui excluir o modelo de cesta.')}
  }
'''
h=replace_once(h,'  function openBasketMetaEditor(){',basket_ui+'  function openBasketMetaEditor(){','insert basket archive UI')
ADMIN.write_text(h)

print('patch applied')
