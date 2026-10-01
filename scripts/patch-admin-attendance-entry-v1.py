from pathlib import Path

path=Path('vitrine/admin/index.html')
s=path.read_text(encoding='utf-8')

nav_anchor='''            <button class="admin-sidebar-item" data-tab="today" type="button"><span class="nav-item-icon" aria-hidden="true">⌂</span><span>Central</span></button>'''
nav_new=nav_anchor+'''\n            <button class="admin-sidebar-item" data-tab="attendance" type="button"><span class="nav-item-icon" aria-hidden="true">☏</span><span>Atendimento</span></button>'''

if 'data-tab="attendance"' not in s:
    if s.count(nav_anchor)!=1:
        raise SystemExit(f'nav anchor count invalid: {s.count(nav_anchor)}')
    s=s.replace(nav_anchor,nav_new,1)

router_anchor='''  function setTab(tab){'''
attendance_code=r'''  function attendanceUuid(value){
    const s=String(value||'').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:'';
  }
  function attendanceQuoteDraft(customerId){
    sessionStorage.setItem('dona_antonia_orcamento_draft_v1',JSON.stringify({customer_id:customerId,source:'attendance'}));
  }
  function renderAttendance(){
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Atendimento</h1><p>0975 e 1018 em uma central simples, com contexto de cliente e pedidos.</p></div></div>'+ 
      '<div class="quote-admin-shell"><iframe id="attendanceFrame" class="quote-admin-frame" title="Central de Atendimento Dona Antônia" loading="eager"></iframe></div>';
    const frame=$('#attendanceFrame');
    if(frame)frame.src='/vitrine/admin/atendimento/?embedded=1';
  }
  async function attendanceOpenCustomer(customerId){
    setTab('customers');
    try{
      const data=await customerApi('vitrine_customer_get',{id:customerId});
      const customer=data?.customer||null;
      if(customer&&typeof openCustomerEditor==='function')openCustomerEditor(customer);
    }catch(e){toast('Cliente aberto na lista; não consegui carregar o cadastro automaticamente')}
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin)return;
    const data=event.data;
    if(data?.type!=='da-attendance')return;
    const action=String(data.action||'');
    if(action==='open_order'){
      const id=attendanceUuid(data.order_id);if(!id)return;
      setTab('orders');
      if(typeof openOrder==='function')setTimeout(()=>openOrder(id),0);
      return;
    }
    if(action==='open_customer'){
      const id=attendanceUuid(data.customer_id);if(!id)return;
      attendanceOpenCustomer(id);return;
    }
    if(action==='open_quote'){
      const id=attendanceUuid(data.customer_id);if(!id)return;
      attendanceQuoteDraft(id);setTab('quotes');return;
    }
    if(action==='new_sale'){
      const id=attendanceUuid(data.customer_id);if(!id)return;
      attendanceQuoteDraft(id);
      if(typeof openManualSale==='function'){openManualSale(id);return}
      setTab('quotes');toast('Cliente preparado para nova venda em Orçamentos');
    }
  });

'''

if 'function renderAttendance()' not in s:
    if s.count(router_anchor)!=1:
        raise SystemExit(f'router anchor count invalid: {s.count(router_anchor)}')
    s=s.replace(router_anchor,attendance_code+router_anchor,1)

route_anchor="    if(tab==='today')renderToday();"
route_new=route_anchor+"\n    if(tab==='attendance')renderAttendance();"
if "if(tab==='attendance')renderAttendance();" not in s:
    if s.count(route_anchor)!=1:
        raise SystemExit(f'route anchor count invalid: {s.count(route_anchor)}')
    s=s.replace(route_anchor,route_new,1)

required=[
    'data-tab="attendance"',
    'function renderAttendance()',
    '/vitrine/admin/atendimento/?embedded=1',
    "if(tab==='attendance')renderAttendance();",
    "data?.type!=='da-attendance'",
    "event.origin!==location.origin",
    'dona_antonia_orcamento_draft_v1'
]
for marker in required:
    if marker not in s:
        raise SystemExit('missing marker after patch: '+marker)

path.write_text(s,encoding='utf-8')
print('attendance Admin entry patch applied')
