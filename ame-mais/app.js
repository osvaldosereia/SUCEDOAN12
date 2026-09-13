import {CONFIG} from '../admin-v3/config.js';
import {validatePhotoFile,buildWhatsAppUrl,buildShareText,buildProductCardModel} from './app-core.mjs';

const $=id=>document.getElementById(id),ANALYZE_FUNCTION='ame-mais-analyze-v1';
const state={file:null,analysis:null,images:{},sessionId:null,busy:false,statusTimer:null,activeKind:null};
const IMAGE_KINDS=[['principal','Principal · fundo cinza'],['ambientada','E-commerce · produto'],['detalhe','E-commerce · detalhe']];
const PROCESS_STAGES=[
  ['preparing_photo','Preparando foto','Otimizando a foto e salvando o original no Supabase.',6],
  ['analyzing_product','Analisando produto','A IA está identificando o tipo e as características visíveis.',16],
  ['creating_name','Criando nome','Organizando as 5 características em um nome fácil de pesquisar.',24],
  ['creating_catalog_description','Criando descrição de cadastro','Montando um texto objetivo para pesquisa interna.',31],
  ['creating_storefront_description','Criando descrição comercial','Escrevendo a versão da vitrine com foco em venda.',38],
  ['generating_principal','Gerando foto principal','Criando a foto quadrada LOW com fundo cinza claro.',47],
  ['validating_principal','Validando fidelidade','Comparando a foto principal com o produto original.',55],
  ['saving_principal','Salvando no Supabase','Salvando a foto principal na pasta desta criação.',60],
  ['generating_ambientada','Gerando imagem comercial 1','Criando o produto em um card de e-commerce.',67],
  ['validating_ambientada','Validando imagem comercial 1','Confirmando que o produto continua fiel ao original.',73],
  ['saving_ambientada','Salvando no Supabase','Salvando a primeira imagem comercial.',78],
  ['generating_detalhe','Gerando imagem comercial 2','Destacando um detalhe real do produto.',85],
  ['validating_detalhe','Validando imagem comercial 2','Conferindo identidade, cor, forma e detalhe.',91],
  ['saving_detalhe','Salvando no Supabase','Salvando a segunda imagem comercial e o resultado final.',96],
  ['completed','Concluído','Tudo foi salvo no Supabase e está pronto para usar.',100],
];
const STAGE_INDEX=Object.fromEntries(PROCESS_STAGES.map((s,i)=>[s[0],i]));

const toast=(message,type='')=>{const el=document.createElement('div');el.className=`toast ${type}`.trim();el.textContent=message;$('toastRegion').append(el);setTimeout(()=>el.remove(),3600)};
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s||'produto').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'produto';

function renderTimeline(){
  $('processingTimeline').innerHTML=PROCESS_STAGES.map(([key,label],i)=>`<div class="process-step" data-step="${key}"><span class="process-dot">${i+1}</span><span>${escapeHtml(label)}</span></div>`).join('');
}
function setStage(key,overrideText=''){
  let resolved=key;
  if(key==='saving_supabase'&&state.activeKind)resolved=`saving_${state.activeKind}`;
  const idx=STAGE_INDEX[resolved]??0,[,label,detail,pct]=PROCESS_STAGES[idx];
  $('progressCard').classList.remove('hidden');$('progressTitle').textContent=label;$('progressText').textContent=overrideText||detail;$('progressBar').style.width=`${pct}%`;$('progressPercent').textContent=`${pct}%`;
  document.querySelectorAll('.process-step').forEach((el,i)=>{el.classList.toggle('done',i<idx);el.classList.toggle('current',i===idx);const dot=el.querySelector('.process-dot');if(dot)dot.textContent=i<idx?'✓':String(i+1)});
}
function setBusy(on){state.busy=on;$('analyzeButton').disabled=on||!state.file;document.body.classList.toggle('is-busy',on)}

