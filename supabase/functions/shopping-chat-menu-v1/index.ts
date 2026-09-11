import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const cors=(req:Request)=>{const o=req.headers.get('origin');if(o&&!ORIGINS.has(o))return null;return {'Access-Control-Allow-Origin':o||'https://donaantonia.com.br','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const tokenOk=(v:unknown)=>/^[a-f0-9]{64}$/i.test(clean(v,80));
const uuidOk=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const SAFE_KINDS=new Set(['baskets','offers','products','payment','delivery','profile','text']);

function publicItems(value:unknown){
  if(!Array.isArray(value))return [];
  return value.slice(0,20).map((raw:any,index)=>({
    id:clean(raw?.id,60)||`item-${index+1}`,
    label:clean(raw?.label,80)||'Opção',
    kind:SAFE_KINDS.has(clean(raw?.kind,30))?clean(raw?.kind,30):'text',
    enabled:raw?.enabled!==false,
    sort_order:Number.isFinite(Number(raw?.sort_order))?Math.max(0,Math.min(9999,Math.round(Number(raw.sort_order)))):(index+1)*10,
    response_text:clean(raw?.response_text,600)
  })).filter(x=>x.enabled).sort((a,b)=>a.sort_order-b.sort_order);
}

Deno.serve(async(req:Request)=>{
  const ch=cors(req);if(!ch)return new Response('forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers:ch});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return json(req,{ok:false,error:'server_config'},500);
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}
  const token=clean(body?.token,80);if(!tokenOk(token))return json(req,{ok:false,error:'invalid_token'},400);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:session,error:se}=await sb.from('catalog_sessions').select('id,status,expires_at').eq('public_token',token).maybeSingle();
  if(se)return json(req,{ok:false,error:'room_lookup_failed'},500);if(!session)return json(req,{ok:false,error:'room_not_found'},404);
  if(session.status!=='open'||new Date(session.expires_at).getTime()<=Date.now())return json(req,{ok:false,error:'room_inactive'},410);
  const action=clean(body?.action||'get',30).toLowerCase();

  if(action==='get'){
    const {data,error}=await sb.from('shopping_chat_helper_config').select('enabled,prompt_text,avatar_url,menu_items,updated_at').eq('id',1).maybeSingle();
    if(error)return json(req,{ok:false,error:'helper_config_failed'},500);
    const cfg:any=data||{enabled:true,prompt_text:'Quer ajuda?',avatar_url:null,menu_items:[],updated_at:null};
    return json(req,{ok:true,config:{enabled:cfg.enabled!==false,prompt_text:clean(cfg.prompt_text,60)||'Quer ajuda?',avatar_url:clean(cfg.avatar_url,500)||null,menu_items:publicItems(cfg.menu_items),updated_at:cfg.updated_at||null}});
  }

  if(action==='basket_items'){
    const basketId=clean(body?.basket_id,80);if(!uuidOk(basketId))return json(req,{ok:false,error:'invalid_basket'},400);
    const {data:basket,error:be}=await sb.from('basket_templates').select('id,name,base_price,image_url,is_active,is_whatsapp_active').eq('id',basketId).maybeSingle();
    if(be)return json(req,{ok:false,error:'basket_failed'},500);if(!basket||!basket.is_active||!basket.is_whatsapp_active)return json(req,{ok:false,error:'basket_not_found'},404);
    const {data:items,error}=await sb.from('basket_template_items').select('product_id,quantity,sort_order,product:products(id,name,image_url,brand,packaging)').eq('basket_id',basketId).order('sort_order').limit(60);
    if(error)return json(req,{ok:false,error:'basket_items_failed',detail:error.message},400);
    return json(req,{ok:true,basket:{id:basket.id,name:basket.name,base_price:basket.base_price,image_url:basket.image_url},items:(items||[]).map((i:any)=>({product_id:i.product_id,quantity:Number(i.quantity||0),sort_order:i.sort_order,product:i.product||null}))});
  }

  return json(req,{ok:false,error:'unknown_action'},400);
});
