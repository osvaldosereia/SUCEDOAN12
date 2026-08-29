import { fbGet, fbWrite, audit, isMug, mugImage, money, nowIso, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD='20260829-banner-manager-v1';
const BANNER_NODE='canecas/banners_ia';
const SETTINGS_KEY='da_admin_canecas_banner_v1';
const PROFILE={
  full:{label:'Full Banner',desktop:[1920,300],mobile:[722,888],hint:'Destaque principal da home.'},
  mini:{label:'Mini Banner',desktop:[360,200],mobile:[360,200],hint:'Blocos menores da página inicial.'},
  tarja:{label:'Banner Tarja',desktop:[1920,70],mobile:[361,70],hint:'Frete, cupom e mensagens curtas.'},
  vitrine:{label:'Banner Vitrine',desktop:[850,200],mobile:[850,200],hint:'Campanha entre vitrines de produtos.'}
};
const state={products:[],history:[],type:'full',result:null,background:null,canvases:{},busy:false};
let initialized=false;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const text=v=>String(v??'').trim();
const settings=()=>{try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}catch{return{}}};
const saveSettings=v=>localStorage.setItem(SETTINGS_KEY,JSON.stringify(v));
const fmtDate=v=>{const d=new Date(v||0);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR')};

function bannerId(){return safeKey(`BN-${Date.now()}-${Math.random().toString(36).slice(2,7)}`).toUpperCase()}
function currentProfile(){return PROFILE[state.type]||PROFILE.full}
function productImage(p={}){return mugImage(p)||text(p.url_imagem||p.imagem_url||p.imagem)}
function productPrice(p={}){return Number(p.preco_oferta||p.preco||p.valor_venda||0)||0}
function notify(message,error=false){const toast=$('#toast');if(!toast){alert(message);return}toast.textContent=message;toast.className=`toast${error?' error':''}`;toast.hidden=false;clearTimeout(notify.t);notify.t=setTimeout(()=>toast.hidden=true,error?5200:3000)}

async function init(){
  if(initialized)return; initialized=true;
  const nav=$('#bannerNavButton');
  if(!nav)return;
  nav.addEventListener('click',openView);
  $$('#nav [data-route]').forEach(b=>b.addEventListener('click',()=>nav.classList.remove('active')));
  renderSkeleton();
  await Promise.all([loadProducts(),loadHistory()]);
  render();
}

function openView(){
  $$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view==='banners'));
  $$('#nav button').forEach(b=>b.classList.remove('active'));
  $('#bannerNavButton')?.classList.add('active');
  if($('#pageTitle'))$('#pageTitle').textContent='Banners IA';
  if($('#pageSubtitle'))$('#pageSubtitle').textContent='Criação inteligente para os formatos da Loja Integrada.';
  $('#sidebar')?.classList.remove('open');
  render();
}

async function loadProducts(){
  try{const data=await fbGet('produtos');state.products=Object.entries(data||{}).map(([__key,v])=>({__key,...(v||{})})).filter(isMug).sort((a,b)=>text(a.nome).localeCompare(text(b.nome),'pt-BR'))}catch(e){console.warn('[banners] produtos',e)}
}
async function loadHistory(){
  try{const data=await fbGet(BANNER_NODE);state.history=Object.entries(data||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>new Date(b.criado_em||0)-new Date(a.criado_em||0)).slice(0,25)}catch(e){console.warn('[banners] histórico',e)}
}

