import {CONFIG} from './config.js';

const AUTH_KEY='da_admin_v3_auth';
const EDGE='admin-service-strategy-v1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clean=v=>String(v??'').replace(/\r/g,'').trim();
const arr=v=>Array.isArray(v)?v:[];
const dt=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};

function loadAuth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
function saveAuth(session){localStorage.setItem(AUTH_KEY,JSON.stringify(session))}
async function refreshAuth(auth){
  if(!auth?.refresh_token)throw new Error('Sessão expirada.');
  const response=await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth.refresh_token}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.access_token)throw new Error('Sessão expirada.');
  saveAuth(data);return data;
}
async function strategyApi(action,payload={},retry=true){
  let auth=loadAuth();if(!auth?.access_token)throw new Error('Área protegida.');
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${EDGE}`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'});
  if(response.status===401&&retry){auth=await refreshAuth(auth);return strategyApi(action,payload,false)}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw new Error(data.detail||data.error||`Erro ${response.status}`);
  return data;
}
function toast(message,kind=''){
  const host=$('toastRegion');if(!host)return;const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?6000:3000);
}

async function renderPlaybook(){
  const host=$('strategyPlaybook');if(!host||!loadAuth()?.access_token)return;
  try{
    const data=await strategyApi('playbook'),p=data.playbook;
    if(!p){host.innerHTML='<div class="strategy-empty">Método de análise ainda não cadastrado.</div>';return}
    const steps=arr(p.analysis_method?.steps);
    host.classList.remove('strategy-empty');
    host.innerHTML=`<p>${esc(p.strategy_text||'')}</p>${steps.length?`<ol class="strategy-playbook-steps">${steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`:''}<div class="strategy-help">Prioridades: ${esc(arr(p.analysis_method?.prioritization).join(' · '))} · Atualizado em ${dt(p.updated_at)}</div>`;
    if($('playbookVersion'))$('playbookVersion').textContent=`v${Number(p.version||1)}`;
  }catch(error){host.classList.add('strategy-empty');host.textContent=`Não foi possível carregar o método: ${error.message}`}
}

async function renderConversationDetail(id){
  const host=$('conversationDetail');if(!host)return;
  host.innerHTML='<div class="strategy-empty">Carregando conversa…</div>';
  const data=await strategyApi('conversation_detail',{id});
  const c=data.conversation||{},customer=data.customer||{},handoffs=arr(data.handoffs),events=arr(data.events),messages=arr(data.messages);
  const chips=[...handoffs.map(h=>`Humano: ${h.reason||'sem motivo'}`),...events.slice(-8).map(e=>e.action_type)].filter(Boolean);
  host.innerHTML=`<div class="strategy-conversation-header"><div class="eyebrow">Conversa</div><h3>${esc(customer.name||'Cliente sem nome')}</h3><div class="meta"><span>${esc(c.wa_contact_e164||customer.primary_whatsapp_e164||'Sem telefone')}</span><span>${esc(c.mode||'—')}</span><span>${esc(c.status||'—')}</span><span>última entrada ${dt(c.last_inbound_at)}</span></div>${c.context_summary?`<p>${esc(c.context_summary)}</p>`:''}</div>${chips.length?`<div class="strategy-event-strip">${chips.map(x=>`<span class="strategy-chip">${esc(x)}</span>`).join('')}</div>`:''}<div class="strategy-message-list">${messages.length?messages.map(m=>`<div class="strategy-message ${m.direction==='outbound'?'outbound':'inbound'}">${esc(clean(m.body_text||m.transcript)||`[${m.message_type||'mensagem'}]`)}<small>${m.direction==='outbound'?'Dona Antônia':'Cliente'} · ${dt(m.created_at)}${m.delivery_status?` · ${esc(m.delivery_status)}`:''}</small></div>`).join(''):'<div class="strategy-empty">Sem mensagens registradas nos últimos 7 dias.</div>'}</div>`;
  document.querySelectorAll('[data-conversation-id]').forEach(node=>node.classList.toggle('active',node.dataset.conversationId===id));
}

const list=$('conversationList');
if(list){
  list.addEventListener('click',event=>{
    const item=event.target.closest('[data-conversation-id]');if(!item)return;
    event.preventDefault();event.stopImmediatePropagation();
    renderConversationDetail(item.dataset.conversationId).catch(error=>toast(error.message,'error'));
  },true);
}

document.querySelectorAll('[data-strategy-tab="evolution"]').forEach(button=>button.addEventListener('click',()=>setTimeout(renderPlaybook,0)));
$('strategyRefresh')?.addEventListener('click',()=>setTimeout(renderPlaybook,250));
if(loadAuth()?.access_token)setTimeout(renderPlaybook,200);
