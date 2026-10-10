export class MetaCarouselError extends Error{
  constructor(code,{httpStatus=null,retryable=false}={}){super(code);this.name='MetaCarouselError';this.code=code;this.httpStatus=httpStatus;this.retryable=retryable}
}
const fail=(code,opts)=>{throw new MetaCarouselError(code,opts)};
const clean=(value,max=1024)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const NAME_RE=/^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE=/^[a-z]{2,3}(?:_[A-Z]{2})?$/;
const MEDIA_TYPES=new Set(['IMAGE','VIDEO']);
const BUTTON_TYPES=new Set(['URL','QUICK_REPLY']);
const UPLOAD_MIME=new Set(['image/jpeg','image/png','video/mp4']);

function normalizeButton(raw){
  const value=plain(raw),type=clean(value.type,30).toUpperCase(),text=clean(value.text,25);
  if(!BUTTON_TYPES.has(type)||!text)fail('carousel_button_invalid');
  if(type==='QUICK_REPLY')return {type,text};
  const rawUrl=clean(value.url,2000);if(!rawUrl)fail('carousel_button_invalid');
  const placeholders=[...rawUrl.matchAll(/\{\{(\d+)\}\}/g)].map(match=>Number(match[1]));
  if(placeholders.length>1||placeholders.some(index=>index!==1))fail('carousel_button_invalid');
  const parsedUrl=placeholders.length?rawUrl.replace(/\{\{1\}\}/g,'tracking-example'):rawUrl;
  let url;try{url=new URL(parsedUrl)}catch{fail('carousel_button_invalid')}
  if(url.protocol!=='https:'||url.username||url.password)fail('carousel_button_invalid');
  if(!placeholders.length)return {type,text,url:url.toString()};
  const example=Array.isArray(value.example)?value.example.map(item=>clean(item,2000)).filter(Boolean):[];
  if(example.length!==1)fail('carousel_button_example_required');
  return {type,text,url:rawUrl,example};
}
function normalizeCard(raw){
  const card=plain(raw),components=Array.isArray(card.components)?card.components:[];
  const header=components.find(item=>clean(item?.type,30).toUpperCase()==='HEADER');
  const body=components.find(item=>clean(item?.type,30).toUpperCase()==='BODY');
  const buttons=components.find(item=>clean(item?.type,30).toUpperCase()==='BUTTONS');
  if(!header||!body||!buttons||components.length!==3)fail('carousel_card_incomplete');
  const format=clean(header.format,20).toUpperCase();if(!MEDIA_TYPES.has(format))fail('carousel_media_invalid');
  const handles=header?.example?.header_handle;
  if(!Array.isArray(handles)||handles.length!==1||!clean(handles[0],4096))fail('carousel_header_handle_required');
  const text=clean(body.text,160);if(!text)fail('carousel_card_body_invalid');
  const normalizedButtons=Array.isArray(buttons.buttons)?buttons.buttons.map(normalizeButton):[];
  if(normalizedButtons.length<1||normalizedButtons.length>2)fail('carousel_buttons_invalid');
  return {components:[{type:'HEADER',format,example:{header_handle:[clean(handles[0],4096)]}},{type:'BODY',text},{type:'BUTTONS',buttons:normalizedButtons}],_signature:`${format}|${normalizedButtons.map(item=>item.type).join(',')}`};
}