function renderSkeleton(){const root=$('#banners');if(root)root.innerHTML='<div class="banner-loading show">Carregando gerador de banners…</div>'}
function render(){
  const root=$('#banners'); if(!root)return;
  const cfg=settings(); const p=currentProfile();
  root.innerHTML=`<div class="banner-shell">
    <div class="banner-note warn"><strong>Fluxo seguro para Loja Integrada.</strong> O gerador cria as artes, textos, ALT, links e datas prontos para cadastro. A API pública da Loja Integrada ainda não expõe banners nativos; por isso a publicação final permanece manual/agendada no próprio painel.</div>
    <section class="banner-panel"><div class="bp-head"><div><h2>Conexão com Make + OpenAI</h2><p>Use um webhook exclusivo do cenário de banners.</p></div><span class="banner-status ${cfg.webhook?'ok':''}">${cfg.webhook?'Configurado':'Pendente'}</span></div><div class="bp-body"><div class="banner-config"><input id="bannerWebhook" placeholder="https://hook.eu1.make.com/..." value="${esc(cfg.webhook||window.__CANECAS_ADMIN_CONFIG__?.bannerWebhook||'')}"><button class="banner-btn alt" id="saveBannerWebhook">Salvar webhook</button></div><div class="banner-dims">O token/chave OpenAI fica somente dentro do Make. Nunca coloque chave privada neste admin.</div></div></section>
    <div class="banner-grid"><section class="banner-panel"><div class="bp-head"><div><h2>Novo banner</h2><p>Escolha o formato e descreva a campanha. A IA cria a direção visual e o texto.</p></div></div><div class="bp-body">
      <div class="banner-profile">${Object.entries(PROFILE).map(([k,v])=>`<button type="button" data-banner-type="${k}" class="${k===state.type?'active':''}"><b>${v.label}</b><small>${v.desktop[0]}×${v.desktop[1]}</small></button>`).join('')}</div>
      <div class="banner-note" style="margin-top:12px"><strong>${p.label}:</strong> ${p.hint}<br>Desktop ${p.desktop[0]}×${p.desktop[1]} px${p.mobile.join('x')!==p.desktop.join('x')?` · Mobile ${p.mobile[0]}×${p.mobile[1]} px`:''}.</div>
      <div class="banner-form" style="margin-top:14px">
        <label>Nome da campanha<input id="bnName" placeholder="Ex.: Dia dos Pais 2026"></label>
        <label>Produto<select id="bnProduct"><option value="">Sem produto específico</option>${state.products.map(x=>`<option value="${esc(x.__key)}">${esc(x.nome||x.codigo||x.__key)}</option>`).join('')}</select></label>
        <label class="span2">Objetivo / oferta<textarea id="bnObjective" placeholder="Ex.: divulgar canecas personalizadas para presente, com entrega para todo o Brasil"></textarea></label>
        <label>Preço atual<input id="bnPrice" type="number" min="0" step="0.01" placeholder="39,90"></label>
        <label>Preço anterior<input id="bnOldPrice" type="number" min="0" step="0.01" placeholder="49,90"></label>
        <label>Chamada opcional<input id="bnHeadline" placeholder="Deixe vazio para a IA criar"></label>
        <label>CTA opcional<input id="bnCta" placeholder="Ex.: Personalize agora"></label>
        <label class="span2">Link do banner<input id="bnLink" placeholder="https://..."></label>
        <label>Estilo<select id="bnStyle"><option value="moderno-minimalista">Moderno e minimalista</option><option value="premium-editorial">Premium editorial</option><option value="alegre-presenteavel">Alegre / presenteável</option><option value="religioso-elegante">Religioso elegante</option><option value="promocional-limpo">Promocional limpo</option></select></label>
        <label>Variação<select id="bnVariation"><option value="equilibrada">Equilibrada</option><option value="produto-destaque">Produto em destaque</option><option value="tipografia-destaque">Texto em destaque</option><option value="visual-destaque">Visual em destaque</option></select></label>
        <label>Início<input id="bnStart" type="datetime-local"></label>
        <label>Fim<input id="bnEnd" type="datetime-local"></label>
        <label class="span2">Observações para a IA<textarea id="bnNotes" placeholder="Cores, público, tema, elementos que deseja ou quer evitar…"></textarea></label>
      </div>
      <div class="banner-loading ${state.busy?'show':''}" id="bnLoading">Gerando conceito, fundo e composição…</div>
      <div class="banner-toolbar" style="margin-top:14px"><button class="banner-btn teal" id="generateBanner" ${state.busy?'disabled':''}>Gerar banner com IA</button><button class="banner-btn alt" id="clearBanner">Limpar</button></div>
    </div></section>
    <section class="banner-panel"><div class="bp-head"><div><h2>Prévia e arquivos</h2><p>Texto e preço são desenhados pelo sistema, não pela IA.</p></div></div><div class="bp-body">${renderResult()}</div></section></div>
    <section class="banner-panel"><div class="bp-head"><div><h3>Histórico</h3><p>Metadados salvos no Firebase; imagens finais são baixadas localmente.</p></div><button class="banner-btn alt" id="refreshBannerHistory">Atualizar</button></div><div class="bp-body"><div class="banner-history">${state.history.length?state.history.map(historyItem).join(''):'<div class="banner-note">Nenhum banner gerado ainda.</div>'}</div></div></section>
  </div>`;
  bind();
  if(state.result)requestAnimationFrame(()=>renderCanvases().catch(e=>notify(e.message||e,true)));
}

