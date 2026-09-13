import {CONFIG} from '../admin-v3/config.js';
import {validatePhotoFile,buildWhatsAppUrl,buildShareText,buildRunCardModel} from './app-core.mjs';

const $=id=>document.getElementById(id);
const ANALYZE_FUNCTION='ame-mais-analyze-v1';
const LOGO_URL='./assets/logo-ame-store.jpg';
const IMAGE_KINDS=[['hero','Foto 1 · Principal'],['lifestyle','Foto 2 · Em uso'],['detail','Foto 3 · Detalhe']];
const PROCESS_STAGES=[
  ['preparing_photo','Preparando foto','Otimizando a foto para envio.',4],
  ['saving_original','Salvando original','Guardando a foto original no Supabase.',9],
  ['analyzing_product','Analisando produto','A IA está identificando o produto e as características visíveis.',16],
  ['creating_name','Criando nome','Organizando as 5 características em um nome fácil de pesquisar.',22],
  ['creating_catalog_description','Criando descrição de cadastro','Montando a descrição para pesquisa interna.',28],
  ['creating_storefront_description','Criando descrição comercial','Escrevendo a descrição da vitrine com foco em venda.',34],
  ['choosing_scene_profile','Escolhendo perfil visual','Definindo as 3 cenas mais adequadas para este tipo de produto.',39],
  ['generating_hero','Gerando foto 1','Criando a primeira foto ultrarrealista.',46],
  ['validating_hero','Validando foto 1','Comparando a foto 1 com o produto original.',51],
  ['saving_hero','Salvando foto 1','Salvando a primeira foto no Supabase.',56],
  ['generating_lifestyle','Gerando foto 2','Criando a segunda cena comercial.',62],
  ['validating_lifestyle','Validando foto 2','Conferindo identidade, forma e cores.',67],
  ['saving_lifestyle','Salvando foto 2','Salvando a segunda foto no Supabase.',72],
  ['generating_detail','Gerando foto 3','Criando o close-up ou detalhe comercial.',78],
  ['validating_detail','Validando foto 3','Conferindo fidelidade dos detalhes.',84],
  ['saving_detail','Salvando foto 3','Salvando a terceira foto no Supabase.',90],
  ['building_card','Montando card','Montando a simulação completa do produto.',96],
  ['completed','Concluído','Criação completa e salva no Supabase.',100],
];
const STAGE_INDEX=Object.fromEntries(PROCESS_STAGES.map((s,i)=>[s[0],i]));
const state={file:null,analysis:null,images:{},sessionId:null,busy:false,statusTimer:null,activeKind:'hero',model:null};

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s||'produto').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'produto';
const toast=(message,type='')=>{const el=document.createElement('div');el.className=`toast ${type}`.trim();el.textContent=message;$('toastRegion').append(el);setTimeout(()=>el.remove(),3800)};

function renderTimeline(){
  $('processingTimeline').innerHTML=PROCESS_STAGES.map(([key,label],i)=>`<div class="process-step" data-step="${key}"><span class="process-dot">${i+1}</span><span>${escapeHtml(label)}</span></div>`).join('');
}
function setStage(key,overrideText=''){
  const idx=STAGE_INDEX[key]??0,[,label,detail,pct]=PROCESS_STAGES[idx];
  $('progressCard').classList.remove('hidden');$('progressTitle').textContent=label;$('progressText').textContent=overrideText||detail;$('progressBar').style.width=`${pct}%`;$('progressPercent').textContent=`${pct}%`;
  document.querySelectorAll('.process-step').forEach((el,i)=>{el.classList.toggle('done',i<idx);el.classList.toggle('current',i===idx);const dot=el.querySelector('.process-dot');if(dot)dot.textContent=i<idx?'✓':String(i+1)});
}
function showProcessError(message){$('progressCard').classList.remove('hidden');$('progressTitle').textContent='Erro no processamento';$('progressText').textContent=message;$('progressPercent').textContent='!';}
function setBusy(on){state.busy=on;$('analyzeButton').disabled=on||!state.file;document.body.classList.toggle('is-busy',on)}

