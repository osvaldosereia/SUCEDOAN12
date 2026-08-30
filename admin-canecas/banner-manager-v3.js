import { fbGet, fbWrite, audit, mugImage, nowIso, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD='20260830-banner-manager-v3';
const BANNER_NODE='canecas/banners_ia';
const SETTINGS_KEY='da_admin_canecas_banner_v1';
const MAX_KB=500;

// Novo Tema Padrão — documentação Loja Integrada (03/07/2026).
// Nosso gerador SEMPRE produz dois arquivos: desktop + mobile.
const PROFILE={
  full:{label:'Full Banner',desktop:[1270,444],mobile:[722,888],mobileUpload:[361,444],hint:'Destaque principal da home. Mobile exportado em 2x para telas retina.'},
  tarja:{label:'Banner Tarja',desktop:[1270,70],mobile:[361,70],hint:'Avisos curtos como frete, cupom e atendimento.'},
  vitrine:{label:'Banner Vitrine',desktop:[850,200],mobile:[722,170],hint:'Campanha entre vitrines. Mobile independente, preservando a proporção aproximada.'},
  mini:{label:'Mini Banner',desktop:[720,400],mobile:[720,400],hint:'Cards promocionais. Geramos uma composição mobile própria mesmo com a mesma dimensão recomendada.'}
};

const state={products:[],history:[],type:'full',result:null,busy:false,loaded:false};
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const text=v=>String(v??'').trim();
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const settings=()=>{try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}catch{return{}}};
const saveSettings=v=>localStorage.setItem(SETTINGS_KEY,JSON.stringify(v));

function toast(message,error=false){const el=$('#toast');if(!el)return alert(message);el.textContent=message;el.className=`toast${error?' error':''}`;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,error?6000:3200)}
function bannerId(){return safeKey(`BN-${Date.now()}-${Math.random().toString(36).slice(2,7)}`).toUpperCase()}
function profile(){return PROFILE[state.type]||PROFILE.full}
function pImage(p={}){return mugImage(p)||text(p.url_imagem||p.imagem_url||p.imagem)}
function pPrice(p={}){return Number(p.preco_oferta||p.preco||0)||0}
function fmtDims(d){return `${d[0]}×${d[1]}`}
function dataUri(mime,b64){const raw=text(b64).replace(/^data:[^;]+;base64,/i,'');return raw?`data:${mime||'image/jpeg'};base64,${raw}`:''}
function getImageSource(out,kind){
  const block=out?.images?.[kind]||out?.[kind]||{};
  const mime=text(block.mime||'image/jpeg');
  const b64=text(block.b64||block.base64||block.data);
  const url=text(block.url||block.image_url||out?.[`${kind}_image_url`]||out?.[`${kind}_url`]);
  if(b64)return dataUri(mime,b64);
  if(url)return url;
  // Compatibilidade temporária com o cenário V1 (uma imagem apenas).
  if(kind==='desktop'){
    const legacy=out?.image||{};
    const legacyB64=text(legacy.b64||legacy.base64);
    const legacyUrl=text(out?.image_url||out?.background_url||legacy.url||out?.url);
    if(legacyB64)return dataUri(legacy.mime||'image/jpeg',legacyB64);
    if(legacyUrl)return legacyUrl;
  }
  return '';
}

async function load(force=false){
  if(state.loaded&&!force)return render();
  try{
    const [products,history]=await Promise.all([loadMugs({force}),fbGet(BANNER_NODE).catch(()=>({}))]);
    state.products=[...products].sort((a,b)=>text(a.nome).localeCompare(text(b.nome),'pt-BR'));
    state.history=Object.entries(history||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>new Date(b.criado_em||0)-new Date(a.criado_em||0)).slice(0,25);
    state.loaded=true;render();
  }catch(e){toast(`Banners: ${e.message||e}`,true)}
}

