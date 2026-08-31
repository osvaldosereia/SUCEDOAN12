import { fbGet, fbWrite, audit, mugImage, nowIso, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD='20260830-banner-manager-v7';
const BANNER_NODE='canecas/banners_ia';
const ASSET_NODE='canecas/banners_ia_assets';
const COMMAND_NODE='canecas/banner_comandos';
const SETTINGS_KEY='da_admin_canecas_banner_v1';
const MAX_KB=500;
const MAX_PRODUCTS=12;
const REFERENCE_SIZE=1400;

const PROFILE={
  full:{label:'Full Banner',desktop:[1270,444],mobile:[722,888],desktopAi:'1536x1024',mobileAi:'1024x1536',hint:'Destaque principal da home.'},
  tarja:{label:'Banner Tarja',desktop:[1270,70],mobile:[361,70],desktopAi:'1536x1024',mobileAi:'1536x1024',hint:'Faixa promocional curta.'},
  vitrine:{label:'Banner Vitrine',desktop:[850,200],mobile:[722,170],desktopAi:'1536x1024',mobileAi:'1536x1024',hint:'Banner entre vitrines.'},
  mini:{label:'Mini Banner',desktop:[720,400],mobile:[720,400],desktopAi:'1536x1024',mobileAi:'1536x1024',hint:'Card promocional.'}
};

const state={products:[],history:[],commands:[],type:'full',result:null,busy:false,loaded:false,selectedProducts:new Set(),selectedCommands:new Set(),productQuery:''};
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const text=v=>String(v??'').trim();
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const settings=()=>{try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}catch{return{}}};
const saveSettings=v=>localStorage.setItem(SETTINGS_KEY,JSON.stringify(v));

function toast(message,error=false){const el=$('#toast');if(!el)return alert(message);el.textContent=message;el.className=`toast${error?' error':''}`;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,error?7000:3500)}
function bannerId(){return safeKey(`BN-${Date.now()}-${Math.random().toString(36).slice(2,7)}`).toUpperCase()}
function profile(){return PROFILE[state.type]||PROFILE.full}
function pImage(p={}){return mugImage(p)||text(p.url_imagem||p.imagem_url||p.imagem)}
function keyOf(p={}){return text(p.__key||p.firebaseKey||p.id)}
function fmtDims(d){return `${d[0]}×${d[1]}`}
function commandList(data){return Object.entries(data||{}).map(([id,v])=>({id,...(v||{})})).filter(x=>text(x.nome)&&text(x.texto)).sort((a,b)=>text(a.nome).localeCompare(text(b.nome),'pt-BR'))}
function historyList(data){return Object.entries(data||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>new Date(b.criado_em||0)-new Date(a.criado_em||0)).slice(0,60)}
function selectedProducts(){return state.products.filter(p=>state.selectedProducts.has(keyOf(p)))}
function selectedCommands(){return state.commands.filter(c=>state.selectedCommands.has(c.id))}
function dataUri(mime,b64){const raw=text(b64).replace(/^data:[^;]+;base64,/i,'');return raw?`data:${mime||'image/jpeg'};base64,${raw}`:''}
function getImageSource(out,kind){const b=out?.images?.[kind]||out?.[kind]||{},mime=text(b.mime||'image/jpeg'),b64=text(b.b64||b.base64||b.data),url=text(b.url||b.image_url);if(b64)return dataUri(mime,b64);return url}

async function load(force=false){
  if(state.loaded&&!force)return render();
  try{
    const [products,history,commands]=await Promise.all([loadMugs({force}),fbGet(BANNER_NODE).catch(()=>({})),fbGet(COMMAND_NODE).catch(()=>({}))]);
    state.products=[...products].sort((a,b)=>text(a.nome).localeCompare(text(b.nome),'pt-BR'));
    state.history=historyList(history);
    state.commands=commandList(commands);
    state.loaded=true;render();
  }catch(e){toast(`Banners: ${e.message||e}`,true)}
}

