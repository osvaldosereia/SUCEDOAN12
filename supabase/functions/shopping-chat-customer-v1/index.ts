import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const cors=(req:Request)=>{const o=req.headers.get('origin');if(o&&!ORIGINS.has(o))return null;return {'Access-Control-Allow-Origin':o||'https://donaantonia.com.br','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v:unknown,max=500)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const tokenOk=(v:unknown)=>/^[a-f0-9]{64}$/i.test(clean(v,80));
const phoneDigits=(v:unknown)=>String(v??'').replace(/\D/g,'');

Deno.serve(async(req:Request)=>{
  const ch=cors(req);if(!ch)return new Response('forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers:ch});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return json(req,{ok:false,error:'server_config'},500);
  let body:any={};try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}
  const action=clean(body?.action,60).toLowerCase(),token=clean(body?.token,80);
  if(!tokenOk(token))return json(req,{ok:false,error:'invalid_token'},400);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:session,error:sessionError}=await sb.from('catalog_sessions').select('id,customer_id,conversation_id,cart_id,status,expires_at,metadata').eq('public_token',token).maybeSingle();
  if(sessionError)return json(req,{ok:false,error:'room_lookup_failed'},500);
  if(!session)return json(req,{ok:false,error:'room_not_found'},404);
  if(session.status!=='open'||new Date(session.expires_at).getTime()<=Date.now())return json(req,{ok:false,error:'room_unavailable'},409);

  if(action==='basket_policies'){
    if(!session.cart_id)return json(req,{ok:true,policies:[]});
    const {data,error}=await sb.from('cart_items').select('product_id,source,quantity,metadata').eq('cart_id',session.cart_id).in('source',['basket','substitution']).order('created_at');
    if(error)return json(req,{ok:false,error:'basket_policies_failed'},500);
    const policies=(data||[]).map((item:any)=>({
      product_id:item.product_id,
      quantity:Number(item.quantity||0),
      quantity_editable:item.metadata?.quantity_editable!==false,
      removable:item.metadata?.removable!==false,
      min_quantity:item.metadata?.min_quantity==null?null:Number(item.metadata.min_quantity),
      max_quantity:item.metadata?.max_quantity==null?null:Number(item.metadata.max_quantity)
    }));
    return json(req,{ok:true,policies});
  }

  if(action==='lookup_customer'){
    const phone=clean(body?.phone,40),digits=phoneDigits(phone);
    if(digits.length<10||digits.length>13)return json(req,{ok:false,error:'valid_whatsapp_required'},400);
    const attempts=Math.max(0,Number(session.metadata?.customer_lookup_attempts||0));
    if(attempts>=5)return json(req,{ok:false,error:'lookup_limit_reached'},429);
    await sb.from('catalog_sessions').update({metadata:{...(session.metadata||{}),customer_lookup_attempts:attempts+1},last_activity_at:new Date().toISOString()}).eq('id',session.id);
    const {data:lookup,error:lookupError}=await sb.rpc('lookup_customer_by_phone',{p_phone:phone});
    if(lookupError)return json(req,{ok:false,error:'customer_lookup_failed'},500);
    const match=Array.isArray(lookup)?lookup[0]:lookup;
    if(!match?.customer_id)return json(req,{ok:true,found:false});
    const {data:customer,error:identifyError}=await sb.rpc('room_identify_customer',{
      p_public_token:token,
      p_name:clean(match.customer_name,120),
      p_phone:phone,
      p_document:null
    });
    if(identifyError)return json(req,{ok:false,error:'customer_identify_failed',detail:identifyError.message},400);
    const {data:checkout,error:previewError}=await sb.rpc('room_checkout_preview',{p_public_token:token});
    if(previewError)return json(req,{ok:false,error:'checkout_refresh_failed'},500);
    return json(req,{ok:true,found:true,customer,checkout});
  }

  return json(req,{ok:false,error:'unknown_action'},400);
});