function renderResult(){
  if(!state.result)return '<div class="banner-note">A prévia aparecerá aqui depois da geração. O arquivo final é exportado em JPEG otimizado para ficar abaixo de 500 KB sempre que possível.</div>';
  const c=state.result.copy||{};
  return `<div class="banner-copy"><div class="copy-row"><small>Headline</small><strong>${esc(c.headline||'—')}</strong></div><div class="copy-row"><small>Subtítulo</small><strong>${esc(c.subtitle||'—')}</strong></div><div class="copy-row"><small>CTA</small><strong>${esc(c.cta||'—')}</strong></div><div class="copy-row"><small>ALT / nome SEO</small><strong>${esc(c.alt||'—')}</strong></div></div><div class="banner-preview-list" id="bannerPreviewList" style="margin-top:14px"></div><div class="banner-toolbar" style="margin-top:14px"><button class="banner-btn" id="downloadDesktop">Baixar desktop</button>${currentProfile().mobile.join('x')!==currentProfile().desktop.join('x')?'<button class="banner-btn alt" id="downloadMobile">Baixar mobile</button>':''}<button class="banner-btn alt" id="downloadMeta">Baixar dados .json</button></div>`;
}

function historyItem(x){const p=PROFILE[x.tipo]||PROFILE.full;return `<div class="banner-history-item"><div><b>${esc(x.nome||'Banner')}</b><small>${esc(p.label)} · ${esc(fmtDate(x.criado_em))}${x.inicio?` · inicia ${esc(fmtDate(x.inicio))}`:''}</small></div><span class="banner-status ok">${esc(x.status||'gerado')}</span></div>`}

function bind(){
  $$('[data-banner-type]').forEach(b=>b.onclick=()=>{state.type=b.dataset.bannerType;state.result=null;state.background=null;state.canvases={};render()});
  $('#saveBannerWebhook')?.addEventListener('click',()=>{const webhook=text($('#bannerWebhook')?.value);saveSettings({...settings(),webhook});notify('Webhook de banners salvo.');render()});
  $('#bnProduct')?.addEventListener('change',e=>{const p=state.products.find(x=>x.__key===e.target.value);if(!p)return;$('#bnPrice').value=productPrice(p)||'';if(!$('#bnName').value)$('#bnName').value=p.nome||''});
  $('#generateBanner')?.addEventListener('click',generate);
  $('#clearBanner')?.addEventListener('click',()=>{state.result=null;state.background=null;state.canvases={};render()});
  $('#refreshBannerHistory')?.addEventListener('click',async()=>{await loadHistory();render()});
  $('#downloadDesktop')?.addEventListener('click',()=>downloadCanvas('desktop'));
  $('#downloadMobile')?.addEventListener('click',()=>downloadCanvas('mobile'));
  $('#downloadMeta')?.addEventListener('click',downloadMeta);
}

