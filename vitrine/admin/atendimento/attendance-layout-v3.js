const ADMIN_ATTENDANCE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-ops-v1';
const ADMIN_TOKEN_KEY='da_finance_access_token_v1';
const ALL_CHANNEL='all';
const CHANNELS=['0975','1018'];
const QUEUE_LIMIT=50;

let allMode=true;
let bridging=false;
let quickFilter='';
let selectedConversationId='';
let currentOrder=null;
let accounts={};
let queueItemsById=new Map();
let unifiedReloadTimer=null;

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function channelByPhone(phone){
  const value=String(phone||'').replace(/\D/g,'');
  if(value.endsWith('0975'))return '0975';
  if(value.endsWith('1018'))return '1018';
  return '';
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function initials(value){
  const parts=String(value||'').trim().split(/\s+/).filter(Boolean);
  if(!parts.length)return '•';
  return (parts[0][0]+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase();
}

function money(value){
  return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function fmtDate(value){
  if(!value)return '—';
  const date=new Date(value);
  return Number.isNaN(+date)?'—':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
}

function fmtStamp(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(+date))return '';
  const today=new Date();
  const same=date.toDateString()===today.toDateString();
  return new Intl.DateTimeFormat('pt-BR',same?{hour:'2-digit',minute:'2-digit'}:{day:'2-digit',month:'2-digit'}).format(date);
}

async function waitForToken(timeout=7000){
  const start=Date.now();
  while(Date.now()-start<timeout){
    const token=String(sessionStorage.getItem(ADMIN_TOKEN_KEY)||'').trim();
    if(token)return token;
    await sleep(100);
  }
  return '';
}

async function apiV3(action,params={}){
  const token=await waitForToken();
  if(!token)throw new Error('attendance_token_unavailable');
  const url=new URL(ADMIN_ATTENDANCE_API);
  url.searchParams.set('action',action);
  for(const [key,value] of Object.entries(params))if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw new Error(data?.error||`attendance_${response.status}`);
  return data;
}

function installParentFocus(){
  if(parent===window)return;
  try{
    const doc=parent.document;
    doc.body.classList.add('attendance-focus-layout');
    let style=doc.getElementById('attendanceFocusLayoutStyle');
    if(!style){
      style=doc.createElement('style');
      style.id='attendanceFocusLayoutStyle';
      style.textContent=`
        @media(min-width:761px){
          body.attendance-focus-layout{--admin-sidebar-width:108px}
          body.attendance-focus-layout .admin-sidebar{padding:10px 7px 18px}
          body.attendance-focus-layout .admin-sidebar-title{display:none}
          body.attendance-focus-layout .admin-sidebar-section{padding-bottom:5px;margin-bottom:5px}
          body.attendance-focus-layout .admin-sidebar-item{min-height:54px;padding:6px 4px;flex-direction:column;justify-content:center;gap:3px;text-align:center;font-size:10px;line-height:1.05}
          body.attendance-focus-layout .nav-item-icon{width:28px;height:28px;flex-basis:28px}
          body.attendance-focus-layout #content.wrap{margin-right:12px;margin-left:calc(var(--admin-sidebar-width) + 12px)}
          body.attendance-focus-layout .quote-admin-frame{height:calc(100vh - 190px);min-height:650px}
        }`;
      doc.head.append(style);
    }
    const cleanup=()=>{try{doc.body.classList.remove('attendance-focus-layout')}catch{}};
    window.addEventListener('pagehide',cleanup,{once:true});
    window.addEventListener('beforeunload',cleanup,{once:true});
  }catch{}
}

function setupStructure(){
  document.body.classList.add('attendance-layout-v3');
  if(new URLSearchParams(location.search).get('embedded')==='1')document.body.classList.add('embedded-layout');
  installParentFocus();

  const switcher=$('.channel-switcher');
  if(switcher&&!$('#allChannelsBtn')){
    const all=document.createElement('button');
    all.type='button';
    all.id='allChannelsBtn';
    all.textContent='Todas';
    all.className='active';
    all.setAttribute('aria-pressed','true');
    switcher.prepend(all);
    all.addEventListener('click',()=>{
      allMode=true;
      syncSwitcher();
      refreshUnifiedQueue().catch(()=>{});
    });
  }

  const queue=$('.queue-column');
  const search=$('.global-search');
  if(queue&&search&&!$('.queue-search-slot')){
    const slot=document.createElement('div');
    slot.className='queue-search-slot';
    slot.append(search);
    const switcherNode=$('.channel-switcher');
    switcherNode?.after(slot);
  }

  if(queue&&!$('#queueQuickFilters')){
    const filters=document.createElement('div');
    filters.className='queue-quick-filters';
    filters.id='queueQuickFilters';
    for(const [value,label] of [['unread','Não lidas'],['order','Pedidos'],['pending','Cadastro pendente']]){
      const button=document.createElement('button');
      button.type='button';
      button.dataset.queueFilter=value;
      button.textContent=label;
      button.addEventListener('click',()=>{
        quickFilter=quickFilter===value?'':value;
        syncQuickFilterButtons();
        if(allMode)refreshUnifiedQueue().catch(()=>{});else applyChannelDomFilter();
      });
      filters.append(button);
    }
    const anchor=$('.queue-organizer')||$('#queueList');
    anchor?.before(filters);
  }

  const quickTools=$('.quick-tools');
  const mediaLabel=$('.composer-media label');
  if(quickTools&&mediaLabel&&!mediaLabel.classList.contains('attach-tool')){
    [...mediaLabel.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).forEach(node=>node.remove());
    const caption=document.createElement('span');
    caption.textContent='📎 Anexar';
    mediaLabel.prepend(caption);
    mediaLabel.classList.add('attach-tool');
    quickTools.prepend(mediaLabel);
  }

  const more=$('#moreToolsMenu');
  const catalog=$('#catalogBtn');
  if(more&&catalog&&!more.contains(catalog))more.prepend(catalog);

  if(quickTools&&!$('#orderComposerTool')){
    const orderButton=document.createElement('button');
    orderButton.type='button';
    orderButton.id='orderComposerTool';
    orderButton.textContent='🛒 Pedido';
    orderButton.disabled=true;
    orderButton.addEventListener('click',()=>{
      if(currentOrder?.id)parent.postMessage({type:'da-attendance',action:'open_order',order_id:currentOrder.id},location.origin);
    });
    const moreBtn=$('#moreToolsBtn');
    if(moreBtn)quickTools.insertBefore(orderButton,moreBtn);else quickTools.append(orderButton);
  }

  const tabs=$('.context-tabs');
  if(tabs&&!$('#contextOverviewBtn')){
    const overview=document.createElement('button');
    overview.type='button';
    overview.id='contextOverviewBtn';
    overview.className='context-overview-btn';
    overview.textContent='← Visão geral';
    overview.addEventListener('click',()=>showOperationalContext());
    tabs.prepend(overview);
  }

  const contextPane=$('#contextPane');
  if(contextPane&&!$('#operationalContextBody')){
    const body=document.createElement('div');
    body.id='operationalContextBody';
    body.className='operational-context-body';
    contextPane.append(body);
  }

  const mediaInput=$('#mediaFile');
  const mediaBox=$('.composer-media');
  if(mediaInput&&mediaBox){
    const sync=()=>mediaBox.classList.toggle('has-media',Boolean(mediaInput.files?.length));
    mediaInput.addEventListener('change',sync);
    $('#sendMediaBtn')?.addEventListener('click',()=>setTimeout(sync,500));
    sync();
  }

  $('#productsBtn')?.addEventListener('click',()=>showLegacyContext('products'));
  $('#openContextBtn')?.addEventListener('click',()=>showOperationalContext());

  for(const button of $$('[data-channel-switch]')){
    button.addEventListener('click',()=>{
      if(bridging)return;
      allMode=false;
      syncSwitcher();
      setTimeout(applyChannelDomFilter,120);
    },true);
  }

  $('#globalSearch')?.addEventListener('input',()=>{
    if(allMode)scheduleUnifiedReload(320);
  });
  $('#labelFilter')?.addEventListener('change',()=>{
    if(allMode)scheduleUnifiedReload(80);
  });

  const queueList=$('#queueList');
  queueList?.addEventListener('click',event=>{
    const card=event.target.closest('.queue-card');
    if(!card)return;
    const id=String(card.dataset.conversationId||'');
    if(!id)return;
    selectedConversationId=id;
    if(!card.classList.contains('queue-card-v3'))setTimeout(()=>renderOperationalContext(id).catch(()=>{}),180);
  },true);

  const queueObserver=new MutationObserver(()=>{
    if(bridging)return;
    if(allMode){
      const hasUnified=Boolean($('#queueList .queue-card-v3'));
      if(!hasUnified)scheduleUnifiedReload(140);
    }else applyChannelDomFilter();
  });
  if(queueList)queueObserver.observe(queueList,{childList:true,subtree:false});

  const head=$('#conversationHead');
  if(head){
    const headObserver=new MutationObserver(syncConversationAvatar);
    headObserver.observe(head,{childList:true,subtree:true,characterData:true});
    syncConversationAvatar();
  }

  const switcherObserver=new MutationObserver(syncSwitcher);
  if(switcher)switcherObserver.observe(switcher,{subtree:true,attributes:true,attributeFilter:['class','disabled']});

  syncQuickFilterButtons();
  syncSwitcher();
}

function syncSwitcher(){
  const all=$('#allChannelsBtn');
  if(all){
    all.disabled=false;
    all.classList.toggle('active',allMode);
    all.setAttribute('aria-pressed',String(allMode));
  }
  for(const button of $$('[data-channel-switch]')){
    if(allMode)button.classList.remove('active');
  }
}

function syncQuickFilterButtons(){
  $$('#queueQuickFilters [data-queue-filter]').forEach(button=>button.classList.toggle('active',button.dataset.queueFilter===quickFilter));
}

function scheduleUnifiedReload(delay=160){
  clearTimeout(unifiedReloadTimer);
  unifiedReloadTimer=setTimeout(()=>refreshUnifiedQueue().catch(()=>{}),delay);
}

async function loadAccountsV3(){
  const data=await apiV3('accounts');
  accounts={};
  for(const account of data.items||[]){
    const channel=channelByPhone(account.phone_e164);
    if(channel)accounts[channel]=account;
  }
  return accounts;
}

function itemMatchesQuickFilter(item){
  if(quickFilter==='unread')return Number(item.unread_count||0)>0;
  if(quickFilter==='order')return Boolean(item.has_order);
  if(quickFilter==='pending')return Boolean(item.registration_incomplete);
  return true;
}

function updateQuickCounts(items){
  const counts={
    unread:items.filter(item=>Number(item.unread_count||0)>0).length,
    order:items.filter(item=>item.has_order).length,
    pending:items.filter(item=>item.registration_incomplete).length
  };
  const labels={unread:'Não lidas',order:'Pedidos',pending:'Cadastro pendente'};
  for(const button of $$('#queueQuickFilters [data-queue-filter]')){
    const key=button.dataset.queueFilter;
    button.textContent=`${labels[key]}${counts[key]?` ${counts[key]}`:''}`;
  }
}

function createUnifiedCard(item){
  const name=item.display_name||item.phone_e164||'Contato';
  const button=document.createElement('button');
  button.type='button';
  button.className='queue-card queue-card-v3';
  button.dataset.conversationId=item.conversation_id;
  button.dataset.unifiedChannel=item.__channel;
  button.setAttribute('data-unified-channel',item.__channel);
  if(selectedConversationId===item.conversation_id)button.classList.add('selected');

  const avatar=document.createElement('span');
  avatar.className='queue-avatar';
  avatar.textContent=initials(name);

  const main=document.createElement('span');
  main.className='queue-card-v3-main';
  const title=document.createElement('span');
  title.className='queue-title';
  const titleName=document.createElement('span');
  titleName.textContent=name;
  const time=document.createElement('span');
  time.className='queue-time';
  time.textContent=fmtStamp(item.canonical_last_message_at||item.last_message_at);
  title.append(titleName,time);

  const preview=document.createElement('span');
  preview.className='queue-preview';
  const previewText=document.createElement('span');
  previewText.textContent=item.last_message_text||({audio:'Áudio',image:'Imagem',document:'Documento'}[item.last_message_type]||'Sem mensagem');
  preview.append(previewText);
  if(Number(item.unread_count||0)>0){
    const badge=document.createElement('span');
    badge.className='unread-badge';
    badge.textContent=String(Math.min(99,Number(item.unread_count||0)));
    preview.append(badge);
  }

  const chips=document.createElement('span');
  chips.className='chips';
  if(item.has_order)chips.append(makeChip('Pedido','order'));
  if(item.registration_incomplete)chips.append(makeChip('Cadastro pendente','pending'));
  chips.append(makeChip(item.__channel,'channel'));
  for(const label of item.labels||[]){
    const chip=document.createElement('span');
    chip.className='label-chip';
    chip.textContent=label.name;
    chip.style.setProperty('--label-color',label.color||'#5f6368');
    chips.append(chip);
  }

  main.append(title,preview,chips);
  button.append(avatar,main);
  button.addEventListener('click',event=>{
    event.preventDefault();
    openUnifiedConversation(item.conversation_id,item.__channel).catch(()=>{});
  });
  return button;
}

function makeChip(text,className=''){
  const chip=document.createElement('span');
  chip.className=`chip ${className}`.trim();
  chip.textContent=text;
  return chip;
}

async function refreshUnifiedQueue(){
  if(!allMode||bridging)return;
  if(!Object.keys(accounts).length)await loadAccountsV3();
  const search=String($('#globalSearch')?.value||'').trim();
  const labelId=String($('#labelFilter')?.value||'').trim();
  const pairs=CHANNELS.map(channel=>[channel,accounts[channel]]).filter(([,account])=>account?.id);
  if(!pairs.length)return;

  const results=await Promise.all(pairs.map(async([channel,account])=>{
    try{
      const data=await apiV3('queue',{account_id:account.id,limit:QUEUE_LIMIT,search,label_id:labelId});
      return (data.items||[]).map(item=>({...item,__channel:channel}));
    }catch{return []}
  }));

  const items=results.flat().sort((a,b)=>new Date(b.canonical_last_message_at||b.last_message_at||0)-new Date(a.canonical_last_message_at||a.last_message_at||0));
  queueItemsById=new Map(items.map(item=>[item.conversation_id,item]));
  updateQuickCounts(items);
  const visible=items.filter(itemMatchesQuickFilter);
  const box=$('#queueList');
  if(!box)return;
  box.replaceChildren();
  box.dataset.unified='1';
  for(const item of visible)box.append(createUnifiedCard(item));
  if(!visible.length){
    const empty=document.createElement('div');
    empty.className='context-empty';
    empty.textContent='Nenhuma conversa neste filtro.';
    box.append(empty);
  }
  const count=$('#activeChannelCount');
  if(count)count.textContent=String(items.filter(item=>Number(item.unread_count||0)>0).length);
  const status=$('#activeChannelStatus');
  if(status)status.textContent='0975 e 1018 juntos';
  syncSwitcher();
}

function applyChannelDomFilter(){
  for(const card of $$('#queueList .queue-card:not(.queue-card-v3)')){
    const match=quickFilter==='unread'?Boolean(card.querySelector('.unread-badge')):
      quickFilter==='order'?Boolean(card.querySelector('.chip.order')):
      quickFilter==='pending'?Boolean(card.querySelector('.chip.pending')):true;
    card.hidden=!match;
  }
}

async function waitForBaseCard(id,timeout=3200){
  const started=Date.now();
  while(Date.now()-started<timeout){
    const card=$$('#queueList .queue-card:not(.queue-card-v3)').find(item=>item.dataset.conversationId===id);
    if(card)return card;
    await sleep(50);
  }
  return null;
}

async function openUnifiedConversation(id,channel){
  selectedConversationId=id;
  bridging=true;
  allMode=true;
  try{
    const channelButton=$(`[data-channel-switch="${channel}"]`);
    if(!channelButton)return;
    channelButton.click();
    const card=await waitForBaseCard(id);
    if(card)card.click();
    setTimeout(syncConversationAvatar,180);
    setTimeout(()=>renderOperationalContext(id).catch(()=>{}),200);
  }finally{
    bridging=false;
    scheduleUnifiedReload(650);
  }
}

function syncConversationAvatar(){
  const head=$('#conversationHead');
  if(!head)return;
  let avatar=$('#conversationAvatar');
  if(!avatar){
    avatar=document.createElement('span');
    avatar.id='conversationAvatar';
    avatar.className='conversation-avatar';
    head.prepend(avatar);
  }
  const name=head.querySelector('strong')?.textContent||'Conversa';
  avatar.textContent=name==='Selecione uma conversa'?'…':initials(name);
}

function showLegacyContext(tab='products'){
  const pane=$('#contextPane');
  pane?.classList.add('legacy-context','open');
  const button=$(`.context-tabs [data-context-tab="${tab}"]`);
  if(button&&!button.classList.contains('active'))button.click();
}

function showOperationalContext(){
  const pane=$('#contextPane');
  pane?.classList.remove('legacy-context');
  pane?.classList.add('open');
  if(selectedConversationId)renderOperationalContext(selectedConversationId).catch(()=>{});
}

function labelsForConversation(id){
  const cached=queueItemsById.get(id)?.labels||[];
  if(cached.length)return cached.map(item=>item.name).filter(Boolean);
  const card=$$('#queueList .queue-card').find(item=>item.dataset.conversationId===id);
  return card?[...card.querySelectorAll('.label-chip')].map(item=>item.textContent.trim()).filter(Boolean):[];
}

function orderPublicUrl(order){
  const preferred=String(order?.public_order_url||'').trim();
  if(preferred)return preferred;
  const id=String(order?.id||'').trim();
  return id?`https://donaantonia.com.br/pedido/?o=${encodeURIComponent(id)}`:'';
}

function copyText(text){
  const value=String(text||'');
  if(!value)return Promise.resolve(false);
  if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(value).then(()=>true).catch(()=>false);
  const area=document.createElement('textarea');
  area.value=value;
  area.style.position='fixed';
  area.style.opacity='0';
  document.body.append(area);
  area.select();
  const ok=document.execCommand('copy');
  area.remove();
  return Promise.resolve(ok);
}

async function renderOperationalContext(conversationId){
  if(!conversationId)return;
  const box=$('#operationalContextBody');
  if(!box)return;
  box.innerHTML='<div class="ops-empty">Carregando contexto…</div>';
  let data;
  try{data=await apiV3('context',{conversation_id:conversationId})}catch{
    box.innerHTML='<div class="ops-empty">Não foi possível carregar o contexto desta conversa.</div>';
    return;
  }
  if(selectedConversationId&&selectedConversationId!==conversationId)return;
  selectedConversationId=conversationId;

  const customer=data?.customer||null;
  const address=data?.address||null;
  const registration=data?.registration||null;
  const orders=[...(data?.orders||[])].sort((a,b)=>new Date(b.confirmed_at||b.created_at||0)-new Date(a.confirmed_at||a.created_at||0));
  currentOrder=orders[0]||null;
  const orderTool=$('#orderComposerTool');
  if(orderTool)orderTool.disabled=!currentOrder?.id;
  const name=customer?.name||queueItemsById.get(conversationId)?.display_name||'Cliente';
  const phone=customer?.phone_e164||queueItemsById.get(conversationId)?.phone_e164||'—';
  const complete=Boolean(registration?.registration_complete);
  const addressText=address?[address.street,address.number,address.neighborhood,address.city].filter(Boolean).join(', '):'Não informado';
  const labels=[...new Set(labelsForConversation(conversationId))];
  if(customer?.marketing_opt_in===true&&!labels.includes('MKT_OK'))labels.push('MKT_OK');

  const orderUrl=currentOrder?orderPublicUrl(currentOrder):'';
  const history=orders.slice(1,4);
  box.innerHTML=`
    <section class="ops-context-card">
      <div class="ops-card-head"><h3>Informações do cliente</h3><button type="button" data-ops-action="customer">Editar</button></div>
      <div class="ops-customer-identity">
        <div class="ops-avatar">${escapeHtml(initials(name))}</div>
        <div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(phone)}</small>${complete?'':'<span class="ops-status">Cadastro pendente</span>'}</div>
      </div>
      <div class="ops-row"><span>Endereço</span><strong>${escapeHtml(addressText)}</strong></div>
      <div class="ops-row"><span>Documento</span><strong>${escapeHtml(customer?.masked_document||'Não informado')}</strong></div>
      <div class="ops-row"><span>Comprado</span><strong>${escapeHtml(money(customer?.lifetime_value||0))}</strong></div>
    </section>
    <section class="ops-context-card">
      <div class="ops-card-head"><h3>Pedido atual</h3><button type="button" data-ops-action="orders">Ver todos</button></div>
      ${currentOrder?`
        <div class="ops-order-main">
          <div><strong>${escapeHtml(currentOrder.public_order_code||currentOrder.order_number||'Pedido')}<span class="ops-order-status">${escapeHtml(currentOrder.status||'Pedido')}</span></strong><small>${escapeHtml(fmtDate(currentOrder.confirmed_at||currentOrder.created_at))} · ${escapeHtml(currentOrder.payment_method||'Pagamento a confirmar')}</small></div>
          <strong class="ops-order-total">${escapeHtml(money(currentOrder.total))}</strong>
        </div>
        <div class="ops-actions">
          <button type="button" class="primary" data-ops-action="open-order">Abrir pedido</button>
          <a href="${escapeHtml(orderUrl)}" target="_blank" rel="noopener">Abrir vitrine ↗</a>
          <button type="button" data-ops-action="copy-order-link">Copiar link</button>
        </div>`:'<div class="ops-empty">Nenhum pedido encontrado para este cliente.</div>'}
    </section>
    <section class="ops-context-card">
      <div class="ops-card-head"><h3>Interesses e etiquetas</h3><button type="button" data-ops-action="labels">Editar</button></div>
      <div class="ops-chip-list">${labels.length?labels.map(label=>`<span class="ops-chip${label==='MKT_OK'?' marketing':''}">${escapeHtml(label.replace(/^INT_/,'').replaceAll('_',' '))}</span>`).join(''):'<span class="ops-empty">Sem etiquetas</span>'}</div>
    </section>
    <section class="ops-context-card">
      <div class="ops-card-head"><h3>Histórico</h3><button type="button" data-ops-action="orders">Ver todos</button></div>
      <div class="ops-history">${history.length?history.map(order=>`<div class="ops-history-item"><div><strong>${escapeHtml(order.public_order_code||order.order_number||'Pedido')}</strong><small>${escapeHtml(fmtDate(order.confirmed_at||order.created_at))} · ${escapeHtml(order.status||'—')} · ${escapeHtml(money(order.total))}</small></div><button type="button" data-history-order="${escapeHtml(order.id)}">Abrir</button></div>`).join(''):'<div class="ops-empty">Sem pedidos anteriores.</div>'}</div>
    </section>`;

  box.querySelector('[data-ops-action="customer"]')?.addEventListener('click',()=>{
    if(customer?.id)parent.postMessage({type:'da-attendance',action:'open_customer',customer_id:customer.id},location.origin);
  });
  box.querySelectorAll('[data-ops-action="orders"]').forEach(button=>button.addEventListener('click',()=>showLegacyContext('orders')));
  box.querySelector('[data-ops-action="labels"]')?.addEventListener('click',()=>$('#conversationLabelsBtn')?.click());
  box.querySelector('[data-ops-action="open-order"]')?.addEventListener('click',()=>{
    if(currentOrder?.id)parent.postMessage({type:'da-attendance',action:'open_order',order_id:currentOrder.id},location.origin);
  });
  box.querySelector('[data-ops-action="copy-order-link"]')?.addEventListener('click',async event=>{
    const ok=await copyText(orderUrl);
    event.currentTarget.textContent=ok?'Link copiado':'Copiar link';
    if(ok)setTimeout(()=>{if(event.currentTarget?.isConnected)event.currentTarget.textContent='Copiar link'},1500);
  });
  box.querySelectorAll('[data-history-order]').forEach(button=>button.addEventListener('click',()=>{
    const id=button.dataset.historyOrder;
    if(id)parent.postMessage({type:'da-attendance',action:'open_order',order_id:id},location.origin);
  }));
}

async function init(){
  setupStructure();
  await waitForToken();
  if(allMode)refreshUnifiedQueue().catch(()=>{});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(()=>{}),{once:true});
else init().catch(()=>{});
