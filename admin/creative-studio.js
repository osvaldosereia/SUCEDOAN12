const cfg=window.DA_ADMIN_CONFIG||{};
const SUPABASE_URL=cfg.supabaseUrl,KEY=cfg.supabasePublishableKey;
const FN={director:'creative-storyboard-director',image:'creative-storyboard-image',projects:'creative-storyboard-projects'};
let selectedProducts=[],plan=null,project=null,frames=[],storyApproved=false,boardApproved=false,generationCount=0,visualBible=null,directorBusy=false,referenceFile=null,referenceUrl='';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageOf=p=>p?.image_url||p?.image_ai_url||'';
const mode=()=>$('productionMode').value;
const imageCountForDuration=d=>Number(d)/10+1;
const brief=()=>({
  duration_seconds:Number($('duration').value),
  audio_mode:$('audioMode').value,
  theme:$('theme').value.trim(),
  notes:$('notes').value.trim(),
  production_mode:mode(),
  skip_visual_generation:mode()!=='full',
  institutional_goal:$('institutionalGoal').value,
  reference_image:!!referenceFile
});

const ERROR_TEXT={
  generation_in_progress:'Esta imagem já está sendo gerada.',
  frame_in_review:'Esta imagem já está pronta e aguardando sua revisão.',
  frame_already_approved:'Esta imagem já foi aprovada.',
  previous_image_required:'Aprove a imagem anterior antes de continuar.',
  previous_frame_not_approved:'Aprove a imagem anterior antes de continuar.',
  visual_identity_required:'Aprove a identidade visual da primeira imagem.',
  admin_not_authorized:'Sem permissão para alterar o Estúdio.',
  generation_failed:'Não foi possível gerar a imagem agora. Tente novamente.',
  products_required:'Escolha um produto ou use o modo Institucional.',
  project_create:'Não foi possível salvar o projeto.'
};
const friendlyError=d=>ERROR_TEXT[d?.error]||d?.detail||d?.error||'Falha inesperada.';
const auth=()=>{try{return JSON.parse(localStorage.getItem('da_admin_auth')||'null')||{}}catch{return{}}};

async function refreshSession(){
  const a=auth(),r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:a.refresh_token})}),d=await r.json();
  if(!d.access_token)throw Error('Sessão expirada. Entre novamente no Admin.');
  localStorage.setItem('da_admin_auth',JSON.stringify(d));return d;
}
async function invoke(name,body,retry=true){
  let a=auth();if(!a.access_token&&a.refresh_token)a=await refreshSession();
  const r=await fetch(`${SUPABASE_URL}/functions/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${a.access_token}`},body:JSON.stringify(body),cache:'no-store'}),d=await r.json().catch(()=>({}));
  if(r.status===401&&retry){await refreshSession();return invoke(name,body,false)}
  if(!r.ok||d.ok===false){const e=new Error(friendlyError(d));e.code=d?.error;throw e}return d;
}
async function downloadAsset(url,name='imagem'){
  if(!url)return;
  try{const r=await fetch(url);if(!r.ok)throw Error();const blob=await r.blob(),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
  catch{const a=document.createElement('a');a.href=url;a.download=name;a.target='_blank';a.rel='noopener';a.click()}
}
async function copyText(text){
  if(!text)return false;
  try{await navigator.clipboard.writeText(text);return true}catch{return false}
}

function canCreate(){return mode()==='institutional'||selectedProducts.length>0}
function setDirectorBusy(v){
  directorBusy=v;
  for(const id of['reviseStory','reviseBoard','applyFrameSuggestion'])if($(id))$(id).disabled=v;
  $('createStory').disabled=v||!!project?.id||!canCreate();
}
function applyMode(){
  const m=mode();
  $('productArea').hidden=m==='institutional';
  $('institutionalArea').hidden=m!=='institutional';
  $('visualProductionPanel').hidden=m!=='full';
  updateCostPreview();renderSelected();renderPackages();
}
function updateCostPreview(){
  const n=imageCountForDuration($('duration').value);
  if(mode()==='full')$('costPreview').textContent=`Com imagens: ${n} imagens-chave para ${$('duration').value}s, geradas uma por vez após aprovação do plano visual.`;
  else if(mode()==='product_only')$('costPreview').textContent='Sem gerar imagens: usaremos a foto original do produto como referência nos prompts Gemini.';
  else $('costPreview').textContent='Institucional: produto não obrigatório; você pode enviar uma imagem de referência e não há geração de imagens por IA.';
}

function renderSelected(){
  const el=$('selectedProducts'),locked=!!project?.id;
  if(!selectedProducts.length){el.className='selected-products empty';el.textContent=mode()==='institutional'?'Produto opcional neste modo.':'Nenhum produto selecionado.'}
  else{
    el.className='selected-products';
    el.innerHTML=selectedProducts.map((p,i)=>`<div class="selected-chip"><img src="${esc(imageOf(p))}" alt=""><span><strong>${esc(p.name)}</strong><small>${esc(p.brand||'')}</small></span><div><button type="button" data-download-product="${i}">Baixar foto original</button><button type="button" data-remove="${i}" ${locked?'disabled':''}>Remover</button></div></div>`).join('');
    el.querySelectorAll('[data-download-product]').forEach(b=>b.onclick=()=>downloadAsset(imageOf(selectedProducts[+b.dataset.downloadProduct]),`produto-${selectedProducts[+b.dataset.downloadProduct].name||'original'}.webp`));
    if(!locked)el.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{selectedProducts.splice(+b.dataset.remove,1);renderSelected()});
  }
  $('productSearch').disabled=locked;$('productSearchButton').disabled=locked;$('createStory').disabled=directorBusy||locked||!canCreate();
}