function formPayload(){
  const product=state.products.find(x=>x.__key===$('#bnProduct')?.value)||null;
  const p=currentProfile();
  return {
    action:'generate_banner',request_id:bannerId(),build:BUILD,
    banner:{type:state.type,label:p.label,desktop:{width:p.desktop[0],height:p.desktop[1]},mobile:{width:p.mobile[0],height:p.mobile[1]}},
    campaign:{name:text($('#bnName')?.value),objective:text($('#bnObjective')?.value),headline:text($('#bnHeadline')?.value),cta:text($('#bnCta')?.value),link:text($('#bnLink')?.value),style:text($('#bnStyle')?.value),variation:text($('#bnVariation')?.value),notes:text($('#bnNotes')?.value),start:text($('#bnStart')?.value),end:text($('#bnEnd')?.value),price:Number($('#bnPrice')?.value||0)||0,old_price:Number($('#bnOldPrice')?.value||0)||0},
    product:product?{firebase_key:product.__key,sku:text(product.codigo),name:text(product.nome),image_url:productImage(product),price:productPrice(product),category:text(product.categoria),subcategory:text(product.subcategoria)}:null,
    brand:{name:'Caneca Fácil',language:'pt-BR',country:'BR'},
    rules:{no_text_in_ai_image:true,no_logos_in_ai_image:true,no_prices_in_ai_image:true,empty_space_for_copy:true,final_text_rendered_by_browser:true,lojaintegrada_max_kb:500}
  };
}

async function generate(){
  const cfg=settings(); const webhook=text(cfg.webhook||window.__CANECAS_ADMIN_CONFIG__?.bannerWebhook);
  if(!webhook){notify('Salve primeiro o webhook exclusivo do cenário de banners.',true);return}
  const payload=formPayload();
  if(!payload.campaign.name&&!payload.campaign.objective&&!payload.product){notify('Informe ao menos o nome, o objetivo da campanha ou um produto.',true);return}
  state.busy=true;render();
  try{
    const r=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
    const raw=await r.text(); if(!r.ok)throw new Error(`Make ${r.status}: ${raw.slice(0,220)}`);
    let out; try{out=JSON.parse(raw)}catch{throw new Error('O Make não respondeu JSON válido. Confira o módulo Webhook Response.')}
    if(out.ok===false)throw new Error(out.error||'Falha informada pelo cenário Make.');
    let creative=out.creative||out.creative_json||out.copy||{};
    if(typeof creative==='string'){try{creative=JSON.parse(creative)}catch{creative={headline:payload.campaign.headline||payload.campaign.name,subtitle:payload.campaign.objective,cta:payload.campaign.cta||'Saiba mais',alt:payload.campaign.name,visual_prompt:creative}}}
    const image=out.image||{};
    state.result={id:payload.request_id,payload,copy:{headline:text(creative.headline||payload.campaign.headline||payload.campaign.name),subtitle:text(creative.subtitle||payload.campaign.objective),cta:text(creative.cta||payload.campaign.cta||'Personalize agora'),alt:text(creative.alt||`${currentProfile().label} ${payload.campaign.name||payload.product?.name||'Caneca Fácil'}`)},design:{text_color:text(creative.text_color||'#ffffff'),accent_color:text(creative.accent_color||'#18b8b8'),overlay:Number(creative.overlay??0.48),align:text(creative.align||'left'),product_side:text(creative.product_side||'right')},visual_prompt:text(creative.visual_prompt),image};
    state.background=await loadBackground(image);
    await saveCampaign(state.result);
    await loadHistory();
    notify('Banner gerado. Confira a prévia e baixe os arquivos.');
  }catch(e){console.error(e);notify(e.message||String(e),true);state.result=null;state.background=null}finally{state.busy=false;render()}
}

async function loadBackground(image={}){
  const b64=text(image.b64||image.b64_json||image.base64); const url=text(image.url);
  if(!b64&&!url)return null;
  const src=b64?`data:${text(image.mime)||'image/jpeg'};base64,${b64}`:url;
  return loadImage(src);
}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Não foi possível carregar a imagem gerada pela IA.'));img.src=src})}
async function maybeProductImage(){const p=state.result?.payload?.product;if(!p?.image_url)return null;try{return await loadImage(p.image_url)}catch{return null}}

async function renderCanvases(){
  const list=$('#bannerPreviewList'); if(!list||!state.result)return;
  list.innerHTML=''; state.canvases={}; const p=currentProfile(); const product=await maybeProductImage();
  for(const [kind,dims] of [['desktop',p.desktop],['mobile',p.mobile]]){
    if(kind==='mobile'&&p.mobile.join('x')===p.desktop.join('x'))continue;
    const canvas=document.createElement('canvas');canvas.width=dims[0];canvas.height=dims[1];
    drawBanner(canvas,kind,product);state.canvases[kind]=canvas;
    const card=document.createElement('div');card.className='banner-preview-card';card.innerHTML=`<div class="meta"><strong>${kind==='desktop'?'Desktop':'Mobile'} · ${dims[0]}×${dims[1]} px</strong><span class="banner-status ok">pronto</span></div><div class="banner-preview-wrap"></div>`;card.querySelector('.banner-preview-wrap').appendChild(canvas);list.appendChild(card);
  }
  if(!state.canvases.mobile&&state.canvases.desktop)state.canvases.mobile=state.canvases.desktop;
}

