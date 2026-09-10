import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolvePrivateMedia, resolveSpecPrivateSources } from './marketing-private-media-resolver-v1.mjs';

const assetId='11111111-1111-4111-8111-111111111111';
const mediaId='22222222-2222-4222-8222-222222222222';
const bytes=Buffer.from('private-image-bytes');
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const key='service-role-key-for-marketing-tests-123';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'da-mkt-resolver-'));
let calls=[];
const okFetch=async (url,opts={})=>{
  calls.push({url:String(url),opts});
  if(String(url).includes('/rest/v1/rpc/marketing_media_signable_v1')) return new Response(JSON.stringify([{media_id:mediaId,asset_id:assetId,version:2,role:'source',bucket_name:'marketing-private',object_path:`${assetId}/v2/source.png`,mime_type:'image/png',byte_size:bytes.length,sha256}]),{status:200,headers:{'content-type':'application/json'}});
  if(String(url).includes('/storage/v1/object/authenticated/marketing-private/')) return new Response(bytes,{status:200,headers:{'content-type':'image/png'}});
  return new Response('not found',{status:404});
};
try{
  const one=await resolvePrivateMedia({supabaseUrl:'https://abc.supabase.co',serviceRoleKey:key,mediaId,assetId,version:2,tempDir:path.join(dir,'one'),fetchImpl:okFetch});
  if(!one.ok||one.sha256!==sha256||one.external_side_effect!==false) throw new Error('resolver contract invalid');
  if((await fs.readFile(one.file_path)).compare(bytes)!==0) throw new Error('resolver output mismatch');
  if(calls.some(c=>/sign/.test(c.url))) throw new Error('resolver must not create signed URLs');
  if(!calls.every(c=>c.opts?.redirect==='error')) throw new Error('resolver must block redirects');

  const spec={width:600,height:600,layers:[{type:'image',source_refs:[{kind:'private_media',media_id:mediaId}],crop:{fit:'cover',x:20,y:50,scale:1.2}}]};
  const out=await resolveSpecPrivateSources(spec,{supabaseUrl:'https://abc.supabase.co',serviceRoleKey:key,assetId,version:2,workspace:dir,tempDir:path.join(dir,'spec'),fetchImpl:okFetch});
  if(out.resolved.length!==1||!out.spec.layers[0].src||out.spec.layers[0].source_refs) throw new Error('private source not materialized');
  if(out.spec.layers[0].crop.x!==20) throw new Error('crop contract changed');

  let scopeBlocked=false;
  const wrongScope=async (url,opts)=>String(url).includes('/rpc/')?new Response(JSON.stringify([{media_id:mediaId,asset_id:'33333333-3333-4333-8333-333333333333',version:2,bucket_name:'marketing-private',object_path:'x/v2/source.png',mime_type:'image/png',byte_size:bytes.length,sha256}]),{status:200}):okFetch(url,opts);
  try{await resolvePrivateMedia({supabaseUrl:'https://abc.supabase.co',serviceRoleKey:key,mediaId,assetId,version:2,tempDir:path.join(dir,'bad'),fetchImpl:wrongScope})}catch(e){scopeBlocked=/media_scope_mismatch/.test(e.message)}
  if(!scopeBlocked) throw new Error('cross-asset media must be blocked');

  let checksumBlocked=false;
  const badHash=async (url,opts)=>String(url).includes('/rpc/')?new Response(JSON.stringify([{media_id:mediaId,asset_id:assetId,version:2,bucket_name:'marketing-private',object_path:`${assetId}/v2/source.png`,mime_type:'image/png',byte_size:bytes.length,sha256:'0'.repeat(64)}]),{status:200}):okFetch(url,opts);
  try{await resolvePrivateMedia({supabaseUrl:'https://abc.supabase.co',serviceRoleKey:key,mediaId,assetId,version:2,tempDir:path.join(dir,'hash'),fetchImpl:badHash})}catch(e){checksumBlocked=/media_checksum_mismatch/.test(e.message)}
  if(!checksumBlocked) throw new Error('checksum mismatch must be blocked');

  let hostBlocked=false;
  try{await resolvePrivateMedia({supabaseUrl:'https://evil.example.com',serviceRoleKey:key,mediaId,assetId,version:2,tempDir:path.join(dir,'host'),fetchImpl:okFetch})}catch(e){hostBlocked=/invalid_supabase_url/.test(e.message)}
  if(!hostBlocked) throw new Error('non-Supabase host must be blocked');

  console.log('marketing private media resolver: ok');
}finally{await fs.rm(dir,{recursive:true,force:true})}