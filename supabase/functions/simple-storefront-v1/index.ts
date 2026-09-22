import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORG_ID = "95b1b61d-f6ed-41cb-8917-b55f6793b10b";
const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
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
  const [{ data: baskets, error: bErr }, { data: offers, error: oErr }] = await Promise.all([
    db.from("baskets")
      .select("id,name,display_price_cents,image_url")
      .eq("organization_id", ORG_ID)
      .eq("active", true)
      .order("display_price_cents", { ascending: true })
      .order("name", { ascending: true }),
    db.from("offers")
      .select("id,product_id,title,sale_price_cents,starts_at,ends_at")
      .eq("organization_id", ORG_ID)
      .eq("active", true)
      .limit(40)
  ]);
  if (bErr) throw bErr;
  if (oErr) throw oErr;

  const currentOffers = (offers ?? []).filter(nowActive);
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
    .map((o:any) => {
      const p = pMap.get(o.product_id);
      if (!p) return null;
      return {
        id: o.id,
        product_id: p.id,
        name: p.name,
        image_url: p.image_url,
        price_cents: Number(o.sale_price_cents || 0),
        regular_price_cents: Number(p.sale_price_cents || 0),
        packaging: p.metadata?.packaging ?? ""
      };
    })
    .filter(Boolean)
    .sort((a:any,b:any)=>a.name.localeCompare(b.name,"pt-BR"));

  return {
    ok: true,
    version: "simple-storefront-v1",
    baskets: baskets ?? [],
    offers: publicOffers,
    categories: CATEGORIES
  };
}

async function products(url: URL) {
  const category = text(url.searchParams.get("category"), 48);
  const q = text(url.searchParams.get("q"), 60);
  const limit = Math.floor(num(url.searchParams.get("limit") ?? 40, 1, 60));
  const offset = Math.floor(num(url.searchParams.get("offset") ?? 0, 0, 5000));

  let query = db.from("products")
    .select("id,name,image_url,sale_price_cents,stock_quantity,metadata")
    .eq("organization_id", ORG_ID)
    .eq("active", true)
    .gt("stock_quantity", 0)
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (category) query = query.contains("metadata", { sales_category: category });
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g,"")}%`);

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
    ? await db.from("products").select("id,name").in("id",ids)
    : { data: [], error: null };
  if (pErr) throw pErr;
  const names = new Map((productsData ?? []).map((p:any)=>[p.id,p.name]));
  return json({
    ok:true,
    basket,
    items:(items ?? []).map((x:any)=>({
      product_id:x.product_id,
      name:names.get(x.product_id) ?? "Produto",
      quantity:Number(x.quantity || 0)
    }))
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
  try {
    const url = new URL(req.url);
    const action = text(url.searchParams.get("action") || (req.method === "POST" ? "basket_quote" : "home"), 40);
    if (action === "health") return json({ok:true,service:"simple-storefront-v1"},200,{"Cache-Control":"no-store"});
    if (req.method === "GET" && action === "home") return json(await home());
    if (req.method === "GET" && action === "products") return json(await products(url));
    if (req.method === "GET" && action === "basket") {
      const id = uuid(url.searchParams.get("basket_id"));
      if (!id) return json({ok:false,error:"invalid_basket"},400);
      return await basketDetail(id);
    }
    if (req.method === "POST" && action === "basket_quote") {
      const payload = await req.json().catch(()=>({}));
      return await basketQuote(payload);
    }
    return json({ok:false,error:"not_found"},404);
  } catch (error) {
    console.error("simple-storefront-v1", error);
    return json({ok:false,error:"service_unavailable"},500,{"Cache-Control":"no-store"});
  }
});