function drawBanner(canvas,kind,productImg){
  const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;const r=state.result;const campaign=r.payload.campaign;const isTarja=state.type==='tarja';
  ctx.clearRect(0,0,w,h);
  if(state.background)coverImage(ctx,state.background,0,0,w,h);else{const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#101315');g.addColorStop(1,'#2d353a');ctx.fillStyle=g;ctx.fillRect(0,0,w,h)}
  const overlay=Math.min(.72,Math.max(.18,Number(r.design.overlay)||.48));const gr=ctx.createLinearGradient(0,0,w,0);gr.addColorStop(0,`rgba(8,12,15,${overlay+.18})`);gr.addColorStop(.58,`rgba(8,12,15,${overlay})`);gr.addColorStop(1,'rgba(8,12,15,.08)');ctx.fillStyle=gr;ctx.fillRect(0,0,w,h);
  const productSide=r.design.product_side==='left'?'left':'right';
  if(productImg&&!isTarja){const boxW=kind==='mobile'?w*.74:w*.38,boxH=kind==='mobile'?h*.42:h*.9;const x=productSide==='right'?w-boxW-w*.035:w*.035;const y=kind==='mobile'?h-boxH-h*.03:(h-boxH)/2;containImage(ctx,productImg,x,y,boxW,boxH)}
  const color=safeColor(r.design.text_color,'#fff');const accent=safeColor(r.design.accent_color,'#22b7b9');ctx.textBaseline='top';
  if(isTarja){drawTarja(ctx,w,h,r,campaign,color,accent);return}
  const mobile=kind==='mobile';const left=mobile?w*.075:w*.055;const maxW=mobile?w*.85:(productImg?w*.52:w*.72);let y=mobile?h*.10:h*.16;
  const headline=r.copy.headline||campaign.name||'Caneca Fácil';const subtitle=r.copy.subtitle||campaign.objective||'';const price=Number(campaign.price||0);const old=Number(campaign.old_price||0);
  const headlineSize=Math.max(22,Math.round(mobile?w*.073:Math.min(h*.21,w*.038)));ctx.font=`800 ${headlineSize}px Arial,Helvetica,sans-serif`;ctx.fillStyle=color;y=wrapText(ctx,headline,left,y,maxW,headlineSize*1.06,3)+headlineSize*.22;
  if(subtitle){const fs=Math.max(14,Math.round(mobile?w*.036:Math.min(h*.085,w*.016)));ctx.font=`500 ${fs}px Arial,Helvetica,sans-serif`;ctx.fillStyle='rgba(255,255,255,.92)';y=wrapText(ctx,subtitle,left,y,maxW,fs*1.34,3)+fs*.45}
  if(price){const fs=Math.max(20,Math.round(mobile?w*.063:Math.min(h*.16,w*.03)));if(old){ctx.font=`500 ${Math.round(fs*.46)}px Arial`;ctx.fillStyle='rgba(255,255,255,.74)';ctx.fillText(`de ${money(old)}`,left,y);y+=fs*.56}ctx.font=`900 ${fs}px Arial`;ctx.fillStyle=color;ctx.fillText(price<10?money(price):money(price),left,y);y+=fs*1.16}
  const cta=r.copy.cta||campaign.cta;if(cta){const fs=Math.max(13,Math.round(mobile?w*.034:Math.min(h*.07,w*.014)));ctx.font=`800 ${fs}px Arial`;const padX=fs*1.15,padY=fs*.66;const tw=Math.min(maxW,ctx.measureText(cta).width+padX*2);roundRect(ctx,left,y,tw,fs+padY*1.28,Math.min(18,fs*.7));ctx.fillStyle=accent;ctx.fill();ctx.fillStyle='#fff';ctx.fillText(cta,left+padX,y+padY*.58)}
}
function drawTarja(ctx,w,h,r,campaign,color,accent){const fs=Math.max(18,Math.round(h*.36));const headline=r.copy.headline||campaign.name||'Caneca Fácil';const cta=r.copy.cta||campaign.cta||'';ctx.font=`800 ${fs}px Arial`;ctx.fillStyle=color;ctx.fillText(headline,w*.035,(h-fs)/2);if(cta){ctx.font=`800 ${Math.max(13,Math.round(fs*.62))}px Arial`;const tw=ctx.measureText(cta).width;ctx.fillStyle=accent;ctx.fillText(cta,w-tw-w*.035,(h-Math.max(13,Math.round(fs*.62)))/2)}}
function safeColor(v,fallback){return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text(v))?v:fallback}
function wrapText(ctx,value,x,y,maxWidth,lineHeight,maxLines=3){const words=text(value).split(/\s+/);let line='',lines=0;for(let i=0;i<words.length;i++){const test=line?`${line} ${words[i]}`:words[i];if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y);y+=lineHeight;lines++;line=words[i];if(lines>=maxLines-1){let rest=[line,...words.slice(i+1)].join(' ');while(ctx.measureText(`${rest}…`).width>maxWidth&&rest.length>3)rest=rest.slice(0,-1);ctx.fillText(`${rest}…`,x,y);return y+lineHeight}}else line=test}if(line){ctx.fillText(line,x,y);y+=lineHeight}return y}
function coverImage(ctx,img,x,y,w,h){const s=Math.max(w/img.width,h/img.height),sw=w/s,sh=h/s,sx=(img.width-sw)/2,sy=(img.height-sh)/2;ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h)}
function containImage(ctx,img,x,y,w,h){const s=Math.min(w/img.width,h/img.height),dw=img.width*s,dh=img.height*s;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}
function roundRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}

