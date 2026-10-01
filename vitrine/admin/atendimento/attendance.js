const ADMIN_ATTENDANCE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-ops-v1';
const ADMIN_TOKEN_KEY='da_finance_access_token_v1';
const ADMIN_AUTH_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-pin-auth-v1';
const ADMIN_VERIFY_API='https://ssbesxgaijknwsjbsbcz.supabase.co/auth/v1/verify';
const ADMIN_PUBLIC_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';
const QUEUE_PAGE_SIZE=50;
const MESSAGE_PAGE_SIZE=30;
const HUMAN_SEND_STATUS='Envio humano em homologação';

const state={accounts:{},filters:{'0975':'all','1018':'all'},search:'',selected:null,conversation:null,context:null,contextTab:'customer',loadingOlder:false};
const $=sel=>document.querySelector(sel);
const $$=sel=>[...document.querySelectorAll(sel)];
const fmtTime=value=>{if(!value)return '';const d=new Date(value);return Number.isNaN(+d)?'':new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(d)};
const fmtDate=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(+d)?'—':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(d)};
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

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
  for(const ch of ['0975','1018']){$(`#status${ch}`).textContent=state.accounts[ch]?'Conectado':'Canal não localizado'}
  $('#connectionStatus').textContent=Object.keys(state.accounts).length===2?'2 canais conectados':'Verifique os canais';
}

async function loadQueue(channel){
  const account=state.accounts[channel],box=$(`#queue${channel}`);box.replaceChildren();if(!account)return;
  try{const data=await api('queue',{account_id:account.id,limit:QUEUE_PAGE_SIZE,filter:state.filters[channel],search:state.search});const items=data.items||[];for(const item of items)box.append(queueCard(item,channel));$(`#count${channel}`).textContent=String(items.filter(i=>i.unread_count>0||i.human_required||i.status==='needs_human').length);if(!items.length){const empty=document.createElement('div');empty.className='context-empty';empty.textContent='Nenhuma conversa.';box.append(empty)}}catch(error){const empty=document.createElement('div');empty.className='context-empty';empty.textContent='Não foi possível carregar esta fila.';box.append(empty)}}

async function loadQueues(){await Promise.all([loadQueue('0975'),loadQueue('1018')])}

function renderConversationHead(){const c=state.conversation?.conversation;if(!c)return;const head=$('#conversationHead');head.querySelector('strong').textContent=state.selected?.display_name||state.context?.customer?.name||c.phone_e164||'Conversa';head.querySelector('small').textContent=`${channelByPhone(state.conversation?.account?.phone_e164)||''} · ${c.mode==='human'||c.mode==='human_copilot'?'Atendimento humano':'ANA atendendo'}`;$('#openContextBtn').disabled=false}
function renderServiceWindow(){const box=$('#serviceWindow'),w=state.conversation?.service_window;if(!w){box.className='service-window neutral';box.textContent='Janela não disponível';return}if(w.open){box.className='service-window open';const h=Math.floor(w.remaining_seconds/3600),m=Math.floor((w.remaining_seconds%3600)/60);box.textContent=`● Janela de atendimento aberta · ${h}h ${m}min restantes`}else{box.className='service-window closed';box.textContent='● Janela encerrada · use template aprovado quando homologado'}}
function renderMessage(msg){const row=document.createElement('div');row.className=`message-row ${msg.direction==='outbound'?'outbound':'inbound'}`;const bubble=document.createElement('div');bubble.className='bubble';if(msg.message_type==='text'&&msg.text_body){bubble.textContent=msg.text_body}else{const holder=document.createElement('span');holder.className='media-placeholder';holder.textContent={audio:'🎤 Áudio',image:'🖼 Imagem',document:'📄 Documento'}[msg.message_type]||`Mensagem ${msg.message_type||'não suportada'}`;bubble.append(holder)}const meta=document.createElement('span');meta.className='message-meta';meta.textContent=fmtTime(msg.message_at);bubble.append(meta);row.append(bubble);return row}
function renderMessages(){const box=$('#messages');box.replaceChildren();for(const msg of state.conversation?.messages||[])box.append(renderMessage(msg));box.hidden=false;$('#conversationEmpty').hidden=true;box.scrollTop=box.scrollHeight;renderConversationHead();renderServiceWindow()}

