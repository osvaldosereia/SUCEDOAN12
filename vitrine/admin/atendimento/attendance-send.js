const ADMIN_ATTENDANCE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-ops-v1';
const ADMIN_TOKEN_KEY='da_finance_access_token_v1';
const CAPABILITY_REFRESH_MS=15000;
const MEDIA_MAX_BYTES=16*1024*1024;
const MEDIA_MIME=new Set(['image/jpeg','image/png','audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg','application/pdf']);
const $=selector=>document.querySelector(selector);

let selectedConversationId=null;
let currentCapability={enabled:false,reason:'conversation_required',provider:null};
let sending=false;
let capabilityTimer=null;
let refreshDebounce=null;

function adminToken(){return String(sessionStorage.getItem(ADMIN_TOKEN_KEY)||'').trim()}
async function api(action,params={},method='GET'){
  const token=adminToken();
  if(!token)throw new Error('admin_session_required');
  const url=new URL(ADMIN_ATTENDANCE_API);url.searchParams.set('action',action);
  if(method==='GET')for(const [key,value] of Object.entries(params))if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
  const options={method,headers:{Authorization:`Bearer ${token}`}};
  if(method!=='GET'){options.headers['Content-Type']='application/json';options.body=JSON.stringify(params)}
  const response=await fetch(url,options);const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`attendance_${response.status}`);error.data=data;throw error}
  return data;
}
async function apiForm(action,formData){
  const token=adminToken();
  if(!token)throw new Error('admin_session_required');
  const url=new URL(ADMIN_ATTENDANCE_API);url.searchParams.set('action',action);
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:formData});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`attendance_${response.status}`);error.data=data;throw error}
  return data;
}

function activeChannel(){return String($('[data-channel-switch].active')?.dataset?.channelSwitch||'')}
function showNote(text,tone='neutral'){const note=$('#composerNote');if(!note)return;note.textContent=text;note.dataset.tone=tone}
function selectedFromDom(){return String($('.queue-card.selected')?.dataset?.conversationId||selectedConversationId||'').trim()||null}
function draftText(){return String($('#messageDraft')?.value||'').trim()}
function selectedMedia(){return $('#mediaFile')?.files?.[0]||null}
function providerLabel(provider=currentCapability?.provider){return provider==='meta'?'Meta':'PapoAI'}
function normalizedMediaMime(file){return String(file?.type||'').toLowerCase().split(';')[0].trim()}
function mediaLooksValid(file){return Boolean(file&&MEDIA_MIME.has(normalizedMediaMime(file))&&file.size>0&&file.size<=MEDIA_MAX_BYTES)}
function syncMediaNote(){
  const note=$('#mediaFileNote'),file=selectedMedia();if(!note)return;
  if(!file){note.textContent='Imagem, áudio ou PDF · até 16 MB.';return}
  const size=(Number(file.size||0)/(1024*1024)).toFixed(file.size>=1024*1024?1:2);
  note.textContent=mediaLooksValid(file)?`${file.name} · ${size} MB`:`${file.name} · formato ou tamanho não permitido`;
}

function capabilityNote(){
  const channel=activeChannel();
  if(!selectedConversationId)return ['Selecione uma conversa','neutral'];
  if(currentCapability?.enabled){
    if(selectedMedia()&&currentCapability?.provider!=='meta')return [`Anexos ainda não estão liberados pelo provedor do canal ${channel}`,'neutral'];
    return [`Envio direto disponível pelo canal ${channel} via ${providerLabel()}`,'success'];
  }
  if(currentCapability?.reason==='service_window_closed')return ['Janela de 24h encerrada · use template aprovado no PapoAI','error'];
  if(currentCapability?.reason==='meta_transport_not_configured')return [`Canal ${channel} preparado para Meta, mas o transporte seguro ainda não está configurado`,'neutral'];
  if(currentCapability?.reason==='meta_send_uncertain')return ['O resultado do último envio pela Meta é incerto · não reenvie até conferir o histórico','error'];
  if(currentCapability?.reason==='human_send_not_homologated')return [`Canal ${channel} ainda não homologado para envio direto · copiar/abrir PapoAI continua disponível`,'neutral'];
  return ['Envio direto indisponível neste momento · use copiar/abrir PapoAI','neutral'];
}