async function searchProducts(){
  const q=$('productSearch').value.trim(),st=$('productSearchStatus'),btn=$('productSearchButton'),out=$('productResults');
  if(q.length<2){st.textContent='Digite pelo menos 2 caracteres para buscar.';return}
  btn.disabled=true;btn.textContent='Buscando…';st.textContent='Buscando produtos…';out.innerHTML='';
  try{
    const d=await invoke(FN.projects,{action:'search_products',q,limit:20}),rows=d.products||[];
    st.textContent=rows.length?`${rows.length} produto(s) encontrado(s). Escolha o que será usado no vídeo.`:'Nenhum produto encontrado.';
    out.innerHTML=rows.map((p,i)=>`<button class="studio-product" type="button" data-i="${i}"><img src="${esc(imageOf(p))}" alt=""><span><strong>${esc(p.name)}</strong><small>${esc(p.brand||'')}</small></span><b>Adicionar</b></button>`).join('');
    out.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const p=rows[+b.dataset.i];if(!selectedProducts.some(x=>x.id===p.id))selectedProducts.push(p);renderSelected();st.textContent='Produto adicionado. Você já pode criar a história.'});
  }catch(e){st.textContent=`Não foi possível buscar: ${e.message}`}
  finally{btn.disabled=!!project?.id;btn.textContent='Buscar'}
}

function renderPlan(){
  if(!plan)return;
  visualBible=plan.visual_bible||visualBible;
  $('creativePlan').className='studio-plan';
  $('creativePlan').innerHTML=`<span class="studio-badge">${esc(plan.craft_style||'direção criativa')}</span><h3>${esc(plan.title||plan.concept||'História')}</h3><p><strong>Gancho:</strong> ${esc(plan.hook||'')}</p><p>${esc(plan.story||'')}</p><p><strong>Áudio:</strong> ${esc(plan.audio_direction||plan.audio_mode||'IA decide')}</p><p><strong>Fechamento:</strong> ${esc(plan.payoff||plan.cta||'')}</p>`;
  $('storyActions').hidden=storyApproved;renderTimeline();renderCurrent();renderPackages();
}

