import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const cors=(req:Request)=>{const o=req.headers.get('origin');if(o&&!ORIGINS.has(o))return null;return {'Access-Control-Allow-Origin':o||'https://donaantonia.com.br','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const tokenOk=(v:unknown)=>/^[a-f0-9]{64}$/i.test(clean(v,80));
const uuidOk=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));

Deno.serve(async(req:Request)=>{
  const ch=cors(req);if(!ch)return new Response('forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers:ch});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return json(req,{ok:false,error:'server_config'},500);
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}
  const token=clean(body?.token,80),action=clean(body?.action,40).toLowerCase();if(!tokenOk(token))return json(req,{ok:false,error:'invalid_token'},400);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:session,error}=await sb.from('catalog_sessions').select('id,customer_id,status,expires_at').eq('public_token',token).maybeSingle();
  if(error)return json(req,{ok:false,error:'room_lookup_failed'},500);if(!session)return json(req,{ok:false,error:'room_not_found'},404);if(session.status!=='open'||new Date(session.expires_at).getTime()<=Date.now())return json(req,{ok:false,error:'room_unavailable'},409);

  if(action==='preview'){
    const {data,error:previewError}=await sb.rpc('room_checkout_preview',{p_public_token:token});
    if(previewError)return json(req,{ok:false,error:'checkout_failed',detail:previewError.message},400);
    return json(req,{ok:true,checkout:data});
  }

  if(action==='save_address'){
    const address=body?.delivery_address&&typeof body.delivery_address==='object'?body.delivery_address:{};
    const mode=clean(body?.mode||'add',20).toLowerCase();
    const addressId=body?.address_id==null?null:clean(body.address_id,80);
    if(addressId&&!uuidOk(addressId))return json(req,{ok:false,error:'invalid_address_id'},400);
    const {data,error:saveError}=await sb.rpc('room_save_address_v2',{p_public_token:token,p_address:address,p_mode:mode,p_address_id:addressId||null});
    if(saveError)return json(req,{ok:false,error:'address_failed',detail:saveError.message},400);
    const {data:checkout}=await sb.rpc('room_checkout_preview',{p_public_token:token});
    return json(req,{ok:true,address:data,checkout});
  }

  return json(req,{ok:false,error:'unknown_action'},400);
});
