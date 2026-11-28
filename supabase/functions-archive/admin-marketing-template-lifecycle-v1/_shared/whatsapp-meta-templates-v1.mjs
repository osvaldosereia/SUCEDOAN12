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
const plainObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const TEMPLATE_NAME_RE=/^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE=/^[a-z]{2,3}(?:_[A-Z]{2})?$/;
const TEMPLATE_CATEGORIES=new Set(['MARKETING','UTILITY']);
const TEMPLATE_COMPONENT_TYPES=new Set(['HEADER','BODY','FOOTER','BUTTONS']);
const TEMPLATE_BUTTON_TYPES=new Set(['URL','QUICK_REPLY','CATALOG']);

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

export function buildTemplateCacheRows({items,account,existingByKey=new Map(),syncedAt=new Date().toISOString()}={}){
  if(!Array.isArray(items)||!account||typeof account!=='object')throw fail('meta_templates_invalid_cache_input');
  const accountId=clean(account.id,80);
  const wabaId=clean(account.waba_id,80);
  if(!/^[0-9a-f-]{36}$/i.test(accountId)||!/^\d{5,30}$/.test(wabaId))throw fail('meta_templates_invalid_cache_input');
  return items.map(item=>{
    const key=`${item.name}\u0000${item.language}`;
    const existing=existingByKey instanceof Map?existingByKey.get(key):null;
    const priorMetadata=plainObject(existing?.metadata);
    return {
      whatsapp_account_id:accountId,
      waba_id:wabaId,
      meta_template_id:item.meta_template_id,
      name:item.name,
      language:item.language,
      category:item.category||null,
      status:item.status||'UNKNOWN',
      components:Array.isArray(item.components)?item.components:[],
      quality_rating:item.quality_rating||null,
      last_synced_at:syncedAt,
      updated_at:syncedAt,
      metadata:{
        ...priorMetadata,
        sync_source:'meta_cloud_api',
        rejected_reason:item.rejected_reason??null,
        last_updated_time:item.last_updated_time??null,
        meta_quality_score:item.meta_quality_score??null,
        meta_missing:false,
      },
    };
  });
}

function extractPlaceholders(text){
  const values=[];
  for(const match of String(text||'').matchAll(/\{\{(\d+)\}\}/g))values.push(Number(match[1]));
  if(!values.length)return [];
  const unique=[...new Set(values)].sort((a,b)=>a-b);
  for(let i=0;i<unique.length;i++)if(unique[i]!==i+1)throw fail('meta_template_variables_invalid');
  return unique;
}

function normalizeBodyExample(example,placeholderCount){
  if(!placeholderCount)return undefined;
  const rows=example?.body_text;
  if(!Array.isArray(rows)||!Array.isArray(rows[0])||rows[0].length<placeholderCount)throw fail('meta_template_examples_required');
  const first=rows[0].slice(0,placeholderCount).map(value=>clean(value,1024));
  if(first.some(value=>!value))throw fail('meta_template_examples_required');
  return {body_text:[first]};
}

function normalizeHeaderExample(example,placeholderCount){
  if(!placeholderCount)return undefined;
  const values=example?.header_text;
  if(!Array.isArray(values)||values.length<placeholderCount)throw fail('meta_template_examples_required');
  const normalized=values.slice(0,placeholderCount).map(value=>clean(value,60));
  if(normalized.some(value=>!value))throw fail('meta_template_examples_required');
  return {header_text:normalized};
}

function normalizeButtons(rawButtons){
  if(!Array.isArray(rawButtons)||rawButtons.length<1||rawButtons.length>10)throw fail('meta_template_buttons_invalid');
  return rawButtons.map(raw=>{
    const type=clean(raw?.type,30).toUpperCase();
    if(!TEMPLATE_BUTTON_TYPES.has(type))throw fail('meta_template_component_unsupported');
    if(type==='CATALOG'){
      const text=clean(raw?.text,25);
      return text?{type,text}:{type};
    }
    const text=clean(raw?.text,25);
    if(!text)throw fail('meta_template_buttons_invalid');
    if(type==='QUICK_REPLY')return {type,text};
    const urlRaw=clean(raw?.url,2000);
    if(!urlRaw||/\{\{\d+\}\}/.test(urlRaw))throw fail('meta_template_buttons_invalid');
    let url;
    try{url=new URL(urlRaw);}catch{throw fail('meta_template_buttons_invalid')}
    if(url.protocol!=='https:'||url.username||url.password)throw fail('meta_template_buttons_invalid');
    return {type,text,url:url.toString()};
  });
}

