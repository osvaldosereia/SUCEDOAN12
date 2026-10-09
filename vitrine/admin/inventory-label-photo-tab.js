/* DA6 — aba de leitura de etiquetas, com upload persistente e status sem IA. */
(function(root){
'use strict';
const $=(sel,where=document)=>where.querySelector(sel);
const bridge=()=>root.DonaAntoniaAdminBridge;
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const names={uploading:'Enviando',queued:'Na fila',processing:'Lendo',retry:'Nova tentativa',complete:'Lida',needs_review:'Revisar',failed:'Falhou'};
let active=false,currentBatch=null,pollTimer=null,busy=false,statusSeq=0;
// Preserva a visibilidade dos componentes A4 ao alternar para fotografias.
const previouslyHidden=new WeakMap();
function call(action,body){return bridge().api(action,{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
function toast(s){bridge()?.toast?.(s)}
function host(){return $('#da6-photo-panel')}
function headingOK(){return String($('#content .page-head h1')?.textContent||'').trim()==='Balanço'}
function setMode(photos){
 statusSeq++; // invalida respostas antigas ao trocar entre balanço A4 e fotos
 const wasActive=active;
 active=photos;
 const panel=host(),controls=$('#da6-balance-modes');if(!panel||!controls)return;
 const content=$('#content');
 Array.from(content.children).forEach(el=>{
  if(el===panel||el===controls||el.classList.contains('page-head'))return;
  if(photos){
   if(!previouslyHidden.has(el))previouslyHidden.set(el,el.hidden);
   el.hidden=true;
  }else if(previouslyHidden.has(el)){
   el.hidden=previouslyHidden.get(el);
   previouslyHidden.delete(el);
  }
 });
 panel.hidden=!photos;
 controls.querySelector('[data-da6-mode=photos]').classList.toggle('primary',photos);
 controls.querySelector('[data-da6-mode=scanner]').classList.toggle('primary',!photos);
 if(photos){bridge()?.stopBalanceCamera?.();loadBatches().catch(e=>toast(e.message));}
 else if(wasActive) bridge()?.startBalanceCamera?.();
}
function renderProgress(snapshot){
 const el=$('#da6-upload-progress');if(!el)return;
 const completed=Number(snapshot.uploaded||0)+Number(snapshot.duplicates||0)+Number(snapshot.failed||0);
 el.innerHTML='<strong>Upload '+completed+'/'+snapshot.total+'</strong> · '+snapshot.uploaded+' confirmadas · '+snapshot.duplicates+' repetidas · '+snapshot.failed+' falhas'+
  '<progress max="'+snapshot.total+'" value="'+completed+'" style="display:block;width:100%;margin:10px 0"></progress>'+
  (snapshot.items||[]).filter(x=>x.status==='error').map(x=>'<div class="da6-error">'+safe(x.file_name)+': '+safe(x.error)+'</div>').join('');
}
async function refreshStatus(){
 if(!active||!headingOK()||!currentBatch)return;
 const requestedBatch=currentBatch,requestSeq=++statusSeq;
 const r=await bridge().api('inventory_label_batch_status',{batch_id:requestedBatch});
 if(!active||!headingOK()||currentBatch!==requestedBatch||requestSeq!==statusSeq)return;
 const el=$('#da6-batch-details');if(!el)return;
 // Não destruir digitação em andamento por causa do polling automático.
 if(el.contains(document.activeElement)&&document.activeElement?.matches?.('[data-da6-quantity],[data-da6-note]'))return;
 const openReviews=new Set([...el.querySelectorAll('details.da6-review[open]')]
  .map(node=>node.dataset.da6ReviewPhoto));
 const shownHistory=new Map([...el.querySelectorAll('details.da6-review')].map(details=>[
  details.dataset.da6ReviewPhoto,details.querySelector('.da6-review-history')?.innerHTML||''
 ]));
 const cs=r.counts||{},done=(cs.complete||0)+(cs.needs_review||0)+(cs.failed||0);
 const balances=(r.photos||[]).flatMap(x=>Array.isArray(x.review_counts)?x.review_counts:[]);
 const approved=balances.filter(x=>x.status==='approved').length;
 const rejected=balances.filter(x=>x.status==='rejected').length;
 const pending=balances.filter(x=>x.status==='pending_review').length;
 const registered=(r.photos||[]).length;
 el.innerHTML='<div class="da6-batch-summary"><strong>Lote '+safe(currentBatch.slice(0,8))+'</strong><span>'+done+'/'+registered+' processadas</span></div>'+
  '<div class="da6-stat-grid">'+[
   ['Na fila',cs.queued||0],['Lendo',cs.processing||0],['Tentativa',cs.retry||0],
   ['Lidas',cs.complete||0],['Revisar',cs.needs_review||0],['Erro',cs.failed||0],
   ['Contagens pendentes',pending],['Aprovadas',approved],['Rejeitadas',rejected]
  ].map(x=>'<div><strong>'+x[1]+'</strong><small>'+x[0]+'</small></div>').join('')+'</div>'+
  '<div class="da6-file-list">'+(r.photos||[]).map(x=>'<div class="da6-file-row"><span>'+safe(x.file_name)+'</span><b>'+safe(names[x.status]||x.status)+' · '+x.attempts+'/3</b>'+
    (x.error_code?'<small>'+safe(x.error_code)+(x.error_detail?' — '+safe(x.error_detail):'')+'</small>':'')+
    (x.parsed?.readings?.length?'<small>'+x.parsed.readings.map(y=>'B'+safe(y.slot)+': '+safe(y.quantity)).join(' · ')+'</small>':'')+
    (window.DonaAntoniaLabelReview?.render(x)||'')+'</div>').join('')+'</div>';
 el.querySelectorAll('details.da6-review').forEach(details=>{
  if(openReviews.has(details.dataset.da6ReviewPhoto))details.open=true;
  const previous=shownHistory.get(details.dataset.da6ReviewPhoto);
  if(previous){
   const output=details.querySelector('.da6-review-history');
   if(output)output.innerHTML=previous;
  }
 });
 window.DonaAntoniaLabelReview?.bind(el,bridge(),refreshStatus);
}
async function loadBatches(){
 if(!active||!headingOK())return;
 const r=await bridge().api('inventory_label_batches');
 if(!active||!headingOK())return;
 const select=$('#da6-batch-select');if(!select)return;
 const batches=r.batches||[];
 select.innerHTML='<option value="">Selecione um lote</option>'+batches.map(x=>
  '<option value="'+safe(x.id)+'">'+safe(new Date(x.created_at).toLocaleString('pt-BR'))+' · '+safe(x.total_files)+' fotos</option>').join('');
 if(currentBatch&&!batches.find(x=>x.id===currentBatch))currentBatch=null;
 currentBatch=currentBatch||batches[0]?.id||null;
 select.value=currentBatch||'';
 await refreshStatus();
}
async function onSubmit(){
 if(busy)return;
 const fileInput=$('#da6-file-input'),files=fileInput?.files,btn=$('#da6-send');
 if(!root.DonaAntoniaLabelUpload){toast('Módulo de envio indisponível');return}
 try{
  root.DonaAntoniaLabelUpload.validate(files);
  busy=true;btn.disabled=true;btn.textContent='Enviando e confirmando cada fotografia…';
  const services={
   createBatch:body=>call('inventory_label_batch_create',{...body,operator:bridge().operator?.()||'Operação'}),
   reserve:body=>call('inventory_label_photo_reserve',body),
   confirm:body=>call('inventory_label_photo_confirm',body),
   upload:root.DonaAntoniaLabelUpload.uploadSigned,
   onProgress:renderProgress
  };
  const shouldResume=$('#da6-resume-batch')?.checked===true;
  const result=await root.DonaAntoniaLabelUpload.submit(files,services,{
   batch_id:shouldResume?currentBatch:null
  });
  currentBatch=result.batch_id;
  if(result.failed){
   const check=$('#da6-resume-batch');
   if(check)check.checked=true;
   toast(result.uploaded+' fotos recebidas, '+result.failed+
    ' com falha. Selecione as mesmas fotos e tente novamente com este lote.');
  }else{
   fileInput.value='';
   const check=$('#da6-resume-batch');if(check)check.checked=false;
   toast(result.uploaded+' fotos recebidas e confirmadas no Storage privado.');
  }
  await loadBatches();
 }catch(e){toast('Envio não concluído: '+String(e.message||e));}
 finally{busy=false;btn.disabled=false;btn.textContent='Enviar fotografias';}
}
function mount(){
 if(!headingOK())return;
 if(host())return;
 const content=$('#content'),header=$('#content .page-head');
 if(!header)return;
 const modes=document.createElement('div');modes.id='da6-balance-modes';modes.className='da6-modes';
 modes.innerHTML='<button type="button" class="secondary" data-da6-mode="scanner">Leitor / balanço</button><button type="button" class="secondary" data-da6-mode="photos">Etiquetas por foto</button>';
 header.after(modes);
 const panel=document.createElement('section');panel.id='da6-photo-panel';panel.className='panel da6-photo-panel';panel.hidden=true;
 panel.innerHTML='<div class="page-head"><div><h2>Balanço por fotos das etiquetas</h2><p>Selecione até 100 fotografias. O envio é uma a uma e a leitura ocorrerá no servidor. Não usa inteligência artificial.</p></div></div>'+
  '<label class="da6-upload-drop"><strong>Selecionar fotos das etiquetas</strong><span>JPEG, PNG ou WebP · até 10 MB cada</span><input type="file" id="da6-file-input" accept="image/jpeg,image/png,image/webp" multiple></label>'+
  '<label class="da6-resume-toggle"><input type="checkbox" id="da6-resume-batch"> Retomar o lote selecionado, sem criar outro</label>'+
  '<button type="button" class="primary" id="da6-send">Enviar fotografias</button>'+
  '<p class="sub">Feche o navegador apenas depois de todas as fotos serem confirmadas como recebidas. A leitura no servidor não altera estoque automaticamente.</p>'+
  '<div id="da6-upload-progress" aria-live="polite"></div><hr>'+
  '<div class="da6-batch-actions"><h3>Acompanhar processamento</h3><select id="da6-batch-select"><option value="">Nenhum lote</option></select><button type="button" class="secondary" id="da6-refresh">Atualizar</button></div>'+
  '<div id="da6-batch-details" aria-live="polite"></div>';
 modes.after(panel);
 modes.querySelectorAll('[data-da6-mode]').forEach(btn=>btn.onclick=()=>setMode(btn.dataset.da6Mode==='photos'));
 $('#da6-send').onclick=onSubmit;
 $('#da6-refresh').onclick=()=>loadBatches().catch(e=>toast(e.message));
 $('#da6-batch-select').onchange=e=>{statusSeq++;currentBatch=e.target.value||null;refreshStatus().catch(e=>toast(e.message))};
 $('#da6-resume-batch').onchange=e=>{
  if(e.target.checked&&!currentBatch){
   e.target.checked=false;toast('Primeiro selecione um lote existente.');
  }
 };
 setMode(active);
}
let raf=0;new MutationObserver(()=>{
 if(raf)return;raf=requestAnimationFrame(()=>{raf=0;if(headingOK())mount();else active=false});
}).observe(document.body,{childList:true,subtree:true});
pollTimer=setInterval(()=>{if(active&&headingOK()&&currentBatch&&!busy)refreshStatus().catch(()=>{})},15000);
mount();
})(window);
