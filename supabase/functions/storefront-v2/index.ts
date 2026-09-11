import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br"
]);
const cors=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const json=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
const normalizePhone=(v:unknown)=>{let d=digits(v);if(d.length===10||d.length===11)d=`55${d}`;if(!d.startsWith("55")||![12,13].includes(d.length))throw new Error("invalid_phone");return `+${d}`};
const integer=(v:unknown,min:number,max:number,def:number)=>{const n=Number.parseInt(String(v??def),10);return Math.min(max,Math.max(min,Number.isFinite(n)?n:def))};
const publicProduct=(p:any)=>({id:p.id,name:p.name,price:Number(p.price||0),stock:Math.max(0,Math.floor(Number(p.stock||0))),image_url:p.image_url||null,brand:p.brand||null,category:p.category||null,packaging:p.packaging||null,is_offer:p.is_offer===true,sort_order:Number(p.sort_order||0)});
const hashKey=async(value:string)=>{
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).slice(0,12).map(x=>x.toString(16).padStart(2,"0")).join("");
};
const basketReady=(items:any[])=>items.length>0&&items.every((i:any)=>i.product?.is_active===true&&i.product?.physically_verified===true&&Number(i.product?.stock||0)>=Number(i.quantity||0));

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({ok:false,error:"origin_not_allowed"},403,null);
  const respond=(body:unknown,status=200)=>json(body,status,origin);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return respond({ok:false,error:"method_not_allowed"},405);
  const length=Number(req.headers.get("content-length")||0);if(length>131072)return respond({ok:false,error:"payload_too_large"},413);
  const url=Deno.env.get("SUPABASE_URL"),serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceRole)return respond({ok:false,error:"server_config"},500);
  const sb=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  const forwarded=clean(req.headers.get("x-forwarded-for")?.split(",")[0]||req.headers.get("cf-connecting-ip")||"unknown",80);
  const ipKey=await hashKey(forwarded||"unknown");
  let body:any={};try{body=await req.json()}catch{return respond({ok:false,error:"invalid_json"},400)}
  const action=clean(body?.action,60).toLowerCase();

  if(action==="health")return respond({ok:true,version:3});

  if(action==="list_baskets"){
    const {data,error}=await sb.from("basket_templates").select("id,name,description,image_url,base_price,sort_order,is_featured,basket_template_items(id,quantity,product:products(id,is_active,physically_verified,stock))").eq("is_active",true).order("sort_order",{ascending:true}).order("name",{ascending:true});
    if(error)return respond({ok:false,error:"baskets_failed"},500);
    const baskets=(data||[]).map((b:any)=>{
      const items=Array.isArray(b.basket_template_items)?b.basket_template_items:[];
      return {id:b.id,name:b.name,description:b.description||null,image_url:b.image_url||null,base_price:Number(b.base_price||0),sort_order:Number(b.sort_order||0),is_featured:b.is_featured===true,item_count:items.length,ready:basketReady(items)};
    });
    return respond({ok:true,baskets});
  }

  if(action==="get_basket"){
    const id=clean(body?.id,80);if(!id)return respond({ok:false,error:"id_required"},400);
    const {data:b,error}=await sb.from("basket_templates").select("id,name,description,image_url,base_price,sort_order,is_featured,basket_template_items(id,product_id,quantity,removable,quantity_editable,min_quantity,max_quantity,sort_order,product:products(id,name,price,stock,image_url,brand,category,packaging,is_active,physically_verified))").eq("id",id).eq("is_active",true).maybeSingle();
    if(error||!b)return respond({ok:false,error:"basket_not_found"},404);
    const items=Array.isArray((b as any).basket_template_items)?(b as any).basket_template_items:[];
    const ready=basketReady(items);
    return respond({ok:true,basket:{id:(b as any).id,name:(b as any).name,description:(b as any).description||null,image_url:(b as any).image_url||null,base_price:Number((b as any).base_price||0),is_featured:(b as any).is_featured===true,ready},items:items.sort((a:any,c:any)=>Number(a.sort_order||0)-Number(c.sort_order||0)).map((i:any)=>({product_id:i.product_id,quantity:Number(i.quantity||0),removable:i.removable===true,quantity_editable:i.quantity_editable===true,min_quantity:Number(i.min_quantity||0),max_quantity:i.max_quantity==null?null:Number(i.max_quantity),product:publicProduct(i.product)}))});
  }

  if(action==="list_sections"){
    const {data,error}=await sb.from("products").select("category").eq("is_active",true).eq("physically_verified",true).gt("stock",0).not("category","is",null).limit(5000);
    if(error)return respond({ok:false,error:"sections_failed"},500);
    const counts=new Map<string,number>();for(const row of data||[]){const name=clean((row as any).category,120);if(name)counts.set(name,(counts.get(name)||0)+1)}
    const sections=[...counts.entries()].map(([name,count])=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
    return respond({ok:true,sections});
  }

  if(action==="list_products"){
    const section=clean(body?.section,120),q=clean(body?.q,100),page=integer(body?.page,1,100000,1),limit=integer(body?.limit,8,40,20),from=(page-1)*limit,to=from+limit-1;
    let query=sb.from("products").select("id,name,price,stock,image_url,brand,category,packaging,is_offer,sort_order",{count:"exact"}).eq("is_active",true).eq("physically_verified",true).gt("stock",0).range(from,to);
    if(section)query=query.eq("category",section);
    if(q){const safe=q.replace(/[,%()]/g," ").trim();if(safe)query=query.or(`name.ilike.%${safe}%,gtin.ilike.%${safe}%,sku.ilike.%${safe}%,brand.ilike.%${safe}%`)}
    query=query.order("sort_order",{ascending:true}).order("name",{ascending:true});
    const {data,error,count}=await query;if(error)return respond({ok:false,error:"products_failed"},500);
    return respond({ok:true,products:(data||[]).map(publicProduct),page,limit,total:count||0,has_more:page*limit<(count||0)});
  }

  if(action==="lookup_customer_by_phone"){
    let phone:string;try{phone=normalizePhone(body?.phone)}catch{return respond({ok:false,error:"invalid_phone"},400)}
    const {data:allowed,error:rateError}=await sb.rpc("consume_public_rate_limit",{p_rate_key:`storefront-v2:lookup:${ipKey}`,p_bucket:"phone_lookup",p_limit:30,p_window_seconds:60});
    if(rateError)return respond({ok:false,error:"rate_limit_unavailable"},503);
    if(!allowed)return respond({ok:false,error:"rate_limited"},429);
    let {data:customer}=await sb.from("customers").select("id,name").eq("primary_whatsapp_e164",phone).limit(1).maybeSingle();
    if(!customer){const {data:identity}=await sb.from("customer_phones").select("customer_id").eq("phone_e164",phone).order("is_primary",{ascending:false}).limit(1).maybeSingle();if(identity?.customer_id){const found=await sb.from("customers").select("id,name").eq("id",identity.customer_id).maybeSingle();customer=found.data}}
    const firstName=customer?.name?clean(customer.name,120).split(/\s+/)[0]:null;
    return respond({ok:true,found:Boolean(customer),first_name:firstName});
  }

  if(action==="create_order"){
    let phone:string;try{phone=normalizePhone(body?.phone)}catch{return respond({ok:false,error:"invalid_phone"},400)}
    const phoneKey=await hashKey(phone);
    const [{data:ipAllowed,error:ipRateError},{data:phoneAllowed,error:phoneRateError}]=await Promise.all([
      sb.rpc("consume_public_rate_limit",{p_rate_key:`storefront-v2:order-ip:${ipKey}`,p_bucket:"create_order",p_limit:12,p_window_seconds:600}),
      sb.rpc("consume_public_rate_limit",{p_rate_key:`storefront-v2:order-phone:${phoneKey}`,p_bucket:"create_order",p_limit:5,p_window_seconds:600})
    ]);
    if(ipRateError||phoneRateError)return respond({ok:false,error:"rate_limit_unavailable"},503);
    if(!ipAllowed||!phoneAllowed)return respond({ok:false,error:"rate_limited"},429);
    const items=Array.isArray(body?.items)?body.items:[];if(items.length>120)return respond({ok:false,error:"too_many_items"},400);
    const basket=body?.basket&&typeof body.basket==="object"&&!Array.isArray(body.basket)?body.basket:null;
    const {data,error}=await sb.rpc("create_storefront_order_v2",{p_phone:phone,p_items:items,p_basket:basket});
    if(error){const code=clean(error.message,120).split("\n")[0];return respond({ok:false,error:code||"order_failed"},400)}
    const result:any=data||{};
    return respond({ok:true,order:{id:result.order_id,number:result.order_number,total:Number(result.total||0),message:result.message||"",customer_found:Boolean(result.customer_id),status:"storefront_received"}});
  }

  return respond({ok:false,error:"unknown_action"},400);
});