function render(){
  if(!location.hash.includes('banners'))return;
  const root=$('#banners');if(!root)return;
  const cfg=settings(),p=profile();
  root.innerHTML=`<div class="banner-shell">
    <div class="banner-note warn"><strong>Loja Integrada · Novo Tema Padrão:</strong> cada criação gera <b>2 arquivos independentes</b>: Desktop e Celular. Ambos em JPG e até ${MAX_KB} KB.</div>
    <section class="banner-panel"><div class="bp-head"><div><h2>Make + OpenAI</h2><p>Webhook exclusivo do cenário de banners V2.</p></div><span class="banner-status ${cfg.webhook?'ok':''}">${cfg.webhook?'Configurado':'Pendente'}</span></div><div class="bp-body"><div class="banner-config"><input id="bannerWebhook" placeholder="https://hook.eu1.make.com/..." value="${esc(cfg.webhook||window.__CANECAS_ADMIN_CONFIG__?.bannerWebhook||'')}"><button class="banner-btn alt" id="saveBannerWebhook">Salvar webhook</button></div></div></section>
    <div class="banner-grid"><section class="banner-panel"><div class="bp-head"><div><h2>Novo banner</h2><p>A IA cria fundos diferentes para desktop e celular; o Admin aplica copy e produto em cada composição.</p></div></div><div class="bp-body">
      <div class="banner-profile">${Object.entries(PROFILE).map(([k,v])=>`<button type="button" data-banner-type="${k}" class="${k===state.type?'active':''}"><b>${v.label}</b><small>${fmtDims(v.desktop)} · cel ${fmtDims(v.mobile)}</small></button>`).join('')}</div>
      <div class="banner-note" style="margin-top:12px"><strong>${p.label}</strong> · ${p.hint}<br>Desktop ${fmtDims(p.desktop)} · Celular ${fmtDims(p.mobile)}${p.mobileUpload?` (upload lógico ${fmtDims(p.mobileUpload)}; arquivo 2x)` : ''}.</div>
      <div class="banner-form" style="margin-top:14px"><label>Campanha<input id="bnName"></label><label>Produto<select id="bnProduct"><option value="">Sem produto específico</option>${state.products.map(x=>`<option value="${esc(x.__key)}">${esc(x.nome||x.codigo||x.__key)}</option>`).join('')}</select></label><label class="span2">Objetivo / oferta<textarea id="bnObjective"></textarea></label><label>Preço atual<input id="bnPrice" type="number" step="0.01"></label><label>Preço anterior<input id="bnOldPrice" type="number" step="0.01"></label><label>Headline opcional<input id="bnHeadline"></label><label>CTA opcional<input id="bnCta"></label><label class="span2">Link<input id="bnLink"></label><label>Estilo<select id="bnStyle"><option value="moderno-minimalista">Moderno e minimalista</option><option value="premium-editorial">Premium editorial</option><option value="alegre-presenteavel">Alegre / presenteável</option><option value="religioso-elegante">Religioso elegante</option><option value="promocional-limpo">Promocional limpo</option></select></label><label>Variação<select id="bnVariation"><option value="equilibrada">Equilibrada</option><option value="produto-destaque">Produto em destaque</option><option value="tipografia-destaque">Texto em destaque</option><option value="visual-destaque">Visual em destaque</option></select></label><label>Início<input id="bnStart" type="datetime-local"></label><label>Fim<input id="bnEnd" type="datetime-local"></label><label class="span2">Observações<textarea id="bnNotes"></textarea></label></div>
      <div class="banner-loading ${state.busy?'show':''}">${state.busy?'Gerando conceito + desktop + celular…':''}</div><div class="banner-toolbar" style="margin-top:14px"><button class="banner-btn teal" id="generateBanner" ${state.busy?'disabled':''}>Gerar Desktop + Celular</button><button class="banner-btn alt" id="clearBanner">Limpar</button></div>
    </div></section><section class="banner-panel"><div class="bp-head"><div><h2>Prévia e arquivos</h2><p>2 JPEGs finais + JSON de metadados.</p></div></div><div class="bp-body">${resultHtml()}</div></section></div>
    <section class="banner-panel"><div class="bp-head"><div><h3>Histórico</h3><p>Últimos 25 registros.</p></div><button class="banner-btn alt" id="refreshBannerHistory">Atualizar</button></div><div class="bp-body"><div class="banner-history">${state.history.length?state.history.map(h=>`<div class="banner-history-item"><div><b>${esc(h.nome||'Banner')}</b><small>${esc(PROFILE[h.tipo]?.label||h.tipo||'')} · ${esc(new Date(h.criado_em||0).toLocaleString('pt-BR'))}</small></div><span class="banner-status ok">${esc(h.status||'gerado')}</span></div>`).join(''):'<div class="banner-note">Nenhum banner gerado.</div>'}</div></div></section>
  </div>`;
  bind();if(state.result)requestAnimationFrame(renderPreviews);
}

