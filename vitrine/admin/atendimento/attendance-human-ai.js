const SUPABASE_URL='https://ssbesxgaijknwsjbsbcz.supabase.co';
const ADMIN_ATTENDANCE_API=`${SUPABASE_URL}/functions/v1/admin-whatsapp-ops-v1`;
const REST_API=`${SUPABASE_URL}/rest/v1/rpc`;
const ADMIN_TOKEN_KEY='da_finance_access_token_v1';
const ADMIN_PUBLIC_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';
const $=selector=>document.querySelector(selector);
let busy=false;
let lastConversationId=null;
let syncTimer=null;

function token(){return String(sessionStorage.getItem(ADMIN_TOKEN_KEY)||'').trim()}
function selectedConversationId(){return String($('.queue-card.selected')?.dataset?.conversationId||'').trim()}
function controls(){return {state:$('#humanAiState'),takeover:$('#takeoverBtn'),resume:$('#resumeAiBtn')}}
function setStatus(text,tone='neutral'){
  const {state}=controls();if(!state)return;state.textContent=text;state.dataset.tone=tone;
}
function syncConversationHeadMode(mode){
  const small=$('#conversationHead small');if(!small||!selectedConversationId())return;
  const current=String(small.textContent||'');const channel=current.split('·')[0].trim();
  if(mode==='human'||mode==='human_copilot')small.textContent=`${channel} · Atendimento humano`;
  else if(mode==='ai')small.textContent=`${channel} · ANA atendendo`;
}
function renderMode(mode){
  const {takeover,resume}=controls();if(!takeover||!resume)return;
  const selected=Boolean(selectedConversationId());
  if(!selected){takeover.disabled=true;resume.disabled=true;setStatus('Sem conversa');return}
  if(mode==='human'||mode==='human_copilot'){
    takeover.disabled=true;resume.disabled=busy;setStatus('Humano no controle','human');return;
  }
  if(mode==='ai'){
    takeover.disabled=busy;resume.disabled=true;setStatus('Modo IA','ai');return;
  }
  takeover.disabled=busy;resume.disabled=busy;setStatus(mode==='paused'?'IA pausada':'Estado indisponível','neutral');
}
function ensureControls(){
  const host=$('.conversation-head-actions');if(!host||$('#humanAiState'))return;
  const state=document.createElement('span');state.id='humanAiState';state.className='human-ai-state';state.textContent='Sem conversa';
  const takeover=document.createElement('button');takeover.type='button';takeover.id='takeoverBtn';takeover.textContent='Assumir atendimento';takeover.disabled=true;
  const resume=document.createElement('button');resume.type='button';resume.id='resumeAiBtn';resume.textContent='Liberar para IA';resume.disabled=true;
  host.prepend(state,takeover,resume);
  takeover.addEventListener('click',()=>changeState('ops2_admin_attendance_takeover_v1').catch(()=>{}));
  resume.addEventListener('click',()=>changeState('ops2_admin_attendance_resume_ai_v1').catch(()=>{}));
}
async function readConversation(conversationId){
  const access=token();if(!access)throw new Error('admin_session_required');
  const url=new URL(ADMIN_ATTENDANCE_API);url.searchParams.set('action','conversation');url.searchParams.set('conversation_id',conversationId);url.searchParams.set('limit','1');
  const response=await fetch(url,{headers:{Authorization:`Bearer ${access}`,apikey:ADMIN_PUBLIC_KEY},cache:'no-store'});
  const data=await response.json().catch(()=>({}));if(!response.ok||data?.ok===false)throw new Error(data?.error||`attendance_${response.status}`);return data?.conversation||null;
}
async function callStateRpc(name,conversationId){
  const access=token();if(!access)throw new Error('admin_session_required');
  const response=await fetch(`${REST_API}/${name}`,{method:'POST',headers:{Authorization:`Bearer ${access}`,apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_conversation_id:conversationId})});
  const data=await response.json().catch(()=>({}));if(!response.ok||data?.ok===false)throw new Error(data?.error||`state_${response.status}`);return data;
}
async function changeState(rpc){
  if(busy)return;const conversationId=selectedConversationId();if(!conversationId)return;
  busy=true;const previous=$('#humanAiState')?.textContent||'';setStatus('Atualizando…');renderMode(null);
  try{
    const result=await callStateRpc(rpc,conversationId);
    if(selectedConversationId()!==conversationId)return;
    renderMode(result.mode);syncConversationHeadMode(result.mode);
    document.dispatchEvent(new CustomEvent('attendance:human-ai-state-changed',{detail:{conversationId,mode:result.mode}}));
  }catch(error){
    if(selectedConversationId()===conversationId)setStatus(error?.message==='conversation_owned_by_other_admin'?'Conversa assumida por outro atendente':'Não foi possível alterar o atendimento','error');
  }finally{
    busy=false;if(selectedConversationId()===conversationId){const current=$('#humanAiState')?.textContent||'';if(current==='Atualizando…')setStatus(previous||'Estado indisponível');scheduleSync(80)}
  }
}
async function sync(){
  ensureControls();const conversationId=selectedConversationId();
  if(!conversationId){lastConversationId=null;renderMode(null);return}
  lastConversationId=conversationId;
  try{const conversation=await readConversation(conversationId);if(selectedConversationId()!==conversationId)return;renderMode(conversation?.mode||null);syncConversationHeadMode(conversation?.mode||null)}catch{if(selectedConversationId()===conversationId)setStatus('Estado indisponível','error')}
}
function scheduleSync(delay=0){clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync().catch(()=>{}),delay)}

ensureControls();
document.addEventListener('click',event=>{if(event.target?.closest?.('.queue-card,[data-channel-switch]'))scheduleSync(80)});
document.addEventListener('attendance:sent',()=>scheduleSync(80));
const observer=new MutationObserver(()=>{const current=selectedConversationId();if(current!==lastConversationId)scheduleSync(20)});
observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
setInterval(()=>{if(selectedConversationId())scheduleSync(0)},15000);
scheduleSync(0);
