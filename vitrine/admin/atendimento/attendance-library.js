import {optimizeLibraryImage} from './attendance-library-image.js';
import {attendanceJsonApi} from './attendance-auth.js';

const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-ops-v1';
const TOKEN_KEY='da_finance_access_token_v1';
const ORIGINAL_MAX_BYTES=50*1024*1024;
const MAX_LIBRARY_SELECTION=10;
const SECURITY_STOP_ERRORS=new Set([
  'service_window_closed','human_send_not_homologated','meta_canary_destination_blocked',
  'media_provider_unavailable','meta_transport_not_configured','meta_send_uncertain','destination_fields_not_allowed',
  'invalid_conversation_id','conversation_changed'
]);
const MIME_LIMITS=new Map([
  ['image/jpeg',5*1024*1024],['image/png',5*1024*1024],
  ['video/mp4',16*1024*1024],['video/3gpp',16*1024*1024],
  ['audio/aac',16*1024*1024],['audio/amr',16*1024*1024],['audio/mpeg',16*1024*1024],['audio/mp4',16*1024*1024],['audio/ogg',16*1024*1024],
  ['application/pdf',25*1024*1024],['text/plain',25*1024*1024],['application/msword',25*1024*1024],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',25*1024*1024],
  ['application/vnd.ms-excel',25*1024*1024],['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',25*1024*1024],
  ['application/vnd.ms-powerpoint',25*1024*1024],['application/vnd.openxmlformats-officedocument.presentationml.presentation',25*1024*1024],
]);
const EXT_MIME=new Map([
  ['jpg','image/jpeg'],['jpeg','image/jpeg'],['png','image/png'],['mp4','video/mp4'],['3gp','video/3gpp'],
  ['aac','audio/aac'],['amr','audio/amr'],['mp3','audio/mpeg'],['m4a','audio/mp4'],['ogg','audio/ogg'],
  ['pdf','application/pdf'],['txt','text/plain'],['doc','application/msword'],['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['xls','application/vnd.ms-excel'],['xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['ppt','application/vnd.ms-powerpoint'],['pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
]);

const state={
  open:false,query:'',kind:'all',items:[],selected:new Set(),previews:new Map(),loading:false,uploading:false,searchTimer:null,
  sending:false,failedItems:new Set(),batchId:'',conversationId:''
};
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const prettyBytes=value=>{const n=Number(value||0);if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(0)} KB`;return `${(n/(1024*1024)).toFixed(n>=10*1024*1024?0:1)} MB`};
const baseTitle=name=>(String(name||'Arquivo').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim()||'Arquivo').slice(0,120);
const makeId=prefix=>`${prefix}-${Date.now()}-${globalThis.crypto?.randomUUID?.()||Math.random().toString(16).slice(2)}`.replace(/[^A-Za-z0-9._:-]/g,'').slice(0,120);

async function api(action,params={},method='GET'){return await attendanceJsonApi(action,params,method)}

function canonicalMime(file){
  const ext=String(file?.name||'').toLowerCase().split('.').pop()||'';
  const byExt=EXT_MIME.get(ext)||'';
  const raw=String(file?.type||'').toLowerCase().split(';')[0].trim();
  if(ext==='m4a')return 'audio/mp4';
  return MIME_LIMITS.has(raw)?raw:byExt;
}
function mediaKind(mime){if(mime.startsWith('image/'))return 'image';if(mime.startsWith('video/'))return 'video';if(mime.startsWith('audio/'))return 'audio';if(MIME_LIMITS.has(mime))return 'document';return null}
function iconFor(kind){return kind==='image'?'🖼️':kind==='video'?'🎬':kind==='audio'?'🎧':'📄'}
function uploadId(){return globalThis.crypto?.randomUUID?.()||`upload-${Date.now()}-${Math.random().toString(16).slice(2)}`}
function activeConversationId(){return String(document.querySelector('.queue-card.selected')?.dataset.conversationId||'').trim()}
function serviceWindowOpen(){return $('#serviceWindow')?.classList.contains('open')===true}

function setStatus(text,tone='neutral'){
  const node=$('#libraryStatus');if(!node)return;node.textContent=text;node.dataset.tone=tone;
}
function deliveryReset(){state.failedItems.clear();state.batchId=''}
function syncConversationContext(){
  const conversationId=activeConversationId();
  if(state.conversationId&&state.conversationId!==conversationId){clearSelection();deliveryReset()}
  state.conversationId=conversationId;
  syncFooter();
}
function syncFooter(){
  const count=state.selected.size,status=$('#librarySelectionStatus'),clear=$('#libraryClearSelectionBtn'),send=$('#librarySendBtn');
  const conversationId=activeConversationId(),windowOpen=serviceWindowOpen(),retryCount=state.failedItems.size;
  if(status){
    status.querySelector('strong').textContent=count?`${count} selecionado${count===1?'':'s'}`:'Nenhum item selecionado';
    status.querySelector('small').textContent=!conversationId?'Selecione uma conversa para enviar.':!windowOpen?'Janela de atendimento encerrada. Mídia livre não pode ser enviada.':retryCount?'Somente os itens com falha serão reenviados.':count?'Pronto para enviar na conversa ativa.':'Toque nos cards para selecionar.';
  }
  if(clear)clear.disabled=state.sending||count===0;
  if(send){
    send.textContent=retryCount?`Tentar novamente ${retryCount}`:`Enviar ${count}`;
    send.disabled=state.sending||count===0||!conversationId||!windowOpen;
    send.title=!conversationId?'Selecione uma conversa.':!windowOpen?'Janela de atendimento encerrada. Mídia livre não pode ser enviada.':'';
  }
}
function clearSelection(){state.selected.clear();document.querySelectorAll('.library-card.selected').forEach(card=>{card.classList.remove('selected');card.querySelector('.library-card-select')?.setAttribute('aria-pressed','false')});syncFooter()}

function openDrawer(){state.open=true;syncConversationContext();$('#attendanceLibraryOverlay').hidden=false;const drawer=$('#attendanceLibraryDrawer');drawer.hidden=false;drawer.setAttribute('aria-hidden','false');$('#librarySearch')?.focus();loadLibrary().catch(error=>renderError(error))}
function closeDrawer(){state.open=false;$('#attendanceLibraryOverlay').hidden=true;const drawer=$('#attendanceLibraryDrawer');drawer.hidden=true;drawer.setAttribute('aria-hidden','true')}
function renderError(error){setStatus('Não foi possível carregar a Biblioteca.','error');const grid=$('#libraryGrid');if(grid)grid.innerHTML=`<div class="library-state error">${esc(messageFor(error))}</div>`}
function messageFor(error){
  const code=String(error?.message||error||'');
  const map={
    admin_session_required:'Sessão do Admin necessária.',library_mime_invalid:'Formato não permitido.',library_original_size_invalid:'Arquivo original inválido.',
    library_stored_size_invalid:'Arquivo final inválido.',library_storage_mime_mismatch:'O tipo armazenado não confere.',library_thumbnail_missing:'O thumbnail da imagem não foi encontrado.',
    library_signed_upload_failed:'Não foi possível preparar o upload.',library_thumbnail_signed_upload_failed:'Não foi possível preparar o thumbnail.',
    service_window_closed:'Janela de atendimento encerrada. Mídia livre não pode ser enviada.',human_send_not_homologated:'Envio humano temporariamente bloqueado para esta conversa.',
    meta_canary_destination_blocked:'Destino bloqueado pelo canário de segurança.',meta_send_uncertain:'A Meta não confirmou o envio. A fila foi interrompida para evitar duplicidade.',
    rate_limited:'Limite temporário de envio atingido. Tente novamente.',conversation_changed:'A conversa mudou durante o envio. A fila foi interrompida.'
  };
  return map[code]||'Tente novamente.';
}

async function loadLibrary(){
  if(state.loading)return;state.loading=true;setStatus('Carregando…');
  const grid=$('#libraryGrid');if(grid)grid.innerHTML='<div class="library-state">Carregando itens…</div>';
  try{
    const data=await api('library_list',{q:state.query,kind:state.kind==='all'?'':state.kind,limit:60});
    state.items=data.items||[];
    const valid=new Set(state.items.map(item=>item.id));for(const id of [...state.selected])if(!valid.has(id)){state.selected.delete(id);state.failedItems.delete(id)}
    renderItems();setStatus(`${state.items.length} item${state.items.length===1?'':'s'} na Biblioteca.`,'success');syncFooter();
  }finally{state.loading=false}
}

function toggleItemSelection(item,card,select){
  if(state.sending)return;
  const selected=state.selected.has(item.id);
  if(!selected&&state.selected.size>=MAX_LIBRARY_SELECTION){setStatus(`Selecione no máximo ${MAX_LIBRARY_SELECTION} itens por envio.`,'warning');return}
  if(state.failedItems.size)deliveryReset();
  selected?state.selected.delete(item.id):state.selected.add(item.id);
  card.classList.toggle('selected',state.selected.has(item.id));select.setAttribute('aria-pressed',String(state.selected.has(item.id)));syncFooter();
}
function itemCard(item){
  const card=document.createElement('article');card.className='library-card';card.dataset.itemId=item.id;if(state.selected.has(item.id))card.classList.add('selected');
  const select=document.createElement('button');select.type='button';select.className='library-card-select';select.setAttribute('aria-pressed',String(state.selected.has(item.id)));
  const thumb=document.createElement('div');thumb.className='library-thumb';thumb.textContent=iconFor(item.media_kind);thumb.dataset.previewFor=item.id;
  const info=document.createElement('div');info.className='library-card-info';
  const title=document.createElement('strong');title.textContent=item.title||item.original_filename||'Arquivo';
  const meta=document.createElement('small');meta.textContent=`${item.category||labelKind(item.media_kind)} · ${prettyBytes(item.stored_size_bytes)}`;
  const tags=document.createElement('div');tags.className='library-card-tags';for(const tag of item.tags||[]){const chip=document.createElement('span');chip.textContent=tag;tags.append(chip)}
  info.append(title,meta,tags);select.append(thumb,info);select.onclick=()=>toggleItemSelection(item,card,select);
  const mark=document.createElement('span');mark.className='library-selected-mark';mark.textContent='✓';
  const actions=document.createElement('div');actions.className='library-card-actions';
  const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.onclick=event=>{event.stopPropagation();editItem(item).catch(error=>setStatus(messageFor(error),'error'))};
  const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='Remover';remove.onclick=event=>{event.stopPropagation();removeItem(item).catch(error=>setStatus(messageFor(error),'error'))};
  actions.append(edit,remove);card.append(select,mark,actions);
  if(item.media_kind==='image')resolvePreview(item,thumb).catch(()=>{});
  return card;
}
function labelKind(kind){return kind==='image'?'Imagem':kind==='video'?'Vídeo':kind==='audio'?'Áudio':'Arquivo'}
function renderItems(){const grid=$('#libraryGrid');if(!grid)return;grid.replaceChildren();if(!state.items.length){grid.innerHTML='<div class="library-state">Nenhum item neste filtro.</div>';return}for(const item of state.items)grid.append(itemCard(item))}
async function resolvePreview(item,container){
  let url=state.previews.get(item.id);if(!url){const data=await api('library_preview',{item_id:item.id});url=data.preview_url;state.previews.set(item.id,url)}
  if(!container.isConnected||!url)return;const image=document.createElement('img');image.src=url;image.alt=item.title||'Imagem da Biblioteca';image.loading='lazy';container.replaceChildren(image);
}

function uploadRow(id,name){const row=document.createElement('div');row.className='library-upload-row';row.dataset.uploadId=id;const title=document.createElement('strong');title.textContent=name;const status=document.createElement('span');status.textContent='aguardando';row.append(title,status);$('#libraryUploadQueue')?.append(row);return row}
function uploadStage(row,text,tone='neutral'){if(!row)return;row.dataset.tone=tone;const status=row.querySelector('span');if(status)status.textContent=text}
async function putSigned(target,file){
  if(!target?.signed_url)throw new Error('library_signed_upload_failed');
  const response=await fetch(target.signed_url,{method:'PUT',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});
  if(!response.ok)throw new Error(`library_storage_upload_${response.status}`);
}

async function prepareAsset(file,row){
  const mime=canonicalMime(file),kind=mediaKind(mime);if(!kind||!mime)throw new Error('library_mime_invalid');
  if(file.size<1||file.size>ORIGINAL_MAX_BYTES)throw new Error('library_original_size_invalid');
  if(kind!=='image'&&file.size>(MIME_LIMITS.get(mime)||0))throw new Error('library_original_size_invalid');
  if(kind==='image'){
    uploadStage(row,'compactando');
    const optimized=await optimizeLibraryImage(new File([file],file.name,{type:mime,lastModified:file.lastModified}));
    return {kind,mime:optimized.mimeType,asset:optimized.file,thumbnail:optimized.thumbnail,width:optimized.width,height:optimized.height,originalSize:optimized.originalBytes};
  }
  const asset=file.type===mime?file:new File([file],file.name,{type:mime,lastModified:file.lastModified});
  return {kind,mime,asset,thumbnail:null,width:null,height:null,originalSize:file.size};
}
async function uploadOne(file){
  const id=uploadId(),row=uploadRow(id,file.name);
  try{
    const prepared=await prepareAsset(file,row);
    uploadStage(row,'solicitando upload');
    const reserved=await api('library_upload_prepare',{
      title:baseTitle(file.name),media_kind:prepared.kind,mime_type:prepared.mime,original_filename:file.name,
      original_size_bytes:prepared.originalSize,category:null,tags:[]
    },'POST');
    uploadStage(row,'enviando Storage');
    await putSigned(reserved.upload,prepared.asset);
    if(prepared.kind==='image'){
      if(!reserved.thumbnail_upload||!prepared.thumbnail)throw new Error('library_thumbnail_signed_upload_failed');
      await putSigned(reserved.thumbnail_upload,prepared.thumbnail);
    }
    uploadStage(row,'confirmando');
    await api('library_upload_complete',{
      item_id:reserved.item_id,stored_size_bytes:prepared.asset.size,width:prepared.width,height:prepared.height,duration_seconds:null
    },'POST');
    uploadStage(row,'concluído','success');
    return true;
  }catch(error){uploadStage(row,`erro · ${messageFor(error)}`,'error');return false}
}
async function uploadFiles(files){
  if(state.uploading)return;const list=[...files];if(!list.length)return;state.uploading=true;$('#libraryAddBtn').disabled=true;setStatus(`Preparando ${list.length} arquivo${list.length===1?'':'s'}…`);
  let ok=0;try{for(const file of list)if(await uploadOne(file))ok++;await loadLibrary();setStatus(`${ok} de ${list.length} upload${list.length===1?'':'s'} concluído${ok===1?'':'s'}.`,ok===list.length?'success':'warning')}finally{state.uploading=false;$('#libraryAddBtn').disabled=false;$('#libraryFileInput').value=''}
}

function idempotencyKey(batchId,itemId){return `lib:${batchId}:${itemId}`.slice(0,120)}
function selectedItems(){const wanted=state.failedItems.size?state.failedItems:state.selected;return state.items.filter(item=>wanted.has(item.id)).slice(0,MAX_LIBRARY_SELECTION)}
function markFailedSelection(failedItems){state.failedItems=new Set(failedItems.map(item=>item.id));state.selected=new Set(state.failedItems);renderItems();syncFooter()}
function securityFailure(error){return SECURITY_STOP_ERRORS.has(String(error?.message||''))}
async function sendQueue(items,{retry=false}={}){
  if(state.sending||!items.length)return;
  const conversationId=activeConversationId();
  if(!conversationId){setStatus('Selecione uma conversa antes de enviar.','error');syncFooter();return}
  if(!serviceWindowOpen()){setStatus('Janela de atendimento encerrada. Mídia livre não pode ser enviada.','error');syncFooter();return}
  if(state.conversationId&&state.conversationId!==conversationId){clearSelection();deliveryReset();state.conversationId=conversationId;setStatus('A conversa mudou. Selecione novamente os itens.','warning');return}
  state.conversationId=conversationId;
  if(!retry||!state.batchId)state.batchId=makeId('library');
  const batchId=state.batchId;
  const failedItems=[];let sent=0;
  state.sending=true;syncFooter();
  try{
    for(const [index,item] of items.entries()){
      if(activeConversationId()!==conversationId){
        failedItems.push(...items.slice(index));setStatus(messageFor(new Error('conversation_changed')),'error');break;
      }
      if(!serviceWindowOpen()){
        failedItems.push(...items.slice(index));setStatus('Janela de atendimento encerrada. Mídia livre não pode ser enviada.','error');break;
      }
      setStatus(`Enviando ${index+1} de ${items.length} · ${item.title||item.original_filename||'arquivo'}…`);
      const idempotencyKeyValue=idempotencyKey(batchId,item.id);
      try{
        await api('library_send',{conversation_id:conversationId,item_id:item.id,idempotency_key:idempotencyKeyValue,caption:''},'POST');
        sent++;
      }catch(error){
        failedItems.push(item);
        if(securityFailure(error)){failedItems.push(...items.slice(index+1));setStatus(messageFor(error),'error');break}
      }
    }
  }finally{
    state.sending=false;
  }
  const failedCount=failedItems.length;
  if(failedCount){
    markFailedSelection(failedItems);
    const summary=sent===1?`1 enviado · ${failedCount} falhou`:`${sent} enviados · ${failedCount} falhou`;
    setStatus(`${summary}. Use “Tentar novamente” para reenviar somente as falhas.`,'warning');
  }else{
    state.failedItems.clear();clearSelection();state.batchId='';setStatus(`${sent} enviado${sent===1?'':'s'} com sucesso.`,'success');
  }
  syncFooter();
}
async function sendSelected(){deliveryReset();await sendQueue(selectedItems(),{retry:false})}
async function retryFailed(){if(!state.failedItems.size)return;await sendQueue(selectedItems(),{retry:true})}

async function editItem(item){
  const title=prompt('Nome do item',item.title||'');if(title===null)return;const cleanTitle=title.trim();if(!cleanTitle){setStatus('Informe um nome para o item.','error');return}
  const category=prompt('Categoria (opcional)',item.category||'');if(category===null)return;
  const tagsText=prompt('Etiquetas separadas por vírgula',(item.tags||[]).join(', '));if(tagsText===null)return;
  const tags=[...new Set(tagsText.split(',').map(tag=>tag.trim().toLowerCase()).filter(Boolean))].slice(0,20);
  await api('library_update',{item_id:item.id,title:cleanTitle,category:category.trim()||null,tags,sort_order:Number(item.sort_order||0)},'POST');
  state.previews.delete(item.id);await loadLibrary();setStatus('Item atualizado.','success');
}
async function removeItem(item){
  if(!confirm(`Remover “${item.title||item.original_filename||'este item'}” da Biblioteca?`))return;
  await api('library_deactivate',{item_id:item.id},'POST');state.selected.delete(item.id);state.failedItems.delete(item.id);state.previews.delete(item.id);await loadLibrary();setStatus('Item removido.','success');
}

function bindConversationObserver(){
  const queue=$('#queueList');if(!queue)return;
  const observer=new MutationObserver(()=>syncConversationContext());
  observer.observe(queue,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
}
function bind(){
  $('#libraryBtn')?.addEventListener('click',openDrawer);$('#libraryCloseBtn')?.addEventListener('click',closeDrawer);$('#attendanceLibraryOverlay')?.addEventListener('click',closeDrawer);
  $('#libraryAddBtn')?.addEventListener('click',()=>$('#libraryFileInput')?.click());$('#libraryFileInput')?.addEventListener('change',event=>uploadFiles(event.target.files).catch(error=>setStatus(messageFor(error),'error')));
  $('#libraryClearSelectionBtn')?.addEventListener('click',()=>{clearSelection();deliveryReset()});
  $('#librarySendBtn')?.addEventListener('click',()=>{const action=state.failedItems.size?retryFailed():sendSelected();action.catch(error=>{setStatus(messageFor(error),'error');state.sending=false;syncFooter()})});
  $('#librarySearch')?.addEventListener('input',event=>{state.query=event.target.value.trim();clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>loadLibrary().catch(renderError),250)});
  document.querySelectorAll('[data-library-kind]').forEach(button=>button.addEventListener('click',()=>{state.kind=button.dataset.libraryKind||'all';document.querySelectorAll('[data-library-kind]').forEach(item=>item.classList.toggle('active',item===button));loadLibrary().catch(renderError)}));
  document.addEventListener('attendance:conversation-refreshed',()=>syncFooter());
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.open)closeDrawer()});bindConversationObserver();syncConversationContext();syncFooter();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