function friendly(code){return({
  image_required:'Foto obrigatória.',image_type_not_allowed:'Formato da foto não suportado.',image_size_invalid:'A foto está muito grande ou inválida.',processing_failed:'A IA não conseguiu concluir esta etapa.',image_fidelity_rejected:'A imagem foi bloqueada porque não ficou fiel ao produto.',rate_limited:'Muitas solicitações em pouco tempo. Aguarde e tente novamente.',run_not_found:'Criação não encontrada.',run_not_ready:'A foto ainda está sendo preparada.',invalid_session_id:'Identificador da criação inválido.',origin_not_allowed:'Este endereço não está autorizado.',server_config:'Configuração do servidor indisponível.',invalid_kind:'Tipo de imagem inválido.'
}[code]||code||'Não foi possível concluir.')}
async function apiForm(form){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),140000);
  try{
    const r=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${ANALYZE_FUNCTION}`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey},body:form,cache:'no-store',signal:controller.signal});
    const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw Object.assign(new Error(d.detail||friendly(d.error)),{code:d.error||'request_failed',payload:d,status:r.status});return d;
  }catch(e){if(e?.name==='AbortError')throw new Error('A etapa demorou mais que o esperado. Tente novamente.');throw e}finally{clearTimeout(timer)}
}

async function statusOnce(){
  if(!state.sessionId)return;
  const form=new FormData();form.append('action','status');form.append('session_id',state.sessionId);
  try{const d=await apiForm(form);if(d.run?.step)setStage(d.run.step);if(d.run?.status==='error'&&d.run?.error_message)showProcessError(d.run.error_message)}catch(e){if(e.status!==404&&e.code!=='run_not_found')console.debug('ame-mais status',e.message)}
}
function startStatusPoll(){stopStatusPoll();state.statusTimer=setInterval(statusOnce,1200)}
function stopStatusPoll(){if(state.statusTimer){clearInterval(state.statusTimer);state.statusTimer=null}}

async function compressPhoto(file){
  const bitmap=await createImageBitmap(file);const maxSide=2200,scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
  const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Falha ao preparar a foto.')),'image/jpeg',.9));return new File([blob],'produto.jpg',{type:'image/jpeg'});
}
async function chooseFile(file){
  const valid=validatePhotoFile(file);if(!valid.ok){toast(valid.error,'error');return}
  try{state.file=await compressPhoto(file)}catch{state.file=file}
  $('photoPreview').src=URL.createObjectURL(state.file);$('photoStage').classList.add('has-photo');$('analyzeButton').disabled=false;$('mainMessage').textContent='';
}

function currentAnalysis(){
  const base=state.analysis||{};
  return {...base,
    nome_cadastro:$('productName').value.trim(),tipo_produto:$('fieldType').value.trim(),devocao_tema:$('fieldDevotion').value.trim(),material_modelo:$('fieldMaterial').value.trim(),cor_acabamento:$('fieldColor').value.trim(),diferencial_tamanho:$('fieldDetail').value.trim(),descricao_cadastro:$('catalogDescription').value.trim(),descricao_vitrine:$('storefrontDescription').value.trim()
  };
}
function renderAnalysis(a,model){
  state.analysis=a||{};state.model=model||state.model;
  $('productName').value=a?.nome_cadastro||'';$('fieldType').value=a?.tipo_produto||'';$('fieldDevotion').value=a?.devocao_tema||'';$('fieldMaterial').value=a?.material_modelo||'';$('fieldColor').value=a?.cor_acabamento||'';$('fieldDetail').value=a?.diferencial_tamanho||'';$('catalogDescription').value=a?.descricao_cadastro||'';$('storefrontDescription').value=a?.descricao_vitrine||'';
  const pct=Math.round(Number(a?.confianca_geral||0)*100);$('confidenceBadge').textContent=`${pct}% · ${String(model||'').includes('terra')?'revisão avançada':'análise rápida'}`;
  $('searchTerms').innerHTML=(a?.termos_busca||[]).map(x=>`<span class="term">${escapeHtml(x)}</span>`).join('');
  $('reviewWarning').classList.toggle('hidden',!a?.precisa_revisao);$('reviewWarning').textContent=a?.precisa_revisao?`Revisar: ${a.motivo_revisao||'a IA sinalizou baixa confiança.'}`:'';
  const conflicts=a?.conflitos||[];$('conflictBox').classList.toggle('hidden',!conflicts.length);$('conflictBox').innerHTML=conflicts.length?`<strong>Conflitos / incertezas</strong><ul>${conflicts.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:'';
  $('resultArea').classList.remove('hidden');renderImageStatus();renderStorefrontCard();
}

function normalizeImage(item,kind){if(!item)return {kind,status:'pending'};return {kind,title:item.title||'',url:item.url||item.image_url||'',status:item.status||(item.url||item.image_url?'completed':'pending'),validation:item.validation||{},model:item.model||'',quality:item.quality||'',size:item.size||''}}
function renderImageStatus(){
  $('imageGrid').innerHTML=IMAGE_KINDS.map(([kind,title])=>{
    const img=normalizeImage(state.images[kind],kind);const pct=img.validation?.fidelity_score!=null?Math.round(Number(img.validation.fidelity_score)*100):null;
    const preview=img.url?`<img src="${escapeHtml(img.url)}" alt="${escapeHtml(title)}">`:`<span>${img.status==='rejected'?'Reprovada':'Aguardando'}</span>`;
    const actions=img.url?`<button class="download-button" data-download-url="${escapeHtml(img.url)}" data-download-kind="${kind}" type="button">Baixar</button><button class="retry-button" data-retry-kind="${kind}" type="button">Refazer</button>`:`<button class="retry-button" data-retry-kind="${kind}" type="button">${img.status==='rejected'?'Repetir':'Gerar'}</button>`;
    return `<article class="image-card"><div class="image-card-row"><div class="image-card-preview">${preview}</div><div class="image-card-info"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(img.status||'pending')}${pct!==null?` · fidelidade ${pct}%`:''}</span></div><div class="image-actions">${actions}</div></div></article>`;
  }).join('');
}
function cardRun(){return {id:state.sessionId,analysis:currentAnalysis(),images:state.images,conflicts:state.analysis?.conflitos||[],observations:state.analysis?.observacoes||[]}}
function renderStorefrontCard(){
  if(!state.analysis)return;
  const card=buildRunCardModel(cardRun(),LOGO_URL);let active=card.gallery.find(x=>x.kind===state.activeKind&&x.url)||card.gallery.find(x=>x.url)||card.gallery[0];if(active?.kind)state.activeKind=active.kind;
  $('storefrontCardName').textContent=card.name||'Produto';$('storefrontCardDescription').textContent=card.storefrontDescription||'Descrição comercial da vitrine.';$('storefrontCatalogDescription').textContent=card.catalogDescription||'';$('runReference').textContent=card.runId?`Criação: ${card.runId}`:'';
  const attrs=Object.values(card.attributes||{}).filter(Boolean);$('storefrontAttributes').innerHTML=attrs.map(x=>`<span class="attribute-chip">${escapeHtml(x)}</span>`).join('');
  $('storefrontSearchTerms').innerHTML=card.searchTerms.length?`<strong>Busca:</strong>${card.searchTerms.map(x=>`<span class="detail-chip">${escapeHtml(x)}</span>`).join('')}`:'';
  $('storefrontConflicts').innerHTML=card.conflicts.length?`<strong>Revisar:</strong>${card.conflicts.map(x=>`<span class="detail-chip">${escapeHtml(x)}</span>`).join('')}`:'';
  if(active?.url){$('storefrontMainImage').src=active.url;$('storefrontMainImage').classList.remove('hidden');$('mainImagePlaceholder').classList.add('hidden');$('downloadActive').disabled=false;$('downloadActive').dataset.url=active.url;$('downloadActive').dataset.kind=active.kind}else{$('storefrontMainImage').classList.add('hidden');$('mainImagePlaceholder').classList.remove('hidden');$('downloadActive').disabled=true;delete $('downloadActive').dataset.url}
  $('storefrontThumbs').innerHTML=card.gallery.map(x=>`<button type="button" class="storefront-thumb ${x.kind===state.activeKind?'active':''}" data-thumb-kind="${x.kind}">${x.url?`<img src="${escapeHtml(x.url)}" alt="${escapeHtml(x.title)}">`:`<span class="thumb-empty">${escapeHtml(x.title)}<br>${escapeHtml(x.status)}</span>`}</button>`).join('');
}

async function generateImage(kind){const form=new FormData();form.append('action','generate_image');form.append('kind',kind);form.append('session_id',state.sessionId);form.append('analysis_json',JSON.stringify(currentAnalysis()));return apiForm(form)}
async function analyze(){
  if(!state.file||state.busy)return;setBusy(true);state.sessionId=crypto.randomUUID();state.images={};state.analysis=null;state.activeKind='hero';$('resultArea').classList.add('hidden');renderTimeline();setStage('preparing_photo');startStatusPoll();
  try{
    const form=new FormData();form.append('action','analyze');form.append('session_id',state.sessionId);form.append('image',state.file,'produto.jpg');const d=await apiForm(form);renderAnalysis(d.analysis,d.model);
    for(const [kind] of IMAGE_KINDS){setStage(`generating_${kind}`);try{const image=await generateImage(kind);state.images[kind]=normalizeImage(image,kind)}catch(e){state.images[kind]={kind,status:e.code==='image_fidelity_rejected'?'rejected':'error',error:e.message,validation:e.payload?.validation||{}};toast(`${IMAGE_KINDS.find(x=>x[0]===kind)?.[1]}: ${e.message}`,'error')}renderImageStatus();renderStorefrontCard()}
    const ok=IMAGE_KINDS.every(([k])=>state.images[k]?.url);if(ok){setStage('completed');toast('Produto completo e salvo no Supabase.','ok');history.replaceState({},'',`${location.pathname}?run=${state.sessionId}`)}else{toast('Textos salvos. Uma ou mais fotos precisam ser refeitas.','error')}
  }catch(e){showProcessError(e.message||'Falha ao analisar.');toast(e.message||'Falha ao analisar.','error')}finally{stopStatusPoll();setBusy(false)}
}

async function downloadImage(url,kind){
  if(!url)return;try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('download');const b=await r.blob();const objectUrl=URL.createObjectURL(b);const a=document.createElement('a');a.href=objectUrl;a.download=`${slug(currentAnalysis().nome_cadastro)}-${kind}.webp`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1500)}catch{window.open(url,'_blank','noopener')}
}
async function shareWhatsApp(){
  const analysis=currentAnalysis(),text=buildShareText(analysis),urls=IMAGE_KINDS.map(([k])=>state.images[k]?.url).filter(Boolean);
  if(navigator.share&&urls.length){try{const files=[];for(const [i,url] of urls.entries()){const r=await fetch(url);if(!r.ok)throw new Error('download');const b=await r.blob();files.push(new File([b],`ame-mais-${i+1}.webp`,{type:b.type||'image/webp'}))}if(!navigator.canShare||navigator.canShare({files})){await navigator.share({title:analysis.nome_cadastro,text,files});return}}catch(e){if(e?.name==='AbortError')return}}
  window.open(buildWhatsAppUrl([text,urls.length?`Imagens:\n${urls.join('\n')}`:''].filter(Boolean).join('\n\n')),'_blank','noopener');
}
function reset(){stopStatusPoll();state.file=null;state.analysis=null;state.images={};state.sessionId=null;state.activeKind='hero';$('photoPreview').removeAttribute('src');$('photoStage').classList.remove('has-photo');$('analyzeButton').disabled=true;$('resultArea').classList.add('hidden');$('progressCard').classList.add('hidden');$('mainMessage').textContent='';history.replaceState({},'',location.pathname);window.scrollTo({top:0,behavior:'smooth'})}

