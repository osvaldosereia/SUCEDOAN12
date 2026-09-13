import {CONFIG} from '../admin-v3/config.js';
import {validatePhotoFile,buildWhatsAppUrl,buildShareText} from './app-core.mjs';
const $=id=>document.getElementById(id),AUTH_KEY='da_admin_v3_auth',ANALYZE_FUNCTION='ame-mais-analyze-v1';
const state={file:null,analysis:null,images:{},sessionId:null,busy:false};
const IMAGE_KINDS=[['principal','Principal · fundo cinza'],['ambientada','E-commerce · produto'],['detalhe','E-commerce · detalhe']];

const toast=(message,type='')=>{const el=document.createElement('div');el.className=`toast ${type}`.trim();el.textContent=message;$('toastRegion').append(el);setTimeout(()=>el.remove(),3600)};
const saveSession=s=>localStorage.setItem(AUTH_KEY,JSON.stringify(s));
const getSession=()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}};
const clearSession=()=>localStorage.removeItem(AUTH_KEY);
function decodeExp(token){try{return Number(JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp||0)}catch{return 0}}
async function refreshSession(){const s=getSession();if(!s?.refresh_token)throw new Error('Sessão expirada. Entre novamente.');const r=await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error('Sessão expirada. Entre novamente.');const next={...s,...d};saveSession(next);return next}
async function session(){let s=getSession();if(!s?.access_token)return null;if(decodeExp(s.access_token)*1000<Date.now()+60000)s=await refreshSession();return s}

async function unlock(pin){
  const a=await fetch(`${CONFIG.supabaseUrl}/functions/v1/admin-pin-auth-v1`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({pin}),cache:'no-store'});const issued=await a.json().catch(()=>({}));
  if(!a.ok||!issued?.token_hash)throw new Error(issued?.retry_after_seconds?'Muitas tentativas. Aguarde alguns minutos.':'PIN inválido.');
  const v=await fetch(`${CONFIG.supabaseUrl}/auth/v1/verify`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({type:issued.verification_type||'magiclink',token_hash:issued.token_hash}),cache:'no-store'});const s=await v.json().catch(()=>({}));
  if(!v.ok||!s?.access_token)throw new Error('Não consegui iniciar a sessão.');saveSession(s);return s;
}

async function compressPhoto(file){
  const bitmap=await createImageBitmap(file);const maxSide=2200,scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
  const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Falha ao preparar a foto.')),'image/jpeg',.92));return new File([blob],'produto.jpg',{type:'image/jpeg'});
}