function renderTimeline(){
  const el=$('storyboardTimeline');if(!plan){el.innerHTML='';return}
  el.innerHTML=(plan.keyframes||[]).map(k=>{
    const f=frames.find(x=>+x.second_mark===+k.second_mark)||k;
    const u=f.approved_image_url||f.candidate_image_url||'';
    const label=f.status==='approved'?'Aprovada':f.status==='review'?'Revisar':f.status==='generating'?'Gerando':f.status==='stale'?'Revisar novamente':mode()==='full'?'Planejada':'Referência textual';
    return `<article class="keyframe ${esc(f.status||'planned')}"><div class="keyframe-head"><strong>Imagem ${esc(f.image_index||'')} · ${k.second_mark}s</strong><span>${esc(label)}</span></div>${u?`<img src="${esc(u)}" alt="Imagem-chave ${esc(f.image_index||'')}"><div class="keyframe-actions"><button type="button" data-download-frame="${k.second_mark}">Baixar imagem</button><button type="button" data-copy-image-prompt="${k.second_mark}">Copiar prompt</button></div>`:'<div class="frame-placeholder">Imagem planejada em texto</div>'}<p><strong>${esc((f.role||'').toUpperCase())}${f.beat?' · '+esc(f.beat):''}</strong></p><p>${esc(f.description||f.visual_prompt||'')}</p></article>`;
  }).join('');
  el.querySelectorAll('[data-download-frame]').forEach(b=>{const f=frames.find(x=>+x.second_mark===+b.dataset.downloadFrame);b.onclick=()=>downloadAsset(f?.approved_image_url||f?.candidate_image_url,`imagem-${(f?.image_index||'chave')}-${b.dataset.downloadFrame}s.webp`)});
  el.querySelectorAll('[data-copy-image-prompt]').forEach(b=>{const f=frames.find(x=>+x.second_mark===+b.dataset.copyImagePrompt);b.onclick=async()=>bToast(await copyText(f?.visual_prompt||'')?'Prompt da imagem copiado.':'Não foi possível copiar o prompt.')});
  $('boardActions').hidden=!storyApproved||boardApproved;
}

async function createOrRevise(action,comment=''){
  if(directorBusy||!canCreate())return;
  setDirectorBusy(true);const b=brief(),previousFrames=frames.slice();
  $('createStatus').textContent=action==='create_story'?'Criando história e plano visual…':'Aplicando seu ajuste…';
  try{
    const d=await invoke(FN.director,{action,products:selectedProducts,...b,comment,plan});
    plan=d.plan;Object.assign(plan,b);
    frames=(plan.keyframes||[]).map(k=>{const old=previousFrames.find(x=>+x.second_mark===+k.second_mark);return old?{...old,...k,approved_image_url:old.approved_image_url||null,candidate_image_url:old.candidate_image_url||null,status:old.status||'planned'}:{...k,status:'planned',candidate_image_url:null,approved_image_url:null}});
    storyApproved=action==='revise_storyboard'||storyApproved&&action!=='revise_story';
    boardApproved=false;
    if(!project){const p=await invoke(FN.projects,{action:'create',products:selectedProducts,plan});project=p.project}
    renderSelected();renderPlan();
    $('createStatus').textContent=action==='create_story'?'História criada com sucesso. Revise e aprove antes de continuar.':'Ajuste aplicado. Revise o resultado.';
  }catch(e){$('createStatus').textContent=`Não foi possível concluir: ${e.message}`}
  finally{setDirectorBusy(false)}
}

function approveStory(){storyApproved=true;$('storyActions').hidden=true;$('boardActions').hidden=false;$('createStatus').textContent='História aprovada. Agora revise as imagens planejadas.';renderTimeline()}
function approveBoard(){
  boardApproved=true;$('boardActions').hidden=true;
  if(mode()==='full'){$('generateNextFrame').disabled=false;$('storyboardStatus').textContent='Plano visual aprovado. Gere a primeira imagem-chave.'}
  else $('createStatus').textContent='Plano visual aprovado. Os pacotes Gemini estão prontos.';
  renderCurrent();renderPackages();
}
function nextFrame(){return frames.find(f=>f.status!=='approved')}

