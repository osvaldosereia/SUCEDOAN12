const clean=(value,max=2000)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);

export class MetaMediaError extends Error{
  constructor(code,{status=0,retryable=false}={}){super(code);this.name='MetaMediaError';this.code=code;this.status=status;this.retryable=retryable}
  toJSON(){return {name:this.name,code:this.code,status:this.status,retryable:this.retryable}}
}

function strictGraphVersion(value){const version=clean(value,20);if(!/^v\d+\.\d+$/.test(version))throw new MetaMediaError('meta_media_graph_version_invalid');return version}
function strictMediaId(value){const id=clean(value,240);if(!/^[A-Za-z0-9._:-]{3,240}$/.test(id))throw new MetaMediaError('meta_media_id_invalid');return id}

export function isAllowedMetaMediaUrl(value){
  try{
    const url=new URL(String(value||''));
    if(url.protocol!=='https:'||url.username!==''||url.password!=='')return false;
    const host=url.hostname.toLowerCase();
    return host==='graph.facebook.com'||host.endsWith('.facebook.com')||host==='lookaside.fbsbx.com'||host.endsWith('.fbsbx.com')||host.endsWith('.fbcdn.net')||host==='whatsapp.net'||host.endsWith('.whatsapp.net');
  }catch{return false}
}

async function safeJson(response){try{return await response.json()}catch{return {}}}

export async function fetchMetaMediaInfo({accessToken,graphVersion,mediaId,fetchFn=fetch,timeoutMs=15000}={}){
  const token=clean(accessToken,12000);if(!token)throw new MetaMediaError('meta_media_token_missing');
  const version=strictGraphVersion(graphVersion);const id=strictMediaId(mediaId);
  let response;
  try{
    response=await fetchFn(`https://graph.facebook.com/${version}/${encodeURIComponent(id)}`,{
      method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(timeoutMs)
    });
  }catch(error){if(error instanceof MetaMediaError)throw error;throw new MetaMediaError('meta_media_info_network_error',{retryable:true})}
  if(!response.ok){const body=await safeJson(response);const code=clean(body?.error?.code,40)||String(response.status);throw new MetaMediaError(`meta_media_info_http_${code}`,{status:response.status,retryable:response.status>=500})}
  const body=await safeJson(response);const url=clean(body?.url,4000);if(!isAllowedMetaMediaUrl(url))throw new MetaMediaError('meta_media_url_not_allowed');
  const resolvedId=clean(body?.id,240)||id;const fileSize=Number(body?.file_size);
  return {mediaId:resolvedId,url,mimeType:clean(body?.mime_type,180)||null,sha256:clean(body?.sha256,240)||null,fileSize:Number.isFinite(fileSize)&&fileSize>=0?fileSize:null};
}

export async function fetchMetaMediaResponse({accessToken,url,fetchFn=fetch,timeoutMs=15000}={}){
  const token=clean(accessToken,12000);if(!token)throw new MetaMediaError('meta_media_token_missing');
  const target=clean(url,4000);if(!isAllowedMetaMediaUrl(target))throw new MetaMediaError('meta_media_url_not_allowed');
  let response;
  try{
    response=await fetchFn(target,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'*/*'},redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  }catch(error){if(error instanceof MetaMediaError)throw error;throw new MetaMediaError('meta_media_download_network_error',{retryable:true})}
  if(!response.ok)throw new MetaMediaError(`meta_media_download_http_${response.status}`,{status:response.status,retryable:response.status>=500});
  return response;
}
