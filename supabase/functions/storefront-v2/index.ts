import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { moldFirstAvailableOption, moldFirstConfiguredOption, moldProductIdsForRead } from "./basket-lightweight.js";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(SUPABASE_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const MINIMUM_ORDER_CENTS=7500;
const STOCK_CONFLICT_CODES=new Set<string>([
  "insufficient_stock","product_unavailable","basket_unavailable","basket_product_unavailable",
  "basket_lot_unavailable","basket_lot_insufficient","basket_component_not_in_lot",
  "basket_kit_lot_unavailable","basket_kit_lot_insufficient","basket_component_not_in_selected_kit"
]);
const ORDER_CONFLICT_CODES=new Set<string>([
  ...STOCK_CONFLICT_CODES,"basket_mold_unavailable","basket_mold_not_configured",
  "basket_mold_component_invalid","basket_mold_option_invalid","basket_mold_composition_invalid"
]);
const STALE_BASKET_CONFIGURATION_CODES=new Set<string>([
  "basket_mold_component_invalid","basket_mold_option_invalid","basket_mold_composition_invalid"
]);
const CUTOFF_HOUR=11;
const TZ="America/Cuiaba";
const CATEGORIES=[
  {key:"mercearia",label:"Mercearia"},
  {key:"limpeza_lavanderia",label:"Limpeza e lavanderia"},
  {key:"higiene_beleza",label:"Higiene e beleza"},
  {key:"casa_pet",label:"Casa e pet"}
];
const HOME_CACHE_TTL_MS=120_000;
const HOME_SNAPSHOT_TABLE="storefront_public_home_snapshot_v1";
const HOME_SNAPSHOT_MAX_STALE_MS=2*60*60_000;
const HOME_SNAPSHOT_LEASE_MS=120_000;
let homeCache:{expiresAt:number,data:any}|null=null;
let homePromise:Promise<any>|null=null;
let homeRefreshPromise:Promise<void>|null=null;
let homeRefreshNextAttemptAt=0;
const MOLD_COMPOSITION_CACHE_TTL_MS=120_000;
// The storefront still checks current products, prices and stock on every detail/quote.
// Only the generator's default position choices may be reused for up to 60 seconds.
const MOLD_DETAIL_CACHE_MAX_AGE_MS=60_000;
const moldCompositionCache=new Map<string,{expiresAt:number,data:any,createdAt:number}>();
const moldCompositionInFlight=new Map<string,Promise<any[]>>();
const moldDetailCompositionInFlight=new Map<string,Promise<any>>();
const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:"https://donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"}};
const json=(req:Request,v:any,s=200,h:Record<string,string>={})=>new Response(JSON.stringify(v),{status:s,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8",...h}});
const txt=(v:any,n=180)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const uid=(v:any)=>{const s=txt(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const clamp=(v:any,min:number,max:number)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min};
const cents=(v:any)=>Math.round(Number(v||0)*100);
const phone=(v:any)=>{let d=String(v??"").replace(/\D+/g,"");if(d.startsWith("00"))d=d.slice(2);let local="";if(d.startsWith("55")&&(d.length===12||d.length===13))local=d.slice(2);else if(d.length===10||d.length===11)local=d;else if(d.length===8||d.length===9)local="65"+d;else return "";if(local.length===10&&/[6-9]/.test(local.charAt(2)))local=local.slice(0,2)+"9"+local.slice(2);return "+55"+local};
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
  const offer=p?.is_offer===true&&p?.offer_price!=null&&Number(p.offer_price)>=0,price=offer?p.offer_price:p.price;
  return {id:p.id,sku:p.sku||"",gtin:p.gtin||"",name:p.name,image_url:p.image_url||"",price_cents:cents(price),price_available:Number(price||0)>0,regular_price_cents:offer?cents(p.price):null,packaging:p.packaging||"",subcategory:p.customer_subsubcategory||p.subcategory||"",stock_quantity:p.is_active===false?0:Math.max(0,available??Number(p.stock||0)),is_active:p.is_active!==false,brand:p.brand||"",category:p.category||"",subsubcategory:p.customer_subsubcategory||p.subsubcategory||"",unit:p.unit||""};
}

async function splitGlobalReady(){
  const {data,error}=await db.from("basket_sales_runtime_v1").select("sales_mode").eq("id",1).maybeSingle();
  if(error)throw error;
  return data?.sales_mode==="split";
}
async function basketImageMap(lotIds:string[]){
  const map=new Map<string,string>();if(!lotIds.length)return map;
  const q=await db.from("basket_lot_images").select("lot_id,hygiene_lot_id,image_url,published_at").in("lot_id",lotIds).eq("status","published").order("published_at",{ascending:false});
  if(q.error)throw q.error;
  for(const row of q.data||[]){const key=row.lot_id+":"+(row.hygiene_lot_id||"");if(!map.has(key)&&row.image_url)map.set(key,row.image_url)}
  return map;
}
async function basketLotImage(lotId:string,hygieneId:string|null,fallback:string){const images=await basketImageMap([lotId]);return images.get(lotId+":"+(hygieneId||""))||fallback||""}
function basketTotalItems(items:any[]){
  return items.reduce((total,item)=>{
    const quantity=Number(item?.quantity);
    return Number.isFinite(quantity)&&quantity>0?total+quantity:total;
  },0);
}
async function basketCarouselItems(baskets:any[]){
  const ids=[...new Set(baskets.flatMap((b:any)=>b.split_mode?[b.food_lot_id,...(b.uses_hygiene_kit&&b.hygiene_lot_id?[b.hygiene_lot_id]:[])]:[b.lot_id]).filter(Boolean))];
  if(!ids.length)return baskets.map((b:any)=>({...b,carousel_items:[],total_item_count:0}));
  const {data,error}=await db.from("basket_stock_lot_items").select("lot_id,product_id,quantity_per_basket,position_order,product:products(name,image_url,packaging)").in("lot_id",ids).order("position_order");
  if(error)throw error;
  const byLot=new Map<string,any[]>();
  for(const row of data||[]){const rows=byLot.get(row.lot_id)||[];rows.push(row);byLot.set(row.lot_id,rows)}
  return baskets.map((b:any)=>{
    const lots=b.split_mode?[b.food_lot_id,...(b.uses_hygiene_kit&&b.hygiene_lot_id?[b.hygiene_lot_id]:[])]:[b.lot_id];
    const items=new Map<string,any>();
    for(const lot of lots)for(const row of byLot.get(lot)||[]){
      const p=Array.isArray(row.product)?row.product[0]:row.product,quantity=Number(row.quantity_per_basket);
      if(!p||!Number.isFinite(quantity)||quantity<=0)continue;
      const previous=items.get(row.product_id);
      if(previous)previous.quantity+=quantity;
      else items.set(row.product_id,{product_id:row.product_id,name:p.name,image_url:p.image_url||"",packaging:p.packaging||"",quantity});
    }
    return {...b,carousel_items:[...items.values()].slice(0,6),total_item_count:basketTotalItems([...items.values()])};
  });
}
function basketCategoryFields(b:any){const c=Array.isArray(b?.category)?b.category[0]:b?.category;return {category_name:c?.name||null,category_slug:c?.slug||null};}
// R5_MOLD_STOREFRONT_V1
async function moldAvailableStockMap(productIds:string[]){
  const ids=[...new Set(productIds.filter(Boolean))];const out=new Map<string,number>();if(!ids.length)return out;
  const {data,error}=await db.from("storefront_product_sellable_stock_v1")
    .select("product_id,sellable_stock,is_active").in("product_id",ids);
  if(error)throw error;
  for(const r of data||[])out.set(String(r.product_id),r.is_active===true?Math.max(0,Number(r.sellable_stock||0)):0);
  return out;
}
async function orderableProductStockMap(productIds:string[]){
  const ids=[...new Set(productIds.filter(Boolean))];const out=new Map<string,number>();if(!ids.length)return out;
  const [{data,error},{data:productRows,error:productError}]=await Promise.all([
    db.from("storefront_ean_sellable_stock_v1")
      .select("product_id,is_active,stock_authority,loose_sellable_stock,ean_sellable_stock").in("product_id",ids),
    db.from("storefront_product_sellable_stock_v1")
      .select("product_id,sellable_stock,is_active,price,validity_date").in("product_id",ids)
  ]);
  if(error)throw error;if(productError)throw productError;
  const websiteStock=new Map<string,any>((productRows||[]).map((row:any)=>[String(row.product_id),row]));
  const today=iso(local());
  for(const r of data||[]){
    const productId=String(r.product_id);
    let stock:any;
    if(r.stock_authority==="bling"){
      stock=r.loose_sellable_stock;
    }else if(r.stock_authority==="supabase"){
      const row=websiteStock.get(productId);
      const expiry=row?.validity_date?String(row.validity_date).slice(0,10):"";
      const websiteEligible=row?.is_active===true&&Number(row.price||0)>0&&(!expiry||expiry>=today);
      stock=websiteEligible?Math.floor(Number(row.sellable_stock||0)):0;
    }else{
      stock=r.ean_sellable_stock??r.loose_sellable_stock;
    }
    out.set(productId,r.is_active===true?Math.max(0,Number(stock||0)):0);
  }
  return out;
}
function moldEffectivePriceCents(p:any){const n=p?.is_offer===true&&p?.offer_price!=null&&Number(p.offer_price)>=0?Number(p.offer_price):Number(p?.price||0);return cents(n)}
function moldConfiguredDefaults(options:any[]){
  const defaults=new Map<string,string>();
  for(const option of options||[]){const positionId=String(option.position_id||"");if(positionId&&!defaults.has(positionId))defaults.set(positionId,String(option.product_id||""))}
  return defaults;
}
function moldConfiguredBase(mold:any,positions:any[],defaults:Map<string,string>,products:Map<string,any>){
  let productTotalCents=0,conditionalPresent=false;
  for(const position of positions||[]){
    const positionId=String(position.id||""),productId=defaults.get(positionId)||"",product=products.get(productId),quantity=Number(position.quantity||0);
    if(product)productTotalCents+=Math.round(moldEffectivePriceCents(product)*quantity);
    if(mold?.conditional_hidden_enabled===true&&mold?.conditional_hidden_product_id&&Number(mold?.conditional_hidden_adjustment||0)>0&&productId===String(mold.conditional_hidden_product_id)&&quantity>0)conditionalPresent=true;
  }
  const conditionalAppliedCents=conditionalPresent?cents(mold.conditional_hidden_adjustment||0):0;
  return {productTotalCents,conditionalAppliedCents,totalCents:Math.max(0,productTotalCents+cents(mold?.hidden_adjustment||0)+conditionalAppliedCents)};
}
function buildMoldSelectedOption(product:any,stock:number,quantity:number,allowUnavailablePreview:boolean){
  if(!product||(stock<quantity&&!allowUnavailablePreview))return null;
  return {product_id:product.id,name:product.name,brand:product.brand||"",sku:product.sku,gtin:product.gtin,image_url:product.image_url||"",packaging:product.packaging||"",stock_quantity:stock,price_cents:moldEffectivePriceCents(product)};
}
async function moldProductsMap(ids:string[]){const clean=[...new Set(ids.filter(Boolean))],out=new Map<string,any>();if(!clean.length)return out;const q=await db.from("products").select("id,name,brand,sku,gtin,image_url,packaging,price,offer_price,is_offer,is_active").in("id",clean);if(q.error)throw q.error;for(const p of q.data||[])out.set(String(p.id),p);return out}
async function publicBasketExtraThemes(legacyExtras:any[]=[]){
  const themeQ=await db.from("basket_extra_themes").select("id,name,sort_order,basket_extra_theme_products(product_id,sort_order)").order("sort_order").order("created_at");
  if(themeQ.error)throw themeQ.error;
  const themeRows=(themeQ.data||[]).map((t:any)=>({...t,items:Array.isArray(t.basket_extra_theme_products)?t.basket_extra_theme_products.slice().sort((a:any,b:any)=>Number(a.sort_order||0)-Number(b.sort_order||0)):[]}));
  return [
    ...themeRows.map((t:any)=>({id:String(t.id),label:String(t.name||"Produtos extras"),product_count:t.items.length,products:[],products_loaded:false})),
    ...legacyExtras.map((x:any,index:number)=>({id:String(x?.id||"legacy-"+index),label:String(x?.label||"Produto adicional"),product_count:Array.isArray(x?.product_ids)?x.product_ids.length:0,products:[],products_loaded:false}))
  ].filter((x:any)=>x.product_count>0);
}
async function publicBasketExtras(legacyExtras:any[]=[],themeId:string){
  const themeQ=await db.from("basket_extra_themes").select("id,name,sort_order,basket_extra_theme_products(product_id,sort_order)").eq("id",themeId).maybeSingle();
  if(themeQ.error)throw themeQ.error;
  const theme=themeQ.data?{...themeQ.data,items:Array.isArray(themeQ.data.basket_extra_theme_products)?themeQ.data.basket_extra_theme_products.slice().sort((a:any,b:any)=>Number(a.sort_order||0)-Number(b.sort_order||0)):[]}:null;
  const legacy=legacyExtras.find((x:any,index:number)=>String(x?.id||"legacy-"+index)===String(themeId));
  const rows=theme?[{id:String(theme.id),label:String(theme.name||"Produtos extras"),items:theme.items}]:legacy?[{id:String(legacy.id||themeId),label:String(legacy.label||"Produto adicional"),items:(Array.isArray(legacy.product_ids)?legacy.product_ids:[]).map((product_id:any)=>({product_id}))}]:[];
  const ids=[...new Set(rows.flatMap((t:any)=>t.items.map((x:any)=>uid(x.product_id)).filter(Boolean)))];
  const [products,stock]=await Promise.all([moldProductsMap(ids),orderableProductStockMap(ids)]);
  const toProduct=(id:any)=>{
    const p=products.get(String(id)),available=stock.get(String(id))||0,priceCents=p?moldEffectivePriceCents(p):0;
    return p?.is_active===true&&available>0&&priceCents>0?{product_id:p.id,name:p.name,brand:p.brand||"",sku:p.sku,gtin:p.gtin,image_url:p.image_url||"",packaging:p.packaging||"",stock_quantity:available,price_cents:priceCents}:null;
  };
  return rows.map((t:any)=>({id:t.id,label:t.label,products:t.items.map((x:any)=>toProduct(x.product_id)).filter(Boolean),products_loaded:true})).filter((x:any)=>x.products.length>0);
}
async function basketExtraProducts(basketId:string,themeId:string){
  const id=uid(basketId),theme=txt(themeId,100);if(!id||!theme)return {error:"invalid_basket_extra_request",status:400};
  const [basketQ,moldQ,legacyQ]=await Promise.all([
    db.from("basket_templates").select("id,is_active").eq("id",id).maybeSingle(),
    db.from("basket_molds").select("metadata").eq("basket_id",id).maybeSingle(),
    db.from("basket_commercial_catalog_v1").select("commercial_id,model_active,category_active,public_lot_id,public_available").eq("source_kind","basket").eq("commercial_id",id).maybeSingle()
  ]);
  if(basketQ.error)throw basketQ.error;if(moldQ.error)throw moldQ.error;if(legacyQ.error)throw legacyQ.error;
  const visibleTemplate=basketQ.data?.is_active===true,visibleLegacy=legacyQ.data?.model_active===true&&legacyQ.data?.category_active===true&&Boolean(legacyQ.data?.public_lot_id)&&Number(legacyQ.data?.public_available||0)>0;
  if(!visibleTemplate&&!visibleLegacy)return {error:"basket_not_found",status:404};
  const legacy=Array.isArray(moldQ.data?.metadata?.optional_items)?moldQ.data.metadata.optional_items:[];
  return {ok:true,extras:await publicBasketExtras(legacy,theme)};
}
async function moldPublicCompositions(basketIds:string[]){
  const ids=[...new Set(basketIds.filter(Boolean))],out=new Map<string,any>(),now=Date.now();
  const missing:string[]=[];
  for(const id of ids){const cached=moldCompositionCache.get(id);if(cached&&cached.expiresAt>now)out.set(id,cached.data);else{moldCompositionCache.delete(id);missing.push(id)}}
  if(missing.length){
    const key=[...missing].sort().join(",");let request=moldCompositionInFlight.get(key);
    if(!request){
      request=db.rpc("basket_mold_public_compositions_batch_v1",{p_basket_ids:missing}).then((q:any)=>{if(q.error)throw q.error;return Array.isArray(q.data)?q.data:[]}).finally(()=>moldCompositionInFlight.delete(key));
      moldCompositionInFlight.set(key,request);
    }
    const generated=await request;
    for(const data of generated){const id=String(data?.basket_id||"");if(id){moldCompositionCache.set(id,{expiresAt:Date.now()+MOLD_COMPOSITION_CACHE_TTL_MS,data,createdAt:Date.now()});out.set(id,data)}}
  }
  return out;
}
async function moldHomeCards(priorityOnly=false){
  const mq=await db.from("basket_molds").select("id,basket_id,hidden_adjustment,conditional_hidden_enabled,conditional_hidden_product_id,conditional_hidden_adjustment,public_composition_count,metadata");if(mq.error)throw mq.error;let molds=mq.data||[];if(!molds.length)return [];
  if(priorityOnly){
    const basketIds=[...new Set(molds.map((m:any)=>String(m.basket_id)))];
    const [bq,cq,sq]=await Promise.all([
      db.from("basket_templates").select("id,category_id,subcategory_id").in("id",basketIds),
      db.from("basket_categories").select("id,slug").eq("is_active",true),
      db.from("basket_subcategories").select("id,category_id,name").eq("is_active",true)
    ]);if(bq.error)throw bq.error;if(cq.error)throw cq.error;if(sq.error)throw sq.error;
    const complete=(cq.data||[]).find((c:any)=>c.slug==="cestas-completas"),largeIds=new Set((sq.data||[]).filter((s:any)=>String(s.category_id)===String(complete?.id)&&String(s.name||"").trim().toLocaleLowerCase("pt-BR")==="grande").map((s:any)=>String(s.id)));
    const largeBasketIds=new Set((bq.data||[]).filter((b:any)=>String(b.category_id)===String(complete?.id)&&largeIds.has(String(b.subcategory_id))).map((b:any)=>String(b.id)));
    molds=molds.filter((m:any)=>largeBasketIds.has(String(m.basket_id)));
  }
  if(!molds.length)return [];
  const legacySourceIds=[...new Set(molds.flatMap((m:any)=>String(m?.metadata?.transition_mode||"")==="legacy_first"&&Array.isArray(m?.metadata?.legacy_source_basket_ids)?m.metadata.legacy_source_basket_ids.map((x:any)=>String(x)).filter(Boolean):[]))];
  const legacyAvailable=new Set<string>();
  if(legacySourceIds.length){const lq=await db.from("basket_commercial_catalog_v1").select("commercial_id,public_available").eq("source_kind","basket").in("commercial_id",legacySourceIds).gt("public_available",0);if(lq.error)throw lq.error;for(const row of lq.data||[])if(Number(row.public_available||0)>0)legacyAvailable.add(String(row.commercial_id))}
  const visibleMolds=molds.filter((m:any)=>{if(String(m?.metadata?.transition_mode||"")!=="legacy_first")return true;const ids=Array.isArray(m?.metadata?.legacy_source_basket_ids)?m.metadata.legacy_source_basket_ids:[];return !ids.some((x:any)=>legacyAvailable.has(String(x)))});
  if(!visibleMolds.length)return [];
  const basketIds=visibleMolds.map((m:any)=>String(m.basket_id)),moldIds=visibleMolds.map((m:any)=>String(m.id));
  const [bq,pq]=await Promise.all([
    db.from("basket_templates").select("id,name,image_url,is_active,category_id,subcategory_id").in("id",basketIds),
    db.from("basket_mold_positions").select("id,mold_id,quantity,sort_order").in("mold_id",moldIds)
  ]);if(bq.error)throw bq.error;if(pq.error)throw pq.error;
  const baskets=new Map((bq.data||[]).map((b:any)=>[String(b.id),b])),positionCounts=new Map<string,number>(),positionsByMold=new Map<string,any[]>();for(const p of pq.data||[]){const id=String(p.mold_id);positionCounts.set(id,(positionCounts.get(id)||0)+1);const rows=positionsByMold.get(id)||[];rows.push(p);positionsByMold.set(id,rows)}
  const positionIds=(pq.data||[]).map((p:any)=>String(p.id)),optionsQ=positionIds.length?await db.from("basket_mold_position_options").select("position_id,product_id,sort_order").in("position_id",positionIds).order("sort_order").order("product_id"):({data:[],error:null} as any);if(optionsQ.error)throw optionsQ.error;
  const optionsByPosition=new Map<string,any[]>();for(const o of optionsQ.data||[]){const id=String(o.position_id),rows=optionsByPosition.get(id)||[];rows.push(o);optionsByPosition.set(id,rows)}
  const [categoryQ,subcategoryQ]=await Promise.all([
    db.from("basket_categories").select("id,name,slug,sort_order,is_active").eq("is_active",true).order("sort_order"),
    db.from("basket_subcategories").select("id,category_id,name,sort_order,is_active").eq("is_active",true).order("sort_order")
  ]);if(categoryQ.error)throw categoryQ.error;if(subcategoryQ.error)throw subcategoryQ.error;
  const categoryMap=new Map((categoryQ.data||[]).map((x:any)=>[String(x.id),x])),subcategoryMap=new Map((subcategoryQ.data||[]).map((x:any)=>[String(x.id),x]));
  const compositionMap=await moldPublicCompositions(visibleMolds.map((m:any)=>String(m.basket_id)));
  const generated=visibleMolds.map((m:any)=>({m,data:compositionMap.get(String(m.basket_id))||{}}));
  const productIds:string[]=[...(optionsQ.data||[]).map((o:any)=>String(o.product_id))];for(const g of generated)for(const c of g.data?.compositions||[])for(const i of c.items||[])if(i.product_id)productIds.push(String(i.product_id));const [products,available]=await Promise.all([moldProductsMap(productIds),moldAvailableStockMap(productIds)]);
  const configuredDefaults=moldConfiguredDefaults(optionsQ.data||[]),cards:any[]=[];
  for(const {m,data} of generated){const b=baskets.get(String(m.basket_id));if(!b||b.is_active!==true)continue;const cat=b.category_id?categoryMap.get(String(b.category_id)):null;const sub=b.subcategory_id?subcategoryMap.get(String(b.subcategory_id)):null;if(!cat||!sub||String(sub.category_id)!==String(cat.id))continue;const expected=positionCounts.get(String(m.id))||0;if(!expected)continue;
    const composition=(data.compositions||[]).find((row:any)=>Number(row.number||1)===1);
    const generatedItems=new Map<string,any>((Array.isArray(composition?.items)?composition.items:[]).map((item:any)=>[String(item.position_id),item]));
    const positionRows=(positionsByMold.get(String(m.id))||[]).slice().sort((a:any,b:any)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.id).localeCompare(String(b.id)));
    if(positionRows.length!==expected)continue;
    let capacity=30;const carousel:any[]=[];let valid=true,manualReplacementCount=0;
    for(const position of positionRows){
      const qty=Number(position.quantity||0),positionId=String(position.id),configuredOptions=optionsByPosition.get(positionId)||[];
      if(!(qty>0)||!configuredOptions.length){valid=false;break}
      const generatedItem=generatedItems.get(positionId) as any;
      const choices=configuredOptions.map((option:any)=>{
        const product=products.get(String(option.product_id)),stock=available.get(String(option.product_id))||0;
        return product?{product,stock,price:moldEffectivePriceCents(product),sort_order:Number(option.sort_order||0)}:null;
      }).filter(Boolean) as any[];
      const availableChoices=choices.filter((choice:any)=>choice.product.is_active===true&&choice.stock>=qty);
      const generatedProductId=String(generatedItem?.product_id||"");
      let selected=availableChoices.find((choice:any)=>String(choice.product.id)===generatedProductId)||availableChoices[0];
      let manualReplacementRequired=false;
      if(!selected){
        const activeChoices=choices.filter((choice:any)=>choice.product.is_active===true);
        selected=activeChoices.find((choice:any)=>String(choice.product.id)===generatedProductId)||activeChoices[0]
          ||choices.find((choice:any)=>String(choice.product.id)===generatedProductId)||choices[0];
        manualReplacementRequired=true;
      }
      if(!selected){valid=false;break}
      const p=selected.product,price=selected.price,stock=Number(selected.stock||0);
      if(p.is_active!==true||stock<qty)manualReplacementRequired=true;
      if(manualReplacementRequired)manualReplacementCount++;
      else capacity=Math.min(capacity,Math.max(1,Math.floor(stock/qty)));
      carousel.push({position_id:positionId,label:generatedItem?.label||position.label,product_id:p.id,name:p.name,brand:p.brand||"",sku:p.sku,gtin:p.gtin,image_url:p.image_url||generatedItem?.image_url||"",packaging:p.packaging||"",quantity:qty,stock_quantity:stock,price_cents:price,alternative_count:availableChoices.length,manual_replacement_required:manualReplacementRequired})
    }
    if(!valid)continue;
    const configuredBase=moldConfiguredBase(m,positionRows,configuredDefaults,products);const conditionalHidden=configuredBase.conditionalAppliedCents;const total=configuredBase.totalCents,n=Number(composition?.number||1);
    cards.push({id:String(b.id),card_key:String(b.id)+"@"+n,mold_mode:true,mold_id:String(m.id),composition_number:n,public_composition_count:Number(data.public_composition_count||1),name:String(sub.name||String(b.name).replace(/\s+Completa$/i,"")),model_name:String(sub.name||String(b.name).replace(/\s+Completa$/i,"")),display_price_cents:total,hidden_adjustment_cents:cents(m.hidden_adjustment??data.hidden_adjustment??0),conditional_hidden_enabled:m.conditional_hidden_enabled===true,conditional_hidden_product_id:m.conditional_hidden_product_id||null,conditional_hidden_adjustment_cents:cents(m.conditional_hidden_adjustment||0),conditional_hidden_applied_cents:conditionalHidden,image_url:b.image_url||"",stock_quantity:Math.max(1,capacity),manual_replacement_required:manualReplacementCount>0,manual_replacement_count:manualReplacementCount,category_id:cat.id,category_name:cat.name,category_slug:cat.slug,category_sort_order:Number(cat.sort_order||0),subcategory_id:sub.id,subcategory_name:sub.name,subcategory_sort_order:Number(sub.sort_order||0),total_item_count:basketTotalItems(carousel),carousel_items:carousel.slice(0,6)})
  }
  cards.sort((a,b)=>a.category_sort_order-b.category_sort_order||a.subcategory_sort_order-b.subcategory_sort_order||a.composition_number-b.composition_number||String(a.id).localeCompare(String(b.id)));return cards;
}
// Reuse the generator's recent choices, including compositions already loaded for home.
// Do NOT cache final basket responses: prices and sellable stock remain real-time.
async function moldDetailComposition(basketId:string){
  const now=Date.now(),cached=moldCompositionCache.get(basketId);
  if(cached&&cached.expiresAt>now&&Number.isFinite(cached.createdAt)&&now-cached.createdAt<MOLD_DETAIL_CACHE_MAX_AGE_MS)return cached.data;
  let request=moldDetailCompositionInFlight.get(basketId);
  if(!request){
    request=db.rpc("basket_mold_public_compositions_v2",{p_basket_id:basketId}).then((q:any)=>{
      if(q.error)throw q.error;
      // Fail closed: do not cache missing or invalid generator results.
      if(q.data&&Array.isArray(q.data.compositions)&&String(q.data.basket_id||"")===basketId){
        const stamp=Date.now();
        moldCompositionCache.set(basketId,{data:q.data,createdAt:stamp,expiresAt:stamp+MOLD_COMPOSITION_CACHE_TTL_MS});
      }
      return q.data;
    }).finally(()=>moldDetailCompositionInFlight.delete(basketId));
    moldDetailCompositionInFlight.set(basketId,request);
  }
  return request;
}
async function moldDetail(basketId:string,compositionNumber:number,selections:any[]|null=null,includeAlternatives=true,allowUnavailablePreview=false){
  const [gate,mq,bq,pq]=await Promise.all([
    db.rpc("basket_mold_cutover_ready_v1",{p_basket_id:basketId}),
    db.from("basket_molds").select("id,basket_id,hidden_adjustment,conditional_hidden_enabled,conditional_hidden_product_id,conditional_hidden_adjustment,public_composition_count,metadata").eq("basket_id",basketId).maybeSingle(),
    db.from("basket_templates").select("id,name,image_url,is_active").eq("id",basketId).maybeSingle(),
    moldDetailComposition(basketId)
  ]);
  if(gate.error)throw gate.error;if(gate.data!==true)return null;if(mq.error)throw mq.error;if(bq.error)throw bq.error;
  const mold=mq.data,basket=bq.data;
  if(!mold||!basket||basket.is_active!==true)return null;
  if(compositionNumber<1||compositionNumber>Number(mold.public_composition_count||1))return null;
  const posq=await db.from("basket_mold_positions").select("id,label,quantity,sort_order").eq("mold_id",mold.id).order("sort_order");
  if(posq.error)throw posq.error;
  const positions=posq.data||[];
  if(!positions.length)return null;
  const positionIds=positions.map((position:any)=>String(position.id));
  const oq=await db.from("basket_mold_position_options").select("position_id,product_id,sort_order").in("position_id",positionIds).order("sort_order").order("product_id");
  if(oq.error)throw oq.error;
  const options=oq.data||[];
  const generated=(pq?.compositions||[]).find((composition:any)=>Number(composition.number)===compositionNumber);
  const generatedItems=Array.isArray(generated?.items)?generated.items:[];
  const defaultSelected=new Map<string,string>(generatedItems.map((item:any)=>[String(item.position_id),String(item.product_id)]));
  const configuredDefaults=moldConfiguredDefaults(options);
  for(const [positionId,productId] of configuredDefaults)defaultSelected.set(positionId,productId);

  const requested=new Map<string,any>();
  if(Array.isArray(selections)){
    for(const row of selections){
      const positionId=uid(row?.position_id),productId=uid(row?.product_id);
      const hasOptions=Array.isArray(row?.options);
      const selectedOptions=hasOptions?row.options.map((option:any)=>({
        product_id:uid(option?.product_id),
        quantity:option?.quantity==null?0:Number(option.quantity)
      })):[];
      if(positionId&&(productId||hasOptions)){
        requested.set(positionId,{
          product_id:productId,
          quantity:row?.quantity==null?undefined:Number(row.quantity),
          options:selectedOptions,
          has_options:hasOptions
        });
      }
    }
  }
  if(selections&&requested.size!==positions.length)throw new Error("basket_mold_component_invalid");

  const readIds=[...new Set([...moldProductIdsForRead(positions,options,requested,defaultSelected,includeAlternatives),...defaultSelected.values(),...configuredDefaults.values()])];
  const legacyExtras=Array.isArray(mold.metadata?.optional_items)?mold.metadata.optional_items:[];
  const [products,available,extras]=await Promise.all([
    moldProductsMap(readIds),moldAvailableStockMap(readIds),publicBasketExtraThemes(legacyExtras)
  ]);
  if(!includeAlternatives){
    const needsFallbackRead=positions.some((position:any)=>{
      const positionId=String(position.id),productId=configuredDefaults.get(positionId)||"";
      const requestRow=requested.get(positionId);
      const requestedQuantity=Array.isArray(requestRow?.options)
        ?requestRow.options.reduce((sum:number,option:any)=>sum+Math.max(0,Number(option?.quantity||0)),0)
        :Number(requestRow?.quantity??position.quantity??0);
      const requiredQuantity=Math.max(1,Number(position.quantity||0),requestedQuantity);
      const product=products.get(productId);
      return product?.is_active!==true||Number(available.get(productId)||0)<requiredQuantity;
    });
    if(needsFallbackRead){
      const candidateIds=[...new Set(options.map((option:any)=>String(option.product_id||"")).filter(Boolean))]
        .filter((productId:string)=>!readIds.includes(productId));
      if(candidateIds.length){
        const [replacementProducts,replacementStock]=await Promise.all([
          moldProductsMap(candidateIds),moldAvailableStockMap(candidateIds)
        ]);
        for(const [productId,product] of replacementProducts)products.set(productId,product);
        for(const [productId,stock] of replacementStock)available.set(productId,stock);
      }
    }
  }
  for(const position of positions){
    const positionId=String(position.id),configuredId=configuredDefaults.get(positionId)||defaultSelected.get(positionId)||"";
    const configuredProduct=products.get(configuredId);
    const requestedRow=requested.get(positionId);
    const requestedQuantity=Array.isArray(requestedRow?.options)
      ?requestedRow.options.reduce((sum:number,option:any)=>sum+Math.max(0,Number(option?.quantity||0)),0)
      :Number(requestedRow?.quantity??position.quantity??0);
    const requiredQuantity=Math.max(1,Number(position.quantity||0),requestedQuantity);
    if(configuredProduct?.is_active===true&&Number(available.get(configuredId)||0)>=requiredQuantity)continue;
    const positionOptions=options.filter((option:any)=>String(option.position_id)===positionId);
    const availableDefault=moldFirstAvailableOption(positionOptions,products,available,requiredQuantity);
    if(availableDefault)defaultSelected.set(positionId,String(availableDefault.id));
    else{
      const firstActive=moldFirstConfiguredOption(positionOptions,products);
      if(firstActive)defaultSelected.set(positionId,String(firstActive.id));
      else defaultSelected.delete(positionId);
    }
  }
  const configuredBase=moldConfiguredBase(mold,positions,configuredDefaults,products);
  let initialPublicProductTotal=0,initialPublicConditionalPresent=false;
  for(const position of positions){
    const productId=defaultSelected.get(String(position.id))||"";
    const product=products.get(productId),quantity=Number(position.quantity||0);
    if(product)initialPublicProductTotal+=Math.round(moldEffectivePriceCents(product)*quantity);
    if(mold.conditional_hidden_enabled===true&&mold.conditional_hidden_product_id&&Number(mold.conditional_hidden_adjustment||0)>0&&productId===String(mold.conditional_hidden_product_id)&&quantity>0)initialPublicConditionalPresent=true;
  }
  const initialPublicConditionalCents=initialPublicConditionalPresent?cents(mold.conditional_hidden_adjustment||0):0;
  let productTotal=0,capacity=30;
  const items:any[]=[];
  const optionsByPosition=new Map<string,any[]>();
  for(const option of options){
    const positionId=String(option.position_id);
    const rows=optionsByPosition.get(positionId)||[];
    rows.push(option);
    optionsByPosition.set(positionId,rows);
  }

  for(const position of positions){
    const positionId=String(position.id),baseQuantity=Number(position.quantity||0);
    const requestedRow=requested.get(positionId);
    const linkedOptions=optionsByPosition.get(positionId)||[];
    const fallbackId=requestedRow?.product_id||defaultSelected.get(positionId)||String(linkedOptions[0]?.product_id||"");
    if(!fallbackId&&(!Array.isArray(requestedRow?.options)||!requestedRow.options.length))return null;
    const rawSelectedOptions=Array.isArray(requestedRow?.options)&&requestedRow.options.length
      ?requestedRow.options
      :[{product_id:fallbackId,quantity:requestedRow?.quantity??baseQuantity}];
    const quantitiesByProduct=new Map<string,number>();
    let unavailableQuantity=0;
    for(const selected of rawSelectedOptions){
      const productId=uid(selected?.product_id);
      const quantity=selected?.quantity==null?0:Number(selected.quantity);
      if(!productId)throw new Error("basket_mold_option_invalid");
      if(!Number.isInteger(quantity)||quantity<0||quantity>1000)throw new Error("basket_mold_component_invalid");
      if(!linkedOptions.some((option:any)=>String(option.product_id)===productId))throw new Error("basket_mold_option_invalid");
      const product=products.get(productId),stock=Number(available.get(productId)||0);
      const combined=(quantitiesByProduct.get(productId)||0)+quantity;
      if(combined>1000)throw new Error("basket_mold_component_invalid");
      if(product?.is_active===true){
        const kept=Math.min(combined,stock);
        quantitiesByProduct.set(productId,kept);
        unavailableQuantity+=combined-kept;
      }else{
        unavailableQuantity+=quantity;
      }
    }
    if(unavailableQuantity>0){
      const replacementOptions=linkedOptions.filter((option:any)=>{
        const product=products.get(String(option.product_id));
        return product?.is_active===true&&Number(available.get(String(option.product_id))||0)>0;
      }).slice().sort((a:any,b:any)=>
        Number(a.sort_order||0)-Number(b.sort_order||0)
        ||Number(available.get(String(b.product_id))||0)-Number(available.get(String(a.product_id))||0)
        ||String(a.product_id).localeCompare(String(b.product_id))
      );
      let remaining=unavailableQuantity;
      for(const option of replacementOptions){
        if(remaining<=0)break;
        const productId=String(option.product_id),stock=Number(available.get(productId)||0);
        const current=Number(quantitiesByProduct.get(productId)||0);
        const add=Math.min(remaining,Math.max(0,stock-current));
        if(add>0){
          quantitiesByProduct.set(productId,current+add);
          remaining-=add;
        }
      }
      if(remaining>0&&replacementOptions.length){
        const replacementId=String(replacementOptions[0].product_id);
        quantitiesByProduct.set(replacementId,Number(quantitiesByProduct.get(replacementId)||0)+remaining);
      }
    }
    if(!quantitiesByProduct.size){
      const availableDefaultId=defaultSelected.get(positionId)||"";
      const availableDefaultProduct=products.get(availableDefaultId);
      if(availableDefaultProduct?.is_active===true)quantitiesByProduct.set(availableDefaultId,0);
      else{
        const activeOption=linkedOptions.find((option:any)=>products.get(String(option.product_id))?.is_active===true);
        if(activeOption)quantitiesByProduct.set(String(activeOption.product_id),0);
      }
    }
    const selectedOptions:any[]=[];
    let totalQuantity=0,manualReplacementRequired=false;
    for(const [productId,quantity] of quantitiesByProduct){
      const product=products.get(productId);
      if(!product)throw new Error("basket_mold_option_invalid");
      const stock=Number(available.get(productId)||0),price=moldEffectivePriceCents(product);
      const manual=product.is_active!==true||stock<quantity;
      totalQuantity+=quantity;
      if(totalQuantity>1000)throw new Error("basket_mold_component_invalid");
      productTotal+=Math.round(price*quantity);
      manualReplacementRequired=manualReplacementRequired||manual;
      if(quantity>0&&!manual)capacity=Math.min(capacity,Math.max(1,Math.floor(stock/quantity)));
      const configuredOption=linkedOptions.find((option:any)=>String(option.product_id)===productId);
      selectedOptions.push({
        product_id:product.id,quantity,name:product.name,brand:product.brand||"",
        sku:product.sku,gtin:product.gtin,image_url:product.image_url||"",
        packaging:product.packaging||"",stock_quantity:stock,price_cents:price,
        is_active:product.is_active===true,
        sort_order:Number(configuredOption?.sort_order||0)
      });
    }
    const selectedForDisplay=selectedOptions.find((option:any)=>option.quantity>0)||selectedOptions[0];
    const alternatives=includeAlternatives
      ?linkedOptions.map((option:any)=>{
        const product=products.get(String(option.product_id)),stock=Number(available.get(String(option.product_id))||0);
        return product?.is_active===true&&(stock>0||quantitiesByProduct.has(String(product.id)))?{
          product_id:product.id,name:product.name,brand:product.brand||"",sku:product.sku,
          gtin:product.gtin,image_url:product.image_url||"",packaging:product.packaging||"",
          stock_quantity:stock,price_cents:moldEffectivePriceCents(product),is_active:true,sort_order:Number(option.sort_order||0)
        }:null;
      }).filter(Boolean).sort(compareMoldPositionOptionOrder)
      :[];
    const publicAlternatives=alternatives.slice(0,10);
    for(const selected of selectedOptions){
      if(selected.is_active===true&&!publicAlternatives.some((option:any)=>String(option.product_id)===String(selected.product_id))){
        publicAlternatives.push(selected);
      }
    }
    publicAlternatives.sort(compareMoldPositionOptionOrder);
    items.push({
      position_id:positionId,label:position.label,
      product_id:selectedForDisplay?.product_id||defaultSelected.get(positionId)||"",
      default_product_id:configuredDefaults.get(positionId)||"",
      is_active:selectedForDisplay?.is_active===true,
      name:selectedForDisplay?.name||"",brand:selectedForDisplay?.brand||"",
      sku:selectedForDisplay?.sku||null,gtin:selectedForDisplay?.gtin||null,
      image_url:selectedForDisplay?.image_url||"",packaging:selectedForDisplay?.packaging||"",
      stock_quantity:Number(selectedForDisplay?.stock_quantity||0),
      base_quantity:baseQuantity,quantity:totalQuantity,
      selected_options:selectedOptions,
      price_cents:Number(selectedForDisplay?.price_cents||0),
      alternative_count:includeAlternatives?alternatives.length:linkedOptions.length,
      alternatives_loaded:includeAlternatives,alternatives:publicAlternatives,
      manual_replacement_required:manualReplacementRequired
    });
  }
  if(capacity<1&&!allowUnavailablePreview)return null;
  const conditionalHidden=mold.conditional_hidden_enabled===true&&mold.conditional_hidden_product_id
    &&Number(mold.conditional_hidden_adjustment||0)>0
    &&items.some((item:any)=>Array.isArray(item.selected_options)&&item.selected_options.some((option:any)=>
      String(option.product_id)===String(mold.conditional_hidden_product_id)&&Number(option.quantity||0)>0))
      ?cents(mold.conditional_hidden_adjustment||0):0;
  const selectionDeltaCents=productTotal-initialPublicProductTotal;
  const conditionalDeltaCents=conditionalHidden-initialPublicConditionalCents;
  const totalCents=Math.max(0,configuredBase.totalCents+selectionDeltaCents+conditionalDeltaCents);
  return {
    basket:{
      id:basket.id,name:String(basket.name).replace(/\s+Completa$/i,""),
      image_url:basket.image_url||"",mold_mode:true,mold_id:mold.id,
      composition_number:compositionNumber,public_composition_count:Number(mold.public_composition_count||1),
      hidden_adjustment_cents:cents(mold.hidden_adjustment||0),
      conditional_hidden_enabled:mold.conditional_hidden_enabled===true,
      conditional_hidden_product_id:mold.conditional_hidden_product_id||null,
      conditional_hidden_adjustment_cents:cents(mold.conditional_hidden_adjustment||0),
      conditional_hidden_applied_cents:conditionalHidden,
      display_price_cents:totalCents,stock_quantity:capacity
    },
    items,extras
  };
}
// Read the available brands of one basket position only when requested by the customer.
function compareMoldPositionOptionOrder(a:any,b:any){
  const aOrder=Number(a.sort_order||0),bOrder=Number(b.sort_order||0);
  const aDefault=aOrder===0?0:1,bDefault=bOrder===0?0:1;
  return aDefault-bDefault
    ||Number(b.stock_quantity||0)-Number(a.stock_quantity||0)
    ||aOrder-bOrder
    ||String(a.product_id||"").localeCompare(String(b.product_id||""));
}
async function moldPositionOptions(basketId:string,compositionNumber:number,positionId:string,selectedProductIdsRaw:string,requestedQuantity:number,offset:number){
  const id=uid(basketId),position=uid(positionId);
  const selectedIds=new Set(String(selectedProductIdsRaw||"").split(",").map((value)=>uid(value)).filter(Boolean));
  if(!id||!position||!Number.isInteger(compositionNumber)||compositionNumber<1||compositionNumber>6||!Number.isInteger(requestedQuantity)||requestedQuantity<0||requestedQuantity>1000)return {error:"invalid_basket_mold_options",status:400};
  const [ready,mq,bq]=await Promise.all([
    db.rpc("basket_mold_cutover_ready_v1",{p_basket_id:id}),
    db.from("basket_molds").select("id,public_composition_count").eq("basket_id",id).maybeSingle(),
    db.from("basket_templates").select("id,is_active").eq("id",id).maybeSingle()
  ]);
  if(ready.error)throw ready.error;if(mq.error)throw mq.error;if(bq.error)throw bq.error;
  const mold=mq.data;
  if(ready.data!==true||!mold||bq.data?.is_active!==true||compositionNumber>Number(mold.public_composition_count||1))return {error:"basket_mold_unavailable",status:404};
  const pq=await db.from("basket_mold_positions").select("id,quantity").eq("id",position).eq("mold_id",mold.id).maybeSingle();
  if(pq.error)throw pq.error;if(!pq.data)return {error:"basket_mold_position_not_found",status:404};
  const oq=await db.from("basket_mold_position_options").select("product_id,sort_order").eq("position_id",position).order("sort_order");
  if(oq.error)throw oq.error;
  const ids=(oq.data||[]).map((row:any)=>String(row.product_id));
  const [products,stock]=await Promise.all([moldProductsMap(ids),moldAvailableStockMap(ids)]);
  const alternatives=(oq.data||[]).map((row:any)=>{
    const product=products.get(String(row.product_id)),available=stock.get(String(row.product_id))||0;
    return product?.is_active===true&&(available>0||selectedIds.has(String(product.id)))?{
      product_id:product.id,name:product.name,brand:product.brand||"",sku:product.sku,gtin:product.gtin,
      image_url:product.image_url||"",packaging:product.packaging||"",stock_quantity:available,
      price_cents:moldEffectivePriceCents(product),sort_order:Number(row.sort_order||0)
    }:null;
  }).filter(Boolean) as any[];
  alternatives.sort(compareMoldPositionOptionOrder);
  const safeOffset=Math.max(0,Math.min(Math.trunc(offset||0),Math.max(0,alternatives.length-1)));
  const shown=alternatives.slice(safeOffset,safeOffset+10);
  return {ok:true,alternatives:shown,alternative_count:alternatives.length,offset:safeOffset,next_offset:safeOffset+shown.length<alternatives.length?safeOffset+shown.length:null};
}
async function moldPositionOptionsBatch(basketId:string,compositionNumber:number,requestedPositions:any[]){
  const id=uid(basketId),requests=Array.isArray(requestedPositions)?requestedPositions:[];
  if(!id||!Number.isInteger(compositionNumber)||compositionNumber<1||compositionNumber>6||!requests.length||requests.length>24)return {error:"invalid_basket_mold_options",status:400};
  const normalized=requests.map((row:any)=>{
    const rawSelected=Array.isArray(row?.selected_product_ids)?row.selected_product_ids:
      String(row?.selected_product_ids||row?.selected_product_id||"").split(",");
    const selectedIds=[...new Set(rawSelected.map((value:any)=>uid(value)).filter(Boolean))];
    return {
      position_id:uid(row?.position_id),
      selected_product_ids:selectedIds,
      quantity:row?.quantity==null?null:Number(row.quantity)
    };
  });
  if(normalized.some((row:any)=>!row.position_id||(row.quantity!==null&&(!Number.isInteger(row.quantity)||row.quantity<0||row.quantity>1000))))return {error:"invalid_basket_mold_options",status:400};
  const positionIds=normalized.map((row:any)=>row.position_id);
  if(new Set(positionIds).size!==positionIds.length)return {error:"invalid_basket_mold_options",status:400};
  const [ready,mq,bq]=await Promise.all([
    db.rpc("basket_mold_cutover_ready_v1",{p_basket_id:id}),
    db.from("basket_molds").select("id,public_composition_count").eq("basket_id",id).maybeSingle(),
    db.from("basket_templates").select("id,is_active").eq("id",id).maybeSingle()
  ]);
  if(ready.error)throw ready.error;if(mq.error)throw mq.error;if(bq.error)throw bq.error;
  const mold=mq.data;
  if(ready.data!==true||!mold||bq.data?.is_active!==true||compositionNumber>Number(mold.public_composition_count||1))return {error:"basket_mold_unavailable",status:404};
  const pq=await db.from("basket_mold_positions").select("id,quantity").eq("mold_id",mold.id).in("id",positionIds);
  if(pq.error)throw pq.error;
  const positionMap=new Map((pq.data||[]).map((row:any)=>[String(row.id),row]));
  if(positionMap.size!==positionIds.length)return {error:"basket_mold_position_not_found",status:404};
  const oq=await db.from("basket_mold_position_options").select("position_id,product_id,sort_order").in("position_id",positionIds).order("sort_order").order("product_id");
  if(oq.error)throw oq.error;
  const optionRows=oq.data||[],productIds=[...new Set(optionRows.map((row:any)=>String(row.product_id)))];
  const [products,stock]=await Promise.all([moldProductsMap(productIds),moldAvailableStockMap(productIds)]);
  const byPosition=new Map<string,any[]>();
  for(const row of optionRows){const key=String(row.position_id),items=byPosition.get(key)||[];items.push(row);byPosition.set(key,items)}
  const positions=normalized.map((request:any)=>{
    const alternatives=(byPosition.get(request.position_id)||[]).map((option:any)=>{
      const product=products.get(String(option.product_id)),available=stock.get(String(option.product_id))||0;
      return product?.is_active===true&&(available>0||request.selected_product_ids.includes(String(product.id)))?{
        product_id:product.id,name:product.name,sku:product.sku,gtin:product.gtin,
        image_url:product.image_url||"",packaging:product.packaging||"",
        stock_quantity:available,price_cents:moldEffectivePriceCents(product),is_active:true,sort_order:Number(option.sort_order||0)
      }:null;
    }).filter(Boolean) as any[];
    alternatives.sort(compareMoldPositionOptionOrder);
    return {position_id:request.position_id,alternatives:alternatives.slice(0,10),alternative_count:alternatives.length};
  });
  return {ok:true,positions};
}
async function moldQuote(payload:any){
  const id=uid(payload?.basket_id),n=Math.trunc(Number(payload?.composition_number||1)),allowUnavailablePreview=payload?.allow_unavailable_preview===true;
  if(!id)return {error:"invalid_basket",status:400};
  try{
    const d=await moldDetail(id,n,Array.isArray(payload?.items)?payload.items:[],payload?.lightweight!==true,allowUnavailablePreview);
    if(!d)return {error:"basket_mold_unavailable",status:409};
    return {ok:true,total_cents:d.basket.display_price_cents,basket:d.basket,items:d.items,extras:d.extras};
  }catch(e:any){const code=txt(e?.message,100);return {error:["basket_mold_option_invalid","basket_mold_component_invalid"].includes(code)?code:"basket_mold_unavailable",status:409}}
}

// The catalog view computes lot availability for every basket. It is unnecessary when
// every active basket is explicitly configured as a mold-only basket. Avoiding this
// expensive view prevents PostgreSQL statement timeouts on public home requests.
async function needsLegacyBasketCatalog():Promise<boolean>{
  const [tq,mq]=await Promise.all([
    db.from("basket_templates").select("id,category_id,subcategory_id").eq("is_active",true),
    db.from("basket_molds").select("basket_id,metadata")
  ]);
  if(tq.error)throw tq.error;if(mq.error)throw mq.error;
  const moldOnly=new Set((mq.data||[]).filter((m:any)=>String(m?.metadata?.transition_mode||"")==="mold_only").map((m:any)=>String(m.basket_id)));
  return (tq.data||[]).some((t:any)=>Boolean(t.category_id&&t.subcategory_id)&&!moldOnly.has(String(t.id)));
}
async function home(priorityOnly=false){
  const [moldCards,needsLegacy]=await Promise.all([moldHomeCards(priorityOnly),needsLegacyBasketCatalog()]);
  const moldBasketIds=new Set(moldCards.map((x:any)=>String(x.id)));
  const [catalogQ,categoriesQ,subcategoriesQ]=await Promise.all([
    needsLegacy?db.from("basket_commercial_catalog_v1").select("*").eq("source_kind","basket").gt("public_available",0).order("category_sort_order").order("public_name"):Promise.resolve({data:[],error:null}),
    db.from("basket_categories").select("id,name,slug,sort_order,is_active").eq("is_active",true).order("sort_order"),
    db.from("basket_subcategories").select("id,category_id,name,sort_order,is_active").eq("is_active",true).order("sort_order")
  ]);
  if(catalogQ.error)throw catalogQ.error;if(categoriesQ.error)throw categoriesQ.error;if(subcategoriesQ.error)throw subcategoriesQ.error;
  const categories=categoriesQ.data||[],subcategories=subcategoriesQ.data||[],categoryMap=new Map(categories.map((x:any)=>[String(x.id),x])),subcategoryMap=new Map(subcategories.map((x:any)=>[String(x.id),x]));
  const candidates=(catalogQ.data||[]).filter((x:any)=>x.model_active===true&&x.category_active===true&&x.public_lot_id&&Number(x.public_available||0)>0&&!moldBasketIds.has(String(x.commercial_id)));
  const templateIds=[...new Set(candidates.map((x:any)=>String(x.basket_id||x.commercial_id)).filter(Boolean))];
  const templatesQ=templateIds.length?await db.from("basket_templates").select("id,category_id,subcategory_id").in("id",templateIds):{data:[],error:null};
  if(templatesQ.error)throw templatesQ.error;
  const templateMap=new Map((templatesQ.data||[]).map((x:any)=>[String(x.id),x]));
  const rows=candidates.filter((x:any)=>{const t=templateMap.get(String(x.basket_id||x.commercial_id));const c=categoryMap.get(String(t?.category_id||x.category_id||""));const sub=subcategoryMap.get(String(t?.subcategory_id||""));return Boolean(c&&sub&&String(sub.category_id)===String(c.id)&&(!priorityOnly||(c.slug==="cestas-completas"&&String(sub.name||"").trim().toLocaleLowerCase("pt-BR")==="grande")))});
  const images=await basketImageMap(rows.map((x:any)=>String(x.public_lot_id||"")).filter(Boolean));
  const baskets=rows.map((x:any)=>{
    const t=templateMap.get(String(x.basket_id||x.commercial_id)),category=categoryMap.get(String(t?.category_id||x.category_id||"")),subcategory=subcategoryMap.get(String(t?.subcategory_id||""));
    const linked=x.linked_lot_id||null,split=String(x.public_lot_kind||"")==="food"||Boolean(linked),lot=String(x.public_lot_id||"");
    return {
      id:x.commercial_id,source_kind:x.source_kind,name:x.public_name||x.model_name,
      category_id:category.id,category_name:category.name,category_slug:category.slug,category_sort_order:Number(category.sort_order||0),
      subcategory_id:subcategory.id,subcategory_name:subcategory.name,subcategory_sort_order:Number(subcategory.sort_order||0),
      display_price_cents:cents(x.sale_price),image_url:images.get(lot+":"+(linked||""))||x.image_url||"",
      stock_quantity:Number(x.public_available||0),availability_reason:x.availability_reason||"available",split_mode:split,
      ...(split?{food_lot_id:lot,food_lot_code:x.public_lot_code||"",food_lot_quantity:Number(x.public_available||0),hygiene_lot_id:linked,hygiene_lot_code:"",hygiene_lot_quantity:Number(x.linked_available||0),uses_hygiene_kit:Boolean(linked)}:{lot_id:lot,lot_code:x.public_lot_code||x.public_internal_lot_code||""})
    };
  });
  const basketTaxonomy=categories.map((c:any)=>({...c,subcategories:subcategories.filter((s:any)=>String(s.category_id)===String(c.id)).map((s:any)=>({id:s.id,category_id:s.category_id,name:s.name,sort_order:s.sort_order}))}));
  const allBaskets=[...moldCards,...await basketCarouselItems(baskets)].sort((a:any,b:any)=>Number(a.category_sort_order||0)-Number(b.category_sort_order||0)||Number(a.subcategory_sort_order||0)-Number(b.subcategory_sort_order||0)||Number(a.composition_number||0)-Number(b.composition_number||0));
  return {ok:true,version:"canonical-basket-commerce-v1",priority:priorityOnly,split_kits:baskets.some((b:any)=>b.split_mode===true),baskets:allBaskets,categories:CATEGORIES,basket_categories:basketTaxonomy};
}
// R2: Persist a public, read-only catalog snapshot between Edge Function instances.
// Never trust snapshot prices/stock when quoting a basket or submitting an order.
function isValidPublicHome(value:any):boolean{
  // An empty current catalog is valid: it clears stale cards for baskets that cannot be sold.
  return Boolean(value?.ok===true&&value?.priority!==true&&Array.isArray(value.baskets)&&Array.isArray(value.basket_categories));
}

async function homeSizeCards(){
  const [categoriesQ,subcategoriesQ]=await Promise.all([
    db.from("basket_categories").select("id,name,slug,sort_order,is_active").eq("is_active",true).order("sort_order"),
    db.from("basket_subcategories").select("id,category_id,name,sort_order,is_active").eq("is_active",true).order("sort_order")
  ]);
  if(categoriesQ.error)throw categoriesQ.error;if(subcategoriesQ.error)throw subcategoriesQ.error;
  const categories=categoriesQ.data||[],subcategories=subcategoriesQ.data||[];
  const complete=categories.find((c:any)=>String(c.slug||"")==="cestas-completas");
  if(!complete)throw new Error("home_size_category_missing");
  const sizeOrder=["economica","mini","pequena","media","grande"];
  const keyOf=(value:any)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
  const sizes=subcategories.filter((s:any)=>String(s.category_id)===String(complete.id)&&sizeOrder.includes(keyOf(s.name))).sort((a:any,b:any)=>sizeOrder.indexOf(keyOf(a.name))-sizeOrder.indexOf(keyOf(b.name)));
  const templatesQ=await db.from("basket_templates").select("id,name,image_url,is_active,category_id,subcategory_id,sort_order").eq("is_active",true).eq("category_id",complete.id).order("sort_order");
  if(templatesQ.error)throw templatesQ.error;
  const templates=templatesQ.data||[],templateIds=templates.map((t:any)=>String(t.id));
  const moldsQ=templateIds.length?await db.from("basket_molds").select("id,basket_id,metadata").in("basket_id",templateIds):{data:[],error:null} as any;
  if(moldsQ.error)throw moldsQ.error;
  const molds=new Map((moldsQ.data||[]).map((m:any)=>[String(m.basket_id),m]));
  const sizeCards:any[]=[];
  for(const sub of sizes){
    const template=templates.find((t:any)=>String(t.subcategory_id)===String(sub.id)&&molds.has(String(t.id)));
    if(!template)continue;
    const mold=molds.get(String(template.id)) as any;
    if(String(mold?.metadata?.transition_mode||"")==="legacy_first")continue;
    const key=keyOf(sub.name);
    sizeCards.push({id:String(template.id),card_key:String(template.id)+"@1",name:String(sub.name||template.name||"Cesta"),model_name:String(sub.name||template.name||"Cesta"),image_url:template.image_url||"",category_id:String(complete.id),category_name:complete.name,category_slug:complete.slug,category_sort_order:Number(complete.sort_order||0),subcategory_id:String(sub.id),subcategory_name:sub.name,subcategory_sort_order:Number(sub.sort_order||0),size_key:key,size_card:true,home_shell:true,mold_mode:true});
  }
  if(sizeCards.length!==sizeOrder.length)throw new Error("home_size_cards_incomplete");
  return {ok:true,version:"home-size-shell-v1",priority:false,home_size_cards:true,baskets:sizeCards,categories:CATEGORIES,basket_categories:[{...complete,subcategories:sizes}]};
}


async function homeCatalogCards(){
  const shell=await homeSizeCards();
  const baskets=await Promise.all((shell.baskets||[]).map(async(card:any)=>{
    const base={id:String(card.id),name:String(card.name||"Cesta básica"),size_key:String(card.size_key||""),image_url:String(card.image_url||"")};
    const match=String(card.card_key||"").match(/^([0-9a-f-]{36})@([1-6])$/i);
    if(!match)return {...base,display_price_cents:null,stock_quantity:0};
    try{
      const detail=await moldDetail(match[1],Number(match[2]),null,false,true);
      return {...base,display_price_cents:detail?.basket?.display_price_cents??null,stock_quantity:Number(detail?.basket?.stock_quantity||0)};
    }catch(error){
      console.error("home_catalog_card",String(card.size_key||""),txt((error as any)?.message,120));
      return {...base,display_price_cents:null,stock_quantity:0};
    }
  }));
  return {ok:true,version:"home-catalog-cards-v1",baskets};
}

function priorityFromPublicHome(full:any){
  const group=(full.basket_categories||[]).find((c:any)=>c.slug==="cestas-completas");
  const largeIds=new Set((group?.subcategories||[]).filter((s:any)=>String(s.name||"").trim().toLocaleLowerCase("pt-BR")==="grande").map((s:any)=>String(s.id)));
  return {...full,priority:true,baskets:(full.baskets||[]).filter((b:any)=>String(b.category_id)===String(group?.id)&&largeIds.has(String(b.subcategory_id)))};
}
function keepHomeInMemory(value:any,ttlMs=HOME_CACHE_TTL_MS){
  homeCache={expiresAt:Date.now()+ttlMs,data:value};
  return value;
}
async function readPublicHomeSnapshot(){
  const {data,error}=await db.from(HOME_SNAPSHOT_TABLE).select("payload,generated_at").eq("snapshot_key","home").maybeSingle();
  if(error)throw error;
  return data;
}
function parsePublicHomeSnapshot(row:any){
  if(!isValidPublicHome(row?.payload))return null;
  const timestamp=Date.parse(String(row.generated_at||""));
  if(!Number.isFinite(timestamp))return null;
  return {data:row.payload,ageMs:Math.max(0,Date.now()-timestamp)};
}
async function claimPublicHomeRefresh():Promise<string|null>{
  const now=Date.now(),token=crypto.randomUUID();
  const {data,error}=await db.from(HOME_SNAPSHOT_TABLE)
    .update({refresh_token:token,refresh_lease_until:new Date(now+HOME_SNAPSHOT_LEASE_MS).toISOString()})
    .eq("snapshot_key","home").lt("refresh_lease_until",new Date(now).toISOString())
    .select("snapshot_key").maybeSingle();
  if(error)throw error;
  return data?token:null;
}
async function releasePublicHomeRefresh(token:string){
  const {error}=await db.from(HOME_SNAPSHOT_TABLE)
    .update({refresh_token:null,refresh_lease_until:new Date(0).toISOString()})
    .eq("snapshot_key","home").eq("refresh_token",token);
  if(error)console.warn("storefront-home-release-lease",error.message);
}
async function rebuildPublicHomeSnapshot():Promise<any|null>{
  const token=await claimPublicHomeRefresh();
  if(!token)return null; // Another instance holds the lease; do not duplicate costly work.
  try{
    const full=await home(false);
    if(!isValidPublicHome(full))throw new Error("storefront_home_snapshot_invalid");
    const {data,error}=await db.from(HOME_SNAPSHOT_TABLE)
      .update({payload:full,generated_at:new Date().toISOString(),refresh_token:null,refresh_lease_until:new Date(0).toISOString()})
      .eq("snapshot_key","home").eq("refresh_token",token)
      .select("snapshot_key").maybeSingle();
    if(error)throw error;
    // Another instance may have acquired the lease after expiry; do not overwrite its cache.
    if(data)return keepHomeInMemory(full);
    return full;
  }finally{
    await releasePublicHomeRefresh(token);
  }
}
function refreshPublicHomeInBackground(){
  if(homeRefreshPromise||Date.now()<homeRefreshNextAttemptAt)return;
  homeRefreshNextAttemptAt=Date.now()+30_000;
  const task=(async()=>{
    try{await rebuildPublicHomeSnapshot()}
    catch(error){console.error("storefront-home-background-refresh",error)}
  })().finally(()=>{homeRefreshPromise=null});
  homeRefreshPromise=task;
  // Supabase keeps the worker alive while the refresh completes, without delaying visitors.
  if(typeof EdgeRuntime!=="undefined")EdgeRuntime.waitUntil(task);
}
async function loadPublicHome(){
  let stored:any=null;
  try{stored=parsePublicHomeSnapshot(await readPublicHomeSnapshot())}
  catch(error){console.warn("storefront-home-snapshot-read",error)}
  if(stored&&stored.ageMs<HOME_SNAPSHOT_MAX_STALE_MS){
    const stale=stored.ageMs>=HOME_CACHE_TTL_MS;
    const response=stale?{...stored.data,catalog_stale:true}:stored.data;
    keepHomeInMemory(response,stale?15_000:Math.max(5_000,HOME_CACHE_TTL_MS-stored.ageMs));
    if(stale)refreshPublicHomeInBackground();
    return response;
  }
  try{
    const rebuilt=await rebuildPublicHomeSnapshot();
    if(rebuilt)return rebuilt;
    // A different cold instance is preparing the first snapshot; wait briefly for it.
    for(const ms of [300,500,800,1400,2000]){
      await new Promise(resolve=>setTimeout(resolve,ms));
      const row=parsePublicHomeSnapshot(await readPublicHomeSnapshot());
      if(row)return keepHomeInMemory(row.data,15_000);
    }
    // Graceful fallback if the lease holder has stalled: do not leave the store blank.
    return keepHomeInMemory(await home(false),30_000);
  }catch(error){
    if(stored)return keepHomeInMemory({...stored.data,catalog_stale:true},15_000);
    if(homeCache?.data)return {...homeCache.data,catalog_stale:true};
    throw error;
  }
}
async function cachedHome(){
  if(homeCache&&homeCache.expiresAt>Date.now())return homeCache.data;
  if(!homePromise)homePromise=loadPublicHome().finally(()=>{homePromise=null});
  return homePromise;
}
async function cachedHomePriority(){
  // Both public endpoints share the same snapshot and cold-build promise.
  return priorityFromPublicHome(await cachedHome());
}
const POSTGREST_IN_BATCH_SIZE=100;
async function queryRowsByIds(table:string,column:string,ids:string[],selection:string,configure:(query:any)=>any=(query:any)=>query):Promise<any[]>{
  const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return [];
  const batches:string[][]=[];
  for(let i=0;i<unique.length;i+=POSTGREST_IN_BATCH_SIZE)batches.push(unique.slice(i,i+POSTGREST_IN_BATCH_SIZE));
  const results=await Promise.all(batches.map(async(batch:string[])=>{
    const query=configure(db.from(table).select(selection).in(column,batch));
    const {data,error}=await query;if(error)throw error;return data||[];
  }));
  return results.flat();
}
async function sellableMap(ids:string[]){
  const out=new Map<string,number>();if(!ids.length)return out;
  const rows=await queryRowsByIds("storefront_product_sellable_stock_v1","product_id",ids,"product_id,sellable_stock");
  for(const r of rows)out.set(String(r.product_id),Math.max(0,Number(r.sellable_stock||0)));return out;
}
async function eanCaptureProductIds(){
  const {data,error}=await db.from("ean_capture_records_v1").select("matched_product_id,created_at").eq("sync_status","found").not("matched_product_id","is",null).order("created_at",{ascending:false}).limit(10000);
  if(error)throw error;const seen=new Set<string>(),ids:string[]=[];
  for(const row of data||[]){const id=String(row.matched_product_id||"");if(id&&!seen.has(id)){seen.add(id);ids.push(id)}}
  return ids;
}
async function offerList(){
  const rows=(await activeProductRows("id,sku,gtin,name,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit,metadata,is_active"))
    .filter((p:any)=>p.is_offer===true&&p.offer_price!=null)
    .sort((a:any,b:any)=>String(a.name||"").localeCompare(String(b.name||""),"pt-BR")).slice(0,200);
  const sm=await orderableProductStockMap(rows.map((p:any)=>p.id));
  return {ok:true,offers:rows.map((p:any)=>({...pub(p,sm.get(p.id)||0),product_id:p.id,offer_priority:p.metadata?.offer_source==="auto_expiry"?0:1})).filter((p:any)=>p.stock_quantity>0&&p.price_available).sort((a:any,b:any)=>a.offer_priority-b.offer_priority||a.name.localeCompare(b.name,"pt-BR")).slice(0,160)};
}
async function activeProductRows(selection:string,category="",subcategory=""):Promise<any[]>{
  const rows:any[]=[],pageSize=500;
  for(let from=0;from<10000;from+=pageSize){
    let query:any=db.from("products").select(selection).eq("is_active",true);
    if(category)query=query.eq("sales_category",category);
    if(subcategory)query=query.eq("customer_subsubcategory",subcategory);
    const {data,error}=await query.order("name",{ascending:true}).order("id",{ascending:true}).range(from,from+pageSize-1);
    if(error)throw error;
    rows.push(...(data||[]));
    if((data||[]).length<pageSize)break;
  }
  return rows;
}
async function subcats(url:URL){
  const c=txt(url.searchParams.get("category"),48);if(!c)return {ok:true,subcategories:[]};
  const data=await activeProductRows("customer_subsubcategory,subcategory",c);
  const m=new Map<string,number>();for(const p of data){const n=txt(p.customer_subsubcategory||p.subcategory,100);if(n)m.set(n,(m.get(n)||0)+1)}
  return {ok:true,subcategories:[...m.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"pt-BR"))};
}
async function productList(url:URL){
  const c=txt(url.searchParams.get("category"),48),sc=txt(url.searchParams.get("subcategory"),100),rawQuery=safeQ(url.searchParams.get("q")),limit=Math.floor(clamp(url.searchParams.get("limit")||24,1,36)),offset=Math.floor(clamp(url.searchParams.get("offset")||0,0,5000));
  const fold=(value:any)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g," ").trim();
  const isMostSoldCategory=fold(c)==="mais vendidos";
  const queryText=fold(rawQuery),terms=queryText.split(/\s+/).filter(Boolean).slice(0,4);
  const requestedCategories=String(url.searchParams.get("categories")||"").split(",").slice(0,16).map(value=>txt(value,48).toLocaleLowerCase("pt-BR")).filter(Boolean),allowedCategories=new Set(CATEGORIES.map(category=>category.key)),categories=Array.from(new Set(requestedCategories.filter(category=>allowedCategories.has(category)))).slice(0,4);
  if(!c&&requestedCategories.length&&!categories.length)return {ok:true,products:[],next_offset:null};
  const data=await activeProductRows("id,sku,gtin,name,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit,is_active,sales_category,storefront_featured,tags,sort_order",isMostSoldCategory?"":c,sc);
  const categoryFiltered=isMostSoldCategory?data:(c||categories.length?data.filter((p:any)=>c?String(p.sales_category||"")===c:categories.includes(String(p.sales_category||"").toLocaleLowerCase("pt-BR"))):data);
  const isMostSoldProduct=(p:any)=>p?.storefront_featured===true||(Array.isArray(p?.tags)&&p.tags.some((tag:any)=>fold(tag)==="mais vendidos"));
  const matches=(p:any)=>{
    if(isMostSoldCategory&&!isMostSoldProduct(p))return false;
    if(!terms.length)return true;
    const fields=[p.name,p.brand,p.gtin,p.sku,p.packaging].map(fold);
    return terms.every(token=>fields.some(field=>field.includes(token)));
  };
  const byId=new Map(categoryFiltered.filter(matches).map((p:any)=>[String(p.id),p]));
  const ordered=Array.from(byId.keys());
  if(isMostSoldCategory&&!terms.length){
    ordered.sort((a,b)=>Number(byId.get(a)?.sort_order||0)-Number(byId.get(b)?.sort_order||0)||String(byId.get(a)?.name||"").localeCompare(String(byId.get(b)?.name||""),"pt-BR"));
  }else if(terms.length){
    const rank=(id:string)=>{
      const p:any=byId.get(id),name=fold(p?.name),brand=fold(p?.brand),code=fold((p?.gtin||"")+" "+(p?.sku||""));
      if(name===queryText)return 0;
      if(name.startsWith(queryText))return 1;
      if(name.includes(queryText))return 2;
      return 10+terms.reduce((score,token)=>score+(name.startsWith(token)?0:name.includes(token)?1:brand.includes(token)?2:code.includes(token)?3:4),0);
    };
    ordered.sort((a,b)=>rank(a)-rank(b)||String(byId.get(a)?.name||"").localeCompare(String(byId.get(b)?.name||""),"pt-BR"));
  }
  // Apenas itens ativos, com estoque vendável e preço válido entram na vitrine.
  const publicRows:any[]=[];
  let cursor=offset;
  while(cursor<ordered.length&&publicRows.length<limit){
    const chunk=ordered.slice(cursor,cursor+Math.max(24,limit+12));
    const sm=await orderableProductStockMap(chunk);
    for(const id of chunk){
      cursor++;
      const p=byId.get(id);
      if(!p||p.is_active!==true)continue;
      const candidate=pub(p,sm.get(id)||0);
      if(candidate.stock_quantity>0&&candidate.price_available)publicRows.push(candidate);
      if(publicRows.length>=limit)break;
    }
  }
  return {ok:true,products:publicRows,next_offset:cursor<ordered.length?cursor:null};
}
async function oneProduct(id:string){
  const {data:p,error}=await db.from("products").select("id,sku,gtin,name,description_short,description_long,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit,is_active").eq("id",id).maybeSingle();
  if(error)throw error;if(!p||p.is_active!==true)return null;
  const sm=await orderableProductStockMap([id]),o=pub(p,sm.get(id)||0);
  if(o.stock_quantity<=0||!o.price_available)return null;
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
  const {data:c,error}=await db.from("basket_commercial_catalog_v1").select("*").eq("source_kind","basket").eq("commercial_id",id).maybeSingle();
  if(error)throw error;if(!c||c.model_active!==true||c.category_active!==true||!c.public_lot_id||Number(c.public_available||0)<=0)return null;
  const mainLot=String(c.public_lot_id),linked=c.linked_lot_id?String(c.linked_lot_id):"",split=String(c.public_lot_kind||"")==="food"||Boolean(linked);
  const extras=await publicBasketExtraThemes();
  if(split){
    const food=await splitLotItems(mainLot,"food"),hygiene=linked?await splitLotItems(linked,"hygiene"):[];
    return {basket:{id:c.commercial_id,name:c.public_name||c.model_name,category_name:c.category_name||null,category_slug:c.category_slug||null,
      display_price_cents:cents(c.sale_price),image_url:await basketLotImage(mainLot,linked||null,c.image_url||""),
      split_mode:true,stock_quantity:Number(c.public_available||0),availability_reason:c.availability_reason||"available",
      food_lot_id:mainLot,food_lot_code:c.public_lot_code||"",food_lot_quantity:Number(c.public_available||0),
      hygiene_lot_id:linked||null,hygiene_lot_code:"",hygiene_lot_quantity:Number(c.linked_available||0),uses_hygiene_kit:Boolean(linked)},items:[...food,...hygiene],extras};
  }
  const {data:items,error:ie}=await db.from("basket_stock_lot_items")
    .select("id,product_id,quantity_per_basket,position_order,source_template_item_id,product:products(id,name,image_url,packaging,is_active,price),rule:basket_template_items(id,removable,quantity_editable,min_quantity,max_quantity,remove_unit_delta,add_unit_delta)")
    .eq("lot_id",mainLot).order("position_order");if(ie)throw ie;
  const ids=(items||[]).map((i:any)=>i.product_id),sm=await sellableMap(ids);
  return {basket:{id:c.commercial_id,name:c.public_name||c.model_name,category_name:c.category_name||null,category_slug:c.category_slug||null,
      display_price_cents:cents(c.sale_price),image_url:await basketLotImage(mainLot,null,c.image_url||""),
      split_mode:false,lot_id:mainLot,lot_code:c.public_lot_code||c.public_internal_lot_code||"",stock_quantity:Number(c.public_available||0),availability_reason:c.availability_reason||"available"},
    items:(items||[]).map((i:any)=>{const product:any=Array.isArray(i.product)?i.product[0]:i.product,rule:any=Array.isArray(i.rule)?i.rule[0]:i.rule,base=Number(i.quantity_per_basket||0),extra=product?.is_active===false?0:(sm.get(i.product_id)||0),configuredMax=rule?.max_quantity==null?base+Math.floor(extra):Number(rule.max_quantity);return {
      product_id:i.product_id,name:product?.name||"Produto",image_url:product?.image_url||"",packaging:product?.packaging||"",
      stock_quantity:extra,extra_stock_quantity:extra,base_quantity:base,quantity:base,removable:rule?.removable!==false,
      quantity_editable:rule?.quantity_editable!==false,min_quantity:Number(rule?.min_quantity??0),max_quantity:Math.max(base,configuredMax),
      remove_unit_delta:rule?.remove_unit_delta==null?null:Number(rule.remove_unit_delta),add_unit_delta:rule?.add_unit_delta==null?null:Number(rule.add_unit_delta),
      regular_price:Number(product?.price||0),template_item_id:i.source_template_item_id||null,component_group:"legacy",preassembled:true
    }}),extras};
}
function groupChanged(items:any[],group:string){
  return items.filter(x=>x.component_group===group).some(x=>Number(x.quantity||0)!==Number(x.base_quantity||0));
}
async function quote(payload:any){
  const id=uid(payload?.basket_id);if(!id)return {error:"invalid_basket",status:400};
  const {data:c,error:ce}=await db.from("basket_commercial_catalog_v1").select("*").eq("source_kind","basket").eq("commercial_id",id).maybeSingle();
  if(ce)throw ce;if(!c||!c.public_lot_id||Number(c.public_available||0)<=0||c.availability_reason!=="available")return {error:"basket_lot_unavailable",status:409};
  const mainLot=String(c.public_lot_id),linked=c.linked_lot_id?String(c.linked_lot_id):"",split=String(c.public_lot_kind||"")==="food"||Boolean(linked);
  if(split){
    const requestedFood=uid(payload?.food_lot_id);if(!requestedFood||requestedFood!==mainLot)return {error:"basket_food_lot_unavailable",status:409};
    const requestedLinked=uid(payload?.hygiene_lot_id);if(requestedLinked&&requestedLinked!==linked)return {error:"basket_hygiene_lot_unavailable",status:409};
    const food=await splitLotItems(mainLot,"food"),hygiene=linked?await splitLotItems(linked,"hygiene"):[],all=[...food,...hygiene];
    const reqRows=Array.isArray(payload?.items)?payload.items:[],req=new Map<string,number>();
    for(const x of reqRows){const pid=uid(x?.product_id),g=String(x?.component_group||"");if(pid&&["food","hygiene"].includes(g))req.set(g+"|"+pid,Number(x?.quantity||0))}
    for(const x of reqRows){const pid=uid(x?.product_id),g=String(x?.component_group||"");if(pid&&["food","hygiene"].includes(g)&&!all.some((r:any)=>r.product_id===pid&&r.component_group===g))return {error:"basket_component_not_in_selected_kit",status:409}}
    const selected=all.map((r:any)=>({...r,quantity:req.has(r.component_group+"|"+r.product_id)?Number(req.get(r.component_group+"|"+r.product_id)):0}));
    const foodChanged=groupChanged(selected,"food"),hygieneChanged=linked?groupChanged(selected,"hygiene"):false;
    let total=Number(c.sale_price||0);
    for(const r of selected){const qty=Number(r.quantity||0),base=Number(r.base_quantity||0),changed=r.component_group==="food"?foodChanged:hygieneChanged,loose=Number(r.loose_stock_quantity||0),min=Math.max(0,Number(r.min_quantity??(r.removable===false?base:0))),max=r.max_quantity==null?(changed?Math.floor(loose):base+Math.floor(loose)):Number(r.max_quantity);if(!Number.isFinite(qty)||qty<0||Math.trunc(qty)!==qty)return {error:"invalid_basket_quantity",status:400};if(qty===0&&r.removable===false)return {error:"item_not_removable",status:409};if(qty<min||qty>max)return {error:"basket_quantity_out_of_range",status:409,product_id:r.product_id};if(changed&&qty>loose)return {error:"insufficient_stock",status:409,product_id:r.product_id,available:loose,requested:qty};const price=Number(r.regular_price||0);if(qty<base)total+=Math.abs(qty-base)*Number(r.remove_unit_delta??-price);else if(qty>base)total+=(qty-base)*Number(r.add_unit_delta??price)}
    return {ok:true,total_cents:Math.max(0,cents(total)),split_mode:true,food_changed:foodChanged,hygiene_changed:hygieneChanged,food_lot_id:mainLot,food_lot_code:c.public_lot_code||null,hygiene_lot_id:linked||null,hygiene_lot_code:null};
  }
  const requestedLot=uid(payload?.lot_id);if(requestedLot&&requestedLot!==mainLot)return {error:"basket_lot_unavailable",status:409};
  const {data:rules,error}=await db.from("basket_stock_lot_items").select("product_id,quantity_per_basket,source_template_item_id,product:products(id,price,is_active),rule:basket_template_items(id,removable,quantity_editable,min_quantity,max_quantity,remove_unit_delta,add_unit_delta)").eq("lot_id",mainLot);if(error)throw error;
  const ids=(rules||[]).map((r:any)=>r.product_id),sm=await sellableMap(ids),req=new Map<string,number>((Array.isArray(payload?.items)?payload.items:[]).map((x:any)=>[uid(x?.product_id),Number(x?.quantity||0)]).filter((x:any)=>x[0]));
  let total=Number(c.sale_price||0);
  for(const r of rules||[]){const product:any=Array.isArray(r.product)?r.product[0]:r.product,rule:any=Array.isArray(r.rule)?r.rule[0]:r.rule,base=Number(r.quantity_per_basket||0),qty=req.has(r.product_id)?Number(req.get(r.product_id)):base,loose=product?.is_active===false?0:(sm.get(r.product_id)||0),min=Math.max(0,Number(rule?.min_quantity??(rule?.removable===false?base:0))),max=Math.min(base+Math.floor(loose),Number(rule?.max_quantity??(base+Math.floor(loose))));if(!Number.isFinite(qty)||qty<0||Math.trunc(qty)!==qty)return {error:"invalid_basket_quantity",status:400};if(qty===0&&rule?.removable===false)return {error:"item_not_removable",status:409};if(qty<min||qty>max)return {error:"basket_quantity_out_of_range",status:409};const price=Number(product?.price||0);if(qty<base)total+=Math.abs(qty-base)*Number(rule?.remove_unit_delta??-price);else if(qty>base)total+=(qty-base)*Number(rule?.add_unit_delta??price)}
  for(const [pid] of req)if(!(rules||[]).some((r:any)=>String(r.product_id)===pid))return {error:"basket_component_not_in_lot",status:409};
  return {ok:true,total_cents:Math.max(0,cents(total)),lot_id:mainLot,lot_code:c.public_lot_code||c.public_internal_lot_code||null,split_mode:false};
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
  const matched=uid(r.data?.[0]?.customer_id);if(matched)return matched;
  // Older imports can associate one phone with multiple customers. Prefer the
  // unique active customer whose primary WhatsApp number exactly matches it.
  const exact=await db.from("customers").select("id").eq("primary_whatsapp_e164",ph).eq("is_active",true).limit(2);
  if(exact.error)throw exact.error;
  return exact.data?.length===1?uid(exact.data[0].id)||null:null;
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
  const a=aq.data?{id:aq.data.id,street:aq.data.street||"",number:aq.data.number||"",complement:aq.data.complement||"",neighborhood:aq.data.neighborhood||"",district:aq.data.neighborhood||"",city:aq.data.city||"",state:aq.data.state||"MT",postal_code:aq.data.postal_code||"",reference:aq.data.reference||"",raw_text:aq.data.reference||""}:null;
  return {id:cq.data.id,display_name:cq.data.name||"",phone:cq.data.primary_whatsapp_e164||"",document_present:doc.length===11||doc.length===14,document_last4:doc?doc.slice(-4):"",marketing_opt_in:cq.data.marketing_opt_in===true,registration_complete:sq.data?.registration_complete===true,missing_fields:Array.isArray(sq.data?.missing_fields)?sq.data.missing_fields:[],address:a};
}
async function lookupCustomer(v:any){
  const entered=String(v??"").replace(/\D/g,"");
  const raw=entered.startsWith("55") && (entered.length===12||entered.length===13) ? entered.slice(2) : entered;
  const ph=phone(v);
  if(!ph)return {ok:true,found:false};
  // When the user supplies a full number, exact matching takes priority.
  const exactId = (raw.length===8||raw.length===9) ? null : await customerIdByPhone(ph);
  if(exactId){
    const customer=await loadCustomerForCheckout(exactId);
    return {ok:true,found:Boolean(customer),customer};
  }
  // The last eight digits are the lookup key irrespective of DDD or ninth digit.
  const suffix=raw.slice(-8);
  if(suffix.length!==8)return {ok:true,found:false};
  const [primary,linked]=await Promise.all([
    db.from("customers").select("id").eq("is_active",true).like("primary_whatsapp_e164","%"+suffix).limit(30),
    db.from("customer_phones").select("customer_id").like("phone_e164","%"+suffix).limit(30),
  ]);
  if(primary.error)throw primary.error;
  if(linked.error)throw linked.error;
  const candidates=[...new Set([
    ...(primary.data||[]).map((c:any)=>c.id),
    ...(linked.data||[]).map((c:any)=>c.customer_id)
  ])];
  if(!candidates.length)return {ok:true,found:false};
  const active=await db.from("customers").select("id").in("id",candidates).eq("is_active",true).limit(2);
  if(active.error)throw active.error;
  if((active.data||[]).length>1 || primary.data?.length===30 || linked.data?.length===30)
    return {ok:true,found:false,ambiguous:true};
  const id=uid(active.data?.[0]?.id);
  if(!id)return {ok:true,found:false};
  const customer=await loadCustomerForCheckout(id);
  return {ok:true,found:Boolean(customer),customer};
}
async function registerCustomer(req:Request,p:any){
  const ph=phone(p?.phone);if(!ph)return {error:"invalid_phone",status:400};
  const [ipKey,phoneKey]=await Promise.all([sha(ip(req)||"unknown"),sha(ph)]);
  const [a,b]=await Promise.all([
    db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-register:ip:"+ipKey,p_bucket:"register_customer",p_limit:20,p_window_seconds:600}),
    db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-register:phone:"+phoneKey,p_bucket:"register_customer",p_limit:8,p_window_seconds:600})
  ]);
  if(a.error||b.error)return {error:"rate_limit_unavailable",status:503};if(a.data!==true||b.data!==true)return {error:"rate_limited",status:429};
  let document=txt(p?.document,30);
  if(!document&&p?.source==="checkout"){
    const existingId=await customerIdByPhone(ph);
    if(existingId){
      const existing=await db.from("customers").select("name,cpf_cnpj").eq("id",existingId).maybeSingle();
      if(existing.error)return {error:"registration_unavailable",status:503};
      if(existing.data){
        const normalizedName=(value:any)=>txt(value,180).replace(/\s+/g," ").toLocaleLowerCase("pt-BR");
        if(normalizedName(existing.data.name)!==normalizedName(p?.name))return {error:"identity_mismatch",status:409};
        document=txt(existing.data.cpf_cnpj,30);
      }
    }
  }
  const r=await db.rpc("ops2_upsert_storefront_registration_v1",{
    p_phone:ph,p_name:txt(p?.name,180),p_document:document,p_street:txt(p?.street,180),p_number:txt(p?.number,40),
    p_neighborhood:txt(p?.neighborhood,120),p_city:txt(p?.city,100),p_complement:txt(p?.complement,180)||null,
    p_reference:txt(p?.reference,220)||null,p_postal_code:txt(p?.postal_code,12)||null,
    p_marketing_opt_in:typeof p?.marketing_opt_in==="boolean"?p.marketing_opt_in:null,
    p_source_key:p?.source==="checkout"?"site_checkout":"site_registration_page"
  });
  if(r.error)return {error:"registration_unavailable",status:503};
  if(r.data?.ok!==true){const e=txt(r.data?.error,100)||"registration_failed";return {error:e,status:["document_already_in_use","document_mismatch","identity_mismatch"].includes(e)?409:400};}
  // A choice made on the public checkout is an independent, individually logged opt-in.
  // No opt-in is inferred from an existing order, phone, or historical owner declaration.
  let consentRecorded = false;
  if (p?.marketing_opt_in === true && p?.source === "checkout") {
    const key = "checkout_optin:" + crypto.randomUUID();
    const saved = await db.rpc("marketing_record_consent_v1", {
      p_customer_id: r.data.customer_id,
      p_decision: "opt_in",
      p_source: "site_checkout_checkbox",
      p_source_ref: key,
      p_source_event_key: key,
      p_consent_text_version: "site_whatsapp_marketing_optin_v1",
      p_consent_text_snapshot: "Aceito receber ofertas e novidades da Dona Antônia pelo WhatsApp no número informado. Posso cancelar quando quiser.",
      p_occurred_at: new Date().toISOString(),
      p_recorded_by: "storefront_site_checkout",
      p_metadata: { channel: "site_checkout", customer_checked: true, consent_scope: "whatsapp_marketing" }
    });
    if (saved.error || saved.data?.ok !== true) {
      console.error("checkout_consent_record_failed", saved.error?.code || saved.data?.error || "unknown");
      return { error: "consent_record_unavailable", status: 503 };
    }
    consentRecorded = true;
  }
  const customer=await loadCustomerForCheckout(r.data.customer_id);
  return {ok:true,registration_complete:true,customer,consent_recorded:consentRecorded,bling_job_id:r.data.bling_job_id||null};
}

