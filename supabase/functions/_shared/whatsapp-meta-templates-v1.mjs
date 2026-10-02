export class MetaTemplatesError extends Error {
  constructor(code,{httpStatus=null,retryable=false,providerCode=null}={}){
    super(code);
    this.name='MetaTemplatesError';
    this.code=code;
    this.httpStatus=httpStatus;
    this.retryable=retryable;
    this.providerCode=providerCode;
  }
}

const fail=(code,opts)=>new MetaTemplatesError(code,opts);
const clean=(value,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);

export function normalizeMetaTemplate(raw){
  const item=raw&&typeof raw==='object'?raw:{};
  const qualityRaw=item.quality_score&&typeof item.quality_score==='object'?item.quality_score:null;
  const quality=clean(qualityRaw?.score??item.quality_score,20).toUpperCase()||null;
  const rejected=clean(item.rejected_reason,120).toUpperCase();
  return {
    meta_template_id:clean(item.id,80)||null,
    name:clean(item.name,512),
    language:clean(item.language,80),
    category:clean(item.category,40).toUpperCase(),
    status:clean(item.status,40).toUpperCase(),
    components:Array.isArray(item.components)?item.components:[],
    quality_rating:quality,
    rejected_reason:!rejected||rejected==='NONE'?null:rejected,
    last_updated_time:clean(item.last_updated_time,80)||null,
    meta_quality_score:qualityRaw??(item.quality_score??null),
  };
}

function validateConfig({accessToken,wabaId,graphVersion,fetchImpl,timeoutMs,maxPages}){
  const token=typeof accessToken==='string'?accessToken.trim():'';
  const waba=String(wabaId??'').trim();
  const version=typeof graphVersion==='string'?graphVersion.trim():'';
  const timeout=Number(timeoutMs??10000);
  const pages=Number(maxPages??10);
  if(!token||!/^\d{5,30}$/.test(waba)||!/^v\d+\.\d+$/.test(version)||typeof fetchImpl!=='function')throw fail('meta_templates_invalid_request');
  if(!Number.isFinite(timeout)||timeout<1||timeout>60000||!Number.isInteger(pages)||pages<1||pages>50)throw fail('meta_templates_invalid_request');
  return {token,waba,version,timeout,pages};
}

function initialUrl(version,waba){
  const url=new URL(`https://graph.facebook.com/${version}/${waba}/message_templates`);
  url.searchParams.set('fields','id,name,language,status,category,components,quality_score,rejected_reason,last_updated_time');
  url.searchParams.set('limit','100');
  return url;
}

function safePagingUrl(value,version,waba){
  if(!value)return null;
  let url;
  try{url=new URL(String(value));}catch{throw fail('meta_templates_invalid_paging_url')}
  const expectedPath=`/${version}/${waba}/message_templates`;
  if(url.protocol!=='https:'||url.hostname!=='graph.facebook.com'||url.username||url.password||url.pathname!==expectedPath){
    throw fail('meta_templates_invalid_paging_url');
  }
  return url;
}

async function fetchPage(url,{token,timeout,fetchImpl}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  let response;
  let payload;
  try{
    response=await fetchImpl(url.toString(),{
      method:'GET',
      headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
      signal:controller.signal,
    });
    payload=await response.json().catch(()=>null);
  }catch(error){
    if(controller.signal.aborted||error?.name==='AbortError')throw fail('meta_templates_timeout',{retryable:true});
    throw fail('meta_templates_network_error',{retryable:true});
  }finally{clearTimeout(timer)}
  if(!response.ok){
    throw fail('meta_templates_http_error',{
      httpStatus:Number(response.status)||null,
      retryable:response.status===408||response.status===429||response.status>=500,
      providerCode:payload?.error?.code??null,
    });
  }
  if(!payload||!Array.isArray(payload.data))throw fail('meta_templates_invalid_response');
  return payload;
}

export async function listTemplatesViaMeta({
  accessToken,
  wabaId,
  graphVersion,
  fetchImpl=globalThis.fetch,
  timeoutMs=10000,
  maxPages=10,
}={}){
  const cfg=validateConfig({accessToken,wabaId,graphVersion,fetchImpl,timeoutMs,maxPages});
  const items=[];
  const seen=new Set();
  let url=initialUrl(cfg.version,cfg.waba);
  let pageCount=0;
  while(url&&pageCount<cfg.pages){
    pageCount++;
    const payload=await fetchPage(url,{token:cfg.token,timeout:cfg.timeout,fetchImpl});
    for(const raw of payload.data){
      const item=normalizeMetaTemplate(raw);
      if(!item.meta_template_id||!item.name||!item.language)continue;
      const key=`${item.meta_template_id}:${item.language}`;
      if(seen.has(key))continue;
      seen.add(key);
      items.push(item);
    }
    url=safePagingUrl(payload?.paging?.next,cfg.version,cfg.waba);
  }
  return {ok:true,waba_id:cfg.waba,items,page_count:pageCount,truncated:Boolean(url)};
}
