const BUILD='20260830-banner-input-fidelity-v1';
const nativeFetch=window.fetch.bind(window);
const text=v=>String(v??'').trim();

function parseJson(value){
  if(value&&typeof value==='object')return value;
  if(typeof value!=='string')return {};
  try{return JSON.parse(value)}catch{return {}}
}

function authoritativeContext(req={}){
  const c=req.campaign||{};
  const prices=[];
  if(Number(c.price||0)>0)prices.push(String(c.price));
  if(Number(c.old_price||0)>0)prices.push(String(c.old_price));
  return [c.name,c.objective,c.headline,c.cta,c.notes,req.custom_instructions,req.products_summary,...prices]
    .map(text).filter(Boolean).join(' | ');
}

function containsUnsupportedMoney(value,context){
  const matches=String(value||'').match(/R\$\s*\d[\d.]*?(?:,\d{1,2})?/gi)||[];
  if(!matches.length)return false;
  const normalized=String(context||'').replace(/\s+/g,' ').toLowerCase();
  return matches.some(m=>!normalized.includes(m.replace(/\s+/g,' ').toLowerCase()));
}

function enforce(req,out){
  const c=req.campaign||{};
  const creative=parseJson(out.creative_json||out.creative||out.copy);
  const context=authoritativeContext(req);

  // Campos preenchidos pelo usuário são soberanos e nunca podem ser reescritos pela IA.
  if(text(c.headline))creative.headline=text(c.headline);
  if(text(c.cta))creative.cta=text(c.cta);

  // A IA não pode inventar condição monetária. Se inventar, voltamos ao dado real do usuário.
  if(containsUnsupportedMoney(creative.headline,context))creative.headline=text(c.headline||c.name||'');
  if(containsUnsupportedMoney(creative.subtitle,context))creative.subtitle=text(c.objective||'');
  if(containsUnsupportedMoney(creative.eyebrow,context))creative.eyebrow='';

  out.creative_json=creative;
  if(out.creative&&typeof out.creative==='object')out.creative=creative;
  if(out.copy&&typeof out.copy==='object')out.copy=creative;
  return out;
}

window.fetch=async function(input,init={}){
  let req=null;
  try{
    const method=String(init?.method||'GET').toUpperCase();
    if(method==='POST'&&typeof init?.body==='string'){
      const parsed=JSON.parse(init.body);
      if(parsed?.action==='generate_banner_pair')req=parsed;
    }
  }catch{}

  const response=await nativeFetch(input,init);
  if(!req||!response.ok)return response;

  try{
    const raw=await response.clone().text();
    const out=JSON.parse(raw);
    enforce(req,out);
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type','application/json; charset=utf-8');
    return new Response(JSON.stringify(out),{status:response.status,statusText:response.statusText,headers});
  }catch{
    return response;
  }
};

document.documentElement.dataset.bannerInputFidelity=BUILD;
