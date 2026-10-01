import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(SUPABASE_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const MINIMUM_ORDER_CENTS=7500;
const CUTOFF_HOUR=11;
const TZ="America/Cuiaba";
const CATEGORIES=[
  {key:"mercearia",label:"Mercearia"},
  {key:"limpeza_lavanderia",label:"Limpeza e lavanderia"},
  {key:"higiene_beleza",label:"Higiene e beleza"},
  {key:"casa_pet",label:"Casa e pet"}
];
const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"}};
const json=(req:Request,v:any,s=200,h:Record<string,string>={})=>new Response(JSON.stringify(v),{status:s,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8",...h}});
const txt=(v:any,n=180)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const uid=(v:any)=>{const s=txt(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const clamp=(v:any,min:number,max:number)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min};
const cents=(v:any)=>Math.round(Number(v||0)*100);
const phone=(v:any)=>{let d=String(v??"").replace(/\D+/g,"");if(d.startsWith("00"))d=d.slice(2);let local="";if(d.startsWith("55")&&(d.length===12||d.length===13))local=d.slice(2);else if(d.length===10||d.length===11)local=d;else return "";if(local.length===10&&/[6-9]/.test(local.charAt(2)))local=local.slice(0,2)+"9"+local.slice(2);return "+55"+local};
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
function deliveryLabel(d:D){return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(Date.UTC(d.year,d.month-1,d.day,12)))}
function deliveryOptions(now=new Date()){
  const p=local(now),today={year:p.year,month:p.month,day:p.day};let start=today,baseReason="same_day";
  if(closed(today)){start=nextOpen(add(today,1));baseReason="closed_day"}
  else if(p.hour>=CUTOFF_HOUR){start=nextOpen(add(today,1));baseReason="after_cutoff"}
  const options:any[]=[];let cursor=start;
  for(let guard=0;guard<21&&options.length<3;guard++){
    if(!closed(cursor))options.push({date:iso(cursor),label:deliveryLabel(cursor),reason:options.length===0?baseReason:"scheduled",time_zone:TZ,cutoff_hour:CUTOFF_HOUR});
    cursor=add(cursor,1);
  }
  return options;
}
function selectedDelivery(value:any,now=new Date()){
  const requested=txt(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(requested))return null;
  return deliveryOptions(now).find((x:any)=>x.date===requested)||null;
}

function pub(p:any,available?:number){
  const offer=p?.is_offer===true&&p?.offer_price!=null&&Number(p.offer_price)>=0;
  return {id:p.id,sku:p.sku||"",gtin:p.gtin||"",name:p.name,image_url:p.image_url||"",price_cents:cents(offer?p.offer_price:p.price),regular_price_cents:offer?cents(p.price):null,packaging:p.packaging||"",subcategory:p.customer_subcategory||p.subcategory||"",stock_quantity:Math.max(0,available??Number(p.stock||0)),brand:p.brand||"",category:p.category||"",subsubcategory:p.customer_subsubcategory||p.subsubcategory||"",unit:p.unit||""};
}

async function splitGlobalReady(){
  const {data,error}=await db.from("basket_sales_runtime_v1").select("sales_mode").eq("id",1).maybeSingle();
  if(error)throw error;
  return data?.sales_mode==="split";
}
async function home(){
  const split=await splitGlobalReady();
  const {data:basketsBase,error:be}=await db.from("basket_templates").select("id,name,base_price,image_url,sort_order").eq("is_active",true).order("sort_order").order("base_price").order("name");
  if(be)throw be;
  if(split){
    const {data:av,error:ae}=await db.from("basket_split_availability_v1").select("*");
    if(ae)throw ae;const am=new Map((av||[]).map((x:any)=>[String(x.basket_id),x]));
    const baskets=(basketsBase||[]).map((b:any)=>{const a:any=am.get(String(b.id));if(!a||Number(a.split_available||0)<=0)return null;return {
      id:b.id,name:b.name,display_price_cents:cents(b.base_price),image_url:b.image_url||"",
      stock_quantity:Number(a.split_available||0),split_mode:true,
      food_lot_id:a.food_lot_id,food_lot_code:a.food_short_code||"",food_lot_quantity:Number(a.food_available||0),
      hygiene_lot_id:a.hygiene_lot_id||null,hygiene_lot_code:a.hygiene_short_code||"",hygiene_lot_quantity:Number(a.hygiene_available||0),
      uses_hygiene_kit:a.uses_hygiene_kit===true
    }}).filter(Boolean);
    return {ok:true,version:"canonical-vitrine-v3-split-kits",split_kits:true,baskets,categories:CATEGORIES};
  }
  const {data:lq,error:le}=await db.from("basket_current_lot_v1").select("basket_id,lot_id,lot_code,quantity_available,built_at,sale_price_override");
  if(le)throw le;const lm=new Map((lq||[]).map((x:any)=>[String(x.basket_id),x]));
  const baskets=(basketsBase||[]).map((b:any)=>{const lot:any=lm.get(String(b.id));if(!lot||Number(lot.quantity_available||0)<=0)return null;return {
    id:b.id,name:b.name,display_price_cents:cents(lot.sale_price_override??b.base_price),image_url:b.image_url||"",
    stock_quantity:Number(lot.quantity_available||0),lot_id:lot.lot_id,lot_code:lot.lot_code,split_mode:false
  }}).filter(Boolean);
  return {ok:true,version:"canonical-vitrine-v2-premounted",split_kits:false,baskets,categories:CATEGORIES};
}
async function sellableMap(ids:string[]){
  const out=new Map<string,number>();if(!ids.length)return out;
  const {data,error}=await db.from("ops2_loose_sellable_stock_v1").select("product_id,loose_sellable_stock").in("product_id",ids);
  if(error)throw error;for(const r of data||[])out.set(String(r.product_id),Math.max(0,Number(r.loose_sellable_stock||0)));return out;
}
async function offerList(){
  const {data,error}=await db.from("products").select("id,sku,gtin,name,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit").eq("is_active",true).eq("is_offer",true).not("offer_price","is",null).order("name").limit(160);
  if(error)throw error;const rows=data||[],sm=await sellableMap(rows.map((p:any)=>p.id));
  return {ok:true,offers:rows.map((p:any)=>({...pub(p,sm.get(p.id)||0),product_id:p.id})).filter((p:any)=>p.stock_quantity>0).slice(0,80)};
}
async function subcats(url:URL){
  const c=txt(url.searchParams.get("category"),48);if(!c)return {ok:true,subcategories:[]};
  const {data,error}=await db.from("products").select("customer_subsubcategory,subsubcategory").eq("is_active",true).eq("sales_category",c).limit(5000);
  if(error)throw error;const m=new Map<string,number>();for(const p of data||[]){const n=txt(p.customer_subsubcategory||p.subcategory,100);if(n)m.set(n,(m.get(n)||0)+1)}
  return {ok:true,subcategories:[...m.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"pt-BR"))};
}
async function productList(url:URL){
  const c=txt(url.searchParams.get("category"),48),sc=txt(url.searchParams.get("subcategory"),100),q=safeQ(url.searchParams.get("q")),limit=Math.floor(clamp(url.searchParams.get("limit")||24,1,36)),offset=Math.floor(clamp(url.searchParams.get("offset")||0,0,5000));
  let x=db.from("products").select("id,sku,gtin,name,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit").eq("is_active",true);
  if(c)x=x.eq("sales_category",c);if(sc)x=x.eq("customer_subsubcategory",sc);
  if(q){for(const t of q.split(/\s+/).filter(Boolean).slice(0,4))x=x.or("name.ilike.%"+t+"%,gtin.ilike.%"+t+"%,sku.ilike.%"+t+"%,brand.ilike.%"+t+"%")}
  const {data,error}=await x.order("sort_order").order("name").range(offset,offset+limit-1);if(error)throw error;
  const rows=data||[],sm=await sellableMap(rows.map((p:any)=>p.id)),publicRows=rows.map((p:any)=>pub(p,sm.get(p.id)||0)).filter((p:any)=>p.stock_quantity>0);
  return {ok:true,products:publicRows,next_offset:rows.length===limit?offset+limit:null};
}
async function oneProduct(id:string){
  const {data:p,error}=await db.from("products").select("id,sku,gtin,name,description_short,description_long,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit").eq("id",id).eq("is_active",true).maybeSingle();
  if(error)throw error;if(!p)return null;const sm=await sellableMap([id]),o=pub(p,sm.get(id)||0);
  const characteristics=[["Marca",p.brand],["Embalagem",p.packaging],["Unidade",p.unit],["Categoria",p.category],["Subcategoria",p.subcategory],["Tipo",p.customer_subsubcategory||p.subsubcategory]].filter((x:any)=>txt(x[1],200)).map((x:any)=>({label:x[0],value:String(x[1])}));
  return {...o,sku:p.sku||"",gtin:p.gtin||"",description:p.description_long||p.description_short||"",characteristics};
}
async function splitLotItems(lotId:string,group:string){
  const {data,error}=await db.from("basket_stock_lot_items")
    .select("id,product_id,quantity_per_basket,position_order,kit_template_item_id,product:products(id,name,image_url,packaging,is_active,price),rule:basket_kit_template_items(id,removable,quantity_editable,min_quantity,max_quantity,remove_unit_delta,add_unit_delta)")
    .eq("lot_id",lotId).order("position_order");
  if(error)throw error;
  const rows=data||[],sm=await sellableMap(rows.map((x:any)=>x.product_id));
  return rows.map((i:any)=>{const product:any=Array.isArray(i.product)?i.product[0]:i.product,rule:any=Array.isArray(i.rule)?i.rule[0]:i.rule,base=Number(i.quantity_per_basket||0),loose=product?.is_active===false?0:(sm.get(i.product_id)||0);return {
    product_id:i.product_id,name:product?.name||"Produto",image_url:product?.image_url||"",packaging:product?.packaging||"",
    stock_quantity:loose,extra_stock_quantity:loose,loose_stock_quantity:loose,base_quantity:base,quantity:base,
    removable:rule?.removable!==false,quantity_editable:rule?.quantity_editable!==false,min_quantity:Number(rule?.min_quantity??0),
    max_quantity:rule?.max_quantity==null?null:Number(rule.max_quantity),
    remove_unit_delta:rule?.remove_unit_delta==null?null:Number(rule.remove_unit_delta),
    add_unit_delta:rule?.add_unit_delta==null?null:Number(rule.add_unit_delta),
    kit_template_item_id:i.kit_template_item_id||null,
    component_group:group,preassembled:true,regular_price:Number(product?.price||0)
  }});
}
async function basket(id:string){
  const {data:b,error}=await db.from("basket_templates").select("id,name,base_price,image_url,uses_hygiene_kit,split_kits_enabled").eq("id",id).eq("is_active",true).maybeSingle();
  if(error)throw error;if(!b)return null;
  const split=await splitGlobalReady();
  if(split){
    const {data:a,error:ae}=await db.from("basket_split_availability_v1").select("*").eq("basket_id",id).maybeSingle();if(ae)throw ae;
    if(!a||Number(a.split_available||0)<=0||!a.food_lot_id)return null;
    const food=await splitLotItems(String(a.food_lot_id),"food"),hygiene=a.uses_hygiene_kit&&a.hygiene_lot_id?await splitLotItems(String(a.hygiene_lot_id),"hygiene"):[];
    return {basket:{id:b.id,name:b.name,display_price_cents:cents(b.base_price),image_url:b.image_url||"",
      split_mode:true,stock_quantity:Number(a.split_available||0),
      food_lot_id:a.food_lot_id,food_lot_code:a.food_short_code||"",food_lot_quantity:Number(a.food_available||0),
      hygiene_lot_id:a.hygiene_lot_id||null,hygiene_lot_code:a.hygiene_short_code||"",hygiene_lot_quantity:Number(a.hygiene_available||0),
      uses_hygiene_kit:a.uses_hygiene_kit===true},items:[...food,...hygiene]};
  }
  const {data:lot,error:le}=await db.from("basket_current_lot_v1").select("lot_id,lot_code,quantity_available,built_at,sale_price_override").eq("basket_id",id).maybeSingle();if(le)throw le;if(!lot||Number(lot.quantity_available||0)<=0)return null;
  const {data:items,error:ie}=await db.from("basket_stock_lot_items")
    .select("id,product_id,quantity_per_basket,position_order,source_template_item_id,product:products(id,name,image_url,packaging,is_active),rule:basket_template_items(id,removable,quantity_editable,min_quantity,max_quantity,remove_unit_delta,add_unit_delta)")
    .eq("lot_id",lot.lot_id).order("position_order");if(ie)throw ie;
  const ids=(items||[]).map((i:any)=>i.product_id),sm=await sellableMap(ids);
  return {basket:{id:b.id,name:b.name,display_price_cents:cents(lot.sale_price_override??b.base_price),image_url:b.image_url||"",
      split_mode:false,lot_id:lot.lot_id,lot_code:lot.lot_code,stock_quantity:Number(lot.quantity_available||0)},
    items:(items||[]).map((i:any)=>{const product:any=Array.isArray(i.product)?i.product[0]:i.product,rule:any=Array.isArray(i.rule)?i.rule[0]:i.rule,base=Number(i.quantity_per_basket||0),extra=product?.is_active===false?0:(sm.get(i.product_id)||0),configuredMax=rule?.max_quantity==null?base+Math.floor(extra):Number(rule.max_quantity);return {
      product_id:i.product_id,name:product?.name||"Produto",image_url:product?.image_url||"",packaging:product?.packaging||"",
      stock_quantity:extra,extra_stock_quantity:extra,base_quantity:base,quantity:base,removable:rule?.removable!==false,
      quantity_editable:rule?.quantity_editable!==false,min_quantity:Number(rule?.min_quantity??0),
      max_quantity:Math.max(base,configuredMax),template_item_id:i.source_template_item_id||null,
      component_group:"legacy",preassembled:true
    }})};
}
function groupChanged(items:any[],group:string){
  return items.filter(x=>x.component_group===group).some(x=>Number(x.quantity||0)!==Number(x.base_quantity||0));
}
async function quote(payload:any){
  const id=uid(payload?.basket_id);if(!id)return {error:"invalid_basket",status:400};
  const split=await splitGlobalReady();
  if(split){
    const foodLot=uid(payload?.food_lot_id),hygieneLot=uid(payload?.hygiene_lot_id);
    const {data:b,error:be}=await db.from("basket_templates").select("id,base_price,uses_hygiene_kit").eq("id",id).eq("is_active",true).eq("split_kits_enabled",true).maybeSingle();
    if(be)throw be;if(!b)return {error:"basket_not_found",status:404};if(!foodLot)return {error:"basket_food_lot_required",status:400};
    const food=await splitLotItems(foodLot,"food"),hygiene=b.uses_hygiene_kit?(hygieneLot?await splitLotItems(hygieneLot,"hygiene"):[]):[];
    if(b.uses_hygiene_kit&&!hygieneLot)return {error:"basket_hygiene_lot_required",status:400};
    const all=[...food,...hygiene],reqRows=Array.isArray(payload?.items)?payload.items:[],req=new Map<string,number>();
    for(const x of reqRows){const pid=uid(x?.product_id),g=String(x?.component_group||"");if(pid&&["food","hygiene"].includes(g))req.set(g+"|"+pid,Number(x?.quantity||0))}
    for(const x of reqRows){const pid=uid(x?.product_id),g=String(x?.component_group||"");if(pid&&["food","hygiene"].includes(g)&&!all.some((r:any)=>r.product_id===pid&&r.component_group===g))return {error:"basket_component_not_in_selected_kit",status:409}}
    const selected=all.map((r:any)=>({...r,quantity:req.has(r.component_group+"|"+r.product_id)?Number(req.get(r.component_group+"|"+r.product_id)):0}));
    const foodChanged=groupChanged(selected,"food"),hygieneChanged=b.uses_hygiene_kit?groupChanged(selected,"hygiene"):false;
    let total=Number(b.base_price||0);
    for(const r of selected){
      const qty=Number(r.quantity||0),base=Number(r.base_quantity||0),changed=r.component_group==="food"?foodChanged:hygieneChanged,loose=Number(r.loose_stock_quantity||0);
      const min=Math.max(0,Number(r.min_quantity??(r.removable===false?base:0)));
      const max=r.max_quantity==null?(changed?Math.floor(loose):base+Math.floor(loose)):Number(r.max_quantity);
      if(!Number.isFinite(qty)||qty<0||Math.trunc(qty)!==qty)return {error:"invalid_basket_quantity",status:400};
      if(qty===0&&r.removable===false)return {error:"item_not_removable",status:409};
      if(qty<min||qty>max)return {error:"basket_quantity_out_of_range",status:409,product_id:r.product_id};
      if(changed&&qty>loose)return {error:"insufficient_stock",status:409,product_id:r.product_id,available:loose,requested:qty};
      const price=Number(r.regular_price||0);
      if(qty<base)total+=Math.abs(qty-base)*Number(r.remove_unit_delta??-price);
      else if(qty>base)total+=(qty-base)*Number(r.add_unit_delta??price);
    }
    return {ok:true,total_cents:Math.max(0,cents(total)),split_mode:true,food_changed:foodChanged,hygiene_changed:hygieneChanged,
      food_lot_id:foodLot,food_lot_code:payload?.food_lot_code||null,hygiene_lot_id:hygieneLot||null,hygiene_lot_code:payload?.hygiene_lot_code||null};
  }

  const {data:b,error:be}=await db.from("basket_templates").select("id,base_price").eq("id",id).eq("is_active",true).maybeSingle();if(be)throw be;if(!b)return {error:"basket_not_found",status:404};
  const requestedLot=uid(payload?.lot_id);
  let lotQuery=db.from("basket_stock_lots").select("id,lot_code,quantity_available,sale_price_override").eq("basket_id",id).eq("lot_kind","legacy_full").eq("sale_enabled",true).eq("status","ready").gt("quantity_available",0);
  if(requestedLot)lotQuery=lotQuery.eq("id",requestedLot);
  const {data:lots,error:le}=await lotQuery.order("built_at").order("created_at").limit(1);if(le)throw le;
  const lot:any=(lots||[])[0];if(!lot)return {error:"basket_lot_unavailable",status:409};
  const {data:rules,error}=await db.from("basket_stock_lot_items")
    .select("product_id,quantity_per_basket,source_template_item_id,product:products(id,price,is_active),rule:basket_template_items(id,removable,quantity_editable,min_quantity,max_quantity,remove_unit_delta,add_unit_delta)")
    .eq("lot_id",lot.id);if(error)throw error;
  const ids=(rules||[]).map((r:any)=>r.product_id),sm=await sellableMap(ids),req=new Map<string,number>((Array.isArray(payload?.items)?payload.items:[]).map((x:any)=>[uid(x?.product_id),Number(x?.quantity||0)]).filter((x:any)=>x[0]));
  let total=Number(lot.sale_price_override??b.base_price??0);
  for(const r of rules||[]){const product:any=Array.isArray(r.product)?r.product[0]:r.product,rule:any=Array.isArray(r.rule)?r.rule[0]:r.rule,base=Number(r.quantity_per_basket||0),qty=req.has(r.product_id)?Number(req.get(r.product_id)):base,loose=product?.is_active===false?0:(sm.get(r.product_id)||0),min=Math.max(0,Number(rule?.min_quantity??(rule?.removable===false?base:0))),max=Math.min(base+Math.floor(loose),Number(rule?.max_quantity??(base+Math.floor(loose))));if(!Number.isFinite(qty)||qty<0||Math.trunc(qty)!==qty)return {error:"invalid_basket_quantity",status:400};if(qty===0&&rule?.removable===false)return {error:"item_not_removable",status:409};if(qty<min||qty>max)return {error:"basket_quantity_out_of_range",status:409};const price=Number(product?.price||0);if(qty<base)total+=Math.abs(qty-base)*Number(rule?.remove_unit_delta??-price);else if(qty>base)total+=(qty-base)*Number(rule?.add_unit_delta??price)}
  for(const [pid] of req)if(!(rules||[]).some((r:any)=>String(r.product_id)===pid))return {error:"basket_component_not_in_lot",status:409};
  return {ok:true,total_cents:Math.max(0,cents(total)),lot_id:lot.id,lot_code:lot.lot_code,split_mode:false};
}
async function resolveCode(req:Request,v:any){
  const c=String(v??"").trim();if(!/^\d{4}$/.test(c))return {error:"invalid_code",status:400};const raw=ip(req),ih=raw?await sha(raw):"";if(ih){const since=new Date(Date.now()-600000).toISOString(),n=await db.from("storefront_identity_resolve_attempts").select("id",{count:"exact",head:true}).eq("ip_hash",ih).gte("attempted_at",since);if(n.error)throw n.error;if(Number(n.count||0)>=12)return {error:"too_many_attempts",status:429}}
  const h=await sha(c),now=new Date().toISOString(),q=await db.from("storefront_identity_tokens").update({redeemed_at:now,last_used_at:now,use_count:1}).eq("token_hash",h).eq("short_code",c).is("redeemed_at",null).gt("expires_at",now).select("phone_e164,expires_at").maybeSingle();if(q.error)throw q.error;if(ih)await db.from("storefront_identity_resolve_attempts").insert({ip_hash:ih,success:Boolean(q.data)});if(!q.data)return {error:"code_expired_or_invalid",status:404};return {phone_e164:q.data.phone_e164,expires_at:q.data.expires_at};
}
async function resolveToken(v:any){const t=String(v??"").trim();if(!/^[A-Za-z0-9_-]{24,160}$/.test(t))return {error:"invalid_token",status:400};const h=await sha(t),now=new Date().toISOString(),q=await db.from("storefront_identity_tokens").update({redeemed_at:now,last_used_at:now,use_count:1}).eq("token_hash",h).is("redeemed_at",null).gt("expires_at",now).select("phone_e164,expires_at").maybeSingle();if(q.error)throw q.error;if(!q.data)return {error:"token_expired_or_invalid",status:404};return {phone_e164:q.data.phone_e164,expires_at:q.data.expires_at}}
async function recordOpsEvent(eventType:string,summary:string,orderId:any,payload:any={},idempotencyKey:string|null=null){
  const oid=uid(orderId);if(!oid)return;
  try{await db.rpc("ops_record_event_v1",{
    p_domain:"order",p_event_type:eventType,p_summary:summary,p_actor_type:"external",
    p_entity_type:"order",p_entity_id:oid,p_correlation_id:oid,p_actor_id:null,p_actor_label:"Cliente / Site",
    p_source_system:"storefront",p_severity:"info",p_payload:payload&&typeof payload==="object"?payload:{},
    p_external_ref:null,p_idempotency_key:idempotencyKey,p_occurred_at:new Date().toISOString()
  })}catch(e){console.error("ops_event_failed",eventType,txt((e as any)?.message,120))}
}

async function customerIdByPhone(v:any){
  const ph=phone(v);if(!ph)return null;
  const r=await db.rpc("lookup_customer_by_phone",{p_phone:ph});if(r.error)throw r.error;
  return uid(r.data?.[0]?.customer_id)||null;
}
async function loadCustomerForCheckout(customerId:string){
  const id=uid(customerId);if(!id)return null;
  const [cq,aq,sq]=await Promise.all([
    db.from("customers").select("id,name,cpf_cnpj,primary_whatsapp_e164,marketing_opt_in").eq("id",id).maybeSingle(),
    db.from("customer_addresses").select("id,street,number,complement,neighborhood,city,state,postal_code,reference,is_default,updated_at").eq("customer_id",id).eq("is_active",true).order("is_default",{ascending:false}).order("updated_at",{ascending:false}).limit(1).maybeSingle(),
    db.rpc("ops2_customer_registration_state_v1",{p_customer_id:id})
  ]);
  if(cq.error)throw cq.error;if(aq.error)throw aq.error;if(sq.error)throw sq.error;if(!cq.data)return null;
  const doc=String(cq.data.cpf_cnpj||"").replace(/\D+/g,"");
  const a=aq.data?{id:aq.data.id,street:aq.data.street||"",number:aq.data.number||"",complement:aq.data.complement||"",neighborhood:aq.data.neighborhood||"",district:aq.data.neighborhood||"",city:aq.data.city||"",state:aq.data.state||"MT",postal_code:aq.data.postal_code||"",reference:aq.data.reference||""}:null;
  return {id:cq.data.id,display_name:cq.data.name||"",phone:cq.data.primary_whatsapp_e164||"",document_present:doc.length===11||doc.length===14,document_last4:doc?doc.slice(-4):"",marketing_opt_in:cq.data.marketing_opt_in===true,registration_complete:sq.data?.registration_complete===true,missing_fields:Array.isArray(sq.data?.missing_fields)?sq.data.missing_fields:[],address:a};
}
async function lookupCustomer(v:any){
  const ph=phone(v);if(!ph)return {ok:true,found:false};const id=await customerIdByPhone(ph);if(!id)return {ok:true,found:false};const customer=await loadCustomerForCheckout(id);return {ok:true,found:Boolean(customer),customer};
}
async function registerCustomer(req:Request,p:any){
  const ph=phone(p?.phone);if(!ph)return {error:"invalid_phone",status:400};
  const [ipKey,phoneKey]=await Promise.all([sha(ip(req)||"unknown"),sha(ph)]);
  const [a,b]=await Promise.all([
    db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-register:ip:"+ipKey,p_bucket:"register_customer",p_limit:20,p_window_seconds:600}),
    db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-register:phone:"+phoneKey,p_bucket:"register_customer",p_limit:8,p_window_seconds:600})
  ]);
  if(a.error||b.error)return {error:"rate_limit_unavailable",status:503};if(a.data!==true||b.data!==true)return {error:"rate_limited",status:429};
  const r=await db.rpc("ops2_upsert_storefront_registration_v1",{
    p_phone:ph,p_name:txt(p?.name,180),p_document:txt(p?.document,30),p_street:txt(p?.street,180),p_number:txt(p?.number,40),
    p_neighborhood:txt(p?.neighborhood,120),p_city:txt(p?.city,100),p_complement:txt(p?.complement,180)||null,
    p_reference:txt(p?.reference,220)||null,p_postal_code:txt(p?.postal_code,12)||null,
    p_marketing_opt_in:typeof p?.marketing_opt_in==="boolean"?p.marketing_opt_in:null,
    p_source_key:p?.source==="checkout"?"site_checkout":"site_registration_page"
  });
  if(r.error)return {error:"registration_unavailable",status:503};
  if(r.data?.ok!==true){const e=txt(r.data?.error,100)||"registration_failed";return {error:e,status:["document_already_in_use","document_mismatch","identity_mismatch"].includes(e)?409:400};}
  const customer=await loadCustomerForCheckout(r.data.customer_id);return {ok:true,registration_complete:true,customer,bling_job_id:r.data.bling_job_id||null};
}

async function submit(req:Request,p:any){
  const pay=txt(p?.payment_method,80),ph=phone(p?.whatsapp_phone),items=Array.isArray(p?.items)?p.items.slice(0,80):[];
  if(!ph)return {error:"invalid_phone",status:400};if(!items.length)return {error:"empty_cart",status:400};
  const deliveryDate=txt(p?.delivery_date,10);if(!deliveryDate)return {error:"delivery_date_required",status:400};
  const del=selectedDelivery(deliveryDate);if(!del)return {error:"invalid_delivery_date",status:409,delivery_options:deliveryOptions()};
  const ik=await sha(ip(req)||"unknown"),pk=await sha(ph),[a,b]=await Promise.all([db.rpc("consume_public_rate_limit",{p_rate_key:"vitrine-direct:ip:"+ik,p_bucket:"create_order",p_limit:12,p_window_seconds:600}),db.rpc("consume_public_rate_limit",{p_rate_key:"vitrine-direct:phone:"+pk,p_bucket:"create_order",p_limit:5,p_window_seconds:600})]);if(a.error||b.error)return {error:"rate_limit_unavailable",status:503};if(a.data!==true||b.data!==true)return {error:"rate_limited",status:429};
  const found=await lookupCustomer(ph);if(!found.found||!found.customer)return {error:"registration_required",status:409,missing_fields:["name","document","address","number","neighborhood","city"]};
  const customer=found.customer;if(customer.registration_complete!==true)return {error:"registration_required",status:409,missing_fields:customer.missing_fields||[]};
  const customerSnapshot={found:true,id:customer.id,display_name:customer.display_name,address:customer.address||null,identity_status:"verified_existing"};
  const split=await splitGlobalReady(),created=split?await db.rpc("create_vitrine_cart_order_v3",{p_phone:ph,p_payment_method:pay,p_items:items,p_customer_snapshot:customerSnapshot,p_delivery:del}):await db.rpc("create_canonical_cart_order_v2",{p_source:"vitrine",p_phone:ph,p_payment_method:pay,p_items:items,p_customer_snapshot:customerSnapshot,p_delivery:del});
  if(created.error){const e=txt(created.error.message,160).split("\n")[0];return {error:e||"order_failed",status:["insufficient_stock","product_unavailable","basket_unavailable","basket_product_unavailable","basket_lot_unavailable","basket_lot_insufficient","basket_component_not_in_lot","basket_kit_lot_unavailable","basket_kit_lot_insufficient","basket_component_not_in_selected_kit"].includes(e)?409:400,minimum_order_cents:MINIMUM_ORDER_CENTS}}
  const orderId=created.data?.order_id;let papoaiLink:any=null;
  if(orderId){try{const linked=await db.rpc("ops2_link_storefront_order_from_identity_v1",{p_order_id:orderId});if(!linked.error)papoaiLink=linked.data||null}catch(e){console.error("papoai_identity_order_link",txt((e as any)?.message,180))}}
  await recordOpsEvent("order.received","Pedido recebido pelo site e aguardando confirmação.",orderId,{source:"vitrine",customer_status:"registered",payment_method:pay||null,delivery_date:deliveryDate,reservation_on_confirmation:true,stock_reserved:false,papoai_conversation_linked:Boolean(papoaiLink?.linked)},"order-received:"+orderId);
  return {...created.data,phone_attached:true,customer_status:"registered",registration_complete:true,minimum_order_cents:MINIMUM_ORDER_CENTS,delivery:del,customer,history_synced:true,stock_reserved:false,reservation_timing:"on_confirmation",papoai_conversation_linked:Boolean(papoaiLink?.linked)};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  try{
    const u=new URL(req.url),action=txt(u.searchParams.get("action")||(req.method==="POST"?"basket_quote":"home"),60);
    if(action==="health")return json(req,{ok:true,service:"storefront-v2",mode:"canonical-vitrine",version:26},200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="home")return json(req,await home(),200,{"Cache-Control":"public, max-age=120, stale-while-revalidate=600"});
    if(req.method==="GET"&&action==="offers")return json(req,await offerList(),200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="subcategories")return json(req,await subcats(u),200,{"Cache-Control":"public, max-age=120, stale-while-revalidate=600"});
    if(req.method==="GET"&&action==="products")return json(req,await productList(u),200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="product"){const id=uid(u.searchParams.get("product_id"));if(!id)return json(req,{ok:false,error:"invalid_product"},400);const p=await oneProduct(id);return p?json(req,{ok:true,product:p},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"product_not_found"},404)}
    if(req.method==="GET"&&action==="basket"){const id=uid(u.searchParams.get("basket_id"));if(!id)return json(req,{ok:false,error:"invalid_basket"},400);const b=await basket(id);return b?json(req,{ok:true,...b},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"basket_not_found"},404)}
    if(req.method==="GET"&&action==="resolve_identity_code"){const r=await resolveCode(req,u.searchParams.get("code"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="resolve_identity_token"){const r=await resolveToken(u.searchParams.get("token"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="delivery_options")return json(req,{ok:true,options:deliveryOptions(),cutoff_hour:CUTOFF_HOUR,time_zone:TZ},200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="customer_lookup"){const ph=phone(u.searchParams.get("phone")),rk=await sha(ph||ip(req)||"unknown"),gate=await db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-v2:customer-lookup:"+rk,p_bucket:"lookup_customer",p_limit:20,p_window_seconds:300});if(gate.error)return json(req,{ok:false,error:"rate_limit_unavailable"},503);if(gate.data!==true)return json(req,{ok:false,error:"rate_limited"},429);return json(req,await lookupCustomer(ph),200,{"Cache-Control":"no-store"})}

    const body=req.method==="POST"?await req.json().catch(()=>({})):{};
    if(req.method==="POST"&&action==="customer_register"){const r=await registerCustomer(req,body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="basket_quote"){const r=await quote(body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="submit_order"){const r=await submit(req,body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="issue_identity_link")return json(req,{ok:false,error:"retired"},410)
    if(req.method==="POST"&&action==="reconcile_customer")return json(req,{ok:false,error:"retired"},410)

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