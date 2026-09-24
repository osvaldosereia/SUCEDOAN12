import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { syncVitrineOrderHistory } from "../_shared/vitrine-history-sync-v1.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET_KEYS = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); }
  catch { return {}; }
})();
const SERVER_KEY = SECRET_KEYS.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORG_ID = "95b1b61d-f6ed-41cb-8917-b55f6793b10b";
const MINIMUM_ORDER_CENTS = 7500;
const BUSINESS_TIME_ZONE = "America/Cuiaba";
const db = createClient(SUPABASE_URL, SERVER_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const CATEGORIES = [
  { key: "mercearia", label: "Mercearia" },
  { key: "limpeza_lavanderia", label: "Limpeza e lavanderia" },
  { key: "higiene_beleza", label: "Higiene e beleza" },
  { key: "casa_pet", label: "Casa e pet" }
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
};

const json = (body: unknown, status = 200, extra: Record<string,string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...extra }
  });

const text = (v: unknown, max = 120) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const uuid = (v: unknown) => {
  const s = text(v, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s) ? s : "";
};

const num = (v: unknown, min = 0, max = 999) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};

const normalizeWhatsappPhone = (v: unknown) => {
  let digits = String(v ?? "").replace(/\D+/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return "+" + digits;
  if (digits.length === 10 || digits.length === 11) return "+55" + digits;
  return "";
};

const nowActive = (o: any) => {
  const now = Date.now();
  const starts = o?.starts_at ? Date.parse(o.starts_at) : 0;
  const ends = o?.ends_at ? Date.parse(o.ends_at) : Number.POSITIVE_INFINITY;
  return (!Number.isFinite(starts) || starts <= now) && (!Number.isFinite(ends) || ends >= now);
};

type LocalDate = { year:number; month:number; day:number };
function localDateTimeCuiaba(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:BUSINESS_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const get=(type:string)=>Number(parts.find(p=>p.type===type)?.value||0);
  return {year:get("year"),month:get("month"),day:get("day"),hour:get("hour"),minute:get("minute")};
}
function addCalendarDays(date: LocalDate, days:number): LocalDate { const d=new Date(Date.UTC(date.year,date.month-1,date.day+days,12)); return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()}; }
function isoLocalDate(date: LocalDate) { return String(date.year).padStart(4,"0")+"-"+String(date.month).padStart(2,"0")+"-"+String(date.day).padStart(2,"0"); }
function easterSunday(year:number): LocalDate {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  return {year,month:Math.floor((h+l-7*m+114)/31),day:((h+l-7*m+114)%31)+1};
}
function nationalHolidayName(date: LocalDate) {
  const fixed=new Map([["01-01","Confraternização Universal"],["04-21","Tiradentes"],["05-01","Dia do Trabalho"],["09-07","Independência do Brasil"],["10-12","Nossa Senhora Aparecida"],["11-02","Finados"],["11-15","Proclamação da República"],["11-20","Dia Nacional de Zumbi e da Consciência Negra"],["12-25","Natal"]]);
  const key=String(date.month).padStart(2,"0")+"-"+String(date.day).padStart(2,"0");
  const fixedName=fixed.get(key); if(fixedName)return fixedName;
  return isoLocalDate(addCalendarDays(easterSunday(date.year),-2))===isoLocalDate(date)?"Paixão de Cristo":"";
}
function isSunday(date: LocalDate) { return new Date(Date.UTC(date.year,date.month-1,date.day,12)).getUTCDay()===0; }
function nextOpenDeliveryDate(from: LocalDate) { let date=from; for(let i=0;i<14;i++){if(!isSunday(date)&&!nationalHolidayName(date))return date;date=addCalendarDays(date,1)} return date; }
function deliveryDateLabel(date: LocalDate) { return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(Date.UTC(date.year,date.month-1,date.day,12))); }
function deliveryPlanCuiaba(now = new Date()) {
  const local=localDateTimeCuiaba(now),today={year:local.year,month:local.month,day:local.day},holiday=nationalHolidayName(today);
  let reason="same_day",target=today;
  if(isSunday(today)||holiday){reason="closed_day";target=nextOpenDeliveryDate(addCalendarDays(today,1))}
  else if(local.hour>=12){reason="after_cutoff";target=nextOpenDeliveryDate(addCalendarDays(today,1))}
  const label=deliveryDateLabel(target);
  const notice=reason==="after_cutoff"?"Pedido após 12h de Cuiabá. Entrega prevista "+label+".":reason==="closed_day"?"Hoje não realizamos entregas"+(holiday?" ("+holiday+")":" (domingo)")+". Entrega prevista "+label+".":"Entrega prevista hoje, "+label+".";
  return {date:isoLocalDate(target),label,notice,reason,time_zone:BUSINESS_TIME_ZONE,cutoff_hour:12};
}

