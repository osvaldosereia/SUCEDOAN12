import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(origin:string|null)=>({...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),"Access-Control-Allow-Headers":"content-type, apikey, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const json=(origin:string|null,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=300)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const integer=(v:unknown,min:number,max:number)=>Math.min(max,Math.max(min,Number.parseInt(String(v??min),10)||min));
const safeSearch=(v:unknown)=>clean(v,100).replace(/[,%()]/g," ").trim();
const validUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const supportedSources=['storefront_v2','shopping_room'];

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin');
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json(null,{ok:false,error:'origin_not_allowed'},403);
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(origin)});
  if(req.method!=='POST')return json(origin,{ok:false,error:'method_not_allowed'},405);

  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return json(origin,{ok:false,error:'server_config'},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{return json(origin,{ok:false,error:'invalid_json'},400)}
  const action=clean(body?.action||'list',30).toLowerCase();

  if(action==='health')return json(origin,{ok:true,version:2,sources:supportedSources});

  if(action==='list'){
    const page=integer(body?.page,1,100000),limit=integer(body?.limit,10,100),from=(page-1)*limit,to=from+limit-1;
    const status=clean(body?.status,40),source=clean(body?.source,40),q=safeSearch(body?.q);
    let query=sb.from('orders').select('id,order_number,source,customer_id,customer_snapshot,phone_e164,status,total,subtotal,fiscal_subtotal,other_expenses,discount,payment_method,basket_id,basket_name_snapshot,sync_status,created_at,confirmed_at',{count:'exact'}).range(from,to).order('created_at',{ascending:false});
    if(source&&supportedSources.includes(source))query=query.eq('source',source);else query=query.in('source',supportedSources);
    if(status)query=query.eq('status',status);
    if(q)query=query.or(`order_number.ilike.%${q}%,phone_e164.ilike.%${q}%`);
    const {data,error,count}=await query;
    if(error)return json(origin,{ok:false,error:'orders_failed',detail:error.message},400);
    const orders=(data||[]).map((order:any)=>({...order,customer_snapshot:{name:clean(order?.customer_snapshot?.name,160),phone:clean(order?.customer_snapshot?.phone||order?.phone_e164,40)}}));
    return json(origin,{ok:true,orders,total:count||0,page,limit});
  }

  if(action==='detail'){
    const id=clean(body?.id,80);if(!validUuid(id))return json(origin,{ok:false,error:'invalid_order_id'},400);
    const {data:order,error}=await sb.from('orders').select('id,order_number,source,customer_id,conversation_id,cart_id,catalog_session_id,phone_e164,status,total,subtotal,fiscal_subtotal,other_expenses,discount,currency,payment_method,basket_id,basket_name_snapshot,sync_status,sync_error,bling_order_id,delivery_address,customer_snapshot,checkout_snapshot,confirmed_at,created_at,updated_at').eq('id',id).in('source',supportedSources).maybeSingle();
    if(error||!order)return json(origin,{ok:false,error:'order_not_found'},404);
    const {data:items,error:itemsError}=await sb.from('order_items').select('id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata,created_at').eq('order_id',id).order('created_at',{ascending:true});
    if(itemsError)return json(origin,{ok:false,error:'order_items_failed',detail:itemsError.message},400);
    return json(origin,{ok:true,order,items:items||[]});
  }

  return json(origin,{ok:false,error:'unknown_action'},400);
});