function resultHtml(){
  if(!state.result)return'<div class="banner-note">As duas prévias aparecerão aqui após a geração.</div>';
  const c=state.result.copy||{};
  return `<div class="banner-copy"><div class="copy-row"><small>Headline</small><strong>${esc(c.headline||'—')}</strong></div><div class="copy-row"><small>Subtítulo</small><strong>${esc(c.subtitle||'—')}</strong></div><div class="copy-row"><small>CTA</small><strong>${esc(c.cta||'—')}</strong></div><div class="copy-row"><small>ALT</small><strong>${esc(c.alt||'—')}</strong></div></div><div class="banner-preview-list" id="bannerPreviewList" style="margin-top:14px"></div><div class="banner-toolbar" style="margin-top:14px"><button class="banner-btn" id="downloadDesktop">Baixar Desktop</button><button class="banner-btn alt" id="downloadMobile">Baixar Celular</button><button class="banner-btn alt" id="downloadMeta">Baixar dados .json</button></div>`;
}

function bind(){
  $$('[data-banner-type]').forEach(b=>b.onclick=()=>{state.type=b.dataset.bannerType;state.result=null;render()});
  $('#saveBannerWebhook').onclick=()=>{saveSettings({...settings(),webhook:text($('#bannerWebhook').value)});toast('Webhook de banners salvo.');render()};
  $('#bnProduct').onchange=e=>{const p=state.products.find(x=>x.__key===e.target.value);if(p){$('#bnPrice').value=pPrice(p)||'';if(!$('#bnName').value)$('#bnName').value=p.nome||'';}};
  $('#generateBanner').onclick=generate;
  $('#clearBanner').onclick=()=>{state.result=null;render()};
  $('#refreshBannerHistory').onclick=()=>load(true);
  if($('#downloadDesktop'))$('#downloadDesktop').onclick=()=>downloadCanvas('desktop');
  if($('#downloadMobile'))$('#downloadMobile').onclick=()=>downloadCanvas('mobile');
  if($('#downloadMeta'))$('#downloadMeta').onclick=downloadMeta;
}

function payload(){
  const product=state.products.find(x=>x.__key===$('#bnProduct').value)||null,p=profile();
  return {action:'generate_banner_pair',request_id:bannerId(),build:BUILD,banner:{type:state.type,label:p.label,desktop:{width:p.desktop[0],height:p.desktop[1]},mobile:{width:p.mobile[0],height:p.mobile[1]},mobile_upload:p.mobileUpload?{width:p.mobileUpload[0],height:p.mobileUpload[1]}:null},campaign:{name:text($('#bnName').value),objective:text($('#bnObjective').value),headline:text($('#bnHeadline').value),cta:text($('#bnCta').value),link:text($('#bnLink').value),style:text($('#bnStyle').value),variation:text($('#bnVariation').value),notes:text($('#bnNotes').value),start:text($('#bnStart').value),end:text($('#bnEnd').value),price:Number($('#bnPrice').value||0)||0,old_price:Number($('#bnOldPrice').value||0)||0},product:product?{firebase_key:product.__key,sku:text(product.codigo),name:text(product.nome),image_url:pImage(product),price:pPrice(product),category:text(product.categoria),subcategory:text(product.subcategoria)}:null,brand:{name:'Caneca Fácil',language:'pt-BR',country:'BR'},rules:{two_independent_images:true,no_text_in_ai_image:true,no_logos_in_ai_image:true,no_prices_in_ai_image:true,empty_space_for_copy:true,final_text_rendered_by_browser:true,lojaintegrada_max_kb:MAX_KB}};
}

