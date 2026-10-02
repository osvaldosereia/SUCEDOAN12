const ADMIN_ATTENDANCE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-ops-v1';
const ADMIN_TOKEN_KEY='da_finance_access_token_v1';
const ADMIN_AUTH_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-pin-auth-v1';
const ADMIN_VERIFY_API='https://ssbesxgaijknwsjbsbcz.supabase.co/auth/v1/verify';
const ADMIN_PUBLIC_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';
const QUEUE_PAGE_SIZE=50;
const MESSAGE_PAGE_SIZE=30;
const QUEUE_REFRESH_MS=15000;
const SEND_LOCK_STATUS='Envio pelo Admin indisponível';
const PAPOAI_APP_URL='https://app.papoai.net/';
const QUICK_REPLIES=[
  ['Pagamento','O pagamento é feito na entrega. Aceitamos PIX, dinheiro, cartão de crédito e cartão alimentação/refeição. 😊'],
  ['Entrega','Entregamos em Cuiabá e Várzea Grande. Pedidos feitos após 12h em Cuiabá ficam para o dia seguinte.'],
  ['Cidades atendidas','Atendemos Cuiabá e Várzea Grande.'],
  ['Pedido pelo catálogo','Você pode fazer seu pedido direto pelo nosso catálogo: www.donaantonia.com.br'],
  ['Prazo e horário','Pedidos feitos após 12h em Cuiabá são entregues no dia seguinte. Aos domingos e feriados nacionais não realizamos entregas.'],
  ['Pedido recebido','Recebemos seu pedido 😊 Vou acompanhar por aqui.']
];

const state={accounts:{},filters:{'0975':'all','1018':'all'},search:'',selected:null,conversation:null,context:null,contextTab:'customer',conversationOpen:false,loadingOlder:false,refreshing:false};
const $=sel=>document.querySelector(sel);
const $$=sel=>[...document.querySelectorAll(sel)];
const fmtTime=value=>{if(!value)return '';const d=new Date(value);return Number.isNaN(+d)?'':new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(d)};
const fmtDate=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(+d)?'—':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(d)};
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const latestMessageId=conversation=>conversation?.messages?.length?conversation.messages[conversation.messages.length-1]?.id:null;

function adminToken(){return String(sessionStorage.getItem(ADMIN_TOKEN_KEY)||'').trim()}
let tokenPromise=null;
async function ensureAdminToken(){
  const existing=adminToken();if(existing)return existing;
  if(tokenPromise)return await tokenPromise;
  tokenPromise=(async()=>{
    try{
      const ar=await fetch(ADMIN_AUTH_API,{method:'POST',headers:{'Content-Type':'application/json','apikey':ADMIN_PUBLIC_KEY},body:JSON.stringify({pin:'000000'}),cache:'no-store'});
      const a=await ar.json().catch(()=>({}));if(!ar.ok||!a?.ok)throw new Error(a?.error||'admin_auto_auth_failed');
      const vr=await fetch(ADMIN_VERIFY_API,{method:'POST',headers:{'Content-Type':'application/json','apikey':ADMIN_PUBLIC_KEY},body:JSON.stringify({token_hash:a.token_hash,type:a.verification_type||'email'}),cache:'no-store'});
      const v=await vr.json().catch(()=>({}));const token=String(v?.access_token||'').trim();if(!vr.ok||!token)throw new Error(v?.error||'admin_auto_session_failed');
      sessionStorage.setItem(ADMIN_TOKEN_KEY,token);return token;
    }finally{tokenPromise=null}
  })();
  return await tokenPromise;
}

async function api(action,params={},method='GET'){
  const token=await ensureAdminToken();
  const url=new URL(ADMIN_ATTENDANCE_API);url.searchParams.set('action',action);
  if(method==='GET')for(const [k,v] of Object.entries(params))if(v!==null&&v!==undefined&&v!=='')url.searchParams.set(k,String(v));
  const options={method,headers:{Authorization:`Bearer ${token}`,apikey:ADMIN_PUBLIC_KEY}};
  if(method!=='GET'){options.headers['Content-Type']='application/json';options.body=JSON.stringify(params)}
  let res=await fetch(url,options);let data=await res.json().catch(()=>({}));
  if(res.status===401){sessionStorage.removeItem(ADMIN_TOKEN_KEY);const retry=await ensureAdminToken();options.headers.Authorization=`Bearer ${retry}`;res=await fetch(url,options);data=await res.json().catch(()=>({}))}
  if(!res.ok||data?.ok===false)throw new Error(data?.error||`attendance_${res.status}`);
  return data;
}