function productPickerHtml(){
  const q=state.productQuery.toLocaleLowerCase('pt-BR');
  const list=state.products.filter(p=>!q||`${text(p.nome)} ${text(p.codigo)}`.toLocaleLowerCase('pt-BR').includes(q)).slice(0,120);
  return `<div class="banner-product-picker">
    <div class="banner-product-tools"><input id="bnProductSearch" placeholder="Buscar caneca por nome ou código" value="${esc(state.productQuery)}"><span>${state.selectedProducts.size}/${MAX_PRODUCTS} selecionadas</span></div>
    <div class="banner-product-grid">${list.map(p=>{const k=keyOf(p),img=pImage(p),on=state.selectedProducts.has(k);return `<button type="button" class="banner-product-card ${on?'selected':''}" data-banner-product="${esc(k)}" aria-pressed="${on?'true':'false'}">${img?`<img src="${esc(img)}" alt="${esc(p.nome||'Caneca')}" loading="lazy" decoding="async">`:'<div class="banner-product-empty">Sem foto</div>'}<span><b>${esc(p.nome||p.codigo||k)}</b><small>${esc(p.codigo||'')}</small></span><i>${on?'✓':''}</i></button>`}).join('')}</div>
  </div>`
}

function commandsHtml(){
  return `<div class="banner-command-box">
    <div class="banner-command-head"><div><b>Instruções reutilizáveis</b><small>São o briefing criativo. O cenário acrescenta apenas regras técnicas de formato e uso das imagens de referência.</small></div></div>
    <div class="banner-command-list">${state.commands.length?state.commands.map(c=>`<label class="banner-command-item"><input type="checkbox" data-command-id="${esc(c.id)}" ${state.selectedCommands.has(c.id)?'checked':''}><span><b>${esc(c.nome)}</b><small>${esc(c.texto)}</small></span><button type="button" class="link-danger" data-command-delete="${esc(c.id)}">Apagar</button></label>`).join(''):'<div class="banner-note">Nenhuma instrução salva ainda.</div>'}</div>
    <div class="banner-command-form"><input id="bnCommandName" placeholder="Nome da instrução"><textarea id="bnCommandText" placeholder="Ex.: Gere a arte de um banner horizontal para meu site de canecas personalizadas. O objetivo é divulgar frete grátis para pedidos a partir de R$ 150. Seja criativo e atue como um designer sênior."></textarea><button type="button" class="banner-btn alt" id="bnSaveCommand">Salvar instrução</button></div>
  </div>`
}

function historyHtml(){
  if(!state.history.length)return '<div class="banner-note">Nenhum banner salvo.</div>';
  return `<div class="banner-library">${state.history.map(h=>`<article class="banner-saved-card">
    <div class="banner-saved-thumb">${h.thumb?`<img src="${esc(h.thumb)}" alt="">`:'<span>BN</span>'}</div>
    <div class="banner-saved-info"><b>${esc(h.nome||'Banner')}</b><small>${esc(PROFILE[h.tipo]?.label||h.tipo||'')} · ${esc(new Date(h.criado_em||0).toLocaleString('pt-BR'))}</small><small>${Number(h.produtos_count||0)} caneca(s) de referência · ${Number(h.instrucoes_count||0)} instrução(ões)</small></div>
    <div class="banner-saved-actions"><button type="button" class="banner-btn alt" data-saved-open="${esc(h.id)}">Abrir</button><button type="button" class="banner-btn alt" data-saved-reuse="${esc(h.id)}">Usar dados novamente</button><button type="button" class="banner-btn alt" data-saved-download="${esc(h.id)}" data-kind="desktop">Desktop</button><button type="button" class="banner-btn alt" data-saved-download="${esc(h.id)}" data-kind="mobile">Celular</button><button type="button" class="banner-btn danger" data-saved-delete="${esc(h.id)}">Apagar</button></div>
  </article>`).join('')}</div>`
}

