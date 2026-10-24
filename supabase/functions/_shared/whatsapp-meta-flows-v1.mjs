// Server-side Meta Flows API client. Never pass its access token to browser code.
import {FLOW_CANARY_RECIPIENT_E164} from './whatsapp-flow-session-v1.mjs';
const FLOW_ID_RE=/^\d{5,30}$/;
const WABA_ID_RE=/^\d{5,30}$/;
const PHONE_ID_RE=/^\d{5,30}$/;
const VERSION_RE=/^v\d+\.\d+$/;
const MAX_JSON_BYTES=300000;
const SAFE_CATEGORIES=new Set(['SIGN_UP','LEAD_GENERATION','CONTACT_US','CUSTOMER_SUPPORT','SURVEY','OTHER']);

export class MetaFlowsError extends Error{
  constructor(code,{httpStatus=null,providerCode=null,details=null,partialFlowId=null}={}){
    super(String(code||'meta_flow_error'));
    this.name='MetaFlowsError';
    this.code=String(code||'meta_flow_error');
    this.httpStatus=httpStatus;
    this.providerCode=providerCode;
    this.details=details;
    this.partialFlowId=partialFlowId;
  }
}
const fail=(code,opts)=>new MetaFlowsError(code,opts);
const clean=(value,max=300)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const id=(value,regex)=>{const text=String(value??'').trim();return regex.test(text)?text:null};
const byteLength=value=>new TextEncoder().encode(String(value??'')).byteLength;

