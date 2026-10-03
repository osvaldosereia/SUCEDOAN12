const ADMIN_ATTENDANCE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-ops-v1';
const ADMIN_TOKEN_KEY='da_finance_access_token_v1';
const MAX_BYTES=16*1024*1024;
const $=selector=>document.querySelector(selector);
let sending=false;
let pendingMediaIdempotencyKey=null;
let mediaConversationId=null;

function adminToken(){return String(sessionStorage.getItem(ADMIN_TOKEN_KEY)||'').trim()}
function selectedConversationId(){return String($('.queue-card.selected')?.dataset?.conversationId||'').trim()}
function note(text,tone='neutral'){const el=$('#mediaFileNote');if(!el)return;el.textContent=text;el.dataset.tone=tone}
function idempotencyKey(){
  const random=globalThis.crypto?.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,12):Math.random().toString(36).slice(2,14);
  return `admin-media:${Date.now()}:${random}`;
}
function mediaFile(){return $('#mediaFile')?.files?.[0]||null}
function supported(file){
  if(!file)return false;
  return ['image/jpeg','image/png','audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg','application/pdf'].includes(String(file.type||'').toLowerCase());
}
function clearMediaSelection(){
  const input=$('#mediaFile');
  if(input)input.value='';
  pendingMediaIdempotencyKey=null;
  mediaConversationId=null;
}
function enforceMediaConversation(){
  if(mediaConversationId&&selectedConversationId()!==mediaConversationId){
    clearMediaSelection();
    note('Anexo removido porque a conversa mudou.','neutral');
  }
}
function sync(){
  const button=$('#sendMediaBtn');if(!button)return;
  enforceMediaConversation();
  const file=mediaFile();
  button.disabled=sending||!selectedConversationId()||!file||!supported(file)||file.size<1||file.size>MAX_BYTES;
  button.textContent=sending?'Enviando anexo…':'Enviar anexo';
}
function sendErrorMessage(error){
  const code=String(error?.message||'');
  if(code==='service_window_closed')return 'Janela de 24h encerrada para envio de anexo.';
  if(code==='human_send_not_homologated'||code==='media_provider_unavailable')return 'Este canal ainda não está homologado para anexos via Meta.';
  if(code==='meta_canary_not_enabled')return 'Canário de mídia não está habilitado neste canal.';
  if(code==='meta_canary_destination_blocked')return 'Destino bloqueado pelo canário de homologação.';
  if(code==='rate_limited')return 'Muitos envios em pouco tempo. Tente novamente em instantes.';
  if(code==='media_mime_not_allowed'||code==='meta_media_type_not_allowed')return 'Tipo de arquivo não permitido. Use imagem, áudio ou PDF.';
  if(code==='media_size_invalid'||code==='meta_media_too_large')return 'Arquivo acima do limite de 16 MB.';
  if(code==='meta_transport_not_configured')return 'O transporte Meta deste canal não está configurado.';
  if(code==='meta_send_uncertain')return 'Resultado incerto na Meta. Não reenvie até conferir o histórico.';
  return 'Não consegui enviar o anexo. O arquivo continua selecionado para nova tentativa.';
}

async function sendMedia(){
  const file=mediaFile(),conversationId=selectedConversationId();
  if(sending||!file||!conversationId||!supported(file)||file.size<1||file.size>MAX_BYTES){sync();return}
  if(mediaConversationId&&conversationId!==mediaConversationId){clearMediaSelection();note('Anexo removido porque a conversa mudou.','neutral');sync();return}
  const token=adminToken();if(!token){note('Sessão do Admin expirada.','error');return}
  mediaConversationId ||= conversationId;
  pendingMediaIdempotencyKey ||= idempotencyKey();
  const form=new FormData();
  form.set('conversation_id',conversationId);
  form.set('idempotency_key',pendingMediaIdempotencyKey);
  form.set('file',file,file.name);
  const caption=String($('#messageDraft')?.value||'').trim();
  if(caption)form.set('caption',caption);
  sending=true;sync();note('Enviando anexo via Meta…');
  try{
    const url=new URL(ADMIN_ATTENDANCE_API);url.searchParams.set('action','send_media');
    const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.ok===false){const error=new Error(data?.error||`attendance_${response.status}`);error.data=data;throw error}
    clearMediaSelection();
    note('Anexo aceito pela Meta e registrado no histórico.','success');
  }catch(error){
    note(sendErrorMessage(error),'error');
  }finally{
    sending=false;sync();
  }
}

function bind(){
  const input=$('#mediaFile'),button=$('#sendMediaBtn'),queue=$('#queueList');
  if(!input||!button)return;
  input.addEventListener('change',()=>{
    pendingMediaIdempotencyKey=null;
    mediaConversationId=null;
    const file=mediaFile(),conversationId=selectedConversationId();
    if(file&&!conversationId){clearMediaSelection();note('Selecione uma conversa antes de anexar o arquivo.','error');sync();return}
    if(file)mediaConversationId=conversationId;
    if(file&&!supported(file))note('Tipo não permitido. Use imagem, áudio ou PDF.','error');
    else if(file&&file.size>MAX_BYTES)note('Arquivo acima do limite de 16 MB.','error');
    else if(file)note(`${file.name} · pronto para enviar.`,'neutral');
    else note('Imagem, áudio ou PDF · até 16 MB.','neutral');
    sync();
  });
  button.addEventListener('click',()=>sendMedia().catch(()=>{}));
  queue?.addEventListener('click',()=>setTimeout(()=>{enforceMediaConversation();sync()},0));
  document.querySelectorAll('[data-channel-switch]').forEach(el=>el.addEventListener('click',()=>setTimeout(()=>{enforceMediaConversation();sync()},0)));
  const observer=new MutationObserver(sync);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  sync();
}

bind();