async function apiForm(form,retry=true){
  let s=await session();if(!s)throw new Error('Entre novamente com o PIN.');
  const r=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${ANALYZE_FUNCTION}`,{method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,Authorization:`Bearer ${s.access_token}`},body:form,cache:'no-store'});const d=await r.json().catch(()=>({}));
  if(r.status===401&&retry&&s.refresh_token){await refreshSession();return apiForm(form,false)}
  if(!r.ok||d.ok===false)throw Object.assign(new Error(d.detail||friendly(d.error)),{code:d.error||'request_failed',payload:d});return d;
}
function friendly(code){return({image_required:'Foto obrigatória.',image_type_not_allowed:'Formato da foto não suportado.',image_size_invalid:'A foto está muito grande ou inválida.',admin_forbidden:'Este acesso não tem permissão administrativa.',processing_failed:'A IA não conseguiu concluir esta etapa.',image_fidelity_rejected:'A imagem foi bloqueada porque não ficou fiel ao produto.'}[code]||code||'Não foi possível concluir.')}

function setProgress(percent,title,text){$('progressCard').classList.remove('hidden');$('progressBar').style.width=`${Math.max(6,Math.min(100,percent))}%`;$('progressTitle').textContent=title;$('progressText').textContent=text||''}
function setBusy(on){state.busy=on;$('analyzeButton').disabled=on||!state.file;document.body.classList.toggle('is-busy',on)}

async function chooseFile(file){
  const valid=validatePhotoFile(file);if(!valid.ok){toast(valid.error,'error');return}
  try{state.file=await compressPhoto(file)}catch{state.file=file}
  const url=URL.createObjectURL(state.file);$('photoPreview').src=url;$('photoStage').classList.add('has-photo');$('analyzeButton').disabled=false;$('mainMessage').textContent='';
}

function renderAnalysis(a,model){
  state.analysis=a;$('productName').value=a.nome_cadastro||'';$('fieldType').value=a.tipo_produto||'';$('fieldDevotion').value=a.devocao_tema||'';$('fieldMaterial').value=a.material_modelo||'';$('fieldColor').value=a.cor_acabamento||'';$('fieldDetail').value=a.diferencial_tamanho||'';$('catalogDescription').value=a.descricao_cadastro||'';$('storefrontDescription').value=a.descricao_vitrine||'';
  const pct=Math.round(Number(a.confianca_geral||0)*100);$('confidenceBadge').textContent=`${pct}% · ${model.includes('terra')?'revisão avançada':'análise rápida'}`;
  $('searchTerms').innerHTML=(a.termos_busca||[]).map(x=>`<span class="term">${escapeHtml(x)}</span>`).join('');
  $('reviewWarning').classList.toggle('hidden',!a.precisa_revisao);$('reviewWarning').textContent=a.precisa_revisao?`Revisar: ${a.motivo_revisao||'a IA sinalizou baixa confiança.'}`:'';
  $('resultArea').classList.remove('hidden');
}
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function currentAnalysis(){return {...state.analysis,nome_cadastro:$('productName').value.trim(),tipo_produto:$('fieldType').value.trim(),devocao_tema:$('fieldDevotion').value.trim(),material_modelo:$('fieldMaterial').value.trim(),cor_acabamento:$('fieldColor').value.trim(),diferencial_tamanho:$('fieldDetail').value.trim(),descricao_cadastro:$('catalogDescription').value.trim(),descricao_vitrine:$('storefrontDescription').value.trim()}}
function imageCard(kind,title){return `<article class="image-card" id="image-${kind}"><div class="image-box"><div class="image-loading"><div class="spinner"></div><span>Gerando ${escapeHtml(title)}…</span></div></div><div class="image-meta"><div><strong>${escapeHtml(title)}</strong><br><span>Aguardando</span></div></div></article>`}
function renderImagePlaceholders(){$('imageGrid').innerHTML=IMAGE_KINDS.map(([k,t])=>imageCard(k,t)).join('')}
function updateImageCard(kind,data,error){const card=$(`image-${kind}`);if(!card)return;const title=IMAGE_KINDS.find(x=>x[0]===kind)?.[1]||kind;if(data){const pct=Math.round(Number(data.validation?.fidelity_score||0)*100);card.querySelector('.image-box').innerHTML=`<img src="${escapeHtml(data.url)}" alt="${escapeHtml(title)}" loading="lazy">`;card.querySelector('.image-meta').innerHTML=`<div><strong>${escapeHtml(title)}</strong><br><span>Fidelidade ${pct}%</span></div><a class="retry-button" href="${escapeHtml(data.url)}" target="_blank" rel="noopener">Ver</a>`}else{card.querySelector('.image-box').innerHTML=`<div class="image-loading"><strong>Não gerada</strong><span>${escapeHtml(error||'Falha na geração')}</span></div>`;card.querySelector('.image-meta').innerHTML=`<div><strong>${escapeHtml(title)}</strong><br><span>Tente novamente</span></div><button class="retry-button" type="button" data-retry-kind="${kind}">Repetir</button>`}}

async function analyze(){
  if(!state.file||state.busy)return;setBusy(true);state.sessionId=crypto.randomUUID();state.images={};$('resultArea').classList.add('hidden');setProgress(12,'Analisando a foto…','Identificando tipo, devoção, material, acabamento e diferenciais.');
  try{
    const form=new FormData();form.append('action','analyze');form.append('image',state.file,'produto.jpg');const d=await apiForm(form);renderAnalysis(d.analysis,d.model);renderImagePlaceholders();setProgress(30,'Cadastro criado','Agora vamos gerar as três imagens da vitrine.');
    for(let i=0;i<IMAGE_KINDS.length;i++){const [kind,title]=IMAGE_KINDS[i];setProgress(38+i*20,`Gerando imagem ${i+1} de 3`,title);try{const image=await generateImage(kind);state.images[kind]=image;updateImageCard(kind,image)}catch(e){updateImageCard(kind,null,e.message)}}
    setProgress(100,'Concluído','Nome, descrições e imagens estão prontos.');setTimeout(()=>$('progressCard').classList.add('hidden'),900);toast('Produto preparado.','ok');
  }catch(e){$('progressCard').classList.add('hidden');toast(e.message||'Falha ao analisar.','error')}finally{setBusy(false)}
}
async function generateImage(kind){const form=new FormData();form.append('action','generate_image');form.append('kind',kind);form.append('session_id',state.sessionId||crypto.randomUUID());form.append('analysis_json',JSON.stringify(currentAnalysis()));form.append('image',state.file,'produto.jpg');return apiForm(form)}

async function shareWhatsApp(){
  const analysis=currentAnalysis(),text=buildShareText(analysis),urls=Object.values(state.images).map(x=>x?.url).filter(Boolean);
  if(navigator.share&&urls.length){try{const files=[];for(const [i,url] of urls.entries()){const r=await fetch(url);if(!r.ok)throw new Error('download');const b=await r.blob();files.push(new File([b],`ame-mais-${i+1}.webp`,{type:b.type||'image/webp'}))}if(!navigator.canShare||navigator.canShare({files})){await navigator.share({title:analysis.nome_cadastro,text,files});return}}catch(e){if(e?.name==='AbortError')return}}
  const withLinks=[text,urls.length?'Imagens:\n'+urls.join('\n'):''].filter(Boolean).join('\n\n');window.open(buildWhatsAppUrl(withLinks),'_blank','noopener');
}
function reset(){state.file=null;state.analysis=null;state.images={};state.sessionId=null;$('photoPreview').removeAttribute('src');$('photoStage').classList.remove('has-photo');$('analyzeButton').disabled=true;$('resultArea').classList.add('hidden');$('progressCard').classList.add('hidden');$('mainMessage').textContent='';window.scrollTo({top:0,behavior:'smooth'})}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const pin=$('pinInput').value.replace(/\D/g,'').slice(0,6);if(pin.length!==6){$('loginMessage').textContent='Digite os 6 números.';$('loginMessage').className='message error';return}try{await unlock(pin);$('pinInput').value='';$('loginCard').classList.add('hidden');$('appArea').classList.remove('hidden')}catch(err){$('loginMessage').textContent=err.message;$('loginMessage').className='message error'}});
$('logoutButton').addEventListener('click',()=>{clearSession();reset();$('appArea').classList.add('hidden');$('loginCard').classList.remove('hidden')});
$('cameraInput').addEventListener('change',e=>chooseFile(e.target.files?.[0]));$('galleryInput').addEventListener('change',e=>chooseFile(e.target.files?.[0]));$('analyzeButton').addEventListener('click',analyze);
$('copyName').addEventListener('click',async()=>{await navigator.clipboard.writeText($('productName').value);toast('Nome copiado.','ok')});$('copyStorefront').addEventListener('click',async()=>{await navigator.clipboard.writeText($('storefrontDescription').value);toast('Descrição copiada.','ok')});
$('shareWhatsApp').addEventListener('click',shareWhatsApp);$('newProduct').addEventListener('click',reset);
$('imageGrid').addEventListener('click',async e=>{const b=e.target.closest('[data-retry-kind]');if(!b||state.busy)return;const kind=b.dataset.retryKind;setBusy(true);try{updateImageCard(kind,null,'Gerando novamente…');const d=await generateImage(kind);state.images[kind]=d;updateImageCard(kind,d);toast('Imagem refeita.','ok')}catch(err){updateImageCard(kind,null,err.message)}finally{setBusy(false)}});

(async()=>{try{const s=await session();if(s){$('loginCard').classList.add('hidden');$('appArea').classList.remove('hidden')}}catch{clearSession()}})();
