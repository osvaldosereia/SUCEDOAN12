import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const BUCKET='marketing-private';
const MAX_BYTES=104857600;
const ALLOWED_IMAGE_MIME=new Map([['image/webp','webp'],['image/png','png'],['image/jpeg','jpg']]);

function fail(message){throw new Error(message)}
function uuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))}
function assertSupabaseUrl(raw){const u=new URL(String(raw||''));if(u.protocol!=='https:'||!/\.supabase\.co$/i.test(u.hostname))fail('invalid_supabase_url');return u.origin}
function safePath(raw){const s=String(raw||'').trim();if(!s||s.length>1000||s.startsWith('/')||s.includes('..')||s.includes('\0'))fail('invalid_object_path');return s}
function encodeObjectPath(p){return p.split('/').map(encodeURIComponent).join('/')}
function mediaIdFromLayer(layer={}){
  const direct=layer.source_ref?.kind==='private_media'?layer.source_ref?.media_id:null;
  const refs=Array.isArray(layer.source_refs)?layer.source_refs:[];
  return direct||refs.find(x=>x?.kind==='private_media'&&x?.media_id)?.media_id||layer.private_media_id||null;
}

export async function resolvePrivateMedia({supabaseUrl,serviceRoleKey,mediaId,assetId,version,tempDir,fetchImpl=globalThis.fetch}){
  if(!fetchImpl)fail('fetch_unavailable');
  const base=assertSupabaseUrl(supabaseUrl);
  if(!serviceRoleKey||String(serviceRoleKey).length<20)fail('service_role_required');
  if(!uuid(mediaId)||!uuid(assetId))fail('invalid_media_identity');
  const v=Number(version);if(!Number.isInteger(v)||v<1)fail('invalid_asset_version');
  const rpc=await fetchImpl(`${base}/rest/v1/rpc/marketing_media_signable_v1`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${serviceRoleKey}`,apikey:serviceRoleKey,'Content-Type':'application/json'},body:JSON.stringify({p_media_id:mediaId})});
  const rows=await rpc.json().catch(()=>[]);
  if(!rpc.ok)fail(`media_lookup_failed:${rpc.status}`);
  const media=Array.isArray(rows)?rows[0]:rows;
  if(!media)fail('media_not_found');
  if(String(media.media_id)!==String(mediaId)||String(media.asset_id)!==String(assetId)||Number(media.version)!==v)fail('media_scope_mismatch');
  if(media.bucket_name!==BUCKET)fail('invalid_media_bucket');
  const ext=ALLOWED_IMAGE_MIME.get(String(media.mime_type||''));if(!ext)fail('unsupported_source_mime');
  const objectPath=safePath(media.object_path),prefix=`${assetId}/v${v}/`;if(!objectPath.startsWith(prefix))fail('object_path_scope_mismatch');
  const expectedBytes=Number(media.byte_size||0);if(expectedBytes<0||expectedBytes>MAX_BYTES)fail('media_size_out_of_bounds');
  const response=await fetchImpl(`${base}/storage/v1/object/authenticated/${BUCKET}/${encodeObjectPath(objectPath)}`,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${serviceRoleKey}`,apikey:serviceRoleKey,'Cache-Control':'no-store'}});
  if(!response.ok)fail(`media_download_failed:${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1||bytes.length>MAX_BYTES)fail('media_download_size_invalid');
  if(expectedBytes&&bytes.length!==expectedBytes)fail('media_byte_size_mismatch');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  if(media.sha256&&String(media.sha256).toLowerCase()!==sha256)fail('media_checksum_mismatch');
  await fs.mkdir(tempDir,{recursive:true});
  const filePath=path.join(tempDir,`${mediaId}.${ext}`);
  await fs.writeFile(filePath,bytes,{flag:'wx'}).catch(async e=>{if(e?.code!=='EEXIST')throw e;const existing=await fs.readFile(filePath);const existingHash=crypto.createHash('sha256').update(existing).digest('hex');if(existingHash!==sha256)fail('temporary_source_collision')});
  return {ok:true,file_path:filePath,mime_type:media.mime_type,byte_size:bytes.length,sha256,media_id:mediaId,asset_id:assetId,version:v,external_side_effect:false};
}

export async function resolveSpecPrivateSources(spec,{supabaseUrl,serviceRoleKey,assetId,version,workspace,tempDir,fetchImpl=globalThis.fetch}={}){
  const cloned=structuredClone(spec&&typeof spec==='object'?spec:{});
  const layers=Array.isArray(cloned.layers)?cloned.layers:[];
  const resolved=[];
  for(const layer of layers){
    if(!layer||layer.type!=='image')continue;
    const mediaId=mediaIdFromLayer(layer);if(!mediaId)continue;
    const media=await resolvePrivateMedia({supabaseUrl,serviceRoleKey,mediaId,assetId,version,tempDir,fetchImpl});
    const relative=path.relative(path.resolve(workspace),path.resolve(media.file_path));
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))fail('temporary_source_outside_workspace');
    layer.src=relative;
    delete layer.private_media_id;
    delete layer.source_ref;
    delete layer.source_refs;
    resolved.push({media_id:mediaId,sha256:media.sha256,mime_type:media.mime_type});
  }
  return {spec:cloned,resolved,external_side_effect:false};
}

export {mediaIdFromLayer};