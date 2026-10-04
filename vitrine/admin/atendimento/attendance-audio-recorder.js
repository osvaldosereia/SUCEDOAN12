const $=selector=>document.querySelector(selector);
const FORMAT_CANDIDATES=[
  {mimeType:'audio/mp4;codecs=mp4a.40.2',fileType:'audio/mp4',extension:'m4a'},
  {mimeType:'audio/mp4',fileType:'audio/mp4',extension:'m4a'},
  {mimeType:'audio/ogg;codecs=opus',fileType:'audio/ogg',extension:'ogg'},
  {mimeType:'audio/ogg',fileType:'audio/ogg',extension:'ogg'},
];
let recorder=null,stream=null,chunks=[],startedAt=0,timerHandle=null,previewUrl=null;
let recordingConversationId=null,cancelled=false;

function selectedConversationId(){return String($('.queue-card.selected')?.dataset?.conversationId||'').trim()}
function status(text,tone='neutral'){const el=$('#audioRecorderStatus');if(el){el.textContent=text;el.dataset.tone=tone}}
function panel(show=true){const el=$('#audioRecorderPanel');if(el)el.hidden=!show}
function formatElapsed(ms){const total=Math.max(0,Math.floor(ms/1000)),minutes=Math.floor(total/60),seconds=total%60;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`}
function updateTimer(){const el=$('#audioRecorderTimer');if(el)el.textContent=formatElapsed(Date.now()-startedAt)}
function stopTimer(){if(timerHandle){clearInterval(timerHandle);timerHandle=null}}
function releaseStream(){if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}}
function releasePreview(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}const audio=$('#audioRecorderPreview');if(audio){audio.removeAttribute('src');audio.load?.()}}
function resetReady(){releasePreview();const preview=$('#audioRecorderPreview');if(preview)preview.hidden=true;const timer=$('#audioRecorderTimer');if(timer)timer.textContent='00:00'}
function compatibleFormat(){if(typeof MediaRecorder==='undefined'||typeof MediaRecorder.isTypeSupported!=='function')return null;return FORMAT_CANDIDATES.find(item=>MediaRecorder.isTypeSupported(item.mimeType))||null}
function recorderErrorMessage(error){const name=String(error?.name||'');if(name==='NotAllowedError'||name==='SecurityError')return 'Permissão do microfone negada. Libere o microfone no navegador e tente novamente.';if(name==='NotFoundError')return 'Nenhum microfone foi encontrado neste dispositivo.';if(name==='NotReadableError')return 'O microfone está ocupado ou indisponível.';return 'Não consegui iniciar o microfone. Tente novamente.'}
function syncRecordButton(){const button=$('#recordAudioBtn');if(!button)return;const active=Boolean(recorder&&recorder.state!=='inactive');button.disabled=active||!selectedConversationId();button.textContent=active?'🎙 Gravando…':'🎙 Gravar áudio';button.setAttribute('aria-pressed',active?'true':'false')}
function finishUi(){stopTimer();releaseStream();syncRecordButton();const stop=$('#stopAudioRecordingBtn');if(stop)stop.disabled=true}
function makeFilename(extension){const stamp=new Date().toISOString().replace(/[:.]/g,'-');return `audio-atendimento-${stamp}.${extension}`}

async function startRecording(){
  if(recorder&&recorder.state!=='inactive')return;
  const conversationId=selectedConversationId();
  if(!conversationId){status('Selecione uma conversa antes de gravar.','error');return}
  const format=compatibleFormat();
  if(!format){panel(true);status('Este navegador não grava em MP4/AAC ou OGG/Opus compatível com o WhatsApp. Use “Anexar” para escolher um áudio.','error');syncRecordButton();return}
  if(!navigator.mediaDevices?.getUserMedia){panel(true);status('Este navegador não permite acesso ao microfone nesta página.','error');return}
  panel(true);resetReady();status('Solicitando acesso ao microfone…');
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(selectedConversationId()!==conversationId){releaseStream();status('A conversa mudou antes do início da gravação. Tente novamente.','error');return}
    chunks=[];cancelled=false;recordingConversationId=conversationId;
    recorder=new MediaRecorder(stream,{mimeType:format.mimeType,audioBitsPerSecond:64000});
    recorder.addEventListener('dataavailable',event=>{if(event.data?.size>0)chunks.push(event.data)});
    recorder.addEventListener('error',event=>{status(recorderErrorMessage(event.error),'error');cancelled=true;finishUi()});
    recorder.addEventListener('stop',()=>{
      const elapsed=Date.now()-startedAt;
      finishUi();
      if(cancelled||!chunks.length){chunks=[];recordingConversationId=null;if(cancelled)status('Gravação cancelada.');return}
      const blob=new Blob(chunks,{type:format.fileType});
      chunks=[];
      if(blob.size<1){recordingConversationId=null;status('A gravação ficou vazia. Grave novamente.','error');return}
      const file=new File([blob],makeFilename(format.extension),{type:format.fileType,lastModified:Date.now()});
      releasePreview();previewUrl=URL.createObjectURL(file);
      const preview=$('#audioRecorderPreview');if(preview){preview.src=previewUrl;preview.hidden=false}
      const timer=$('#audioRecorderTimer');if(timer)timer.textContent=formatElapsed(elapsed);
      status('Áudio pronto. Ouça e depois toque em “Enviar anexo”.','success');
      document.dispatchEvent(new CustomEvent('attendance:recorded-audio-ready',{detail:{file,conversation_id:recordingConversationId}}));
      recordingConversationId=null;
    });
    recorder.start(500);startedAt=Date.now();updateTimer();timerHandle=setInterval(updateTimer,250);
    const stop=$('#stopAudioRecordingBtn');if(stop)stop.disabled=false;
    status('Gravando… fale normalmente e toque em Parar quando terminar.','recording');syncRecordButton();
  }catch(error){releaseStream();stopTimer();status(recorderErrorMessage(error),'error');syncRecordButton()}
}

function stopRecording(){if(!recorder||recorder.state==='inactive')return;cancelled=false;recorder.stop();status('Finalizando áudio…')}
function cancelRecording(){if(!recorder||recorder.state==='inactive'){resetReady();panel(false);return}cancelled=true;recorder.stop();stopTimer();releaseStream();status('Gravação cancelada.');syncRecordButton()}
function handleConversationChange(){if(recorder&&recorder.state!=='inactive'&&selectedConversationId()!==recordingConversationId){cancelled=true;recorder.stop();status('Gravação cancelada porque a conversa mudou.','error')}syncRecordButton()}
function bind(){
  const record=$('#recordAudioBtn'),stop=$('#stopAudioRecordingBtn'),cancel=$('#cancelAudioRecordingBtn'),queue=$('#queueList');
  if(!record)return;
  record.addEventListener('click',()=>startRecording().catch(()=>{}));
  stop?.addEventListener('click',stopRecording);cancel?.addEventListener('click',cancelRecording);
  queue?.addEventListener('click',()=>setTimeout(handleConversationChange,0));
  document.querySelectorAll('[data-channel-switch]').forEach(el=>el.addEventListener('click',()=>setTimeout(handleConversationChange,0)));
  document.addEventListener('attendance:media-cleared',()=>{if(!recorder||recorder.state==='inactive'){resetReady();panel(false)}});
  window.addEventListener('beforeunload',()=>{stopTimer();releaseStream();releasePreview()});
  new MutationObserver(syncRecordButton).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  syncRecordButton();
}
bind();
