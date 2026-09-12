import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const cors=(origin:string|null)=>({...(origin&&ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'});
const json=(origin:string|null,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const clean=(v:unknown,max=3000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin');
  if(origin&&!ORIGINS.has(origin))return json(null,{ok:false,error:'origin_not_allowed'},403);
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(origin)});
  if(req.method!=='POST')return json(origin,{ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return json(origin,{ok:false,error:'server_config'},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{return json(origin,{ok:false,error:'invalid_json'},400)}
  const action=clean(body?.action||'dashboard',60).toLowerCase();

  if(action==='dashboard'){
    const [cfgR,eventR,sessionR]=await Promise.all([
      sb.from('shopping_chat_deterministic_config').select('*').eq('id',1).maybeSingle(),
      sb.from('shopping_chat_trigger_events').select('id,trigger,from_state,to_state,created_at').order('created_at',{ascending:false}).limit(40),
      sb.from('catalog_sessions').select('id,status,current_view,metadata,created_at,last_activity_at').eq('experience','shopping_room').order('last_activity_at',{ascending:false}).limit(100)
    ]);
    if(cfgR.error||eventR.error||sessionR.error)return json(origin,{ok:false,error:'dashboard_failed',detail:cfgR.error?.message||eventR.error?.message||sessionR.error?.message},500);
    const rows=(sessionR.data||[]).filter((s:any)=>s.metadata?.shopping_mode==='deterministic');const states:Record<string,number>={};for(const s of rows){const st=clean(s.metadata?.state||s.current_view||'UNKNOWN',60);states[st]=(states[st]||0)+1}
    return json(origin,{ok:true,config:cfgR.data||null,stats:{deterministic_sessions:rows.length,states},recent_events:eventR.data||[]});
  }

  if(action==='save_config'){
    const patch:any={updated_at:new Date().toISOString(),updated_by:null};
    if(typeof body?.enabled==='boolean')patch.enabled=body.enabled;
    for(const [k,max] of [['greeting_text',800],['unknown_text',800],['payment_text',1200],['delivery_text',1200],['human_text',800]] as const){if(body?.[k]!==undefined){const v=clean(body[k],max);if(!v)return json(origin,{ok:false,error:`${k}_required`},400);patch[k]=v}}
    patch.composer_enabled=false;patch.media_input_enabled=false;
    const {data,error}=await sb.from('shopping_chat_deterministic_config').update(patch).eq('id',1).select('*').single();if(error)return json(origin,{ok:false,error:'config_save_failed',detail:error.message},400);return json(origin,{ok:true,config:data});
  }

  return json(origin,{ok:false,error:'unknown_action'},400);
});