function kickWhatsappOrderOutbound(orderId:string){
  if(!orderId)return;
  const task=fetch(`${SUPABASE_URL}/functions/v1/admin-orders-v1`,{
    method:"POST",
    headers:{"x-internal-key":KEY,"Content-Type":"application/json"},
    body:JSON.stringify({order_id:orderId,dispatch_scope:"checkout_auto"})
  }).then(async response=>{
    if(!response.ok)console.error("whatsapp_order_outbound_kick",response.status,txt(await response.text().catch(()=>""),180));
  }).catch(error=>console.error("whatsapp_order_outbound_kick",txt((error as any)?.message,180)));
  const runtime=(globalThis as any).EdgeRuntime;
  if(runtime?.waitUntil)runtime.waitUntil(task);else void task;
}

type StockAdjustment={kind:"product"|"basket"|"basket_mold";id:string;name:string;image_url?:string;action:"removed"|"reduced";requested:number;available:number;reason:string};
async function reconcileOrderItemsForStock(rawItems:any[]){
  const adjusted:any[]=[],adjustedItems:StockAdjustment[]=[];
  const productIds=[...new Set(rawItems.slice(0,80)
    .filter((raw:any)=>(raw?.type||"product")==="product")
    .map((raw:any)=>uid(raw?.id)).filter(Boolean))];
  const productSummaries=new Map<string,any>();
  if(productIds.length){
    const summaryQ=await db.from("products").select("id,name,image_url").in("id",productIds);
    if(!summaryQ.error)for(const product of summaryQ.data||[])productSummaries.set(String(product.id),product);
  }
  for(const raw of rawItems.slice(0,80)){
    const kind=raw?.type==="basket_mold"?"basket_mold":raw?.type==="basket"?"basket":"product",id=uid(raw?.id),requested=Math.max(1,Math.min(30,Math.trunc(Number(raw?.qty||1))));
    if(!id){adjustedItems.push({kind,id:"",name:kind==="basket"?"Cesta":"Produto",action:"removed",requested,available:0,reason:"item_invalido"});continue}
    if(kind==="basket_mold"){adjusted.push({...raw,type:"basket_mold",id,qty:requested,pricing_model:"configured_base_delta_v1"});continue;}
    if(kind==="product"){
      const current=await oneProduct(id).catch(()=>null),summary=productSummaries.get(id),available=Math.max(0,Math.floor(Number(current?.stock_quantity||0))),name=txt(current?.name||summary?.name||"Produto",160)||"Produto",image_url=String(current?.image_url||summary?.image_url||"");
      if(!current||available<=0){adjustedItems.push({kind,id,name,image_url,action:"removed",requested,available:0,reason:"sem_estoque"});continue}
      const qty=Math.min(requested,available);if(qty<requested)adjustedItems.push({kind,id,name,image_url,action:qty>0?"reduced":"removed",requested,available:qty,reason:"estoque_reduzido"});
      if(qty>0)adjusted.push({...raw,type:"product",id,qty});continue;
    }
    const current=await basket(id).catch(()=>null),name=txt(current?.basket?.name||"Cesta básica",160)||"Cesta básica";
    if(!current){adjustedItems.push({kind,id,name,action:"removed",requested,available:0,reason:"cesta_indisponivel"});continue}
    const b=current.basket||{},sameLot=b.split_mode===true
      ? raw?.split_mode===true&&String(raw?.food_lot_id||"")===String(b.food_lot_id||"")&&(!b.uses_hygiene_kit||String(raw?.hygiene_lot_id||"")===String(b.hygiene_lot_id||""))
      : raw?.split_mode!==true&&String(raw?.lot_id||"")===String(b.lot_id||"");
    if(!sameLot){adjustedItems.push({kind,id,name,action:"removed",requested,available:0,reason:"composicao_atualizada"});continue}
    const available=Math.max(0,Math.floor(Number(b.stock_quantity||0)));if(available<=0){adjustedItems.push({kind,id,name,action:"removed",requested,available:0,reason:"cesta_sem_estoque"});continue}
    const qPayload=b.split_mode===true?{basket_id:id,food_lot_id:raw?.food_lot_id,hygiene_lot_id:raw?.hygiene_lot_id,food_lot_code:raw?.food_lot_code,hygiene_lot_code:raw?.hygiene_lot_code,items:Array.isArray(raw?.components)?raw.components:[]}:{basket_id:id,lot_id:raw?.lot_id,items:Array.isArray(raw?.components)?raw.components:[]};
    const quoted=await quote(qPayload).catch(()=>({error:"quote_unavailable"}));
    if(quoted?.error){adjustedItems.push({kind,id,name,action:"removed",requested,available:0,reason:"composicao_sem_estoque"});continue}
    const qty=Math.min(requested,available);if(qty<requested)adjustedItems.push({kind,id,name,action:qty>0?"reduced":"removed",requested,available:qty,reason:"estoque_reduzido"});
    if(qty>0)adjusted.push({...raw,type:"basket",id,qty});
  }
  return {items:adjusted,adjusted_items:adjustedItems,stock_adjustment:adjustedItems.length>0};
}

