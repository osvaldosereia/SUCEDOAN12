(()=>{'use strict';
const ADMIN_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-products-live-v1';
const CUSTOMER_VITRINE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-order-vitrine-send-v1';
const TOKEN_KEY='da_finance_access_token_v1';
const COMPANY_WHATSAPP_E164='5565998150975';
const LEGACY_TOP_IDS=['confirmReadyOrders','newWhatsappSale','refreshOrders','orderFilters','orderIssueFilters'];
let ordersById=new Map(),lastLoadedAt=0,loadPromise=null,scheduled=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const status=value=>({storefront_received:'created',sent_to_bling:'confirmed'}[String(value||'')]||String(value||''));
const shortOrder=value=>{const text=String(value||'').trim();if(!text)return '—';const parts=text.split('-').filter(Boolean);return parts.at(-1)||text};
const adminToken=()=>String(sessionStorage.getItem(TOKEN_KEY)||'').trim();
function orderDate(value){if(!value)return '—';try{return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Cuiaba',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}catch{return String(value)}}
function toast(message,tone='ok'){
  let node=document.querySelector('#unifiedOrdersToast');
  if(!node){node=document.createElement('div');node.id='unifiedOrdersToast';node.className='unified-orders-toast';document.body.appendChild(node)}
  node.dataset.tone=tone;node.textContent=message;node.classList.add('show');clearTimeout(node._hideTimer);node._hideTimer=setTimeout(()=>node.classList.remove('show'),4200)
}
function injectStyle(){
  if(document.querySelector('#unifiedOrdersStyle'))return;
  const style=document.createElement('style');style.id='unifiedOrdersStyle';style.textContent=`
    body.unified-orders-active #content .page-head .dispatch-actions{display:none!important}
    body.unified-orders-active #orderFilters,body.unified-orders-active #orderIssueFilters{display:none!important}
    body.unified-orders-active #content .panel>.list-head.orders-layout{display:none!important}
    body.unified-orders-active #orderRows{display:grid;gap:10px;padding:10px;background:#f7f8f7}
    body.unified-orders-active #orderRows>.list-row.orders-layout{display:block;padding:0;border:0;background:transparent}
    .unified-order-card{border:1px solid #e2e8e4;border-radius:14px;background:#fff;padding:12px;box-shadow:0 1px 2px rgba(24,34,28,.04)}
    .unified-order-card:hover{border-color:#cad8cf;box-shadow:0 2px 7px rgba(24,34,28,.07)}
    .unified-order-info{display:grid;grid-template-columns:150px 190px minmax(180px,1fr);gap:10px;align-items:start}
    .unified-order-info small{display:block;color:#66716a;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.035em;margin-bottom:3px}
    .unified-order-info strong{display:block;font-size:14px;line-height:1.3;overflow-wrap:anywhere}
    .unified-order-states,.unified-order-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px;padding-top:10px;border-top:1px solid #edf1ee}
    .unified-order-state,.unified-order-action{min-height:38px;border-radius:9px;padding:0 11px;font:inherit;font-size:11px;font-weight:900;letter-spacing:.01em}
    .unified-order-state{border:1px solid #dce4df;background:#fff;color:#536159}
    .unified-order-state.done{border-color:#9bc8ad;background:#eaf6ee;color:#145b38}
    .unified-order-state:not(.done):not(:disabled):hover{border-color:#89aa96;background:#f5faf7;color:#145b38}
    .unified-order-state:disabled{opacity:.58;cursor:default}
    .unified-order-action{border:1px solid #cdd8d1;background:#fff;color:#176b43}
    .unified-order-action.primary-action{border-color:#176b43;background:#176b43;color:#fff}
    .unified-order-action:hover{background:#f2f8f4}.unified-order-action.primary-action:hover{background:#0f5836}
    .unified-order-action:disabled{opacity:.55;cursor:wait}
    .unified-orders-toast{position:fixed;right:18px;bottom:18px;z-index:10000;max-width:min(420px,calc(100vw - 36px));padding:11px 14px;border-radius:11px;background:#173f2b;color:#fff;font-size:12px;font-weight:800;box-shadow:0 10px 35px rgba(0,0,0,.2);opacity:0;transform:translateY(8px);pointer-events:none;transition:.18s ease}
    .unified-orders-toast[data-tone="warn"]{background:#7b560c}.unified-orders-toast[data-tone="error"]{background:#922536}.unified-orders-toast.show{opacity:1;transform:none}
    @media(max-width:720px){.unified-order-info{grid-template-columns:1fr 1fr}.unified-order-info>div:last-child{grid-column:1/-1}.unified-order-states,.unified-order-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.unified-order-state,.unified-order-action{padding:0 7px;font-size:10px}}
    @media(max-width:450px){.unified-order-info{grid-template-columns:1fr}.unified-order-info>div:last-child{grid-column:auto}.unified-order-actions{grid-template-columns:1fr}.unified-order-states{grid-template-columns:repeat(3,minmax(0,1fr))}}
  `;document.head.appendChild(style)
}
async function loadOrders(force=false){
  if(!force&&ordersById.size&&Date.now()-lastLoadedAt<5000)return ordersById;
  if(loadPromise)return loadPromise;
  loadPromise=(async()=>{
    const token=adminToken();if(!token)throw new Error('admin_session_required');
    const url=new URL(ADMIN_API);url.searchParams.set('action','orders');
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'}),body=await response.json().catch(()=>({}));
    if(!response.ok||body?.ok===false)throw new Error(body?.error||`orders_${response.status}`);
    ordersById=new Map((body.orders||[]).map(order=>[String(order.id),order]));lastLoadedAt=Date.now();return ordersById
  })().finally(()=>{loadPromise=null});
  return loadPromise
}
function resolveRowId(row){
  const control=row.querySelector('[data-open-order],[data-quick-confirm],[data-quick-separation],[data-order-issue-open]');
  return String(control?.dataset?.openOrder||control?.dataset?.quickConfirm||control?.dataset?.quickSeparation||control?.dataset?.orderIssueOpen||'')
}
function bridgeControls(row){
  const bridge=document.createElement('div');bridge.hidden=true;bridge.setAttribute('aria-hidden','true');
  const controls=[...row.querySelectorAll('button,a')];controls.forEach(control=>bridge.appendChild(control));return {bridge,controls}
}
function control(controls,selector){return controls.find(node=>node.matches?.(selector))||null}
function separationUrl(orderId){return `https://donaantonia.com.br/vitrine/admin/separacao/?order_id=${encodeURIComponent(orderId)}`}
function openSeparation(orderId){window.open(`/vitrine/admin/separacao/?order_id=${encodeURIComponent(orderId)}`,'_blank','noopener,noreferrer')}
function sendSeparationVitrine(order){
  const link=separationUrl(order.id),message=['SEPARAÇÃO DONA ANTÔNIA',`Pedido: #${shortOrder(order.order_number)}`,'','Abrir vitrine de separação:',link].join('\n');
  window.open(`https://wa.me/${COMPANY_WHATSAPP_E164}?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');
  toast('WhatsApp 0975 aberto com a vitrine de separação pronta para enviar.')
}
async function sendCustomerVitrine(order,button){
  const token=adminToken();if(!token){toast('Sua sessão do Admin expirou. Atualize a página.','error');return}
  button.disabled=true;const original=button.textContent;button.textContent='ENVIANDO…';
  try{
    const requestId=(crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/[^A-Za-z0-9-]/g,'').slice(0,80);
    const response=await fetch(CUSTOMER_VITRINE_API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({order_id:order.id,request_id:requestId}),cache:'no-store'}),body=await response.json().catch(()=>({}));
    if(!response.ok||body?.ok===false){
      const error=String(body?.error||`send_${response.status}`);
      if(error==='service_window_closed')throw new Error('A conversa do cliente está fora da janela de 24 horas. Abra o pedido para usar o fluxo apropriado.');
      if(error==='conversation_not_found'||error==='channel_unavailable')throw new Error('Não encontrei com segurança a conversa 0975/1018 deste pedido. O envio não foi feito.');
      throw new Error(body?.message||error)
    }
    const channel=String(body?.channel_phone_e164||'').replace(/\D+/g,'').endsWith('1018')?'1018':'0975';
    toast(`Vitrine enviada ao cliente pelo WhatsApp ${channel}.`)
  }catch(error){toast(String(error?.message||'Não foi possível enviar a vitrine ao cliente.'),'error')}
  finally{button.disabled=false;button.textContent=original}
}
function statusButton(label,done,disabled=false){return `<button type="button" class="unified-order-state${done?' done':''}" ${done||disabled?'disabled':''}>${label}</button>`}
function decorateRow(row,order){
  if(row.dataset.unifiedOrders==='1')return;
  const id=String(order?.id||resolveRowId(row));if(!id||!order)return;
  const {bridge,controls}=bridgeControls(row),openButton=control(controls,'[data-open-order]'),confirmButton=control(controls,'[data-quick-confirm]'),issueButton=control(controls,'[data-order-issue-open]');
  const s=status(order.status),confirmed=['confirmed','processing','ready','out_for_delivery','delivered'].includes(s),separated=['ready','out_for_delivery','delivered'].includes(s),delivered=s==='delivered',cancelled=s==='cancelled';
  row.dataset.unifiedOrders='1';row.dataset.orderId=id;
  row.replaceChildren(bridge);
  const card=document.createElement('article');card.className='unified-order-card';
  card.innerHTML=`<div class="unified-order-info"><div><small>Código do pedido</small><strong>#${esc(shortOrder(order.order_number||id))}</strong></div><div><small>Data</small><strong>${esc(orderDate(order.created_at))}</strong></div><div><small>Cliente</small><strong>${esc(order.customer_name||'Sem cliente')}</strong></div></div><div class="unified-order-states">${statusButton('CONFIRMADO',confirmed,cancelled)}${statusButton('SEPARADO',separated,cancelled)}${statusButton('ENTREGUE',delivered,cancelled)}</div><div class="unified-order-actions"><button type="button" class="unified-order-action" data-unified-separation-share>VITRINE SEPARAÇÃO</button><button type="button" class="unified-order-action" data-unified-customer-share>VITRINE CLIENTE</button><button type="button" class="unified-order-action primary-action" data-open-order>ABRIR PEDIDO</button></div>`;
  row.appendChild(card);
  const stateButtons=[...card.querySelectorAll('.unified-order-state')];
  if(!confirmed&&!cancelled)stateButtons[0].onclick=()=>{
    if(confirmButton){confirmButton.click();toast('Confirmando pedido…');return}
    if(issueButton){issueButton.click();toast('Revise a pendência antes de confirmar.','warn');return}
    openButton?.click()
  };
  if(!separated&&!cancelled)stateButtons[1].onclick=()=>{
    if(!confirmed){toast('Confirme o pedido antes de iniciar a separação.','warn');return}
    openSeparation(id)
  };
  if(!delivered&&!cancelled)stateButtons[2].onclick=()=>{
    if(!separated){toast('Conclua a separação antes de registrar a entrega.','warn');return}
    toast('Abra o pedido para confirmar a etapa de entrega com as validações de estoque e pagamento.','warn');openButton?.click()
  };
  card.querySelector('[data-unified-separation-share]').onclick=()=>sendSeparationVitrine(order);
  card.querySelector('[data-unified-customer-share]').onclick=event=>sendCustomerVitrine(order,event.currentTarget);
  card.querySelector('[data-open-order]').onclick=()=>openButton?.click()
}
function forceAllOrders(){
  const filters=document.querySelector('#orderFilters');if(!filters)return true;
  const all=filters.querySelector('[data-order-filter="all"]');
  if(all&&!all.classList.contains('active')){all.click();return false}
  return true
}
function hideLegacyControls(){
  for(const id of LEGACY_TOP_IDS){const element=document.getElementById(id);if(element)element.style.setProperty('display','none','important')}
  const actions=document.querySelector('#content .page-head .dispatch-actions');if(actions)actions.style.setProperty('display','none','important');
  const head=document.querySelector('#content .panel>.list-head.orders-layout');if(head)head.style.setProperty('display','none','important')
}
async function applyUnifiedOrders(force=false){
  const host=document.querySelector('#orderRows');if(!host)return document.body.classList.remove('unified-orders-active');
  document.body.classList.add('unified-orders-active');injectStyle();
  if(!forceAllOrders())return;
  hideLegacyControls();
  try{await loadOrders(force)}catch{return}
  const rows=[...host.querySelectorAll('.list-row.orders-layout')];
  for(const row of rows){const id=resolveRowId(row)||row.dataset.orderId,order=ordersById.get(String(id));if(order)decorateRow(row,order)}
  const sorted=[...host.querySelectorAll('.list-row.orders-layout[data-order-id]')].sort((a,b)=>Date.parse(ordersById.get(b.dataset.orderId)?.created_at||0)-Date.parse(ordersById.get(a.dataset.orderId)?.created_at||0));
  for(const row of sorted)host.appendChild(row)
}
function schedule(force=false){
  if(force)lastLoadedAt=0;if(scheduled)return;scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;applyUnifiedOrders(force).catch(()=>{})})
}
function boot(){
  injectStyle();schedule(true);
  const observer=new MutationObserver(mutations=>{
    let force=false;
    for(const mutation of mutations)for(const node of mutation.addedNodes){if(node.nodeType!==1)continue;if(node.matches?.('.list-row.orders-layout:not([data-unified-orders])')||node.querySelector?.('.list-row.orders-layout:not([data-unified-orders])'))force=true}
    schedule(force)
  });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.querySelector('#orderRows'))schedule(true)})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