export function validateCarouselTemplateDraft(input){
  const draft=plain(input),name=clean(draft.name,512),language=clean(draft.language,20),category=clean(draft.category,40).toUpperCase();
  if(!NAME_RE.test(name))fail('meta_template_name_invalid');
  if(!LANGUAGE_RE.test(language))fail('meta_template_language_invalid');
  if(category!=='MARKETING')fail('carousel_category_must_be_marketing');
  const components=Array.isArray(draft.components)?draft.components:[];
  const body=components.find(item=>clean(item?.type,30).toUpperCase()==='BODY');
  const carousel=components.find(item=>clean(item?.type,30).toUpperCase()==='CAROUSEL');
  if(!body||!carousel||components.length!==2)fail('carousel_components_invalid');
  const bodyText=clean(body.text,1024);if(!bodyText)fail('meta_template_body_invalid');
  const cards=Array.isArray(carousel.cards)?carousel.cards:[];
  if(cards.length<2||cards.length>10)fail('carousel_cards_invalid');
  const normalized=cards.map(normalizeCard),signature=normalized[0]._signature;
  if(normalized.some(card=>card._signature!==signature))fail('carousel_structure_inconsistent');
  return {name,language,category:'MARKETING',components:[{type:'BODY',text:bodyText},{type:'CAROUSEL',cards:normalized.map(({_signature,...card})=>card)}]};
}

function config({accessToken,graphVersion,fetchImpl=globalThis.fetch}){
  const token=String(accessToken||'').trim(),version=String(graphVersion||'').trim();
  if(!token||!/^v\d+\.\d+$/.test(version)||typeof fetchImpl!=='function')fail('meta_carousel_invalid_config');
  return {token,version,fetchImpl};
}
async function fetchJson(url,{token,fetchImpl,method='POST',headers={},body}={}){
  let response;try{response=await fetchImpl(url,{method,headers:{Authorization:`Bearer ${token}`,...headers},body})}catch{fail('meta_carousel_network_error',{retryable:true})}
  const payload=await response.json().catch(()=>null);
  if(!response.ok)fail('meta_carousel_http_error',{httpStatus:response.status,retryable:response.status===408||response.status===429||response.status>=500});
  if(!payload||typeof payload!=='object')fail('meta_carousel_invalid_response');return payload;
}

export async function uploadTemplateMediaSampleViaMeta({accessToken,appId,graphVersion,fileName,mimeType,bytes,fetchImpl=globalThis.fetch}={}){
  const cfg=config({accessToken,graphVersion,fetchImpl}),app=String(appId||'').trim(),mime=String(mimeType||'').trim().toLowerCase(),name=clean(fileName,180);
  if(!/^\d{5,30}$/.test(app))fail('meta_app_id_not_configured');
  if(!UPLOAD_MIME.has(mime)||!name)fail('carousel_media_invalid');
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);if(!data.byteLength||data.byteLength>18*1024*1024)fail('carousel_media_size_invalid');
  const sessionUrl=new URL(`https://graph.facebook.com/${cfg.version}/${app}/uploads`);sessionUrl.searchParams.set('file_length',String(data.byteLength));sessionUrl.searchParams.set('file_type',mime);sessionUrl.searchParams.set('file_name',name);
  const session=await fetchJson(sessionUrl,{token:cfg.token,fetchImpl:cfg.fetchImpl});const uploadId=clean(session.id,4096);if(!uploadId)fail('meta_carousel_invalid_response');
  const uploadUrl=`https://graph.facebook.com/${cfg.version}/${encodeURIComponent(uploadId)}`;
  const uploaded=await fetchJson(uploadUrl,{token:cfg.token,fetchImpl:cfg.fetchImpl,headers:{'Content-Type':mime,'file_offset':'0'},body:data});
  const handle=clean(uploaded.h,4096);if(!handle)fail('meta_carousel_invalid_response');return {ok:true,handle,mime_type:mime,file_name:name,size_bytes:data.byteLength};
}

export async function createCarouselTemplateViaMeta({accessToken,wabaId,graphVersion,draft,fetchImpl=globalThis.fetch}={}){
  const cfg=config({accessToken,graphVersion,fetchImpl}),waba=String(wabaId||'').trim();if(!/^\d{5,30}$/.test(waba))fail('meta_carousel_invalid_config');
  const template=validateCarouselTemplateDraft(draft),url=`https://graph.facebook.com/${cfg.version}/${waba}/message_templates`;
  const payload=await fetchJson(url,{token:cfg.token,fetchImpl:cfg.fetchImpl,headers:{'Content-Type':'application/json'},body:JSON.stringify(template)});
  return {ok:true,waba_id:waba,payload};
}