async function optimizedBlob(canvas){for(const q of [.9,.84,.78,.72,.66,.58]){const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',q));if(blob&&blob.size<=490*1024)return blob}return new Promise(r=>canvas.toBlob(r,'image/jpeg',.52))}
async function downloadCanvas(kind){const canvas=state.canvases[kind]||state.canvases.desktop;if(!canvas){notify('A prévia ainda não está pronta.',true);return}const blob=await optimizedBlob(canvas);const name=safeFile(`${state.type}-${state.result?.payload?.campaign?.name||'caneca-facil'}-${kind}.jpg`);downloadBlob(blob,name);notify(`Arquivo ${Math.round(blob.size/1024)} KB preparado.`)}
function downloadMeta(){if(!state.result)return;const data={...state.result, image:{included:false,note:'A imagem base64 não é gravada neste JSON.'},lojaintegrada:{tipo:state.type,desktop:currentProfile().desktop,mobile:currentProfile().mobile,nome_alt:state.result.copy.alt,link:state.result.payload.campaign.link,inicio:state.result.payload.campaign.start,fim:state.result.payload.campaign.end}};downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),safeFile(`${state.result.payload.campaign.name||'banner'}-dados.json`))}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function safeFile(v){return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9._-]+/gi,'-').replace(/-+/g,'-').toLowerCase()}

async function saveCampaign(result){
  const c=result.payload.campaign;const row={id:result.id,nome:c.name||result.copy.headline,tipo:state.type,status:'gerado',copy:result.copy,design:result.design,link:c.link||'',inicio:c.start||'',fim:c.end||'',produto:result.payload.product||null,dimensoes:{desktop:currentProfile().desktop,mobile:currentProfile().mobile},criado_em:nowIso(),atualizado_em:nowIso(),make:{scenario:'CANECA FACIL - BANNERS IA',request_id:result.id},lojaintegrada:{publicacao_automatica:false,motivo:'API publica sem endpoint de banners nativos'}};
  await fbWrite(`${BANNER_NODE}/${safeKey(result.id)}`,row,'PUT');await audit('banner_ia_gerado',{id:result.id,tipo:state.type,nome:row.nome});
}

document.addEventListener('DOMContentLoaded',init,{once:true});
if(document.readyState!=='loading')init();
