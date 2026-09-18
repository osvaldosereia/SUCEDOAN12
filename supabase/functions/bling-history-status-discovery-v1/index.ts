import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const API_BASE='https://api.bling.com.br/Api/v3';
const OAUTH_URLS=['https://api.bling.com.br/oauth/token','https://api.bling.com.br/Api/v3/oauth/token'];
const clean=(value:unknown,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const normalize=(value:unknown)=>clean(value,200).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function safeEqual(a:string,b:string){
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
const basic=(id:string,secret:string)=>btoa(`${id}:${secret}`);

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return response({ok:false,error:'method_not_allowed'},405);
  let body:any={};try{body=await req.json()}catch{body={}}
  const supabaseUrl=Deno.env.get('SUPABASE_URL');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!supabaseUrl||!serviceKey)return response({ok:false,error:'server_config'},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:expected,error:keyError}=await sb.rpc('get_bling_history_import_key_v1');
  if(keyError||!expected)return response({ok:false,error:'import_key_not_configured'},503);
  const bearer=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const supplied=clean(req.headers.get('x-dona-antonia-import-key')||bearer,200);
  if(!supplied||!safeEqual(supplied,String(expected)))return response({ok:false,error:'unauthorized'},401);

  const {data:credentials,error:credentialError}=await sb.rpc('get_bling_api_credentials_v1');
  if(credentialError)return response({ok:false,error:'credentials_lookup_failed'},500);
  const clientId=clean(credentials?.client_id||Deno.env.get('BLING_CLIENT_ID'),500);
  const clientSecret=clean(credentials?.client_secret||Deno.env.get('BLING_CLIENT_SECRET'),500);
  const refreshToken=clean(credentials?.refresh_token||Deno.env.get('BLING_REFRESH_TOKEN'),5000);
  if(!clientId||!clientSecret||!refreshToken)return response({ok:false,error:'bling_credentials_missing'},503);

  let oauthResponse:Response|null=null;
  let oauth:any={};
  for(const oauthUrl of OAUTH_URLS){
    const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken});
    const attempt=await fetch(oauthUrl,{
      method:'POST',
      headers:{
        Authorization:`Basic ${basic(clientId,clientSecret)}`,
        'Content-Type':'application/x-www-form-urlencoded',
        Accept:'1.0',
        'enable-jwt':'1'
      },
      body
    });
    const raw=await attempt.text();
    let parsed:any={};try{parsed=raw?JSON.parse(raw):{}}catch{}
    oauthResponse=attempt;oauth=parsed;
    if(attempt.ok&&clean(parsed?.access_token,5000))break;
    if(![403,404,405].includes(attempt.status))break;
  }
  if(!oauthResponse?.ok||!clean(oauth?.access_token,5000))return response({ok:false,error:'bling_oauth_failed',http_status:oauthResponse?.status||0},502);

  const rotated=clean(oauth?.refresh_token,5000);
  if(rotated&&rotated!==refreshToken){
    const {error:rotateError}=await sb.rpc('set_bling_api_refresh_token_v1',{p_refresh_token:rotated});
    if(rotateError)return response({ok:false,error:'refresh_token_persist_failed'},500);
  }

  const accessToken=clean(oauth.access_token,5000);
  const get=async(path:string)=>{
    const r=await fetch(`${API_BASE}${path}`,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','enable-jwt':'1'}});
    const raw=await r.text();
    let json:any={};try{json=raw?JSON.parse(raw):{}}catch{}
    return {r,json};
  };

  const directStatusIds=(Array.isArray(body?.status_ids)?body.status_ids:[])
    .map((value:any)=>Number(value))
    .filter((value:number,index:number,array:number[])=>Number.isInteger(value)&&value>0&&array.indexOf(value)===index)
    .slice(0,25);

  if(directStatusIds.length){
    const saved:any[]=[];
    const errors:any[]=[];
    for(const id of directStatusIds){
      const result=await get(`/situacoes/${encodeURIComponent(String(id))}`);
      if(!result.r.ok){
        errors.push({id,http_status:result.r.status});
        continue;
      }
      const data=result.json?.data||{};
      const name=clean(data?.nome||data?.descricao,160);
      const {data:existing}=await sb.from('bling_history_status_policy').select('approved,canonical_status').eq('bling_status_id',id).maybeSingle();
      const {error}=await sb.from('bling_history_status_policy').upsert({
        bling_status_id:id,
        status_name:name||null,
        approved:existing?.approved===true,
        canonical_status:existing?.canonical_status||null,
        updated_at:new Date().toISOString()
      },{onConflict:'bling_status_id'});
      if(error){errors.push({id,error:'status_upsert_failed'});continue}
      saved.push({id,name,approved:existing?.approved===true,canonical_status:existing?.canonical_status||null});
    }
    return response({ok:errors.length===0,direct:true,discovered:saved.length,statuses:saved,errors,auto_approved:0},errors.length?207:200);
  }

  const modulesResult=await get('/situacoes/modulos');
  if(!modulesResult.r.ok)return response({ok:false,error:'modules_fetch_failed',http_status:modulesResult.r.status},502);
  const modules=Array.isArray(modulesResult.json?.data)?modulesResult.json.data:[];
  const candidates=modules
    .map((m:any)=>({id:Number(m?.id||0),name:clean(m?.nome||m?.descricao,160),raw:m}))
    .filter((m:any)=>m.id>0)
    .map((m:any)=>{
      const n=normalize(m.name);
      let score=0;
      if(n.includes('pedido'))score+=5;
      if(n.includes('venda'))score+=8;
      if(n.includes('pedidos de venda'))score+=10;
      if(n.includes('pedido de venda'))score+=10;
      return {...m,score};
    })
    .sort((a:any,b:any)=>b.score-a.score||a.id-b.id);

  const selected=candidates.find((m:any)=>m.score>=13)||candidates.find((m:any)=>m.score>0)||null;
  if(!selected)return response({ok:false,error:'sales_order_module_not_found',modules:candidates.map((m:any)=>({id:m.id,name:m.name}))},404);

  const statusResult=await get(`/situacoes/modulos/${encodeURIComponent(String(selected.id))}`);
  if(!statusResult.r.ok)return response({ok:false,error:'statuses_fetch_failed',http_status:statusResult.r.status,module:{id:selected.id,name:selected.name}},502);
  const statuses=Array.isArray(statusResult.json?.data)?statusResult.json.data:[];

  const saved:any[]=[];
  for(const item of statuses){
    const id=Number(item?.id||0);
    const name=clean(item?.nome,160);
    if(!id)continue;
    const {data:existing}=await sb.from('bling_history_status_policy').select('approved,canonical_status').eq('bling_status_id',id).maybeSingle();
    const {error}=await sb.from('bling_history_status_policy').upsert({
      bling_status_id:id,
      status_name:name||null,
      approved:existing?.approved===true,
      canonical_status:existing?.canonical_status||null,
      updated_at:new Date().toISOString()
    },{onConflict:'bling_status_id'});
    if(error)return response({ok:false,error:'status_upsert_failed',status_id:id},500);
    saved.push({id,name,approved:existing?.approved===true,canonical_status:existing?.canonical_status||null});
  }

  return response({
    ok:true,
    module:{id:selected.id,name:selected.name},
    discovered:saved.length,
    statuses:saved,
    auto_approved:0
  });
});