async function refreshBasketMoldOrderItems(items:any[]){
  const refreshedItems=items.map((item:any)=>item);
  let refreshedBasketCount=0,refreshedComponentCount=0;
  for(let index=0;index<refreshedItems.length;index++){
    const line=refreshedItems[index];
    if(String(line?.type||"product")!=="basket_mold")continue;
    const basketId=uid(line?.id);
    if(!basketId)return null;
    const rawComposition=Number(line?.composition_number||1);
    const requestedComposition=Number.isInteger(rawComposition)&&rawComposition>0?rawComposition:1;
    let detail=await moldDetail(basketId,requestedComposition,null,true,true);
    if(!detail&&requestedComposition!==1)detail=await moldDetail(basketId,1,null,true,true);
    if(!detail?.basket||!Array.isArray(detail.items)||!detail.items.length)return null;
    const positionIds=detail.items.map((position:any)=>uid(position?.position_id)).filter(Boolean);
    if(positionIds.length!==detail.items.length)return null;
    const optionQuery=await db.from("basket_mold_position_options")
      .select("position_id,product_id,sort_order")
      .in("position_id",positionIds)
      .order("sort_order")
      .order("product_id");
    if(optionQuery.error)throw optionQuery.error;
    const validProductsByPosition=new Map<string,string[]>();
    for(const option of optionQuery.data||[]){
      const positionId=uid(option?.position_id),productId=uid(option?.product_id);
      if(!positionId||!productId)continue;
      if(!validProductsByPosition.has(positionId))validProductsByPosition.set(positionId,[]);
      validProductsByPosition.get(positionId)!.push(productId);
    }
    const oldByPosition=new Map<string,any>();
    for(const component of Array.isArray(line.components)?line.components:[]){
      const positionId=uid(component?.position_id);
      if(positionId)oldByPosition.set(positionId,component);
    }
    const components:any[]=[];
    for(const position of detail.items){
      const positionId=uid(position?.position_id),defaultProductId=uid(position?.product_id);
      const validProducts=validProductsByPosition.get(positionId)||[];
      const old=oldByPosition.get(positionId)||{};
      const oldOptions=Array.isArray(old.options)&&old.options.length
        ?old.options
        :old.product_id?[{product_id:old.product_id,quantity:old.quantity??position?.quantity??position?.base_quantity??0}]:[];
      const optionsByProduct=new Map<string,number>();
      let invalidQuantity=0;
      for(const option of oldOptions){
        const productId=uid(option?.product_id),quantity=Number(option?.quantity||0);
        if(!productId||!Number.isInteger(quantity)||quantity<0||quantity>1000)return null;
        if(validProducts.includes(productId))optionsByProduct.set(productId,(optionsByProduct.get(productId)||0)+quantity);
        else invalidQuantity+=quantity;
      }
      const previousTotal=oldOptions.length
        ?oldOptions.reduce((sum:number,option:any)=>sum+Number(option?.quantity||0),0)
        :Number(old.quantity??position?.quantity??position?.base_quantity??0);
      if(invalidQuantity>0){
        const fallback=defaultProductId&&validProducts.includes(defaultProductId)?defaultProductId:validProducts[0]||"";
        if(!fallback)return null;
        optionsByProduct.set(fallback,(optionsByProduct.get(fallback)||0)+invalidQuantity);
      }
      if(!optionsByProduct.size){
        const fallback=defaultProductId&&validProducts.includes(defaultProductId)?defaultProductId:validProducts[0]||"";
        if(!fallback)return null;
        optionsByProduct.set(fallback,Math.max(0,Math.min(1000,Math.trunc(previousTotal))));
      }
      const selectedOptions=Array.from(optionsByProduct.entries()).filter(([,quantity])=>quantity>0)
        .map(([product_id,quantity])=>({product_id,quantity}));
      const totalQuantity=selectedOptions.reduce((sum,option)=>sum+option.quantity,0);
      if(totalQuantity>1000)return null;
      const representative=selectedOptions[0]?.product_id||defaultProductId||validProducts[0]||"";
      if(!positionId||!representative)return null;
      components.push({
        position_id:positionId,product_id:representative,quantity:totalQuantity,
        options:selectedOptions
      });
    }
    refreshedItems[index]={
      ...line,
      id:uid(detail.basket.id)||basketId,
      composition_number:Number(detail.basket.composition_number)||1,
      components
    };
    refreshedBasketCount++;
    refreshedComponentCount+=components.length;
  }
  return refreshedBasketCount
    ?{items:refreshedItems,basket_count:refreshedBasketCount,component_count:refreshedComponentCount}
    :null;
}
async function stockConflictDetailsFromError(error:any,rawItems:any[]){
  let details:any=null;
  try{details=JSON.parse(String(error?.details||""))}catch{}
  const productId=uid(details?.product_id);
  if(!productId)return [];
  const direct=rawItems.find((item:any)=>item?.type==="product"&&uid(item?.id)===productId);
  const requestedFromCart=direct?Math.max(1,Math.trunc(Number(direct?.qty||1))):0;
  const requested=Math.max(0,Math.trunc(Number(details?.requested??requestedFromCart)));
  const available=Math.max(0,Math.floor(Number(details?.available||0)));
  const productQ=await db.from("products").select("id,name,image_url").eq("id",productId).maybeSingle();
  const product=productQ.error?null:productQ.data;
  const name=txt(product?.name||details?.product_name||"Produto indisponível",160)||"Produto indisponível";
  const kind=String(details?.kind||"")==="basket_mold_component"||(!direct&&rawItems.some((item:any)=>item?.type==="basket_mold"))
    ?"basket_mold_component":"product";
  return [{
    kind,id:productId,name,image_url:String(product?.image_url||""),
    action:available>0&&requested>available?"reduced":"removed",
    requested,available,reason:txt(details?.reason||details?.error||"estoque_indisponivel",80)
  }];
}

