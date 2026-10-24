import {attendanceAuthorizedFetch} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const ORDERS_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-products-live-v1';
const FOLLOW_UP_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-order-delivery-comms-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const PAGE_SIZE=5;
let activeRoot=null;
let orders=[];
let offset=0;
let hasMore=false;
let busy=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateValue=value=>{const date=new Date(value||0);return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10)};
const dateLabel=value=>{const date=new Date(value||0);return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const money=cents=>Number(cents||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const channelOf=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.endsWith('1018')?'1018':digits.endsWith('0975')?'0975':'unknown'};
const orderCode=order=>order.public_code||order.order_number||String(order.id||'').slice(-8)||'—';

async function adminGet(action,params={}){
  const url=new URL(ORDERS_API);url.searchParams.set('action',action);
  for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));
  const response=await attendanceAuthorizedFetch(url,{method:'GET',headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw new Error(data?.error||`orders_${response.status}`);
  return data;
}

async function adminPost(orderId){
  const response=await attendanceAuthorizedFetch(FOLLOW_UP_API,{method:'POST',headers:{apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw new Error(data?.error||`post_sale_${response.status}`);
  return data;
}

function currentFilters(){
  const root=activeRoot;
  return {
    search:String(root?.querySelector('[data-post-sale-search]')?.value||'').trim().toLowerCase(),
    from:String(root?.querySelector('[data-post-sale-from]')?.value||''),
    to:String(root?.querySelector('[data-post-sale-to]')?.value||''),
    channel:String(root?.querySelector('[data-post-sale-channel]')?.value||'')
  };
}

function filteredOrders(){
  const filter=currentFilters();
  return orders.filter(order=>{
    if(String(order.status||'').toLowerCase()!=='delivered')return false;
    const haystack=[orderCode(order),order.customer_name,order.whatsapp_phone_e164].join(' ').toLowerCase();
    if(filter.search&&!haystack.includes(filter.search))return false;
    const delivered=dateValue(order.delivered_at||order.created_at);
    if(filter.from&&delivered<filter.from)return false;
    if(filter.to&&delivered>filter.to)return false;
    const channel=channelOf(order.whatsapp_phone_e164);
    if(filter.channel&&filter.channel!==channel)return false;
    return true;
  });
}

function card(order){
  const channel=channelOf(order.whatsapp_phone_e164);
  const channelLabel=channel==='unknown'?'Canal não identificado':`WhatsApp ${channel}`;
  return `<article class="marketing-post-sale-card" data-post-sale-order="${esc(order.id)}">
    <div class="marketing-post-sale-card-main"><div><strong>Pedido #${esc(orderCode(order))}</strong><small>${esc(dateLabel(order.delivered_at||order.created_at))}</small></div><span class="marketing-post-sale-status">Entregue</span></div>
    <div class="marketing-post-sale-customer"><strong>${esc(order.customer_name||'Cliente')}</strong><span>${esc(order.whatsapp_phone_e164||'Telefone não informado')} · ${esc(channelLabel)}</span><span>${esc(money(order.total_cents))}</span></div>
    <p class="marketing-post-sale-history">Histórico de contato: indisponível nesta consulta. O envio só será marcado após confirmação da API.</p>
    <div class="marketing-post-sale-actions"><button type="button" data-post-sale-order-open="${esc(order.id)}">Ver pedido</button><button type="button" data-post-sale-chat-open="${esc(order.id)}">Abrir conversa</button><button type="button" class="primary" data-post-sale-send="${esc(order.id)}" data-order-code="${esc(orderCode(order))}" data-order-total="${esc(money(order.total_cents))}">Enviar pós-venda</button></div>
  </article>`;
}

function renderList(){
  const host=activeRoot?.querySelector('[data-post-sale-list]');if(!host)return;
  const visible=filteredOrders();
  activeRoot.querySelector('[data-post-sale-count]').textContent=`${visible.length} pedido(s) nesta página · ${orders.length} carregado(s)`;
  host.innerHTML=visible.length?visible.map(card).join(''):'<div class="marketing-post-sale-empty">Nenhum pedido entregue corresponde aos filtros carregados.</div>';
  host.querySelectorAll('[data-post-sale-order-open]').forEach(button=>button.addEventListener('click',()=>dispatchOrderEvent('marketing:open-order',button.dataset.postSaleOrder,button)));
  host.querySelectorAll('[data-post-sale-chat-open]').forEach(button=>button.addEventListener('click',()=>dispatchOrderEvent('marketing:open-conversation',button.dataset.postSaleChatOpen,button)));
  host.querySelectorAll('[data-post-sale-send]').forEach(button=>button.addEventListener('click',()=>sendFollowUp(button)));
}

function dispatchOrderEvent(name,orderId,trigger){
  document.dispatchEvent(new CustomEvent(name,{detail:{order_id:orderId,trigger}}));
}

async function sendFollowUp(button){
  if(busy)return;
  const code=button.dataset.orderCode||'pedido';
  const total=button.dataset.orderTotal||'';
  const confirmed=confirm(`Enviar manualmente o pós-venda do pedido #${code}?\n\nSerá enviado: uma mensagem de confirmação da entrega${total?` e do pagamento de ${total}`:''}, pedindo retorno caso algo tenha dado errado. Em seguida, o sistema também solicitará consentimento para ofertas semanais por WhatsApp.\n\nA solicitação de consentimento é separada da mensagem de pós-venda.`);
  if(!confirmed)return;
  try{
    busy=true;button.disabled=true;button.textContent='Enviando…';
    const result=await adminPost(button.dataset.postSaleSend);
    const delivery=result.delivery_message||{};const consent=result.consent||{};
    const deliveryText=delivery.sent===true?'Mensagem de pós-venda enviada.':`Mensagem não enviada${delivery.reason?`: ${delivery.reason}`:'.'}`;
    const consentText=consent.sent===true?'Solicitação de consentimento enviada.':consent.skipped===true?`Solicitação de consentimento ignorada${consent.reason?`: ${consent.reason}`:'.'}`:'Estado do consentimento indisponível.';
    const notice=activeRoot?.querySelector('[data-post-sale-status]');if(notice)notice.textContent=`${deliveryText} ${consentText}`;
    button.textContent=delivery.sent===true?'Pós-venda enviado':'Tentar novamente';
    button.disabled=delivery.sent===true;
  }catch(error){
    const notice=activeRoot?.querySelector('[data-post-sale-status]');if(notice)notice.textContent=`Não foi possível enviar: ${String(error?.message||error)}`;
    button.disabled=false;button.textContent='Tentar novamente';
  }finally{busy=false}
}

async function loadPage(reset=false){
  if(busy)return;
  if(reset){offset=0;orders=[]}
  const status=activeRoot?.querySelector('[data-post-sale-status]');
  const more=activeRoot?.querySelector('[data-post-sale-more]');
  try{
    busy=true;if(more){more.disabled=true;more.textContent='Carregando…'}
    if(status)status.textContent='Carregando pedidos entregues…';
    const data=await adminGet('orders',{tab:'delivered',limit:PAGE_SIZE,offset});
    const page=(Array.isArray(data.orders)?data.orders:[]).filter(order=>String(order.status||'').toLowerCase()==='delivered');
    orders=reset?page:[...orders,...page];offset+=page.length;hasMore=data.has_more===true;
    renderList();if(status)status.textContent=orders.length?'Os pedidos exibidos vieram do painel administrativo de pedidos. O histórico de mensagens não é consultado aqui.':'Nenhum pedido entregue encontrado.';
  }catch(error){
    if(status)status.textContent=`Não foi possível carregar os pedidos: ${String(error?.message||error)}.`;
    const host=activeRoot?.querySelector('[data-post-sale-list]');if(host&&!orders.length)host.innerHTML='<div class="marketing-post-sale-empty">Tente novamente para carregar os pedidos.</div>';
  }finally{busy=false;if(more){more.disabled=!hasMore;more.textContent=hasMore?'Carregar mais pedidos':'Todos os pedidos carregados'}}
}

function bind(root){
  root.querySelectorAll('[data-post-sale-search],[data-post-sale-from],[data-post-sale-to],[data-post-sale-channel]').forEach(input=>input.addEventListener(input.tagName==='INPUT'&&input.type==='search'?'input':'change',renderList));
  root.querySelector('[data-post-sale-retry]')?.addEventListener('click',()=>loadPage(true));
  root.querySelector('[data-post-sale-more]')?.addEventListener('click',()=>loadPage(false));
  root.querySelector('[data-post-sale-clear]')?.addEventListener('click',()=>{root.querySelector('[data-post-sale-search]').value='';root.querySelector('[data-post-sale-from]').value='';root.querySelector('[data-post-sale-to]').value='';root.querySelector('[data-post-sale-channel]').value='';renderList()});
  root.querySelectorAll('[data-marketing-view]').forEach(button=>button.addEventListener('click',()=>openMarketingView(root,button.dataset.marketingView)));
}

async function openMarketingView(root,view){
  if(view==='overview')return document.querySelector('[data-tab="marketing"]')?.click();
  if(view==='post_sale')return mountPostSaleView(root);
  if(view==='repurchase')return import('/vitrine/admin/marketing/repurchase-center.js?v=marketing-repurchase-v2').then(module=>module.mountRepurchaseView(root));
  if(view==='campaigns')return (await import('/vitrine/admin/marketing/campaign-entry.js?v=marketing-campaign-entry-v8')).openCampaigns();
  if(view==='templates')return (await import('/vitrine/admin/marketing/template-center.js?v=marketing-image-bank-v1')).mountTemplateView(root);
  if(view==='strategy')return (await import('/vitrine/admin/marketing/strategy-center.js?v=marketing-strategy-v3')).mountStrategyView(root);
  if(view==='audiences')return (await import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1')).mountAudienceView(root);
  if(view==='consents')return (await import('/vitrine/admin/marketing/audience-center.js?v=marketing-audience-v1')).mountConsentView(root);
}

function ensureCss(){if(document.querySelector('link[data-da-marketing-post-sale]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/vitrine/admin/marketing/post-sale-center.css?v=marketing-post-sale-v1';link.dataset.daMarketingPostSale='1';document.head.appendChild(link)}

async function mountPostSaleView(root=document.querySelector('#content')){
  if(!root)return;ensureCss();activeRoot=root;orders=[];offset=0;hasMore=false;
  const nav=[['overview','Visão geral'],['post_sale','Pós-venda'],['repurchase','Reposição mensal'],['templates','Templates Meta'],['campaigns','Campanhas']].map(([key,label])=>`<button type="button" class="${key==='post_sale'?'active':''}" data-marketing-view="${key}">${label}</button>`).join('')+'<details class="marketing-admin-more"><summary>Mais</summary><div class="marketing-admin-more-menu"><button type="button" data-marketing-view="audiences">Públicos</button><button type="button" data-marketing-view="consents">Consentimentos</button><button type="button" data-marketing-view="strategy">Estratégia</button></div></details><span class="marketing-campaign-gate">Envio manual</span>';
  root.innerHTML=`<div class="marketing-post-sale"><div class="page-head"><div><h1>Marketing</h1><p>Pós-venda manual para pedidos que já foram entregues.</p></div></div><div class="marketing-template-subnav" data-marketing-subnav>${nav}</div><section class="marketing-post-sale-section"><div class="marketing-post-sale-head"><div><h2>Pós-venda</h2><p>Revise os pedidos entregues e escolha individualmente quando entrar em contato.</p></div><button type="button" data-post-sale-retry>Atualizar pedidos</button></div><div class="marketing-post-sale-filters"><label><span>Buscar pedido, cliente ou telefone</span><input type="search" data-post-sale-search placeholder="Ex.: código do pedido ou nome"></label><label><span>Entregue desde</span><input type="date" data-post-sale-from></label><label><span>Entregue até</span><input type="date" data-post-sale-to></label><label><span>Canal</span><select data-post-sale-channel><option value="">Todos</option><option value="0975">0975</option><option value="1018">1018</option><option value="unknown">Não identificado</option></select></label><button type="button" data-post-sale-clear>Limpar filtros</button></div><p class="marketing-post-sale-count" data-post-sale-count>0 pedido(s)</p><div class="marketing-post-sale-status" data-post-sale-status role="status" aria-live="polite">Carregando…</div><div class="marketing-post-sale-list" data-post-sale-list></div><button type="button" data-post-sale-more disabled>Carregando…</button></section></div>`;
  bind(root);await loadPage(true);
}

window.DAMarketingPostSale={mountPostSaleView};
export {mountPostSaleView,filteredOrders,channelOf};