function renderCurrent(){
  if(mode()!=='full')return;
  const f=nextFrame(),el=$('currentFrame');
  $('generationMetrics').textContent=`${frames.filter(x=>x.approved_image_url).length}/${frames.length||0} aprovadas`;
  if(!plan||!boardApproved){el.className='studio-plan empty';el.textContent='Aguardando aprovação do plano visual.';$('frameActions').hidden=true;return}
  if(!f){el.className='studio-plan approved';el.innerHTML='<h3>Imagens concluídas</h3><p>Todas as imagens-chave foram aprovadas. Os pacotes Gemini estão liberados.</p>';$('progressText').textContent='Produção visual concluída.';$('frameActions').hidden=true;$('generateNextFrame').hidden=true;return}
  const i=frames.indexOf(f),u=f.approved_image_url||f.candidate_image_url||'';
  $('progressText').textContent=`Imagem ${i+1} de ${frames.length} · ${f.second_mark}s · ${f.role||'progressão'}`;
  $('approveFrame').textContent=i===0&&!visualBible?.locked?'Aprovar identidade visual':'Aprovar imagem';
  el.className='studio-plan';
  el.innerHTML=`<h3>Imagem ${i+1} · ${esc(f.role||'')}</h3><p>${esc(f.description||'')}</p>${u?`<img class="current-frame-image" src="${esc(u)}" alt="Imagem-chave ${i+1}"><div class="current-image-actions"><button id="downloadCurrentFrame" class="secondary" type="button">Baixar imagem</button><button id="copyCurrentPrompt" class="secondary" type="button">Copiar prompt da imagem</button></div>`:`<div class="image-prompt-preview"><strong>Como ela será:</strong><p>${esc(f.visual_prompt||'')}</p></div>`}`;
  if(u)$('downloadCurrentFrame').onclick=()=>downloadAsset(u,`imagem-${i+1}-${f.second_mark}s.webp`);
  if($('copyCurrentPrompt'))$('copyCurrentPrompt').onclick=async()=>bToast(await copyText(f.visual_prompt||'')?'Prompt da imagem copiado.':'Não foi possível copiar o prompt.');
  $('frameActions').hidden=f.status!=='review';$('generateNextFrame').hidden=f.status==='review';$('generateNextFrame').disabled=f.status==='generating';
}

async function generateNext(){
  if(mode()!=='full')return;
  const f=nextFrame();if(!f||!boardApproved)return;
  const i=frames.indexOf(f),prev=i?frames[i-1]:null;
  if(i>0&&!prev?.approved_image_url)return bToast('Aprove a imagem anterior primeiro.');
  if(i>0&&!visualBible?.locked)return bToast('Aprove a identidade visual primeiro.');
  f.status='generating';$('storyboardStatus').textContent=`Gerando imagem ${i+1} de ${frames.length}…`;renderTimeline();renderCurrent();
  try{
    const d=await invoke(FN.image,{project_id:project.id,second_mark:f.second_mark,image_index:f.image_index||i+1,image_role:f.role||'progression',visual_prompt:f.visual_prompt,continuity_lock:{continuity_bible:plan.continuity_bible,visual_bible:visualBible},product_images:selectedProducts.map(imageOf).filter(Boolean)});
    Object.assign(f,d.keyframe,{...f,status:'review',candidate_image_url:d.keyframe?.candidate_image_url||d.keyframe?.image_url||null,approved_image_url:null});
    generationCount++;$('storyboardStatus').textContent=`Imagem ${i+1} pronta para revisão.`;renderTimeline();renderCurrent();
  }catch(e){
    if(['frame_in_review','frame_already_approved'].includes(e.code)&&typeof openSavedProject==='function')return openSavedProject(project.id);
    f.status='planned';$('storyboardStatus').textContent=e.message;renderTimeline();renderCurrent();
  }
}
function approveFrame(){
  const f=nextFrame();if(!f||f.status!=='review')return;
  f.approved_image_url=f.candidate_image_url;f.image_url=f.approved_image_url;f.status='approved';
  $('storyboardStatus').textContent='Imagem aprovada.';renderTimeline();renderCurrent();renderPackages();
}
async function regenerate(){const f=nextFrame();if(!f)return;f.status='planned';f.candidate_image_url=null;f.image_url=null;$('storyboardStatus').textContent='Regenerando esta imagem…';await generateNext()}
async function applyFrameSuggestion(){const c=$('frameComment').value.trim(),f=nextFrame();if(!c||!f){bToast('Escreva o que deseja alterar.');return}await createOrRevise('revise_storyboard',`Na imagem-chave de ${f.second_mark}s (${f.role||'progressão'}): ${c}`)}

