export type MetaOAuthConfig={graphVersion:string;appId:string;appSecret:string;redirectUri:string;code:string};
export type PinterestOAuthConfig={appId:string;appSecret:string;redirectUri:string;code:string};

const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const safeJson=async(res:Response)=>{const t=await res.text();try{return t?JSON.parse(t):{}}catch{return {raw:t.slice(0,1000)}}};
const b64=(v:string)=>btoa(unescape(encodeURIComponent(v)));
const graphBase=(v:string)=>{const x=clean(v,20);if(!/^v\d+\.\d+$/.test(x))throw new Error('graph_api_version_missing');return `https://graph.facebook.com/${x}`};

export function buildMarketingOAuthUrl(provider:'meta'|'pinterest',opts:{appId:string;graphVersion?:string;redirectUri:string;state:string;scopes:string[]}){
  const appId=clean(opts.appId,200),redirectUri=clean(opts.redirectUri,1200),state=clean(opts.state,300);
  if(!appId||!redirectUri||!state)throw new Error('oauth_start_config_missing');
  if(provider==='meta'){
    const version=clean(opts.graphVersion,20);if(!/^v\d+\.\d+$/.test(version))throw new Error('graph_api_version_missing');
    const u=new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    u.searchParams.set('client_id',appId);u.searchParams.set('redirect_uri',redirectUri);u.searchParams.set('state',state);u.searchParams.set('response_type','code');u.searchParams.set('scope',opts.scopes.join(','));return u.toString();
  }
  const u=new URL('https://www.pinterest.com/oauth/');
  u.searchParams.set('client_id',appId);u.searchParams.set('redirect_uri',redirectUri);u.searchParams.set('state',state);u.searchParams.set('response_type','code');u.searchParams.set('scope',opts.scopes.join(','));return u.toString();
}

async function getJson(url:string,headers:Record<string,string>={}){
  const res=await fetch(url,{headers});const body=await safeJson(res);
  if(!res.ok||body?.error){throw new Error(clean(body?.error?.message||body?.message||body?.error||`HTTP ${res.status}`,800))}
  return body;
}

export async function exchangeMetaAuthorization(cfg:MetaOAuthConfig){
  const base=graphBase(cfg.graphVersion),url=new URL(`${base}/oauth/access_token`);
  url.searchParams.set('client_id',clean(cfg.appId,200));url.searchParams.set('client_secret',cfg.appSecret);url.searchParams.set('redirect_uri',cfg.redirectUri);url.searchParams.set('code',cfg.code);
  const short=await getJson(url.toString());
  let token=clean(short?.access_token,5000);if(!token)throw new Error('meta_access_token_missing');
  let expiresIn=Number(short?.expires_in||0),longLived=false;
  if(expiresIn>0&&expiresIn<7*86400){
    try{
      const ex=new URL(`${base}/oauth/access_token`);
      ex.searchParams.set('grant_type','fb_exchange_token');ex.searchParams.set('client_id',clean(cfg.appId,200));ex.searchParams.set('client_secret',cfg.appSecret);ex.searchParams.set('fb_exchange_token',token);
      const long=await getJson(ex.toString());
      if(long?.access_token){token=clean(long.access_token,5000);expiresIn=Number(long.expires_in||expiresIn);longLived=true}
    }catch{}
  }else if(expiresIn>=7*86400)longLived=true;
  return {accessToken:token,expiresIn,longLived};
}

export async function discoverMetaPages(graphVersion:string,userToken:string){
  const base=graphBase(graphVersion);
  const fields='id,name,access_token,tasks,instagram_business_account';
  const url=new URL(`${base}/me/accounts`);url.searchParams.set('fields',fields);url.searchParams.set('limit','100');
  const pages=await getJson(url.toString(),{Authorization:`Bearer ${userToken}`});
  const out:any[]=[];
  for(const p of Array.isArray(pages?.data)?pages.data:[]){
    const pageId=clean(p?.id,160),pageToken=clean(p?.access_token,5000);if(!pageId||!pageToken)continue;
    let ig:any=null;
    const igId=clean(p?.instagram_business_account?.id,160);
    if(igId){
      try{const u=new URL(`${base}/${encodeURIComponent(igId)}`);u.searchParams.set('fields','id,username,name,account_type');ig=await getJson(u.toString(),{Authorization:`Bearer ${pageToken}`})}catch{ig={id:igId}}
    }
    out.push({page_id:pageId,page_name:clean(p?.name,240),page_token:pageToken,tasks:Array.isArray(p?.tasks)?p.tasks.map((x:any)=>clean(x,80)).filter(Boolean):[],instagram:ig?{id:clean(ig?.id||igId,160),username:clean(ig?.username,180),name:clean(ig?.name,240),account_type:clean(ig?.account_type,40)}:null});
  }
  return out;
}

export async function exchangePinterestAuthorization(cfg:PinterestOAuthConfig){
  const body=new URLSearchParams({grant_type:'authorization_code',code:cfg.code,redirect_uri:cfg.redirectUri});
  const res=await fetch('https://api.pinterest.com/v5/oauth/token',{method:'POST',headers:{Authorization:`Basic ${b64(`${cfg.appId}:${cfg.appSecret}`)}`,'Content-Type':'application/x-www-form-urlencoded'},body});
  const data=await safeJson(res);if(!res.ok)throw new Error(clean(data?.message||data?.code||`Pinterest HTTP ${res.status}`,800));
  const accessToken=clean(data?.access_token,5000),refreshToken=clean(data?.refresh_token,5000);if(!accessToken)throw new Error('pinterest_access_token_missing');
  return {accessToken,refreshToken:refreshToken||null,expiresIn:Number(data?.expires_in||0),refreshExpiresIn:Number(data?.refresh_token_expires_in||0),scope:clean(data?.scope,1000)};
}

export async function discoverPinterestBoards(accessToken:string){
  let bookmark='',items:any[]=[];
  for(let page=0;page<4;page++){
    const u=new URL('https://api.pinterest.com/v5/boards');u.searchParams.set('page_size','100');if(bookmark)u.searchParams.set('bookmark',bookmark);
    const data=await getJson(u.toString(),{Authorization:`Bearer ${accessToken}`});
    for(const b of Array.isArray(data?.items)?data.items:[])items.push({id:clean(b?.id,160),name:clean(b?.name,240),privacy:clean(b?.privacy,40),description:clean(b?.description,300)});
    bookmark=clean(data?.bookmark,500);if(!bookmark)break;
  }
  return items.filter(x=>x.id);
}
