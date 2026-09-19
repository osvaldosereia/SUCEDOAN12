const $=id=>document.getElementById(id);
const cfg=window.DA_ADMIN_CONFIG||{};
const BASE=cfg.supabaseUrl, KEY=cfg.supabasePublishableKey, FN='creative-storyboard-projects';

const MAX_PRODUCTS=16;
let targetCount=16,searchResults=[],selected=new Map(),shots=[],themeTouched=false,lastSearch='',promptNonce=0;

async function api(body){
  const r=await fetch(BASE+'/functions/v1/'+FN,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.ok===false)throw Error(d.detail||d.error||'Falha na automação');
  return d;
}

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function clampCount(v){const n=Math.round(Number(v));return Number.isFinite(n)?Math.min(MAX_PRODUCTS,Math.max(1,n)):16}
function referenceCountFor(n){return Math.ceil(clampCount(n)/4)}
function imageWord(n){return n===1?'imagem':'imagens'}
function productWord(n){return n===1?'produto':'produtos'}

function invalidateOutput(){
  shots=[];
  $('outputSection').classList.add('hidden');
  $('promptSection').classList.add('hidden');
  $('download').disabled=true;
}

function syncControls(){
  const n=selected.size,refs=referenceCountFor(targetCount);
  $('selectionBadge').textContent=n+' / '+targetCount;
  $('clearSelection').disabled=!n;
  $('build').disabled=n!==targetCount;
  $('selectionInstruction').textContent='Selecione exatamente '+targetCount+' '+productWord(targetCount)+' antes de montar as referências.';
  $('build').textContent='Montar '+refs+' '+imageWord(refs)+' + gerar prompt';
  $('referenceSummary').textContent=refs+' '+imageWord(refs)+' · até 4 produtos por imagem';
  $('download').textContent='Baixar '+refs+' '+imageWord(refs);
  renderSelected();
  renderResults();
}

function changeTargetCount(){
  const next=clampCount($('productCount').value);
  $('productCount').value=String(next);
  if(next===targetCount)return;
  targetCount=next;
  if(selected.size>targetCount){
    const keys=[...selected.keys()];
    while(selected.size>targetCount)selected.delete(keys.pop());
  }
  invalidateOutput();
  $('status').textContent='Quantidade ajustada para '+targetCount+' '+productWord(targetCount)+'.';
  syncControls();
}

function renderResults(){
  const root=$('results');
  $('resultCount').textContent=searchResults.length+' encontrados';
  if(!searchResults.length){
    root.className='product-grid empty-state';
    root.textContent=lastSearch?'Nenhum produto encontrado nesta busca.':'Faça uma busca para ver os produtos.';
    return;
  }
  root.className='product-grid';
  root.innerHTML=searchResults.map(p=>{
    const on=selected.has(String(p.id));
    return '<article class="product-card '+(on?'selected':'')+'" data-id="'+esc(p.id)+'">'+
      '<span class="mark">'+(on?'✓':'+')+'</span>'+
      '<img src="'+esc(p.image_url)+'" alt="" loading="lazy">'+
      '<div class="copy"><strong>'+esc(p.name)+'</strong><small>'+esc([p.brand,p.category].filter(Boolean).join(' · '))+'</small></div>'+
    '</article>';
  }).join('');
}

function renderSelected(){
  const root=$('selected'),arr=[...selected.values()];
  if(!arr.length){
    root.className='selected-strip empty-state';
    root.textContent='Nenhum produto selecionado.';
    return;
  }
  root.className='selected-strip';
  root.innerHTML=arr.map(p=>
    '<div class="selected-item" data-id="'+esc(p.id)+'"><img src="'+esc(p.image_url)+'" alt=""><button type="button" aria-label="Remover">×</button><span>'+esc(p.name)+'</span></div>'
  ).join('');
}

