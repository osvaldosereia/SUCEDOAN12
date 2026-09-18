export type PublishContext={graphVersion:string;channel:string;contentType:string;accountId:string;token:string;caption?:string|null;title?:string|null;destinationUrl?:string|null;mediaUrls:string[];metadata?:Record<string,unknown>};
export type PublishResult={ok:boolean;provider:string;channel:string;external_ref?:string|null;provider_state?:Record<string,unknown>;published?:boolean;external_side_effect:boolean;error?:string;detail?:string};

const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const safeJson=async(res:Response)=>{const t=await res.text();try{return t?JSON.parse(t):{}}catch{return {raw:t.slice(0,1000)}}};
const form=(v:Record<string,unknown>)=>{const p=new URLSearchParams();for(const [k,x] of Object.entries(v)){if(x!==undefined&&x!==null&&x!=='')p.set(k,String(x))}return p};
const auth=(token:string)=>({Authorization:`Bearer ${token}`});
const graphBase=(version:string)=>{const v=clean(version,20);if(!/^v\d+\.\d+$/.test(v))throw new Error('graph_api_version_missing');return `https://graph.facebook.com/${v}`};

async function graphRequest(url:string,token:string,init:RequestInit={}){
  const res=await fetch(url,{...init,headers:{...auth(token),...(init.headers||{})}});
  const body=await safeJson(res);
  if(!res.ok||body?.error){const message=clean(body?.error?.message||body?.message||body?.error||`HTTP ${res.status}`,500);const code=clean(body?.error?.code||body?.code||res.status,80);throw new Error(`provider_${code}:${message}`)}
  return body;
}

async function waitInstagramContainer(base:string,containerId:string,token:string){
  for(let i=0;i<40;i++){const body=await graphRequest(`${base}/${encodeURIComponent(containerId)}?fields=status_code,status`,token);const status=clean(body?.status_code||'',40).toUpperCase();if(status==='FINISHED')return body;if(['ERROR','EXPIRED'].includes(status))throw new Error(`instagram_container_${status.toLowerCase()}`);await sleep(1500)}
  throw new Error('instagram_container_not_ready');
}

async function instagramCreateAndPublish(ctx:PublishContext,params:Record<string,unknown>):Promise<PublishResult>{
  const base=graphBase(ctx.graphVersion);
  const created=await graphRequest(`${base}/${encodeURIComponent(ctx.accountId)}/media`,ctx.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form(params)});
  const creationId=clean(created?.id,120);if(!creationId)throw new Error('instagram_creation_id_missing');
  await waitInstagramContainer(base,creationId,ctx.token);
  const published=await graphRequest(`${base}/${encodeURIComponent(ctx.accountId)}/media_publish`,ctx.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({creation_id:creationId})});
  return {ok:true,provider:'meta',channel:ctx.channel,external_ref:clean(published?.id||creationId,160),provider_state:{creation_id:creationId},published:true,external_side_effect:true};
}