function channelByPhone(phone){const p=String(phone||'').replace(/\D/g,'');if(p.endsWith('0975'))return '0975';if(p.endsWith('1018'))return '1018';return null}
function escapePreview(item){return item.last_message_text||({audio:'Áudio',image:'Imagem',document:'Documento'}[item.last_message_type]||'Sem mensagem')}
function showNote(text,tone='neutral'){const note=$('#composerNote');if(!note)return;note.textContent=text;note.dataset.tone=tone}
function syncFallbackButtons(){const hasConversation=Boolean(state.selected?.id);const hasDraft=Boolean($('#messageDraft')?.value.trim());$('#openPapoAiBtn').disabled=!hasConversation;$('#copyReplyBtn').disabled=!hasConversation||!hasDraft}
function setDraft(text,{append=false}={}){const draft=$('#messageDraft');if(!draft)return;draft.value=append&&draft.value.trim()?`${draft.value.trim()}\n${text}`:text;syncFallbackButtons();draft.focus();draft.setSelectionRange(draft.value.length,draft.value.length)}
function syncConversationVisibility(){const pane=$('#conversationPane');if(!pane)return;const selectedId=typeof state.selected==='string'?state.selected:state.selected?.id;pane.classList.toggle('mobile-open',Boolean(state.conversationOpen&&selectedId))}

function queueCard(item,channel){
  const btn=document.createElement('button');btn.type='button';btn.className='queue-card';btn.dataset.conversationId=item.conversation_id;
  if((typeof state.selected==='string'?state.selected:state.selected?.id)===item.conversation_id)btn.classList.add('selected');
  const title=document.createElement('div');title.className='queue-title';const name=document.createElement('span');name.textContent=item.display_name||item.phone_e164||'Contato';const time=document.createElement('span');time.className='queue-time';time.textContent=fmtTime(item.last_activity_at);title.append(name,time);
  const preview=document.createElement('div');preview.className='queue-preview';const text=document.createElement('span');text.textContent=escapePreview(item);preview.append(text);if(item.unread_count>0){const badge=document.createElement('span');badge.className='unread-badge';badge.textContent=String(Math.min(99,item.unread_count));preview.append(badge)}
  const chips=document.createElement('div');chips.className='chips';if(item.human_required||item.mode==='human'||item.mode==='human_copilot'){const c=document.createElement('span');c.className='chip human';c.textContent='Humano';chips.append(c)}if(item.has_order){const c=document.createElement('span');c.className='chip order';c.textContent='Pedido';chips.append(c)}if(item.registration_incomplete){const c=document.createElement('span');c.className='chip pending';c.textContent='Cadastro pendente';chips.append(c)}
  btn.append(title,preview,chips);btn.addEventListener('click',()=>selectConversation(item.conversation_id,channel));return btn;
}

async function loadAccounts(){
  const data=await api('accounts');state.accounts={};
  for(const account of data.items||[]){const ch=channelByPhone(account.phone_e164);if(ch)state.accounts[ch]=account}
  for(const ch of ['0975','1018'])$(`#status${ch}`).textContent=state.accounts[ch]?'Conectado':'Canal não localizado';
  $('#connectionStatus').textContent=Object.keys(state.accounts).length===2?'2 canais conectados · envio manual pelo PapoAI':'Verifique os canais';
}
async function loadQueue(channel){
  const account=state.accounts[channel],box=$(`#queue${channel}`);if(!box)return;box.replaceChildren();if(!account)return;
  try{const data=await api('queue',{account_id:account.id,limit:QUEUE_PAGE_SIZE,filter:state.filters[channel],search:state.search});const items=data.items||[];for(const item of items)box.append(queueCard(item,channel));$(`#count${channel}`).textContent=String(items.filter(i=>i.unread_count>0||i.human_required||i.status==='needs_human').length);if(!items.length){const empty=document.createElement('div');empty.className='context-empty';empty.textContent='Nenhuma conversa.';box.append(empty)}}catch{const empty=document.createElement('div');empty.className='context-empty';empty.textContent='Não foi possível carregar esta fila.';box.append(empty)}
}
async function loadQueues(){await Promise.all([loadQueue('0975'),loadQueue('1018')]);syncConversationVisibility()}