async function searchProducts(){
  const q=$('searchTerm').value.trim();
  if(q.length<2){$('searchStatus').textContent='Digite pelo menos 2 caracteres.';return}
  try{
    $('searchButton').disabled=true;
    $('searchStatus').textContent='Buscando "'+q+'"…';
    const d=await api({action:'video_search_products',q,limit:16});
    searchResults=(d.products||[]).filter(p=>p.image_url);
    lastSearch=q;
    if(!$('theme').value.trim()||!themeTouched)$('theme').value=q;
    $('searchStatus').textContent=searchResults.length?searchResults.length+' produtos encontrados. Selecione os que deseja usar.':'Nenhum produto encontrado.';
    renderResults();
  }catch(e){
    $('searchStatus').textContent='Erro: '+e.message;
  }finally{
    $('searchButton').disabled=false;
  }
}

function toggleProduct(id){
  id=String(id);
  if(selected.has(id)){
    selected.delete(id);
    invalidateOutput();
    syncControls();
    return;
  }
  if(selected.size>=targetCount){
    $('status').textContent='Você definiu '+targetCount+' '+productWord(targetCount)+'. Remova um antes de selecionar outro.';
    return;
  }
  const p=searchResults.find(x=>String(x.id)===id);
  if(p){
    selected.set(id,p);
    invalidateOutput();
    $('status').textContent='';
    syncControls();
  }
}

function loadImage(p){
  return new Promise(resolve=>{
    const im=new Image();im.crossOrigin='anonymous';
    im.onload=()=>resolve({p,im});im.onerror=()=>resolve(null);im.src=p.image_url;
  });
}

function slotsForCount(n){
  if(n===1)return [[90,160,540,960]];
  if(n===2)return [[80,80,560,520],[80,680,560,520]];
  if(n===3)return [[28,100,318,500],[374,100,318,500],[201,680,318,500]];
  return [[28,45,318,560],[374,45,318,560],[28,675,318,560],[374,675,318,560]];
}

function drawReference(group){
  const c=document.createElement('canvas');c.width=720;c.height=1280;
  const x=c.getContext('2d');x.fillStyle='#eeeeec';x.fillRect(0,0,c.width,c.height);
  const slots=slotsForCount(group.length);
  group.forEach((o,i)=>{
    const [sx,sy,sw,sh]=slots[i],im=o.im;
    const r=Math.min((sw-16)/im.naturalWidth,(sh-16)/im.naturalHeight);
    const w=im.naturalWidth*r,h=im.naturalHeight*r;
    x.drawImage(im,sx+(sw-w)/2,sy+(sh-h)/2,w,h);
  });
  return c;
}

function renderReferences(){
  $('grid').innerHTML='';
  shots.forEach((canvas,i)=>{
    const count=Math.min(4,targetCount-(i*4));
    const el=document.createElement('article');el.className='ref';el.append(canvas);
    const foot=document.createElement('footer');foot.textContent='Referência '+(i+1)+' · '+count+' '+productWord(count);
    el.append(foot);$('grid').append(el);
  });
  const refs=shots.length;
  $('referenceSummary').textContent=refs+' '+imageWord(refs)+' · '+targetCount+' '+productWord(targetCount)+' no total';
  $('download').textContent='Baixar '+refs+' '+imageWord(refs);
  $('outputSection').classList.remove('hidden');
  $('download').disabled=false;
}

function productPayload(){
  return [...selected.values()].map(p=>({
    id:p.id,name:p.name,brand:p.brand||'',category:p.category||'',subcategory:p.subcategory||'',packaging:p.packaging||''
  }));
}