function render(){
  if(!location.hash.includes('banners'))return;
  const root=$('#banners');if(!root)return;
  const cfg=settings(),p=profile();
  root.innerHTML=`<div class="banner-shell">
    <div class="banner-note"><strong>V7 · Mesmo princípio do Gerador de Artes:</strong> escolha o formato, as canecas e os comandos. O OpenAI recebe uma prancha com as canecas reais como referência e cria o <b>banner final completo</b>. O Admin não escreve nem cola nada por cima.</div>
    <section class="banner-panel"><div class="bp-head"><div><h2>Make + GPT Image</h2><p>Fluxo direto com editImage e referências visuais reais.</p></div><span class="banner-status ${cfg.webhook?'ok':''}">${cfg.webhook?'Configurado':'Pendente'}</span></div><div class="bp-body"><div class="banner-config"><input id="bannerWebhook" placeholder="https://hook.eu1.make.com/..." value="${esc(cfg.webhook||window.__CANECAS_ADMIN_CONFIG__?.bannerWebhook||'')}"><button class="banner-btn alt" id="saveBannerWebhook">Salvar webhook</button></div></div></section>
    <div class="banner-grid"><section class="banner-panel"><div class="bp-head"><div><h2>Novo banner</h2><p>Formato + imagens de referência + comandos.</p></div></div><div class="bp-body">
      <div class="banner-profile">${Object.entries(PROFILE).map(([k,v])=>`<button type="button" data-banner-type="${k}" class="${k===state.type?'active':''}"><b>${v.label}</b><small>${fmtDims(v.desktop)} · cel ${fmtDims(v.mobile)}</small></button>`).join('')}</div>
      <div class="banner-note" style="margin-top:12px"><strong>${p.label}</strong> · ${p.hint}<br>Desktop ${fmtDims(p.desktop)} · Celular ${fmtDims(p.mobile)}.</div>
      <h3 class="banner-subtitle">Canecas de referência</h3>${productPickerHtml()}
      <h3 class="banner-subtitle">Instruções reutilizáveis</h3>${commandsHtml()}
      <div class="banner-loading ${state.busy?'show':''}">${state.busy?'Preparando as canecas reais e gerando o banner final Desktop + Celular…':''}</div>
      <div class="banner-toolbar" style="margin-top:14px"><button class="banner-btn teal" id="generateBanner" ${state.busy?'disabled':''}>Gerar banner final</button><button class="banner-btn alt" id="clearBanner">Limpar seleção</button></div>
    </div></section>
    <section class="banner-panel"><div class="bp-head"><div><h2>Prévia e arquivos</h2><p>Imagem final devolvida pelo OpenAI, sem composição adicional do Admin.</p></div></div><div class="bp-body">${resultHtml()}</div></section></div>
    <section class="banner-panel"><div class="bp-head"><div><h3>Banners salvos</h3><p>Abrir, baixar novamente, reutilizar ou apagar.</p></div><button class="banner-btn alt" id="refreshBannerHistory">Atualizar</button></div><div class="bp-body">${historyHtml()}</div></section>
  </div>`;
  bind();
  if(state.result)requestAnimationFrame(renderPreviews);
}

function resultHtml(){
  if(!state.result)return '<div class="banner-note">As prévias Desktop e Celular aparecerão aqui.</div>';
  return `<div class="banner-copy"><div class="copy-row"><small>Formato</small><strong>${esc(PROFILE[state.type]?.label||state.type)}</strong></div><div class="copy-row"><small>Canecas usadas como referência</small><strong>${state.result.payload?.images?.length||0}</strong></div><div class="copy-row"><small>Instruções usadas</small><strong>${state.result.payload?.instruction_ids?.length||0}</strong></div></div><div class="banner-preview-list" id="bannerPreviewList" style="margin-top:14px"></div><div class="banner-toolbar" style="margin-top:14px"><button class="banner-btn" id="downloadDesktop">Baixar Desktop</button><button class="banner-btn alt" id="downloadMobile">Baixar Celular</button><button class="banner-btn alt" id="downloadMeta">Baixar dados .json</button></div>`;
}