function renderConversationHead(){const c=state.conversation?.conversation;if(!c)return;const head=$('#conversationHead');head.querySelector('strong').textContent=state.selected?.display_name||state.context?.customer?.name||c.phone_e164||'Conversa';head.querySelector('small').textContent=`${channelByPhone(state.conversation?.account?.phone_e164)||''} · ${c.mode==='human'||c.mode==='human_copilot'?'Atendimento humano':'ANA atendendo'}`;$('#openContextBtn').disabled=false}
function renderServiceWindow(){const box=$('#serviceWindow'),w=state.conversation?.service_window;if(!w){box.className='service-window neutral';box.textContent='Janela não disponível';return}if(w.open){const h=Math.floor(w.remaining_seconds/3600),m=Math.floor((w.remaining_seconds%3600)/60);box.className='service-window open';box.textContent=`● Janela de atendimento aberta · ${h}h ${m}min restantes`}else{box.className='service-window closed';box.textContent='● Janela encerrada · responda no PapoAI somente com template aprovado quando aplicável'}}
function renderMessage(msg){const row=document.createElement('div');row.className=`message-row ${msg.direction==='outbound'?'outbound':'inbound'}`;const bubble=document.createElement('div');bubble.className='bubble';if(msg.message_type==='text'&&msg.text_body)bubble.textContent=msg.text_body;else{const holder=document.createElement('span');holder.className='media-placeholder';holder.textContent={audio:'🎤 Áudio',image:'🖼 Imagem',document:'📄 Documento'}[msg.message_type]||`Mensagem ${msg.message_type||'não suportada'}`;bubble.append(holder)}const meta=document.createElement('span');meta.className='message-meta';meta.textContent=fmtTime(msg.message_at);bubble.append(meta);row.append(bubble);return row}
function renderMessages({scrollToBottom=true,preserveOffset=0}={}){const box=$('#messages');box.replaceChildren();for(const msg of state.conversation?.messages||[])box.append(renderMessage(msg));box.hidden=false;$('#conversationEmpty').hidden=true;if(scrollToBottom)box.scrollTop=box.scrollHeight;else box.scrollTop=Math.max(0,preserveOffset);renderConversationHead();renderServiceWindow()}
function enableConversationTools(){for(const id of ['catalogBtn','quickRepliesBtn','followUpBtn'])$(`#${id}`).disabled=false;const hasCustomer=Boolean(state.context?.customer?.id);for(const id of ['quoteBtn','saleBtn','optOutBtn'])$(`#${id}`).disabled=!hasCustomer;syncFallbackButtons()}

async function selectConversation(id,channel){
  state.selected=id;state.conversationOpen=true;syncConversationVisibility();closeComposerPanels();
  try{const [conversation,context]=await Promise.all([api('conversation',{conversation_id:id,limit:MESSAGE_PAGE_SIZE}),api('context',{conversation_id:id})]);state.conversation=conversation;state.context=context;state.selected={id,channel,display_name:context?.customer?.name||conversation?.conversation?.phone_e164};renderMessages();renderContext();enableConversationTools();showNote(`${SEND_LOCK_STATUS} · prepare e copie a resposta`);await loadQueues();const inbound=[...(conversation.messages||[])].reverse().find(m=>m.direction==='inbound');if(inbound)api('mark_read',{conversation_id:id,message_id:inbound.id},'POST').catch(()=>{})}catch{$('#conversationEmpty').hidden=false;$('#conversationEmpty').textContent='Não foi possível abrir esta conversa.'}
}
async function loadOlder(){if(state.loadingOlder||!state.conversation?.next_before||!state.selected?.id)return;state.loadingOlder=true;const box=$('#messages'),beforeHeight=box.scrollHeight;try{const older=await api('conversation',{conversation_id:state.selected.id,before:state.conversation.next_before,limit:MESSAGE_PAGE_SIZE});state.conversation.messages=[...(older.messages||[]),...(state.conversation.messages||[])];state.conversation.next_before=older.next_before;const oldTop=box.scrollTop;box.replaceChildren();for(const msg of state.conversation.messages)box.append(renderMessage(msg));box.scrollTop=box.scrollHeight-beforeHeight+oldTop}catch{}finally{state.loadingOlder=false}}