async function submit(req:Request,p:any){
  const pay=txt(p?.payment_method,80),rawPhone=txt(p?.whatsapp_phone,40),ph=phone(rawPhone),requestedItems=Array.isArray(p?.items)?p.items.slice(0,80):[],whatsappOriginRaw=txt(p?.whatsapp_origin,4),whatsappOrigin=['0975','1018'].includes(whatsappOriginRaw)?whatsappOriginRaw:'';
  if(!ph)return {error:"invalid_whatsapp_phone",status:400};
  if(!requestedItems.length)return {error:"empty_cart",status:400};
  const stock=await reconcileOrderItemsForStock(requestedItems);
  let items=stock.items;
  let stockAdjustment=stock.stock_adjustment;
  const adjustedItems=[...stock.adjusted_items];
  const productConflicts=adjustedItems.filter((item:StockAdjustment)=>item.kind==="product");
  if(productConflicts.length)return {error:"stock_conflict",status:409,stock_adjustment:true,adjusted_items:adjustedItems,stock_conflict_items:productConflicts,minimum_order_cents:MINIMUM_ORDER_CENTS};
  if(!items.length)return {error:"all_items_unavailable",status:409,stock_adjustment:true,adjusted_items:adjustedItems,stock_conflict_items:adjustedItems,minimum_order_cents:MINIMUM_ORDER_CENTS};
  const deliveryDate=txt(p?.delivery_date,10),del=deliveryDate?selectedDelivery(deliveryDate):null;
  async function allowOrderAttempt(rateKey:string,limit:number,scope:string){
    try{
      const gate=await db.rpc("consume_public_rate_limit",{p_rate_key:rateKey,p_bucket:"create_order",p_limit:limit,p_window_seconds:60});
      if(gate.error){console.error("checkout_rate_limit_unavailable",{scope,code:txt(gate.error.message,100)});return true}
      return gate.data===true;
    }catch(error){
      console.error("checkout_rate_limit_failed",{scope,code:txt((error as any)?.message,100)});
      return true;
    }
  }
  const ik=await sha(ip(req)||"unknown");
  if(!(await allowOrderAttempt("vitrine-direct:v2:ip:"+ik,30,"ip")))return {error:"rate_limited",status:429,retry_after_seconds:60};
  if(ph){
    const pk=await sha(ph);
    if(!(await allowOrderAttempt("vitrine-direct:v2:phone:"+pk,10,"phone")))return {error:"rate_limited",status:429,retry_after_seconds:60};
  }
  // A registered customer may reuse complete delivery data. Otherwise, require name and address before creating the order.
  let customer:any=null;
  try{const found=await lookupCustomer(ph);if(found?.found&&found?.customer)customer=found.customer}
  catch(e){console.error("optional_customer_lookup",txt((e as any)?.message,180))}
  const submitted=p?.customer_details&&typeof p.customer_details==="object"?p.customer_details:{};
  const submittedAddress=submitted.address&&typeof submitted.address==="object"?submitted.address:{};
  const registeredAddress=customer?.address&&typeof customer.address==="object"?customer.address:{};
  const recipientName=txt(submitted.name,180)||txt(customer?.display_name,180);
  const recipientAddress={
    street:txt(submittedAddress.street,180)||txt(registeredAddress.street,180),
    number:txt(submittedAddress.number,40)||txt(registeredAddress.number,40),
    district:txt(submittedAddress.district??submittedAddress.neighborhood,140)||txt(registeredAddress.district??registeredAddress.neighborhood,140),
    city:txt(submittedAddress.city,120)||txt(registeredAddress.city,120),
    state:(txt(submittedAddress.state,2)||txt(registeredAddress.state,2)).toUpperCase(),
    postal_code:txt(submittedAddress.postal_code,20)||txt(registeredAddress.postal_code,20),
    complement:txt(submittedAddress.complement,140)||txt(registeredAddress.complement,140)
  };
  if(!recipientName)return {error:"customer_name_required",status:400};
  const missingAddress=["street","number","district","city","state"].filter(key=>!String((recipientAddress as any)[key]||"").trim());
  if(missingAddress.length)return {error:"delivery_details_required",missing_fields:missingAddress,status:400};
  const marketingCampaign=txt(p?.marketing_context?.campaign,80);
  let stockRetryAttempted=false;
  let basketConfigurationRefreshed=false;
  const customerSnapshot=()=>({
    ...(customer?{found:true,id:customer.id,marketing_opt_in:customer.marketing_opt_in===true,identity_status:"existing_optional"}:{found:false,identity_status:"unregistered"}),
    display_name:recipientName,
    address:recipientAddress,
    ...(whatsappOrigin?{whatsapp_origin:whatsappOrigin}:{}),
    ...(marketingCampaign?{marketing_campaign:marketingCampaign}:{}),
    ...(stockAdjustment?{stock_adjusted_retry:true,stock_adjustments:adjustedItems}:{}),
    ...(stockRetryAttempted?{stock_retry_attempted:true}:{}),
    ...(basketConfigurationRefreshed?{basket_configuration_refreshed:true}:{})
  });
  const createOrderAttempt=()=>db.rpc("create_vitrine_cart_order_v3",{p_phone:ph||null,p_payment_method:pay||null,p_items:items,p_customer_snapshot:customerSnapshot(),p_delivery:del||{}});
  let created=await createOrderAttempt();
  if(created.error){
    const firstError=txt(created.error.message,160).split("\n")[0];
    if(STALE_BASKET_CONFIGURATION_CODES.has(firstError)){
      try{
        const refreshed=await refreshBasketMoldOrderItems(items);
        if(refreshed){
          items=refreshed.items;
          basketConfigurationRefreshed=true;
          console.warn("storefront_basket_configuration_refreshed",{
            basket_count:refreshed.basket_count,
            component_count:refreshed.component_count
          });
          created=await createOrderAttempt();
        }else{
          console.warn("storefront_basket_configuration_refresh_unavailable",{error_code:firstError});
        }
      }catch(error){
        console.error("storefront_basket_configuration_refresh_failed",{
          error_code:firstError,
          detail:txt((error as any)?.message,120)
        });
      }
    }
  }
  if(created.error){
    const firstError=txt(created.error.message,160).split("\n")[0];
    if(STOCK_CONFLICT_CODES.has(firstError)){
      stockRetryAttempted=true;
      console.warn("storefront_stock_conflict_retry",{error_code:firstError,item_count:items.length});
      const refreshed=await reconcileOrderItemsForStock(items);
      items=refreshed.items;
      for(const adjustment of refreshed.adjusted_items){
        const existingIndex=adjustedItems.findIndex((item:any)=>item.kind===adjustment.kind&&item.id===adjustment.id);
        if(existingIndex<0)adjustedItems.push(adjustment);
        else{
          const previous=adjustedItems[existingIndex];
          adjustedItems[existingIndex]={...adjustment,requested:Math.max(Number(previous.requested||0),Number(adjustment.requested||0))};
        }
      }
      stockAdjustment=adjustedItems.length>0;
      const productConflicts=refreshed.adjusted_items.filter((item:StockAdjustment)=>item.kind==="product");
      if(productConflicts.length)return {error:"stock_conflict",status:409,stock_adjustment:true,adjusted_items:adjustedItems,stock_conflict_items:productConflicts,minimum_order_cents:MINIMUM_ORDER_CENTS};
      if(!items.length)return {error:"all_items_unavailable",status:409,stock_adjustment:true,adjusted_items:adjustedItems,stock_conflict_items:adjustedItems,minimum_order_cents:MINIMUM_ORDER_CENTS};
      created=await createOrderAttempt();
    }
  }
  if(created.error){
    const e=txt(created.error.message,160).split("\n")[0];
    console.error("storefront_order_rejected",{error_code:e||"order_failed",stock_retry_attempted:stockRetryAttempted});
    const stockConflictItems=STOCK_CONFLICT_CODES.has(e)?await stockConflictDetailsFromError(created.error,items):[];
    return {error:e||"order_failed",status:ORDER_CONFLICT_CODES.has(e)?409:400,minimum_order_cents:MINIMUM_ORDER_CENTS,stock_adjustment:stockAdjustment,adjusted_items:adjustedItems,stock_conflict_items:stockConflictItems.length?stockConflictItems:adjustedItems}
  }
  const orderId=created.data?.order_id;let papoaiLink:any=null;let publicOrderLink:any=null;let canonicalOrderNumber:any=created.data?.order_number||null;
  if(orderId&&ph){try{const linked=await db.rpc("ops2_link_storefront_order_from_identity_v1",{p_order_id:orderId});if(!linked.error)papoaiLink=linked.data||null}catch(e){console.error("papoai_identity_order_link",txt((e as any)?.message,180))}}
  if(orderId){
    try{
      const [publicLink,storedOrder]=await Promise.all([
        db.rpc("ops2_order_public_link_v1",{p_order_id:orderId}),
        db.from("orders").select("order_number").eq("id",orderId).maybeSingle()
      ]);
      if(!publicLink.error)publicOrderLink=publicLink.data||null;
      if(!storedOrder.error&&storedOrder.data?.order_number)canonicalOrderNumber=storedOrder.data.order_number;
    }catch(e){console.error("order_public_identity",txt((e as any)?.message,180))}
  }
  if(orderId&&ph)kickWhatsappOrderOutbound(orderId);
  const customerStatus=customer?.registration_complete===true?"registered":"pending_registration";
  await recordOpsEvent("order.received","Pedido recebido pelo site e aguardando confirmação.",orderId,{source:"vitrine",customer_status:customerStatus,payment_method:pay||null,delivery_date:deliveryDate||null,stock_reserved:created.data?.stock_reserved===true,reservation_timing:created.data?.reservation_timing||null,reservation_status:created.data?.reservation_status||null,papoai_conversation_linked:Boolean(papoaiLink?.linked),stock_adjustment:stockAdjustment,adjusted_items:adjustedItems,basket_configuration_refreshed:basketConfigurationRefreshed},"order-received:"+orderId);
  const orderCode=publicOrderLink?.public_code||canonicalOrderNumber||created.data?.order_number||null;
  return {...created.data,order_number:orderCode,order_public_url:publicOrderLink?.public_url||null,order_public_code:orderCode,phone_attached:Boolean(ph),customer_status:customerStatus,registration_complete:customer?.registration_complete===true,minimum_order_cents:MINIMUM_ORDER_CENTS,delivery:del,customer:customer||null,history_synced:Boolean(customer),papoai_conversation_linked:Boolean(papoaiLink?.linked),stock_adjustment:stockAdjustment,adjusted_items:adjustedItems,basket_configuration_refreshed:basketConfigurationRefreshed};
}

