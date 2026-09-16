(()=>{
  'use strict';
  const app=window.DA_COMPRAR_APP;if(!app)return;const $=app.$;
  let recorder=null,stream=null,chunks=[],startedAt=0,timer=null,checkoutMode=false;

  function elements(){return {help:$('helpToggle'),close:$('helpClose'),composer:$('composer'),input:$('messageInput'),photoInput:$('photoInput'),photoButton:$('photoButton'),mic:$('micButton'),send:$('sendButton'),recording:$('recordingBar'),recordingTime:$('recordingTime'),cancel:$('cancelRecording')}}
  function setOpen(open){
    const {help,close,composer,input}=elements();if(!help||!composer)return;
    composer.classList.toggle('composer-open',open);composer.classList.toggle('composer-collapsed',!open);help.setAttribute('aria-expanded',String(open));help.classList.toggle('hidden',open||checkoutMode);close?.classList.toggle('hidden',!open);document.body.classList.toggle('help-open',open);
    if(open&&!checkoutMode)setTimeout(()=>input?.focus(),40);
  }
  function open(){if(!checkoutMode)setOpen(true)}
  function close(){setOpen(false)}
  function toggle(){const {help}=elements();if(!help||checkoutMode)return;setOpen(help.getAttribute('aria-expanded')!=='true')}
  function setCheckoutMode(active){checkoutMode=!!active;const {help}=elements();if(checkoutMode)close();help?.classList.toggle('hidden',checkoutMode)}
  function appendUserMessage(message){return app.bubble(message,'user')}
  function appendAssistantMessage(message){return app.bubble(message,'assistant')}
  async function applyReply(data){
    const reply=app.text(data?.reply||data?.message||'');if(reply)appendAssistantMessage(reply);
    const ui=data?.ui&&typeof data.ui==='object'?data.ui:null;if(!ui)return;
    const type=app.text(ui.type);
    if(type==='product_lookup'){
      const query=app.text(ui.query);if(query)await app.state.modules.products?.openLookup?.(query);
    }
  }
  async function sendText(message){const value=app.text(message);if(!value)return;appendUserMessage(value);const data=await app.api('send_text',{message:value});await applyReply(data)}
  async function onSubmit(event){event.preventDefault();const {input,send}=elements(),value=app.text(input?.value);if(!value||send?.dataset.busy==='1')return;if(send){send.dataset.busy='1';send.disabled=true}if(input)input.value='';try{await sendText(value);close()}catch(error){if(input)input.value=value;app.toast(error.message)}finally{if(send){send.dataset.busy='0';send.disabled=false}}}
  async function sendMedia(kind,file,durationMs=0){appendUserMessage(kind==='image'?'📷 Foto enviada':'🎤 Áudio enviado');const data=await app.uploadMedia(kind,file,durationMs);await applyReply(data)}
  async function onPhotoChange(){const {photoInput,photoButton}=elements(),file=photoInput?.files?.[0];if(!file||photoButton?.dataset.busy==='1')return;if(photoButton){photoButton.dataset.busy='1';photoButton.disabled=true}try{await sendMedia('image',file);close()}catch(error){app.toast(error.message)}finally{if(photoInput)photoInput.value='';if(photoButton){photoButton.dataset.busy='0';photoButton.disabled=false}}}
  function formatDuration(ms){const seconds=Math.max(0,Math.floor(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}
  function stopTimer(){clearInterval(timer);timer=null}
  function updateTimer(){const {recordingTime}=elements();if(recordingTime)recordingTime.textContent=formatDuration(Date.now()-startedAt)}
  async function startRecording(){const {mic,recording}=elements();if(recorder||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){if(!recorder)app.toast('Gravação de áudio indisponível neste aparelho.');return}try{stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];startedAt=Date.now();recorder=new MediaRecorder(stream);recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data)};recorder.onstop=finishRecording;recorder.start();recording?.classList.remove('hidden');if(mic)mic.textContent='■';updateTimer();timer=setInterval(updateTimer,500)}catch{app.toast('Não consegui acessar o microfone.')}}
  function releaseRecording(){stopTimer();stream?.getTracks?.().forEach(track=>track.stop());stream=null;const {mic,recording}=elements();if(mic)mic.textContent='🎤';recording?.classList.add('hidden')}
  async function finishRecording(){const durationMs=Math.max(0,Date.now()-startedAt),parts=chunks.slice();chunks=[];recorder=null;releaseRecording();if(!parts.length)return;const type=parts[0]?.type||'audio/webm',file=new File([new Blob(parts,{type})],`audio-${Date.now()}.webm`,{type});try{await sendMedia('audio',file,durationMs);close()}catch(error){app.toast(error.message)}}
  function stopRecording(){if(recorder&&recorder.state!=='inactive')recorder.stop()}
  function cancelRecording(){if(!recorder)return;recorder.onstop=()=>{recorder=null;chunks=[];releaseRecording()};if(recorder.state!=='inactive')recorder.stop()}
  function init(){const {help,close:closeButton,composer,input,photoInput,photoButton,mic,cancel}=elements();if(!help||!composer)return;help.onclick=toggle;closeButton&&(closeButton.onclick=close);composer.onsubmit=onSubmit;photoButton&&(photoButton.onclick=()=>photoInput?.click());photoInput&&(photoInput.onchange=onPhotoChange);mic&&(mic.onclick=()=>recorder?stopRecording():startRecording());cancel&&(cancel.onclick=cancelRecording);input?.addEventListener('keydown',event=>{if(event.key==='Escape')close()});document.addEventListener('keydown',event=>{if(event.key==='Escape')close()});setOpen(false)}
  app.registerModule('help',{open,close,toggle,setCheckoutMode,sendText,sendMedia});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();