async function refreshSelectedConversation(){
  if(document.hidden||state.refreshing||!state.selected?.id)return;state.refreshing=true;
  try{const previousId=latestMessageId(state.conversation);const box=$('#messages');const nearBottom=box&&!box.hidden?(box.scrollHeight-box.scrollTop-box.clientHeight)<100:true;const current=await api('conversation',{conversation_id:state.selected.id,limit:MESSAGE_PAGE_SIZE});const currentId=latestMessageId(current);state.conversation=current;if(currentId!==previousId){renderMessages({scrollToBottom:nearBottom,preserveOffset:box?.scrollTop||0});const inbound=[...(current.messages||[])].reverse().find(m=>m.direction==='inbound');if(inbound)api('mark_read',{conversation_id:state.selected.id,message_id:inbound.id},'POST').catch(()=>{})}else renderServiceWindow()}catch{}finally{state.refreshing=false}
}
async function backgroundRefresh(){if(document.hidden)return;await loadQueues();await refreshSelectedConversation()}
let refreshTimer=null;
function startRefresh(){if(refreshTimer)clearInterval(refreshTimer);refreshTimer=setInterval(()=>{backgroundRefresh().catch(()=>{})},QUEUE_REFRESH_MS)}

function contextButton(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b}
function emitParent(action,payload={}){parent.postMessage({type:'da-attendance',action,...payload},location.origin)}
function renderCustomer(box){const c=state.context?.customer,a=state.context?.address,r=state.context?.registration;if(!c){box.replaceChildren();const e=document.createElement('div');e.className='context-empty';e.textContent='Conversa ainda sem cliente vinculado. O atendimento continua disponível pelo telefone.';box.append(e);return}const card=document.createElement('section');card.className='context-card';const h=document.createElement('h3');h.textContent=c.name||'Cliente';card.append(h);for(const [label,value] of [['Telefone',c.phone_e164||'—'],['Cidade',a?.city||'—'],['Endereço',a?[a.street,a.number,a.neighborhood].filter(Boolean).join(', '):'—'],['Cadastro',r?.registration_complete?'Completo':'Incompleto'],['Documento',c.masked_document||'—'],['Pedidos',String(c.order_count||0)],['Comprado',money(c.lifetime_value)],['Marketing',c.marketing_opt_in?'Autorizado':'Não autorizado']]){const row=document.createElement('div');row.className='context-row';const l=document.createElement('span');l.textContent=label;const v=document.createElement('strong');v.textContent=value;row.append(l,v);card.append(row)}const actions=document.createElement('div');actions.className='context-actions';actions.append(contextButton('Abrir cliente',()=>emitParent('open_customer',{customer_id:c.id})),contextButton('Criar orçamento',()=>emitParent('open_quote',{customer_id:c.id})),contextButton('Nova venda',()=>emitParent('new_sale',{customer_id:c.id})));card.append(actions);box.replaceChildren(card)}
function renderOrders(box){box.replaceChildren();const list=document.createElement('div');list.className='orders-list';const orders=state.context?.orders||[];if(!orders.length){const e=document.createElement('div');e.className='context-empty';e.textContent='Nenhum pedido encontrado para este cliente.';box.append(e);return}for(const o of orders){const card=document.createElement('article');card.className='order-card';const head=document.createElement('div');head.className='order-head';const strong=document.createElement('strong');strong.textContent=o.order_number||'Pedido';const small=document.createElement('small');small.textContent=fmtDate(o.confirmed_at||o.created_at);head.append(strong,small);const info=document.createElement('div');info.className='context-row';const st=document.createElement('span');st.textContent=o.status||'—';const total=document.createElement('strong');total.textContent=money(o.total);info.append(st,total);card.append(head,info,contextButton('Abrir pedido',()=>emitParent('open_order',{order_id:o.id})));list.append(card)}box.append(list)}
let productTimer=null;
async function runProductSearch(input,box){const q=input.value.trim();if(q.length<2){box.replaceChildren();return}box.textContent='Buscando…';try{const data=await api('products',{q,limit:12});box.replaceChildren();for(const p of data.items||[]){const card=document.createElement('article');card.className='product-card';const line=document.createElement('div');line.className='product-line';if(p.image_url){const img=document.createElement('img');img.className='product-thumb';img.loading='lazy';img.alt='';img.src=p.image_url;line.append(img)}const meta=document.createElement('div');const name=document.createElement('strong');name.textContent=p.name;const price=document.createElement('div');price.textContent=p.offer?.active?`${money(p.offer.price)} oferta · estoque ${p.sellable_stock}`:`${money(p.sale_price)} · estoque ${p.sellable_stock}`;price.className='product-price';meta.append(name,price);line.append(meta);card.append(line);const b=contextButton('Preparar produto',()=>setDraft(`${p.name} — ${p.offer?.active?money(p.offer.price):money(p.sale_price)}`));card.append(b);box.append(card)}if(!(data.items||[]).length){const e=document.createElement('div');e.className='context-empty';e.textContent='Nenhum produto encontrado.';box.append(e)}}catch{box.textContent='Não foi possível buscar produtos.'}}
function renderProducts(box){box.replaceChildren();const input=document.createElement('input');input.className='product-search';input.type='search';input.placeholder='Buscar por nome ou EAN';const list=document.createElement('div');list.className='products-list';input.addEventListener('input',()=>{clearTimeout(productTimer);productTimer=setTimeout(()=>runProductSearch(input,list),250)});box.append(input,list)}
function renderAssistant(box){box.replaceChildren();const info=document.createElement('div');info.className='context-card';const h=document.createElement('h3');h.textContent='Copiloto do atendente';const g=document.createElement('div');g.className='assistant-grid';for(const label of ['Resumir conversa','Sugerir resposta','O que falta resolver?']){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=true;b.title='Disponível após homologação do núcleo de atendimento';g.append(b)}info.append(h,g);box.append(info)}
function renderContext(){const box=$('#contextBody');if(state.contextTab==='customer')renderCustomer(box);else if(state.contextTab==='orders')renderOrders(box);else if(state.contextTab==='products')renderProducts(box);else renderAssistant(box)}

