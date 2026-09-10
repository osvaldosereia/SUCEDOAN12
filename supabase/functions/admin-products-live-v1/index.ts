import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const text = (value: unknown, max = 300) => String(value ?? "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);
const int = (value: unknown, min: number, max: number) => Math.min(max, Math.max(min, Number.parseInt(String(value ?? min), 10) || min));

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

  let query = sb.from("products").select(
    "id,bling_product_id,sku,name,gtin,ncm,price,cost,stock,image_url,brand,category,subcategory,packaging,validity_date,gondola,shelf,is_active,is_whatsapp_active,is_offer,is_upsell,min_stock,physically_verified,last_counted_at,sync_status,sync_error,source_system,metadata,created_at,updated_at",
    { count: "exact" },
  ).or("physically_verified.eq.true,source_system.eq.inventory_fast_discovered,source_system.eq.ai_ean_research").range(from, to);

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
    ok: true,
    products: listResult.data || [],
    total: listResult.count || 0,
    page,
    limit,
    metrics: {
      verified: verified.count || 0,
      counting: counting.count || 0,
      ai_review: aiReview.count || 0,
      ai_created: aiCreated.count || 0,
    },
  });
});
