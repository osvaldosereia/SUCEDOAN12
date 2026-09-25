import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(SUPABASE_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const MINIMUM_ORDER_CENTS=7500;
const TZ="America/Cuiaba";
const CATEGORIES=[
  {key:"mercearia",label:"Mercearia"},
  {key:"limpeza_lavanderia",label:"Limpeza e lavanderia"},
  {key:"higiene_beleza",label:"Higiene e beleza"},
  {key:"casa_pet",label:"Casa e pet"}
];
const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-vitrine-history-key","Access-Control-Allow-Methods":"GET, POST, OPTIONS"}};
const json=(req:Request,v:any,s=200,h:Record<string,string>={})=>new Response(JSON.stringify(v),{status:s,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8",...h}});
const txt=(v:any,n=180)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const uid=(v:any)=>{const s=txt(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const clamp=(v:any,min:number,max:number)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min};
const cents=(v:any)=>Math.round(Number(v||0)*100);
const phone=(v:any)=>{let d=String(v??"").replace(/\D+/g,"");if(d.startsWith("00"))d=d.slice(2);if(d.startsWith("55")&&(d.length===12||d.length===13))return "+"+d;if(d.length===10||d.length===11)return "+55"+d;return ""};
const safeQ=(v:any)=>txt(v,100).replace(/[,%()]/g," ").trim();
async function sha(v:string){const x=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(x)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function ip(req:Request){for(const v of [req.headers.get("cf-connecting-ip"),String(req.headers.get("x-forwarded-for")||"").split(",")[0],req.headers.get("x-real-ip")]){const s=String(v||"").trim();if(s)return s.slice(0,120)}return ""}
function code4(){const a=new Uint16Array(1);do{crypto.getRandomValues(a)}while(a[0]>=60000);return String(a[0]%10000).padStart(4,"0")}

type D={year:number,month:number,day:number};
function local(now=new Date()){const ps=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);const g=(t:string)=>Number(ps.find(p=>p.type===t)?.value||0);return {year:g("year"),month:g("month"),day:g("day"),hour:g("hour"),minute:g("minute")}}
function add(d:D,n:number):D{const x=new Date(Date.UTC(d.year,d.month-1,d.day+n,12));return {year:x.getUTCFullYear(),month:x.getUTCMonth()+1,day:x.getUTCDate()}}
function iso(d:D){return String(d.year).padStart(4,"0")+"-"+String(d.month).padStart(2,"0")+"-"+String(d.day).padStart(2,"0")}
function easter(y:number):D{const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),z=h+l-7*m+114;return {year:y,month:Math.floor(z/31),day:z%31+1}}
function closed(d:D){const k=String(d.month).padStart(2,"0")+"-"+String(d.day).padStart(2,"0");const fixed=new Set(["01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25"]);if(fixed.has(k))return true;const sun=new Date(Date.UTC(d.year,d.month-1,d.day,12)).getUTCDay()===0;return sun||iso(add(easter(d.year),-2))===iso(d)}
function nextOpen(d:D){let x=d;for(let i=0;i<14;i++){if(!closed(x))return x;x=add(x,1)}return x}
function delivery(){const p=local(),t={year:p.year,month:p.month,day:p.day};let target=t,reason="same_day";if(closed(t)){target=nextOpen(add(t,1));reason="closed_day"}else if(p.hour>=12){target=nextOpen(add(t,1));reason="after_cutoff"}const label=new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(Date.UTC(target.year,target.month-1,target.day,12)));return {date:iso(target),label,reason,time_zone:TZ,cutoff_hour:12}}

async function reservedMap(ids:string[]){
  const out=new Map<string,number>();if(!ids.length)return out;
  const {data,error}=await db.from("vitrine_stock_reservations").select("product_id,quantity").in("product_id",ids).eq("status","reserved").gt("expires_at",new Date().toISOString());
  if(error)throw error;for(const r of data||[])out.set(r.product_id,(out.get(r.product_id)||0)+Number(r.quantity||0));return out;
}
function pub(p:any,available?:number){
  const offer=p?.is_offer===true&&p?.offer_price!=null&&Number(p.offer_price)>=0;
  return {id:p.id,name:p.name,image_url:p.image_url||"",price_cents:cents(offer?p.offer_price:p.price),regular_price_cents:offer?cents(p.price):null,packaging:p.packaging||"",subcategory:p.customer_subcategory||p.subcategory||"",stock_quantity:Math.max(0,available??Number(p.stock||0)),brand:p.brand||"",category:p.category||"",subsubcategory:p.customer_subsubcategory||p.subsubcategory||"",unit:p.unit||""};
}
async function home(){
  const {data,error}=await db.from("basket_templates").select("id,name,base_price,image_url,sort_order").eq("is_active",true).order("sort_order").order("base_price").order("name");
  if(error)throw error;return {ok:true,version:"canonical-vitrine-v1",baskets:(data||[]).map((b:any)=>({id:b.id,name:b.name,display_price_cents:cents(b.base_price),image_url:b.image_url||""})),categories:CATEGORIES};
}
async function offerList(){
  const {data,error}=await db.from("products").select("id,name,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit").eq("is_active",true).eq("is_offer",true).not("offer_price","is",null).gt("stock",0).order("name").limit(80);
  if(error)throw error;const rows=data||[],res=await reservedMap(rows.map((p:any)=>p.id));
  return {ok:true,offers:rows.map((p:any)=>({...pub(p,Number(p.stock||0)-(res.get(p.id)||0)),product_id:p.id})).filter((p:any)=>p.stock_quantity>0)};
}
async function subcats(url:URL){
  const c=txt(url.searchParams.get("category"),48);if(!c)return {ok:true,subcategories:[]};
  const {data,error}=await db.from("products").select("customer_subsubcategory,subsubcategory").eq("is_active",true).gt("stock",0).eq("sales_category",c).limit(5000);
  if(error)throw error;const m=new Map<string,number>();for(const p of data||[]){const n=txt(p.customer_subsubcategory||p.subsubcategory,100);if(n)m.set(n,(m.get(n)||0)+1)}
  return {ok:true,subcategories:[...m.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"pt-BR"))};
}
async function productList(url:URL){
  const c=txt(url.searchParams.get("category"),48),sc=txt(url.searchParams.get("subcategory"),100),q=safeQ(url.searchParams.get("q")),limit=Math.floor(clamp(url.searchParams.get("limit")||24,1,36)),offset=Math.floor(clamp(url.searchParams.get("offset")||0,0,5000));
  let x=db.from("products").select("id,name,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit").eq("is_active",true).gt("stock",0);
  if(c)x=x.eq("sales_category",c);if(sc)x=x.eq("customer_subsubcategory",sc);
  if(q){for(const t of q.split(/\s+/).filter(Boolean).slice(0,4))x=x.or("name.ilike.%"+t+"%,gtin.ilike.%"+t+"%,sku.ilike.%"+t+"%,brand.ilike.%"+t+"%")}
  const {data,error}=await x.order("sort_order").order("name").range(offset,offset+limit-1);if(error)throw error;
  const rows=data||[],res=await reservedMap(rows.map((p:any)=>p.id)),publicRows=rows.map((p:any)=>pub(p,Number(p.stock||0)-(res.get(p.id)||0))).filter((p:any)=>p.stock_quantity>0);
  return {ok:true,products:publicRows,next_offset:rows.length===limit?offset+limit:null};
}
async function oneProduct(id:string){
  const {data:p,error}=await db.from("products").select("id,sku,gtin,name,description_short,description_long,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit").eq("id",id).eq("is_active",true).maybeSingle();
  if(error)throw error;if(!p)return null;const r=await reservedMap([id]),o=pub(p,Number(p.stock||0)-(r.get(id)||0));
  const characteristics=[["Marca",p.brand],["Embalagem",p.packaging],["Unidade",p.unit],["Categoria",p.category],["Subcategoria",p.subcategory],["Tipo",p.customer_subsubcategory||p.subsubcategory]].filter((x:any)=>txt(x[1],200)).map((x:any)=>({label:x[0],value:String(x[1])}));
  return {...o,sku:p.sku||"",gtin:p.gtin||"",description:p.description_long||p.description_short||"",characteristics};
}
async function basket(id:string){
  const {data:b,error}=await db.from("basket_templates").select("id,name,base_price,image_url").eq("id",id).eq("is_active",true).maybeSingle();if(error)throw error;if(!b)return null;
  const {data:items,error:ie}=await db.from("basket_template_items").select("product_id,quantity,removable,quantity_editable,min_quantity,max_quantity,sort_order,product:products(id,name,image_url,stock,packaging,is_active)").eq("basket_id",id).order("sort_order");if(ie)throw ie;
  const ids=(items||[]).map((i:any)=>i.product_id),res=await reservedMap(ids);
  return {basket:{id:b.id,name:b.name,display_price_cents:cents(b.base_price),image_url:b.image_url||""},items:(items||[]).map((i:any)=>({product_id:i.product_id,name:i.product?.name||"Produto",image_url:i.product?.image_url||"",packaging:i.product?.packaging||"",stock_quantity:i.product?.is_active===false?0:Math.max(0,Number(i.product?.stock||0)-(res.get(i.product_id)||0)),quantity:Number(i.quantity||0),removable:i.removable===true,quantity_editable:i.quantity_editable===true,min_quantity:Number(i.min_quantity||0),max_quantity:i.max_quantity==null?null:Number(i.max_quantity)}))};
}
async function quote(payload:any){
  const id=uid(payload?.basket_id);if(!id)return {error:"invalid_basket",status:400};
  const {data:b,error:be}=await db.from("basket_templates").select("id,base_price").eq("id",id).eq("is_active",true).maybeSingle();if(be)throw be;if(!b)return {error:"basket_not_found",status:404};
  const {data:rules,error}=await db.from("basket_template_items").select("product_id,quantity,removable,quantity_editable,min_quantity,max_quantity,remove_unit_delta,add_unit_delta,product:products(id,price,stock,is_active)").eq("basket_id",id);if(error)throw error;
  const ids=(rules||[]).map((r:any)=>r.product_id),res=await reservedMap(ids),req=new Map<string,number>((Array.isArray(payload?.items)?payload.items:[]).map((x:any)=>[uid(x?.product_id),Number(x?.quantity||0)]).filter((x:any)=>x[0]));
  let total=Number(b.base_price||0);
  for(const r of rules||[]){const base=Number(r.quantity||0),qty=req.has(r.product_id)?Number(req.get(r.product_id)):base,stock=Math.max(0,(r.product?.is_active===false?0:Number(r.product?.stock||0))-(res.get(r.product_id)||0)),min=Math.max(0,Number(r.min_quantity??(r.removable?0:base))),max=Math.min(stock,Number(r.max_quantity??Math.max(base,Math.floor(stock))));if(!Number.isFinite(qty)||qty<0||Math.trunc(qty)!==qty)return {error:"invalid_basket_quantity",status:400};if(qty>stock)return {error:"insufficient_stock",status:409,product_id:r.product_id,available:stock,requested:qty};if(qty===0&&!r.removable)return {error:"item_not_removable",status:409};if(qty<min||qty>max)return {error:"basket_quantity_out_of_range",status:409};const price=Number(r.product?.price||0);if(qty<base)total+=Math.abs(qty-base)*Number(r.remove_unit_delta??-price);else if(qty>base)total+=(qty-base)*Number(r.add_unit_delta??price)}
  return {ok:true,total_cents:Math.max(0,cents(total))};
}
async function bridgeOk(req:Request){const s=txt(req.headers.get("x-vitrine-history-key"),500);if(!s)return false;const {data,error}=await db.from("internal_integration_secrets").select("secret_value").eq("integration_key","vitrine_history_bridge").maybeSingle();return !error&&Boolean(data?.secret_value)&&s===String(data.secret_value)}
async function issueLink(p:any){
  const ph=phone(p?.phone);if(!ph)return {error:"invalid_phone",status:400};const now=new Date().toISOString(),expires=new Date(Date.now()+30*60*1000).toISOString(),cut=new Date(Date.now()-24*60*60*1000).toISOString();
  await db.from("storefront_identity_tokens").delete().lt("created_at",cut);await db.from("storefront_identity_resolve_attempts").delete().lt("attempted_at",cut);
  const q=await db.from("storefront_identity_tokens").select("short_code,expires_at").eq("phone_e164",ph).is("redeemed_at",null).gt("expires_at",now).not("short_code","is",null).order("created_at",{ascending:false}).limit(1).maybeSingle();if(q.error)throw q.error;if(q.data?.short_code)return {phone_e164:ph,shopping_url:"https://donaantonia.com.br/catalogo_"+q.data.short_code,expires_at:q.data.expires_at,reused:true};
  for(let i=0;i<40;i++){const c=code4(),h=await sha(c),ins=await db.from("storefront_identity_tokens").insert({token_hash:h,short_code:c,phone_e164:ph,contact_name:txt(p?.name,180)||null,source:"papoai_short_code_v3",expires_at:expires});if(!ins.error)return {phone_e164:ph,shopping_url:"https://donaantonia.com.br/catalogo_"+c,expires_at:expires,reused:false};if(String(ins.error.code||"")!=="23505")throw ins.error}return {error:"short_code_pool_busy",status:503};
}
async function resolveCode(req:Request,v:any){
  const c=String(v??"").trim();if(!/^\d{4}$/.test(c))return {error:"invalid_code",status:400};const raw=ip(req),ih=raw?await sha(raw):"";if(ih){const since=new Date(Date.now()-600000).toISOString(),n=await db.from("storefront_identity_resolve_attempts").select("id",{count:"exact",head:true}).eq("ip_hash",ih).gte("attempted_at",since);if(n.error)throw n.error;if(Number(n.count||0)>=12)return {error:"too_many_attempts",status:429}}
  const h=await sha(c),now=new Date().toISOString(),q=await db.from("storefront_identity_tokens").update({redeemed_at:now,last_used_at:now,use_count:1}).eq("token_hash",h).eq("short_code",c).is("redeemed_at",null).gt("expires_at",now).select("phone_e164,expires_at").maybeSingle();if(q.error)throw q.error;if(ih)await db.from("storefront_identity_resolve_attempts").insert({ip_hash:ih,success:Boolean(q.data)});if(!q.data)return {error:"code_expired_or_invalid",status:404};return {phone_e164:q.data.phone_e164,expires_at:q.data.expires_at};
}
async function resolveToken(v:any){const t=String(v??"").trim();if(!/^[A-Za-z0-9_-]{24,160}$/.test(t))return {error:"invalid_token",status:400};const h=await sha(t),now=new Date().toISOString(),q=await db.from("storefront_identity_tokens").update({redeemed_at:now,last_used_at:now,use_count:1}).eq("token_hash",h).is("redeemed_at",null).gt("expires_at",now).select("phone_e164,expires_at").maybeSingle();if(q.error)throw q.error;if(!q.data)return {error:"token_expired_or_invalid",status:404};return {phone_e164:q.data.phone_e164,expires_at:q.data.expires_at}}
async function reconcile(p:any){
  const sid=uid(p?.source_order_id),cid=uid(p?.crm_customer_id);if(!sid||!cid)return {error:"invalid_reconciliation_payload",status:400};
  let q=await db.from("orders").select("id,delivery_address,customer_snapshot,phone_e164,checkout_snapshot").eq("id",sid).maybeSingle();
  if(q.error)throw q.error;if(!q.data){q=await db.from("orders").select("id,delivery_address,customer_snapshot,phone_e164,checkout_snapshot").contains("checkout_snapshot",{source_order_id:sid}).limit(1).maybeSingle();if(q.error)throw q.error}
  const o=q.data;if(!o)return {error:"order_not_found",status:404};const c=p?.customer&&typeof p.customer==="object"?p.customer:{},a=p?.address&&typeof p.address==="object"?p.address:{},deliveryAddress={...(o.delivery_address||{}),...a,customer_name:txt(c.name,180)||o.delivery_address?.customer_name||null,source_customer_id:cid,phone:o.phone_e164||phone(c.phone)||null,cpf:String(c.cpf||"").replace(/\D+/g,"").slice(0,14)||null},customer={...(o.customer_snapshot||{}),customer_id:cid,name:txt(c.name,180)||o.customer_snapshot?.name||null,phone_e164:o.phone_e164||phone(c.phone)||null,status:"registered"};
  const up=await db.from("orders").update({customer_id:cid,delivery_address:deliveryAddress,customer_snapshot:customer,updated_at:new Date().toISOString()}).eq("id",o.id);if(up.error)throw up.error;return {order_id:o.id,crm_customer_id:cid,customer_name:customer.name||null};
}
async function submit(req:Request,p:any){
  const pay=txt(p?.payment_method,80),ph=phone(p?.whatsapp_phone),items=Array.isArray(p?.items)?p.items.slice(0,80):[];if(!ph)return {error:"invalid_phone",status:400};if(!items.length)return {error:"empty_cart",status:400};
  const ik=await sha(ip(req)||"unknown"),pk=await sha(ph),[a,b]=await Promise.all([db.rpc("consume_public_rate_limit",{p_rate_key:"vitrine-direct:ip:"+ik,p_bucket:"create_order",p_limit:12,p_window_seconds:600}),db.rpc("consume_public_rate_limit",{p_rate_key:"vitrine-direct:phone:"+pk,p_bucket:"create_order",p_limit:5,p_window_seconds:600})]);if(a.error||b.error)return {error:"rate_limit_unavailable",status:503};if(a.data!==true||b.data!==true)return {error:"rate_limited",status:429};
  const del=delivery(),created=await db.rpc("create_vitrine_cart_order_v1",{p_phone:ph,p_payment_method:pay,p_items:items,p_customer_snapshot:p?.customer_snapshot||{},p_delivery:del});
  if(created.error){const e=txt(created.error.message,160).split("\n")[0];return {error:e||"order_failed",status:["insufficient_stock","product_unavailable","basket_unavailable","basket_product_unavailable"].includes(e)?409:400,minimum_order_cents:MINIMUM_ORDER_CENTS}}
  const orderId=created.data?.order_id,res=await db.rpc("reserve_vitrine_order_stock_v1",{p_order_id:orderId});
  if(res.error||res.data?.ok!==true){if(orderId)await db.from("orders").delete().eq("id",orderId);return {error:txt(res.data?.error||res.error?.message||"insufficient_stock",120),status:409,minimum_order_cents:MINIMUM_ORDER_CENTS}}
  return {...created.data,phone_attached:true,customer_status:created.data?.customer_id?"registered":"new",minimum_order_cents:MINIMUM_ORDER_CENTS,delivery:del,history_synced:true};
}
async function lookupCustomer(v:any){const ph=phone(v);if(!ph)return {ok:true,found:false};let q=await db.from("customers").select("id,name").eq("primary_whatsapp_e164",ph).limit(1).maybeSingle();if(q.error)throw q.error;if(!q.data){const i=await db.from("customer_phones").select("customer_id").eq("phone_e164",ph).order("is_primary",{ascending:false}).limit(1).maybeSingle();if(i.error)throw i.error;if(i.data?.customer_id)q=await db.from("customers").select("id,name").eq("id",i.data.customer_id).maybeSingle()}return {ok:true,found:Boolean(q.data),first_name:q.data?.name?txt(q.data.name,120).split(/\s+/)[0]:null}}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  try{
    const u=new URL(req.url),action=txt(u.searchParams.get("action")||(req.method==="POST"?"basket_quote":"home"),60);
    if(action==="health")return json(req,{ok:true,service:"storefront-v2",mode:"canonical-vitrine",version:8},200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="home")return json(req,await home(),200,{"Cache-Control":"public, max-age=120, stale-while-revalidate=600"});
    if(req.method==="GET"&&action==="offers")return json(req,await offerList(),200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="subcategories")return json(req,await subcats(u),200,{"Cache-Control":"public, max-age=120, stale-while-revalidate=600"});
    if(req.method==="GET"&&action==="products")return json(req,await productList(u),200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="product"){const id=uid(u.searchParams.get("product_id"));if(!id)return json(req,{ok:false,error:"invalid_product"},400);const p=await oneProduct(id);return p?json(req,{ok:true,product:p},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"product_not_found"},404)}
    if(req.method==="GET"&&action==="basket"){const id=uid(u.searchParams.get("basket_id"));if(!id)return json(req,{ok:false,error:"invalid_basket"},400);const b=await basket(id);return b?json(req,{ok:true,...b},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"basket_not_found"},404)}
    if(req.method==="GET"&&action==="resolve_identity_code"){const r=await resolveCode(req,u.searchParams.get("code"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="resolve_identity_token"){const r=await resolveToken(u.searchParams.get("token"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}

    const body=req.method==="POST"?await req.json(req,).catch(()=>({})):{};
    if(req.method==="POST"&&action==="basket_quote"){const r=await quote(body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="submit_order"){const r=await submit(req,body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="issue_identity_link"){if(!(await bridgeOk(req)))return json(req,{ok:false,error:"unauthorized"},401);const r=await issueLink(body);return r.error?json(req,{ok:false,...r},r.status||400):json(req,{ok:true,...r})}
    if(req.method==="POST"&&action==="reconcile_customer"){if(!(await bridgeOk(req)))return json(req,{ok:false,error:"unauthorized"},401);const r=await reconcile(body);return r.error?json(req,{ok:false,...r},r.status||400):json(req,{ok:true,...r})}

    // Compatibility with the previous canonical storefront-v2 contract.
    if(req.method==="POST"&&action==="list_baskets"){const h=await home();return json(req,{ok:true,baskets:h.baskets.map((b:any)=>({id:b.id,name:b.name,image_url:b.image_url,base_price:Number(b.display_price_cents||0)/100,ready:true}))})}
    if(req.method==="POST"&&action==="get_basket"){const b=await basket(uid(body?.id));return b?json(req,{ok:true,basket:{id:b.basket.id,name:b.basket.name,image_url:b.basket.image_url,base_price:Number(b.basket.display_price_cents||0)/100,ready:true},items:b.items.map((i:any)=>({...i,product:{id:i.product_id,name:i.name,image_url:i.image_url,stock:i.stock_quantity,packaging:i.packaging,is_active:i.stock_quantity>0}}))}):json(req,{ok:false,error:"basket_not_found"},404)}
    if(req.method==="POST"&&action==="list_sections"){return json(req,{ok:true,sections:CATEGORIES.map(c=>({name:c.key,label:c.label}))})}
    if(req.method==="POST"&&action==="list_products"){const fake=new URL(req.url);if(body?.section)fake.searchParams.set("category",String(body.section));if(body?.q)fake.searchParams.set("q",String(body.q));fake.searchParams.set("limit",String(body?.limit||20));fake.searchParams.set("offset",String(Math.max(0,(Number(body?.page||1)-1)*Number(body?.limit||20))));const p=await productList(fake);return json(req,{ok:true,products:p.products.map((x:any)=>({id:x.id,name:x.name,price:Number(x.price_cents||0)/100,stock:x.stock_quantity,image_url:x.image_url,brand:x.brand,category:x.category,packaging:x.packaging,is_offer:x.regular_price_cents!=null})),page:Number(body?.page||1),limit:Number(body?.limit||20),total:null,has_more:p.next_offset!=null})}
    if(req.method==="POST"&&action==="lookup_customer_by_phone"){const ph=phone(body?.phone),rk=await sha(ph||ip(req)||"unknown"),gate=await db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-v2:lookup:"+rk,p_bucket:"lookup_customer",p_limit:20,p_window_seconds:300});if(gate.error)return json(req,{ok:false,error:"rate_limit_unavailable"},503);if(gate.data!==true)return json(req,{ok:false,error:"rate_limited"},429);return json(req,await lookupCustomer(ph))}
    if(req.method==="POST"&&action==="create_order"){let ph=phone(body?.phone);if(!ph)return json(req,{ok:false,error:"invalid_phone"},400);const rk=await sha(ph+"|"+(ip(req)||"unknown")),gate=await db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-v2:create:"+rk,p_bucket:"create_order",p_limit:5,p_window_seconds:600});if(gate.error)return json(req,{ok:false,error:"rate_limit_unavailable"},503);if(gate.data!==true)return json(req,{ok:false,error:"rate_limited"},429);const r=await db.rpc("create_storefront_order_v2",{p_phone:ph,p_items:Array.isArray(body?.items)?body.items:[],p_basket:body?.basket&&typeof body.basket==="object"?body.basket:null});if(r.error)return json(req,{ok:false,error:txt(r.error.message,120).split("\n")[0]||"order_failed"},400);return json(req,{ok:true,order:{id:r.data?.order_id,number:r.data?.order_number,total:Number(r.data?.total||0),message:r.data?.message||"",customer_found:Boolean(r.data?.customer_id),status:"storefront_received"}})}

    return json(req,{ok:false,error:"unknown_action"},400);
  }catch(e){console.error("storefront-v2 canonical-vitrine",e);return json(req,{ok:false,error:"service_unavailable",detail:txt((e as any)?.message,180)},500,{"Cache-Control":"no-store"})}
});