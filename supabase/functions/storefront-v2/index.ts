import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(SUPABASE_URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const MINIMUM_ORDER_CENTS=7500;
const MAXIMUM_ORDER_CENTS=99_999_999_999_999;
const STOCK_CONFLICT_CODES=new Set<string>([
  "insufficient_stock","product_unavailable","basket_unavailable"
]);
const ORDER_CONFLICT_CODES=new Set<string>([
  ...STOCK_CONFLICT_CODES,"basket_mold_unavailable","basket_mold_not_configured",
  "basket_mold_component_invalid","basket_mold_option_invalid","basket_mold_composition_invalid",
  "checkout_price_changed","checkout_stock_changed"
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

function isProductOffer(p:any){
  if(p?.is_offer!==true||p?.offer_price==null||Number(p.offer_price)<0||Number(p.offer_price)>=Number(p.price||0))return false;
  if(p?.metadata?.offer_source==="auto_rotation"){
    const starts=Date.parse(String(p.metadata.offer_starts_at||""));
    const ends=Date.parse(String(p.metadata.offer_ends_at||""));
    const now=Date.now();
    if(!Number.isFinite(starts)||!Number.isFinite(ends)||starts>now||ends<=now)return false;
  }
  return true;
}
function pub(p:any,available?:number){
  const offer=isProductOffer(p),price=offer?p.offer_price:p.price;
  return {id:p.id,sku:p.sku||"",gtin:p.gtin||"",name:p.name,image_url:p.image_url||"",price_cents:cents(price),price_available:Number(price||0)>0,regular_price_cents:offer?cents(p.price):null,is_offer:offer,packaging:p.packaging||"",subcategory:p.customer_subsubcategory||p.subcategory||"",stock_quantity:p.is_active===false?0:Math.max(0,available??Number(p.stock||0)),is_active:p.is_active!==false,brand:p.brand||"",category:p.category||"",subsubcategory:p.customer_subsubcategory||p.subsubcategory||"",unit:p.unit||""};
}

async function moldDetail(basketId:string,compositionNumber:number,selections:any[]|null=null,includeAlternatives=true,allowUnavailablePreview=false){
  const [gate,mq,bq]=await Promise.all([
    db.rpc("basket_mold_cutover_ready_v1",{p_basket_id:basketId}),
    db.from("basket_molds").select("id,basket_id,hidden_adjustment,conditional_hidden_enabled,conditional_hidden_product_id,conditional_hidden_adjustment,public_composition_count,metadata").eq("basket_id",basketId).maybeSingle(),
    db.from("basket_templates").select("id,name,image_url,is_active").eq("id",basketId).maybeSingle()
  ]);
  if(gate.error)throw gate.error;if(gate.data!==true)return null;if(mq.error)throw mq.error;if(bq.error)throw bq.error;
  const mold=mq.data,basket=bq.data;
  if(!mold||!basket||basket.is_active!==true)return null;
  if(compositionNumber<1||compositionNumber>Number(mold.public_composition_count||1))return null;
  const posq=await db.from("basket_mold_positions").select("id,label,quantity,sort_order,metadata").eq("mold_id",mold.id).order("sort_order");
  if(posq.error)throw posq.error;
  const positions=posq.data||[];
  if(!positions.length)return null;
  const positionIds=positions.map((position:any)=>String(position.id));
  const oq=await db.from("basket_mold_position_options").select("position_id,product_id,sort_order,metadata").in("position_id",positionIds).order("sort_order").order("product_id");
  if(oq.error)throw oq.error;
  const options=oq.data||[];
  const optionsByPosition=new Map<string,any[]>();
  for(const option of options){
    const key=String(option.position_id),rows=optionsByPosition.get(key)||[];
    rows.push(option);
    optionsByPosition.set(key,rows);
  }

  const baselineByPosition=new Map<string,Array<{product_id:string;quantity:number}>>();
  const firstProductByPosition=new Map<string,string>();
  const baselineProductIds=new Set<string>();
  for(const position of positions){
    const positionId=String(position.id);
    const linked=(optionsByPosition.get(positionId)||[]).slice().sort((a:any,b:any)=>
      Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.product_id||"").localeCompare(String(b.product_id||""))
    );
    if(linked.length)firstProductByPosition.set(positionId,String(linked[0].product_id));
    const rows:Array<{product_id:string;quantity:number}>=[];
    linked.forEach((option:any,index:number)=>{
      const raw=option?.metadata?.base_quantity;
      const parsed=raw==null?null:Number(raw);
      const quantity=parsed!=null&&Number.isFinite(parsed)&&Number.isInteger(parsed)&&parsed>=0&&parsed<=999
        ?parsed
        :(index===0?Math.max(0,Math.trunc(Number(position.quantity||0))):0);
      if(quantity>0){
        const productId=String(option.product_id);
        rows.push({product_id:productId,quantity});
        baselineProductIds.add(productId);
      }
    });
    baselineByPosition.set(positionId,rows);
  }

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

  const linkedProductIds=includeAlternatives?options.map((option:any)=>String(option.product_id)):[];
  const requestedProductIds=[...requested.values()].flatMap((row:any)=>
    Array.isArray(row.options)?row.options.map((option:any)=>String(option.product_id||"")):[String(row.product_id||"")]
  );
  const readIds=[...new Set([...baselineProductIds,...linkedProductIds,...requestedProductIds,...firstProductByPosition.values()].filter(Boolean))];
  const [products,available,extraSections]=await Promise.all([
    moldProductsMap(readIds),moldAvailableStockMap(readIds),publicBasketExtraThemes()
  ]);

  const configuredBase=moldConfiguredBase(mold,positions,options,products);
  const initialPublicProductTotal=configuredBase.productTotalCents;
  const initialPublicConditionalCents=configuredBase.conditionalAppliedCents;
  let productTotal=0,capacity=30;
  const items:any[]=[];

  for(const position of positions){
    const positionId=String(position.id),baseQuantity=Number(position.quantity||0);
    const requestedRow=requested.get(positionId);
    const linkedOptions=optionsByPosition.get(positionId)||[];
    const fallbackId=requestedRow?.product_id||firstProductByPosition.get(positionId)||String(linkedOptions[0]?.product_id||"");
    if(!fallbackId&&!linkedOptions.length)return null;

    let rawSelectedOptions:any[];
    if(Array.isArray(requestedRow?.options)&&requestedRow.options.length){
      rawSelectedOptions=requestedRow.options;
    }else if(requestedRow){
      rawSelectedOptions=[{product_id:fallbackId,quantity:requestedRow.quantity??0}];
    }else{
      rawSelectedOptions=(baselineByPosition.get(positionId)||[]).slice();
      if(!rawSelectedOptions.length){
        const firstActive=linkedOptions.find((option:any)=>products.get(String(option.product_id))?.is_active===true);
        rawSelectedOptions=[{product_id:String(firstActive?.product_id||fallbackId),quantity:0}];
      }
    }

    const quantitiesByProduct=new Map<string,number>();
    const requestedByProduct=new Map<string,number>();
    for(const selected of rawSelectedOptions){
      const productId=uid(selected?.product_id);
      const quantity=selected?.quantity==null?0:Number(selected.quantity);
      if(!productId)throw new Error("basket_mold_option_invalid");
      if(!Number.isInteger(quantity)||quantity<0||quantity>1000)throw new Error("basket_mold_component_invalid");
      if(!linkedOptions.some((option:any)=>String(option.product_id)===productId))throw new Error("basket_mold_option_invalid");
      const combined=(requestedByProduct.get(productId)||0)+quantity;
      if(combined>1000)throw new Error("basket_mold_component_invalid");
      requestedByProduct.set(productId,combined);
      const product=products.get(productId),stock=Math.max(0,Number(available.get(productId)||0));
      const kept=product?.is_active===true?Math.min(combined,stock):0;
      quantitiesByProduct.set(productId,kept);
    }

    if(!quantitiesByProduct.size){
      const firstActive=linkedOptions.find((option:any)=>products.get(String(option.product_id))?.is_active===true);
      if(firstActive)quantitiesByProduct.set(String(firstActive.product_id),0);
    }

    const selectedOptions:any[]=[];
    let totalQuantity=0,manualReplacementRequired=false;
    for(const [productId,quantity] of quantitiesByProduct){
      const product=products.get(productId);
      if(!product)continue;
      const requestedQuantity=Number(requestedByProduct.get(productId)||0);
      const stock=Math.max(0,Number(available.get(productId)||0));
      const price=moldEffectivePriceCents(product);
      const unavailableConfiguredQuantity=requestedQuantity>quantity;
      totalQuantity+=quantity;
      if(totalQuantity>1000)throw new Error("basket_mold_component_invalid");
      productTotal+=Math.round(price*quantity);
      if(quantity>0&&!unavailableConfiguredQuantity)capacity=Math.min(capacity,Math.max(1,Math.floor(stock/quantity)));
      manualReplacementRequired=manualReplacementRequired||unavailableConfiguredQuantity;
      const configuredOption=linkedOptions.find((option:any)=>String(option.product_id)===productId);
      selectedOptions.push({
        product_id:product.id,quantity,name:product.name,brand:product.brand||"",
        sku:product.sku,gtin:product.gtin,image_url:product.image_url||"",
        packaging:product.packaging||"",stock_quantity:stock,price_cents:price,is_offer:isProductOffer(product),
        is_active:product.is_active===true,
        sort_order:Number(configuredOption?.sort_order||0)
      });
    }
    const selectedForDisplay=selectedOptions.find((option:any)=>option.quantity>0)
      ||selectedOptions.find((option:any)=>option.is_active===true)
      ||selectedOptions[0];
    const alternatives=includeAlternatives
      ?linkedOptions.map((option:any)=>{
        const product=products.get(String(option.product_id)),stock=Math.max(0,Number(available.get(String(option.product_id))||0));
        return product?.is_active===true?{
          product_id:product.id,name:product.name,brand:product.brand||"",sku:product.sku,
          gtin:product.gtin,image_url:product.image_url||"",packaging:product.packaging||"",
          stock_quantity:stock,price_cents:moldEffectivePriceCents(product),is_active:true,is_offer:isProductOffer(product),sort_order:Number(option.sort_order||0)
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
    const sessionId=String(position.metadata?.site_basket_product_session_id||positionId);
    const cleanLabel=String(position.label||"").replace(/\s+·\s+Padrão\s+\d+$/i,"").trim();
    items.push({
      position_id:positionId,session_id:sessionId,slot_order:1,label:cleanLabel,
      product_id:selectedForDisplay?.product_id||fallbackId||"",
      is_active:selectedForDisplay?.is_active===true,
      name:selectedForDisplay?.name||"",brand:selectedForDisplay?.brand||"",
      sku:selectedForDisplay?.sku||null,gtin:selectedForDisplay?.gtin||null,
      image_url:selectedForDisplay?.image_url||"",packaging:selectedForDisplay?.packaging||"",
      stock_quantity:Number(selectedForDisplay?.stock_quantity||0),
      base_quantity:baseQuantity,quantity:totalQuantity,
      selected_options:selectedOptions,
      price_cents:Number(selectedForDisplay?.price_cents||0),is_offer:selectedForDisplay?.is_offer===true,
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
    items,extras:extraSections.sections,extras_configured:extraSections.configured
  };
}
// Read the available brands of one basket position only when requested by the customer.
function compareMoldPositionOptionOrder(a:any,b:any){
  const aOrder=Number(a.sort_order||0),bOrder=Number(b.sort_order||0);
  return aOrder-bOrder
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
    return product?.is_active===true?{
      product_id:product.id,name:product.name,brand:product.brand||"",sku:product.sku,gtin:product.gtin,
      image_url:product.image_url||"",packaging:product.packaging||"",stock_quantity:available,
      price_cents:moldEffectivePriceCents(product),is_offer:isProductOffer(product),sort_order:Number(row.sort_order||0)
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
      return product?.is_active===true?{
        product_id:product.id,name:product.name,sku:product.sku,gtin:product.gtin,
        image_url:product.image_url||"",packaging:product.packaging||"",
        stock_quantity:available,price_cents:moldEffectivePriceCents(product),is_active:true,is_offer:isProductOffer(product),sort_order:Number(option.sort_order||0)
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

async function home(priorityOnly=false){
  const [moldCards,categoriesQ,subcategoriesQ]=await Promise.all([
    moldHomeCards(priorityOnly),
    db.from("basket_categories").select("id,name,slug,sort_order,is_active").eq("is_active",true).order("sort_order"),
    db.from("basket_subcategories").select("id,category_id,name,sort_order,is_active").eq("is_active",true).order("sort_order")
  ]);
  if(categoriesQ.error)throw categoriesQ.error;if(subcategoriesQ.error)throw subcategoriesQ.error;
  const categories=categoriesQ.data||[],subcategories=subcategoriesQ.data||[];
  const basketTaxonomy=categories.map((category:any)=>({
    ...category,
    subcategories:subcategories.filter((subcategory:any)=>String(subcategory.category_id)===String(category.id))
      .map((subcategory:any)=>({id:subcategory.id,category_id:subcategory.category_id,name:subcategory.name,sort_order:subcategory.sort_order}))
  }));
  return {
    ok:true,version:"mold-basket-commerce-v2",priority:priorityOnly,
    baskets:moldCards,categories:CATEGORIES,basket_categories:basketTaxonomy
  };
}
// R2: Persist a public, read-only catalog snapshot between Edge Function instances.
// Never trust snapshot prices/stock when quoting a basket or submitting an order.
function isValidPublicHome(value:any):boolean{
  // An empty current catalog is valid: it clears stale cards for baskets that cannot be sold.
  return Boolean(value?.ok===true&&value?.version==="mold-basket-commerce-v2"&&value?.priority!==true&&Array.isArray(value.baskets)&&Array.isArray(value.basket_categories));
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
    const key=keyOf(sub.name);
    const fixedPriceCents=mold?.metadata?.site_admin_default_price_cents;
    const displayPriceCents=typeof fixedPriceCents==="number"&&Number.isSafeInteger(fixedPriceCents)&&fixedPriceCents>=0?fixedPriceCents:null;
    sizeCards.push({id:String(template.id),card_key:String(template.id)+"@1",name:String(sub.name||template.name||"Cesta"),model_name:String(sub.name||template.name||"Cesta"),image_url:template.image_url||"",category_id:String(complete.id),category_name:complete.name,category_slug:complete.slug,category_sort_order:Number(complete.sort_order||0),subcategory_id:String(sub.id),subcategory_name:sub.name,subcategory_sort_order:Number(sub.sort_order||0),size_key:key,size_card:true,home_shell:true,mold_mode:true,display_price_cents:displayPriceCents});
  }
  if(sizeCards.length!==sizeOrder.length)throw new Error("home_size_cards_incomplete");
  return {ok:true,version:"home-size-shell-v2",priority:false,home_size_cards:true,baskets:sizeCards,categories:CATEGORIES,basket_categories:[{...complete,subcategories:sizes}]};
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
const MOLD_PRODUCT_READ_CHUNK_SIZE=128;
function moldProductIdChunks(ids:string[]){
  const chunks:string[][]=[];
  for(let index=0;index<ids.length;index+=MOLD_PRODUCT_READ_CHUNK_SIZE){
    chunks.push(ids.slice(index,index+MOLD_PRODUCT_READ_CHUNK_SIZE));
  }
  return chunks;
}
async function moldAvailableStockMap(productIds:string[]){
  const ids=[...new Set(productIds.filter(Boolean))],out=new Map<string,number>();
  if(!ids.length)return out;
  const batches=await Promise.all(moldProductIdChunks(ids).map(async(chunk:string[])=>{
    const {data,error}=await db.from("storefront_product_sellable_stock_v1")
      .select("product_id,sellable_stock,is_active").in("product_id",chunk);
    if(error)throw error;
    return data||[];
  }));
  for(const rows of batches)for(const r of rows){
    out.set(String(r.product_id),r.is_active===true?Math.max(0,Number(r.sellable_stock||0)):0);
  }
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

function moldEffectivePriceCents(p:any){const n=isProductOffer(p)?Number(p.offer_price):Number(p?.price||0);return cents(n)}

function moldConfiguredBase(mold:any,positions:any[],options:any[],products:Map<string,any>){
  let productTotalCents=0,conditionalPresent=false;
  const optionsByPosition=new Map<string,any[]>();
  for(const option of options||[]){
    const key=String(option?.position_id||"");
    const rows=optionsByPosition.get(key)||[];
    rows.push(option);
    optionsByPosition.set(key,rows);
  }
  for(const position of positions||[]){
    const positionId=String(position.id||"");
    const linked=(optionsByPosition.get(positionId)||[]).slice().sort((a:any,b:any)=>
      Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.product_id||"").localeCompare(String(b.product_id||""))
    );
    linked.forEach((option:any,index:number)=>{
      const raw=option?.metadata?.base_quantity;
      const parsed=raw==null?null:Number(raw);
      const quantity=parsed!=null&&Number.isFinite(parsed)&&parsed>=0
        ?parsed
        :(index===0?Math.max(0,Number(position.quantity||0)):0);
      const productId=String(option.product_id||"");
      const product=products.get(productId);
      if(product&&quantity>0)productTotalCents+=Math.round(moldEffectivePriceCents(product)*quantity);
      if(mold?.conditional_hidden_enabled===true&&mold?.conditional_hidden_product_id
        &&Number(mold?.conditional_hidden_adjustment||0)>0
        &&productId===String(mold.conditional_hidden_product_id)&&quantity>0)conditionalPresent=true;
    });
  }
  const conditionalAppliedCents=conditionalPresent?cents(mold.conditional_hidden_adjustment||0):0;
  const fixedDefaultPriceCents=mold?.metadata?.site_admin_default_price_cents;
  const hasFixedDefaultPrice=typeof fixedDefaultPriceCents==="number"&&Number.isSafeInteger(fixedDefaultPriceCents)&&fixedDefaultPriceCents>=0;
  const fallbackTotalCents=Math.max(0,productTotalCents+cents(mold?.hidden_adjustment||0)+conditionalAppliedCents);
  return {productTotalCents,conditionalAppliedCents,totalCents:hasFixedDefaultPrice?fixedDefaultPriceCents:fallbackTotalCents};
}

async function moldProductsMap(ids:string[]){
  const clean=[...new Set(ids.filter(Boolean))],out=new Map<string,any>();
  if(!clean.length)return out;
  const batches=await Promise.all(moldProductIdChunks(clean).map(async(chunk:string[])=>{
    const q=await db.from("products")
      .select("id,name,brand,sku,gtin,image_url,packaging,price,offer_price,is_offer,is_active,metadata")
      .in("id",chunk);
    if(q.error)throw q.error;
    return q.data||[];
  }));
  for(const rows of batches)for(const p of rows)out.set(String(p.id),p);
  return out
}

async function publicBasketExtraThemes(){
  const themeQ=await db.from("basket_extra_themes")
    .select("id,name,sort_order,search_terms,sales_categories,is_active")
    .order("sort_order").order("created_at");
  if(themeQ.error)throw themeQ.error;
  const rows=themeQ.data||[];
  const hasConfiguration=(row:any)=>
    (Array.isArray(row?.search_terms)&&row.search_terms.some((term:any)=>txt(term,80)))||
    (Array.isArray(row?.sales_categories)&&row.sales_categories.length>0);
  const configured=rows.some(hasConfiguration);
  const sections=rows.filter((row:any)=>row.is_active===true&&Array.isArray(row.search_terms)&&row.search_terms.some((term:any)=>txt(term,80))&&Array.isArray(row.sales_categories)&&row.sales_categories.length>0)
    .map((row:any)=>({
      id:String(row.id),label:String(row.name||"Produtos extras"),sort_order:Number(row.sort_order||0),
      search_enabled:true,product_count:0,products:[],products_loaded:false
    }));
  return {sections,configured};
}

async function moldHomeCards(priorityOnly=false){
  const mq=await db.from("basket_molds").select("id,basket_id,hidden_adjustment,conditional_hidden_enabled,conditional_hidden_product_id,conditional_hidden_adjustment,public_composition_count,metadata");
  if(mq.error)throw mq.error;
  let molds=mq.data||[];
  if(!molds.length)return [];
  const allBasketIds=[...new Set(molds.map((m:any)=>String(m.basket_id)))];
  const [templateResult,categoryQ,subcategoryQ]=await Promise.all([
    db.from("basket_templates").select("id,name,image_url,is_active,category_id,subcategory_id,sort_order").in("id",allBasketIds),
    db.from("basket_categories").select("id,name,slug,sort_order,is_active").eq("is_active",true).order("sort_order"),
    db.from("basket_subcategories").select("id,category_id,name,sort_order,is_active").eq("is_active",true).order("sort_order")
  ]);
  if(templateResult.error)throw templateResult.error;
  if(categoryQ.error)throw categoryQ.error;
  if(subcategoryQ.error)throw subcategoryQ.error;
  const baskets=(templateResult.data||[]).filter((b:any)=>b.is_active===true);
  const basketById=new Map(baskets.map((b:any)=>[String(b.id),b]));
  const complete=(categoryQ.data||[]).find((c:any)=>c.slug==="cestas-completas");
  if(priorityOnly){
    const largeIds=new Set((subcategoryQ.data||[]).filter((s:any)=>
      String(s.category_id)===String(complete?.id)
      &&String(s.name||"").trim().toLocaleLowerCase("pt-BR")==="grande"
    ).map((s:any)=>String(s.id)));
    const largeBasketIds=new Set(baskets.filter((b:any)=>
      String(b.category_id)===String(complete?.id)&&largeIds.has(String(b.subcategory_id))
    ).map((b:any)=>String(b.id)));
    molds=molds.filter((m:any)=>largeBasketIds.has(String(m.basket_id)));
  }else{
    molds=molds.filter((m:any)=>basketById.has(String(m.basket_id)));
  }
  if(!molds.length)return [];
  const basketIds=molds.map((m:any)=>String(m.basket_id));
  const moldIds=molds.map((m:any)=>String(m.id));
  const positionsQ=await db.from("basket_mold_positions").select("id,mold_id,quantity,sort_order,metadata").in("mold_id",moldIds).order("sort_order");
  if(positionsQ.error)throw positionsQ.error;
  const positionRows=positionsQ.data||[];
  const positionsByMold=new Map<string,any[]>();
  for(const position of positionRows){
    const id=String(position.mold_id),rows=positionsByMold.get(id)||[];
    rows.push(position);positionsByMold.set(id,rows);
  }
  const positionIds=positionRows.map((p:any)=>String(p.id));
  const optionsQ=positionIds.length
    ?await db.from("basket_mold_position_options").select("position_id,product_id,sort_order,metadata").in("position_id",positionIds).order("sort_order").order("product_id")
    :({data:[],error:null} as any);
  if(optionsQ.error)throw optionsQ.error;
  const optionRows=optionsQ.data||[];
  const optionsByPosition=new Map<string,any[]>();
  for(const option of optionRows){
    const id=String(option.position_id),rows=optionsByPosition.get(id)||[];
    rows.push(option);optionsByPosition.set(id,rows);
  }
  const productIds=[...new Set(optionRows.map((o:any)=>String(o.product_id)).filter(Boolean))];
  const [products,available]=await Promise.all([
    moldProductsMap(productIds),
    moldAvailableStockMap(productIds)
  ]);
  const categoryMap=new Map((categoryQ.data||[]).map((x:any)=>[String(x.id),x]));
  const subcategoryMap=new Map((subcategoryQ.data||[]).map((x:any)=>[String(x.id),x]));
  const cards:any[]=[];
  for(const mold of molds){
    const basket=basketById.get(String(mold.basket_id));
    if(!basket)continue;
    const category=basket.category_id?categoryMap.get(String(basket.category_id)):null;
    const subcategory=basket.subcategory_id?subcategoryMap.get(String(basket.subcategory_id)):null;
    if(!category||!subcategory||String(subcategory.category_id)!==String(category.id))continue;
    const positions=(positionsByMold.get(String(mold.id))||[]).slice().sort((a:any,b:any)=>
      Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.id).localeCompare(String(b.id))
    );
    if(!positions.length)continue;
    const carousel:any[]=[];
    let valid=true,capacity=30,manualReplacementCount=0,actualProductTotalCents=0,conditionalPresent=false,totalItemCount=0;
    const configuredOptions=positions.flatMap((position:any)=>optionsByPosition.get(String(position.id))||[]);
    if(positions.some((position:any)=>(optionsByPosition.get(String(position.id))||[]).length<1))valid=false;
    if(!valid)continue;
    const configuredBase=moldConfiguredBase(mold,positions,configuredOptions,products);
    for(const position of positions){
      const positionId=String(position.id);
      const sessionId=String(position.metadata?.site_basket_product_session_id||positionId);
      const label=String(position.label||"").replace(/\s+·\s+Padrão\s+\d+$/i,"").trim();
      const linked=(optionsByPosition.get(positionId)||[]).slice().sort((a:any,b:any)=>
        Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.product_id||"").localeCompare(String(b.product_id||""))
      );
      linked.forEach((option:any,index:number)=>{
        const raw=option?.metadata?.base_quantity,parsed=raw==null?null:Number(raw);
        const requested=parsed!=null&&Number.isFinite(parsed)&&Number.isInteger(parsed)&&parsed>=0&&parsed<=999
          ?parsed:(index===0?Math.max(0,Math.trunc(Number(position.quantity||0))):0);
        const product=products.get(String(option.product_id));
        const stock=Math.max(0,Number(available.get(String(option.product_id))||0));
        const price=product?moldEffectivePriceCents(product):0;
        const quantity=product?.is_active===true?Math.min(requested,stock):0;
        if(requested>quantity)manualReplacementCount++;
        if(quantity>0){
          actualProductTotalCents+=Math.round(price*quantity);
          totalItemCount+=quantity;
          capacity=Math.min(capacity,Math.max(1,Math.floor(stock/quantity)));
          if(mold.conditional_hidden_enabled===true&&String(option.product_id)===String(mold.conditional_hidden_product_id))conditionalPresent=true;
          carousel.push({
            position_id:positionId,session_id:sessionId,label,product_id:String(product.id),
            name:product.name,brand:product.brand||"",sku:product.sku,gtin:product.gtin,
            image_url:product.image_url||"",packaging:product.packaging||"",quantity,
            stock_quantity:stock,price_cents:price,is_active:true,
            alternative_count:linked.filter((other:any)=>products.get(String(other.product_id))?.is_active===true).length,
            manual_replacement_required:false
          });
        }
      });
    }
    const conditionalApplied=conditionalPresent?cents(mold.conditional_hidden_adjustment||0):0;
    const priceCents=Math.max(0,configuredBase.totalCents+actualProductTotalCents-configuredBase.productTotalCents+conditionalApplied-configuredBase.conditionalAppliedCents);
    const basketName=String(subcategory.name||String(basket.name).replace(/\s+Completa$/i,""));
    cards.push({
      id:String(basket.id),card_key:String(basket.id)+"@1",mold_mode:true,mold_id:String(mold.id),
      composition_number:1,public_composition_count:1,name:basketName,model_name:basketName,
      display_price_cents:priceCents,hidden_adjustment_cents:cents(mold.hidden_adjustment??0),
      conditional_hidden_enabled:mold.conditional_hidden_enabled===true,
      conditional_hidden_product_id:mold.conditional_hidden_product_id||null,
      conditional_hidden_adjustment_cents:cents(mold.conditional_hidden_adjustment||0),
      conditional_hidden_applied_cents:conditionalApplied,image_url:basket.image_url||"",
      stock_quantity:Math.max(1,capacity),manual_replacement_required:manualReplacementCount>0,
      manual_replacement_count:manualReplacementCount,category_id:category.id,category_name:category.name,
      category_slug:category.slug,category_sort_order:Number(category.sort_order||0),
      subcategory_id:subcategory.id,subcategory_name:subcategory.name,
      subcategory_sort_order:Number(subcategory.sort_order||0),total_item_count:totalItemCount,
      carousel_items:carousel.slice(0,6)
    });
  }
  cards.sort((a:any,b:any)=>a.category_sort_order-b.category_sort_order
    ||a.subcategory_sort_order-b.subcategory_sort_order
    ||String(a.id).localeCompare(String(b.id)));
  return cards;
}async function eanCaptureProductIds(){
  const {data,error}=await db.from("ean_capture_records_v1").select("matched_product_id,created_at").eq("sync_status","found").not("matched_product_id","is",null).order("created_at",{ascending:false}).limit(10000);
  if(error)throw error;const seen=new Set<string>(),ids:string[]=[];
  for(const row of data||[]){const id=String(row.matched_product_id||"");if(id&&!seen.has(id)){seen.add(id);ids.push(id)}}
  return ids;
}
async function offerList(){
  const rows=(await activeProductRows("id,sku,gtin,name,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit,metadata,is_active"))
    .filter((p:any)=>isProductOffer(p))
    .sort((a:any,b:any)=>String(a.name||"").localeCompare(String(b.name||""),"pt-BR")).slice(0,200);
  const sm=await orderableProductStockMap(rows.map((p:any)=>p.id));
  return {ok:true,offers:rows.map((p:any)=>({...pub(p,sm.get(p.id)||0),product_id:p.id,offer_priority:["expiry_auto"].includes(String(p.metadata?.offer_source||""))?0:1})).filter((p:any)=>p.stock_quantity>0&&p.price_available).sort((a:any,b:any)=>a.offer_priority-b.offer_priority||a.name.localeCompare(b.name,"pt-BR")).slice(0,160)};
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
async function builderCategoryList(){
  const result=await db.from("storefront_builder_categories_v1").select("category_key,label,sort_order").eq("is_active",true).order("sort_order",{ascending:true}).order("category_key",{ascending:true});
  if(result.error)throw result.error;
  const allowed=new Map(CATEGORIES.map(category=>[category.key,category]));
  const categories=(result.data||[]).filter((row:any)=>allowed.has(String(row.category_key||""))).map((row:any)=>{
    const fallback=allowed.get(String(row.category_key))!;
    return {category_key:fallback.key,label:txt(row.label,80)||fallback.label,sort_order:Number(row.sort_order||0)};
  });
  return {ok:true,categories};
}

async function productList(url:URL){
  const c=txt(url.searchParams.get("category"),48),sc=txt(url.searchParams.get("subcategory"),100),rawQuery=safeQ(url.searchParams.get("q")),limit=Math.floor(clamp(url.searchParams.get("limit")||24,1,36)),offset=Math.floor(clamp(url.searchParams.get("offset")||0,0,5000));
  const fold=(value:any)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g," ").trim();
  const isMostSoldCategory=fold(c)==="mais vendidos";
  const queryText=fold(rawQuery),terms=queryText.split(/\s+/).filter(Boolean).slice(0,4);
  const requestedCategories=String(url.searchParams.get("categories")||"").split(",").slice(0,16).map(value=>txt(value,48).toLocaleLowerCase("pt-BR")).filter(Boolean),allowedCategories=new Set(CATEGORIES.map(category=>category.key)),categories=Array.from(new Set(requestedCategories.filter(category=>allowedCategories.has(category)))).slice(0,4);
  if(!c&&requestedCategories.length&&!categories.length)return {ok:true,products:[],next_offset:null};
  const data=await activeProductRows("id,sku,gtin,name,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit,is_active,sales_category,storefront_featured,tags,sort_order,metadata",isMostSoldCategory?"":c,sc);
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

async function basketExtraProducts(themeIdValue:string,offsetValue:any,limitValue:any){
  const themeId=uid(themeIdValue);
  if(!themeId)return {error:"extra_section_invalid_id",status:400};
  const offset=Math.floor(clamp(offsetValue,0,5000));
  const limit=Math.floor(clamp(limitValue||15,1,36));
  const themeQ=await db.from("basket_extra_themes")
    .select("id,search_terms,sales_categories,is_active")
    .eq("id",themeId).eq("is_active",true).maybeSingle();
  if(themeQ.error)throw themeQ.error;
  const theme=themeQ.data;
  if(!theme)return {ok:true,products:[],next_offset:null};

  const fold=(value:any)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g," ").trim();
  const terms=(Array.isArray(theme.search_terms)?theme.search_terms:[])
    .slice(0,20)
    .map((value:any)=>({query:fold(txt(value,80)),tokens:fold(txt(value,80)).split(/\s+/).filter(Boolean)}))
    .filter((term:any)=>term.query&&term.tokens.length);
  const allowedCategories=new Set(CATEGORIES.map((category:any)=>category.key));
  const categories=[...new Set((Array.isArray(theme.sales_categories)?theme.sales_categories:[])
    .map((value:any)=>txt(value,48).toLocaleLowerCase("pt-BR"))
    .filter((value:string)=>allowedCategories.has(value)))];
  if(!terms.length||!categories.length)return {ok:true,products:[],next_offset:null};

  const selection="id,sku,gtin,name,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit,is_active,sales_category";
  const categoryRows=await Promise.all(categories.map((category:string)=>activeProductRows(selection,category)));
  const productsById=new Map<string,any>();
  for(const rows of categoryRows)for(const product of rows)productsById.set(String(product.id),product);

  const ranked:any[]=[];
  for(const product of productsById.values()){
    const name=fold(product.name);
    let best:any=null;
    for(let index=0;index<terms.length;index++){
      const term=terms[index];
      if(!term.tokens.every((token:string)=>name.includes(token)))continue;
      const relevance=name===term.query?0:name.startsWith(term.query)?1:name.includes(term.query)?2:3;
      if(!best||index<best.termOrder||(index===best.termOrder&&relevance<best.relevance))best={termOrder:index,relevance};
    }
    if(best)ranked.push({product,termOrder:best.termOrder,relevance:best.relevance});
  }
  ranked.sort((a:any,b:any)=>a.termOrder-b.termOrder||a.relevance-b.relevance||
    String(a.product.name||"").localeCompare(String(b.product.name||""),"pt-BR")||
    String(a.product.id).localeCompare(String(b.product.id)));

  const publicRows:any[]=[];
  let cursor=offset;
  while(cursor<ranked.length&&publicRows.length<limit){
    const chunk=ranked.slice(cursor,cursor+Math.max(48,limit*4));
    const stock=await orderableProductStockMap(chunk.map((row:any)=>String(row.product.id)));
    for(const row of chunk){
      cursor++;
      const candidate=pub(row.product,stock.get(String(row.product.id))||0);
      if(candidate.stock_quantity>0&&candidate.price_available)publicRows.push(candidate);
      if(publicRows.length>=limit)break;
    }
  }
  return {ok:true,products:publicRows,next_offset:cursor<ranked.length?cursor:null};
}

async function oneProduct(id:string){
  const {data:p,error}=await db.from("products").select("id,sku,gtin,name,description_short,description_long,image_url,price,offer_price,stock,packaging,is_offer,brand,category,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory,unit,is_active,metadata").eq("id",id).maybeSingle();
  if(error)throw error;if(!p||p.is_active!==true)return null;
  const sm=await orderableProductStockMap([id]),o=pub(p,sm.get(id)||0);
  if(o.stock_quantity<=0||!o.price_available)return null;
  const characteristics=[["Marca",p.brand],["Embalagem",p.packaging],["Unidade",p.unit],["Categoria",p.category],["Subcategoria",p.subcategory],["Tipo",p.customer_subsubcategory||p.subsubcategory]].filter((x:any)=>txt(x[1],200)).map((x:any)=>({label:x[0],value:String(x[1])}));
  return {...o,sku:p.sku||"",gtin:p.gtin||"",description:p.description_long||p.description_short||"",characteristics};
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
    db.from("customer_addresses").select("id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_default,updated_at,created_at").eq("customer_id",id).eq("is_active",true).order("is_default",{ascending:false}).order("created_at",{ascending:true}).limit(50),
    db.rpc("ops2_customer_registration_state_v1",{p_customer_id:id})
  ]);
  if(cq.error)throw cq.error;if(aq.error)throw aq.error;if(sq.error)throw sq.error;if(!cq.data)return null;
  const doc=String(cq.data.cpf_cnpj||"").replace(/\D+/g,"");
  const addresses=(aq.data||[]).map((row:any)=>({
    id:row.id,label:row.label||"Endereço",street:row.street||"",number:row.number||"",
    complement:row.complement||"",neighborhood:row.neighborhood||"",district:row.neighborhood||"",
    city:row.city||"",state:row.state||"MT",postal_code:row.postal_code||"",
    reference:row.reference||"",raw_text:row.reference||"",is_default:row.is_default===true,
    updated_at:row.updated_at||""
  }));
  return {id:cq.data.id,display_name:cq.data.name||"",phone:cq.data.primary_whatsapp_e164||"",
    document_present:doc.length===11||doc.length===14,document_last4:doc?doc.slice(-4):"",
    marketing_opt_in:cq.data.marketing_opt_in===true,registration_complete:sq.data?.registration_complete===true,
    missing_fields:Array.isArray(sq.data?.missing_fields)?sq.data.missing_fields:[],
    addresses,address:addresses[0]||null};
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
function publicCheckoutCustomer(customer:any){
  if(!customer||typeof customer!=="object")return null;
  const cleanAddress=(address:any)=>{
    if(!address||typeof address!=="object")return null;
    const id=uid(address.id);
    if(!id)return null;
    return {
      id,label:txt(address.label,60)||"Endereço",
      street:txt(address.street,180),number:txt(address.number,40),
      complement:txt(address.complement,180),
      neighborhood:txt(address.neighborhood??address.district,120),
      district:txt(address.district??address.neighborhood,120),
      city:txt(address.city,100),state:(txt(address.state,2)||"MT").toUpperCase(),
      postal_code:txt(address.postal_code,12),reference:txt(address.reference,220),
      is_default:address.is_default===true
    };
  };
  const addresses=(Array.isArray(customer.addresses)?customer.addresses:[])
    .map(cleanAddress).filter(Boolean);
  const active=cleanAddress(customer.address);
  if(active&&!addresses.some((address:any)=>address.id===active.id))addresses.unshift(active);
  return {
    display_name:txt(customer.display_name,180),phone:txt(customer.phone,32),
    registration_complete:customer.registration_complete===true,
    addresses,address:active||addresses[0]||null
  };
}
async function publicCustomerLookup(req:Request,raw:any){
  const ph=phone(raw),rk=await sha(ph||ip(req)||"unknown");
  const gate=await db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-v2:customer-lookup:"+rk,p_bucket:"lookup_customer",p_limit:20,p_window_seconds:300});
  if(gate.error)return {error:"rate_limit_unavailable",status:503};
  if(gate.data!==true)return {error:"rate_limited",status:429};
  const result=await lookupCustomer(raw);
  const found=result?.found===true&&Boolean(result?.customer);
  return {ok:true,found,ambiguous:result?.ambiguous===true,
    customer:found?publicCheckoutCustomer(result.customer):null};
}
async function allowCustomerAddressAttempts(req:Request,ph:string){
  const [ipKey,phoneKey]=await Promise.all([sha(ip(req)||"unknown"),sha(ph)]);
  const [ipGate,phoneGate]=await Promise.all([
    db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-v2:customer-address:ip:"+ipKey,p_bucket:"customer_address",p_limit:30,p_window_seconds:900}),
    db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-v2:customer-address:phone:"+phoneKey,p_bucket:"customer_address",p_limit:8,p_window_seconds:900})
  ]);
  if(ipGate.error||phoneGate.error)return {error:"rate_limit_unavailable",status:503};
  if(ipGate.data!==true||phoneGate.data!==true)return {error:"rate_limited",status:429};
  return {ok:true};
}
function validBrazilDocument(value:any){
  const d=String(value??"").replace(/\D/g,"");
  if(/^([0-9])\1+$/.test(d))return false;
  if(d.length===11){
    const digit=(base:string,weight:number[])=>{const sum=[...base].reduce((a,n,i)=>a+Number(n)*weight[i],0);const r=sum%11;return r<2?0:11-r};
    return digit(d.slice(0,9),[10,9,8,7,6,5,4,3,2])===Number(d[9])&&digit(d.slice(0,10),[11,10,9,8,7,6,5,4,3,2])===Number(d[10]);
  }
  if(d.length===14){
    const digit=(base:string,weight:number[])=>{const sum=[...base].reduce((a,n,i)=>a+Number(n)*weight[i],0);const r=sum%11;return r<2?0:11-r};
    return digit(d.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])===Number(d[12])&&digit(d.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2])===Number(d[13]);
  }
  return false;
}
async function verifyCheckoutCustomerDocument(req:Request,input:any){
  const ph=phone(input?.phone);
  if(!ph)return {error:"invalid_phone",status:400};
  const gate=await allowCustomerAddressAttempts(req,ph);
  if(gate.error)return gate;
  const found=await lookupCustomer(ph);
  if(found?.ambiguous)return {error:"ambiguous_phone",status:409};
  if(!found?.found||!found?.customer?.id)return {error:"customer_not_found",status:404};
  const customer=found.customer;
  const stored=await db.from("customers").select("cpf_cnpj").eq("id",customer.id).maybeSingle();
  if(stored.error)return {error:"customer_lookup_unavailable",status:503};
  const storedDocument=String(stored.data?.cpf_cnpj||"").replace(/\D/g,"");
  let last4=String(input?.document_last4||"").replace(/\D/g,"");
  if(storedDocument.length===11||storedDocument.length===14){
    if(last4.length!==4||last4!==storedDocument.slice(-4))return {error:"document_mismatch",status:403};
  }else{
    const fullDocument=String(input?.document||"").replace(/\D/g,"");
    if(!validBrazilDocument(fullDocument))return {error:"document_missing",status:400};
    const bound=await db.rpc("ops3_storefront_customer_document_bind_v1",{
      p_customer_id:customer.id,p_phone:ph,p_document:fullDocument
    });
    if(bound.error)return {error:"document_confirmation_unavailable",status:503};
    if(bound.data?.ok!==true){
      const code=txt(bound.data?.error,80)||"document_confirmation_failed";
      return {error:code,status:code==="document_already_in_use"?409:403};
    }
    last4=fullDocument.slice(-4);
  }
  return {ok:true,phone:ph,document_last4:last4,customer:await loadCustomerForCheckout(customer.id)};
}
async function customerAddressLookup(req:Request,input:any){
  const verified=await verifyCheckoutCustomerDocument(req,input);
  if(verified.error)return verified;
  return {ok:true,found:true,customer:verified.customer};
}
async function customerAddressAdd(req:Request,input:any){
  const ph=phone(input?.phone);
  if(!ph)return {error:"invalid_phone",status:400};
  const gate=await allowCustomerAddressAttempts(req,ph);
  if(gate.error)return gate;
  const found=await lookupCustomer(ph);
  if(found?.ambiguous)return {error:"ambiguous_phone",status:409};
  if(!found?.found||!found?.customer?.id)return {error:"customer_not_found",status:404};
  const customer=found.customer;
  const address={
    street:txt(input?.street,180),number:txt(input?.number,40),complement:txt(input?.complement,180),
    neighborhood:txt(input?.neighborhood,120),city:txt(input?.city,100),state:"MT",
    postal_code:txt(input?.postal_code,12),reference:txt(input?.reference,220)
  };
  const result=await db.rpc("ops3_storefront_customer_address_add_v1",{
    p_customer_id:customer.id,p_phone:ph,
    p_document_last4:String(customer.document_last4||"").replace(/\D/g,"").slice(-4),
    p_label:txt(input?.label,60)||"Outro endereço",p_address:address
  });
  if(result.error)return {error:"address_save_unavailable",status:503};
  if(result.data?.ok!==true){
    const code=txt(result.data?.error,80)||"address_save_failed";
    const status=code==="document_mismatch"?403:code==="customer_not_found"?404:code==="unsupported_city"?400:400;
    return {error:code,status};
  }
  const updatedCustomer=publicCheckoutCustomer(await loadCustomerForCheckout(customer.id));
  return {ok:true,created:result.data.created===true,address:result.data.address||null,
    address_id:result.data.address?.id||null,customer:updatedCustomer};
}
async function registerCustomer(req:Request,p:any){
  const ph=phone(p?.phone);if(!ph)return {error:"invalid_phone",status:400};
  const [ipKey,phoneKey]=await Promise.all([sha(ip(req)||"unknown"),sha(ph)]);
  const [a,b]=await Promise.all([
    db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-register:ip:"+ipKey,p_bucket:"register_customer",p_limit:20,p_window_seconds:600}),
    db.rpc("consume_public_rate_limit",{p_rate_key:"storefront-register:phone:"+phoneKey,p_bucket:"register_customer",p_limit:8,p_window_seconds:600})
  ]);
  if(a.error||b.error)return {error:"rate_limit_unavailable",status:503};if(a.data!==true||b.data!==true)return {error:"rate_limited",status:429};
  const document=txt(p?.document,30);
  if(p?.source==="checkout"){
    const existingId=await customerIdByPhone(ph);
    if(existingId)return {error:"existing_customer_requires_verification",status:409};
    const documentDigits=document.replace(/\D/g,"");
    if([11,14].includes(documentDigits.length)){
      const existingDocument=await db.rpc("ops2_site_admin_customer_by_document_v1",{p_document:documentDigits});
      if(existingDocument.error)return {error:"registration_unavailable",status:503};
      if(uid(existingDocument.data))return {error:"document_already_in_use",status:409};
    }
  }
  const r=await db.rpc("ops3_storefront_customer_register_v1",{
    p_phone:ph,p_name:txt(p?.name,180),p_document:document,p_street:txt(p?.street,180),p_number:txt(p?.number,40),
    p_neighborhood:txt(p?.neighborhood,120),p_city:txt(p?.city,100),p_complement:txt(p?.complement,180)||null,
    p_reference:txt(p?.reference,220)||null,p_postal_code:txt(p?.postal_code,12)||null,
    p_marketing_opt_in:typeof p?.marketing_opt_in==="boolean"?p.marketing_opt_in:null,
    p_source_key:p?.source==="checkout"?"site_checkout":"site_registration_page",
    p_address_label:txt(p?.label,60)||"Casa"
  });
  if(r.error)return {error:"registration_unavailable",status:503};
  if(r.data?.ok!==true){const e=txt(r.data?.error,100)||"registration_failed";return {error:e,status:["document_already_in_use","document_mismatch","identity_mismatch","existing_customer_requires_verification"].includes(e)?409:400};}
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

type StockAdjustment={kind:"product"|"basket_mold";id:string;name:string;image_url?:string;action:"removed"|"reduced";requested:number;available:number;reason:string};
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
    const kind=raw?.type==="basket_mold"?"basket_mold":"product",id=uid(raw?.id),requested=Math.max(1,Math.min(30,Math.trunc(Number(raw?.qty||1))));
    if(!id){adjustedItems.push({kind,id:"",name:kind==="basket_mold"?"Cesta":"Produto",action:"removed",requested,available:0,reason:"item_invalido"});continue}
    if(kind==="basket_mold"){adjusted.push({...raw,type:"basket_mold",id,qty:requested,pricing_model:"configured_base_delta_v1"});continue}
    const current=await oneProduct(id).catch(()=>null),summary=productSummaries.get(id),available=Math.max(0,Math.floor(Number(current?.stock_quantity||0))),name=txt(current?.name||summary?.name||"Produto",160)||"Produto",image_url=String(current?.image_url||"");
    if(!current||available<=0){adjustedItems.push({kind,id,name,image_url,action:"removed",requested,available:0,reason:"sem_estoque"});continue}
    const qty=Math.min(requested,available);if(qty<requested)adjustedItems.push({kind,id,name,image_url,action:qty>0?"reduced":"removed",requested,available:qty,reason:"estoque_reduzido"});
    if(qty>0)adjusted.push({...raw,type:"product",id,qty});
  }
  return {items:adjusted,adjusted_items:adjustedItems,stock_adjustment:adjustedItems.length>0};
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
  const pay=txt(p?.payment_method,80),rawPhone=txt(p?.whatsapp_phone,40),ph=phone(rawPhone),requestedItems=Array.isArray(p?.items)?p.items:[],whatsappOriginRaw=txt(p?.whatsapp_origin,4),whatsappOrigin=['0975','1018'].includes(whatsappOriginRaw)?whatsappOriginRaw:'';
  if(!ph)return {error:"invalid_whatsapp_phone",status:400};
  if(!requestedItems.length)return {error:"empty_cart",status:400};
  if(requestedItems.length>80)return {error:"too_many_items",status:400};
  if(requestedItems.some((item:any)=>!["product","basket_mold"].includes(String(item?.type||"product"))))return {error:"invalid_item_type",status:400};
  const expectedTotal=p?.expected_total_cents;
  if(expectedTotal===undefined)return {error:"checkout_confirmation_required",status:409};
  if(!Number.isSafeInteger(expectedTotal)||expectedTotal<0||expectedTotal>MAXIMUM_ORDER_CENTS){
    return {error:"checkout_confirmation_invalid",status:400};
  }
  if(requestedItems.some((item:any)=>!Number.isInteger(item?.qty)||item.qty<1||item.qty>30)){
    return {error:"invalid_quantity",status:400};
  }
  if(requestedItems.some((item:any)=>!uid(item?.id)))return {error:"invalid_item_id",status:400};
  const deliveryDate=txt(p?.delivery_date,10),del=selectedDelivery(deliveryDate);
  if(!del)return {error:"delivery_date_unavailable",status:409};
  if(!pay)return {error:"invalid_payment",status:400};
  const stock=await reconcileOrderItemsForStock(requestedItems);
  const items=stock.items;
  const stockAdjustment=stock.stock_adjustment;
  const adjustedItems=[...stock.adjusted_items];
  const productConflicts=adjustedItems.filter((item:StockAdjustment)=>item.kind==="product");
  if(productConflicts.length)return {error:"stock_conflict",status:409,stock_adjustment:true,adjusted_items:adjustedItems,stock_conflict_items:productConflicts,minimum_order_cents:MINIMUM_ORDER_CENTS};
  if(!items.length)return {error:"all_items_unavailable",status:409,stock_adjustment:true,adjusted_items:adjustedItems,stock_conflict_items:adjustedItems,minimum_order_cents:MINIMUM_ORDER_CENTS};
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
  // Resolve the customer from the server-side phone match, then use only an active address owned by that customer.
  let customer:any=null;
  try{const found=await lookupCustomer(ph);if(found?.found&&found?.customer)customer=found.customer}
  catch(e){console.error("optional_customer_lookup",txt((e as any)?.message,180))}
  const submitted=p?.customer_details&&typeof p.customer_details==="object"?p.customer_details:{};
  const submittedAddress=submitted.address&&typeof submitted.address==="object"?submitted.address:{};
  const recipientName=txt(submitted.name,180)||txt(customer?.display_name,180);
  let canonicalAddress:any=null;
  if(customer?.id){
    const addressId=uid(submittedAddress.id||submitted.address_id||p?.delivery_customer_address_id);
    if(addressId){
      const selected=await db.from("customer_addresses")
        .select("id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_default")
        .eq("id",addressId).eq("customer_id",customer.id).eq("is_active",true).maybeSingle();
      if(selected.error)return {error:"delivery_address_unavailable",status:503};
      if(!selected.data)return {error:"delivery_address_invalid",status:409};
      canonicalAddress=selected.data;
    }else{
      canonicalAddress=customer.address||null;
    }
    if(!canonicalAddress)return {error:"delivery_address_required",status:409};
  }
  const sourceAddress=canonicalAddress||submittedAddress;
  const recipientAddress={
    ...(canonicalAddress?{id:canonicalAddress.id,label:canonicalAddress.label||"Endereço"}:{}),
    street:txt(sourceAddress.street,180),
    number:txt(sourceAddress.number,40),
    district:txt(sourceAddress.district??sourceAddress.neighborhood,140),
    city:txt(sourceAddress.city,120),
    state:(txt(sourceAddress.state,2)||"MT").toUpperCase(),
    postal_code:txt(sourceAddress.postal_code,20),
    complement:txt(sourceAddress.complement,140),
    reference:txt(sourceAddress.reference??sourceAddress.raw_text,220),
    raw_text:txt(sourceAddress.reference??sourceAddress.raw_text,220)
  };
  if(!recipientName)return {error:"customer_name_required",status:400};
  const missingAddress=["street","number","district","city","state"].filter(key=>!String((recipientAddress as any)[key]||"").trim());
  if(missingAddress.length)return {error:"delivery_details_required",missing_fields:missingAddress,status:400};
  const marketingCampaign=txt(p?.marketing_context?.campaign,80);
  const customerSnapshot={
    ...(customer?{found:true,id:customer.id,marketing_opt_in:customer.marketing_opt_in===true,identity_status:"existing_optional"}:{found:false,identity_status:"unregistered"}),
    display_name:recipientName,
    address:recipientAddress,
    ...(canonicalAddress?.id?{delivery_customer_address_id:canonicalAddress.id}:{}),
    ...(whatsappOrigin?{whatsapp_origin:whatsappOrigin}:{}),
    ...(marketingCampaign?{marketing_campaign:marketingCampaign}:{}),
    expected_total_cents:expectedTotal
  };
  const created=await db.rpc("create_vitrine_cart_order_v3",{
    p_phone:ph,p_payment_method:pay,p_items:items,p_customer_snapshot:customerSnapshot,p_delivery:del
  });
  if(created.error){
    const e=txt(created.error.message,160).split("\n")[0];
    if(e==="checkout_price_changed"){
      let actualTotal;
      try{actualTotal=JSON.parse(String(created.error.details||"")).actual_total_cents}catch{}
      return {error:e,status:409,
        ...(Number.isSafeInteger(actualTotal)&&actualTotal>=0&&actualTotal<=MAXIMUM_ORDER_CENTS?{actual_total_cents:actualTotal}:{})};
    }
    console.error("storefront_order_rejected",{error_code:e||"order_failed"});
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
  await recordOpsEvent("order.received","Pedido recebido pelo site e aguardando confirmação.",orderId,{source:"vitrine",customer_status:customerStatus,payment_method:pay||null,delivery_date:deliveryDate||null,stock_reserved:created.data?.stock_reserved===true,reservation_timing:created.data?.reservation_timing||null,reservation_status:created.data?.reservation_status||null,papoai_conversation_linked:Boolean(papoaiLink?.linked),stock_adjustment:stockAdjustment,adjusted_items:adjustedItems},"order-received:"+orderId);
  const orderCode=publicOrderLink?.public_code||canonicalOrderNumber||created.data?.order_number||null;
  return {...created.data,order_number:orderCode,order_public_url:publicOrderLink?.public_url||null,order_public_code:orderCode,phone_attached:Boolean(ph),customer_status:customerStatus,registration_complete:customer?.registration_complete===true,minimum_order_cents:MINIMUM_ORDER_CENTS,delivery:del,customer:customer||null,history_synced:Boolean(customer),papoai_conversation_linked:Boolean(papoaiLink?.linked),stock_adjustment:stockAdjustment,adjusted_items:adjustedItems};
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
    const u=new URL(req.url),action=txt(u.searchParams.get("action")||(req.method==="GET"?"home":""),60);
    if(action==="health")return json(req,{ok:true,service:"storefront-v2",mode:"canonical-vitrine",version:85},200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="home_catalog_cards")return json(req,await homeCatalogCards(),200,{"Cache-Control":"public, max-age=30, stale-while-revalidate=180"});
    if(req.method==="GET"&&action==="home_size_cards")return json(req,await homeSizeCards(),200,{"Cache-Control":"public, max-age=120, stale-while-revalidate=600"});


    if(req.method==="GET"&&action==="home")return json(req,await cachedHome(),200,{"Cache-Control":"public, max-age=30, stale-while-revalidate=120"});
    if(req.method==="GET"&&action==="home_priority")return json(req,await cachedHomePriority(),200,{"Cache-Control":"public, max-age=30, stale-while-revalidate=120"});
    if(req.method==="GET"&&action==="offers")return json(req,await offerList(),200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="builder_categories")return json(req,await builderCategoryList(),200,{"Cache-Control":"public, max-age=120, stale-while-revalidate=600"});
    if(req.method==="GET"&&action==="subcategories")return json(req,await subcats(u),200,{"Cache-Control":"public, max-age=120, stale-while-revalidate=600"});
    if(req.method==="GET"&&action==="products")return json(req,await productList(u),200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="product"){const id=uid(u.searchParams.get("product_id"));if(!id)return json(req,{ok:false,error:"invalid_product"},400);const p=await oneProduct(id);return p?json(req,{ok:true,product:p},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"product_not_found"},404)}
    if(req.method==="GET"&&action==="basket_by_size"){
      const r=await basketBySize(u.searchParams.get("size_key")||"",u.searchParams.get("lightweight")==="1");
      return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"});
    }
    if(req.method==="GET"&&action==="basket"){
      const raw=txt(u.searchParams.get("basket_id"),100);
      const match=raw.match(/^([0-9a-f-]{36})@([1-6])$/i);
      if(!match)return json(req,{ok:false,error:"basket_format_retired"},410,{"Cache-Control":"no-store"});
      const id=uid(match[1]);
      if(!id)return json(req,{ok:false,error:"invalid_basket"},400,{"Cache-Control":"no-store"});
      const lightweight=u.searchParams.get("lightweight")==="1";
      const result=await moldDetail(id,Number(match[2]),null,!lightweight,lightweight);
      return result?json(req,{ok:true,...result},200,{"Cache-Control":"no-store"}):json(req,{ok:false,error:"basket_mold_unavailable"},404,{"Cache-Control":"no-store"});
    }
    if(req.method==="GET"&&action==="basket_mold_options"){
      const r=await moldPositionOptions(u.searchParams.get("basket_id")||"",Math.trunc(Number(u.searchParams.get("composition_number")||0)),u.searchParams.get("position_id")||"",u.searchParams.get("selected_product_ids")||u.searchParams.get("selected_product_id")||"",Math.trunc(Number(u.searchParams.get("quantity")||0)),Math.trunc(Number(u.searchParams.get("offset")||0)));
      return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"});
    }
    if(req.method==="GET"&&action==="basket_extra_products"){const r=await basketExtraProducts(u.searchParams.get("theme_id")||"",u.searchParams.get("offset")||0,u.searchParams.get("limit")||15);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="resolve_identity_code"){const r=await resolveCode(req,u.searchParams.get("code"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="resolve_identity_token"){const r=await resolveToken(u.searchParams.get("token"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="delivery_options")return json(req,{ok:true,options:deliveryOptions(),cutoff_hour:CUTOFF_HOUR,time_zone:TZ},200,{"Cache-Control":"no-store"});
    if(req.method==="GET"&&action==="customer_lookup"){const r=await publicCustomerLookup(req,u.searchParams.get("phone"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}

    const body=req.method==="POST"?await req.json().catch(()=>({})):{};
    if(req.method==="POST"&&action==="customer_lookup"){const r=await publicCustomerLookup(req,body?.phone);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="customer_address_lookup"){const r=await customerAddressLookup(req,body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="customer_address_add"){const r=await customerAddressAdd(req,body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}
    if(req.method==="POST"&&action==="basket_mold_options_batch"){
      const r=await moldPositionOptionsBatch(body?.basket_id,Math.trunc(Number(body?.composition_number||0)),body?.positions);
      return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"});
    }
    if(req.method==="POST"&&action==="customer_register"){const r=await registerCustomer(req,body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}

    if(req.method==="POST"&&action==="basket_mold_quote"){const r=await moldQuote(body);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}


    if(req.method==="POST"&&action==="submit_order"){const r=await submit(req,body);const headers={"Cache-Control":"no-store",...(r.retry_after_seconds?{"Retry-After":String(r.retry_after_seconds)}:{})};return r.error?json(req,{ok:false,...r},r.status||400,headers):json(req,{ok:true,...r},200,headers)}
    if(req.method==="POST"&&action==="issue_identity_link")return json(req,{ok:false,error:"retired"},410)
    if(req.method==="POST"&&action==="reconcile_customer")return json(req,{ok:false,error:"retired"},410)



    if(req.method==="POST"&&action==="list_sections"){return json(req,{ok:true,sections:CATEGORIES.map(c=>({name:c.key,label:c.label}))})}
    if(req.method==="POST"&&action==="list_products"){const fake=new URL(req.url);if(body?.section)fake.searchParams.set("category",String(body.section));if(body?.q)fake.searchParams.set("q",String(body.q));fake.searchParams.set("limit",String(body?.limit||20));fake.searchParams.set("offset",String(Math.max(0,(Number(body?.page||1)-1)*Number(body?.limit||20))));const p=await productList(fake);return json(req,{ok:true,products:p.products.map((x:any)=>({id:x.id,name:x.name,price:Number(x.price_cents||0)/100,stock:x.stock_quantity,image_url:x.image_url,brand:x.brand,category:x.category,packaging:x.packaging,is_offer:x.regular_price_cents!=null})),page:Number(body?.page||1),limit:Number(body?.limit||20),total:null,has_more:p.next_offset!=null})}
    if(req.method==="POST"&&action==="lookup_customer_by_phone"){const r=await publicCustomerLookup(req,body?.phone);return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,r,200,{"Cache-Control":"no-store"})}


    return json(req,{ok:false,error:"unknown_action"},400);
  }catch(e){console.error("storefront-v2 canonical-vitrine",e);return json(req,{ok:false,error:"service_unavailable",detail:txt((e as any)?.message,180)},500,{"Cache-Control":"no-store"})}
});