function config({accessToken,graphVersion,fetchImpl=globalThis.fetch,timeoutMs=15000}={}){
  const token=String(accessToken??'').trim(),version=String(graphVersion??'').trim();
  if(!token)throw fail('meta_flow_token_missing');
  if(!VERSION_RE.test(version))throw fail('meta_flow_graph_version_invalid');
  if(typeof fetchImpl!=='function')throw fail('meta_flow_fetch_unavailable');
  const timeout=Number(timeoutMs);
  if(!Number.isFinite(timeout)||timeout<1000||timeout>60000)throw fail('meta_flow_timeout_invalid');
  return {token,version,fetchImpl,timeout};
}
function validatedName(value){
  const name=clean(value,120);
  if(!name||name.length<3)throw fail('meta_flow_name_invalid');
  return name;
}
export function validateFlowJson(input){
  const source=typeof input==='string'?input:JSON.stringify(input);
  if(typeof source!=='string'||!source||byteLength(source)>MAX_JSON_BYTES)throw fail('meta_flow_json_too_large');
  let data;
  try{data=JSON.parse(source)}catch{throw fail('meta_flow_json_invalid')}
  if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.version!=='string'||!/^\d+\.\d+$/.test(data.version)||!Array.isArray(data.screens)||!data.screens.length||data.screens.length>20||!data.routing_model||typeof data.routing_model!=='object'||Array.isArray(data.routing_model))throw fail('meta_flow_json_invalid');
  const screenIds=new Set();
  for(const screen of data.screens){
    const screenId=String(screen?.id||'');
    if(!/^[A-Z][A-Z0-9_]{0,39}$/.test(screenId)||screenIds.has(screenId)||!screen?.layout||typeof screen.layout!=='object'||!Array.isArray(screen.layout.children))throw fail('meta_flow_json_invalid');
    screenIds.add(screenId);
  }
  return {json:data,text:JSON.stringify(data),dataApiVersion:clean(data.data_api_version,20)||null};
}
function safeValidationErrors(value){
  let list=value;
  if(list&&typeof list==='object'&&!Array.isArray(list)){
    if(Array.isArray(list.data))list=list.data;
    else if(Array.isArray(list.errors))list=list.errors;
    else return [{message:'Meta returned an unsupported Flow validation report'}];
  }
  if(!Array.isArray(list))return list==null?null:[{message:clean(list,500)}];
  return list.slice(0,80).map(row=>{
    const item=object(row);
    return {
      error_code:clean(item.error_code??item.code,80)||null,
      error_type:clean(item.error_type??item.type,80)||null,
      message:clean(item.error_message??item.message??item.description,500)||'Meta reported a Flow validation issue',
      screen:clean(item.screen,80)||null,
      line:item.line===null||item.line===undefined||item.line===''?null:Number.isInteger(Number(item.line))?Number(item.line):null,
      column:item.column===null||item.column===undefined||item.column===''?null:Number.isInteger(Number(item.column))?Number(item.column):null
    };
  });
}
export function flowValidationErrors(flow){
  if(!Object.prototype.hasOwnProperty.call(object(flow),'validation_errors'))return null;
  return safeValidationErrors(flow.validation_errors);
}
function safeFlow(value){
  const row=object(value);
  return {
    id:id(row.id,FLOW_ID_RE),
    name:clean(row.name,120),
    status:clean(row.status,40).toUpperCase()||'UNKNOWN',
    categories:Array.isArray(row.categories)?row.categories.slice(0,8).map(x=>clean(x,40)):[],
    endpoint_uri:clean(row.endpoint_uri,500)||null,
    health_status:clean(row.health_status,80)||null,
    validation_errors:flowValidationErrors(row),
    updated_at:clean(row.updated_at,80)||null
  };
}
async function graphRequest({cfg,path,method='GET',params={},body=null,form=null}={}){
  const resource=String(path??'').replace(/^\/+|\/+$/g,'');
  if(!resource||resource.split('/').some(part=>part==='..'))throw fail('meta_flow_path_invalid');
  const url=new URL('https://graph.facebook.com/'+cfg.version+'/'+resource);
  for(const [key,value] of Object.entries(params||{})){
    if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));
  }
  const headers={Authorization:'Bearer '+cfg.token};
  const init={method,headers,cache:'no-store'};
  if(form){init.body=form}
  else if(body!==null){headers['Content-Type']='application/json';init.body=JSON.stringify(body)}
  let response;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),cfg.timeout);
  try{response=await cfg.fetchImpl(url.toString(),{...init,signal:controller.signal})}
  catch(error){throw fail(error?.name==='AbortError'?'meta_flow_timeout':'meta_flow_network_error',{httpStatus:503})}
  finally{clearTimeout(timer)}
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.error){
    const providerCode=Number(payload?.error?.code)||null;
    const httpStatus=Number(response.status)||502;
    const code=providerCode?'meta_flow_graph_'+providerCode:'meta_flow_graph_http_'+httpStatus;
    throw fail(code,{httpStatus:httpStatus>=400&&httpStatus<500?502:503,providerCode});
  }
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw fail('meta_flow_response_invalid',{httpStatus:502});
  return payload;
}
function graphConfig(input){return config(input)}
export async function listFlowsViaMeta({accessToken,wabaId,graphVersion,fetchImpl,timeoutMs=15000,maxPages=20}={}){
  const cfg=graphConfig({accessToken,graphVersion,fetchImpl,timeoutMs});
  const waba=id(wabaId,WABA_ID_RE);if(!waba)throw fail('meta_flow_waba_invalid');
  const pageLimit=Number(maxPages);
  if(!Number.isInteger(pageLimit)||pageLimit<1||pageLimit>100)throw fail('meta_flow_page_limit_invalid');
  const rows=[],seenIds=new Set(),seenCursors=new Set();
  let cursor=null,pages=0,truncated=false;
  while(pages<pageLimit){
    const payload=await graphRequest({cfg,path:waba+'/flows',params:{fields:'id,name,status,categories,validation_errors,health_status,endpoint_uri,updated_at',limit:100,after:cursor}});
    pages++;
    for(const row of Array.isArray(payload.data)?payload.data:[]){
      const flow=safeFlow(row);
      if(flow.id&&!seenIds.has(flow.id)){seenIds.add(flow.id);rows.push(flow)}
    }
    if(!payload.paging?.next)break;
    const nextCursor=String(payload.paging?.cursors?.after??'').trim();
    if(!/^[\x21-\x7e]{1,4096}$/.test(nextCursor)||seenCursors.has(nextCursor)||pages>=pageLimit){truncated=true;break}
    seenCursors.add(nextCursor);
    cursor=nextCursor;
  }
  return {items:rows,truncated,page_count:pages};
}
export async function sendDraftFlowCanaryViaMeta({accessToken,phoneNumberId,graphVersion,flowId,flowToken,fetchImpl,timeoutMs=20000}={}){
  const cfg=graphConfig({accessToken,graphVersion,fetchImpl,timeoutMs});
  const phone=id(phoneNumberId,PHONE_ID_RE),flow=id(flowId,FLOW_ID_RE),token=String(flowToken??'').trim();
  if(!phone)throw fail('meta_flow_phone_id_invalid');
  if(!flow)throw fail('meta_flow_id_invalid');
  if(!token||token.length>20000)throw fail('meta_flow_token_invalid');
  const body={
    messaging_product:'whatsapp',recipient_type:'individual',to:FLOW_CANARY_RECIPIENT_E164.replace(/\D/g,''),type:'interactive',
    interactive:{
      type:'flow',header:{type:'text',text:'Teste interno'},body:{text:'Homologação do WhatsApp Flow da cesta.'},
      footer:{text:'Somente teste interno 1018 → 8360.'},
      action:{name:'flow',parameters:{mode:'draft',flow_message_version:'3',flow_token:token,flow_id:flow,flow_cta:'Iniciar teste',flow_action:'navigate',flow_action_payload:{screen:'TAMANHO'}}}
    }
  };
  const payload=await graphRequest({cfg,path:phone+'/messages',method:'POST',body});
  const providerMessageId=clean(payload?.messages?.[0]?.id,240);
  if(!providerMessageId)throw fail('meta_flow_send_response_invalid',{httpStatus:502});
  return {sent:true,providerMessageId};
}
export async function getFlowViaMeta({accessToken,flowId,graphVersion,fetchImpl,timeoutMs=15000}={}){
  const cfg=graphConfig({accessToken,graphVersion,fetchImpl,timeoutMs});
  const flow=id(flowId,FLOW_ID_RE);if(!flow)throw fail('meta_flow_id_invalid');
  const payload=await graphRequest({cfg,path:flow,params:{fields:'id,name,status,categories,validation_errors,health_status,endpoint_uri,updated_at'}});
  return safeFlow(payload);
}
export async function createFlowViaMeta({accessToken,wabaId,graphVersion,name,categories=['OTHER'],fetchImpl,timeoutMs=20000}={}){
  const cfg=graphConfig({accessToken,graphVersion,fetchImpl,timeoutMs});
  const waba=id(wabaId,WABA_ID_RE);if(!waba)throw fail('meta_flow_waba_invalid');
  const flowName=validatedName(name);
  const normalized=Array.isArray(categories)?[...new Set(categories.map(x=>clean(x,40).toUpperCase()))]:[];
  if(!normalized.length||normalized.some(x=>!SAFE_CATEGORIES.has(x)))throw fail('meta_flow_categories_invalid');
  const payload=await graphRequest({cfg,path:waba+'/flows',method:'POST',body:{name:flowName,categories:normalized}});
  const flowId=id(payload.id,FLOW_ID_RE);if(!flowId)throw fail('meta_flow_create_response_invalid',{httpStatus:502});
  return {id:flowId,name:flowName,status:clean(payload.status,40).toUpperCase()||'DRAFT',categories:normalized};
}
export async function uploadFlowJsonViaMeta({accessToken,flowId,graphVersion,json,fetchImpl,timeoutMs=25000}={}){
  const cfg=graphConfig({accessToken,graphVersion,fetchImpl,timeoutMs});
  const flow=id(flowId,FLOW_ID_RE);if(!flow)throw fail('meta_flow_id_invalid');
  const validated=validateFlowJson(json);
  const form=new FormData();
  form.set('name','flow.json');
  form.set('asset_type','FLOW_JSON');
  form.set('file',new Blob([validated.text],{type:'application/json'}),'flow.json');
  const payload=await graphRequest({cfg,path:flow+'/assets',method:'POST',form});
  return {id:flow,uploaded:payload.success===true||payload.success==='true',data_api_version:validated.dataApiVersion,validation_errors:safeValidationErrors(payload.validation_errors)};
}
export async function configureFlowEndpointViaMeta({accessToken,flowId,graphVersion,endpointUri,fetchImpl,timeoutMs=15000}={}){
  const cfg=graphConfig({accessToken,graphVersion,fetchImpl,timeoutMs});
  const flow=id(flowId,FLOW_ID_RE);if(!flow)throw fail('meta_flow_id_invalid');
  let endpoint;
  try{endpoint=new URL(String(endpointUri??''))}catch{throw fail('meta_flow_endpoint_invalid')}
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname.includes('..'))throw fail('meta_flow_endpoint_invalid');
  const payload=await graphRequest({cfg,path:flow,method:'POST',body:{endpoint_uri:endpoint.toString().replace(/\/$/,'')}});
  return {id:flow,endpoint_uri:clean(payload.endpoint_uri??endpoint.toString(),500),success:payload.success!==false};
}
function pemBody(pem){
  const body=String(pem??'').replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,'');
  if(body.length<100||body.length>20000)throw fail('meta_flow_private_key_invalid');
  try{return Uint8Array.from(atob(body),char=>char.charCodeAt(0))}catch{throw fail('meta_flow_private_key_invalid')}
}
function pemEncode(bytes,label){
  const base64=btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const lines=base64.match(/.{1,64}/g)||[];
  return '-----BEGIN '+label+'-----\n'+lines.join('\n')+'\n-----END '+label+'-----';
}
export async function derivePublicKeyPem(privateKeyPem){
  if(!globalThis.crypto?.subtle)throw fail('meta_flow_crypto_unavailable');
  let privateKey,jwk;
  try{
    privateKey=await crypto.subtle.importKey('pkcs8',pemBody(privateKeyPem),{name:'RSA-OAEP',hash:'SHA-256'},true,['decrypt']);
    jwk=await crypto.subtle.exportKey('jwk',privateKey);
    const publicJwk={kty:'RSA',n:jwk.n,e:jwk.e,alg:'RSA-OAEP-256',ext:true,key_ops:['encrypt']};
    const publicKey=await crypto.subtle.importKey('jwk',publicJwk,{name:'RSA-OAEP',hash:'SHA-256'},true,['encrypt']);
    return pemEncode(await crypto.subtle.exportKey('spki',publicKey),'PUBLIC KEY');
  }catch(error){
    if(error instanceof MetaFlowsError)throw error;
    throw fail('meta_flow_private_key_invalid');
  }
}
const normalizePublicKey=value=>String(value??'').replace(/\\n/g,'').replace(/\s+/g,'').trim();
export async function getBusinessPublicKeyStatusViaMeta({accessToken,phoneNumberId,graphVersion,expectedPublicKeyPem=null,fetchImpl,timeoutMs=15000}={}){
  const cfg=graphConfig({accessToken,graphVersion,fetchImpl,timeoutMs});
  const phone=id(phoneNumberId,PHONE_ID_RE);if(!phone)throw fail('meta_flow_phone_id_invalid');
  const payload=await graphRequest({cfg,path:phone+'/whatsapp_business_encryption'});
  const row=Array.isArray(payload.data)?object(payload.data[0]):object(payload);
  const registeredKey=String(row.business_public_key??row.public_key??'');
  return {
    configured:Boolean(clean(registeredKey,5000)),
    matches_expected:expectedPublicKeyPem?normalizePublicKey(registeredKey)===normalizePublicKey(expectedPublicKeyPem):null,
    signature_status:clean(row.public_key_signature_status??row.business_public_key_signature_status,80)||null
  };
}
export async function registerBusinessPublicKeyViaMeta({accessToken,phoneNumberId,graphVersion,privateKeyPem,fetchImpl,timeoutMs=20000}={}){
  const cfg=graphConfig({accessToken,graphVersion,fetchImpl,timeoutMs});
  const phone=id(phoneNumberId,PHONE_ID_RE);if(!phone)throw fail('meta_flow_phone_id_invalid');
  const publicKey=await derivePublicKeyPem(privateKeyPem);
  const payload=await graphRequest({cfg,path:phone+'/whatsapp_business_encryption',method:'POST',body:{business_public_key:publicKey}});
  return {success:payload.success===true||payload.success==='true'||!payload.error};
}
export function assertFlowPublishable(flow,{endpointUri,publicKeyConfigured=false,publicKeyMatchesPrivateKey=true,privateKeyConfigured=false,metaAppSecretConfigured=false,sessionSecretConfigured=false}={}){
  const row=object(flow);
  if(String(row.status||'').toUpperCase()!=='DRAFT')throw fail('meta_flow_not_draft',{httpStatus:409});
  const errors=flowValidationErrors(row);
  if(errors===null)throw fail('meta_flow_validation_unavailable',{httpStatus:409});
  if(errors.length)throw fail('meta_flow_validation_failed',{httpStatus:409,details:errors});
  if(clean(row.endpoint_uri,500)!==clean(endpointUri,500))throw fail('meta_flow_endpoint_not_configured',{httpStatus:409});
  if(!publicKeyConfigured)throw fail('meta_flow_public_key_not_registered',{httpStatus:409});
  if(!publicKeyMatchesPrivateKey)throw fail('meta_flow_public_key_mismatch',{httpStatus:409});
  if(!privateKeyConfigured||!metaAppSecretConfigured||!sessionSecretConfigured)throw fail('meta_flow_runtime_secrets_missing',{httpStatus:409});
  return true;
}
export async function publishFlowViaMeta({accessToken,flowId,graphVersion,endpointUri,phoneNumberId,privateKeyPem=null,privateKeyConfigured=false,metaAppSecretConfigured=false,sessionSecretConfigured=false,fetchImpl,timeoutMs=20000}={}){
  const cfg=graphConfig({accessToken,graphVersion,fetchImpl,timeoutMs});
  const flow=id(flowId,FLOW_ID_RE);if(!flow)throw fail('meta_flow_id_invalid');
  const details=await getFlowViaMeta({accessToken:cfg.token,flowId:flow,graphVersion:cfg.version,fetchImpl:cfg.fetchImpl,timeoutMs:cfg.timeout});
  const expectedPublicKeyPem=privateKeyPem?await derivePublicKeyPem(privateKeyPem):null;
  const key=await getBusinessPublicKeyStatusViaMeta({accessToken:cfg.token,phoneNumberId,graphVersion:cfg.version,expectedPublicKeyPem,fetchImpl:cfg.fetchImpl,timeoutMs:cfg.timeout});
  assertFlowPublishable(details,{endpointUri,publicKeyConfigured:key.configured,publicKeyMatchesPrivateKey:key.matches_expected===true,privateKeyConfigured,metaAppSecretConfigured,sessionSecretConfigured});
  const payload=await graphRequest({cfg,path:flow+'/publish',method:'POST',body:{}});
  return {id:flow,published:payload.success===true||payload.success==='true',status:clean(payload.status,40).toUpperCase()||'PUBLISHED'};
}
export async function deleteFlowViaMeta({accessToken,flowId,graphVersion,fetchImpl,timeoutMs=15000}={}){
  const cfg=graphConfig({accessToken,graphVersion,fetchImpl,timeoutMs});
  const flow=id(flowId,FLOW_ID_RE);if(!flow)throw fail('meta_flow_id_invalid');
  const payload=await graphRequest({cfg,path:flow,method:'DELETE'});
  return {id:flow,deleted:payload.success===true||payload.success==='true'};
}

