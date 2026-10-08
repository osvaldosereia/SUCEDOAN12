import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const allowedOrigins=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  const headers:Record<string,string>={
    "Vary":"Origin",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":"content-type,x-addon-token"
  };
  if(allowedOrigins.has(origin))headers["Access-Control-Allow-Origin"]=origin;
  return headers;
}
function json(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      ...cors(req),
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"private, no-store, max-age=0",
      "Pragma":"no-cache",
      "X-Robots-Tag":"noindex, nofollow, noarchive",
      "X-Content-Type-Options":"nosniff"
    }
  });
}
function rawToken(req:Request){
  return String(req.headers.get("x-addon-token")||"").trim();
}
function validCapability(value:string){
  return /^[A-Za-z0-9_-]{32,96}$/.test(value);
}
async function sha256(value:string){
  const data=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",data);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
function clientIp(req:Request){
  return String(req.headers.get("x-forwarded-for")||req.headers.get("cf-connecting-ip")||"unknown").split(",")[0].trim().slice(0,96);
}
async function rateLimit(req:Request,tokenHash:string,action:string){
  const ipHash=await sha256(clientIp(req));
  const [ipGate,tokenGate]=await Promise.all([
    db.rpc("consume_public_rate_limit",{
      p_rate_key:"order-addon:ip:"+ipHash,
      p_bucket:"order_addon_public",
      p_limit:120,
      p_window_seconds:300
    }),
    db.rpc("consume_public_rate_limit",{
      p_rate_key:"order-addon:token:"+tokenHash,
      p_bucket:action==="add_items"?"order_addon_write":"order_addon_read",
      p_limit:action==="add_items"?20:100,
      p_window_seconds:300
    })
  ]);
  if(ipGate.error||tokenGate.error)return {ok:false,status:503,error:"rate_limit_unavailable"};
  if(ipGate.data!==true||tokenGate.data!==true)return {ok:false,status:429,error:"rate_limited"};
  return {ok:true,status:200,error:""};
}
function safeSession(data:any){
  return {
    ok:data?.ok===true,
    eligible:data?.eligible===true,
    reason:String(data?.reason||data?.error||"unavailable"),
    order_number:data?.order_number||null,
    expires_at:data?.expires_at||null,
    operation_count:Number(data?.operation_count||0),
    max_operations:Number(data?.max_operations||0),
    current_total:Number(data?.current_total||0)
  };
}
async function sessionForHash(tokenHash:string){
  const result=await db.rpc("ops3_get_order_addon_session_v1",{p_token_hash:tokenHash});
  if(result.error)throw result.error;
  return result.data||{};
}
function cents(value:unknown){
  const n=Number(value||0);
  return Number.isFinite(n)?Math.max(0,Math.round(n*100)):0;
}
function safeSearch(value:string){
  return value.normalize("NFKC").replace(/[^\p{L}\p{N}\s.-]+/gu," ").replace(/\s+/g," ").trim().slice(0,80);
}
async function productsForSession(tokenHash:string,url:URL){
  const session=await sessionForHash(tokenHash);
  if(session?.eligible!==true)return {session:safeSession(session),products:[],next_offset:null};

  const search=safeSearch(url.searchParams.get("q")||"");
  const offset=Math.max(0,Math.min(5000,Math.trunc(Number(url.searchParams.get("offset")||0))));
  const limit=Math.max(6,Math.min(24,Math.trunc(Number(url.searchParams.get("limit")||12))));
  const fetchLimit=Math.min(48,limit*2);

  let query=db.from("products")
    .select("id,name,image_url,price,offer_price,is_offer,packaging,brand")
    .eq("is_active",true)
    .order("name")
    .range(offset,offset+fetchLimit-1);
  if(search)query=query.ilike("name",`%${search}%`);

  const rows=await query;
  if(rows.error)throw rows.error;
  const raw=rows.data||[];
  const ids=raw.map((item:any)=>String(item.id));
  const stock=ids.length
    ?await db.from("ops2_loose_sellable_stock_v1")
      .select("product_id,loose_sellable_stock")
      .in("product_id",ids)
    :{data:[],error:null};
  if(stock.error)throw stock.error;

  const stockMap=new Map<string,number>();
  for(const row of stock.data||[])stockMap.set(String((row as any).product_id),Math.max(0,Number((row as any).loose_sellable_stock||0)));

  const products=raw.map((item:any)=>{
    const available=stockMap.get(String(item.id))||0;
    const offer=item.is_offer===true&&item.offer_price!=null&&Number(item.offer_price)>=0;
    return {
      product_id:item.id,
      name:String(item.name||"Produto"),
      image_url:String(item.image_url||""),
      packaging:String(item.packaging||""),
      brand:String(item.brand||""),
      price_cents:cents(offer?item.offer_price:item.price),
      regular_price_cents:offer?cents(item.price):null,
      is_offer:offer,
      available:available>0
    };
  }).filter((item:any)=>item.available&&item.price_cents>=0).slice(0,limit);

  return {
    session:safeSession(session),
    products,
    next_offset:raw.length===fetchLimit?offset+fetchLimit:null
  };
}
function safeAddedItems(items:any){
  if(!Array.isArray(items))return [];
  return items.slice(0,40).map((item:any)=>({
    product_id:item?.product_id||null,
    name:String(item?.name||"Produto"),
    quantity_added:Number(item?.quantity_added||0),
    unit_price:Number(item?.unit_price||0),
    line_total_added:Number(item?.line_total_added||0)
  }));
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS"){
    if(origin&&!allowedOrigins.has(origin))return new Response(null,{status:403});
    return new Response(null,{status:204,headers:cors(req)});
  }
  if(origin&&!allowedOrigins.has(origin))return json(req,{ok:false,error:"origin_not_allowed"},403);
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  if(!["GET","POST"].includes(req.method))return json(req,{ok:false,error:"method_not_allowed"},405);

  try{
    const url=new URL(req.url);
    let body:any={};
    if(req.method==="POST")body=await req.json().catch(()=>({}));
    const action=String(url.searchParams.get("action")||body?.action||"session").trim();
    if(!["session","products","add_items"].includes(action))return json(req,{ok:false,error:"invalid_action"},400);

    const token=rawToken(req);
    if(!validCapability(token))return json(req,{ok:false,error:"invalid_token"},404);
    const tokenHash=await sha256(token);

    const gate=await rateLimit(req,tokenHash,action);
    if(!gate.ok)return json(req,{ok:false,error:gate.error},gate.status);

    if(action==="session"){
      if(req.method!=="GET")return json(req,{ok:false,error:"method_not_allowed"},405);
      const session=await sessionForHash(tokenHash);
      return json(req,safeSession(session),session?.ok===false?404:200);
    }

    if(action==="products"){
      if(req.method!=="GET")return json(req,{ok:false,error:"method_not_allowed"},405);
      const result=await productsForSession(tokenHash,url);
      return json(req,{ok:true,...result},200);
    }

    if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
    const requestKey=String(body?.request_key||"").trim();
    const items=Array.isArray(body?.items)?body.items:[];
    if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(requestKey))return json(req,{ok:false,error:"invalid_request_key"},400);
    if(!items.length||items.length>40)return json(req,{ok:false,error:"items_required"},400);
    for(const item of items){
      if(!item||typeof item!=="object"||Array.isArray(item))return json(req,{ok:false,error:"invalid_item"},400);
      const keys=Object.keys(item);
      if(keys.some(key=>!["product_id","quantity"].includes(key)))return json(req,{ok:false,error:"invalid_item_fields"},400);
    }

    const result=await db.rpc("ops3_add_items_to_existing_order_v1",{
      p_token_hash:tokenHash,
      p_request_key:requestKey,
      p_items:items.map((item:any)=>({product_id:item.product_id,quantity:item.quantity}))
    });
    if(result.error){
      const message=String(result.error.message||"").slice(0,180);
      if(message.includes("stock_reservation_failed"))return json(req,{ok:false,error:"stock_changed"},409);
      return json(req,{ok:false,error:"add_items_unavailable"},503);
    }
    const data=result.data||{};
    if(data.ok!==true){
      const error=String(data.error||"add_items_failed");
      const status=["session_not_found","invalid_token"].includes(error)?404:
        ["session_closed","session_expired","order_status_closed","order_already_confirmed","bling_sync_started","separation_started","stock_already_consumed","operation_limit_reached","feature_disabled"].includes(error)?409:
        error==="idempotency_key_reused"?409:400;
      return json(req,{ok:false,error},status);
    }

    return json(req,{
      ok:true,
      order_number:data.order_number||null,
      previous_total:Number(data.previous_total||0),
      added_total:Number(data.added_total||0),
      total:Number(data.total||0),
      added_items:safeAddedItems(data.added_items),
      operation_count:Number(data.operation_count||0),
      max_operations:Number(data.max_operations||0),
      expires_at:data.expires_at||null,
      reservation_status:data.reservation_status||null,
      idempotent_replay:data.idempotent_replay===true
    });
  }catch(error){
    console.error("order_addon_public_error",String((error as any)?.message||"unknown").slice(0,180));
    return json(req,{ok:false,error:"service_unavailable"},503);
  }
});
