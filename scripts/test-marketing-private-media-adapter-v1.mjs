import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildObjectPath, persistRenderedOutput } from './marketing-private-media-adapter-v1.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'da-marketing-private-adapter-'));
try{
  const assetId='11111111-1111-4111-8111-111111111111';
  const file=path.join(dir,'output.webp');
  await fs.writeFile(file,Buffer.from('RIFF-test-webp-content'));
  const expected=`${assetId}/v3/job_1.webp`;
  if(buildObjectPath({assetId,version:3,jobId:'job 1',extension:'webp'})!==expected) throw new Error('object path contract invalid');

  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url:String(url),method:options.method,headers:options.headers,body:options.body});
    if(String(url).includes('/storage/v1/object/')) return {ok:true,status:200,text:async()=>''};
    if(String(url).includes('/rest/v1/rpc/register_marketing_private_media_v2')) return {ok:true,status:200,json:async()=>({ok:true,media_id:'22222222-2222-4222-8222-222222222222'})};
    throw new Error('unexpected request');
  };
  const out=await persistRenderedOutput({supabaseUrl:'https://example.supabase.co',serviceRoleKey:'service-role-key-for-test-only-000000',assetId,version:3,jobId:'job 1',filePath:file,mimeType:'image/webp',width:1080,height:1080,fetchImpl});
  if(!out.ok||out.bucket!=='marketing-private'||out.object_path!==expected||out.external_side_effect!==false||out.storage_side_effect!==true) throw new Error('persist contract invalid');
  if(calls.length!==2) throw new Error('unexpected request count');
  if(!calls[0].url.endsWith(`/storage/v1/object/marketing-private/${expected}`)||calls[0].method!=='POST') throw new Error('storage request invalid');
  const rpc=JSON.parse(calls[1].body);
  if(rpc.p_asset_id!==assetId||rpc.p_version!==3||rpc.p_role!=='output'||rpc.p_object_path!==expected||rpc.p_sha256?.length!==64) throw new Error('registry payload invalid');

  let badUrl=false;try{await persistRenderedOutput({supabaseUrl:'http://example.supabase.co',serviceRoleKey:'service-role-key-for-test-only-000000',assetId,version:1,jobId:'x',filePath:file,mimeType:'image/webp',fetchImpl})}catch(e){badUrl=/invalid_supabase_url/.test(e.message)}if(!badUrl)throw new Error('non-https Supabase URL must be blocked');
  let badMime=false;try{await persistRenderedOutput({supabaseUrl:'https://example.supabase.co',serviceRoleKey:'service-role-key-for-test-only-000000',assetId,version:1,jobId:'x',filePath:file,mimeType:'text/html',fetchImpl})}catch(e){badMime=/unsupported_mime_type/.test(e.message)}if(!badMime)throw new Error('unsafe mime must be blocked');
  console.log('marketing private media adapter: ok');
}finally{await fs.rm(dir,{recursive:true,force:true})}