async function selectConversation(id,channel){
  state.selected=id;$('#conversationPane').classList.add('mobile-open');
  try{const [conversation,context]=await Promise.all([api('conversation',{conversation_id:id,limit:MESSAGE_PAGE_SIZE}),api('context',{conversation_id:id})]);state.conversation=conversation;state.context=context;state.selected={id,channel,display_name:context?.customer?.name||conversation?.conversation?.phone_e164};renderMessages();renderContext();await Promise.all([loadQueue('0975'),loadQueue('1018')]);const inbound=[...(conversation.messages||[])].reverse().find(m=>m.direction==='inbound');if(inbound)api('mark_read',{conversation_id:id,message_id:inbound.id},'POST').catch(()=>{})}catch(error){$('#conversationEmpty').hidden=false;$('#conversationEmpty').textContent='Não foi possível abrir esta conversa.'}}

async function loadOlder(){if(state.loadingOlder||!state.conversation?.next_before||!state.selected?.id)return;state.loadingOlder=true;const box=$('#messages'),beforeHeight=box.scrollHeight;try{const older=await api('conversation',{conversation_id:state.selected.id,before:state.conversation.next_before,limit:MESSAGE_PAGE_SIZE});state.conversation.messages=[...(older.messages||[]),...(state.conversation.messages||[])];state.conversation.next_before=older.next_before;const oldTop=box.scrollTop;box.replaceChildren();for(const msg of state.conversation.messages)box.append(renderMessage(msg));box.scrollTop=box.scrollHeight-beforeHeight+oldTop}catch{}finally{state.loadingOlder=false}}