async function loadSavedRun(runId){
  if(!/^[0-9a-f-]{36}$/i.test(runId||''))return;
  state.sessionId=runId;setBusy(true);renderTimeline();setStage('building_card','Abrindo criação salva…');
  try{
    const form=new FormData();form.append('action','get_run');form.append('session_id',runId);const d=await apiForm(form);state.analysis=d.run?.analysis||{};state.model=d.run?.model_analysis||'';state.images={};for(const row of d.image_rows||[])state.images[row.kind]=normalizeImage(row,row.kind);renderAnalysis(state.analysis,state.model);$('progressCard').classList.add('hidden');toast('Criação carregada.','ok')
  }catch(e){showProcessError(e.message);toast(e.message,'error')}finally{setBusy(false)}
}

$('cameraInput').addEventListener('change',e=>chooseFile(e.target.files?.[0]));$('galleryInput').addEventListener('change',e=>chooseFile(e.target.files?.[0]));$('analyzeButton').addEventListener('click',analyze);
$('copyName').addEventListener('click',async()=>{await navigator.clipboard.writeText($('productName').value);toast('Nome copiado.','ok')});$('copyStorefront').addEventListener('click',async()=>{await navigator.clipboard.writeText($('storefrontDescription').value);toast('Descrição copiada.','ok')});
$('shareWhatsApp').addEventListener('click',shareWhatsApp);$('newProduct').addEventListener('click',reset);
$('copyRunLink').addEventListener('click',async()=>{if(!state.sessionId)return toast('Crie ou abra um produto primeiro.','error');const url=`${location.origin}${location.pathname}?run=${state.sessionId}`;await navigator.clipboard.writeText(url);toast('Link da criação copiado.','ok')});
$('downloadActive').addEventListener('click',()=>downloadImage($('downloadActive').dataset.url,$('downloadActive').dataset.kind||state.activeKind));
['productName','fieldType','fieldDevotion','fieldMaterial','fieldColor','fieldDetail','catalogDescription','storefrontDescription'].forEach(id=>$(id).addEventListener('input',renderStorefrontCard));
$('storefrontThumbs').addEventListener('click',e=>{const b=e.target.closest('[data-thumb-kind]');if(!b)return;state.activeKind=b.dataset.thumbKind;renderStorefrontCard()});
$('imageGrid').addEventListener('click',async e=>{const retry=e.target.closest('[data-retry-kind]'),download=e.target.closest('[data-download-url]');if(download){await downloadImage(download.dataset.downloadUrl,download.dataset.downloadKind);return}if(!retry||state.busy||!state.sessionId)return;const kind=retry.dataset.retryKind;setBusy(true);startStatusPoll();try{setStage(`generating_${kind}`);const d=await generateImage(kind);state.images[kind]=normalizeImage(d,kind);renderImageStatus();renderStorefrontCard();toast('Imagem refeita e salva.','ok')}catch(err){state.images[kind]={kind,status:err.code==='image_fidelity_rejected'?'rejected':'error',error:err.message,validation:err.payload?.validation||{}};renderImageStatus();renderStorefrontCard();toast(err.message,'error')}finally{stopStatusPoll();setBusy(false)}});

renderTimeline();const runId=new URLSearchParams(location.search).get('run');if(runId)loadSavedRun(runId);
