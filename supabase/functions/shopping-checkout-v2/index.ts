import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ORIGINS=new Set(['https://donaantonia.com.br','https://www.donaantonia.com.br']);
const PAYMENT=new Set(['pix','credit_card','meal_card','cash']);
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
  const {data:session,error}=await sb.from('catalog_sessions').select('id,customer_id,status,expires_at,metadata').eq('public_token',token).maybeSingle();
  if(error)return json(req,{ok:false,error:'room_lookup_failed'},500);
  if(!session)return json(req,{ok:false,error:'room_not_found'},404);
  const isFinalAction=action==='finalize_order'||action==='confirm_order';
  if(session.status==='closed'&&isFinalAction){
    const {data:existing}=await sb.from('orders').select('id,order_number,total,payment_method,delivery_address,source,catalog_session_id').eq('catalog_session_id',session.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(existing?.id)return json(req,{ok:true,recovered:true,order:{...existing,order_id:existing.id},payment_method:existing.payment_method||null});
  }
  if(session.status!=='open'||new Date(session.expires_at).getTime()<=Date.now())return json(req,{ok:false,error:'room_unavailable'},409);

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

  if(action==='finalize_order'){
    const method=clean(body?.payment_method||session.metadata?.payment_method,30);
    if(!PAYMENT.has(method))return json(req,{ok:false,error:'payment_method_required'},400);

    const customerId=body?.customer_id==null?null:clean(body.customer_id,80);
    if(customerId&&!uuidOk(customerId))return json(req,{ok:false,error:'invalid_customer_id'},400);
    const name=clean(body?.name,120),phone=clean(body?.phone,40);
    const address=body?.delivery_address&&typeof body.delivery_address==='object'?body.delivery_address:{};
    const locator=body?.delivery_locator&&typeof body.delivery_locator==='object'?body.delivery_locator:null;
    const finalAddress=locator?{...address,locator}:address;
    let addressMode=clean(body?.address_mode||'add',20).toLowerCase();
    let addressId=body?.address_id==null?null:clean(body.address_id,80);
    if(addressId&&!uuidOk(addressId))return json(req,{ok:false,error:'invalid_address_id'},400);
    if(!['add','replace'].includes(addressMode))addressMode='add';

    const {data:customer,error:customerError}=await sb.rpc('room_commit_web_customer_v1',{
      p_public_token:token,p_customer_id:customerId||null,p_name:name,p_phone:phone
    });
    if(customerError)return json(req,{ok:false,error:'customer_commit_failed',detail:customerError.message},400);

    if(!addressId&&customer?.id){
      const {data:addresses}=await sb.from('customer_addresses').select('id,street,number,city').eq('customer_id',customer.id).eq('is_active',true);
      const norm=(v:unknown)=>clean(v,180).toLocaleLowerCase('pt-BR');
      const match=(addresses||[]).find((item:any)=>norm(item.street)===norm(address?.street)&&norm(item.number)===norm(address?.number)&&norm(item.city)===norm(address?.city));
      if(match?.id){addressId=match.id;addressMode='replace'}
    }

    const {data:savedAddress,error:addressError}=await sb.rpc('room_save_address_v2',{
      p_public_token:token,p_address:address,p_mode:addressId?'replace':addressMode,p_address_id:addressId||null
    });
    if(addressError)return json(req,{ok:false,error:'address_failed',detail:addressError.message},400);

    const {data:order,error:confirmError}=await sb.rpc('room_confirm_web_order_v2',{
      p_public_token:token,p_delivery_address:finalAddress,p_payment_method:method
    });
    if(confirmError)return json(req,{ok:false,error:'confirm_failed',detail:confirmError.message},400);
    if(!order?.order_id)return json(req,{ok:false,error:'order_persistence_failed'},500);

    return json(req,{ok:true,order,customer,address:savedAddress,payment_method:order.payment_method||method});
  }

  if(action==='confirm_order'){
    const method=clean(body?.payment_method||session.metadata?.payment_method,30);
    if(!PAYMENT.has(method))return json(req,{ok:false,error:'payment_method_required'},400);
    const address=body?.delivery_address&&typeof body.delivery_address==='object'?body.delivery_address:{};
    const locator=body?.delivery_locator&&typeof body.delivery_locator==='object'?body.delivery_locator:null;
    const finalAddress=locator?{...address,locator}:address;
    const {data,error:confirmError}=await sb.rpc('room_confirm_web_order_v2',{p_public_token:token,p_delivery_address:finalAddress,p_payment_method:method});
    if(confirmError)return json(req,{ok:false,error:'confirm_failed',detail:confirmError.message},400);
    if(!data?.order_id)return json(req,{ok:false,error:'order_persistence_failed'},500);
    return json(req,{ok:true,order:data,payment_method:data.payment_method||method});
  }

  return json(req,{ok:false,error:'unknown_action'},400);
});
