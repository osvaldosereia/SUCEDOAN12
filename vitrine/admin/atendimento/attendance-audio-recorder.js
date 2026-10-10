import {AttendanceOggRecorder} from './attendance-audio-webcodecs-adapter.js?v=webcodecs-ogg-v1';

const $=selector=>document.querySelector(selector);
const NATIVE_OGG_CANDIDATES=['audio/ogg;codecs=opus','audio/ogg'];
let session=null,stream=null,startedAt=0,timerHandle=null,previewUrl=null;
let recordingConversationId=null,cancelled=false,recordedAudioReady=false;

function selectedConversationId(){return String($('.queue-card.selected')?.dataset?.conversationId||'').trim()}
function status(text,tone='neutral'){const el=$('#audioRecorderStatus');if(el){el.textContent=text;el.dataset.tone=tone}}
function panel(show=true){const el=$('#audioRecorderPanel');if(el)el.hidden=!show}
function formatElapsed(ms){const total=Math.max(0,Math.floor(ms/1000)),minutes=Math.floor(total/60),seconds=total%60;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`}
function updateTimer(){const el=$('#audioRecorderTimer');if(el)el.textContent=formatElapsed(Date.now()-startedAt)}
function stopTimer(){if(timerHandle){clearInterval(timerHandle);timerHandle=null}}
function releaseStream(){if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}}
function releasePreview(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}const audio=$('#audioRecorderPreview');if(audio){audio.removeAttribute('src');audio.load?.()}}
function syncDirectSend(){const button=$('#sendRecordedAudioBtn');if(button)button.disabled=!recordedAudioReady}
function resetReady(){recordedAudioReady=false;syncDirectSend();releasePreview();const preview=$('#audioRecorderPreview');if(preview)preview.hidden=true;const timer=$('#audioRecorderTimer');if(timer)timer.textContent='00:00'}
function nativeOggFormat(){if(typeof MediaRecorder==='undefined'||typeof MediaRecorder.isTypeSupported!=='function')return null;return NATIVE_OGG_CANDIDATES.find(type=>MediaRecorder.isTypeSupported(type))||null}
function recorderErrorMessage(error){const name=String(error?.name||'');if(name==='NotAllowedError'||name==='SecurityError')return 'Permissão do microfone negada. Libere o microfone no navegador e tente novamente.';if(name==='NotFoundError')return 'Nenhum microfone foi encontrado neste dispositivo.';if(name==='NotReadableError')return 'O microfone está ocupado ou indisponível.';return 'Não consegui preparar áudio OGG/Opus neste navegador. Use “Anexar” para escolher um áudio compatível.'}
function syncRecordButton(){const button=$('#recordAudioBtn');if(!button)return;const active=Boolean(session&&session.state!=='inactive');button.disabled=active||!selectedConversationId();button.textContent=active?'🎙 Gravando…':'🎙 Gravar áudio';button.setAttribute('aria-pressed',active?'true':'false')}
function finishUi(){stopTimer();releaseStream();syncRecordButton();const stop=$('#stopAudioRecordingBtn');if(stop)stop.disabled=true}
function makeFilename(){const stamp=new Date().toISOString().replace(/[:.]/g,'-');return `audio-atendimento-${stamp}.ogg`}

function createNativeOggSession(mediaStream,mimeType){
  let media=null,chunks=[],pending=null;
  const api={
    encoderKind:'native',state:'inactive',
    async start(){
      media=new MediaRecorder(mediaStream,{mimeType,audioBitsPerSecond:64000});chunks=[];
      media.addEventListener('dataavailable',event=>{if(event.data?.size>0)chunks.push(event.data)});
      media.addEventListener('error',event=>{if(pending){const p=pending;pending=null;api.state='inactive';p.reject(event.error||new Error('Falha no MediaRecorder OGG.'))}});
      media.addEventListener('stop',()=>{
        api.state='inactive';const p=pending;pending=null;if(!p)return;
        if(p.cancel){chunks=[];p.resolve(null);return}
        const blob=new Blob(chunks,{type:'audio/ogg'});chunks=[];p.resolve(blob);
      });
      media.start(500);api.state='recording';
    },
    async stop(){
      if(!media||media.state==='inactive')throw new Error('Gravador OGG não está ativo.');
      api.state='finalizing';return new Promise((resolve,reject)=>{pending={resolve,reject,cancel:false};media.stop()});
    },
    async cancel(){
      if(!media||media.state==='inactive'){api.state='inactive';return null}
      api.state='cancelled';return new Promise(resolve=>{pending={resolve,reject:resolve,cancel:true};media.stop()});
    },
  };
  return api;
}

async function resolveSession(mediaStream){
  const native=nativeOggFormat();
  if(native)return createNativeOggSession(mediaStream,native);
  return AttendanceOggRecorder.resolve(mediaStream,{audioBitsPerSecond:64000});
}

async function startRecording(){
  if(session&&session.state!=='inactive')return;
  const conversationId=selectedConversationId();
  if(!conversationId){status('Selecione uma conversa antes de gravar.','error');return}
  if(!navigator.mediaDevices?.getUserMedia){panel(true);status('Este navegador não permite acesso ao microfone nesta página.','error');return}
  panel(true);resetReady();status('Solicitando acesso ao microfone…');
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(selectedConversationId()!==conversationId){releaseStream();status('A conversa mudou antes do início da gravação. Tente novamente.','error');return}
    cancelled=false;recordingConversationId=conversationId;
    status('Preparando áudio OGG/Opus…');
    session=await resolveSession(stream);
    if(selectedConversationId()!==conversationId){await AttendanceOggRecorder.dispose(session);session=null;releaseStream();status('A conversa mudou antes do início da gravação. Tente novamente.','error');return}
    await session.start();
    startedAt=Date.now();updateTimer();timerHandle=setInterval(updateTimer,250);
    const stop=$('#stopAudioRecordingBtn');if(stop)stop.disabled=false;
    const mode=session.encoderKind==='native'?'OGG/Opus nativo':'OGG/Opus compatibilidade';
    status(`Gravando (${mode})… fale normalmente e toque em Parar quando terminar.`,'recording');syncRecordButton();
  }catch(error){
    try{await AttendanceOggRecorder.dispose(session)}catch{}
    session=null;recordingConversationId=null;releaseStream();stopTimer();status(recorderErrorMessage(error),'error');syncRecordButton();
  }
}

async function stopRecording(){
  if(!session||session.state!=='recording')return;
  const current=session,conversationId=recordingConversationId,elapsed=Date.now()-startedAt,encoder=current.encoderKind;
  stopTimer();const stop=$('#stopAudioRecordingBtn');if(stop)stop.disabled=true;status('Preparando áudio OGG/Opus…');
  try{
    const blob=await current.stop();
    finishUi();
    if(cancelled||selectedConversationId()!==conversationId){status('Gravação descartada porque a conversa mudou.','error');return}
    if(!blob?.size){status('A gravação ficou vazia. Grave novamente.','error');return}
    if(!await AttendanceOggRecorder.isValidOggOpus(blob)){status('O áudio gerado não passou na validação OGG/Opus. Use “Anexar” ou grave novamente.','error');return}
    const file=new File([blob],makeFilename(),{type:'audio/ogg',lastModified:Date.now()});
    releasePreview();previewUrl=URL.createObjectURL(file);
    const preview=$('#audioRecorderPreview');if(preview){preview.src=previewUrl;preview.hidden=false}
    const timer=$('#audioRecorderTimer');if(timer)timer.textContent=formatElapsed(elapsed);
    recordedAudioReady=true;syncDirectSend();
    const mode=encoder==='native'?'nativo':'compatibilidade';
    status(`Áudio pronto (OGG/Opus · ${mode}). Ouça e toque em “Enviar áudio” para mandar direto.`,'success');
    document.dispatchEvent(new CustomEvent('attendance:recorded-audio-ready',{detail:{file,conversation_id:conversationId,recording_mime_type:'audio/ogg',container:'ogg',codec:'opus',encoder}}));
  }catch(error){status(recorderErrorMessage(error),'error')}
  finally{session=null;recordingConversationId=null;finishUi();syncRecordButton()}
}

async function cancelRecording(){
  if(!session||session.state==='inactive'){resetReady();panel(false);return}
  cancelled=true;stopTimer();
  try{await session.cancel?.()}catch{}
  session=null;recordingConversationId=null;finishUi();status('Gravação cancelada.');syncRecordButton();
}
function sendRecordedAudio(){if(!recordedAudioReady)return;document.dispatchEvent(new CustomEvent('attendance:send-recorded-audio'))}
function handleConversationChange(){
  if(session&&session.state!=='inactive'&&selectedConversationId()!==recordingConversationId){cancelled=true;if(session.state==='recording')cancelRecording().catch(()=>{});else status('A conversa mudou; o áudio em finalização será descartado.','error')}
  syncRecordButton();
}
function bind(){
  const record=$('#recordAudioBtn'),stop=$('#stopAudioRecordingBtn'),cancel=$('#cancelAudioRecordingBtn'),send=$('#sendRecordedAudioBtn'),queue=$('#queueList');
  if(!record)return;
  record.addEventListener('click',()=>startRecording().catch(()=>{}));
  stop?.addEventListener('click',()=>stopRecording().catch(()=>{}));cancel?.addEventListener('click',()=>cancelRecording().catch(()=>{}));send?.addEventListener('click',sendRecordedAudio);
  queue?.addEventListener('click',()=>setTimeout(handleConversationChange,0));
  document.querySelectorAll('[data-channel-switch]').forEach(el=>el.addEventListener('click',()=>setTimeout(handleConversationChange,0)));
  document.addEventListener('attendance:media-cleared',()=>{if(!session||session.state==='inactive'){resetReady();panel(false)}});
  window.addEventListener('beforeunload',()=>{stopTimer();releaseStream();releasePreview();AttendanceOggRecorder.dispose(session);session=null});
  new MutationObserver(syncRecordButton).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  syncRecordButton();syncDirectSend();
}
bind();
