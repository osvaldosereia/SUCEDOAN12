import {CONFIG} from '../admin-v3/config.js';

const $=id=>document.getElementById(id);
const FN='ame-mais-analyze-v2';
const MAX_PHOTOS=3;
const KINDS=[['hero','Foto 1 · Principal'],['lifestyle','Foto 2 · Em uso'],['detail','Foto 3 · Detalhe'],['alternate','Foto 4 · Outro ângulo']];
const HISTORY_KEY='ameMais2RecentRuns';
const state={files:[],sessionId:null,analysis:null,images:{},busy:false};
const toast=(m,t='')=>{const e=document.createElement('div');e.className=`toast ${t}`.trim();e.textContent=m;$('toastRegion').append(e);setTimeout(()=>e.remove(),3400)};
const cleanEan=v=>String(v||'').replace(/\D/g,'').slice(0,14);

async function apiForm(form){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),150000);
  try{const r=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${FN}`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey},body:form,cache:'no-store',signal:c.signal});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.detail||d.error||'Falha no processamento.');return d}finally{clearTimeout(timer)}
}

async function compressPhoto(file){
  const bitmap=await createImageBitmap(file),max=1800,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
  const blob=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Falha ao preparar foto')),'image/jpeg',.86));return new File([blob],file.name||'produto.jpg',{type:'image/jpeg'});
}

async function addFiles(list){
  const incoming=Array.from(list||[]).slice(0,MAX_PHOTOS-state.files.length);
  for(const f of incoming){if(!/^image\/(jpeg|png|webp)$/.test(f.type)){toast('Use JPG, PNG ou WebP.','error');continue}try{state.files.push(await compressPhoto(f))}catch{state.files.push(f)}}
  renderPhotos();
}
function renderPhotos(){
  $('photoCount').textContent=`${state.files.length}/3`;$('analyzeButton').disabled=state.busy||state.files.length===0;
  $('photoPreviews').innerHTML=state.files.length?state.files.map((f,i)=>`<div class="photo-preview"><img src="${URL.createObjectURL(f)}" alt="Foto ${i+1}"><button type="button" data-remove="${i}" aria-label="Remover">×</button></div>`).join(''):'<div class="empty-slot">Nenhuma foto selecionada</div>';
}
function setBusy(on){state.busy=on;$('analyzeButton').disabled=on||state.files.length===0}
function progress(title,text,pct){$('progressCard').classList.remove('hidden');$('progressTitle').textContent=title;$('progressText').textContent=text;$('progressPercent').textContent=`${pct}%`;$('progressBar').style.width=`${pct}%`}
function currentAnalysis(){return {...(state.analysis||{}),nome_cadastro:$('productName').value.trim(),descricao_cadastro:$('catalogDescription').value.trim(),descricao_vitrine:$('storefrontDescription').value.trim(),ean:cleanEan($('eanInput').value)}}
function renderResult(){
  const a=state.analysis||{};$('productName').value=a.nome_cadastro||'';$('catalogDescription').value=a.descricao_cadastro||'';$('storefrontDescription').value=a.descricao_vitrine||'';$('resultMeta').textContent=[a.tipo_produto,a.ean?`EAN ${a.ean}`:'EAN não informado'].filter(Boolean).join(' · ');$('resultArea').classList.remove('hidden');renderImages();
}
function renderImages(){
  $('imageGrid').innerHTML=KINDS.map(([k,title])=>{const i=state.images[k]||{};return `<article class="output-card"><div class="output-card-media">${i.url?`<img src="${i.url}" alt="${title}">`:'Aguardando'}</div><div class="output-card-copy"><strong>${title}</strong><span>${i.url?'Concluída':'Pendente'}</span></div><button type="button" data-retry="${k}" ${state.busy?'disabled':''}>${i.url?'Refazer':'Gerar'}</button></article>`}).join('');
}

async function generate(kind){const form=new FormData();form.append('action','generate_image');form.append('session_id',state.sessionId);form.append('kind',kind);form.append('analysis_json',JSON.stringify(currentAnalysis()));return apiForm(form)}
async function analyze(){
  if(!state.files.length||state.busy)return;setBusy(true);state.sessionId=crypto.randomUUID();state.images={};state.analysis=null;$('resultArea').classList.add('hidden');
  try{
    progress('Analisando produto','Usando até 3 fotos em uma única análise.',12);const form=new FormData();form.append('action','analyze');form.append('session_id',state.sessionId);form.append('ean',cleanEan($('eanInput').value));state.files.forEach((f,i)=>form.append(`image${i+1}`,f,`produto-${i+1}.jpg`));const d=await apiForm(form);state.analysis=d.analysis||{};renderResult();
    for(let idx=0;idx<KINDS.length;idx++){const [kind]=KINDS[idx];progress(`Gerando foto ${idx+1}`,`Criando imagem ${idx+1} de 4 em low.`,25+idx*18);const g=await generate(kind);state.images[kind]=g;renderImages()}
    progress('Concluído','Produto salvo com 4 imagens.',100);rememberRun(state.sessionId);await renderHistory();toast('Criação concluída.','ok');history.replaceState({},'',`${location.pathname}?run=${state.sessionId}`);
  }catch(e){$('mainMessage').textContent=e.message;toast(e.message,'error')}finally{setBusy(false);renderImages()}
}

function getHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return []}}
function rememberRun(id){const ids=[id,...getHistory().filter(x=>x!==id)].slice(0,3);localStorage.setItem(HISTORY_KEY,JSON.stringify(ids))}
async function fetchRun(id){const f=new FormData();f.append('action','get_run');f.append('session_id',id);return apiForm(f)}
async function renderHistory(){
  const ids=getHistory();if(!ids.length){$('recentCreations').innerHTML='<p class="hint">Nenhuma criação salva neste aparelho.</p>';return}
  const cards=[];for(const id of ids){try{const d=await fetchRun(id),a=d.run?.analysis||{},hero=(d.image_rows||[]).find(x=>x.kind==='hero')?.image_url||'';cards.push(`<a class="recent-card" href="${location.pathname}?run=${id}"><div class="recent-card-media">${hero?`<img src="${hero}" alt="">`:'Sem foto'}</div><div class="recent-card-copy"><strong>${a.nome_cadastro||'Produto'}</strong><span>${a.ean?`EAN ${a.ean}`:'Sem EAN'}</span><span>Abrir criação</span></div></a>`)}catch{}}
  $('recentCreations').innerHTML=cards.join('')||'<p class="hint">Nenhuma criação disponível.</p>';
}
async function loadRun(id){
  try{setBusy(true);progress('Abrindo criação','Carregando resultado salvo.',50);const d=await fetchRun(id);state.sessionId=id;state.analysis=d.run?.analysis||{};state.images={};for(const row of d.image_rows||[])state.images[row.kind]={url:row.image_url,title:row.title};$('eanInput').value=state.analysis.ean||'';renderResult();$('progressCard').classList.add('hidden');rememberRun(id);await renderHistory()}catch(e){toast(e.message,'error')}finally{setBusy(false)}
}

async function scanEan(file){
  if(!file)return;try{if(!('BarcodeDetector' in window))throw new Error('Leitura automática não disponível neste aparelho. Digite o EAN.');const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});const bitmap=await createImageBitmap(file);const codes=await detector.detect(bitmap);bitmap.close();const value=cleanEan(codes?.[0]?.rawValue||'');if(!value)throw new Error('Código não encontrado. Aproxime a câmera e tente novamente.');$('eanInput').value=value;$('eanMessage').textContent=`EAN lido: ${value}`;toast('EAN lido.','ok')}catch(e){$('eanMessage').textContent=e.message;toast(e.message,'error')}
}
function reset(){state.files=[];state.sessionId=null;state.analysis=null;state.images={};$('eanInput').value='';$('eanMessage').textContent='';$('resultArea').classList.add('hidden');$('progressCard').classList.add('hidden');$('mainMessage').textContent='';renderPhotos();history.replaceState({},'',location.pathname);window.scrollTo({top:0,behavior:'smooth'})}

$('cameraInput').addEventListener('change',e=>addFiles(e.target.files));$('photoInput').addEventListener('change',e=>addFiles(e.target.files));$('photoPreviews').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;state.files.splice(Number(b.dataset.remove),1);renderPhotos()});$('eanInput').addEventListener('input',e=>{e.target.value=cleanEan(e.target.value)});$('scanEanInput').addEventListener('change',e=>scanEan(e.target.files?.[0]));$('analyzeButton').addEventListener('click',analyze);$('newProduct').addEventListener('click',reset);$('imageGrid').addEventListener('click',async e=>{const b=e.target.closest('[data-retry]');if(!b||state.busy||!state.sessionId)return;const kind=b.dataset.retry;setBusy(true);try{progress('Refazendo imagem','Gerando novamente apenas esta imagem.',70);state.images[kind]=await generate(kind);renderImages();toast('Imagem refeita.','ok')}catch(err){toast(err.message,'error')}finally{setBusy(false);renderImages()}});

renderPhotos();renderHistory();const runId=new URLSearchParams(location.search).get('run');if(runId)loadRun(runId);