async function apiForm(form){
  const r=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${ANALYZE_FUNCTION}`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey},body:form,cache:'no-store'});const d=await r.json().catch(()=>({}));
  if(!r.ok||d.ok===false)throw Object.assign(new Error(d.detail||friendly(d.error)),{code:d.error||'request_failed',payload:d,status:r.status});return d;
}
function friendly(code){return({image_required:'Foto obrigatória.',image_type_not_allowed:'Formato da foto não suportado.',image_size_invalid:'A foto está muito grande ou inválida.',processing_failed:'A IA não conseguiu concluir esta etapa.',image_fidelity_rejected:'A imagem foi bloqueada porque não ficou fiel ao produto.',rate_limited:'Muitas solicitações em pouco tempo. Aguarde e tente novamente.',run_not_found:'A criação ainda está sendo iniciada.',run_not_ready:'A foto ainda está sendo preparada.',invalid_session_id:'Não consegui iniciar esta criação.'}[code]||code||'Não foi possível concluir.')}

async function statusOnce(){
  if(!state.sessionId)return;
  const form=new FormData();form.append('action','status');form.append('session_id',state.sessionId);
  try{const d=await apiForm(form);if(d.run?.step)setStage(d.run.step);if(d.run?.status==='error'&&d.run?.error_message)$('progressText').textContent=`Erro: ${d.run.error_message}`}catch(e){if(e.status!==404&&e.code!=='run_not_found')console.debug('ame-mais status',e.message)}
}
function startStatusPoll(){stopStatusPoll();state.statusTimer=setInterval(statusOnce,900)}
function stopStatusPoll(){if(state.statusTimer){clearInterval(state.statusTimer);state.statusTimer=null}}

async function compressPhoto(file){
  const bitmap=await createImageBitmap(file);const maxSide=2200,scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
  const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Falha ao preparar a foto.')),'image/jpeg',.90));return new File([blob],'produto.jpg',{type:'image/jpeg'});
}
async function chooseFile(file){
  const valid=validatePhotoFile(file);if(!valid.ok){toast(valid.error,'error');return}
  try{state.file=await compressPhoto(file)}catch{state.file=file}
  const url=URL.createObjectURL(state.file);$('photoPreview').src=url;$('photoStage').classList.add('has-photo');$('analyzeButton').disabled=false;$('mainMessage').textContent='';
}

function renderAnalysis(a,model){
  state.analysis=a;$('productName').value=a.nome_cadastro||'';$('fieldType').value=a.tipo_produto||'';$('fieldDevotion').value=a.devocao_tema||'';$('fieldMaterial').value=a.material_modelo||'';$('fieldColor').value=a.cor_acabamento||'';$('fieldDetail').value=a.diferencial_tamanho||'';$('catalogDescription').value=a.descricao_cadastro||'';$('storefrontDescription').value=a.descricao_vitrine||'';
  const pct=Math.round(Number(a.confianca_geral||0)*100);$('confidenceBadge').textContent=`${pct}% · ${String(model||'').includes('terra')?'revisão avançada':'análise rápida'}`;
  $('searchTerms').innerHTML=(a.termos_busca||[]).map(x=>`<span class="term">${escapeHtml(x)}</span>`).join('');
  $('reviewWarning').classList.toggle('hidden',!a.precisa_revisao);$('reviewWarning').textContent=a.precisa_revisao?`Revisar: ${a.motivo_revisao||'a IA sinalizou baixa confiança.'}`:'';
  $('resultArea').classList.remove('hidden');syncCards();
}
function currentAnalysis(){return {...state.analysis,nome_cadastro:$('productName').value.trim(),tipo_produto:$('fieldType').value.trim(),devocao_tema:$('fieldDevotion').value.trim(),material_modelo:$('fieldMaterial').value.trim(),cor_acabamento:$('fieldColor').value.trim(),diferencial_tamanho:$('fieldDetail').value.trim(),descricao_cadastro:$('catalogDescription').value.trim(),descricao_vitrine:$('storefrontDescription').value.trim()}}

function imageCard(kind,title){
  const card=buildProductCardModel(currentAnalysis(),{kind});
  return `<article class="image-card" id="image-${kind}"><div class="image-box"><div class="image-loading"><div class="spinner"></div><span>Gerando imagem quadrada LOW…</span></div></div><div class="store-card-body"><span class="store-card-badge">${escapeHtml(title)}</span><h3 class="store-card-name js-card-name">${escapeHtml(card.name||'Produto')}</h3><p class="store-card-desc js-card-desc">${escapeHtml(card.description||'Descrição comercial da vitrine.')}</p><button class="store-card-demo-button" type="button" disabled>Ver produto</button></div><div class="image-meta"><div><strong>Status</strong><br><span>Aguardando IA</span></div><div class="image-actions"></div></div></article>`;
}
function renderImagePlaceholders(){$('imageGrid').innerHTML=IMAGE_KINDS.map(([k,t])=>imageCard(k,t)).join('')}
function syncCards(){const a=currentAnalysis();document.querySelectorAll('.js-card-name').forEach(x=>x.textContent=a.nome_cadastro||'Produto');document.querySelectorAll('.js-card-desc').forEach(x=>x.textContent=a.descricao_vitrine||'Descrição comercial da vitrine.')}
function updateImageCard(kind,data,error){
  const card=$(`image-${kind}`);if(!card)return;const title=IMAGE_KINDS.find(x=>x[0]===kind)?.[1]||kind;if(data){const pct=Math.round(Number(data.validation?.fidelity_score||0)*100);card.querySelector('.image-box').innerHTML=`<img src="${escapeHtml(data.url)}" alt="${escapeHtml(title)}" loading="lazy">`;card.querySelector('.image-meta').innerHTML=`<div><strong>${escapeHtml(title)}</strong><br><span>LOW · 1024×1024 · fidelidade ${pct}%</span></div><div class="image-actions"><button class="download-button" type="button" data-download-url="${escapeHtml(data.url)}" data-download-kind="${kind}">Baixar</button><button class="retry-button" type="button" data-retry-kind="${kind}">Refazer</button></div>`}else{card.querySelector('.image-box').innerHTML=`<div class="image-loading"><strong>Não gerada</strong><span>${escapeHtml(error||'Falha na geração')}</span></div>`;card.querySelector('.image-meta').innerHTML=`<div><strong>${escapeHtml(title)}</strong><br><span>Tente novamente</span></div><div class="image-actions"><button class="retry-button" type="button" data-retry-kind="${kind}">Repetir</button></div>`}syncCards()
}

async function analyze(){
  if(!state.file||state.busy)return;setBusy(true);state.sessionId=crypto.randomUUID();state.images={};state.analysis=null;state.activeKind=null;$('resultArea').classList.add('hidden');renderTimeline();setStage('preparing_photo');startStatusPoll();
  try{
    const form=new FormData();form.append('action','analyze');form.append('session_id',state.sessionId);form.append('image',state.file,'produto.jpg');const d=await apiForm(form);renderAnalysis(d.analysis,d.model);renderImagePlaceholders();setStage('creating_storefront_description','Nome e descrições prontos. Iniciando as imagens da vitrine.');
    for(const [kind] of IMAGE_KINDS){state.activeKind=kind;setStage(`generating_${kind}`);try{const image=await generateImage(kind);state.images[kind]=image;updateImageCard(kind,image)}catch(e){updateImageCard(kind,null,e.message)}}
    state.activeKind=null;const ok=IMAGE_KINDS.every(([k])=>state.images[k]);if(ok){setStage('completed');toast('Produto preparado e salvo no Supabase.','ok')}else{toast('Textos salvos. Uma ou mais imagens precisam ser refeitas.','error')}
  }catch(e){toast(e.message||'Falha ao analisar.','error');$('progressText').textContent=e.message||'Falha ao analisar.'}finally{stopStatusPoll();setBusy(false)}
}
async function generateImage(kind){const form=new FormData();form.append('action','generate_image');form.append('kind',kind);form.append('session_id',state.sessionId);form.append('analysis_json',JSON.stringify(currentAnalysis()));return apiForm(form)}

async function downloadImage(url,kind){
  try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('download');const b=await r.blob();const objectUrl=URL.createObjectURL(b);const a=document.createElement('a');a.href=objectUrl;a.download=`${slug(currentAnalysis().nome_cadastro)}-${kind}.webp`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1500)}catch{window.open(url,'_blank','noopener')}
}
async function shareWhatsApp(){
  const analysis=currentAnalysis(),text=buildShareText(analysis),urls=Object.values(state.images).map(x=>x?.url).filter(Boolean);
  if(navigator.share&&urls.length){try{const files=[];for(const [i,url] of urls.entries()){const r=await fetch(url);if(!r.ok)throw new Error('download');const b=await r.blob();files.push(new File([b],`ame-mais-${i+1}.webp`,{type:b.type||'image/webp'}))}if(!navigator.canShare||navigator.canShare({files})){await navigator.share({title:analysis.nome_cadastro,text,files});return}}catch(e){if(e?.name==='AbortError')return}}
  const withLinks=[text,urls.length?'Imagens:\n'+urls.join('\n'):''].filter(Boolean).join('\n\n');window.open(buildWhatsAppUrl(withLinks),'_blank','noopener');
}
function reset(){stopStatusPoll();state.file=null;state.analysis=null;state.images={};state.sessionId=null;state.activeKind=null;$('photoPreview').removeAttribute('src');$('photoStage').classList.remove('has-photo');$('analyzeButton').disabled=true;$('resultArea').classList.add('hidden');$('progressCard').classList.add('hidden');$('mainMessage').textContent='';window.scrollTo({top:0,behavior:'smooth'})}

$('cameraInput').addEventListener('change',e=>chooseFile(e.target.files?.[0]));$('galleryInput').addEventListener('change',e=>chooseFile(e.target.files?.[0]));$('analyzeButton').addEventListener('click',analyze);
$('copyName').addEventListener('click',async()=>{await navigator.clipboard.writeText($('productName').value);toast('Nome copiado.','ok')});$('copyStorefront').addEventListener('click',async()=>{await navigator.clipboard.writeText($('storefrontDescription').value);toast('Descrição copiada.','ok')});
$('shareWhatsApp').addEventListener('click',shareWhatsApp);$('newProduct').addEventListener('click',reset);
['productName','storefrontDescription'].forEach(id=>$(id).addEventListener('input',syncCards));
$('imageGrid').addEventListener('click',async e=>{const retry=e.target.closest('[data-retry-kind]'),download=e.target.closest('[data-download-url]');if(download){await downloadImage(download.dataset.downloadUrl,download.dataset.downloadKind);return}if(!retry||state.busy)return;const kind=retry.dataset.retryKind;state.activeKind=kind;setBusy(true);startStatusPoll();try{setStage(`generating_${kind}`);const d=await generateImage(kind);state.images[kind]=d;updateImageCard(kind,d);toast('Imagem refeita e salva.','ok')}catch(err){updateImageCard(kind,null,err.message)}finally{state.activeKind=null;stopStatusPoll();setBusy(false)}});
renderTimeline();