async function availableStockMap(productIds:string[]) {
  const ids=[...new Set(productIds.filter(Boolean))];
  const result=new Map<string,number>();
  if(!ids.length)return result;

  const [{data:products,error:pErr},{data:reservations,error:rErr}]=await Promise.all([
    db.from("products")
      .select("id,stock_quantity,active")
      .eq("organization_id",ORG_ID)
      .in("id",ids),
    db.from("order_stock_reservations")
      .select("product_id,quantity")
      .eq("organization_id",ORG_ID)
      .eq("status","reserved")
      .in("product_id",ids)
  ]);
  if(pErr)throw pErr;
  if(rErr)throw rErr;

  const reserved=new Map<string,number>();
  for(const row of reservations??[])reserved.set(row.product_id,(reserved.get(row.product_id)??0)+Number(row.quantity||0));
  for(const p of products??[]){
    const physical=p.active===false?0:Number(p.stock_quantity||0);
    result.set(p.id,Math.max(0,physical-(reserved.get(p.id)??0)));
  }
  return result;
}

async function activeOffersFor(productIds: string[]) {
  if (!productIds.length) return new Map<string, any>();
  const { data, error } = await db
    .from("offers")
    .select("id,product_id,title,sale_price_cents,starts_at,ends_at")
    .eq("organization_id", ORG_ID)
    .eq("active", true)
    .in("product_id", productIds);
  if (error) throw error;
  const map = new Map<string, any>();
  for (const offer of (data ?? []).filter(nowActive)) {
    const current = map.get(offer.product_id);
    if (!current || Number(offer.sale_price_cents) < Number(current.sale_price_cents)) map.set(offer.product_id, offer);
  }
  return map;
}

async function home() {
  const { data: baskets, error } = await db.from("baskets")
    .select("id,name,display_price_cents,image_url")
    .eq("organization_id", ORG_ID)
    .eq("active", true)
    .order("display_price_cents", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  return {
    ok: true,
    version: "simple-storefront-v2-progressive",
    baskets: baskets ?? [],
    categories: CATEGORIES
  };
}

async function offers() {
  const { data: offerRows, error: oErr } = await db.from("offers")
    .select("id,product_id,title,sale_price_cents,starts_at,ends_at")
    .eq("organization_id", ORG_ID)
    .eq("active", true)
    .limit(40);
  if (oErr) throw oErr;

  const currentOffers = (offerRows ?? []).filter(nowActive);
  const ids = [...new Set(currentOffers.map((x:any)=>x.product_id).filter(Boolean))];
  let products: any[] = [];
  if (ids.length) {
    const { data, error } = await db.from("products")
      .select("id,name,image_url,sale_price_cents,stock_quantity,metadata")
      .eq("organization_id", ORG_ID)
      .eq("active", true)
      .gt("stock_quantity", 0)
      .in("id", ids);
    if (error) throw error;
    products = data ?? [];
  }

  const pMap = new Map(products.map((p:any)=>[p.id,p]));
  const available=await availableStockMap(products.map((p:any)=>p.id));
  const publicOffers = currentOffers
    .map((offer:any) => {
      const p = pMap.get(offer.product_id);
      if (!p) return null;
      return {
        id: offer.id,
        product_id: p.id,
        name: p.name,
        image_url: p.image_url,
        price_cents: Number(offer.sale_price_cents || 0),
        regular_price_cents: Number(p.sale_price_cents || 0),
        packaging: p.metadata?.packaging ?? "",
        stock_quantity: Number(available.get(p.id) ?? 0)
      };
    })
    .filter((x:any)=>x&&Number(x.stock_quantity)>0)
    .sort((a:any,b:any)=>a.name.localeCompare(b.name,"pt-BR"));

  return { ok:true, offers:publicOffers };
}

async function subcategories(url: URL) {
  const category = text(url.searchParams.get("category"), 48);
  if (!category) return { ok:true, subcategories:[] };

  const { data, error } = await db.from("products")
    .select("metadata")
    .eq("organization_id", ORG_ID)
    .eq("active", true)
    .gt("stock_quantity", 0)
    .contains("metadata", { sales_category: category })
    .range(0, 999);
  if (error) throw error;

  const counts = new Map<string,number>();
  for (const row of data ?? []) {
    const name = text(row?.metadata?.subsubcategory, 80);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return {
    ok:true,
    subcategories:[...counts.entries()]
      .map(([name,count])=>({name,count}))
      .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name,"pt-BR"))
  };
}

