import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const SAFE_KINDS=new Set(['baskets','offers','products','payment','delivery','profile','text']);
const REQUIRED=new Set(['baskets','offers','products','payment','delivery','profile']);

function sanitizeItems(value:unknown){
  if(!Array.isArray(value))return [];
  const seen=new Set<string>();
  const items:any[]=[];
  for(let i=0;i<Math.min(value.length,20);i++){
    const raw:any=value[i]||{};
    let kind=clean(raw.kind,30);if(!SAFE_KINDS.has(kind))kind='text';
    let id=clean(raw.id,60).toLowerCase().replace(/[^a-z0-9_-]/g,'-');
    if(!id)id=kind==='text'?`custom-${i+1}`:kind;
    if(seen.has(id))id=`${id}-${i+1}`;seen.add(id);
    items.push({
      id,
      label:clean(raw.label,80)||'Opção',
      kind,
      enabled:raw.enabled!==false,
      sort_order:Number.isFinite(Number(raw.sort_order))?Math.max(0,Math.min(9999,Math.round(Number(raw.sort_order)))):(i+1)*10,
      response_text:clean(raw.response_text,600)
    });
  }
  for(const kind of REQUIRED){if(!items.some(x=>x.kind===kind))items.push({id:kind,label:kind,kind,enabled:false,sort_order:9000,response_text:''});}
  return items.sort((a,b)=>a.sort_order-b.sort_order);
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!serviceKey)return json({ok:false,error:'server_config'},500);
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();if(!token)return json({ok:false,error:'unauthorized'},401);
  const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:ud}=await sb.auth.getUser(token);if(!ud?.user?.id)return json({ok:false,error:'unauthorized'},401);
  const user=ud.user;
  const {data:admin}=await sb.from('admin_users').select('role,is_active').eq('user_id',user.id).maybeSingle();
  if(!admin?.is_active)return json({ok:false,error:'admin_not_authorized'},403);
  const canWrite=admin.role==='owner'||admin.role==='operator';
  let body:any={};try{body=await req.json()}catch{}
  const action=clean(body?.action||'get',30).toLowerCase();

  if(action==='get'){
    const {data,error}=await sb.from('shopping_chat_helper_config').select('enabled,prompt_text,avatar_url,menu_items,updated_at').eq('id',1).maybeSingle();
    if(error)return json({ok:false,error:'helper_config_failed',detail:error.message},400);
    return json({ok:true,config:data||{enabled:true,prompt_text:'Quer ajuda?',avatar_url:null,menu_items:[]},can_write:canWrite});
  }

  if(action==='save'){
    if(!canWrite)return json({ok:false,error:'read_only'},403);
    const enabled=body?.enabled!==false;
    const promptText=clean(body?.prompt_text,60)||'Quer ajuda?';
    const avatarRaw=clean(body?.avatar_url,500);
    if(avatarRaw&&!/^https:\/\//i.test(avatarRaw)&&!/^\/?[a-z0-9_./-]+$/i.test(avatarRaw))return json({ok:false,error:'invalid_avatar_url',detail:'Use uma URL https ou um caminho de imagem do site.'},400);
    const menuItems=sanitizeItems(body?.menu_items);
    const {data,error}=await sb.from('shopping_chat_helper_config').upsert({id:1,enabled,prompt_text:promptText,avatar_url:avatarRaw||null,menu_items:menuItems,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:'id'}).select('enabled,prompt_text,avatar_url,menu_items,updated_at').single();
    if(error)return json({ok:false,error:'helper_save_failed',detail:error.message},400);
    return json({ok:true,config:data});
  }

  return json({ok:false,error:'unknown_action'},400);
});
