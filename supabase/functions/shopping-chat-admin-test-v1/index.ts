import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const PAYMENT=new Set(['pix','credit_card','meal_card','cash']);
const clean=(v:unknown,max=1000)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const cors=(req:Request)=>{
  const origin=req.headers.get('origin');
  if(origin&&!ALLOWED_ORIGINS.has(origin))return null;
  return {
    'Access-Control-Allow-Origin':origin||'https://donaantonia.com.br',
    'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Vary':'Origin'
  };
};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...(cors(req)||{}),'Content-Type':'application/json','Cache-Control':'no-store'}});

Deno.serve(async(req:Request)=>{
  const headers=cors(req);
  if(!headers)return new Response('forbidden_origin',{status:403});
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return json(req,{ok:false,error:'method_not_allowed'},405);

  const url=Deno.env.get('SUPABASE_URL');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!serviceKey)return json(req,{ok:false,error:'server_config'},500);

  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)return json(req,{ok:false,error:'missing_admin_token'},401);
  const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token);
  if(userError||!userData?.user?.id)return json(req,{ok:false,error:'invalid_admin_token'},401);
  const {data:admin,error:adminError}=await sb.from('admin_users').select('role,is_active').eq('user_id',userData.user.id).maybeSingle();
  if(adminError)return json(req,{ok:false,error:'admin_lookup_failed'},500);
  if(!admin?.is_active||!['owner','admin','manager','operator'].includes(String(admin.role||'')))return json(req,{ok:false,error:'admin_not_authorized'},403);

  let body:any={};
  try{body=await req.json()}catch{return json(req,{ok:false,error:'invalid_json'},400)}
  if(clean(body?.action,40)!=='confirm_order'||body?.admin_test!==true)return json(req,{ok:false,error:'admin_test_action_required'},400);
  const publicToken=clean(body?.token,80);
  if(!/^[a-f0-9]{64}$/i.test(publicToken))return json(req,{ok:false,error:'invalid_token'},400);
  const method=clean(body?.payment_method,30);
  if(!PAYMENT.has(method))return json(req,{ok:false,error:'payment_method_required'},400);
  const address=body?.delivery_address&&typeof body.delivery_address==='object'&&!Array.isArray(body.delivery_address)?body.delivery_address:{};
  const locator=body?.delivery_locator&&typeof body.delivery_locator==='object'&&!Array.isArray(body.delivery_locator)?body.delivery_locator:null;
  const finalAddress=locator?{...address,locator}:address;

  const {data,error}=await sb.rpc('room_confirm_order_preview_v1',{p_public_token:publicToken,p_delivery_address:finalAddress});
  if(error){
    const detail=clean(error.message,800);
    const known=['room_unavailable','room_cart_unavailable','empty_cart','customer_identification_required','customer_document_required','delivery_address_required','cart_not_confirmable','pricing_not_ready'].find(code=>detail.includes(code));
    return json(req,{ok:false,error:known||'test_confirm_failed',detail},400);
  }
  return json(req,{ok:true,test_mode:true,would_create_order:true,order:data,payment_method:method});
});
