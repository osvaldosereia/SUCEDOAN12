import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET_KEYS = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); }
  catch { return {}; }
})();
const SERVER_KEY = SECRET_KEYS.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORG_ID = "95b1b61d-f6ed-41cb-8917-b55f6793b10b";
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
        packaging: p.metadata?.packaging ?? ""
      };
    })
    .filter(Boolean)
    .sort((a:any,b:any)=>a.name.localeCompare(b.name,"pt-BR"));

  return { ok:true, offers:publicOffers };
}

async function products(url: URL) {
  const category = text(url.searchParams.get("category"), 48);
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

  if (category) query = query.contains("metadata", { sales_category: category });
  if (q) {
    const terms = q.replace(/[%_]/g," ").split(/\s+/).map(x=>x.trim()).filter(Boolean).slice(0,4);
    for (const term of terms) query = query.ilike("search_text", `%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const offerMap = await activeOffersFor(rows.map((p:any)=>p.id));
  return {
    ok: true,
    products: rows.map((p:any) => {
      const offer = offerMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        image_url: p.image_url,
        price_cents: Number(offer?.sale_price_cents ?? p.sale_price_cents ?? 0),
        regular_price_cents: offer ? Number(p.sale_price_cents ?? 0) : null,
        packaging: p.metadata?.packaging ?? "",
        subcategory: p.metadata?.subcategory ?? ""
      };
    }),
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
      stock_quantity:Number(p.stock_quantity ?? 0),
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
    ? await db.from("products").select("id,name,image_url,metadata").in("id",ids)
    : { data: [], error: null };
  if (pErr) throw pErr;
  const products = new Map((productsData ?? []).map((p:any)=>[p.id,p]));
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
    .select("id,sale_price_cents")
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

  let baseSubtotal = 0;
  let editedSubtotal = 0;
  for (const id of ids) {
    const price = prices.get(id) ?? 0;
    baseSubtotal += price * (baseQty.get(id) ?? 0);
    editedSubtotal += price * (editedQty.get(id) ?? 0);
  }
  const hiddenDelta = Number(basket.display_price_cents || 0) - baseSubtotal;
  const total = Math.max(0, Math.round(hiddenDelta + editedSubtotal));
  return json({ok:true,total_cents:total});
}


async function submitOrder(payload:any) {
  const payment=text(payload?.payment_method,80);
  const whatsappPhone=normalizeWhatsappPhone(payload?.whatsapp_phone);
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
      .select("id,sku,name,image_url,sale_price_cents")
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

    let editedSubtotal=0;
    for(const [id,qty] of editedQty) editedSubtotal+=Number(bpMap.get(id)?.sale_price_cents??0)*qty;
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
            metadata:{source:"vitrine",image_url:p?.image_url??""}
          };
        })
    });
  }

  if(!orderItems.length) return {error:"empty_cart",status:400};

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
      delivery_address_snapshot:null,
      payment_method_snapshot:{method:payment,label:payment,timing:"on_delivery",source:"vitrine"},
      confirmed_at:null,
      delivered_at:null
    }).select("id,order_number,total_cents").single();
    if(!res.error){order=res.data;orderError=null;break}
    orderError=res.error;
    if(res.error.code!=="23505") break;
  }
  if(!order) throw orderError??new Error("order_insert_failed");

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
    await db.from("orders").delete().eq("id",order.id);
    throw error;
  }

  return {order_id:order.id,order_number:order.order_number,total_cents:order.total_cents,phone_attached:Boolean(whatsappPhone)};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
  try {
    const url = new URL(req.url);
    const action = text(url.searchParams.get("action") || (req.method === "POST" ? "basket_quote" : "home"), 40);
    if (action === "health") return json({ok:true,service:"simple-storefront-v1"},200,{"Cache-Control":"no-store"});
    if (req.method === "GET" && action === "home") return json(await home(),200,{"Cache-Control":"public, max-age=300, stale-while-revalidate=900"});
    if (req.method === "GET" && action === "offers") return json(await offers(),200,{"Cache-Control":"public, max-age=120, stale-while-revalidate=600"});
    if (req.method === "GET" && action === "products") return json(await products(url),200,{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"});
    if (req.method === "GET" && action === "product") {
      const id = uuid(url.searchParams.get("product_id"));
      if (!id) return json({ok:false,error:"invalid_product"},400);
      return await productDetail(id);
    }
    if (req.method === "GET" && action === "basket") {
      const id = uuid(url.searchParams.get("basket_id"));
      if (!id) return json({ok:false,error:"invalid_basket"},400);
      return await basketDetail(id);
    }
    if (req.method === "POST" && action === "basket_quote") {
      const payload = await req.json().catch(()=>({}));
      return await basketQuote(payload);
    }
    if (req.method === "POST" && action === "submit_order") {
      const payload = await req.json().catch(()=>({}));
      const result=await submitOrder(payload);
      if(result.error) return json({ok:false,error:result.error},result.status,{"Cache-Control":"no-store"});
      return json({ok:true,...result},200,{"Cache-Control":"no-store"});
    }
    return json({ok:false,error:"not_found"},404);
  } catch (error) {
    console.error("simple-storefront-v1", error);
    return json({ok:false,error:"service_unavailable"},500,{"Cache-Control":"no-store"});
  }
});