export function validateTemplateDraft(input){
  const draft=plainObject(input);
  const name=clean(draft.name,512);
  const language=clean(draft.language,20);
  const category=clean(draft.category,40).toUpperCase();
  if(!TEMPLATE_NAME_RE.test(name))throw fail('meta_template_name_invalid');
  if(!LANGUAGE_RE.test(language))throw fail('meta_template_language_invalid');
  if(!TEMPLATE_CATEGORIES.has(category))throw fail('meta_template_category_unsupported');
  if(!Array.isArray(draft.components)||draft.components.length<1||draft.components.length>10)throw fail('meta_template_components_invalid');
  let bodyCount=0,headerCount=0,footerCount=0,buttonsCount=0;
  const components=draft.components.map(raw=>{
    const component=plainObject(raw),type=clean(component.type,30).toUpperCase();
    if(!TEMPLATE_COMPONENT_TYPES.has(type))throw fail('meta_template_component_unsupported');
    if(type==='BODY'){
      bodyCount++;if(bodyCount>1)throw fail('meta_template_components_invalid');
      const text=clean(component.text,1024);if(!text)throw fail('meta_template_body_invalid');
      const placeholders=extractPlaceholders(text),example=normalizeBodyExample(component.example,placeholders.length);
      return example?{type,text,example}:{type,text};
    }
    if(type==='HEADER'){
      headerCount++;if(headerCount>1)throw fail('meta_template_components_invalid');
      const format=clean(component.format,20).toUpperCase();if(format!=='TEXT')throw fail('meta_template_component_unsupported');
      const text=clean(component.text,60);if(!text)throw fail('meta_template_header_invalid');
      const placeholders=extractPlaceholders(text),example=normalizeHeaderExample(component.example,placeholders.length);
      return example?{type,format,text,example}:{type,format,text};
    }
    if(type==='FOOTER'){
      footerCount++;if(footerCount>1)throw fail('meta_template_components_invalid');
      const text=clean(component.text,60);if(!text)throw fail('meta_template_footer_invalid');return {type,text};
    }
    buttonsCount++;if(buttonsCount>1)throw fail('meta_template_components_invalid');return {type,buttons:normalizeButtons(component.buttons)};
  });
  if(bodyCount!==1)throw fail('meta_template_body_required');
  return {name,language,category,components};
}

function validateMutationConfig({accessToken,graphVersion,fetchImpl,timeoutMs,wabaId=null,templateId=null}){
  const token=typeof accessToken==='string'?accessToken.trim():'';
  const version=typeof graphVersion==='string'?graphVersion.trim():'';
  const timeout=Number(timeoutMs??10000);
  const waba=wabaId===null?null:String(wabaId??'').trim();
  const template=templateId===null?null:String(templateId??'').trim();
  if(!token||!/^v\d+\.\d+$/.test(version)||typeof fetchImpl!=='function')throw fail('meta_templates_invalid_request');
  if(!Number.isFinite(timeout)||timeout<1||timeout>60000)throw fail('meta_templates_invalid_request');
  if(waba!==null&&!/^\d{5,30}$/.test(waba))throw fail('meta_templates_invalid_request');
  if(template!==null&&!/^\d{5,30}$/.test(template))throw fail('meta_templates_invalid_request');
  return {token,version,timeout,waba,template};
}

async function mutateJson(url,{token,timeout,fetchImpl,method,body}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  let response,payload;
  try{
    response=await fetchImpl(url.toString(),{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
    payload=await response.json().catch(()=>null);
  }catch(error){
    if(controller.signal.aborted||error?.name==='AbortError')throw fail('meta_templates_timeout',{retryable:true});
    throw fail('meta_templates_network_error',{retryable:true});
  }finally{clearTimeout(timer)}
  if(!response.ok)throw fail('meta_templates_http_error',{httpStatus:Number(response.status)||null,retryable:response.status===408||response.status===429||response.status>=500,providerCode:payload?.error?.code??null});
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw fail('meta_templates_invalid_response');
  return payload;
}

export async function deleteTemplateViaMeta({accessToken,wabaId,graphVersion,name,templateId=null,fetchImpl=globalThis.fetch,timeoutMs=10000}={}){
  const cfg=validateMutationConfig({accessToken,wabaId,templateId:templateId===null?null:templateId,graphVersion,fetchImpl,timeoutMs});
  const templateName=clean(name,512);if(!TEMPLATE_NAME_RE.test(templateName))throw fail('meta_template_name_invalid');
  const url=new URL(`https://graph.facebook.com/${cfg.version}/${cfg.waba}/message_templates`);
  url.searchParams.set('name',templateName);if(cfg.template)url.searchParams.set('hsm_id',cfg.template);
  const payload=await mutateJson(url,{token:cfg.token,timeout:cfg.timeout,fetchImpl,method:'DELETE'});
  return {ok:true,waba_id:cfg.waba,name:templateName,meta_template_id:cfg.template,payload};
}