async function generatePrompt(){
  const theme=$('theme').value.trim()||lastSearch||'variedade de produtos';
  const directions=$('directions').value.trim();
  if(selected.size!==targetCount)throw Error('Selecione exatamente '+targetCount+' '+productWord(targetCount)+' antes de gerar o prompt.');
  const imageCount=referenceCountFor(targetCount);
  $('promptSection').classList.remove('hidden');
  $('prompt').textContent='Gerando direção criativa com IA…';
  $('styleBadge').textContent='IA pensando…';
  const d=await api({
    action:'video_generate_prompt',
    theme,
    directions,
    product_count:targetCount,
    image_count:imageCount,
    products:productPayload(),
    variation:promptNonce++
  });
  $('prompt').textContent=d.prompt||'';
  $('styleBadge').textContent=d.creative_label||('Tema: '+theme);
}

async function build(){
  try{
    if(selected.size!==targetCount)return;
    $('build').disabled=true;$('download').disabled=true;
    $('status').textContent='Carregando '+targetCount+' '+productWord(targetCount)+'…';
    const items=[...selected.values()].slice(0,targetCount);
    const loaded=await Promise.all(items.map(loadImage));
    if(loaded.some(x=>!x))throw Error('Uma das imagens não carregou. Remova o produto com problema e selecione outro.');
    shots=[];
    for(let i=0;i<loaded.length;i+=4)shots.push(drawReference(loaded.slice(i,i+4)));
    renderReferences();
    $('status').textContent=shots.length+' '+imageWord(shots.length)+' montada'+(shots.length===1?'':'s')+'. Gerando prompt com IA…';
    await generatePrompt();
    $('status').textContent='Pronto: '+targetCount+' '+productWord(targetCount)+', '+shots.length+' '+imageWord(shots.length)+' e vídeo fixo de 10 segundos.';
  }catch(e){
    $('status').textContent='Erro: '+e.message;
  }finally{
    $('build').disabled=selected.size!==targetCount;
  }
}

async function download(){
  if(!shots.length)return;
  $('download').disabled=true;
  $('status').textContent='Baixando '+shots.length+' '+imageWord(shots.length)+'…';
  for(let i=0;i<shots.length;i++){
    const blob=await new Promise(r=>shots[i].toBlob(r,'image/jpeg',.96));
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='dona-antonia-video-ref-'+String(i+1).padStart(2,'0')+'.jpg';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2500);
    await new Promise(r=>setTimeout(r,250));
  }
  $('status').textContent='Download concluído.';
  $('download').disabled=false;
}

$('productCount').addEventListener('change',changeTargetCount);
$('productCount').addEventListener('blur',changeTargetCount);
$('searchButton').onclick=searchProducts;
$('searchTerm').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchProducts()}});
$('theme').addEventListener('input',()=>{themeTouched=true});
$('results').onclick=e=>{const card=e.target.closest('.product-card');if(card)toggleProduct(card.dataset.id)};
$('selected').onclick=e=>{const item=e.target.closest('.selected-item');if(item&&e.target.closest('button')){selected.delete(String(item.dataset.id));invalidateOutput();syncControls()}};
$('clearSelection').onclick=()=>{selected.clear();invalidateOutput();$('status').textContent='';syncControls()};
$('build').onclick=build;
$('download').onclick=download;
$('newPrompt').onclick=async()=>{
  try{$('newPrompt').disabled=true;await generatePrompt();$('status').textContent='Nova variação gerada pela IA.'}
  catch(e){$('status').textContent='Erro: '+e.message}
  finally{$('newPrompt').disabled=false}
};
$('copy').onclick=async()=>{
  await navigator.clipboard.writeText($('prompt').textContent);
  const b=$('copy'),old=b.textContent;b.textContent='Copiado ✓';setTimeout(()=>b.textContent=old,1200);
};
targetCount=clampCount($('productCount').value);
syncControls();

window.VideoProductSelection={
  getProducts:()=>[...selected.values()].map(p=>({id:p.id,name:p.name,brand:p.brand||'',category:p.category||'',subcategory:p.subcategory||'',packaging:p.packaging||'',image_url:p.image_url||''})),
  getCount:()=>selected.size,
  getTheme:()=>$('theme')?.value?.trim()||lastSearch||''
};