function closeComposerPanels(){$('#quickRepliesMenu').hidden=true;$('#followUpPanel').hidden=true}
function renderQuickReplies(){const box=$('#quickRepliesMenu');box.replaceChildren();for(const [label,text] of QUICK_REPLIES){const b=document.createElement('button');b.type='button';b.className='quick-reply';b.textContent=label;b.addEventListener('click',()=>{setDraft(text);box.hidden=true;showNote('Resposta rápida preparada · copie para enviar no PapoAI')});box.append(b)}}
async function prepareCatalog(){if(!state.selected?.id)return;$('#catalogBtn').disabled=true;showNote('Gerando link do catálogo…');try{const data=await api('issue_catalog',{conversation_id:state.selected.id},'POST');const url=data.catalog_url||(data.catalog_path?`https://www.donaantonia.com.br${data.catalog_path}`:null);if(!url)throw new Error('catalog_url_missing');setDraft(`Segue o seu catálogo da Dona Antônia 😊\n${url}`);showNote('Catálogo preparado · copie para enviar no PapoAI','success')}catch{showNote('Não consegui gerar o catálogo agora','error')}finally{$('#catalogBtn').disabled=false}}
function openFollowUpPanel(){const panel=$('#followUpPanel'),input=$('#followUpAt');$('#quickRepliesMenu').hidden=true;panel.hidden=false;if(!input.value){const d=new Date(Date.now()+60*60*1000);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());input.value=d.toISOString().slice(0,16)}input.focus()}
async function saveFollowUp(){if(!state.selected?.id)return;const raw=$('#followUpAt').value;if(!raw){showNote('Escolha a data e hora do retorno','error');return}const iso=new Date(raw).toISOString();if(Date.parse(iso)<=Date.now()){showNote('O retorno precisa ficar no futuro','error');return}try{await api('follow_up',{conversation_id:state.selected.id,follow_up_at:iso},'POST');$('#followUpPanel').hidden=true;showNote(`Retorno marcado para ${fmtDate(iso)} às ${fmtTime(iso)}`,'success');await loadQueues()}catch{showNote('Não consegui marcar o retorno','error')}}
async function clearFollowUp(){if(!state.selected?.id)return;try{await api('follow_up',{conversation_id:state.selected.id,follow_up_at:null},'POST');$('#followUpPanel').hidden=true;$('#followUpAt').value='';showNote('Lembrete de retorno removido');await loadQueues()}catch{showNote('Não consegui limpar o retorno','error')}}
async function disableMarketingOffers(){
  if(!state.selected?.id||!state.context?.customer?.id){showNote('Esta conversa ainda não tem cliente vinculado','error');return}
  if(state.context.customer.marketing_opt_in!==true){showNote('Este cliente já está sem ofertas de marketing');return}
  if(!window.confirm('Parar de enviar ofertas para este cliente?'))return;
  const button=$('#optOutBtn');button.disabled=true;showNote('Atualizando preferência de marketing…');
  try{await api('marketing_opt_out',{conversation_id:state.selected.id},'POST');state.context.customer.marketing_opt_in=false;renderContext();showNote('Ofertas desativadas para este cliente','success')}
  catch{showNote('Não consegui atualizar a preferência agora','error')}
  finally{button.disabled=!state.context?.customer?.id}
}
async function copyDraftToClipboard(){
  const draft=$('#messageDraft');const text=String(draft?.value||'').trim();if(!text){showNote('Prepare uma resposta antes de copiar','error');return}
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
    else{draft.focus();draft.select();if(!document.execCommand('copy'))throw new Error('copy_failed');draft.setSelectionRange(draft.value.length,draft.value.length)}
    const channel=state.selected?.channel||'';showNote(`Resposta copiada · envie no PapoAI pelo canal ${channel}`,'success');
  }catch{showNote('Não consegui copiar automaticamente. Selecione o texto e copie manualmente.','error')}
}
function openPapoAi(){
  if(!state.selected?.id)return;const channel=state.selected.channel||'';const phone=state.conversation?.conversation?.phone_e164||'';
  window.open(PAPOAI_APP_URL,'_blank','noopener,noreferrer');
  showNote(`PapoAI aberto · procure ${phone||'o contato'} no canal ${channel}`);
}

