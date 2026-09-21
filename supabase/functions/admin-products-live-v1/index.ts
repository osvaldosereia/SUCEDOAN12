import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PRODUCT_FIELDS = "id,bling_product_id,sku,name,gtin,ncm,price,cost,stock,image_url,brand,category,subcategory,subsubcategory,packaging,supplier,unit,validity_date,gondola,shelf,is_active,is_whatsapp_active,is_offer,is_upsell,min_stock,physically_verified,last_counted_at,sync_status,sync_error,source_system,metadata,created_at,updated_at";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const text = (value: unknown, max = 300) => String(value ?? "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);
const digits = (value: unknown, max = 32) => String(value ?? "").replace(/\D/g, "").slice(0, max);
const int = (value: unknown, min: number, max: number) => Math.min(max, Math.max(min, Number.parseInt(String(value ?? min), 10) || min));
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const bool = (value: unknown) => value === true || value === "true" || value === 1 || value === "1";
const dateOnly = (value: unknown) => {
  const raw = text(value, 20);
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};
function variants(value: unknown) {
  const base = digits(value) || text(value, 120).toUpperCase();
  if (!base) return [];
  const out = [base];
  if (/^\d+$/.test(base)) {
    if (base.length === 12) out.push("0" + base);
    if (base.length === 13 && base.startsWith("0")) out.push(base.slice(1));
    const noZero = base.replace(/^0+(?=\d)/, "");
    if (noZero) out.push(noZero);
  }
  return [...new Set(out.filter(Boolean))];
}
function validGtin(value: unknown) {
  const g = digits(value);
  if (!g) return true;
  if (![8,12,13,14].includes(g.length)) return false;
  const expected = Number(g.at(-1));
  let sum = 0;
  for (let i=g.length-2, offset=0;i>=0;i--,offset++) sum += Number(g[i]) * (offset % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === expected;
}

async function basketCatalog(sb: any) {
  const { data: templates, error } = await sb.from("basket_templates")
    .select("id,sku,name,description,image_url,base_price,is_active,sort_order,rules,updated_at")
    .order("sort_order",{ascending:true}).order("name",{ascending:true});
  if (error) throw new Error("basket_catalog_failed:" + error.message);
  const ids=(templates||[]).map((x:any)=>x.id);
  let items:any[]=[];
  if(ids.length){
    const result=await sb.from("basket_template_items")
      .select("basket_id,quantity,removable,quantity_editable,min_quantity,max_quantity,substitution_group,pricing_rule,sort_order,product:products(id,sku,gtin,name,price,image_url,brand,packaging,is_active)")
      .in("basket_id",ids).order("sort_order",{ascending:true});
    if(result.error)throw new Error("basket_items_failed:"+result.error.message);
    items=result.data||[];
  }
  return (templates||[]).map((t:any)=>{
    const rules=t.rules&&typeof t.rules==="object"?t.rules:{};
    return {
      id:text(rules.legacy_id||t.sku,160),codigo:text(t.sku,160),nome:text(t.name,300),
      descricao:text(t.description,1200),preco:Number(t.base_price||0),imagem:text(t.image_url,1200),
      ativo:t.is_active!==false,ordem:Number(t.sort_order||0),updated_at:t.updated_at,
      produtos:items.filter((i:any)=>i.basket_id===t.id).map((i:any)=>{
        const p=Array.isArray(i.product)?i.product[0]:i.product||{};
        const snapshot=i.pricing_rule&&typeof i.pricing_rule==="object"?i.pricing_rule:{};
        return {...snapshot,qtd:Number(i.quantity||1),codigo:text(p.sku||p.gtin||p.id,160),
          trocas_permitidas:Array.isArray(snapshot.trocas_permitidas)?snapshot.trocas_permitidas:[]};
      })
    };
  });
}
async function kitCatalog(sb:any){
  const {data:templates,error}=await sb.from("kit_templates")
    .select("id,legacy_id,sku,name,description,image_url,price,previous_price,discount_percent,stock_limit,stock_available,starts_on,ends_on,is_active,active_until_stock_zero,metadata,sort_order,updated_at")
    .order("sort_order",{ascending:true}).order("name",{ascending:true});
  if(error)throw new Error("kit_catalog_failed:"+error.message);
  const ids=(templates||[]).map((x:any)=>x.id);let items:any[]=[];
  if(ids.length){
    const result=await sb.from("kit_template_items")
      .select("kit_id,quantity,substitute_product_codes,pricing_snapshot,sort_order,product:products(id,sku,gtin,name,price,image_url,brand,packaging,is_active)")
      .in("kit_id",ids).order("sort_order",{ascending:true});
    if(result.error)throw new Error("kit_items_failed:"+result.error.message);
    items=result.data||[];
  }
  return (templates||[]).map((t:any)=>{
    const meta=t.metadata&&typeof t.metadata==="object"?t.metadata:{};
    const base=meta.admin_payload&&typeof meta.admin_payload==="object"?meta.admin_payload:{};
    return {...base,id:text(t.legacy_id,160),codigo:text(t.sku,160),nome:text(t.name,300),
      descricao:text(t.description,4000),imagem:text(t.image_url,1200),preco:Number(t.price||0),
      preco_novo:Number(t.price||0),preco_anterior:t.previous_price==null?null:Number(t.previous_price),
      desconto_percentual:t.discount_percent==null?null:Number(t.discount_percent),
      limite_kits:t.stock_limit,estoque_disponivel:t.stock_available,data_inicio:t.starts_on||"",
      data_fim:t.ends_on||"",ativo:t.is_active===true,ativo_ate_estoque_zero:t.active_until_stock_zero===true,
      atualizado_em:t.updated_at,
      produtos:items.filter((i:any)=>i.kit_id===t.id).map((i:any)=>{
        const p=Array.isArray(i.product)?i.product[0]:i.product||{};
        const snap=i.pricing_snapshot&&typeof i.pricing_snapshot==="object"?i.pricing_snapshot:{};
        return {...snap,qtd:Number(i.quantity||1),codigo:text(p.sku||p.gtin||p.id,160),
          substitutos:Array.isArray(i.substitute_product_codes)?i.substitute_product_codes:[]};
      })};
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "server_config" }, 500);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "missing_token" }, 401);

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await sb.auth.getUser(token);
  if (userError || !userData?.user?.id) return json({ ok: false, error: "invalid_user" }, 401);

  const { data: admin, error: adminError } = await sb.from("admin_users")
    .select("role,is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (adminError) return json({ ok: false, error: "admin_lookup_failed" }, 500);
  if (!admin?.is_active) return json({ ok: false, error: "admin_not_authorized" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const action = text(body?.action || "products", 40).toLowerCase();
  const writable = admin.role !== "viewer";

  if (action === "health") return json({ ok: true, source: "supabase_only", version: 3, authenticated: true, collections: "supabase" });

  if (action === "catalog") {
    const limit = int(body?.limit, 1, 2500);
    const { data, error } = await sb.from("products")
      .select(PRODUCT_FIELDS)
      .order("name", { ascending: true })
      .limit(limit);
    if (error) return json({ ok: false, error: "catalog_failed", detail: error.message }, 400);
    return json({ ok: true, source: "supabase", products: data || [], total: (data || []).length, truncated: (data || []).length >= limit });
  }

  if (action === "lookup") {
    const code = text(body?.code, 120);
    const productId = text(body?.id, 80);
    let product: any = null;
    if (productId) {
      const { data } = await sb.from("products").select(PRODUCT_FIELDS).eq("id", productId).maybeSingle();
      product = data || null;
    }
    if (!product && code) {
      for (const candidate of variants(code)) {
        if (/^\d+$/.test(candidate)) {
          const { data } = await sb.from("products").select(PRODUCT_FIELDS).eq("gtin", candidate).limit(1).maybeSingle();
          if (data) { product = data; break; }
        }
      }
    }
    if (!product && code) {
      const { data } = await sb.from("products").select(PRODUCT_FIELDS).eq("sku", code).limit(1).maybeSingle();
      product = data || null;
    }
    return json({ ok: true, source: "supabase", product });
  }

  if (action === "basket_catalog") {
    try { return json({ok:true,source:"supabase",baskets:await basketCatalog(sb)}); }
    catch(error){return json({ok:false,error:"basket_catalog_failed",detail:String((error as Error)?.message||error)},400);}
  }

  if (action === "kit_catalog") {
    try { return json({ok:true,source:"supabase",kits:await kitCatalog(sb)}); }
    catch(error){return json({ok:false,error:"kit_catalog_failed",detail:String((error as Error)?.message||error)},400);}
  }

  if (action === "save_basket") {
    if(!writable)return json({ok:false,error:"read_only"},403);
    const payload=body?.basket&&typeof body.basket==="object"?body.basket:null;
    if(!payload)return json({ok:false,error:"basket_required"},400);
    const result=await sb.rpc("admin_save_basket_template_v1",{p_payload:payload,p_user_id:userData.user.id});
    if(result.error)return json({ok:false,error:"basket_save_failed",detail:result.error.message},400);
    return json({ok:true,source:"supabase",id:result.data,baskets:await basketCatalog(sb)});
  }

  if (action === "save_kit") {
    if(!writable)return json({ok:false,error:"read_only"},403);
    const payload=body?.kit&&typeof body.kit==="object"?body.kit:null;
    if(!payload)return json({ok:false,error:"kit_required"},400);
    const result=await sb.rpc("admin_save_kit_template_v1",{p_payload:payload,p_user_id:userData.user.id});
    if(result.error)return json({ok:false,error:"kit_save_failed",detail:result.error.message},400);
    return json({ok:true,source:"supabase",id:result.data,kits:await kitCatalog(sb)});
  }

  if (action === "archive_basket") {
    if(!writable)return json({ok:false,error:"read_only"},403);
    const identity=text(body?.id,160);if(!identity)return json({ok:false,error:"id_required"},400);
    const catalog=await basketCatalog(sb);const found=catalog.find((x:any)=>x.id===identity||x.codigo===identity);
    if(!found)return json({ok:false,error:"basket_not_found"},404);
    const lookup=await sb.from("basket_templates").select("id").eq("sku",found.codigo).maybeSingle();
    if(lookup.error||!lookup.data)return json({ok:false,error:"basket_not_found"},404);
    const saved=await sb.from("basket_templates").update({is_active:false,updated_by:userData.user.id,updated_at:new Date().toISOString()}).eq("id",lookup.data.id);
    if(saved.error)return json({ok:false,error:"basket_archive_failed",detail:saved.error.message},400);
    return json({ok:true,source:"supabase",baskets:await basketCatalog(sb)});
  }

  if (action === "archive_kit") {
    if(!writable)return json({ok:false,error:"read_only"},403);
    const identity=text(body?.id,160);if(!identity)return json({ok:false,error:"id_required"},400);
    const saved=await sb.from("kit_templates").update({is_active:false,updated_by:userData.user.id,updated_at:new Date().toISOString()}).eq("legacy_id",identity);
    if(saved.error)return json({ok:false,error:"kit_archive_failed",detail:saved.error.message},400);
    return json({ok:true,source:"supabase",kits:await kitCatalog(sb)});
  }

  if (action === "taxonomy") {
    const { data, error } = await sb.from("products")
      .select("category,subcategory,subsubcategory,brand")
      .order("category", { ascending: true })
      .limit(2500);
    if (error) return json({ ok: false, error: "taxonomy_failed", detail: error.message }, 400);
    const rows = data || [];
    const categories = [...new Set(rows.map((x:any)=>text(x.category,160)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    const brands = [...new Set(rows.map((x:any)=>text(x.brand,160)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    const subcategories = [...new Set(rows.map((x:any)=>text(x.subcategory,160)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    const subsubcategories = [...new Set(rows.map((x:any)=>text(x.subsubcategory,160)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    return json({ ok: true, source: "supabase", categories, subcategories, subsubcategories, brands, product_count: rows.length });
  }

  if (action === "save_product") {
    if (!writable) return json({ ok: false, error: "read_only" }, 403);
    const id = text(body?.id, 80);
    if (!id) return json({ ok: false, error: "id_required" }, 400);
    const src = body?.patch && typeof body.patch === "object" ? body.patch : {};
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), last_admin_edit_at: new Date().toISOString(), last_admin_edit_by: userData.user.id };

    for (const [field,max] of [["name",300],["sku",120],["brand",160],["category",160],["subcategory",160],["subsubcategory",160],["packaging",120],["supplier",200],["unit",40],["gondola",80],["shelf",80],["image_url",1200],["description_short",1000],["description_long",5000]] as const) {
      if (Object.prototype.hasOwnProperty.call(src, field)) patch[field] = text(src[field], max) || null;
    }
    if (Object.prototype.hasOwnProperty.call(src, "gtin")) {
      if (!validGtin(src.gtin)) return json({ ok: false, error: "invalid_gtin" }, 400);
      patch.gtin = digits(src.gtin) || null;
    }
    if (Object.prototype.hasOwnProperty.call(src, "ncm")) {
      const ncm = digits(src.ncm, 16);
      if (ncm && ncm.length !== 8) return json({ ok: false, error: "invalid_ncm" }, 400);
      patch.ncm = ncm || null;
    }
    for (const field of ["price","cost","stock","min_stock"]) {
      if (!Object.prototype.hasOwnProperty.call(src, field)) continue;
      const value = numberOrNull(src[field]);
      if (value !== null && value < 0) return json({ ok: false, error: "invalid_" + field }, 400);
      patch[field] = value;
    }
    if (Object.prototype.hasOwnProperty.call(src, "validity_date")) {
      if (src.validity_date && !dateOnly(src.validity_date)) return json({ ok: false, error: "invalid_validity_date" }, 400);
      patch.validity_date = dateOnly(src.validity_date);
    }
    for (const field of ["is_active","is_whatsapp_active","is_offer","is_upsell"]) {
      if (Object.prototype.hasOwnProperty.call(src, field)) patch[field] = bool(src[field]);
    }
    if (Array.isArray(src.tags)) patch.tags = src.tags.map((v:any)=>text(v,80)).filter(Boolean).slice(0,50);
    if (patch.name === null) return json({ ok: false, error: "name_required" }, 400);

    const { data, error } = await sb.from("products").update(patch).eq("id", id).select(PRODUCT_FIELDS).single();
    if (error) return json({ ok: false, error: "product_save_failed", detail: error.message }, 400);
    return json({ ok: true, source: "supabase", product: data });
  }

  if (action === "create_product") {
    if (!writable) return json({ ok: false, error: "read_only" }, 403);
    const src = body?.product && typeof body.product === "object" ? body.product : body;
    const name = text(src?.name, 300);
    const gtin = digits(src?.gtin);
    if (!name) return json({ ok: false, error: "name_required" }, 400);
    if (gtin && !validGtin(gtin)) return json({ ok: false, error: "invalid_gtin" }, 400);
    if (gtin) {
      const existing = await sb.from("products").select("id,name,gtin").eq("gtin", gtin).limit(1).maybeSingle();
      if (existing.data) return json({ ok: false, error: "product_already_exists", product: existing.data }, 409);
    }
    const payload: Record<string, unknown> = {
      name, gtin: gtin || null,
      sku: text(src?.sku,120)||null,
      brand: text(src?.brand,160)||null,
      category: text(src?.category,160)||null,
      subcategory: text(src?.subcategory,160)||null,
      subsubcategory: text(src?.subsubcategory,160)||null,
      packaging: text(src?.packaging,120)||null,
      supplier: text(src?.supplier,200)||null,
      unit: text(src?.unit,40)||null,
      ncm: digits(src?.ncm,16)||null,
      price: numberOrNull(src?.price),
      cost: numberOrNull(src?.cost),
      stock: numberOrNull(src?.stock) ?? 0,
      validity_date: dateOnly(src?.validity_date),
      gondola: text(src?.gondola,80)||null,
      shelf: text(src?.shelf,80)||null,
      image_url: text(src?.image_url,1200)||null,
      description_short: text(src?.description_short,1000)||null,
      is_active: src?.is_active === true,
      is_whatsapp_active: false,
      physically_verified: src?.physically_verified === true,
      physically_verified_at: src?.physically_verified === true ? new Date().toISOString() : null,
      physically_verified_by: src?.physically_verified === true ? userData.user.id : null,
      source_system: "admin_registration",
      sync_status: "local",
      last_admin_edit_at: new Date().toISOString(),
      last_admin_edit_by: userData.user.id,
      metadata: { admin_registration: true, created_by: userData.user.id },
    };
    const { data, error } = await sb.from("products").insert(payload).select(PRODUCT_FIELDS).single();
    if (error) return json({ ok: false, error: "product_create_failed", detail: error.message }, 400);
    return json({ ok: true, source: "supabase", product: data });
  }

  if (action !== "products") return json({ ok: false, error: "unknown_action" }, 400);

  const limit = int(body?.limit, 10, 100);
  const page = int(body?.page, 1, 100000);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const q = text(body?.q, 100);
  const sync = text(body?.sync_status, 50);
  const status = text(body?.status, 30);
  const category = text(body?.category, 120);
  const brand = text(body?.brand, 120);
  const gondola = text(body?.gondola, 100);
  const shelf = text(body?.shelf, 100);
  const expiry = text(body?.expiry, 20);
  const sort = text(body?.sort, 30);

  let query = sb.from("products").select(PRODUCT_FIELDS, { count: "exact" })
    .or("physically_verified.eq.true,source_system.eq.inventory_fast_discovered,source_system.eq.ai_ean_research,source_system.eq.admin_registration")
    .range(from, to);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const days = (n: number) => new Date(Date.parse(today + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

  if (category) query = query.ilike("category", "%" + category.replace(/[%_]/g, "") + "%");
  if (brand) query = query.ilike("brand", "%" + brand.replace(/[%_]/g, "") + "%");
  if (gondola) query = query.eq("gondola", gondola);
  if (shelf) query = query.eq("shelf", shelf);
  if (expiry === "expired") query = query.lt("validity_date", today);
  if (expiry === "30") query = query.gte("validity_date", today).lte("validity_date", days(30));
  if (expiry === "60") query = query.gt("validity_date", days(30)).lte("validity_date", days(60));
  if (expiry === "missing") query = query.is("validity_date", null);

  if (q) {
    const safe = q.replace(/[,%()]/g, " ").trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,gtin.ilike.%${safe}%,sku.ilike.%${safe}%,brand.ilike.%${safe}%`);
  }
  if (sync) query = query.eq("sync_status", sync);

  if (status === "verified") query = query.eq("physically_verified", true);
  else if (status === "counting") query = query.eq("source_system", "inventory_fast_discovered").eq("physically_verified", false);
  else if (status === "ai-created") query = query.eq("source_system", "ai_ean_research");
  else if (status === "ai-review") query = query.eq("source_system", "ai_ean_research").eq("is_active", false);
  else if (status === "whatsapp") query = query.eq("is_whatsapp_active", true);
  else if (status === "offer") query = query.eq("is_offer", true);
  else if (status === "no-stock") query = query.lte("stock", 0);
  else if (status === "inactive") query = query.eq("is_active", false);
  else if (status === "upsell") query = query.eq("is_upsell", true);

  const orderColumn = ({ name: "name", expiry: "validity_date", stock: "stock", price: "price" } as Record<string, string>)[sort] || "updated_at";
  query = query.order(orderColumn, { ascending: orderColumn !== "updated_at", nullsFirst: false }).order("id");

  const [listResult, verified, counting, aiReview, aiCreated] = await Promise.all([
    query,
    sb.from("products").select("id", { count: "exact", head: true }).eq("physically_verified", true),
    sb.from("products").select("id", { count: "exact", head: true }).eq("source_system", "inventory_fast_discovered").eq("physically_verified", false),
    sb.from("products").select("id", { count: "exact", head: true }).eq("source_system", "ai_ean_research").eq("is_active", false),
    sb.from("products").select("id", { count: "exact", head: true }).eq("source_system", "ai_ean_research"),
  ]);

  if (listResult.error) return json({ ok: false, error: "products_failed", detail: listResult.error.message }, 400);

  return json({
    ok: true, source: "supabase", products: listResult.data || [],
    total: listResult.count || 0, page, limit,
    metrics: {
      verified: verified.count || 0,
      counting: counting.count || 0,
      ai_review: aiReview.count || 0,
      ai_created: aiCreated.count || 0,
    },
  });
});
