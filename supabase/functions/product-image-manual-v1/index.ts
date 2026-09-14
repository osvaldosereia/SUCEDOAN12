import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.112.3';

const PROJECT_HOST='ssbesxgaijknwsjbsbcz.supabase.co';
const BUCKET='product-images';
const MODEL='gpt-image-2.5-sunburst';
const VALIDATOR_MODEL='gpt-5.6-luna';
const PIPELINE_VERSION='grid18-studio-v2-medium-clean';
const IMAGE_URL='https://api.openai.com/v1/images/edits';
const RESPONSES_URL='https://api.openai.com/v1/responses';
const ALLOWED_HOSTS=new Set(['raw.githubusercontent.com',PROJECT_HOST,'donaantonia.com.br','www.donaantonia.com.br']);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v,max=1200)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const arr=v=>Array.isArray(v)?v:[];
const score=v=>Math.max(0,Math.min(1,Number(v||0)));

async function sha256Text(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function bytesToBase64(bytes){let s='',n=0x8000;for(let i=0;i<bytes.length;i+=n)s+=String.fromCharCode(...bytes.subarray(i,Math.min(i+n,bytes.length)));return btoa(s);}
function base64ToBytes(b64){const raw=atob(b64),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
function safeSource(raw){try{const u=new URL(clean(raw,1800));return u.protocol==='https:'&&ALLOWED_HOSTS.has(u.hostname)?u.toString():'';}catch{return'';}}
function contentType(url,header){const h=clean(header,80).split(';')[0].toLowerCase();if(['image/png','image/jpeg','image/webp'].includes(h))return h;const x=url.toLowerCase();if(x.includes('.png'))return'image/png';if(x.includes('.jpg')||x.includes('.jpeg'))return'image/jpeg';return'image/webp';}
async function fetchSource(product,supabaseUrl){
  const candidates=[product.image_source_url,product.image_original_url,product.image_url,`${supabaseUrl}/storage/v1/object/public/${BUCKET}/catalog-products/${product.id}.webp`].map(safeSource).filter(Boolean);
  let last='manual_source_missing';
  for(const url of [...new Set(candidates)]){
    try{
      const r=await fetch(url,{headers:{'User-Agent':'DonaAntonia-ManualImage/1.0','Accept':'image/webp,image/png,image/jpeg,image/*'},signal:AbortSignal.timeout(30000)});
      if(!r.ok){last=`source_http_${r.status}`;continue;}
      const bytes=new Uint8Array(await r.arrayBuffer());
      if(!bytes.length||bytes.length>8_000_000){last='source_size_invalid';continue;}
      return{url,bytes,type:contentType(url,r.headers.get('content-type'))};
    }catch(e){last=clean(e instanceof Error?e.message:e,180)||last;}
  }
  throw new Error(last);
}
function manualPrompt(product){
  const instruction=clean(product.image_ai_manual_prompt,1200);
  const identity=[product.name,product.brand,product.packaging,product.gtin].map(x=>clean(x,240)).filter(Boolean).join(' | ');
  return `Crie uma fotografia quadrada de catálogo do MESMO produto da referência. IDENTIDADE FIXA: ${identity}. A referência visual continua sendo a verdade para marca, variante, formato, tampa, cores e rótulo. A instrução administrativa abaixo serve apenas para corrigir composição/limpeza e NUNCA autoriza trocar produto, versão, peso, sabor, fragrância, marca ou embalagem.\n\nINSTRUÇÃO DO ADMIN: ${instruction}\n\nREGRAS OBRIGATÓRIAS: mostrar uma única unidade do produto, inteiro da base ao topo e de lateral a lateral, centralizado e com margens confortáveis; remover mãos, dedos, frutas, alimentos decorativos, copos, pratos, mesa, tecidos, cenário, preço, selo solto, logo flutuante, outro produto e qualquer elemento que não faça parte física do produto; corrigir recorte sem amputar nenhuma parte da embalagem; fundo uniforme cinza muito claro #ECECEC; iluminação profissional de estúdio; textura fotográfica realista; única sombra adicional permitida é uma sombra de contato macia e fisicamente plausível na base; não parecer render 3D artificial.`;
}
async function generate(key,source,product){
  const f=new FormData();
  f.append('model',MODEL);f.append('prompt',manualPrompt(product));f.append('size','816x816');f.append('quality','medium');f.append('output_format','webp');f.append('output_compression','78');f.append('background','opaque');
  const ext=source.type==='image/png'?'png':source.type==='image/jpeg'?'jpg':'webp';
  f.append('image[]',new Blob([source.bytes],{type:source.type}),`referencia.${ext}`);
  const r=await fetch(IMAGE_URL,{method:'POST',headers:{Authorization:`Bearer ${key}`},body:f,signal:AbortSignal.timeout(115000)}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`openai_http_${r.status}_${clean(d?.error?.code||d?.error?.message||'error',180)}`);
  const b64=String(d?.data?.[0]?.b64_json||'');if(!b64)throw new Error('openai_empty_image');
  const bytes=base64ToBytes(b64);if(!bytes.length||bytes.length>3_000_000)throw new Error(`openai_output_size_${bytes.length}`);
  return{bytes,usage:d?.usage||{},requestId:r.headers.get('x-request-id')||null};
}
function finalText(d){return arr(d?.output).filter(x=>x?.type==='message').flatMap(x=>arr(x?.content)).filter(x=>x?.type==='output_text').map(x=>String(x?.text||'')).join('').trim();}
const validationSchema={type:'object',additionalProperties:false,properties:{
  pass:{type:'boolean'},same_product:{type:'boolean'},packaging_color_match:{type:'boolean'},shape_match:{type:'boolean'},label_match:{type:'boolean'},
  product_complete:{type:'boolean'},bad_crop:{type:'boolean'},bad_cutout:{type:'boolean'},extra_elements:{type:'boolean'},professional_photo:{type:'boolean'},natural_contact_shadow:{type:'boolean'},
  fidelity_score:{type:'number',minimum:0,maximum:1},composition_score:{type:'number',minimum:0,maximum:1},cutout_score:{type:'number',minimum:0,maximum:1},background_score:{type:'number',minimum:0,maximum:1},critical_issue:{type:'string',maxLength:260}
},required:['pass','same_product','packaging_color_match','shape_match','label_match','product_complete','bad_crop','bad_cutout','extra_elements','professional_photo','natural_contact_shadow','fidelity_score','composition_score','cutout_score','background_score','critical_issue']};
async function validate(key,source,candidate){
  const body={model:VALIDATOR_MODEL,store:false,max_output_tokens:420,reasoning:{effort:'low'},input:[{role:'user',content:[
    {type:'input_text',text:'Compare a primeira imagem (referência) com a segunda (candidata). Aprove somente se for o mesmo produto/variante e a candidata mostrar o produto inteiro, sem recorte amputado e sem qualquer elemento extra. HARD FAIL para mãos, frutas, alimentos, copos, pratos, cenário, preços, outro produto, parte faltando ou produto encostado/cortado. Exija fundo uniforme #ECECEC, aparência fotográfica profissional, sombra de contato natural na base, formato/cor/rótulo fiéis. Não use conhecimento externo.'},
    {type:'input_image',image_url:`data:${source.type};base64,${bytesToBase64(source.bytes)}`,detail:'high'},
    {type:'input_image',image_url:`data:image/webp;base64,${bytesToBase64(candidate)}`,detail:'high'}
  ]}],text:{format:{type:'json_schema',name:'manual_product_image_validation_v1',strict:true,schema:validationSchema}}};
  const r=await fetch(RESPONSES_URL,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`vision_http_${r.status}_${clean(d?.error?.code||d?.error?.message||'error',180)}`);
  const text=finalText(d);if(!text)throw new Error('vision_empty_output');let p;try{p=JSON.parse(text);}catch{throw new Error('vision_invalid_json');}
  const v={pass:p?.pass===true,same_product:p?.same_product===true,packaging_color_match:p?.packaging_color_match===true,shape_match:p?.shape_match===true,label_match:p?.label_match===true,product_complete:p?.product_complete===true,bad_crop:p?.bad_crop===true,bad_cutout:p?.bad_cutout===true,extra_elements:p?.extra_elements===true,professional_photo:p?.professional_photo===true,natural_contact_shadow:p?.natural_contact_shadow===true,fidelity_score:score(p?.fidelity_score),composition_score:score(p?.composition_score),cutout_score:score(p?.cutout_score),background_score:score(p?.background_score),critical_issue:clean(p?.critical_issue,260)};
  const accepted=v.pass&&v.same_product&&v.packaging_color_match&&v.shape_match&&v.label_match&&v.product_complete&&!v.bad_crop&&!v.bad_cutout&&!v.extra_elements&&v.professional_photo&&v.natural_contact_shadow&&v.fidelity_score>=0.90&&v.composition_score>=0.90&&v.cutout_score>=0.90&&v.background_score>=0.90;
  return{accepted,validation:v,usage:d?.usage||{}};
}
async function upload(sb,path,bytes){const q=await sb.storage.from(BUCKET).upload(path,bytes,{contentType:'image/webp',cacheControl:'31536000',upsert:false});if(q.error)throw new Error(`storage_${clean(q.error.message,180)}`);return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;}
async function processOne(sb,supabaseUrl,key,job,product){
  if(product.is_active!==true)throw new Error('product_inactive');
  const source=await fetchSource(product,supabaseUrl),generated=await generate(key,source,product),checked=await validate(key,source,generated.bytes),now=new Date().toISOString();
  if(!checked.accepted){
    const path=`openai/manual/v1/rejected/${product.id}/${Date.now()}.webp`,candidate=await upload(sb,path,generated.bytes),reason=checked.validation.critical_issue||'manual_validation_rejected';
    await sb.from('product_image_jobs').update({status:'rejected',model:MODEL,openai_usage:generated.usage,validation:checked.validation,validation_usage:checked.usage,output_storage_path:path,output_url:candidate,error_message:reason,processed_at:now,updated_at:now}).eq('id',job.id);
    await sb.from('products').update({image_ai_url:candidate,image_ai_status:'rejected',image_ai_error:reason,image_ai_validation:checked.validation,image_ai_model:MODEL,image_ai_pipeline_version:PIPELINE_VERSION,image_ai_manual_review_required:true,image_ai_manual_review_reason:reason,image_ai_manual_attempts:Number(product.image_ai_manual_attempts||0)+1,image_ai_manual_resolved_at:null,image_ai_admin_updated_at:now,updated_at:now}).eq('id',product.id);
    return{product_id:product.id,accepted:false,reason,candidate_url:candidate};
  }
  const path=`openai/manual/v1/final/${product.id}/${Date.now()}.webp`,url=await upload(sb,path,generated.bytes);
  await sb.from('product_image_jobs').update({status:'completed',model:MODEL,openai_usage:generated.usage,validation:checked.validation,validation_usage:checked.usage,output_storage_path:path,output_url:url,error_message:null,processed_at:now,updated_at:now}).eq('id',job.id);
  await sb.from('products').update({image_original_url:source.url,image_ai_url:url,image_url:url,image_ai_status:'completed',image_ai_error:null,image_ai_validation:checked.validation,image_ai_model:MODEL,image_ai_processed_at:now,image_ai_pipeline_version:PIPELINE_VERSION,image_ai_manual_review_required:false,image_ai_manual_review_reason:null,image_ai_manual_attempts:Number(product.image_ai_manual_attempts||0)+1,image_ai_manual_resolved_at:now,image_ai_admin_updated_at:now,updated_at:now}).eq('id',product.id);
  return{product_id:product.id,accepted:true,url,request_id:generated.requestId,quality:'medium'};
}
async function authorized(sb,supplied){if(!supplied)return false;const q=await sb.from('system_secrets').select('key_hash,is_active').eq('key_name','product_image_worker_webhook_v1').maybeSingle();return !q.error&&q.data?.is_active&&(await sha256Text(supplied))===q.data.key_hash;}

Deno.serve(async req=>{
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  const supabaseUrl=Deno.env.get('SUPABASE_URL')||'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:'server_config'},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!(await authorized(sb,req.headers.get('x-da-product-image-key')||'')))return json({ok:false,error:'unauthorized'},401);
  let body={};try{body=await req.json();}catch{return json({ok:false,error:'invalid_json'},400);}
  if(body?.event==='healthcheck')return json({ok:true,event:'healthcheck',model:MODEL,validator_model:VALIDATOR_MODEL,quality:'medium',manual_only:true});
  if(body?.event!=='drain_manual')return json({ok:false,error:'unknown_event'},400);
  let key=Deno.env.get('OPENAI_API_KEY')||'';if(!key){try{const q=await sb.rpc('get_conversation_worker_provider_secret_v1');if(typeof q.data==='string')key=q.data;}catch{}}
  if(!key)return json({ok:false,error:'openai_key_missing'},500);
  const claimed=await sb.rpc('claim_product_image_fallback_v1',{p_limit:1});if(claimed.error)return json({ok:false,error:'claim_failed',detail:clean(claimed.error.message,180)},500);
  const job=arr(claimed.data)[0];if(!job)return json({ok:true,event:'drain_manual',processed:0,reason:'manual_queue_empty'});
  const q=await sb.from('products').select('id,name,brand,packaging,gtin,is_active,image_url,image_original_url,image_source_url,image_ai_manual_prompt,image_ai_manual_attempts,image_ai_manual_review_required').eq('id',job.product_id).maybeSingle();
  if(q.error||!q.data)return json({ok:false,error:'product_not_found'},404);
  try{return json({ok:true,event:'drain_manual',processed:1,result:await processOne(sb,supabaseUrl,key,job,q.data)});}catch(e){
    const reason=clean(e instanceof Error?e.message:e,260),now=new Date().toISOString();
    await sb.from('product_image_jobs').update({status:'error',error_message:reason,started_at:null,updated_at:now}).eq('id',job.id);
    await sb.from('products').update({image_ai_status:'error',image_ai_error:reason,image_ai_manual_review_required:true,image_ai_manual_review_reason:reason,image_ai_manual_attempts:Number(q.data.image_ai_manual_attempts||0)+1,image_ai_manual_resolved_at:null,image_ai_admin_updated_at:now,updated_at:now}).eq('id',q.data.id);
    return json({ok:false,event:'drain_manual',error:reason,product_id:q.data.id},500);
  }
});
