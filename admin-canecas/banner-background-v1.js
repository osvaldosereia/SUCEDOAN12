import { fbGet, fbWrite, nowIso, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD='20260830-banner-background-v1';
const JOB_NODE='canecas/banner_jobs';
const BANNER_NODE='canecas/banners_ia';
const STORAGE_KEY='cf_banner_jobs_v1';
const nativeFetch=window.fetch.bind(window);
const jobs=new Map();

const text=v=>String(v??'').trim();
const now=()=>Date.now();
const safePayload=req=>({
  request_id:text(req?.request_id),
  action:text(req?.action),
  build:text(req?.build),
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
function activeJobs(){return [...jobs.values()].filter(j=>['preparando','gerando','finalizando'].includes(j.status))}
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
  el.innerHTML=`<b><i></i>${active.length===1?'Banner sendo gerado':'Banners sendo gerados'} em segundo plano</b><small>${last?.status==='finalizando'?'Finalizando e salvando no Admin…':'Você pode navegar pelo Admin. O resultado será salvo automaticamente.'}</small>`;
}

async function persistJob(id,patch){
  const local=setJob(id,patch);
  try{await fbWrite(`${JOB_NODE}/${safeKey(id)}`,local,'PUT')}catch(e){console.warn('[Banner background] status Firebase:',e)}
}
async function waitUntilSaved(id){
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,i<8?500:1000));
    try{
      const saved=await fbGet(`${BANNER_NODE}/${safeKey(id)}`);
      if(saved?.status==='salvo'||saved?.tem_desktop||saved?.tem_mobile){
        await persistJob(id,{status:'concluido',finished_at:nowIso(),error:''});
        jobs.delete(id);saveLocal();renderIndicator();
        if(location.hash.includes('banners'))setTimeout(()=>document.getElementById('refreshBannerHistory')?.click(),80);
        return true;
      }
    }catch{}
  }
  await persistJob(id,{status:'aguardando_confirmacao'});
  return false;
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
        void waitUntilSaved(id);
      }catch(e){await persistJob(id,{status:'erro',error:'O Make não respondeu JSON válido.'})}
    }).catch(()=>{});
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
      if(saved?.status==='salvo'||saved?.tem_desktop||saved?.tem_mobile){jobs.delete(j.id);continue}
    }catch{}
    const age=now()-(j.created_ms||j.updated_ms||0);
    if(age>30*60*1000&&['preparando','gerando','finalizando','aguardando_confirmacao'].includes(j.status))setJob(j.id,{status:'interrompido',error:'A geração não foi confirmada. Verifique a execução no Make.'});
  }
  saveLocal();renderIndicator();
}

window.addEventListener('beforeunload',e=>{
  if(!activeJobs().length)return;
  e.preventDefault();e.returnValue='';
});
window.addEventListener('admin-canecas:route',e=>{
  if(e.detail?.route==='banners'){
    void reconcile().then(()=>setTimeout(()=>document.getElementById('refreshBannerHistory')?.click(),100));
  }
});

loadLocal();renderIndicator();void reconcile();
document.documentElement.dataset.bannerBackground=BUILD;
