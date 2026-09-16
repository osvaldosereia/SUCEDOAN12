import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {searchPolyHaven,acquirePolyHaven} from './polyhaven.ts';

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=400)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const slug=(v:string)=>clean(v,120).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'asset';
const BUCKET='creative-studio-assets',MAX_EXTERNAL=3;

function searchTerms(need:string,keywords:string[]){return [need,...keywords].map(x=>clean(x,80)).filter(Boolean).join(' ')}
async function localSearch(sb:any,need:string,keywords:string[],limit=12){
  const q=searchTerms(need,keywords);if(!q)return [];
  const {data}=await sb.from('stopmotion_assets').select('id,asset_key,name,category,tags,asset_type,object_name,concepts,actions_compatible,visual_roles,styles,orientation,transparent,quality_score,usage_count,local_storage_path,file_format,license_code,license_url,attribution_required,commercial_use_allowed,source_provider,source_asset_id,metadata').eq('commercial_use_allowed',true).in('file_format',['jpg','jpeg','png','webp','svg']).textSearch('search_vector',q,{type:'websearch',config:'simple'}).order('quality_score',{ascending:false}).limit(limit);
  return data||[];
}
async function adminClient(req:Request){
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return {error:'server_config'};
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();if(!token)return {error:'missing_token'};
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  if(token===key)return {sb,caller:'internal_service_role'};
  const {data:userData}=await sb.auth.getUser(token);if(!userData?.user?.id)return {error:'invalid_user'};
  const {data:admin}=await sb.from('admin_users').select('role,is_active').eq('user_id',userData.user.id).maybeSingle();
  if(!admin?.is_active||!['owner','operator'].includes(admin.role))return {error:'admin_not_authorized'};
  return {sb,user:userData.user,admin,caller:'authenticated_admin'};
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  const auth=await adminClient(req);if(auth.error)return json({ok:false,error:auth.error},auth.error==='admin_not_authorized'?403:401);
  const sb=auth.sb;let body:any;try{body=await req.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  const action=clean(body.action||'search',40).toLowerCase();const need=clean(body.need,120);const keywords=Array.isArray(body.keywords)?body.keywords.map((x:any)=>clean(x,80)).filter(Boolean).slice(0,8):[];

  if(action==='search')return json({ok:true,assets:await localSearch(sb,need,keywords,Math.min(30,Math.max(1,Number(body.limit)||12))),source:'library',caller:auth.caller});
  if(action==='signed_url'){
    const path=clean(body.path,500);if(!path)return json({ok:false,error:'path_required'},400);
    const {data,error}=await sb.storage.from(BUCKET).createSignedUrl(path,600);if(error)return json({ok:false,error:'signed_url_failed'},400);return json({ok:true,signed_url:data.signedUrl,caller:auth.caller});
  }
  if(action!=='resolve')return json({ok:false,error:'unknown_action'},400);
  if(!need)return json({ok:false,error:'need_required'},400);
  const local=await localSearch(sb,need,keywords,12);if(local.length)return json({ok:true,status:'resolved_local',asset:local[0],external_acquisition:false,caller:auth.caller});
  if(body.allow_external!==true)return json({ok:true,status:'missing',reason:'external_disabled',caller:auth.caller});
  const jobKey=clean(body.job_key,120);let used=Math.max(0,Number(body.external_acquisitions)||0);
  if(jobKey){const {count}=await sb.from('creative_studio_asset_requests').select('id',{count:'exact',head:true}).eq('job_key',jobKey).eq('external_acquisition',true);used=Math.max(used,Number(count)||0)}
  if(used>=MAX_EXTERNAL)return json({ok:true,status:'blocked',reason:'external_acquisition_cap',caller:auth.caller});
  const candidates=await searchPolyHaven(need,keywords,8);const candidate=candidates[0];if(!candidate)return json({ok:true,status:'missing',reason:'no_safe_free_candidate',caller:auth.caller});
  const {data:existing}=await sb.from('stopmotion_assets').select('*').eq('source_provider','polyhaven').eq('source_asset_id',candidate.id).in('file_format',['jpg','jpeg','png','webp','svg']).maybeSingle();
  if(existing)return json({ok:true,status:'resolved_local',asset:existing,external_acquisition:false,reused:true,provider_credit:'Powered by Poly Haven',caller:auth.caller});
  const acquired=await acquirePolyHaven(candidate);if(!acquired)return json({ok:true,status:'missing',reason:'provider_no_compatible_file',caller:auth.caller});
  const download=await fetch(acquired.download_url);if(!download.ok)return json({ok:true,status:'missing',reason:'provider_download_failed',caller:auth.caller});
  const bytes=await download.arrayBuffer();if(bytes.byteLength>25*1024*1024)return json({ok:true,status:'blocked',reason:'file_too_large',caller:auth.caller});
  const path=`polyhaven/${slug(candidate.id)}/${slug(candidate.id)}.${acquired.file_format}`;
  const {error:uploadError}=await sb.storage.from(BUCKET).upload(path,bytes,{contentType:acquired.mime_type,upsert:false});
  if(uploadError&&!String(uploadError.message||'').toLowerCase().includes('already exists'))return json({ok:false,error:'storage_upload_failed',detail:uploadError.message},500);
  const record={asset_key:`polyhaven:${candidate.id}:${acquired.file_format}`,name:candidate.name,category:candidate.category||null,tags:(candidate.tags||[]).map((x:any)=>clean(x,80)),source_asset_url:acquired.source_url,source_download_url:acquired.download_url,local_storage_path:path,file_format:acquired.file_format,license_code:'CC0',attribution_required:true,commercial_use_allowed:true,ingest_status:'ready',metadata:{description:candidate.description||'',provider_credit:'Powered by Poly Haven'},asset_type:'image',object_name:candidate.name,concepts:(candidate.tags||[]).map((x:any)=>clean(x,80).toLowerCase()),styles:['style_agnostic'],quality_score:.9,source_provider:'polyhaven',source_asset_id:candidate.id,license_url:acquired.license_url,license_validated:true,acquired_at:new Date().toISOString()};
  const {data:asset,error:insertError}=await sb.from('stopmotion_assets').upsert(record,{onConflict:'asset_key'}).select('*').single();
  if(insertError)return json({ok:false,error:'asset_record_failed',detail:insertError.message},500);
  if(jobKey)await sb.from('creative_studio_asset_requests').insert({job_key:jobKey,need,keywords,status:'acquired',resolved_asset_id:asset.id,external_acquisition:true,resolved_at:new Date().toISOString()});
  return json({ok:true,status:'acquired',asset,external_acquisition:true,external_acquisitions:used+1,provider_credit:'Powered by Poly Haven',caller:auth.caller});
});
