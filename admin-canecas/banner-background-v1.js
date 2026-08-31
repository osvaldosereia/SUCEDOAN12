import { fbGet, fbWrite, nowIso, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD='20260830-banner-background-v2';
const JOB_NODE='canecas/banner_jobs';
const BANNER_NODE='canecas/banners_ia';
const ASSET_NODE='canecas/banners_ia_assets';
const STORAGE_KEY='cf_banner_jobs_v1';
const MAX_KB=500;
const nativeFetch=window.fetch.bind(window);
const jobs=new Map();

const text=v=>String(v??'').trim();
const now=()=>Date.now();
const safePayload=req=>({
  request_id:text(req?.request_id),
  action:text(req?.action),
  build:text(req?.build),
  fit_build:text(req?.fit_build),
  banner:req?.banner||{},
  prompt:text(req?.prompt),
  instruction_ids:Array.isArray(req?.instruction_ids)?req.instruction_ids:[],
  images:Array.isArray(req?.images)?req.images:[]
});

function loadLocal(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    Object.entries(raw||{}).forEach(([id,v])=>jobs.set(id,{id,...(v||{})}));
  }catch{}
}
function saveLocal(){
  const out={};
  [...jobs.values()].slice(-20).forEach(j=>out[j.id]=j);
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(out))}catch{}
}
function setJob(id,patch={}){
  if(!id)return;
  const current=jobs.get(id)||{id,created_at:nowIso(),created_ms:now()};
  const next={...current,...patch,id,updated_at:nowIso(),updated_ms:now()};
  jobs.set(id,next);saveLocal();renderIndicator();return next;
}
function activeJobs(){return [...jobs.values()].filter(j=>['preparando','gerando','finalizando','salvando'].includes(j.status))}
function latestActive(){return activeJobs().sort((a,b)=>(b.created_ms||0)-(a.created_ms||0))[0]}

function ensureStyles(){
  if(document.getElementById('bannerBackgroundStyles'))return;
  const s=document.createElement('style');s.id='bannerBackgroundStyles';s.textContent=`
  .cf-banner-bg-status{position:fixed;right:18px;bottom:18px;z-index:10050;display:none;min-width:240px;max-width:360px;padding:12px 14px;border-radius:14px;background:#111820;color:#fff;box-shadow:0 12px 34px rgba(0,0,0,.24);font:600 12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer}
  .cf-banner-bg-status.show{display:block}.cf-banner-bg-status b{display:block;font-size:13px;margin-bottom:3px}.cf-banner-bg-status small{display:block;color:#c7d0d8;font-weight:500}.cf-banner-bg-status i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#28c99a;margin-right:7px;box-shadow:0 0 0 4px rgba(40,201,154,.14)}
  `;document.head.appendChild(s);
}
function ensureIndicator(){
  ensureStyles();let el=document.getElementById('cfBannerBgStatus');if(el)return el;
  el=document.createElement('div');el.id='cfBannerBgStatus';el.className='cf-banner-bg-status';el.title='Abrir Banners IA';
  el.onclick=()=>document.querySelector('#nav [data-route="banners"]')?.click();document.body.appendChild(el);return el;
}
function renderIndicator(){
  const el=ensureIndicator(),active=activeJobs(),last=latestActive();
  if(!active.length){el.classList.remove('show');return}
  el.classList.add('show');
  const saving=['finalizando','salvando'].includes(last?.status);
  el.innerHTML=`<b><i></i>${active.length===1?'Banner sendo gerado':'Banners sendo gerados'} em segundo plano</b><small>${saving?'Recebendo as artes e salvando no Admin…':'Você pode navegar pelo Admin. O resultado será salvo automaticamente.'}</small>`;
}

async function persistJob(id,patch){
  const local=setJob(id,patch);
  try{await fbWrite(`${JOB_NODE}/${safeKey(id)}`,local,'PUT')}catch(e){console.warn('[Banner background] status Firebase:',e)}
}

function parseBannerRequest(input,init={}){
  const method=String(init?.method||'GET').toUpperCase();if(method!=='POST')return null;
  const url=typeof input==='string'?input:input?.url||'';
  if(!/^https:\/\/hook\.[^/]*make\.com\//i.test(url))return null;
  if(typeof init?.body!=='string')return null;
  try{
    const req=JSON.parse(init.body);
    if(req?.action!=='generate_final_banner_from_reference_mugs'||!req?.request_id)return null;
    return req;
  }catch{return null}
}

function outputDataUri(out,kind){
  const item=out?.images?.[kind]||out?.[kind]||{};
  const mime=text(item.mime||'image/jpeg');
  const b64=text(item.b64||item.base64||item.data).replace(/^data:[^;]+;base64,/i,'');
  if(b64)return `data:${mime};base64,${b64}`;
  return text(item.url||item.image_url);
}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Não foi possível carregar a imagem devolvida pelo Make.'));img.src=src})}
function coverCrop(ctx,img,w,h){
  const sourceRatio=img.width/img.height,targetRatio=w/h;
  let sx=0,sy=0,sw=img.width,sh=img.height;
  if(sourceRatio>targetRatio){sw=img.height*targetRatio;sx=(img.width-sw)/2}else{sh=img.width/targetRatio;sy=(img.height-sh)/2}
  ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h);
}
async function finalCanvas(src,width,height,type){
  const img=await loadImage(src),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  if(['full','mini'].includes(type))ctx.drawImage(img,0,0,width,height);
  else coverCrop(ctx,img,width,height);
  return canvas;
}
async function jpegUnderLimit(canvas,maxKb=MAX_KB){
  const max=maxKb*1024;let last=null;
  for(const q of [.92,.86,.80,.74,.68,.62,.56,.50,.44,.38,.32]){
    last=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao exportar banner.')),'image/jpeg',q));
    if(last.size<=max)return last;
  }
  if(!last||last.size>max)throw new Error(`Banner passou de ${maxKb} KB após compressão.`);
  return last;
}
function blobToDataUri(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob)})}

