(()=>{
  'use strict';
  const app=window.DA_COMPRAR_APP;if(!app)return;const $=app.$;
  const PURCHASE_KINDS=new Set(['baskets','offers','products']);
  let recorder=null,stream=null,chunks=[],startedAt=0,timer=null,checkoutMode=false,quickConfig=null,quickLoading=null;

  function elements(){return {help:$('helpToggle'),close:$('helpClose'),composer:$('composer'),input:$('messageInput'),photoInput:$('photoInput'),photoButton:$('photoButton'),mic:$('micButton'),send:$('sendButton'),recording:$('recordingBar'),recordingTime:$('recordingTime'),cancel:$('cancelRecording'),timeline:$('timeline')}}
  function clearQuickActive(){document.querySelectorAll('.help-quick-prompt-active,.help-quick-questions-active,.help-other-questions').forEach(node=>node.remove())}
  function setOpen(open){
    const {help,close,composer}=elements();if(!help||!composer)return;
    composer.classList.toggle('composer-open',open);composer.classList.toggle('composer-collapsed',!open);help.setAttribute('aria-expanded',String(open));help.classList.toggle('hidden',open||checkoutMode);close?.classList.toggle('hidden',!open);document.body.classList.toggle('help-open',open);
    if(!open)clearQuickActive();
  }
  async function loadQuickQuestions({refresh=false}={}){
    if(quickConfig&&!refresh)return quickConfig;
    if(quickLoading&&!refresh)return quickLoading;
    if(!app.config?.menuApi)return {prompt:'Posso te ajudar com alguma dúvida?',items:[]};
    quickLoading=(async()=>{
      const data=await app.post(app.config.menuApi,'get');
      const cfg=data?.config||{};
      const items=(Array.isArray(cfg.menu_items)?cfg.menu_items:[])
        .filter(item=>item?.enabled!==false)
        .filter(item=>!PURCHASE_KINDS.has(app.text(item?.kind)))
        .filter(item=>app.text(item?.label)&&app.text(item?.response_text))
        .sort((a,b)=>Number(a?.sort_order||0)-Number(b?.sort_order||0));
      quickConfig={prompt:app.text(cfg.prompt_text)||'Posso te ajudar com alguma dúvida?',items};
      return quickConfig;
    })();
    try{return await quickLoading}finally{quickLoading=null}
  }
  function renderOtherQuestions(){
    if(checkoutMode)return null;document.querySelectorAll('.help-other-questions').forEach(node=>node.remove());
    const {timeline}=elements();if(!timeline)return null;
    const host=document.createElement('div');host.className='help-other-questions';
    const button=document.createElement('button');button.type='button';button.className='chip';button.textContent='Outras dúvidas';button.onclick=()=>{host.remove();renderQuickQuestions({refresh:false})};
    host.appendChild(button);timeline.appendChild(host);app.scrollTo(host,{block:'nearest'});return host;
  }
  async function renderQuickQuestions({refresh=false}={}){
    if(checkoutMode)return null;clearQuickActive();
    let cfg;try{cfg=await loadQuickQuestions({refresh})}catch{return null}
    if(checkoutMode||!cfg?.items?.length)return null;
    const prompt=app.assistantMessage(cfg.prompt,{className:'help-quick-prompt help-quick-prompt-active'});
    const {timeline}=elements();if(!timeline)return null;
    const host=document.createElement('div');host.className='help-quick-questions help-quick-questions-active';
    for(const item of cfg.items){
      const button=document.createElement('button');button.type='button';button.className='chip';button.textContent=app.text(item.label);
      button.onclick=()=>{
        prompt?.remove();host.remove();
        app.userDecision(app.text(item.label),{className:'help-quick-decision'});
        app.assistantMessage(app.text(item.response_text),{className:'help-quick-answer'});
        renderOtherQuestions();
      };
      host.appendChild(button);
    }
    timeline.appendChild(host);app.scrollTo(host,{block:'nearest'});return host;
  }
  function open(){if(checkoutMode)return;setOpen(true);renderQuickQuestions({refresh:false})}
  function close(){setOpen(false)}
  function toggle(){const {help}=elements();if(!help||checkoutMode)return;help.getAttribute('aria-expanded')==='true'?close():open()}
  function setCheckoutMode(active){checkoutMode=!!active;const {help}=elements();if(checkoutMode)close();help?.classList.toggle('hidden',checkoutMode)}
  function appendUserMessage(message){return app.bubble(message,'user')}
  function appendAssistantMessage(message){return app.bubble(message,'assistant')}
  function applyReply(data){const reply=app.text(data?.reply||data?.message||'');if(reply)appendAssistantMessage(reply)}
  async function sendText(message){const value=app.text(message);if(!value)return;clearQuickActive();appendUserMessage(value);const data=await app.api('send_text',{message:value});applyReply(data);renderOtherQuestions()}
  async function onSubmit(event){event.preventDefault();const {input,send}=elements(),value=app.text(input?.value);if(!value||send?.dataset.busy==='1')return;if(send){send.dataset.busy='1';send.disabled=true}if(input)input.value='';try{await sendText(value)}catch(error){if(input)input.value=value;app.toast(error.message)}finally{if(send){send.dataset.busy='0';send.disabled=false}}}
  async function sendMedia(kind,file,durationMs=0){clearQuickActive();appendUserMessage(kind==='image'?'📷 Foto enviada':'🎤 Áudio enviado');const data=await app.uploadMedia(kind,file,durationMs);applyReply(data);renderOtherQuestions()}
  async function onPhotoChange(){const {photoInput,photoButton}=elements(),file=photoInput?.files?.[0];if(!file||photoButton?.dataset.busy==='1')return;if(photoButton){photoButton.dataset.busy='1';photoButton.disabled=true}try{await sendMedia('image',file)}catch(error){app.toast(error.message)}finally{if(photoInput)photoInput.value='';if(photoButton){photoButton.dataset.busy='0';photoButton.disabled=false}}}
  function formatDuration(ms){const seconds=Math.max(0,Math.floor(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}
  function stopTimer(){clearInterval(timer);timer=null}
  function updateTimer(){const {recordingTime}=elements();if(recordingTime)recordingTime.textContent=formatDuration(Date.now()-startedAt)}
  async function startRecording(){const {mic,recording}=elements();if(recorder||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){if(!recorder)app.toast('Gravação de áudio indisponível neste aparelho.');return}try{stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];startedAt=Date.now();recorder=new MediaRecorder(stream);recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data)};recorder.onstop=finishRecording;recorder.start();recording?.classList.remove('hidden');if(mic)mic.textContent='■';updateTimer();timer=setInterval(updateTimer,500)}catch{app.toast('Não consegui acessar o microfone.')}}
  function releaseRecording(){stopTimer();stream?.getTracks?.().forEach(track=>track.stop());stream=null;const {mic,recording}=elements();if(mic)mic.textContent='🎤';recording?.classList.add('hidden')}
  async function finishRecording(){const durationMs=Math.max(0,Date.now()-startedAt),parts=chunks.slice();chunks=[];recorder=null;releaseRecording();if(!parts.length)return;const type=parts[0]?.type||'audio/webm',file=new File([new Blob(parts,{type})],`audio-${Date.now()}.webm`,{type});try{await sendMedia('audio',file,durationMs)}catch(error){app.toast(error.message)}}
  function stopRecording(){if(recorder&&recorder.state!=='inactive')recorder.stop()}
  function cancelRecording(){if(!recorder)return;recorder.onstop=()=>{recorder=null;chunks=[];releaseRecording()};if(recorder.state!=='inactive')recorder.stop()}
  function init(){const {help,close:closeButton,composer,input,photoInput,photoButton,mic,cancel}=elements();if(!help||!composer)return;help.onclick=toggle;closeButton&&(closeButton.onclick=close);composer.onsubmit=onSubmit;photoButton&&(photoButton.onclick=()=>photoInput?.click());photoInput&&(photoInput.onchange=onPhotoChange);mic&&(mic.onclick=()=>recorder?stopRecording():startRecording());cancel&&(cancel.onclick=cancelRecording);input?.addEventListener('keydown',event=>{if(event.key==='Escape')close()});document.addEventListener('keydown',event=>{if(event.key==='Escape')close()});setOpen(false)}
  app.registerModule('help',{open,close,toggle,setCheckoutMode,sendText,sendMedia,loadQuickQuestions,renderQuickQuestions});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();