import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const cors=(req:Request)=>{const o=req.headers.get('origin');if(o&&!ORIGINS.has(o))return null;return {'Access-Control-Allow-Origin':o||'https://donaantonia.com.br','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const clean=(v:unknown,max=3000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  const ch=cors(req);if(!ch)return new Response('forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers:ch});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return json(req,{ok:false,error:'server_config'},500);
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();if(!token)return json(req,{ok:false,error:'missing_token'},401);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token);if(userError||!userData?.user?.id)return json(req,{ok:false,error:'invalid_user'},401);
  const {data:admin,error:adminError}=await sb.from('admin_users').select('role,is_active,display_name').eq('user_id',userData.user.id).maybeSingle();if(adminError)return json(req,{ok:false,error:'admin_lookup_failed'},500);if(!admin?.is_active)return json(req,{ok:false,error:'admin_not_authorized'},403);
  const canWrite=admin.role==='owner'||admin.role==='operator';
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}
  const action=clean(body?.action||'dashboard',60).toLowerCase();

  if(action==='dashboard'){
    const [cfgR,eventR,sessionR]=await Promise.all([
      sb.from('shopping_chat_deterministic_config').select('*').eq('id',1).maybeSingle(),
      sb.from('shopping_chat_trigger_events').select('id,trigger,from_state,to_state,created_at').order('created_at',{ascending:false}).limit(40),
      sb.from('catalog_sessions').select('id,status,current_view,metadata,created_at,last_activity_at').eq('experience','shopping_room').order('last_activity_at',{ascending:false}).limit(100)
    ]);
    if(cfgR.error||eventR.error||sessionR.error)return json(req,{ok:false,error:'dashboard_failed',detail:cfgR.error?.message||eventR.error?.message||sessionR.error?.message},500);
    const states:Record<string,number>={};for(const s of sessionR.data||[]){if(s.metadata?.shopping_mode!=='deterministic')continue;const st=clean(s.metadata?.state||s.current_view||'UNKNOWN',60);states[st]=(states[st]||0)+1}
    return json(req,{ok:true,user:{role:admin.role,display_name:admin.display_name||null},config:cfgR.data||null,stats:{deterministic_sessions:(sessionR.data||[]).filter((s:any)=>s.metadata?.shopping_mode==='deterministic').length,states},recent_events:eventR.data||[]});
  }

  if(!canWrite)return json(req,{ok:false,error:'read_only'},403);

  if(action==='save_config'){
    const patch:any={updated_at:new Date().toISOString(),updated_by:userData.user.id};
    if(typeof body?.enabled==='boolean')patch.enabled=body.enabled;
    for(const [k,max] of [['greeting_text',800],['unknown_text',800],['payment_text',1200],['delivery_text',1200],['human_text',800]] as const){if(body?.[k]!==undefined){const v=clean(body[k],max);if(!v)return json(req,{ok:false,error:`${k}_required`},400);patch[k]=v}}
    patch.composer_enabled=false;patch.media_input_enabled=false;
    const {data,error}=await sb.from('shopping_chat_deterministic_config').update(patch).eq('id',1).select('*').single();if(error)return json(req,{ok:false,error:'config_save_failed',detail:error.message},400);return json(req,{ok:true,config:data});
  }

  return json(req,{ok:false,error:'unknown_action'},400);
});
