import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const BUCKET='marketing-private';
const ALLOWED_MIME=new Set(['image/webp','image/png','image/jpeg','video/mp4']);

function fail(message){throw new Error(message)}
function uuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))}
function safeLeaf(v){const s=String(v||'output').replace(/[^a-zA-Z0-9._-]/g,'_').replace(/^\.+/,'').slice(0,120);return s||'output'}
function assertSupabaseUrl(raw){const u=new URL(String(raw||''));if(u.protocol!=='https:'||!/\.supabase\.co$/i.test(u.hostname))fail('invalid_supabase_url');return u.origin}

export function buildObjectPath({assetId,version,jobId,extension}){
  if(!uuid(assetId))fail('invalid_asset_id');
  const v=Number(version);if(!Number.isInteger(v)||v<1)fail('invalid_asset_version');
  const ext=String(extension||'').replace(/^\./,'').toLowerCase();if(!['webp','png','jpg','jpeg','mp4'].includes(ext))fail('invalid_extension');
  return `${assetId}/v${v}/${safeLeaf(jobId)}.${ext}`;
}

export async function persistRenderedOutput({
  supabaseUrl,
  serviceRoleKey,
  assetId,
  version,
  jobId,
  role='output',
  filePath,
  mimeType,
  width=null,
  height=null,
  durationMs=null,
  actor=null,
  metadata={},
  fetchImpl=globalThis.fetch
}){
  if(!fetchImpl)fail('fetch_unavailable');
  const base=assertSupabaseUrl(supabaseUrl);
  if(!serviceRoleKey||String(serviceRoleKey).length<20)fail('service_role_required');
  if(!ALLOWED_MIME.has(mimeType))fail('unsupported_mime_type');
  if(!['output','preview','thumbnail','poster','source'].includes(role))fail('invalid_media_role');
  const ext=mimeType==='image/webp'?'webp':mimeType==='image/png'?'png':mimeType==='image/jpeg'?'jpg':'mp4';
  const objectPath=buildObjectPath({assetId,version,jobId,extension:ext});
  const bytes=await fs.readFile(filePath);
  if(bytes.length<1)fail('empty_output');
  if(bytes.length>104857600)fail('output_too_large');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const headers={Authorization:`Bearer ${serviceRoleKey}`,apikey:serviceRoleKey,'Content-Type':mimeType,'x-upsert':'false'};
  const upload=await fetchImpl(`${base}/storage/v1/object/${BUCKET}/${objectPath}`,{method:'POST',headers,body:bytes});
  if(!upload.ok){const detail=await upload.text().catch(()=>String(upload.status));fail(`storage_upload_failed:${upload.status}:${detail.slice(0,180)}`)}
  const rpcPayload={p_asset_id:assetId,p_version:Number(version),p_role:role,p_object_path:objectPath,p_mime_type:mimeType,p_width:width,p_height:height,p_duration_ms:durationMs,p_byte_size:bytes.length,p_sha256:sha256,p_metadata:{...metadata,render_job_id:jobId,bucket_name:BUCKET},p_actor:actor};
  const reg=await fetchImpl(`${base}/rest/v1/rpc/register_marketing_private_media_v2`,{method:'POST',headers:{Authorization:`Bearer ${serviceRoleKey}`,apikey:serviceRoleKey,'Content-Type':'application/json'},body:JSON.stringify(rpcPayload)});
  const regBody=await reg.json().catch(()=>({}));
  if(!reg.ok||regBody?.ok===false){
    await fetchImpl(`${base}/storage/v1/object/${BUCKET}/${objectPath}`,{method:'DELETE',headers:{Authorization:`Bearer ${serviceRoleKey}`,apikey:serviceRoleKey}}).catch(()=>null);
    fail(`media_registration_failed:${reg.status}:${String(regBody?.error||'unknown').slice(0,120)}`);
  }
  return {ok:true,bucket:BUCKET,object_path:objectPath,mime_type:mimeType,byte_size:bytes.length,sha256,media_id:regBody?.media_id||regBody?.id||null,storage_side_effect:true,external_side_effect:false};
}