async function basketBySize(sizeKey:string,lightweight=false){
  const key=txt(sizeKey,40).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
  if(!["economica","mini","pequena","media","grande"].includes(key))return {error:"invalid_basket_size",status:400};
  const shell=await homeSizeCards();
  const card=(shell.baskets||[]).find((item:any)=>String(item.size_key||"")===key);
  const match=String(card?.card_key||"").match(/^([0-9a-f-]{36})@([1-6])$/i);
  if(!match)return {error:"basket_mold_unavailable",status:404};
  const detail=await moldDetail(match[1],Number(match[2]),null,!lightweight,lightweight);
  return detail?{ok:true,...detail}:{error:"basket_mold_unavailable",status:404};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  try{
    const u=new URL(req.url),action=txt(u.searchParams.get("action")||(req.method==="POST"?"basket_quote":"home"),60);
    if(action==="health")return json(req,{ok:true,service:"storefront-v2",mode:"canonical-vitrine",version:81},200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="home_catalog_cards")return json(req,await homeCatalogCards(),200,{"Cache-Control":"public, max-age=30, stale-while-revalidate=180"});
    if(req.method==="GET"&&action==="home_size_cards")return json(req,await homeSizeCards(),200,{"Cache-Control":"public, max-age=120, stale-while-revalidate=600"});
    if(req.method==="GET"&&action==="basket_flow_shell")return json(req,await basketFlowShell(),200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="basket_flow_configuration")return json(req,await basketFlowConfiguration(u.searchParams.get("basket_id"),u.searchParams.get("composition_number")),200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="home")return json(req,await cachedHome(),200,{"Cache-Control":"public, max-age=30, stale-while-revalidate=120"});
    if(req.method==="GET"&&action==="home_priority")return json(req,await cachedHomePriority(),200,{"Cache-Control":"public, max-age=30, stale-while-revalidate=120"});
    if(req.method==="GET"&&action==="offers")return json(req,await offerList(),200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="subcategories")return json(req,await subcats(u),200,{"Cache-Control":"public, max-age=120, stale-while-revalidate=600"});
    if(req.method==="GET"&&action==="products")return json(req,await productList(u),200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="product"){const id=uid(u.searchParams.get("product_id"));if(!id)return json(req,{ok:false,error:"invalid_product"},400);const p=await oneProduct(id);return p?json(req,{ok:true,product:p},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"product_not_found"},404)}
    if(req.method==="GET"&&action==="basket_by_size"){
      const r=await basketBySize(u.searchParams.get("size_key")||"",u.searchParams.get("lightweight")==="1");
      return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"});
    }
    if(req.method==="GET"&&action==="basket"){const raw=txt(u.searchParams.get("basket_id"),100),mm=raw.match(/^([0-9a-f-]{36})@([1-6])$/i);if(mm){const id=uid(mm[1]);if(!id)return json(req,{ok:false,error:"invalid_basket"},400);const lightweight=u.searchParams.get("lightweight")==="1";const b=await moldDetail(id,Number(mm[2]),null,!lightweight,lightweight);return b?json(req,{ok:true,...b},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"basket_mold_unavailable"},404)}const id=uid(raw);if(!id)return json(req,{ok:false,error:"invalid_basket"},400);const b=await basket(id);return b?json(req,{ok:true,...b},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"basket_not_found"},404)}
    if(req.method==="GET"&&action==="basket_mold_options"){
      const r=await moldPositionOptions(u.searchParams.get("basket_id")||"",Math.trunc(Number(u.searchParams.get("composition_number")||0)),u.searchParams.get("position_id")||"",u.searchParams.get("selected_product_ids")||u.searchParams.get("selected_product_id")||"",Math.trunc(Number(u.searchParams.get("quantity")||0)),Math.trunc(Number(u.searchParams.get("offset")||0)));
      return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"});
    }
    if(req.method==="GET"&&action==="basket_extra_products"){const r=await basketExtraProducts(u.searchParams.get("basket_id")||"",u.searchParams.get("theme_id")||"");return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="resolve_identity_code"){const r=await resolveCode(req,u.searchParams.get("code"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="resolve_identity_token"){const r=await resolveToken(u.searchParams.get("token"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="delivery_options")return json(req,{ok:true,options:deliveryOptions(),cutoff_hour:CUTOFF_HOUR,time_zone:TZ},200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="customer_lookup"){const raw=u.searchParams.get("phone"),ph=phone(raw),rk=await sha(ph||ip(req)||"unknown"),gate=await db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-v2:customer-lookup:"+rk,p_bucket:"lookup_customer",p_limit:20,p_window_seconds:300});if(gate.error)return json(req,{ok:false,error:"rate_limit_unavailable"},503);if(gate.data!==true)return json(req,{ok:false,error:"rate_limited"},429);return json(req,await lookupCustomer(raw),200,{"Cache-Control":"no-store"})}

    const body=req.method==="POST"?await req.json().catch(()=>({})):{};
    if(req.method==="POST"&&action==="basket_mold_options_batch"){
      const r=await moldPositionOptionsBatch(body?.basket_id,Math.trunc(Number(body?.composition_number||0)),body?.positions);
      return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"});
    }
    if(req.method==="POST"&&action==="customer_register"){const r=await registerCustomer(req,body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="basket_quote"){const r=await quote(body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="basket_mold_quote"){const r=await moldQuote(body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="basket_flow_snapshot"){const r=await basketFlowSnapshot(body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="basket_flow_quote"){const r=await basketFlowQuote(body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="submit_order"){const r=await submit(req,body);const headers={"Cache-Control":"no-store",...(r.retry_after_seconds?{"Retry-After":String(r.retry_after_seconds)}:{})};return r.error?json(req,{ok:false,...r},r.status||400,headers):json(req,{ok:true,...r},200,headers)}
    if(req.method==="POST"&&action==="issue_identity_link")return json(req,{ok:false,error:"retired"},410)
    if(req.method==="POST"&&action==="reconcile_customer")return json(req,{ok:false,error:"retired"},410)

    if(req.method==="POST"&&action==="list_baskets"){const h=await home();return json(req,{ok:true,baskets:h.baskets.map((b:any)=>({id:b.id,name:b.name,image_url:b.image_url,base_price:Number(b.display_price_cents||0)/100,ready:true}))})}
    if(req.method==="POST"&&action==="get_basket"){const b=await basket(uid(body?.id));return b?json(req,{ok:true,basket:{id:b.basket.id,name:b.basket.name,image_url:b.basket.image_url,base_price:Number(b.basket.display_price_cents||0)/100,ready:true},items:b.items.map((i:any)=>({...i,product:{id:i.product_id,name:i.name,image_url:i.image_url,stock:i.stock_quantity,packaging:i.packaging,is_active:i.stock_quantity>0}}))}):json(req,{ok:false,error:"basket_not_found"},404)}
    if(req.method==="POST"&&action==="list_sections"){return json(req,{ok:true,sections:CATEGORIES.map(c=>({name:c.key,label:c.label}))})}
    if(req.method==="POST"&&action==="list_products"){const fake=new URL(req.url);if(body?.section)fake.searchParams.set("category",String(body.section));if(body?.q)fake.searchParams.set("q",String(body.q));fake.searchParams.set("limit",String(body?.limit||20));fake.searchParams.set("offset",String(Math.max(0,(Number(body?.page||1)-1)*Number(body?.limit||20))));const p=await productList(fake);return json(req,{ok:true,products:p.products.map((x:any)=>({id:x.id,name:x.name,price:Number(x.price_cents||0)/100,stock:x.stock_quantity,image_url:x.image_url,brand:x.brand,category:x.category,packaging:x.packaging,is_offer:x.regular_price_cents!=null})),page:Number(body?.page||1),limit:Number(body?.limit||20),total:null,has_more:p.next_offset!=null})}
    if(req.method==="POST"&&action==="lookup_customer_by_phone"){const ph=phone(body?.phone),rk=await sha(ph||ip(req)||"unknown"),gate=await db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-v2:lookup:"+rk,p_bucket:"lookup_customer",p_limit:20,p_window_seconds:300});if(gate.error)return json(req,{ok:false,error:"rate_limit_unavailable"},503);if(gate.data!==true)return json(req,{ok:false,error:"rate_limited"},429);return json(req,await lookupCustomer(body?.phone))}
    if(req.method==="POST"&&action==="create_order"){
      let ph=phone(body?.phone);
      if(!ph)return json(req,{ok:false,error:"invalid_phone"},400);
      const rk=await sha(ph+"|"+(ip(req)||"unknown"));
      const gate=await db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-v2:create:"+rk,p_bucket:"create_order",p_limit:5,p_window_seconds:600});
      if(gate.error)return json(req,{ok:false,error:"rate_limit_unavailable"},503);
      if(gate.data!==true)return json(req,{ok:false,error:"rate_limited"},429);
      const r=await db.rpc("create_storefront_order_v2",{p_phone:ph,p_items:Array.isArray(body?.items)?body.items:[],p_basket:body?.basket&&typeof body.basket==="object"?body.basket:null});
      if(r.error)return json(req,{ok:false,error:txt(r.error.message,120).split("\n")[0]||"order_failed"},400);
      const orderId=r.data?.order_id;
      let number=r.data?.order_number||"";
      if(orderId){
        const [link,storedOrder]=await Promise.all([
          db.rpc("ops2_order_public_link_v1",{p_order_id:orderId}),
          db.from("orders").select("order_number").eq("id",orderId).maybeSingle()
        ]);
        if(!storedOrder.error&&storedOrder.data?.order_number)number=storedOrder.data.order_number;
        if(!link.error&&link.data?.public_code)number=link.data.public_code;
      }
      return json(req,{ok:true,order:{id:orderId,number,total:Number(r.data?.total||0),message:r.data?.message||"",customer_found:Boolean(r.data?.customer_id),status:"storefront_received"}});
    }

    return json(req,{ok:false,error:"unknown_action"},400);
  }catch(e){console.error("storefront-v2 canonical-vitrine",e);return json(req,{ok:false,error:"service_unavailable",detail:txt((e as any)?.message,180)},500,{"Cache-Control":"no-store"})}
});