async function persistResponse(id,req,out){
  const desktopSrc=outputDataUri(out,'desktop'),mobileSrc=outputDataUri(out,'mobile');
  if(!desktopSrc||!mobileSrc)throw new Error('O Make terminou, mas não devolveu Desktop e Celular na resposta do webhook.');

  const type=text(req?.banner?.type||'full');
  const dw=Number(req?.banner?.desktop?.width||1270),dh=Number(req?.banner?.desktop?.height||444);
  const mw=Number(req?.banner?.mobile?.width||722),mh=Number(req?.banner?.mobile?.height||888);
  const [desktopCanvas,mobileCanvas]=await Promise.all([
    finalCanvas(desktopSrc,dw,dh,type),finalCanvas(mobileSrc,mw,mh,type)
  ]);
  const [desktopBlob,mobileBlob]=await Promise.all([jpegUnderLimit(desktopCanvas),jpegUnderLimit(mobileCanvas)]);
  const [desktopUri,mobileUri]=await Promise.all([blobToDataUri(desktopBlob),blobToDataUri(mobileBlob)]);

  const thumbCanvas=document.createElement('canvas');thumbCanvas.width=280;thumbCanvas.height=Math.max(60,Math.round(280*dh/dw));
  thumbCanvas.getContext('2d').drawImage(desktopCanvas,0,0,thumbCanvas.width,thumbCanvas.height);
  const thumb=thumbCanvas.toDataURL('image/jpeg',.62);
  const payload=safePayload(req);
  const created=nowIso();

  await persistJob(id,{status:'salvando',response_received_at:created});
  await fbWrite(`${ASSET_NODE}/${safeKey(id)}`,{
    desktop:{mime:'image/jpeg',data:desktopUri,bytes:desktopBlob.size,width:dw,height:dh},
    mobile:{mime:'image/jpeg',data:mobileUri,bytes:mobileBlob.size,width:mw,height:mh},
    criado_em:created,background_build:BUILD
  },'PUT');
  await fbWrite(`${BANNER_NODE}/${safeKey(id)}`,{
    nome:`${text(req?.banner?.label)||'Banner'} · ${new Date().toLocaleString('pt-BR')}`,
    tipo:type,status:'salvo',payload,
    produtos_count:payload.images.length,instrucoes_count:payload.instruction_ids.length,
    thumb,tem_desktop:true,tem_mobile:true,
    criado_em:created,atualizado_em:created,background_build:BUILD
  },'PUT');

  await persistJob(id,{status:'concluido',finished_at:nowIso(),error:''});
  jobs.delete(id);saveLocal();renderIndicator();
  refreshBannerView();
}

function refreshBannerView(){
  if(!location.hash.includes('banners'))return;
  let attempts=0;
  const tryRefresh=()=>{
    const btn=document.getElementById('refreshBannerHistory');
    if(btn){btn.click();return}
    if(++attempts<20)setTimeout(tryRefresh,120);
  };
  setTimeout(tryRefresh,50);
}

window.fetch=async function(input,init){
  const req=parseBannerRequest(input,init);
  if(!req)return nativeFetch(input,init);
  const id=text(req.request_id),summary=safePayload(req);
  void persistJob(id,{status:'gerando',started_at:nowIso(),created_ms:now(),request:summary});
  try{
    const response=await nativeFetch(input,init);
    const clone=response.clone();
    void clone.text().then(async raw=>{
      if(!response.ok){await persistJob(id,{status:'erro',error:`Make ${response.status}: ${raw.slice(0,220)}`});return}
      try{
        const out=JSON.parse(raw);
        if(out?.ok===false){await persistJob(id,{status:'erro',error:text(out.error)||'Falha informada pelo Make.'});return}
        await persistJob(id,{status:'finalizando',response_received_at:nowIso()});
        await persistResponse(id,req,out);
      }catch(e){
        console.error('[Banner background] falha ao salvar resposta:',e);
        await persistJob(id,{status:'erro',error:text(e?.message||e)||'Falha ao processar a resposta do Make.'});
      }
    }).catch(async e=>{await persistJob(id,{status:'erro',error:text(e?.message||e)})});
    return response;
  }catch(e){
    await persistJob(id,{status:'erro',error:text(e?.message||e)});throw e;
  }
};

async function reconcile(){
  const list=[...jobs.values()];
  for(const j of list){
    if(!j?.id)continue;
    try{
      const saved=await fbGet(`${BANNER_NODE}/${safeKey(j.id)}`);
      if(saved?.status==='salvo'&&saved?.tem_desktop&&saved?.tem_mobile){jobs.delete(j.id);continue}
    }catch{}
    const age=now()-(j.created_ms||j.updated_ms||0);
    if(age>30*60*1000&&['preparando','gerando','finalizando','salvando','aguardando_confirmacao'].includes(j.status))setJob(j.id,{status:'interrompido',error:'A geração não foi confirmada. Verifique a execução no Make.'});
  }
  saveLocal();renderIndicator();
}

window.addEventListener('beforeunload',e=>{
  if(!activeJobs().length)return;
  e.preventDefault();e.returnValue='';
});
window.addEventListener('admin-canecas:route',e=>{
  if(e.detail?.route==='banners')void reconcile().then(refreshBannerView);
});

loadLocal();renderIndicator();void reconcile();
document.documentElement.dataset.bannerBackground=BUILD;
