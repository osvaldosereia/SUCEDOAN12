import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_CODE = Deno.env.get("DONA_ADMIN_CODE") || "Eomc2020";
const ALLOWED_ORIGINS = new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PRODUCT_COLUMNS = [
  "id", "name", "brand", "sku", "gtin", "ncm", "price", "offer_price", "cost", "stock", "min_stock",
  "image_url", "whatsapp_category", "is_whatsapp_active", "is_offer", "is_active", "packaging", "unit",
  "supplier", "validity_date", "gondola", "shelf", "category", "subcategory", "subsubcategory",
  "description_short", "description_long", "tags", "sort_order", "is_upsell", "storefront_featured",
  "storefront_category", "sales_category", "customer_category", "customer_subcategory", "customer_subsubcategory",
].join(",");

const EDITABLE_TEXT_FIELDS = [
  "sku", "gtin", "ncm", "brand", "category", "subcategory", "subsubcategory", "packaging", "unit",
  "supplier", "validity_date", "gondola", "shelf", "image_url", "whatsapp_category", "description_short",
  "description_long", "storefront_category", "sales_category", "customer_category", "customer_subcategory",
  "customer_subsubcategory",
];
const EDITABLE_NUMBER_FIELDS = ["price", "offer_price", "cost", "stock", "min_stock"];
const EDITABLE_BOOLEAN_FIELDS = ["is_active", "is_offer", "is_whatsapp_active", "is_upsell", "storefront_featured"];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://donaantonia.com.br",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-admin-code, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function uuid(value: unknown) {
  const text = clean(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function integer(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function numeric(value: unknown, min = 0, max = 9999999) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) && number >= min && number <= max ? Math.round(number * 100) / 100 : null;
}