async function publishInstagram(ctx:PublishContext):Promise<PublishResult>{
  if(ctx.channel==='instagram_feed'){if(ctx.mediaUrls.length!==1)return {ok:false,provider:'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'instagram_feed_requires_one_image'};return instagramCreateAndPublish(ctx,{image_url:ctx.mediaUrls[0],caption:ctx.caption||''})}
  if(ctx.channel==='instagram_story'){if(ctx.mediaUrls.length!==1)return {ok:false,provider:'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'instagram_story_requires_one_image'};return instagramCreateAndPublish(ctx,{media_type:'STORIES',image_url:ctx.mediaUrls[0]})}
  if(ctx.channel==='instagram_reel'){if(ctx.mediaUrls.length!==1)return {ok:false,provider:'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'instagram_reel_requires_one_video'};return instagramCreateAndPublish(ctx,{media_type:'REELS',video_url:ctx.mediaUrls[0],caption:ctx.caption||'',share_to_feed:'true'})}
  if(ctx.channel==='instagram_carousel'){
    if(ctx.mediaUrls.length<2||ctx.mediaUrls.length>10)return {ok:false,provider:'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'instagram_carousel_media_count_invalid'};
    const base=graphBase(ctx.graphVersion),children:string[]=[];
    for(const mediaUrl of ctx.mediaUrls){const child=await graphRequest(`${base}/${encodeURIComponent(ctx.accountId)}/media`,ctx.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({image_url:mediaUrl,is_carousel_item:'true'})});const childId=clean(child?.id,120);if(!childId)throw new Error('instagram_carousel_child_missing');await waitInstagramContainer(base,childId,ctx.token);children.push(childId)}
    return instagramCreateAndPublish(ctx,{media_type:'CAROUSEL',children:children.join(','),caption:ctx.caption||''});
  }
  return {ok:false,provider:'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'instagram_channel_unsupported'};
}

async function publishFacebook(ctx:PublishContext):Promise<PublishResult>{
  const base=graphBase(ctx.graphVersion);
  if(ctx.channel==='facebook_post'){
    if(ctx.mediaUrls.length!==1)return {ok:false,provider:'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'facebook_post_requires_one_image'};
    const body=await graphRequest(`${base}/${encodeURIComponent(ctx.accountId)}/photos`,ctx.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({url:ctx.mediaUrls[0],message:ctx.caption||'',published:'true'})});
    return {ok:true,provider:'meta',channel:ctx.channel,external_ref:clean(body?.post_id||body?.id,160),provider_state:{photo_id:body?.id||null},published:true,external_side_effect:true};
  }
  if(ctx.channel==='facebook_reel'){
    if(ctx.mediaUrls.length!==1)return {ok:false,provider:'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'facebook_reel_requires_one_video'};
    const start=await graphRequest(`${base}/me/video_reels`,ctx.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({upload_phase:'start'})});
    const videoId=clean(start?.video_id,160),uploadUrl=clean(start?.upload_url,1200);if(!videoId||!uploadUrl)throw new Error('facebook_reel_upload_session_missing');
    const upload=await fetch(uploadUrl,{method:'POST',headers:{Authorization:`OAuth ${ctx.token}`,file_url:ctx.mediaUrls[0]}});
    const uploadBody=await safeJson(upload);if(!upload.ok||uploadBody?.success!==true)throw new Error('facebook_reel_upload_failed');
    const finish=await graphRequest(`${base}/me/video_reels`,ctx.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({video_id:videoId,upload_phase:'finish',video_state:'PUBLISHED',description:ctx.caption||'',title:ctx.title||''})});
    return {ok:true,provider:'meta',channel:ctx.channel,external_ref:videoId,provider_state:{video_id:videoId,finish_success:finish?.success===true},published:true,external_side_effect:true};
  }
  return {ok:false,provider:'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'facebook_channel_unsupported'};
}

async function publishPinterest(ctx:PublishContext):Promise<PublishResult>{
  if(ctx.mediaUrls.length!==1)return {ok:false,provider:'pinterest',channel:ctx.channel,published:false,external_side_effect:false,error:'pinterest_pin_requires_one_image'};
  const boardId=clean(ctx.metadata?.board_id,160);if(!boardId)return {ok:false,provider:'pinterest',channel:ctx.channel,published:false,external_side_effect:false,error:'pinterest_board_id_missing'};
  const res=await fetch('https://api.pinterest.com/v5/pins',{method:'POST',headers:{Authorization:`Bearer ${ctx.token}`,'Content-Type':'application/json'},body:JSON.stringify({board_id:boardId,title:clean(ctx.title,100),description:clean(ctx.caption,500),link:clean(ctx.destinationUrl,2048),media_source:{source_type:'image_url',url:ctx.mediaUrls[0],is_standard:true}})});
  const body=await safeJson(res);if(!res.ok)throw new Error(`pinterest_${res.status}:${clean(body?.message||body?.code||'create_pin_failed',400)}`);
  return {ok:true,provider:'pinterest',channel:ctx.channel,external_ref:clean(body?.id,160),provider_state:{pin_id:body?.id||null},published:true,external_side_effect:true};
}

export async function verifyMarketingChannel(opts:{provider:string;channel:string;accountId:string;token:string;graphVersion?:string;metadata?:Record<string,unknown>}):Promise<Record<string,unknown>>{
  const provider=clean(opts.provider,40),channel=clean(opts.channel,80),accountId=clean(opts.accountId,160),token=clean(opts.token,4000),version=clean(opts.graphVersion,20);
  if(!token)return {ok:false,error:'credential_missing'};
  try{
    if(provider==='meta'){
      if(!accountId)return {ok:false,error:'external_account_id_missing'};
      if(!/^v\d+\.\d+$/.test(version))return {ok:false,error:'graph_api_version_missing'};
      const instagram=channel.startsWith('instagram_'),fields=instagram?'id,username,account_type':'id,name';
      const body=await graphRequest(`${graphBase(version)}/${encodeURIComponent(accountId)}?fields=${encodeURIComponent(fields)}`,token);
      if(channel==='instagram_story'&&clean(body?.account_type,40).toUpperCase()!=='BUSINESS')return {ok:false,error:'instagram_story_requires_business_account',identity:{id:body?.id||null,name:body?.username||null,account_type:body?.account_type||null}};
      return {ok:true,provider,channel,account_id:accountId,identity:{id:body?.id||null,name:body?.name||body?.username||null,account_type:body?.account_type||null},graph_api_version:version,verification_scope:'identity',external_side_effect:false};
    }
    if(provider==='pinterest'){
      const boardId=clean(opts.metadata?.board_id,160),endpoint=boardId?`https://api.pinterest.com/v5/boards/${encodeURIComponent(boardId)}`:'https://api.pinterest.com/v5/boards?page_size=1';
      const res=await fetch(endpoint,{headers:{Authorization:`Bearer ${token}`}}),body=await safeJson(res);
      if(!res.ok)return {ok:false,error:'pinterest_verification_failed',detail:clean(body?.message||res.status,300)};
      return {ok:true,provider,channel,board_access:true,board_id:boardId||null,verification_scope:'board_access',external_side_effect:false};
    }
    return {ok:false,error:'provider_unsupported'};
  }catch(error){return {ok:false,error:'channel_verification_failed',detail:clean((error as Error)?.message,800),external_side_effect:false}}
}

export async function publishMarketingChannel(ctx:PublishContext):Promise<PublishResult>{
  if(ctx.channel==='facebook_story'||ctx.channel==='whatsapp_status')return {ok:false,provider:ctx.channel==='whatsapp_status'?'whatsapp':'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'manual_channel'};
  if(!ctx.token)return {ok:false,provider:'unknown',channel:ctx.channel,published:false,external_side_effect:false,error:'credential_missing'};
  if(ctx.channel.startsWith('instagram_')||ctx.channel==='facebook_post'||ctx.channel==='facebook_reel'){
    if(!/^v\d+\.\d+$/.test(clean(ctx.graphVersion,20)))return {ok:false,provider:'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'graph_api_version_missing'};
    if(!clean(ctx.accountId,160))return {ok:false,provider:'meta',channel:ctx.channel,published:false,external_side_effect:false,error:'external_account_id_missing'};
  }
  try{
    if(ctx.channel.startsWith('instagram_'))return await publishInstagram(ctx);
    if(ctx.channel==='facebook_post'||ctx.channel==='facebook_reel')return await publishFacebook(ctx);
    if(ctx.channel==='pinterest_pin')return await publishPinterest(ctx);
    return {ok:false,provider:'unknown',channel:ctx.channel,published:false,external_side_effect:false,error:'channel_unsupported'};
  }catch(error){return {ok:false,provider:ctx.channel==='pinterest_pin'?'pinterest':'meta',channel:ctx.channel,published:false,external_side_effect:true,error:'provider_publish_failed',detail:clean((error as Error)?.message,800)}}
}