async function products(url: URL) {
  const category = text(url.searchParams.get("category"), 48);
  const subcategory = text(url.searchParams.get("subcategory"), 80);
  const q = text(url.searchParams.get("q"), 60);
  const limit = Math.floor(num(url.searchParams.get("limit") ?? 24, 1, 36));
  const offset = Math.floor(num(url.searchParams.get("offset") ?? 0, 0, 5000));

  let query = db.from("products")
    .select("id,name,image_url,sale_price_cents,stock_quantity,metadata")
    .eq("organization_id", ORG_ID)
    .eq("active", true)
    .gt("stock_quantity", 0)
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  const metadataFilter:any = {};
  if (category) metadataFilter.sales_category = category;
  if (subcategory) metadataFilter.subsubcategory = subcategory;
  if (Object.keys(metadataFilter).length) query = query.contains("metadata", metadataFilter);
  if (q) {
    const terms = q.replace(/[%_]/g," ").split(/\s+/).map(x=>x.trim()).filter(Boolean).slice(0,4);
    for (const term of terms) query = query.ilike("search_text", `%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const offerMap = await activeOffersFor(rows.map((p:any)=>p.id));
  const available=await availableStockMap(rows.map((p:any)=>p.id));
  const publicRows=rows.map((p:any) => {
      const offer = offerMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        image_url: p.image_url,
        price_cents: Number(offer?.sale_price_cents ?? p.sale_price_cents ?? 0),
        regular_price_cents: offer ? Number(p.sale_price_cents ?? 0) : null,
        packaging: p.metadata?.packaging ?? "",
        subcategory: p.metadata?.subcategory ?? "",
        stock_quantity: Number(available.get(p.id) ?? 0)
      };
    }).filter((p:any)=>p.stock_quantity>0);
  return {
    ok:true,
    products:publicRows,
    next_offset: rows.length === limit ? offset + limit : null
  };
}

async function productDetail(id: string) {
  const { data: p, error } = await db.from("products")
    .select("id,sku,gtin,name,description,image_url,sale_price_cents,stock_quantity,metadata")
    .eq("organization_id", ORG_ID)
    .eq("active", true)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!p) return json({ ok:false, error:"product_not_found" },404);

  const offerMap = await activeOffersFor([p.id]);
  const offer = offerMap.get(p.id);
  const available=await availableStockMap([p.id]);
  const meta = p.metadata ?? {};
  const characteristics = [
    ["Marca", meta.brand],
    ["Embalagem", meta.packaging],
    ["Unidade", meta.unit],
    ["Categoria", meta.category],
    ["Subcategoria", meta.subcategory],
    ["Tipo", meta.subsubcategory]
  ]
    .filter(([,value]) => value != null && String(value).trim() !== "")
    .map(([label,value]) => ({ label, value:String(value) }));

  return json({
    ok:true,
    product:{
      id:p.id,
      sku:p.sku ?? "",
      gtin:p.gtin ?? "",
      name:p.name,
      description:p.description ?? "",
      image_url:p.image_url ?? "",
      price_cents:Number(offer?.sale_price_cents ?? p.sale_price_cents ?? 0),
      regular_price_cents:offer ? Number(p.sale_price_cents ?? 0) : null,
      stock_quantity:Number(available.get(p.id) ?? 0),
      packaging:meta.packaging ?? "",
      brand:meta.brand ?? "",
      category:meta.category ?? "",
      subcategory:meta.subcategory ?? "",
      subsubcategory:meta.subsubcategory ?? "",
      unit:meta.unit ?? "",
      characteristics
    }
  });
}

async function basketDetail(id: string) {
  const { data: basket, error: bErr } = await db.from("baskets")
    .select("id,name,display_price_cents,image_url")
    .eq("organization_id", ORG_ID)
    .eq("active", true)
    .eq("id", id)
    .maybeSingle();
  if (bErr) throw bErr;
  if (!basket) return json({ ok:false, error:"basket_not_found" },404);

  const { data: items, error: iErr } = await db.from("basket_items")
    .select("product_id,quantity,sort_order")
    .eq("basket_id", id)
    .order("sort_order", { ascending: true });
  if (iErr) throw iErr;
  const ids = (items ?? []).map((x:any)=>x.product_id);
  const { data: productsData, error: pErr } = ids.length
    ? await db.from("products").select("id,name,image_url,stock_quantity,active,metadata").eq("organization_id",ORG_ID).in("id",ids)
    : { data: [], error: null };
  if (pErr) throw pErr;
  const products = new Map((productsData ?? []).map((p:any)=>[p.id,p]));
  const available=await availableStockMap(ids);
  return json({
    ok:true,
    basket,
    items:(items ?? []).map((x:any)=>{
      const p=products.get(x.product_id);
      return {
        product_id:x.product_id,
        name:p?.name ?? "Produto",
        image_url:p?.image_url ?? "",
        packaging:p?.metadata?.packaging ?? "",
        stock_quantity:Number(available.get(x.product_id) ?? 0),
        quantity:Number(x.quantity || 0)
      };
    })
  });
}

async function basketQuote(payload: any) {
  const basketId = uuid(payload?.basket_id);
  if (!basketId) return json({ok:false,error:"invalid_basket"},400);
  const requested = Array.isArray(payload?.items) ? payload.items.slice(0,80) : [];

  const { data: basket, error: bErr } = await db.from("baskets")
    .select("id,display_price_cents")
    .eq("organization_id", ORG_ID)
    .eq("active", true)
    .eq("id", basketId)
    .maybeSingle();
  if (bErr) throw bErr;
  if (!basket) return json({ok:false,error:"basket_not_found"},404);

  const { data: baseItems, error: iErr } = await db.from("basket_items")
    .select("product_id,quantity")
    .eq("basket_id", basketId);
  if (iErr) throw iErr;
  const ids = (baseItems ?? []).map((x:any)=>x.product_id);
  const { data: productRows, error: pErr } = await db.from("products")
    .select("id,sale_price_cents,stock_quantity,active")
    .eq("organization_id",ORG_ID)
    .in("id", ids);
  if (pErr) throw pErr;

  const prices = new Map((productRows ?? []).map((p:any)=>[p.id,Number(p.sale_price_cents||0)]));
  const baseQty = new Map((baseItems ?? []).map((x:any)=>[x.product_id,num(x.quantity,0,30)]));
  const editedQty = new Map(baseQty);
  for (const row of requested) {
    const id = uuid(row?.product_id);
    if (!id || !baseQty.has(id)) continue;
    editedQty.set(id, Math.round(num(row?.quantity,0,30)*1000)/1000);
  }

  const available=await availableStockMap(ids);
  let baseSubtotal = 0;
  let editedSubtotal = 0;
  for (const id of ids) {
    const price=prices.get(id)??0,requestedQty=editedQty.get(id)??0,availableQty=available.get(id)??0;
    if(requestedQty>availableQty)return json({ok:false,error:"insufficient_stock",product_id:id,available:availableQty,requested:requestedQty},409,{"Cache-Control":"no-store"});
    baseSubtotal+=price*(baseQty.get(id)??0); editedSubtotal+=price*requestedQty;
  }
  const hiddenDelta = Number(basket.display_price_cents || 0) - baseSubtotal;
  const total = Math.max(0, Math.round(hiddenDelta + editedSubtotal));
  return json({ok:true,total_cents:total});
}


async function submitOrder(payload:any) {
  const payment=text(payload?.payment_method,80);
  const whatsappPhone=normalizeWhatsappPhone(payload?.whatsapp_phone);
  const rawCustomer=payload?.customer_snapshot && typeof payload.customer_snapshot==="object" ? payload.customer_snapshot : null;
  const a=rawCustomer?.address && typeof rawCustomer.address==="object" ? rawCustomer.address : {};
  const customerSnapshot=rawCustomer?.found ? {
    source_customer_id:uuid(rawCustomer.id)||null,
    customer_status:"registered",
    customer_name:text(rawCustomer.display_name,180)||null,
    phone:whatsappPhone||null,
    street:text(a.street,180)||null,
    number:text(a.number,40)||null,
    complement:text(a.complement,140)||null,
    district:text(a.district,140)||null,
    city:text(a.city,120)||null,
    state:text(a.state,2)||null,
    postal_code:text(a.postal_code,20)||null,
    raw_text:text(a.raw_text,400)||null,
    google_maps_url:text(a.google_maps_url,800)||null
  } : {
    customer_status:"new",
    phone:whatsappPhone||null
  };
  const allowedPayments=new Set(["PIX","Dinheiro","Cartão de crédito","Cartão alimentação/refeição"]);
  if (!allowedPayments.has(payment)) return {error:"invalid_payment",status:400};

  const cart=Array.isArray(payload?.items)?payload.items.slice(0,80):[];
  if (!cart.length) return {error:"empty_cart",status:400};

  const normalized=cart.map((raw:any,index:number)=>({
    index,
    type:raw?.type==="basket"?"basket":"product",
    id:uuid(raw?.id),
    qty:Math.round(num(raw?.qty,1,30)*1000)/1000,
    components:Array.isArray(raw?.components)?raw.components.slice(0,100):[]
  })).filter((x:any)=>x.id&&x.qty>0);
  if (!normalized.length) return {error:"empty_cart",status:400};

  const productIds=[...new Set(normalized.filter((x:any)=>x.type==="product").map((x:any)=>x.id))];
  const basketIds=[...new Set(normalized.filter((x:any)=>x.type==="basket").map((x:any)=>x.id))];

  let productRows:any[]=[];
  if (productIds.length) {
    const {data,error}=await db.from("products")
      .select("id,sku,name,image_url,sale_price_cents,stock_quantity")
      .eq("organization_id",ORG_ID)
      .eq("active",true)
      .gt("stock_quantity",0)
      .in("id",productIds);
    if(error) throw error;
    productRows=data??[];
  }
  const pMap=new Map(productRows.map((p:any)=>[p.id,p]));
  const offerMap=await activeOffersFor(productRows.map((p:any)=>p.id));

  let basketRows:any[]=[];
  if (basketIds.length) {
    const {data,error}=await db.from("baskets")
      .select("id,name,display_price_cents,image_url")
      .eq("organization_id",ORG_ID)
      .eq("active",true)
      .in("id",basketIds);
    if(error) throw error;
    basketRows=data??[];
  }
  const bMap=new Map(basketRows.map((b:any)=>[b.id,b]));

  let basketItemRows:any[]=[];
  if (basketIds.length) {
    const {data,error}=await db.from("basket_items")
      .select("basket_id,product_id,quantity,sort_order")
      .in("basket_id",basketIds)
      .order("sort_order",{ascending:true});
    if(error) throw error;
    basketItemRows=data??[];
  }
  const basketProductIds=[...new Set(basketItemRows.map((x:any)=>x.product_id).filter(Boolean))];
  let basketProducts:any[]=[];
  if (basketProductIds.length) {
    const {data,error}=await db.from("products")
      .select("id,sku,name,image_url,sale_price_cents,stock_quantity,active")
      .eq("organization_id",ORG_ID)
      .in("id",basketProductIds);
    if(error) throw error;
    basketProducts=data??[];
  }
  const bpMap=new Map(basketProducts.map((p:any)=>[p.id,p]));
  const baseByBasket=new Map<string,any[]>();
  for (const row of basketItemRows) {
    if(!baseByBasket.has(row.basket_id)) baseByBasket.set(row.basket_id,[]);
    baseByBasket.get(row.basket_id)!.push(row);
  }

  const orderItems:any[]=[];
  const componentPlans:any[]=[];
  const stockDemand=new Map<string,number>();
  const addStockDemand=(productId:string,quantity:number)=>{if(productId&&quantity>0)stockDemand.set(productId,Math.round(((stockDemand.get(productId)??0)+quantity)*1000)/1000)};
  let total=0;

  for (const line of normalized) {
    const lineKey=`l${line.index}`;
    if(line.type==="product") {
      const p=pMap.get(line.id);
      if(!p) return {error:"product_unavailable",status:409};
      const offer=offerMap.get(p.id);
      const unit=Math.max(0,Number(offer?.sale_price_cents??p.sale_price_cents??0));
      const lineTotal=Math.round(unit*line.qty);
      total+=lineTotal;
      addStockDemand(p.id,line.qty);
      orderItems.push({
        organization_id:ORG_ID,
        item_kind:"product",
        product_id:p.id,
        basket_id:null,
        name_snapshot:p.name,
        sku_snapshot:p.sku??null,
        quantity:line.qty,
        unit_price_cents:unit,
        total_cents:lineTotal,
        metadata:{source:"vitrine",line_key:lineKey,image_url:p.image_url??""}
      });
      continue;
    }

    const basket=bMap.get(line.id);
    if(!basket) return {error:"basket_unavailable",status:409};
    const baseItems=baseByBasket.get(basket.id)??[];
    if(!baseItems.length) return {error:"basket_empty",status:409};

    const baseQty=new Map<string,number>();
    let baseSubtotal=0;
    for(const bi of baseItems) {
      const p=bpMap.get(bi.product_id);
      const qty=Number(bi.quantity||0);
      baseQty.set(bi.product_id,qty);
      baseSubtotal+=Number(p?.sale_price_cents??0)*qty;
    }

    const supplied=line.components
      .map((c:any)=>({product_id:uuid(c?.product_id),quantity:Math.round(num(c?.quantity,0,30)*1000)/1000}))
      .filter((c:any)=>c.product_id&&baseQty.has(c.product_id));
    const hasComponentIds=supplied.length>0;
    const editedQty=new Map(baseQty);
    if(hasComponentIds) {
      for(const id of editedQty.keys()) editedQty.set(id,0);
      for(const c of supplied) editedQty.set(c.product_id,c.quantity);
    }

    if(![...editedQty.values()].some(qty=>Number(qty)>0)) return {error:"basket_unavailable",status:409};
    let editedSubtotal=0;
    for(const [id,qty] of editedQty){
      const p=bpMap.get(id);
      if(Number(qty)>0&&(!p||p.active===false))return {error:"product_unavailable",status:409,product_id:id};
      editedSubtotal+=Number(p?.sale_price_cents??0)*qty;
      addStockDemand(id,Number(qty)*Number(line.qty));
    }
    const hiddenDelta=Number(basket.display_price_cents||0)-baseSubtotal;
    const unit=Math.max(0,Math.round(hiddenDelta+editedSubtotal));
    const lineTotal=Math.round(unit*line.qty);
    total+=lineTotal;

    orderItems.push({
      organization_id:ORG_ID,
      item_kind:"basket",
      product_id:null,
      basket_id:basket.id,
      name_snapshot:basket.name,
      sku_snapshot:null,
      quantity:line.qty,
      unit_price_cents:unit,
      total_cents:lineTotal,
      metadata:{source:"vitrine",line_key:lineKey,image_url:basket.image_url??"",customized:hasComponentIds}
    });

    componentPlans.push({
      line_key:lineKey,
      rows:[...editedQty.entries()]
        .filter(([,qty])=>Number(qty)>0)
        .map(([productId,qty])=>{
          const p=bpMap.get(productId);
          return {
            organization_id:ORG_ID,
            product_id:productId,
            name_snapshot:p?.name??"Produto",
            sku_snapshot:p?.sku??null,
            quantity:qty,
            metadata:{
              source:"vitrine",
              image_url:p?.image_url??"",
              unit_price_cents:Number(p?.sale_price_cents??0),
              price_snapshot_source:"product_sale_price_at_order"
            }
          };
        })
    });
  }

  if(!orderItems.length) return {error:"empty_cart",status:400};
  if(total<MINIMUM_ORDER_CENTS)return {error:"minimum_order",status:400,minimum_order_cents:MINIMUM_ORDER_CENTS,total_cents:total};
  const delivery=deliveryPlanCuiaba();
  const stockItems=[...stockDemand.entries()].map(([product_id,quantity])=>({product_id,quantity})).filter(x=>x.quantity>0).sort((a,b)=>a.product_id.localeCompare(b.product_id));

  let order:any=null;
  let orderError:any=null;
  for(let attempt=0;attempt<4;attempt++) {
    const orderNumber=Date.now()+attempt;
    const res=await db.from("orders").insert({
      organization_id:ORG_ID,
      customer_id:null,
      whatsapp_phone_e164:whatsappPhone||null,
      order_number:orderNumber,
      status:"created",
      currency:"BRL",
      subtotal_cents:total,
      discount_cents:0,
      delivery_cents:0,
      total_cents:total,
      delivery_address_snapshot:{...customerSnapshot,delivery_date:delivery.date,delivery_label:delivery.label,delivery_reason:delivery.reason,delivery_time_zone:delivery.time_zone,delivery_cutoff_hour:delivery.cutoff_hour},
      payment_method_snapshot:{method:payment,label:payment,timing:"on_delivery",source:"vitrine",stock_reserved:true,stock_consumed:false,stock_released:false,stock_model:"reservation_v2"},
      confirmed_at:null,
      delivered_at:null
    }).select("id,order_number,total_cents").single();
    if(!res.error){order=res.data;orderError=null;break}
    orderError=res.error;
    if(res.error.code!=="23505") break;
  }
  if(!order) throw orderError??new Error("order_insert_failed");
  let stockReserved=false;
  if(stockItems.length){
    const {data:reservation,error:reservationError}=await db.rpc("reserve_storefront_order_stock_v2",{p_organization_id:ORG_ID,p_order_id:order.id,p_items:stockItems});
    if(reservationError){await db.from("orders").delete().eq("id",order.id);throw reservationError}
    if(!reservation?.ok){await db.from("orders").delete().eq("id",order.id);return {error:String(reservation?.error||"insufficient_stock"),status:409,product_id:reservation?.product_id??null,available:Number(reservation?.available??0),requested:Number(reservation?.requested??0)}}
    stockReserved=true;
  }

  try {
    const withOrder=orderItems.map(row=>({...row,order_id:order.id}));
    const {data:inserted,error:itemError}=await db.from("order_items")
      .insert(withOrder)
      .select("id,metadata");
    if(itemError) throw itemError;
    const byLine=new Map((inserted??[]).map((x:any)=>[x.metadata?.line_key,x.id]));

    const components:any[]=[];
    for(const plan of componentPlans) {
      const orderItemId=byLine.get(plan.line_key);
      if(!orderItemId) continue;
      for(const row of plan.rows) components.push({...row,order_item_id:orderItemId});
    }
    if(components.length) {
      const {error}=await db.from("order_item_components").insert(components);
      if(error) throw error;
    }
  } catch(error) {
    if(stockReserved&&stockItems.length){const released=await db.rpc("release_storefront_order_stock_v2",{p_organization_id:ORG_ID,p_order_id:order.id});if(released.error)console.error("stock_release_failed",released.error)}
    await db.from("orders").delete().eq("id",order.id);
    throw error;
  }

  const historySync=await syncVitrineOrderHistory(db,order.id,ORG_ID);
  if(!historySync.ok)console.error("vitrine_history_sync_failed",historySync.error);

  // post_order_cross_sell_shadow_schedule
  // Shadow only: records eligibility and suggestions, never sends WhatsApp or changes the order.
  const shadowWork=db.rpc("prepare_post_order_cross_sell_shadow_v1",{p_order_id:order.id})
    .then(({error}:any)=>{if(error)console.error("cross_sell_shadow_prepare_failed",error.message||error)});
  try{
    const runtime=(globalThis as any).EdgeRuntime;
    if(runtime?.waitUntil)runtime.waitUntil(shadowWork);
    else await shadowWork;
  }catch(e){console.error("cross_sell_shadow_schedule_failed",String((e as Error)?.message||e))}

  return {order_id:order.id,order_number:order.order_number,total_cents:order.total_cents,phone_attached:Boolean(whatsappPhone),customer_status:customerSnapshot.customer_status,minimum_order_cents:MINIMUM_ORDER_CENTS,delivery,history_synced:Boolean(historySync.ok)};
}



function randomFourDigitCode(){
  const values=new Uint16Array(1);
  do{crypto.getRandomValues(values)}while(values[0]>=60000);
  return String(values[0]%10000).padStart(4,'0');
}

function randomStorefrontToken(byteLength=24){
  const bytes=new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary='';
  for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function sha256Hex(value:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function issueStorefrontIdentityLink(payload:any){
  const phone=normalizeWhatsappPhone(payload?.phone);
  if(!phone)return {error:'invalid_phone',status:400};
  const contactName=text(payload?.name,180)||null;
  const nowIso=new Date().toISOString();
  const expiresAt=new Date(Date.now()+30*60*1000).toISOString();

  try{
    // Keep retired 4-digit codes quarantined for 24h so an old WhatsApp
    // message cannot accidentally identify a different customer later.
    await db.from('storefront_identity_tokens')
      .delete()
      .lt('created_at',new Date(Date.now()-24*60*60*1000).toISOString());
    await db.from('storefront_identity_resolve_attempts')
      .delete()
      .lt('attempted_at',new Date(Date.now()-24*60*60*1000).toISOString());
  }catch{}

  const existing=await db.from('storefront_identity_tokens')
    .select('short_code,expires_at')
    .eq('phone_e164',phone)
    .is('redeemed_at',null)
    .gt('expires_at',nowIso)
    .not('short_code','is',null)
    .order('created_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data?.short_code){
    return {
      phone_e164:phone,
      shopping_url:'https://donaantonia.com.br/catalogo_'+String(existing.data.short_code),
      expires_at:existing.data.expires_at,
      reused:true
    };
  }

  for(let attempt=0;attempt<40;attempt++){
    const code=randomFourDigitCode();
    const tokenHash=await sha256Hex(code);
    const ins=await db.from('storefront_identity_tokens').insert({
      token_hash:tokenHash,
      short_code:code,
      phone_e164:phone,
      contact_name:contactName,
      source:'papoai_short_code_v2',
      expires_at:expiresAt
    });
    if(!ins.error){
      return {
        phone_e164:phone,
        shopping_url:'https://donaantonia.com.br/catalogo_'+code,
        expires_at:expiresAt,
        reused:false
      };
    }
    if(String(ins.error.code||'')!=='23505')throw ins.error;
  }
  return {error:'short_code_pool_busy',status:503};
}

function storefrontRequestIp(req:Request){
  const candidates=[
    req.headers.get('cf-connecting-ip'),
    String(req.headers.get('x-forwarded-for')||'').split(',')[0],
    req.headers.get('x-real-ip')
  ];
  for(const candidate of candidates){
    const value=String(candidate||'').trim();
    if(value)return value.slice(0,120);
  }
  return '';
}

async function storefrontResolveIpHash(req:Request){
  const ip=storefrontRequestIp(req);
  if(!ip)return '';
  const salt=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').slice(-48);
  return sha256Hex('storefront-resolve-v2|'+ip+'|'+salt);
}

async function resolveStorefrontIdentityCode(req:Request,codeValue:any){
  const code=String(codeValue??'').trim();
  if(!/^\d{4}$/.test(code))return {error:'invalid_code',status:400};

  const ipHash=await storefrontResolveIpHash(req);
  if(ipHash){
    const since=new Date(Date.now()-10*60*1000).toISOString();
    const countQ=await db.from('storefront_identity_resolve_attempts')
      .select('id',{count:'exact',head:true})
      .eq('ip_hash',ipHash)
      .gte('attempted_at',since);
    if(countQ.error)throw countQ.error;
    if(Number(countQ.count||0)>=12)return {error:'too_many_attempts',status:429};
  }

  const tokenHash=await sha256Hex(code);
  const nowIso=new Date().toISOString();
  const q=await db.from('storefront_identity_tokens')
    .update({
      redeemed_at:nowIso,
      last_used_at:nowIso,
      use_count:1
    })
    .eq('token_hash',tokenHash)
    .eq('short_code',code)
    .is('redeemed_at',null)
    .gt('expires_at',nowIso)
    .select('id,phone_e164,expires_at')
    .maybeSingle();
  if(q.error)throw q.error;

  if(ipHash){
    try{
      await db.from('storefront_identity_resolve_attempts').insert({
        ip_hash:ipHash,
        success:Boolean(q.data)
      });
    }catch{}
  }

  if(!q.data)return {error:'code_expired_or_invalid',status:404};
  return {phone_e164:q.data.phone_e164,expires_at:q.data.expires_at};
}

async function resolveLegacyStorefrontIdentityToken(tokenValue:any){
  const token=String(tokenValue??'').trim();
  if(!/^[A-Za-z0-9_-]{24,160}$/.test(token))return {error:'invalid_token',status:400};
  const tokenHash=await sha256Hex(token);
  const nowIso=new Date().toISOString();
  const q=await db.from('storefront_identity_tokens')
    .update({
      redeemed_at:nowIso,
      last_used_at:nowIso,
      use_count:1
    })
    .eq('token_hash',tokenHash)
    .is('redeemed_at',null)
    .gt('expires_at',nowIso)
    .select('id,phone_e164,expires_at')
    .maybeSingle();
  if(q.error)throw q.error;
  if(!q.data)return {error:'token_expired_or_invalid',status:404};
  return {phone_e164:q.data.phone_e164,expires_at:q.data.expires_at};
}

async function vitrineHistoryBridgeAuthorized(req:Request){
  const supplied=String(req.headers.get('x-vitrine-history-key')||'').trim();
  if(!supplied)return false;
  const q=await db.from('internal_integration_secrets')
    .select('secret_value')
    .eq('integration_key','vitrine_history_bridge')
    .maybeSingle();
  if(q.error||!q.data?.secret_value)return false;
  return supplied===String(q.data.secret_value);
}

async function reconcileCrmCustomer(payload:any){
  const orderId=uuid(payload?.source_order_id);
  const crmCustomerId=uuid(payload?.crm_customer_id);
  if(!orderId||!crmCustomerId)return {error:'invalid_reconciliation_payload',status:400};

  const {data:order,error}=await db.from('orders')
    .select('id,delivery_address_snapshot,whatsapp_phone_e164')
    .eq('organization_id',ORG_ID)
    .eq('id',orderId)
    .maybeSingle();
  if(error)throw error;
  if(!order)return {error:'order_not_found',status:404};

  const customer=payload?.customer&&typeof payload.customer==='object'?payload.customer:{};
  const address=payload?.address&&typeof payload.address==='object'?payload.address:{};
  const old=order.delivery_address_snapshot&&typeof order.delivery_address_snapshot==='object'
    ? order.delivery_address_snapshot:{};

  const next:any={
    ...old,
    source_customer_id:crmCustomerId,
    customer_status:'registered',
    customer_name:text(customer?.name,180)||old.customer_name||old.recipient_name||null,
    phone:order.whatsapp_phone_e164||normalizeWhatsappPhone(customer?.phone)||old.phone||null,
    cpf:String(customer?.cpf??'').replace(/\D+/g,'').slice(0,14)||old.cpf||null
  };
  for(const key of ['street','number','complement','neighborhood','city','state','postal_code','reference','google_maps_url']){
    const value=text(address?.[key],key==='google_maps_url'?800:300);
    if(value)next[key]=value;
  }

  const upd=await db.from('orders').update({
    crm_customer_id:crmCustomerId,
    delivery_address_snapshot:next
  }).eq('organization_id',ORG_ID).eq('id',orderId);
  if(upd.error)throw upd.error;

  const outbox=await db.from('vitrine_history_sync_outbox').update({
    remote_customer_id:crmCustomerId,
    updated_at:new Date().toISOString()
  }).eq('order_id',orderId);
  if(outbox.error)throw outbox.error;

  return {order_id:orderId,crm_customer_id:crmCustomerId,customer_name:next.customer_name||null};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
  try {
    const url = new URL(req.url);
    const action = text(url.searchParams.get("action") || (req.method === "POST" ? "basket_quote" : "home"), 40);
    if (action === "health") return json({ok:true,service:"simple-storefront-v1"},200,{"Cache-Control":"no-store"});
    if (req.method === "GET" && action === "home") return json(await home(),200,{"Cache-Control":"public, max-age=300, stale-while-revalidate=900"});
    if (req.method === "GET" && action === "offers") return json(await offers(),200,{"Cache-Control":"no-store"});
    if (req.method === "GET" && action === "subcategories") return json(await subcategories(url),200,{"Cache-Control":"public, max-age=300, stale-while-revalidate=900"});
    if (req.method === "GET" && action === "products") return json(await products(url),200,{"Cache-Control":"no-store"});
    if (req.method === "GET" && action === "product") {
      const id = uuid(url.searchParams.get("product_id"));
      if (!id) return json({ok:false,error:"invalid_product"},400);
      const response=await productDetail(id); response.headers.set("Cache-Control","no-store"); return response;
    }
    if (req.method === "GET" && action === "basket") {
      const id = uuid(url.searchParams.get("basket_id"));
      if (!id) return json({ok:false,error:"invalid_basket"},400);
      const response=await basketDetail(id); response.headers.set("Cache-Control","no-store"); return response;
    }
    if (req.method === "POST" && action === "basket_quote") {
      const payload = await req.json().catch(()=>({}));
      return await basketQuote(payload);
    }
    if (req.method === "POST" && action === "issue_identity_link") {
      if(!(await vitrineHistoryBridgeAuthorized(req)))return json({ok:false,error:"unauthorized"},401,{"Cache-Control":"no-store"});
      const payload=await req.json().catch(()=>({}));
      const result=await issueStorefrontIdentityLink(payload);
      if(result.error)return json({ok:false,...result},result.status||400,{"Cache-Control":"no-store"});
      return json({ok:true,...result},200,{"Cache-Control":"no-store"});
    }
    if (req.method === "GET" && action === "resolve_identity_code") {
      const result=await resolveStorefrontIdentityCode(req,url.searchParams.get("code"));
      if(result.error)return json({ok:false,...result},result.status||400,{"Cache-Control":"no-store"});
      return json({ok:true,...result},200,{"Cache-Control":"no-store"});
    }
    if (req.method === "GET" && action === "resolve_identity_token") {
      const result=await resolveLegacyStorefrontIdentityToken(url.searchParams.get("token"));
      if(result.error)return json({ok:false,...result},result.status||400,{"Cache-Control":"no-store"});
      return json({ok:true,...result},200,{"Cache-Control":"no-store"});
    }
    if (req.method === "POST" && action === "reconcile_customer") {
      if(!(await vitrineHistoryBridgeAuthorized(req)))return json({ok:false,error:"unauthorized"},401,{"Cache-Control":"no-store"});
      const payload = await req.json().catch(()=>({}));
      const result=await reconcileCrmCustomer(payload);
      if(result.error)return json({ok:false,...result},result.status||400,{"Cache-Control":"no-store"});
      return json({ok:true,...result},200,{"Cache-Control":"no-store"});
    }
    if (req.method === "POST" && action === "submit_order") {
      const payload = await req.json().catch(()=>({}));
      const result=await submitOrder(payload);
      if(result.error) return json({ok:false,...result},result.status,{"Cache-Control":"no-store"});
      return json({ok:true,...result},200,{"Cache-Control":"no-store"});
    }
    return json({ok:false,error:"not_found"},404);
  } catch (error) {
    console.error("simple-storefront-v1", error);
    return json({ok:false,error:"service_unavailable"},500,{"Cache-Control":"no-store"});
  }
});