function cents(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function productPriceCents(product: any) {
  const price = product?.is_offer === true && product?.offer_price != null && Number(product.offer_price) >= 0
    ? Number(product.offer_price)
    : Number(product?.price || 0);
  return cents(price);
}

function errorResponse(error: any) {
  const code = String(error?.code || "");
  if (code === "23505") return { status: 409, error: "duplicate_product_identifier", message: "SKU ou GTIN já cadastrado em outro produto." };
  const detail = clean(error?.message || error, 400);
  if (detail.includes("basket_mold_basket_not_found")) return { status: 404, error: "basket_not_found", message: "Cesta não encontrada." };
  if (detail.includes("basket_mold_positions_required")) return { status: 400, error: "basket_positions_required", message: "A cesta precisa ter pelo menos um produto." };
  if (detail.includes("basket_mold_position_options_required")) return { status: 400, error: "basket_options_required", message: "Cada produto precisa ter ao menos uma opção." };
  if (detail.includes("basket_mold_duplicate_option")) return { status: 400, error: "duplicate_basket_option", message: "Remova marcas repetidas da mesma posição." };
  if (detail.includes("basket_mold_product_not_found")) return { status: 404, error: "product_not_found", message: "Um produto selecionado não existe mais." };
  return { status: 500, error: "catalog_operation_failed", message: "Não foi possível salvar. Confira os campos e tente novamente." };
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function productSearch(input: any) {
  const limit = integer(input.limit ?? 24, 1, 50) || 24;
  const offset = integer(input.offset ?? 0, 0, 100000) || 0;
  const status = ["active", "inactive"].includes(input.status) ? input.status : "all";
  const queryText = clean(input.q, 80).replace(/[^\p{L}\p{N}\s._-]/gu, " ").replace(/\s+/g, " ").trim();
  let query = db.from("products").select(PRODUCT_COLUMNS, { count: "exact" });
  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);
  if (queryText) {
    const pattern = `*${queryText}*`;
    query = query.or(`name.ilike.${pattern},sku.ilike.${pattern},brand.ilike.${pattern},gtin.ilike.${pattern}`);
  }
  const result = await query.order("is_active", { ascending: false }).order("name", { ascending: true }).range(offset, offset + limit - 1);
  if (result.error) throw result.error;
  return { products: result.data || [], total: result.count || 0, offset, limit };
}

async function productSave(input: any) {
  const id = input.id ? uuid(input.id) : "";
  if (input.id && !id) return { status: 400, error: "invalid_product_id", message: "Produto inválido." };
  const name = clean(input.name, 240);
  if (!name) return { status: 400, error: "product_name_required", message: "Informe o nome do produto." };

  const payload: Record<string, unknown> = { name };
  for (const field of EDITABLE_TEXT_FIELDS) payload[field] = clean(input[field], field.includes("description") ? 4000 : 500) || null;
  for (const field of EDITABLE_NUMBER_FIELDS) {
    const value = numeric(input[field]);
    if (input[field] !== "" && input[field] !== null && input[field] !== undefined && value === null) {
      return { status: 400, error: "invalid_product_number", message: `Valor inválido no campo ${field}.` };
    }
    payload[field] = value;
  }
  for (const field of EDITABLE_BOOLEAN_FIELDS) payload[field] = input[field] === true || String(input[field]).toLowerCase() === "true";
  const sortOrder = integer(input.sort_order ?? 0, 0, 2147483647);
  if (sortOrder === null) return { status: 400, error: "invalid_sort_order", message: "Ordem inválida." };
  payload.sort_order = sortOrder;
  payload.tags = Array.isArray(input.tags)
    ? input.tags.map((tag: unknown) => clean(tag, 60)).filter(Boolean).slice(0, 40)
    : clean(input.tags, 1000).split(",").map((tag) => clean(tag, 60)).filter(Boolean).slice(0, 40);

  const query = id
    ? db.from("products").update(payload).eq("id", id)
    : db.from("products").insert({ ...payload, is_active: input.is_active !== false });
  const result = await query.select(PRODUCT_COLUMNS).single();
  if (result.error) throw result.error;
  return { product: result.data };
}

async function basketList() {
  const templates = await db.from("basket_templates")
    .select("id,name,description,image_url,is_active,sort_order,base_price,category_id,subcategory_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (templates.error) throw templates.error;
  const editors = await mapLimit(templates.data || [], 5, async (basket: any) => {
    const result = await db.rpc("basket_mold_editor_v1", { p_basket_id: basket.id });
    if (result.error) return null;
    return { basket, editor: result.data };
  });
  const valid = editors.filter(Boolean) as Array<{ basket: any; editor: any }>;
  const ids = [...new Set(valid.flatMap(({ editor }) => (editor.positions || []).flatMap((position: any) => (position.options || []).map((option: any) => option.product_id))))];
  let productById = new Map<string, any>();
  if (ids.length) {
    const result = await db.from("products").select(PRODUCT_COLUMNS).in("id", ids);
    if (result.error) throw result.error;
    productById = new Map((result.data || []).map((product: any) => [String(product.id), product]));
  }

  const baskets = valid.map(({ basket, editor }) => {
    const positions = (editor.positions || []).slice().sort((a: any, b: any) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map((position: any) => ({
      id: position.position_id,
      label: position.label,
      quantity: Number(position.quantity || 0),
      sort_order: Number(position.sort_order || 0),
      metadata: position.metadata || {},
      options: (position.options || []).slice().sort((a: any, b: any) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map((option: any) => {
        const product = productById.get(String(option.product_id)) || {};
        return {
          option_id: option.option_id,
          product_id: option.product_id,
          sort_order: Number(option.sort_order || 0),
          metadata: option.metadata || {},
          product: { ...product, effective_price_cents: productPriceCents(product) },
        };
      }),
    }));
    const productTotal = positions.reduce((sum: number, position: any) => {
      const defaultProduct = position.options[0]?.product;
      return sum + Math.round(Number(defaultProduct?.effective_price_cents || 0) * position.quantity);
    }, 0);
    const conditionalApplied = editor.conditional_hidden_enabled && editor.conditional_hidden_product_id && positions.some((position: any) =>
      String(position.options[0]?.product_id) === String(editor.conditional_hidden_product_id) && position.quantity > 0
    ) ? cents(editor.conditional_hidden_adjustment) : 0;
    const hiddenAdjustment = cents(editor.hidden_adjustment);
    return {
      id: basket.id,
      name: basket.name,
      description: basket.description || "",
      image_url: basket.image_url || "",
      is_active: basket.is_active,
      mold_id: editor.mold_id,
      public_composition_count: Number(editor.public_composition_count || 1),
      hidden_adjustment_cents: hiddenAdjustment,
      conditional_hidden_enabled: editor.conditional_hidden_enabled === true,
      conditional_hidden_product_id: editor.conditional_hidden_product_id || null,
      conditional_hidden_adjustment_cents: cents(editor.conditional_hidden_adjustment),
      display_price_cents: Math.max(0, productTotal + hiddenAdjustment + conditionalApplied),
      positions,
    };
  });
  return { baskets };
}

async function basketSave(input: any) {
  const basketId = uuid(input.basket_id);
  const targetPriceCents = integer(input.target_price_cents, 0, 100000000);
  const positions = Array.isArray(input.positions) ? input.positions.slice(0, 80) : null;
  if (!basketId) return { status: 400, error: "invalid_basket_id", message: "Cesta inválida." };
  if (targetPriceCents === null) return { status: 400, error: "invalid_basket_price", message: "Informe um valor válido para a cesta." };
  if (!positions?.length) return { status: 400, error: "basket_positions_required", message: "A cesta precisa ter pelo menos um produto." };

  const editorResult = await db.rpc("basket_mold_editor_v1", { p_basket_id: basketId });
  if (editorResult.error || !editorResult.data) return { status: 404, error: "basket_not_found", message: "Cesta não encontrada." };
  const editor = editorResult.data;
  const publicCount = integer(input.public_composition_count ?? editor.public_composition_count, 1, 6);
  if (publicCount === null) return { status: 400, error: "invalid_composition_count", message: "Número de composições inválido." };

  const normalized = [] as Array<Record<string, unknown>>;
  const productIds = new Set<string>();
  for (const [positionIndex, position] of positions.entries()) {
    const label = clean(position.label, 180);
    const quantity = numeric(position.quantity, 0.01, 999);
    const options = Array.isArray(position.options) ? position.options.slice(0, 40) : [];
    if (!label || quantity === null || !options.length) return { status: 400, error: "invalid_basket_position", message: "Cada posição precisa de nome, quantidade e pelo menos uma marca." };
    const normalizedOptions = [];
    const seen = new Set<string>();
    for (const [optionIndex, option] of options.entries()) {
      const productId = uuid(option.product_id);
      if (!productId || seen.has(productId)) return { status: 400, error: "invalid_basket_option", message: "Remova produtos inválidos ou repetidos." };
      seen.add(productId);
      productIds.add(productId);
      normalizedOptions.push({ product_id: productId, metadata: option.metadata || {}, sort_order: optionIndex });
    }
    normalized.push({ label, quantity, metadata: position.metadata || {}, sort_order: positionIndex, options: normalizedOptions });
  }

  const productsResult = await db.from("products").select("id,price,offer_price,is_offer,is_active").in("id", [...productIds]);
  if (productsResult.error) throw productsResult.error;
  const productById = new Map((productsResult.data || []).map((product: any) => [String(product.id), product]));
  if (productById.size !== productIds.size) return { status: 404, error: "product_not_found", message: "Um produto escolhido não existe mais." };

  let productTotal = 0;
  for (const position of normalized as any[]) {
    const defaultProduct = productById.get(String(position.options[0].product_id));
    productTotal += Math.round(productPriceCents(defaultProduct) * Number(position.quantity));
  }
  const conditionalApplied = editor.conditional_hidden_enabled && editor.conditional_hidden_product_id && normalized.some((position: any) =>
    String(position.options[0]?.product_id) === String(editor.conditional_hidden_product_id) && Number(position.quantity) > 0
  ) ? cents(editor.conditional_hidden_adjustment) : 0;
  const hiddenAdjustment = (targetPriceCents - productTotal - conditionalApplied) / 100;

  const saved = await db.rpc("save_basket_mold_v1", {
    p_basket_id: basketId,
    p_hidden_adjustment: hiddenAdjustment,
    p_public_composition_count: publicCount,
    p_positions: normalized,
    p_operator: "Admin site Dona Antônia",
  });
  if (saved.error) throw saved.error;
  return {
    editor: saved.data,
    display_price_cents: targetPriceCents,
    hidden_adjustment_cents: cents(hiddenAdjustment),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (!["GET", "POST"].includes(req.method)) return json(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { ok: false, error: "server_config" }, 500);
  const origin = req.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { ok: false, error: "origin_not_allowed" }, 403);
  if (req.headers.get("x-admin-code") !== ADMIN_CODE) return json(req, { ok: false, error: "admin_code_invalid" }, 401);

  try {
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); }
      catch { return json(req, { ok: false, error: "invalid_json" }, 400); }
    }
    const input = { ...Object.fromEntries(url.searchParams.entries()), ...body };
    const action = clean(input.action, 40);
    let result: any;
    if (req.method === "GET" && action === "baskets") result = await basketList();
    else if (req.method === "GET" && action === "products") result = await productSearch(input);
    else if (req.method === "POST" && action === "product_save") result = await productSave(input);
    else if (req.method === "POST" && action === "basket_save") result = await basketSave(input);
    else return json(req, { ok: false, error: "action_invalid" }, 400);

    if (result?.error) return json(req, { ok: false, ...result }, Number(result.status || 400));
    return json(req, { ok: true, ...result });
  } catch (error) {
    console.error("site-admin-v1", error);
    const response = errorResponse(error);
    return json(req, { ok: false, ...response }, response.status);
  }
});