function syncSendButton({updateNote=false}={}){
  const send=$('#sendBtn');if(!send)return;
  const file=selectedMedia(),hasDraft=Boolean(draftText()),hasMedia=Boolean(file);
  const contentReady=hasMedia?mediaLooksValid(file):hasDraft;
  const providerReady=!hasMedia||currentCapability?.provider==='meta';
  send.disabled=!selectedConversationId||!contentReady||!providerReady||currentCapability?.enabled!==true||sending;
  send.textContent=sending?'Enviando…':hasMedia?'Enviar anexo':'Enviar';
  const fallbackCopy=$('#copyReplyBtn'),fallbackOpen=$('#openPapoAiBtn');void [fallbackCopy,fallbackOpen];
  if(updateNote){const [text,tone]=capabilityNote();showNote(text,tone)}
}

async function refreshCapability(conversationId=selectedFromDom()){
  if(!conversationId){selectedConversationId=null;currentCapability={enabled:false,reason:'conversation_required',provider:null};syncSendButton({updateNote:true});return}
  selectedConversationId=conversationId;
  try{
    const data=await api('conversation',{conversation_id:conversationId,limit:1});
    if(selectedConversationId!==conversationId)return;
    currentCapability=data?.send_capability||{enabled:false,reason:data?.service_window?.open===false?'service_window_closed':'human_send_not_homologated',provider:null};
  }catch{
    if(selectedConversationId!==conversationId)return;
    currentCapability={enabled:false,reason:'capability_unavailable',provider:null};
  }
  syncSendButton({updateNote:true});
}

function scheduleCapabilityRefresh(){
  clearTimeout(refreshDebounce);
  refreshDebounce=setTimeout(()=>refreshCapability(selectedFromDom()).catch(()=>{}),80);
}

function idempotencyKey(){
  const random=globalThis.crypto?.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,12):Math.random().toString(36).slice(2,14);
  return `admin:${Date.now()}:${random}`;
}

function sendErrorMessage(error){
  const code=String(error?.message||'');
  if(code==='service_window_closed')return 'Janela de 24h encerrada · use template aprovado no PapoAI';
  if(code==='human_send_not_homologated')return 'Este canal ainda não está homologado para envio direto';
  if(code==='rate_limited')return 'Muitas mensagens em pouco tempo · aguarde um instante';
  if(code==='meta_transport_not_configured')return 'O envio direto pela Meta ainda não está configurado neste canal';
  if(code==='meta_send_uncertain')return 'A Meta pode ter recebido a mensagem, mas não conseguimos confirmar. Não reenvie agora; confira o histórico.';
  if(code==='meta_http_error'||code==='meta_invalid_request')return 'A Meta não aceitou a mensagem. O conteúdo foi mantido para revisão.';
  if(code==='media_provider_unavailable')return 'Este canal ainda não está homologado para enviar anexos pela Meta';
  if(['media_file_required','media_empty','media_type_not_allowed','media_mime_not_allowed','meta_media_type_not_allowed'].includes(code))return 'Escolha uma imagem, áudio ou PDF válido.';
  if(['media_too_large','media_size_invalid','meta_media_too_large'].includes(code))return 'O anexo ultrapassa o limite de 16 MB.';
  if(code.startsWith('meta_media_upload_'))return 'Não consegui carregar o anexo na Meta. O arquivo foi mantido para tentar novamente.';
  if(code==='papoai_transport_failed'||code==='transport_config_missing')return 'O PapoAI não aceitou o envio agora · use copiar/abrir PapoAI';
  return 'Não consegui enviar agora · o conteúdo foi mantido para nova tentativa';
}

