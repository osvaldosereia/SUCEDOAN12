from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 occurrence, found {count}")
    return text.replace(old, new, 1)

admin_path = Path('vitrine/admin/index.html')
admin = admin_path.read_text()

admin = replace_once(
    admin,
    "    const draftCount=Number(k.draft_lot_count||0);\n",
    "    const draftCount=Number(k.draft_lot_count||0);\n    const readyLotCount=Number(k.ready_lot_count||0);\n    const existingLotCount=readyLotCount+draftCount;\n",
    'kit card counters'
)

admin = replace_once(
    admin,
    "      '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:10px\"><div><span class=\"kit-code-badge\">'+esc(k.code_prefix)+'#</span></div><span class=\"pill '+(Number(k.ready_quantity||0)>0?'':draftCount>0?'warn':'off')+'\">'+(Number(k.ready_quantity||0)>0?'Montado':draftCount>0?'Em edição':'Sem lote novo')+'</span></div>'+\n",
    "      '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:10px\"><div><span class=\"kit-code-badge\">'+esc(k.code_prefix)+'#</span></div><span class=\"pill '+(readyLotCount>0?'':draftCount>0?'warn':'off')+'\">'+(readyLotCount>0?'Tem lote montado':draftCount>0?'Em edição':'Sem lote novo')+'</span></div>'+\n",
    'kit card status pill'
)

admin = replace_once(
    admin,
    "      '<div class=\"basket-kpis\"><div class=\"basket-kpi\"><small>Montados</small><strong>'+esc(k.ready_quantity||0)+'</strong></div><div class=\"basket-kpi\"><small>Em edição</small><strong>'+esc(draftCount)+'</strong></div><div class=\"basket-kpi\"><small>Ativos no site</small><strong>'+esc(k.sale_ready_quantity||0)+'</strong></div><div class=\"basket-kpi\"><small>Pode montar</small><strong>'+esc(k.max_build_from_template||0)+'</strong></div><div class=\"basket-kpi\"><small>Próximo código</small><strong>'+esc(k.next_short_code||'—')+'</strong></div></div>'+\n",
    "      '<div class=\"basket-kpis\"><div class=\"basket-kpi\"><small>Lotes existentes</small><strong>'+esc(existingLotCount)+'</strong></div><div class=\"basket-kpi\"><small>Lotes montados</small><strong>'+esc(readyLotCount)+'</strong></div><div class=\"basket-kpi\"><small>Kits disponíveis</small><strong>'+esc(k.ready_quantity||0)+'</strong></div><div class=\"basket-kpi\"><small>Em edição</small><strong>'+esc(draftCount)+'</strong></div><div class=\"basket-kpi\"><small>Ativos no site</small><strong>'+esc(k.sale_ready_quantity||0)+'</strong></div><div class=\"basket-kpi\"><small>Pode montar</small><strong>'+esc(k.max_build_from_template||0)+'</strong></div><div class=\"basket-kpi\"><small>Próximo código</small><strong>'+esc(k.next_short_code||'—')+'</strong></div></div>'+\n",
    'kit card kpis'
)

admin = replace_once(
    admin,
    "    const linkableLotsByType=linkedType?linkableLots.filter(x=>String(x.business_type||'')===linkedType):[];\n    const financial=basketKitDraftFinancials(draft,linkableLots);\n",
    "    const linkableLotsByType=linkedType?linkableLots.filter(x=>String(x.business_type||'')===linkedType):[];\n    const linkedLotOptionLabel=h=>{const status=h.status==='draft'?'Em edição':h.status==='ready'?'Montado':String(h.status||'Lote');const qty=h.status==='draft'?fmtQty(h.quantity_built||0)+' planejado(s)':fmtQty(h.quantity_available||0)+' disponível(is)';return (h.public_name||h.short_code||h.lot_code||'Lote')+' · '+(h.short_code||h.lot_code||'—')+' · '+status+' · '+qty+(h.linked_lot_id?' · já possui vínculo':'')};\n    const financial=basketKitDraftFinancials(draft,linkableLots);\n",
    'linked lot option label helper'
)

admin = replace_once(
    admin,
    "<small>Primeiro escolha o tipo. Depois selecione um lote disponível desse tipo.</small>",
    "<small>Primeiro escolha o tipo. Depois selecione um lote desta categoria. Lotes em edição podem ser vinculados e serão validados ao marcar como montado.</small>",
    'linked type helper text'
)

old_option = "linkableLotsByType.map(h=>'<option value=\"'+esc(h.id)+'\" '+(String(h.id)===String(draft.linked_lot_id||'')?'selected':'')+'>'+esc((h.public_name||h.short_code||h.lot_code||'Lote')+' · '+(h.short_code||h.lot_code||'—')+' · '+fmtQty(h.quantity_available||0)+' disponível(is)')+'</option>').join('')"
new_option = "linkableLotsByType.map(h=>'<option value=\"'+esc(h.id)+'\" '+(String(h.id)===String(draft.linked_lot_id||'')?'selected':'')+' '+(h.linked_lot_id?'disabled':'')+'>'+esc(linkedLotOptionLabel(h))+'</option>').join('')"
admin = replace_once(admin, old_option, new_option, 'linked lot options')