function bind(){
  $$('[data-banner-type]').forEach(b=>b.onclick=()=>{state.type=b.dataset.bannerType;state.result=null;render()});
  $('#saveBannerWebhook').onclick=()=>{saveSettings({...settings(),webhook:text($('#bannerWebhook').value)});toast('Webhook salvo.');render()};
  $('#bnProductSearch').oninput=e=>{state.productQuery=e.target.value;render()};
  $$('[data-banner-product]').forEach(b=>b.onclick=()=>{const k=b.dataset.bannerProduct;if(state.selectedProducts.has(k))state.selectedProducts.delete(k);else if(state.selectedProducts.size>=MAX_PRODUCTS)return toast(`Selecione no máximo ${MAX_PRODUCTS} canecas por banner.`,true);else state.selectedProducts.add(k);render()});
  $$('[data-command-id]').forEach(c=>c.onchange=()=>c.checked?state.selectedCommands.add(c.dataset.commandId):state.selectedCommands.delete(c.dataset.commandId));
  $$('[data-command-delete]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();deleteCommand(b.dataset.commandDelete)});
  $('#bnSaveCommand').onclick=saveCommand;
  $('#generateBanner').onclick=generate;
  $('#clearBanner').onclick=()=>{state.selectedProducts.clear();state.selectedCommands.clear();state.result=null;render()};
  $('#refreshBannerHistory').onclick=()=>load(true);
  if($('#downloadDesktop'))$('#downloadDesktop').onclick=()=>downloadCurrent('desktop');
  if($('#downloadMobile'))$('#downloadMobile').onclick=()=>downloadCurrent('mobile');
  if($('#downloadMeta'))$('#downloadMeta').onclick=downloadMeta;
  $$('[data-saved-open]').forEach(b=>b.onclick=()=>openSaved(b.dataset.savedOpen));
  $$('[data-saved-reuse]').forEach(b=>b.onclick=()=>reuseSaved(b.dataset.savedReuse));
  $$('[data-saved-download]').forEach(b=>b.onclick=()=>downloadSaved(b.dataset.savedDownload,b.dataset.kind));
  $$('[data-saved-delete]').forEach(b=>b.onclick=()=>deleteSaved(b.dataset.savedDelete));
}

async function saveCommand(){
  const nome=text($('#bnCommandName').value),texto=text($('#bnCommandText').value);
  if(!nome||!texto)return toast('Informe nome e texto da instrução.',true);
  const id=safeKey(`${Date.now()}-${nome}`).toLowerCase(),record={id,nome,texto,criado_em:nowIso(),atualizado_em:nowIso()};
  await fbWrite(`${COMMAND_NODE}/${safeKey(id)}`,record,'PUT');
  state.commands=commandList({...Object.fromEntries(state.commands.map(c=>[c.id,c])),[id]:record});
  state.selectedCommands.add(id);toast('Instrução salva e selecionada.');render();
}
async function deleteCommand(id){if(!confirm('Apagar esta instrução reutilizável?'))return;await fbWrite(`${COMMAND_NODE}/${safeKey(id)}`,null,'PUT');state.commands=state.commands.filter(c=>c.id!==id);state.selectedCommands.delete(id);render()}

function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();if(!/^data:/i.test(url))img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Não foi possível carregar uma das imagens de referência.'));img.src=url})}
function contain(ctx,img,x,y,w,h){const s=Math.min(w/img.width,h/img.height),dw=img.width*s,dh=img.height*s;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}
function cover(ctx,img,x,y,w,h){const s=Math.max(w/img.width,h/img.height),dw=img.width*s,dh=img.height*s;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}

async function buildReferenceBoard(products){
  const urls=products.map(pImage).filter(u=>/^https?:\/\//i.test(u));
  if(!urls.length)throw new Error('Nenhuma caneca selecionada possui imagem pública.');
  const loaded=await Promise.all(urls.map(loadImage));
  const n=loaded.length,cols=Math.min(4,Math.max(1,Math.ceil(Math.sqrt(n)))),rows=Math.ceil(n/cols);
  const canvas=document.createElement('canvas');canvas.width=REFERENCE_SIZE;canvas.height=REFERENCE_SIZE;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f4f4f2';ctx.fillRect(0,0,canvas.width,canvas.height);
  const gap=22,pad=30,cellW=(canvas.width-pad*2-gap*(cols-1))/cols,cellH=(canvas.height-pad*2-gap*(rows-1))/rows;
  loaded.forEach((img,i)=>{
    const col=i%cols,row=Math.floor(i/cols),x=pad+col*(cellW+gap),y=pad+row*(cellH+gap);
    ctx.fillStyle='#ffffff';ctx.fillRect(x,y,cellW,cellH);
    contain(ctx,img,x+12,y+12,cellW-24,cellH-24);
  });
  return canvas.toDataURL('image/jpeg',.90);
}

async function makePayload(){
  const p=profile(),products=selectedProducts(),commands=selectedCommands();
  const images=products.map(x=>({image_url:pImage(x),name:text(x.nome),sku:text(x.codigo)})).filter(x=>/^https?:\/\//i.test(x.image_url));
  const prompt=commands.map(c=>text(c.texto)).filter(Boolean).join('\n\n');
  const reference_image_base64=await buildReferenceBoard(products);
  return {
    action:'generate_final_banner_from_reference_mugs',
    request_id:bannerId(),
    build:BUILD,
    banner:{
      type:state.type,label:p.label,
      desktop:{width:p.desktop[0],height:p.desktop[1],ai_size:p.desktopAi},
      mobile:{width:p.mobile[0],height:p.mobile[1],ai_size:p.mobileAi}
    },
    prompt,
    instruction_ids:commands.map(c=>c.id),
    images,
    reference_image_base64
  };
}

async function generate(){
  const webhook=text(settings().webhook||window.__CANECAS_ADMIN_CONFIG__?.bannerWebhook);
  if(!webhook)return toast('Configure o webhook de banners.',true);
  if(!state.selectedProducts.size)return toast('Selecione pelo menos uma caneca.',true);
  if(!state.selectedCommands.size)return toast('Selecione pelo menos uma Instrução reutilizável.',true);
  state.busy=true;render();
  try{
    const req=await makePayload();
    if(req.images.length!==state.selectedProducts.size)throw new Error('Uma ou mais canecas selecionadas não possuem URL de imagem pública.');
    const r=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(req)}),raw=await r.text();
    if(!r.ok)throw new Error(`Make ${r.status}: ${raw.slice(0,300)}`);
    let out;try{out=JSON.parse(raw)}catch{throw new Error('O Make não respondeu JSON válido.')}
    if(out.ok===false)throw new Error(out.error||'Falha informada pelo Make.');
    const desktop=getImageSource(out,'desktop'),mobile=getImageSource(out,'mobile');
    if(!desktop||!mobile)throw new Error('O cenário precisa devolver Desktop e Celular.');
    const storedPayload={...req,reference_image_base64:'[prancha de referência omitida do histórico]'};
    state.result={id:req.request_id,payload:storedPayload,images:{desktop,mobile}};
    const saved=await persistFinalAssets(state.result);
    const meta={nome:`${pLabel(req.banner.type)} · ${new Date().toLocaleString('pt-BR')}`,tipo:req.banner.type,status:'salvo',payload:storedPayload,produtos_count:req.images.length,instrucoes_count:req.instruction_ids.length,thumb:saved.thumb,tem_desktop:true,tem_mobile:true,criado_em:nowIso(),atualizado_em:nowIso()};
    await fbWrite(`${BANNER_NODE}/${safeKey(req.request_id)}`,meta,'PUT');
    await audit('banner_ia_salvo',{banner_id:req.request_id,tipo:req.banner.type,imagens:req.images.length,instrucoes:req.instruction_ids.length,engine:'editImage'});
    state.history=[{id:req.request_id,...meta},...state.history.filter(h=>h.id!==req.request_id)].slice(0,60);
    toast('Banner final Desktop + Celular criado com as canecas de referência e salvo.');
  }catch(e){toast(e.message||e,true)}finally{state.busy=false;render()}
}
function pLabel(type){return PROFILE[type]?.label||type||'Banner'}

async function buildCanvas(kind){
  if(!state.result)throw new Error('Nenhum banner gerado.');
  if(state.result.finalAssets?.[kind]){
    const img=await loadImage(state.result.finalAssets[kind]),c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);return c;
  }
  const dims=profile()[kind],canvas=document.createElement('canvas');canvas.width=dims[0];canvas.height=dims[1];
  const img=await loadImage(state.result.images[kind]);cover(canvas.getContext('2d'),img,0,0,canvas.width,canvas.height);return canvas;
}
async function jpegBlobUnderLimit(canvas,maxKb=MAX_KB){const max=maxKb*1024;let last=null;for(const q of [.92,.86,.80,.74,.68,.62,.56,.50,.44,.38,.32]){last=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao exportar JPEG.')),'image/jpeg',q));if(last.size<=max)return {blob:last,quality:q,ok:true}}return {blob:last,quality:.32,ok:last?.size<=max}}
function blobToDataUri(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob)})}
async function canvasEncoded(kind){const canvas=await buildCanvas(kind),encoded=await jpegBlobUnderLimit(canvas);if(!encoded.ok)throw new Error(`${kind} passou de ${MAX_KB} KB.`);return {canvas,...encoded}}
async function persistFinalAssets(result){
  const desktop=await canvasEncoded('desktop'),mobile=await canvasEncoded('mobile');
  const desktopUri=await blobToDataUri(desktop.blob),mobileUri=await blobToDataUri(mobile.blob);
  result.finalAssets={desktop:desktopUri,mobile:mobileUri};
  const thumbCanvas=document.createElement('canvas');thumbCanvas.width=280;thumbCanvas.height=Math.round(280*desktop.canvas.height/desktop.canvas.width);thumbCanvas.getContext('2d').drawImage(desktop.canvas,0,0,thumbCanvas.width,thumbCanvas.height);
  const thumb=thumbCanvas.toDataURL('image/jpeg',.62);
  await fbWrite(`${ASSET_NODE}/${safeKey(result.id)}`,{desktop:{mime:'image/jpeg',data:desktopUri,bytes:desktop.blob.size},mobile:{mime:'image/jpeg',data:mobileUri,bytes:mobile.blob.size},criado_em:nowIso()},'PUT');
  return {thumb};
}
async function renderPreviews(){const root=$('#bannerPreviewList');if(!root||!state.result)return;root.innerHTML='';for(const kind of ['desktop','mobile']){try{const card=document.createElement('div');card.className='banner-preview-card';const title=document.createElement('div');title.className='banner-note';title.innerHTML=`<strong>${kind==='desktop'?'Desktop':'Celular'}</strong> · ${fmtDims(profile()[kind])}`;const canvas=await buildCanvas(kind);canvas.style.width='100%';canvas.style.height='auto';canvas.dataset.bannerCanvas=kind;card.append(title,canvas);root.appendChild(card)}catch(e){root.innerHTML+=`<div class="banner-note warn">${esc(kind)}: ${esc(e.message||e)}</div>`}}}
function dataUriBlob(uri){const [head,b64]=String(uri).split(','),mime=(head.match(/data:([^;]+)/)||[])[1]||'image/jpeg',bin=atob(b64||''),arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime})}
function triggerBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
async function downloadCurrent(kind){try{if(state.result?.finalAssets?.[kind])return triggerBlob(dataUriBlob(state.result.finalAssets[kind]),`canecafacil-${state.type}-${kind}-${profile()[kind].join('x')}.jpg`);const e=await canvasEncoded(kind);triggerBlob(e.blob,`canecafacil-${state.type}-${kind}-${e.canvas.width}x${e.canvas.height}.jpg`)}catch(e){toast(e.message||e,true)}}
function downloadMeta(){if(!state.result)return;triggerBlob(new Blob([JSON.stringify(state.result.payload,null,2)],{type:'application/json'}),`canecafacil-banner-${state.result.id}.json`)}
async function assetsOf(id){const a=await fbGet(`${ASSET_NODE}/${safeKey(id)}`).catch(()=>null);if(!a?.desktop?.data||!a?.mobile?.data)throw new Error('As imagens salvas deste banner não foram encontradas.');return a}
async function openSaved(id){try{const h=state.history.find(x=>x.id===id);if(!h)return;const a=await assetsOf(id);state.type=h.tipo||'full';state.result={id,payload:h.payload||{},images:{desktop:a.desktop.data,mobile:a.mobile.data},finalAssets:{desktop:a.desktop.data,mobile:a.mobile.data},saved:true};render();document.querySelector('#bannerPreviewList')?.scrollIntoView({behavior:'smooth',block:'center'})}catch(e){toast(e.message||e,true)}}
async function downloadSaved(id,kind){try{const h=state.history.find(x=>x.id===id),a=await assetsOf(id),uri=a?.[kind]?.data;if(!uri)throw new Error('Arquivo não encontrado.');const dims=PROFILE[h?.tipo]?.[kind]||[];triggerBlob(dataUriBlob(uri),`canecafacil-${h?.tipo||'banner'}-${kind}-${dims.join('x')}.jpg`)}catch(e){toast(e.message||e,true)}}
async function reuseSaved(id){
  const h=state.history.find(x=>x.id===id);if(!h?.payload)return toast('Este banner antigo não possui dados para reutilização.',true);
  state.type=h.payload.banner?.type||h.tipo||'full';
  state.selectedCommands=new Set((h.payload.instruction_ids||[]).map(text).filter(Boolean));
  const urls=new Set((h.payload.images||[]).map(x=>text(x.image_url||x.url)).filter(Boolean));
  state.selectedProducts=new Set(state.products.filter(p=>urls.has(pImage(p))).map(keyOf));
  state.result=null;render();toast('Formato, canecas e instruções carregados.');
}
async function deleteSaved(id){if(!confirm('Apagar este banner salvo e as duas imagens?'))return;try{await Promise.all([fbWrite(`${BANNER_NODE}/${safeKey(id)}`,null,'PUT'),fbWrite(`${ASSET_NODE}/${safeKey(id)}`,null,'PUT')]);state.history=state.history.filter(h=>h.id!==id);if(state.result?.id===id)state.result=null;toast('Banner apagado.');render()}catch(e){toast(e.message||e,true)}}

window.addEventListener('admin-canecas:route',e=>{if(e.detail?.route==='banners')load(Boolean(e.detail?.force))});
if(location.hash.includes('banners'))load();
document.documentElement.dataset.bannerManager=BUILD;
