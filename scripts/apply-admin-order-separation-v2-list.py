from pathlib import Path

path=Path('vitrine/admin/index.html')
s=path.read_text(encoding='utf-8')

def replace_once(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing marker: {label}')
    if s.count(old)!=1:
        raise SystemExit(f'non-unique marker {label}: {s.count(old)}')
    s=s.replace(old,new,1)

replace_once(
"const filters=[['all','Todos'],['separate','Separar'],['ready','Pronto'],['delivery','Entrega'],['finalized','Finalizado']];",
"const filters=[['all','Todos'],['separate','Separar'],['delivery','Entrega'],['finalized','Finalizado']];",
'order filters')

replace_once(
"if(filter==='delivery')return o.status==='out_for_delivery';",
"if(filter==='delivery')return ['ready','out_for_delivery'].includes(o.status);",
'delivery filter')

css_marker=".row-next-action:hover{background:#dbe9fd}"
css_add=css_marker+".separation-list-actions{display:grid;gap:7px;width:100%}.separator-picks{display:flex;gap:5px;flex-wrap:wrap}.separator-chip{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;min-height:30px;padding:0 9px;font-size:11px;font-weight:850}.separator-chip.active{background:#e8f0fe;border-color:#1a73e8;color:#1558b0}.separation-list-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.separation-list-footer .sub{white-space:normal;margin:0}.separation-list-footer .separation-open{min-height:38px;padding-inline:14px}"
replace_once(css_marker,css_add,'separation list css')

helper_marker="  function orderRowPrimaryActionHtml(o,problems,shortcut){"
helper_block="""  const ORDER_SEPARATOR_OPTIONS=[['jose','José'],['claudenil','Claudenil'],['kelly','Kelly'],['jovenil','Jovenil']];
  function orderSeparationListEntry(orderId){
    return state.orderSeparationById?.[orderId]?.separation||null;
  }
  function orderSeparationListActionsHtml(o){
    const separation=orderSeparationListEntry(o.id)||{},assignment=separation.assignment||{};
    const selected=String(assignment.separator_key||'');
    const label=String(assignment.separator_label||'');
    const choices=ORDER_SEPARATOR_OPTIONS.map(([key,name])=>'<button class=\"separator-chip '+(selected===key?'active':'')+'\" type=\"button\" data-separator-name=\"'+esc(key)+'\" data-separator-order=\"'+esc(o.id)+'\">'+esc(name)+'</button>').join('');
    return '<div class=\"separation-list-actions\"><div class=\"separator-picks\">'+choices+'</div><div class=\"separation-list-footer\"><span class=\"sub\">'+esc(label?'Separador: '+label:'Escolha o separador')+'</span><button class=\"primary separation-open\" type=\"button\" data-open-separation=\"'+esc(o.id)+'\" '+(selected?'':'disabled')+'>SEPARAR</button></div></div>';
  }
  async function hydrateOrderSeparationList(rows){
    if(state.orderFilter!=='separate')return;
    state.orderSeparationById=state.orderSeparationById||{};
    state.orderSeparationListLoading=state.orderSeparationListLoading||new Set();
    const pending=(rows||[]).filter(o=>['confirmed','processing'].includes(o.status)&&!state.orderSeparationById[o.id]&&!state.orderSeparationListLoading.has(o.id));
    if(!pending.length)return;
    await Promise.all(pending.map(async o=>{
      state.orderSeparationListLoading.add(o.id);
      try{state.orderSeparationById[o.id]=await api('order_separation_get',{id:o.id})}
      catch(e){state.orderSeparationById[o.id]={error:String(e?.message||'separation_unavailable')}}
      finally{state.orderSeparationListLoading.delete(o.id)}
    }));
    if(state.orderFilter==='separate')paintOrderRows();
  }
  async function selectOrderSeparator(orderId,separatorKey,btn){
    if(btn){btn.disabled=true}
    try{
      const data=await api('order_separation_assign',{}, {
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:orderId,separator_key:separatorKey})
      });
      state.orderSeparationById=state.orderSeparationById||{};
      const previous=orderSeparationListEntry(orderId)||{};
      state.orderSeparationById[orderId]={separation:{...previous,assignment:data.assignment||{separator_key:separatorKey,separator_label:ORDER_SEPARATOR_OPTIONS.find(x=>x[0]===separatorKey)?.[1]||separatorKey}}};
      paintOrderRows();
    }catch(e){
      toast(errorMessage(e?.message||'separator_update_failed'));
      if(btn)btn.disabled=false;
    }
  }
  function openOperationalSeparation(orderId){
    if(!orderId)return;
    location.assign('/vitrine/admin/separacao/?order_id='+encodeURIComponent(orderId));
  }

"""+helper_marker
replace_once(helper_marker,helper_block,'separation list helpers')

replace_once(
"  function orderRowPrimaryActionHtml(o,problems,shortcut){\n    const next=orderNextAction(o);",
"  function orderRowPrimaryActionHtml(o,problems,shortcut){\n    const next=orderNextAction(o);\n    if(state.orderFilter==='separate'&&['confirmed','processing'].includes(o.status))return orderSeparationListActionsHtml(o);",
'order row separation branch')

paint_old="""    host.querySelectorAll('[data-open-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.openOrder));
    host.querySelectorAll('[data-order-issue-open]').forEach(b=>b.onclick=()=>openOrderForIssue(b.dataset.orderIssueOpen,b.dataset.orderIssueKind));
    host.querySelectorAll('[data-quick-confirm]').forEach(b=>b.onclick=()=>quickConfirmOrder(b.dataset.quickConfirm,b));
    host.querySelectorAll('[data-quick-separation]').forEach(b=>b.onclick=()=>quickStartSeparation(b.dataset.quickSeparation,b));
"""
paint_new=paint_old+"""    host.querySelectorAll('[data-separator-name]').forEach(b=>b.onclick=()=>selectOrderSeparator(b.dataset.separatorOrder,b.dataset.separatorName,b));
    host.querySelectorAll('[data-open-separation]').forEach(b=>b.onclick=()=>openOperationalSeparation(b.dataset.openSeparation));
    if(state.orderFilter==='separate')void hydrateOrderSeparationList(rows);
"""
replace_once(paint_old,paint_new,'separation list bindings')

path.write_text(s,encoding='utf-8')
print('patched Admin separation list v2')