function bind(){
  $('#messages').addEventListener('scroll',e=>{if(e.currentTarget.scrollTop<36)loadOlder()});
  let searchTimer=null;$('#globalSearch').addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.search=e.target.value.trim();loadQueues()},250)});
  $$('.queue-filters button').forEach(b=>b.addEventListener('click',()=>{const group=b.closest('.queue-filters'),ch=group.dataset.filterChannel;group.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filters[ch]=b.dataset.filter;loadQueue(ch)}));
  $$('.context-tabs [data-context-tab]').forEach(b=>b.addEventListener('click',()=>{$$('.context-tabs [data-context-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.contextTab=b.dataset.contextTab;renderContext()}));
  $('#openContextBtn').addEventListener('click',()=>$('#contextPane').classList.add('open'));$('#closeContextBtn').addEventListener('click',()=>$('#contextPane').classList.remove('open'));
  $$('[data-mobile-channel]').forEach(b=>b.addEventListener('click',()=>{$$('[data-mobile-channel]').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.queue-column').forEach(x=>x.classList.toggle('active-mobile',x.dataset.channel===b.dataset.mobileChannel));state.conversationOpen=false;syncConversationVisibility()}));
  $('#quickRepliesBtn').addEventListener('click',()=>{const box=$('#quickRepliesMenu');$('#followUpPanel').hidden=true;box.hidden=!box.hidden});
  $('#catalogBtn').addEventListener('click',prepareCatalog);
  $('#quoteBtn').addEventListener('click',()=>{const id=state.context?.customer?.id;if(id)emitParent('open_quote',{customer_id:id})});
  $('#saleBtn').addEventListener('click',()=>{const id=state.context?.customer?.id;if(id)emitParent('new_sale',{customer_id:id})});
  $('#followUpBtn').addEventListener('click',openFollowUpPanel);$('#saveFollowUpBtn').addEventListener('click',saveFollowUp);$('#clearFollowUpBtn').addEventListener('click',clearFollowUp);$('#cancelFollowUpBtn').addEventListener('click',()=>$('#followUpPanel').hidden=true);
  $('#optOutBtn').addEventListener('click',disableMarketingOffers);
  $('#copyReplyBtn').addEventListener('click',copyDraftToClipboard);
  $('#openPapoAiBtn').addEventListener('click',openPapoAi);
  $('#messageDraft').addEventListener('input',syncFallbackButtons);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)backgroundRefresh().catch(()=>{})});
}

async function boot(){bind();renderQuickReplies();syncFallbackButtons();try{await loadAccounts();await loadQueues();startRefresh()}catch{$('#connectionStatus').textContent='Não foi possível iniciar o atendimento'}}
boot();