async function generate(){
  const webhook=text(settings().webhook||window.__CANECAS_ADMIN_CONFIG__?.bannerWebhook);
  if(!webhook)return toast('Configure o webhook de banners.',true);
  const req=payload();if(!req.campaign.name&&!req.campaign.objective&&!req.product)return toast('Informe campanha, objetivo ou produto.',true);
  state.busy=true;render();
  try{
    const r=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(req)}),raw=await r.text();
    if(!r.ok)throw new Error(`Make ${r.status}: ${raw.slice(0,220)}`);
    let out;try{out=JSON.parse(raw)}catch{throw new Error('O Make não respondeu JSON válido.')}
    if(out.ok===false)throw new Error(out.error||'Falha informada pelo Make.');
    let creative=out.creative||out.creative_json||out.copy||{};
    if(typeof creative==='string'){try{creative=JSON.parse(creative)}catch{creative={}}}
    const desktop=getImageSource(out,'desktop');
    const mobile=getImageSource(out,'mobile');
    if(!desktop)throw new Error('O cenário não retornou a imagem DESKTOP. Importe o blueprint V2.');
    if(!mobile)throw new Error('O cenário não retornou a imagem MOBILE. Cada criação precisa de 2 imagens.');
    state.result={id:req.request_id,payload:req,images:{desktop,mobile},copy:{headline:text(creative.headline||req.campaign.headline||req.campaign.name),subtitle:text(creative.subtitle||req.campaign.objective),cta:text(creative.cta||req.campaign.cta||'Personalize agora'),alt:text(creative.alt||req.campaign.name),text_color:text(creative.text_color||'#111111'),accent_color:text(creative.accent_color||'#18b8b8'),overlay:Number(creative.overlay)||0.48}};
    await fbWrite(`${BANNER_NODE}/${safeKey(req.request_id)}`,{nome:req.campaign.name||req.product?.name||'Banner',tipo:state.type,status:'gerado_par',copy:state.result.copy,tem_desktop:true,tem_mobile:true,link:req.campaign.link,inicio:req.campaign.start,fim:req.campaign.end,dimensoes:{desktop:req.banner.desktop,mobile:req.banner.mobile},criado_em:nowIso()},'PUT');
    await audit('banner_ia_par_gerado',{banner_id:req.request_id,tipo:state.type,desktop:req.banner.desktop,mobile:req.banner.mobile});
    state.history.unshift({id:req.request_id,nome:req.campaign.name||req.product?.name,tipo:state.type,status:'desktop + celular',criado_em:nowIso()});
    toast('Banner desktop + celular gerados.');
  }catch(e){toast(e.message||e,true)}finally{state.busy=false;render()}
}

function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();if(!/^data:/i.test(url))img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Não foi possível carregar uma das imagens geradas.'));img.src=url})}
async function tryLoadImage(url){if(!url)return null;try{return await loadImage(url)}catch{return null}}
function cover(ctx,img,x,y,w,h){const s=Math.max(w/img.width,h/img.height),dw=img.width*s,dh=img.height*s;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}
function contain(ctx,img,x,y,w,h){const s=Math.min(w/img.width,h/img.height),dw=img.width*s,dh=img.height*s;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}
function wrap(ctx,value,maxWidth,maxLines=2){const words=text(value).split(/\s+/),lines=[];let line='';for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;if(lines.length>=maxLines-1)break}else line=test}if(line&&lines.length<maxLines)lines.push(line);return lines}