async function sendDraft(){
  if(selectedMedia())return await sendMedia();
  const conversationId=selectedFromDom(),text=draftText();
  if(!conversationId||!text||currentCapability?.enabled!==true||sending){syncSendButton({updateNote:true});return}
  selectedConversationId=conversationId;sending=true;syncSendButton();showNote(`Enviando via ${providerLabel()}…`);
  try{
    const result=await api('send_text',{conversation_id:conversationId,text,idempotency_key:idempotencyKey()},'POST');
    if(selectedConversationId!==conversationId)return;
    $('#messageDraft').value='';
    const provider=result?.provider||currentCapability?.provider;
    showNote(provider==='meta'?`Mensagem aceita pela Meta no canal ${activeChannel()} · histórico registrado no Admin`:`Mensagem aceita pelo canal ${activeChannel()} · o histórico atualizará pela confirmação do PapoAI`,'success');
    setTimeout(()=>refreshCapability(conversationId).catch(()=>{}),700);
  }catch(error){
    const code=String(error?.message||'');
    showNote(sendErrorMessage(error),'error');
    if(['service_window_closed','human_send_not_homologated','meta_transport_not_configured','meta_send_uncertain'].includes(code))currentCapability={...currentCapability,enabled:false,reason:code};
  }finally{
    sending=false;syncSendButton();
  }
}

async function sendMedia(){
  const conversationId=selectedFromDom(),mediaFile=selectedMedia(),caption=draftText();
  if(!conversationId||!mediaFile||!mediaLooksValid(mediaFile)||currentCapability?.enabled!==true||currentCapability?.provider!=='meta'||sending){syncSendButton({updateNote:true});return}
  selectedConversationId=conversationId;sending=true;syncSendButton();showNote('Enviando anexo via Meta…');
  try{
    const form=new FormData();
    form.set('conversation_id',conversationId);
    form.set('idempotency_key',idempotencyKey());
    form.set('file',mediaFile,mediaFile.name);
    if(caption)form.set('caption',caption);
    const result=await apiForm('send_media',form);
    if(selectedConversationId!==conversationId)return;
    const sentMime=normalizedMediaMime(mediaFile);
    $('#mediaFile').value='';
    syncMediaNote();
    if(!sentMime.startsWith('audio/')&&caption)$('#messageDraft').value='';
    showNote(`Anexo aceito pela Meta no canal ${activeChannel()} · histórico registrado no Admin`,'success');
    void result;
    setTimeout(()=>refreshCapability(conversationId).catch(()=>{}),700);
  }catch(error){
    const code=String(error?.message||'');
    showNote(sendErrorMessage(error),'error');
    if(['service_window_closed','human_send_not_homologated','meta_transport_not_configured','meta_send_uncertain'].includes(code))currentCapability={...currentCapability,enabled:false,reason:code};
  }finally{
    sending=false;syncMediaNote();syncSendButton();
  }
}

function resetChannelSelection(){
  selectedConversationId=null;
  currentCapability={enabled:false,reason:'conversation_required',provider:null};
  clearTimeout(refreshDebounce);
  syncSendButton({updateNote:true});
}

function bind(){
  const draft=$('#messageDraft'),send=$('#sendBtn'),queue=$('#queueList'),mediaFile=$('#mediaFile');
  if(!draft||!send||!queue||!mediaFile)return;
  draft.addEventListener('input',()=>syncSendButton());
  mediaFile.addEventListener('change',()=>{syncMediaNote();syncSendButton({updateNote:true})});
  draft.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey){
      if(send.disabled)return;
      event.preventDefault();sendDraft().catch(()=>{});
    }
  });
  send.addEventListener('click',()=>sendDraft().catch(()=>{}));
  document.querySelectorAll('[data-channel-switch]').forEach(button=>button.addEventListener('click',()=>resetChannelSelection()));
  queue.addEventListener('click',event=>{
    const card=event.target.closest?.('.queue-card');if(!card)return;
    selectedConversationId=String(card.dataset.conversationId||'')||null;
    currentCapability={enabled:false,reason:'loading',provider:null};syncSendButton();scheduleCapabilityRefresh();
  });
  const observer=new MutationObserver(()=>scheduleCapabilityRefresh());
  observer.observe(queue,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleCapabilityRefresh()});
  capabilityTimer=setInterval(()=>{if(!document.hidden&&selectedFromDom())refreshCapability(selectedFromDom()).catch(()=>{})},CAPABILITY_REFRESH_MS);
  window.addEventListener('beforeunload',()=>{if(capabilityTimer)clearInterval(capabilityTimer)});
  syncMediaNote();syncSendButton();
}

bind();