function contextButton(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b}
function emitParent(action,payload={}){parent.postMessage({type:'da-attendance',action,...payload},location.origin)}
function renderCustomer(box){const c=state.context?.customer,a=state.context?.address,r=state.context?.registration;if(!c){box.innerHTML='';const e=document.createElement('div');e.className='context-empty';e.textContent='Conversa ainda sem cliente vinculado. O atendimento continua disponível pelo telefone.';box.append(e);return}const card=document.createElement('section');card.className='context-card';const h=document.createElement('h3');h.textContent=c.name||'Cliente';card.append(h);for(const [label,value] of [['Telefone',c.phone_e164||'—'],['Cidade',a?.city||'—'],['Endereço',a?[a.street,a.number,a.neighborhood].filter(Boolean).join(', '):'—'],['Cadastro',r?.registration_complete?'Completo':'Incompleto'],['Documento',c.masked_document||'—'],['Pedidos',String(c.order_count||0)],['Comprado',money(c.lifetime_value)],['Marketing',c.marketing_opt_in?'Autorizado':'Não autorizado']]){const row=document.createElement('div');row.className='context-row';const l=document.createElement('span');l.textContent=label;const v=document.createElement('strong');v.textContent=value;row.append(l,v);card.append(row)}const actions=document.createElement('div');actions.className='context-actions';actions.append(contextButton('Abrir cliente',()=>emitParent('open_customer',{customer_id:c.id})),contextButton('Criar orçamento',()=>emitParent('open_quote',{customer_id:c.id})),contextButton('Nova venda',()=>emitParent('new_sale',{customer_id:c.id})));card.append(actions);box.replaceChildren(card)}
function renderOrders(box){box.replaceChildren();const list=document.createElement('div');list.className='orders-list';const orders=state.context?.orders||[];if(!orders.length){const e=document.createElement('div');e.className='context-empty';e.textContent='Nenhum pedido encontrado para este cliente.';box.append(e);return}for(const o of orders){const card=document.createElement('article');card.className='order-card';const head=document.createElement('div');head.className='order-head';const strong=document.createElement('strong');strong.textContent=o.order_number||'Pedido';const small=document.createElement('small');small.textContent=fmtDate(o.confirmed_at||o.created_at);head.append(strong,small);const info=document.createElement('div');info.className='context-row';const st=document.createElement('span');st.textContent=o.status||'—';const total=document.createElement('strong');total.textContent=money(o.total);info.append(st,total);card.append(head,info,contextButton('Abrir pedido',()=>emitParent('open_order',{order_id:o.id})));list.append(card)}box.append(list)}
let productTimer=null;async function runProductSearch(input,box){const q=input.value.trim();if(q.length<2){box.replaceChildren();return}box.textContent='Buscando…';try{const data=await api('products',{q,limit:12});box.replaceChildren();for(const p of data.items||[]){const card=document.createElement('article');card.className='product-card';const line=document.createElement('div');line.className='product-line';if(p.image_url){const img=document.createElement('img');img.className='product-thumb';img.loading='lazy';img.alt='';img.src=p.image_url;line.append(img)}const meta=document.createElement('div');const name=document.createElement('strong');name.textContent=p.name;const price=document.createElement('div');price.textContent=p.offer?.active?`${money(p.offer.price)} oferta · estoque ${p.sellable_stock}`:`${money(p.sale_price)} · estoque ${p.sellable_stock}`;price.style.fontSize='10px';price.style.color='#667085';meta.append(name,price);line.append(meta);card.append(line);const b=contextButton('Enviar produto',()=>{});b.disabled=true;b.title='Disponível após homologação do envio';card.append(b);box.append(card)}if(!(data.items||[]).length){const e=document.createElement('div');e.className='context-empty';e.textContent='Nenhum produto encontrado.';box.append(e)}}catch{box.textContent='Não foi possível buscar produtos.'}}
function renderProducts(box){box.replaceChildren();const input=document.createElement('input');input.className='product-search';input.type='search';input.placeholder='Buscar por nome ou EAN';const list=document.createElement('div');list.className='products-list';input.addEventListener('input',()=>{clearTimeout(productTimer);productTimer=setTimeout(()=>runProductSearch(input,list),250)});box.append(input,list)}
function renderAssistant(box){box.replaceChildren();const info=document.createElement('div');info.className='context-card';const h=document.createElement('h3');h.textContent='Copiloto do atendente';const g=document.createElement('div');g.className='assistant-grid';for(const label of ['Resumir conversa','Sugerir resposta','O que falta resolver?']){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=true;b.title='Disponível após homologação do núcleo de atendimento';g.append(b)}info.append(h,g);box.append(info)}
function renderContext(){const box=$('#contextBody');if(state.contextTab==='customer')renderCustomer(box);else if(state.contextTab==='orders')renderOrders(box);else if(state.contextTab==='products')renderProducts(box);else renderAssistant(box)}

function bind(){
  $('#messages').addEventListener('scroll',e=>{if(e.currentTarget.scrollTop<36)loadOlder()});
  let searchTimer=null;$('#globalSearch').addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.search=e.target.value.trim();loadQueues()},250)});
  $$('.queue-filters button').forEach(b=>b.addEventListener('click',()=>{const group=b.closest('.queue-filters'),ch=group.dataset.filterChannel;group.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filters[ch]=b.dataset.filter;loadQueue(ch)}));
  $$('.context-tabs [data-context-tab]').forEach(b=>b.addEventListener('click',()=>{$$('.context-tabs [data-context-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.contextTab=b.dataset.contextTab;renderContext()}));
  $('#openContextBtn').addEventListener('click',()=>$('#contextPane').classList.add('open'));$('#closeContextBtn').addEventListener('click',()=>$('#contextPane').classList.remove('open'));
  $$('[data-mobile-channel]').forEach(b=>b.addEventListener('click',()=>{$$('[data-mobile-channel]').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.queue-column').forEach(x=>x.classList.toggle('active-mobile',x.dataset.channel===b.dataset.mobileChannel));$('#conversationPane').classList.remove('mobile-open')}));
}

async function boot(){bind();try{await loadAccounts();await loadQueues()}catch(error){$('#connectionStatus').textContent='Não foi possível iniciar o atendimento'}}
boot();