async function buildCanvas(kind){
  if(!state.result)throw new Error('Nenhum banner gerado.');
  const dims=profile()[kind],canvas=document.createElement('canvas');canvas.width=dims[0];canvas.height=dims[1];
  const ctx=canvas.getContext('2d'),bg=await loadImage(state.result.images[kind]);cover(ctx,bg,0,0,canvas.width,canvas.height);
  const c=state.result.copy,payload=state.result.payload,productUrl=payload.product?.image_url||'';
  const product=await tryLoadImage(productUrl);
  const isMobile=kind==='mobile',small=canvas.height<=90;
  const pad=Math.max(12,Math.round(Math.min(canvas.width,canvas.height)*.055));
  const textW=isMobile&&!small?canvas.width*.78:canvas.width*(small?.7:.50);
  const boxX=pad*.55,boxY=pad*.55,boxH=small?canvas.height-pad*1.1:canvas.height-pad*1.1;
  const overlay=Math.min(.92,Math.max(.55,Number(c.overlay||.48)+.28));
  ctx.fillStyle=`rgba(255,255,255,${overlay})`;ctx.fillRect(boxX,boxY,textW+pad,boxH);
  ctx.fillStyle=c.text_color||'#111111';
  const titleSize=small?Math.max(13,Math.round(canvas.height*.29)):Math.max(18,Math.round(canvas.height*(isMobile?.075:.14)));
  ctx.font=`800 ${titleSize}px Arial`;let y=small?canvas.height*.57:boxY+titleSize*1.45;
  for(const line of wrap(ctx,c.headline,textW,small?1:2)){ctx.fillText(line,pad,y);y+=titleSize*1.12}
  if(!small&&c.subtitle){const subSize=Math.max(12,Math.round(canvas.height*(isMobile?.035:.055)));ctx.font=`500 ${subSize}px Arial`;y+=subSize*.35;for(const line of wrap(ctx,c.subtitle,textW,isMobile?3:2)){ctx.fillText(line,pad,y);y+=subSize*1.22}}
  if(!small&&c.cta){const ctaSize=Math.max(12,Math.round(canvas.height*(isMobile?.032:.05)));ctx.font=`700 ${ctaSize}px Arial`;const label=c.cta;const w=ctx.measureText(label).width+ctaSize*1.7,h=ctaSize*2.25,x=pad,yy=canvas.height-pad-h;ctx.fillStyle=c.accent_color||'#18b8b8';ctx.fillRect(x,yy,w,h);ctx.fillStyle='#fff';ctx.fillText(label,x+ctaSize*.85,yy+ctaSize*1.5)}
  if(product&&!small){
    if(isMobile){const areaW=canvas.width*.48,areaH=canvas.height*.42;contain(ctx,product,canvas.width-areaW-pad*.4,canvas.height-areaH-pad*.5,areaW,areaH)}
    else{const areaW=canvas.width*.38,areaH=canvas.height*.88;contain(ctx,product,canvas.width-areaW-pad*.6,pad*.45,areaW,areaH)}
  }
  return canvas;
}

async function renderPreviews(){
  const root=$('#bannerPreviewList');if(!root||!state.result)return;root.innerHTML='';
  for(const kind of ['desktop','mobile']){
    try{const card=document.createElement('div');card.className='banner-preview-card';const title=document.createElement('div');title.className='banner-note';title.innerHTML=`<strong>${kind==='desktop'?'Desktop':'Celular'}</strong> · ${fmtDims(profile()[kind])}`;const canvas=await buildCanvas(kind);canvas.style.width='100%';canvas.style.height='auto';canvas.dataset.bannerCanvas=kind;card.append(title,canvas);root.appendChild(card)}catch(e){root.innerHTML+=`<div class="banner-note warn">${esc(kind)}: ${esc(e.message||e)}</div>`}
  }
}

async function jpegBlobUnderLimit(canvas,maxKb=MAX_KB){
  const max=maxKb*1024;let last=null;
  for(const q of [.90,.82,.74,.66,.58,.50,.42,.34]){last=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao exportar JPEG.')),'image/jpeg',q));if(last.size<=max)return {blob:last,quality:q,ok:true}}
  return {blob:last,quality:.34,ok:last?.size<=max};
}

async function downloadCanvas(kind){
  try{let canvas=$(`[data-banner-canvas="${kind}"]`);if(!canvas)canvas=await buildCanvas(kind);const encoded=await jpegBlobUnderLimit(canvas);if(!encoded.ok)toast(`Atenção: ${kind} ficou com ${Math.round(encoded.blob.size/1024)} KB; tente uma arte mais simples.`,true);const url=URL.createObjectURL(encoded.blob),a=document.createElement('a');a.href=url;a.download=`canecafacil-${state.type}-${kind}-${canvas.width}x${canvas.height}.jpg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}catch(e){toast(e.message||e,true)}
}

function downloadMeta(){
  if(!state.result)return;const meta={...state.result.payload,copy:state.result.copy,files:{desktop:`canecafacil-${state.type}-desktop-${profile().desktop.join('x')}.jpg`,mobile:`canecafacil-${state.type}-mobile-${profile().mobile.join('x')}.jpg`},lojaintegrada:{max_kb:MAX_KB,formats:['JPG','PNG'],mobile_specific_image:true,mobile_breakpoint:'<767px'}};const blob=new Blob([JSON.stringify(meta,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`canecafacil-banner-${state.result.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)
}

window.addEventListener('admin-canecas:route',e=>{if(e.detail?.route==='banners')load(Boolean(e.detail?.force))});
if(location.hash.includes('banners'))load();
document.documentElement.dataset.bannerManager=BUILD;