function packageReady(p){
  if(!boardApproved)return false;if(mode()!=='full')return true;
  return[p.start_second,p.end_second].map(s=>frames.find(f=>+f.second_mark===+s)).every(f=>f?.status==='approved'&&f?.approved_image_url);
}
function renderPackages(){
  const el=$('geminiPackages');if(!plan?.gemini_packages){el.textContent='Aguardando planejamento.';return}
  el.innerHTML=plan.gemini_packages.map(p=>`<article class="gemini-package"><div class="package-head"><h3>${p.start_second}s → ${p.end_second}s</h3><span class="studio-badge">${packageReady(p)?'Pronto':'Aguardando imagens'}</span></div>${packageReady(p)?`<button class="primary copy-prompt" data-i="${p.package_index}">Copiar prompt Gemini</button>`:'<p class="muted">Aprove as imagens que delimitam este trecho.</p>'}</article>`).join('');
  el.querySelectorAll('.copy-prompt').forEach(b=>b.onclick=async()=>{const p=plan.gemini_packages.find(x=>+x.package_index===+b.dataset.i);bToast(await copyText(p?.prompt||'')?'Prompt Gemini copiado.':'Não foi possível copiar o prompt.')});
}

async function loadProjects(){try{const d=await invoke(FN.projects,{action:'list',limit:10}),rows=d.projects||[];$('recentProjects').innerHTML=rows.length?rows.map(p=>`<button type="button" class="job-card"><span><strong>${esc(p.creative_plan?.title||'Projeto criativo')}</strong><small>${new Date(p.updated_at).toLocaleString('pt-BR')}</small></span></button>`).join(''):'Nenhum projeto salvo ainda.'}catch(e){$('recentProjects').textContent=e.message}}
function bToast(t){$('toastRegion').innerHTML=`<div class="toast">${esc(t)}</div>`;setTimeout(()=>$('toastRegion').innerHTML='',2800)}

$('productSearchForm').onsubmit=e=>{e.preventDefault();searchProducts()};
$('productionMode').onchange=applyMode;
$('referenceUpload').onchange=e=>{referenceFile=e.target.files?.[0]||null;if(referenceUrl)URL.revokeObjectURL(referenceUrl);referenceUrl=referenceFile?URL.createObjectURL(referenceFile):'';$('referencePreview').innerHTML=referenceUrl?`<img src="${esc(referenceUrl)}" alt="Referência"><button id="downloadReference" type="button">Baixar imagem</button>`:'';if(referenceUrl)$('downloadReference').onclick=()=>downloadAsset(referenceUrl,referenceFile.name);renderSelected()};
$('createStory').onclick=()=>createOrRevise('create_story');
$('reviseStory').onclick=()=>createOrRevise('revise_story',$('storyComment').value.trim());
$('approveStory').onclick=approveStory;
$('reviseBoard').onclick=()=>createOrRevise('revise_storyboard',$('boardComment').value.trim());
$('approveBoard').onclick=approveBoard;
$('generateNextFrame').onclick=generateNext;
$('approveFrame').onclick=approveFrame;
$('regenerateFrame').onclick=regenerate;
$('applyFrameSuggestion').onclick=applyFrameSuggestion;
['duration','audioMode'].forEach(id=>$(id).onchange=updateCostPreview);
applyMode();renderSelected();loadProjects();