admin = replace_once(
    admin,
    "linkableLotsByType.length+' lote(s) disponível(is) neste tipo.':'Nenhum lote disponível neste tipo.'):'Selecione o tipo para carregar os lotes disponíveis.'",
    "linkableLotsByType.length+' lote(s) encontrado(s) nesta categoria.':'Nenhum lote desta categoria encontrado.'):'Selecione o tipo para carregar os lotes da categoria.'",
    'linked lot count helper'
)

admin = replace_once(
    admin,
    "      '<div class=\"bling-grid\"><div class=\"bling-card\"><small>Prefixo</small><strong>'+esc(k.code_prefix)+'#</strong></div><div class=\"bling-card\"><small>Montados</small><strong>'+esc(d.ready_quantity||0)+'</strong></div><div class=\"bling-card\"><small>Em edição</small><strong>'+esc(d.draft_lot_count||0)+'</strong><span class=\"sub\">'+esc(d.draft_quantity||0)+' unidade(s) planejada(s)</span></div><div class=\"bling-card\"><small>Capacidade do modelo</small><strong>'+esc(cap)+'</strong></div><div class=\"bling-card\"><small>Próximo código</small><strong>'+esc(d.next_short_code||'—')+'</strong></div></div>'+\n",
    "      '<div class=\"bling-grid\"><div class=\"bling-card\"><small>Prefixo</small><strong>'+esc(k.code_prefix)+'#</strong></div><div class=\"bling-card\"><small>Lotes existentes</small><strong>'+esc(d.existing_lot_count??(d.lots||[]).filter(x=>x.status===\"ready\"||x.status===\"draft\").length)+'</strong></div><div class=\"bling-card\"><small>Lotes montados</small><strong>'+esc(d.ready_lot_count||0)+'</strong></div><div class=\"bling-card\"><small>Kits disponíveis</small><strong>'+esc(d.ready_quantity||0)+'</strong></div><div class=\"bling-card\"><small>Em edição</small><strong>'+esc(d.draft_lot_count||0)+'</strong><span class=\"sub\">'+esc(d.draft_quantity||0)+' unidade(s) planejada(s)</span></div><div class=\"bling-card\"><small>Capacidade do modelo</small><strong>'+esc(cap)+'</strong></div><div class=\"bling-card\"><small>Próximo código</small><strong>'+esc(d.next_short_code||'—')+'</strong></div></div>'+\n",
    'kit detail kpis'
)

admin_path.write_text(admin)

api_path = Path('supabase/functions/admin-products-live-v1/index.ts')
api = api_path.read_text()

api = replace_once(
    api,
    '  const ready=[...lotRows].filter((x:any)=>x.status==="ready"&&x.quantity_available>0).sort((a:any,b:any)=>Date.parse(a.built_at)-Date.parse(b.built_at));\n  const drafts=lotRows.filter((x:any)=>x.status==="draft");\n  const saleReady=ready.filter((x:any)=>x.sale_enabled===true);',
    '  const mountedLots=[...lotRows].filter((x:any)=>x.status==="ready").sort((a:any,b:any)=>Date.parse(a.built_at)-Date.parse(b.built_at));\n  const ready=mountedLots.filter((x:any)=>x.quantity_available>0);\n  const drafts=lotRows.filter((x:any)=>x.status==="draft");\n  const saleReady=ready.filter((x:any)=>x.sale_enabled===true);',
    'detail mounted and available sets'
)

api = replace_once(
    api,
    '.not("kit_template_id","is",null).eq("status","ready").gt("quantity_available",0).is("linked_lot_id",null).order("built_at",{ascending:true});',
    '.not("kit_template_id","is",null).in("status",["draft","ready"]).order("built_at",{ascending:true});',
    'linkable lot query'
)

api = replace_once(
    api,
    '    current_lot:saleReady[0]||null,last_lot:lotRows[0]||null,ready_quantity:ready.reduce((sum:number,x:any)=>sum+x.quantity_available,0),\n    draft_quantity:drafts.reduce((sum:number,x:any)=>sum+Number(x.quantity_built||0),0),draft_lot_count:drafts.length,\n    sale_ready_quantity:saleReady.reduce((sum:number,x:any)=>sum+x.quantity_available,0),',
    '    current_lot:saleReady[0]||null,last_lot:lotRows[0]||null,ready_quantity:ready.reduce((sum:number,x:any)=>sum+x.quantity_available,0),ready_lot_count:mountedLots.length,\n    existing_lot_count:mountedLots.length+drafts.length,draft_quantity:drafts.reduce((sum:number,x:any)=>sum+Number(x.quantity_built||0),0),draft_lot_count:drafts.length,\n    sale_ready_quantity:saleReady.reduce((sum:number,x:any)=>sum+x.quantity_available,0),',
    'detail counters'
)

api_path.write_text(api)
