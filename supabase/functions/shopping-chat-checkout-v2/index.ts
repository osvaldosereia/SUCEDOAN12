import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const PAYMENT=new Set(['pix','cash','debit_card','credit_card','food_card','meal_card']);
const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const tokenOk=(v:unknown)=>/^[a-f0-9]{64}$/i.test(clean(v,80));
const cors=(req:Request)=>{const origin=req.headers.get('origin');if(origin&&!ORIGINS.has(origin))return null;return {'Access-Control-Allow-Origin':origin||'https://donaantonia.com.br','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json','Cache-Control':'no-store'}});

Deno.serve(async(req:Request)=>{
  const headers=cors(req);
  if(!headers)return new Response('forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);

  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return json(req,{ok:false,error:'server_config'},500);

  let body:any={};
  try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}
  const action=clean(body?.action,60).toLowerCase(),token=clean(body?.token,80);
  if(!['set_payment','confirm_order'].includes(action))return json(req,{ok:false,error:'unknown_action'},400);
  if(!tokenOk(token))return json(req,{ok:false,error:'invalid_token'},400);

  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:session,error:sessionError}=await sb.from('catalog_sessions').select('id,status,expires_at,metadata').eq('public_token',token).maybeSingle();
  if(sessionError)return json(req,{ok:false,error:'room_lookup_failed'},500);
  if(!session)return json(req,{ok:false,error:'room_not_found'},404);
  if(session.status!=='open')return json(req,{ok:false,error:'room_closed'},409);
  if(new Date(session.expires_at).getTime()<=Date.now())return json(req,{ok:false,error:'room_expired'},410);

  const method=clean(body?.payment_method||session.metadata?.payment_method,30);
  if(!PAYMENT.has(method))return json(req,{ok:false,error:action==='set_payment'?'invalid_payment_method':'payment_method_required'},400);

  if(action==='set_payment'){
    const {error}=await sb.from('catalog_sessions').update({metadata:{...(session.metadata||{}),payment_method:method},last_activity_at:new Date().toISOString()}).eq('id',session.id);
    if(error)return json(req,{ok:false,error:'payment_save_failed'},500);
    return json(req,{ok:true,payment_method:method});
  }

  const address=body?.delivery_address&&typeof body.delivery_address==='object'&&!Array.isArray(body.delivery_address)?body.delivery_address:{};
  const locator=body?.delivery_locator&&typeof body.delivery_locator==='object'&&!Array.isArray(body.delivery_locator)?body.delivery_locator:null;
  const finalAddress=locator?{...address,locator}:address;
  const {data,error}=await sb.rpc('room_confirm_order',{p_public_token:token,p_delivery_address:finalAddress});
  if(error)return json(req,{ok:false,error:'confirm_failed',detail:clean(error.message,800)},400);

  if(data?.order_id){
    const {error:paymentError}=await sb.from('orders').update({payment_method:method,updated_at:new Date().toISOString()}).eq('id',data.order_id);
    if(paymentError)return json(req,{ok:false,error:'payment_persist_failed'},500);
  }
  const {error:sessionUpdateError}=await sb.from('catalog_sessions').update({metadata:{...(session.metadata||{}),payment_method:method,light_chat_completed:true},last_activity_at:new Date().toISOString()}).eq('id',session.id);
  if(sessionUpdateError)return json(req,{ok:false,error:'checkout_session_update_failed'},500);
  return json(req,{ok:true,order:data,payment_method:method});
});
