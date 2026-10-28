import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { verifyAdminCode } from "../_shared/admin-code-v1.ts";
import { sendTextViaMeta, sendMediaViaMeta, MetaTransportError } from "../_shared/whatsapp-meta-transport-v1.mjs";
import { canonicalOutboundMetaMime, outboundMetaMaxBytes, validateOutboundMetaMediaContent, uploadMetaMedia, MetaMediaError } from "../_shared/whatsapp-meta-media-v1.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const META_WHATSAPP_ACCESS_TOKEN = (Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "").trim();
const META_WHATSAPP_GRAPH_VERSION = (Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "").trim();
const attendanceMetaConfigReady = () => Boolean(META_WHATSAPP_ACCESS_TOKEN && /^v\d+\.\d+$/.test(META_WHATSAPP_GRAPH_VERSION));
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

function normalizeBrazilPhone(value: unknown) {
  let digits = clean(value, 30).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  let local = "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) local = digits.slice(2);
  else if (digits.length === 10 || digits.length === 11) local = digits;
  else return "";
  if (local.length === 10 && /[6-9]/.test(local.charAt(2))) local = local.slice(0, 2) + "9" + local.slice(2);
  return "+55" + local;
}

async function customerLookup(input: any) {
  const phone = normalizeBrazilPhone(input.phone);
  if (!phone) return { found: false };

  const match = await db.rpc("lookup_customer_by_phone", { p_phone: phone });
  if (match.error) throw match.error;
  let customerId = uuid(match.data?.[0]?.customer_id);

  if (!customerId) {
    const exact = await db.from("customers").select("id")
      .eq("primary_whatsapp_e164", phone).eq("is_active", true).limit(2);
    if (exact.error) throw exact.error;
    if (exact.data?.length === 1) customerId = uuid(exact.data[0].id);
  }
  if (!customerId) return { found: false };

  const [customerResult, addressResult] = await Promise.all([
    db.from("customers").select("id,name,cpf_cnpj,primary_whatsapp_e164,updated_at")
      .eq("id", customerId).maybeSingle(),
    db.from("customer_addresses")
      .select("id,street,number,complement,neighborhood,city,state,postal_code,reference,updated_at")
      .eq("customer_id", customerId).eq("is_active", true)
      .order("is_default", { ascending: false }).order("updated_at", { ascending: false })
      .limit(1).maybeSingle(),
  ]);
  if (customerResult.error) throw customerResult.error;
  if (addressResult.error) throw addressResult.error;
  if (!customerResult.data) return { found: false };

  const document = String(customerResult.data.cpf_cnpj || "").replace(/\D+/g, "");
  const address = addressResult.data ? {
    id: addressResult.data.id,
    updated_at: addressResult.data.updated_at,
    street: addressResult.data.street || "",
    number: addressResult.data.number || "",
    complement: addressResult.data.complement || "",
    neighborhood: addressResult.data.neighborhood || "",
    city: addressResult.data.city || "",
    state: addressResult.data.state || "MT",
    postal_code: addressResult.data.postal_code || "",
    reference: addressResult.data.reference || "",
  } : null;

  return {
    found: true,
    customer: {
      id: customerResult.data.id,
      updated_at: customerResult.data.updated_at,
      display_name: customerResult.data.name || "",
      phone: customerResult.data.primary_whatsapp_e164 || phone,
      document_last4: document ? document.slice(-4) : "",
      address,
    },
  };
}


async function customerSave(input: any) {
  const customerId = uuid(input.customer_id);
  const expectedCustomerUpdatedAt = clean(input.customer_updated_at, 80);
  const name = clean(input.name, 180);
  if (!customerId || !expectedCustomerUpdatedAt || Number.isNaN(Date.parse(expectedCustomerUpdatedAt))) {
    return { error: "invalid_customer_snapshot", status: 400 };
  }
  if (name.length < 2) return { error: "customer_name_required", status: 400 };

  const addressId = uuid(input.address_id);
  const expectedAddressUpdatedAt = clean(input.address_updated_at, 80);
  if (addressId && (!expectedAddressUpdatedAt || Number.isNaN(Date.parse(expectedAddressUpdatedAt)))) {
    return { error: "invalid_address_snapshot", status: 400 };
  }

  const rawAddress = input.address && typeof input.address === "object" ? input.address : {};
  const address = {
    street: clean(rawAddress.street, 180),
    number: clean(rawAddress.number, 40),
    complement: clean(rawAddress.complement, 140),
    neighborhood: clean(rawAddress.neighborhood, 140),
    city: clean(rawAddress.city, 120),
    state: clean(rawAddress.state, 2).toUpperCase(),
    postal_code: clean(rawAddress.postal_code, 20),
    reference: clean(rawAddress.reference, 220),
  };
  const updated = await db.rpc("ops2_site_admin_customer_update_v1", {
    p_customer_id: customerId,
    p_expected_customer_updated_at: expectedCustomerUpdatedAt,
    p_name: name,
    p_address_id: addressId || null,
    p_expected_address_updated_at: addressId ? expectedAddressUpdatedAt : null,
    p_address: address,
  });
  if (updated.error) throw updated.error;
  if (updated.data?.ok !== true) {
    const code = clean(updated.data?.error, 60) || "customer_save_failed";
    const status = code === "customer_not_found" || code === "customer_address_not_found" ? 404
      : code === "customer_changed" ? 409 : 400;
    return { error: code, status };
  }
  return {
    saved: true,
    customer_id: customerId,
    customer_updated_at: updated.data.customer_updated_at,
    address_id: updated.data.address_id || null,
    address_updated_at: updated.data.address_updated_at || null,
  };
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
  const lowerDetail = detail.toLowerCase();
  if (lowerDetail.includes("separation_requires_bling_stock_authority") || lowerDetail.includes("stock authority")) return { status: 409, error: "separation_stock_authority", message: "O estoque precisa estar sob autoridade do Bling para concluir a separação." };
  if (lowerDetail.includes("fiscal") || lowerDetail.includes("authorize document") || lowerDetail.includes("authorize_document")) return { status: 409, error: "delivery_fiscal_gate", message: "Entrega bloqueada: autorize o documento fiscal e o estoque físico antes de marcar como entregue." };
  if (lowerDetail.includes("payment") || lowerDetail.includes("settlement") || lowerDetail.includes("captured")) return { status: 409, error: "delivery_payment_gate", message: "Entrega bloqueada: o pagamento precisa estar confirmado no sistema." };
  if (lowerDetail.includes("separator")) return { status: 409, error: "separator_required", message: "Selecione o responsável pela separação para continuar." };
  if (lowerDetail.includes("expected_order_updated_at") || lowerDetail.includes("concurrent") || lowerDetail.includes("updated_at_mismatch")) return { status: 409, error: "separation_changed", message: "A separação mudou em outra tela. Atualize e tente novamente." };
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

async function productSetActive(input: any) {
  const id = uuid(input.id ?? input.product_id);
  if (!id || typeof input.is_active !== "boolean") {
    return { status: 400, error: "invalid_product_status", message: "Produto ou situação inválida." };
  }
  const result = await db.from("products")
    .update({ is_active: input.is_active })
    .eq("id", id)
    .select("id,name,is_active")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return { status: 404, error: "product_not_found", message: "Produto não encontrado." };
  return { product: result.data };
}

async function basketList(status = "active") {
  const templateQuery = db.from("basket_templates")
    .select("id,name,description,image_url,is_active,sort_order,base_price,category_id,subcategory_id")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (status === "active") templateQuery.eq("is_active", true);
  else if (status === "inactive") templateQuery.eq("is_active", false);
  const templates = await templateQuery;
  if (templates.error) throw templates.error;
  const editors = await mapLimit(templates.data || [], 5, async (basket: any) => {
    const result = await db.rpc("basket_mold_editor_v1", { p_basket_id: basket.id });
    return { basket, editor: result.error ? null : result.data };
  });
  const valid = editors.filter(Boolean) as Array<{ basket: any; editor: any }>;
  const ids = [...new Set(valid.flatMap(({ editor }) => (editor?.positions || []).flatMap((position: any) => (position.options || []).map((option: any) => option.product_id))))];
  let productById = new Map<string, any>();
  if (ids.length) {
    const result = await db.from("products").select(PRODUCT_COLUMNS).in("id", ids);
    if (result.error) throw result.error;
    productById = new Map((result.data || []).map((product: any) => [String(product.id), product]));
  }

  const baskets = valid.map(({ basket, editor: rawEditor }) => {
    const editor = rawEditor || {};
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

async function basketSetActive(input: any) {
  const basketId = uuid(input.basket_id);
  if (!basketId || typeof input.is_active !== "boolean") {
    return { status: 400, error: "invalid_basket_status", message: "Cesta ou situação inválida." };
  }
  const result = await db.from("basket_templates")
    .update({ is_active: input.is_active })
    .eq("id", basketId)
    .select("id,name,is_active")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return { status: 404, error: "basket_not_found", message: "Cesta não encontrada." };
  return { basket: result.data };
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


const ORDER_SOURCES = ["vitrine", "storefront_v2"];
const SEPARATOR_KEYS = new Set(["jose", "claudio", "jovenil", "kelly"]);

function supportedOrder(order: any) {
  return Boolean(order && ORDER_SOURCES.includes(String(order.source || "")));
}


async function attachPublicOrderCodes(orders: any[]) {
  if (!orders.length) return orders;
  const ids = orders.map((order) => uuid(order.id)).filter(Boolean);
  if (!ids.length) return orders;
  const result = await db.from("order_public_snapshots_v1")
    .select("order_id,public_code")
    .in("order_id", ids);
  if (result.error) throw result.error;
  const codes = new Map((result.data || []).map((row: any) => [String(row.order_id), row.public_code]));
  return orders.map((order) => ({ ...order, public_code: codes.get(String(order.id)) || null }));
}

async function ordersList(input: any) {
  const stage = ["new", "separating", "expedition"].includes(input.stage) ? input.stage : "new";
  const statuses = stage === "new"
    ? ["storefront_received", "received"]
    : stage === "separating"
      ? ["confirmed", "processing"]
      : ["ready", "out_for_delivery", "delivered"];
  const result = await db.from("orders")
    .select("id,order_number,status,total,created_at,updated_at,phone_e164,customer_snapshot,source,payment_method")
    .in("source", ORDER_SOURCES)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(200);
  if (result.error) throw result.error;
  return { orders: await attachPublicOrderCodes(result.data || []), stage };
}

async function orderById(value: unknown): Promise<any> {
  const id = uuid(value);
  if (!id) return { error: "invalid_order_id", status: 400, message: "Pedido inválido." };
  const result = await db.from("orders")
    .select("id,order_number,status,total,created_at,updated_at,phone_e164,customer_snapshot,source,payment_method")
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || !supportedOrder(result.data)) return { error: "order_not_found", status: 404, message: "Pedido não encontrado." };
  const orders = await attachPublicOrderCodes([result.data]);
  return { order: orders[0] };
}

async function orderDetail(input: any) {
  const found = await orderById(input.order_id || input.id);
  if (found.error) return found;
  const order = found.order;
  const result = await db.from("order_items")
    .select("id,order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  const allItems = result.data || [];
  const hasComponents = allItems.some((item: any) => item.metadata?.history_kind === "basket_mold_component");
  const items = allItems
    .filter((item: any) => !(hasComponents && item.metadata?.history_kind === "basket_mold"))
    .map((item: any) => ({
      id: item.id,
      name: item.name_snapshot || "Produto",
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      image_url: item.metadata?.image_url || "",
      sku: item.sku_snapshot || "",
    }));
  return { order, items };
}

async function confirmStorefrontOrder(input: any) {
  const id = uuid(input.order_id || input.id);
  if (!id) return { error: "invalid_order_id", status: 400, message: "Pedido inválido." };
  const result = await db.from("orders")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .in("source", ORDER_SOURCES)
    .in("status", ["storefront_received", "received"])
    .select("id,order_number,status,total,source")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return { error: "order_not_confirmable", status: 409, message: "O pedido já foi confirmado ou não está aguardando confirmação." };
  return { order: result.data };
}

async function orderSeparation(input: any) {
  const found = await orderById(input.order_id || input.id);
  if (found.error) return found;
  if (!["confirmed", "processing"].includes(String(found.order.status))) {
    return { error: "order_not_separable", status: 409, message: "Este pedido não está aguardando separação." };
  }
  const result = await db.rpc("ops2_get_order_separation_v2", { p_order_id: found.order.id });
  if (result.error) throw result.error;
  return { separation: result.data };
}

async function setOrderSeparator(input: any) {
  const id = uuid(input.order_id || input.id);
  const key = clean(input.separator_key, 40).toLowerCase();
  if (!id || !SEPARATOR_KEYS.has(key)) return { error: "invalid_separator", status: 400, message: "Selecione um separador válido." };
  const found = await orderById(id);
  if (found.error) return found;
  if (!["confirmed", "processing"].includes(String(found.order.status))) {
    return { error: "order_not_separable", status: 409, message: "Este pedido não está aguardando separação." };
  }
  const result = await db.rpc("ops2_set_order_separator_v2", { p_order_id: id, p_separator_key: key });
  if (result.error) throw result.error;
  return { assignment: result.data, separator_key: key };
}

async function setOrderSeparationItem(input: any) {
  const id = uuid(input.order_id);
  const itemId = uuid(input.order_item_id);
  const state = input.state === "missing" || input.state === "separated" ? input.state : "";
  const separatorKey = clean(input.separator_key, 40).toLowerCase();
  const expected = clean(input.expected_order_updated_at, 80);
  if (!id || !itemId || !state || !expected || !SEPARATOR_KEYS.has(separatorKey)) {
    return { error: "invalid_separation_update", status: 400, message: "Não foi possível conferir este produto. Atualize a separação." };
  }
  const result = await db.rpc("ops2_set_order_separation_item_v2", {
    p_order_id: id,
    p_order_item_id: itemId,
    p_state: state,
    p_expected_order_updated_at: expected,
    p_separator_key: separatorKey,
  });
  if (result.error) throw result.error;
  if (result.data?.ok === false || result.data?.error) return { error: String(result.data.error || "separation_update_failed"), status: 409, message: "A separação mudou em outra tela. Atualize e tente novamente." };
  return { update: result.data };
}

async function completeOrderSeparation(input: any) {
  const id = uuid(input.order_id);
  const expected = clean(input.expected_order_updated_at, 80);
  if (!id || !expected) return { error: "invalid_separation_completion", status: 400, message: "Atualize a separação antes de confirmar." };
  const prepared = await db.rpc("ops2_prepare_order_separation_completion_v2", {
    p_order_id: id,
    p_expected_order_updated_at: expected,
  });
  if (prepared.error) throw prepared.error;
  if (prepared.data?.ok === false || prepared.data?.error) return { error: String(prepared.data.error || "separation_incomplete"), status: 409, message: "Confira todos os produtos e selecione o separador antes de confirmar." };
  const applied = await db.rpc("ops2_apply_order_separation_stock_v2", { p_order_id: id });
  if (applied.error) throw applied.error;
  if (applied.data?.ok === false || applied.data?.error) {
    const code = String(applied.data.error || "separation_stock_update_failed");
    if (code.includes("bling")) return { error: code, status: 409, message: "O estoque precisa estar sob autoridade do Bling para concluir a separação." };
    return { error: code, status: 409, message: "Não foi possível concluir a separação e atualizar o estoque." };
  }
  return { prepared: prepared.data, applied: applied.data };
}

async function markOrderDelivered(input: any) {
  const id = uuid(input.order_id || input.id);
  if (!id) return { error: "invalid_order_id", status: 400, message: "Pedido inválido." };
  const found = await orderById(id);
  if (found.error) return found;
  if (!["ready", "out_for_delivery"].includes(String(found.order.status))) {
    if (found.order.status === "delivered") return { order: found.order, already_delivered: true };
    return { error: "order_not_ready_for_delivery", status: 409, message: "O pedido ainda não está na etapa de expedição." };
  }
  const result = await db.from("orders")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["ready", "out_for_delivery"])
    .select("id,order_number,status,total,delivered_at")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return { error: "order_delivery_changed", status: 409, message: "O status mudou em outra tela. Atualize os pedidos." };
  return { order: result.data };
}



async function whatsappMarketingConsentSummary() {
  const countQuery = () => db.from("marketing_customer_consent_current_v1")
    .select("customer_id", { count: "exact", head: true });
  const results = await Promise.all([
    countQuery().eq("consent_state", "opt_in"),
    countQuery().eq("consent_state", "opt_out"),
    countQuery().eq("consent_state", "never_consented"),
    countQuery().eq("consent_state", "opt_in").eq("latest_source", "merchant_owner_attestation"),
    countQuery().eq("consent_state", "opt_in").eq("latest_source", "historical_merchant_attestation"),
  ]);
  if (results.some((result) => result.error || typeof result.count !== "number")) {
    return { available: false };
  }
  const [optInCount, optOutCount, noConsentCount, ownerAttestationCount, historicalAttestationCount] =
    results.map((result) => Math.max(0, Number(result.count) || 0));
  return {
    available: true,
    total_count: optInCount + optOutCount + noConsentCount,
    opt_in_count: optInCount,
    opt_out_count: optOutCount,
    no_consent_count: noConsentCount,
    merchant_owner_attestation_count: ownerAttestationCount,
    historical_merchant_attestation_count: historicalAttestationCount,
    other_opt_in_source_count: Math.max(0, optInCount - ownerAttestationCount - historicalAttestationCount),
  };
}

async function whatsappOverview() {
  const [accountsResult, runtimeResult, templateCountResult, approvedCountResult, templateRowsResult, templateEventsResult, campaignsResult, anaResult, consentSummary] = await Promise.all([
    db.from("whatsapp_accounts").select("id,slug,display_name,phone_e164").order("display_name"),
    db.from("whatsapp_channel_runtime_v1").select("whatsapp_account_id,inbound_provider,outbound_provider,capture_enabled,send_enabled,ana_enabled,campaigns_enabled,human_send_enabled,homologated_at,updated_at"),
    db.from("whatsapp_templates_v1").select("id", { count: "exact", head: true }),
    db.from("whatsapp_templates_v1").select("id", { count: "exact", head: true }).eq("status", "approved"),
    db.from("whatsapp_templates_v1")
      .select("id,whatsapp_account_id,name,language,category,status,quality_rating,last_synced_at,updated_at")
      .order("updated_at", { ascending: false }).limit(100),
    db.from("whatsapp_template_events_v1")
      .select("whatsapp_account_id,template_name,language,status,reason,occurred_at")
      .ilike("status", "rejected")
      .not("reason", "is", null)
      .order("occurred_at", { ascending: false }).limit(200),
    db.from("marketing_campaigns_v1")
      .select("id,name,whatsapp_account_id,status,revision,scheduled_for,created_at,started_at,paused_at,completed_at,failed_at", { count: "exact" })
      .order("created_at", { ascending: false }).limit(100),
    db.from("whatsapp_ana_jobs_v1")
      .select("id,whatsapp_account_id,status,decision,created_at", { count: "exact" })
      .eq("dry_run", false).order("created_at", { ascending: false }).limit(50),
    whatsappMarketingConsentSummary(),
  ]);
  for (const result of [accountsResult, runtimeResult, templateCountResult, approvedCountResult, templateRowsResult, templateEventsResult, campaignsResult, anaResult]) {
    if (result.error) throw result.error;
  }

  const campaignIds = (campaignsResult.data || []).map((row: any) => row.id).filter(Boolean);
  const campaignStatusById = new Map<string, any>();
  let campaignDeliverySummaryAvailable = campaignIds.length === 0;
  if (campaignIds.length) {
    const campaignStatusResult = await db.rpc("site_admin_marketing_campaign_status_summary_v1", {
      p_campaign_ids: campaignIds,
    });
    if (!campaignStatusResult.error && Array.isArray(campaignStatusResult.data)) {
      for (const row of campaignStatusResult.data) {
        const campaignId = String(row.campaign_id || "");
        if (campaignId) campaignStatusById.set(campaignId, row);
      }
      campaignDeliverySummaryAvailable = campaignIds.every((campaignId: string) =>
        campaignStatusById.has(String(campaignId))
      );
      if (!campaignDeliverySummaryAvailable) campaignStatusById.clear();
    }
  }
  const latestCampaignSnapshot = new Map<string, any>();
  const snapshotPageSize = 200;
  const maxSnapshotRows = 2000;
  let snapshotOffset = 0;
  let snapshotLookupLimited = false;
  while (campaignIds.length && latestCampaignSnapshot.size < campaignIds.length) {
    const snapshotsResult = await db.from("marketing_campaign_snapshots_v1")
      .select("id,campaign_id,campaign_revision,snapshot_version,template_name,template_language,template_category,found_count,eligible_count,excluded_count,created_at")
      .in("campaign_id", campaignIds)
      .order("created_at", { ascending: false })
      .range(snapshotOffset, snapshotOffset + snapshotPageSize - 1);
    if (snapshotsResult.error) throw snapshotsResult.error;
    const rows = snapshotsResult.data || [];
    for (const snapshot of rows) {
      const campaignId = String(snapshot.campaign_id || "");
      if (campaignId && !latestCampaignSnapshot.has(campaignId)) latestCampaignSnapshot.set(campaignId, snapshot);
    }
    snapshotOffset += rows.length;
    if (rows.length < snapshotPageSize) break;
    if (snapshotOffset >= maxSnapshotRows) {
      snapshotLookupLimited = true;
      break;
    }
  }

  const accounts = accountsResult.data || [];
  const runtimeByAccount = new Map((runtimeResult.data || []).map((row: any) => [row.whatsapp_account_id, row]));
  const accountById = new Map(accounts.map((row: any) => [row.id, row]));
  const templateKey = (accountId: any, name: any, language: any) =>
    [String(accountId || ""), clean(name, 160).toLowerCase(), clean(language, 24).toLowerCase()].join("|");
  const latestRejectionByTemplate = new Map<string, string>();
  for (const event of templateEventsResult.data || []) {
    if (clean(event.status, 40).toLowerCase() !== "rejected") continue;
    const key = templateKey(event.whatsapp_account_id, event.template_name, event.language);
    if (!latestRejectionByTemplate.has(key)) latestRejectionByTemplate.set(key, clean(event.reason, 280));
  }
  const channels = accounts.map((account: any) => {
    const runtime: any = runtimeByAccount.get(account.id) || {};
    const digits = String(account.phone_e164 || "").replace(/\D/g, "");
    return {
      name: clean(account.display_name || account.slug || "Canal", 120),
      phone_last4: digits.slice(-4),
      inbound_provider: clean(runtime.inbound_provider, 40),
      outbound_provider: clean(runtime.outbound_provider, 40),
      capture_enabled: runtime.capture_enabled === true,
      send_enabled: runtime.send_enabled === true,
      ana_enabled: runtime.ana_enabled === true,
      campaigns_enabled: runtime.campaigns_enabled === true,
      human_send_enabled: runtime.human_send_enabled === true,
      homologated_at: runtime.homologated_at || null,
      updated_at: runtime.updated_at || null,
    };
  });
  const templates = (templateRowsResult.data || []).map((row: any) => ({
    name: clean(row.name || "Modelo sem nome", 160),
    channel: clean(accountById.get(row.whatsapp_account_id)?.display_name || "", 120),
    language: clean(row.language, 24),
    category: clean(row.category, 40),
    status: clean(row.status, 40),
    quality_rating: clean(row.quality_rating, 40),
    rejection_reason: clean(row.status, 40).toLowerCase() === "rejected"
      ? latestRejectionByTemplate.get(templateKey(row.whatsapp_account_id, row.name, row.language)) || "Motivo não disponível nos 200 eventos consultados"
      : "",
    last_synced_at: row.last_synced_at || null,
    updated_at: row.updated_at || null,
  }));
  const campaigns = (campaignsResult.data || []).map((row: any) => {
    const campaignId = String(row.id);
    const summary = campaignStatusById.get(campaignId) || {};
    let snapshot = latestCampaignSnapshot.get(campaignId) || null;
    if (campaignDeliverySummaryAvailable && summary.snapshot_available) {
      snapshot = {
        id: summary.snapshot_id || null,
        campaign_revision: summary.snapshot_campaign_revision,
        snapshot_version: summary.snapshot_version,
        template_name: summary.snapshot_template_name,
        template_language: summary.snapshot_template_language,
        template_category: summary.snapshot_template_category,
        found_count: summary.snapshot_found_count,
        eligible_count: summary.snapshot_eligible_count,
        excluded_count: summary.snapshot_excluded_count,
        created_at: summary.snapshot_created_at,
      };
    }
    const exclusionCountsAvailable = Boolean(
      snapshot && campaignDeliverySummaryAvailable && summary.snapshot_available
      && String(summary.snapshot_id || "") === String(snapshot.id || "")
    );
    return {
      id: uuid(row.id),
      name: clean(row.name || "Campanha", 140),
      channel: clean(accountById.get(row.whatsapp_account_id)?.display_name || "", 120),
      status: clean(row.status, 40),
      revision: Number(row.revision) || 0,
      scheduled_for: row.scheduled_for || null,
      created_at: row.created_at || null,
      started_at: row.started_at || null,
      paused_at: row.paused_at || null,
      completed_at: row.completed_at || null,
      failed_at: row.failed_at || null,
      delivery: campaignDeliverySummaryAvailable ? (() => {
        const result = summary;
        return {
          available: true,
          accepted_count: Number(result.accepted_count) || 0,
          sent_count: Number(result.sent_count) || 0,
          delivered_count: Number(result.delivered_count) || 0,
          read_count: Number(result.read_count) || 0,
          failed_count: Number(result.failed_count) || 0,
          skipped_count: Number(result.skipped_count) || 0,
          pending_count: Number(result.pending_count) || 0,
          uncertain_count: Number(result.uncertain_count) || 0,
        };
      })() : { available: false },
      snapshot_lookup_limited: !snapshot && snapshotLookupLimited,
      snapshot: snapshot ? {
        campaign_revision: Number(snapshot.campaign_revision) || 0,
        snapshot_version: Number(snapshot.snapshot_version) || 0,
        is_current_revision: Number(snapshot.campaign_revision) === Number(row.revision),
        template_name: clean(snapshot.template_name, 160),
        template_language: clean(snapshot.template_language, 24),
        template_category: clean(snapshot.template_category, 40),
        found_count: Number(snapshot.found_count) || 0,
        eligible_count: Number(snapshot.eligible_count) || 0,
        excluded_count: Number(snapshot.excluded_count) || 0,
        exclusion_counts: exclusionCountsAvailable ? {
          available: true,
          opted_out_count: Number(summary.excluded_opted_out_count) || 0,
          no_consent_count: Number(summary.excluded_no_consent_count) || 0,
          inactive_customer_count: Number(summary.excluded_inactive_customer_count) || 0,
          invalid_phone_count: Number(summary.excluded_invalid_phone_count) || 0,
          duplicate_phone_count: Number(summary.excluded_duplicate_phone_count) || 0,
        } : { available: false },
        created_at: snapshot.created_at || null,
      } : null,
    };
  });

  const ana = (anaResult.data || []).map((row: any) => ({
    channel: clean(accountById.get(row.whatsapp_account_id)?.display_name || "", 120),
    status: clean(row.status, 40),
    decision: clean(row.decision, 60),
    created_at: row.created_at || null,
  }));

  return {
    channels,
    templates: {
      total: templateCountResult.count || 0,
      approved: approvedCountResult.count || 0,
      items: templates,
      loaded: templates.length,
    },
    campaigns: { total: campaignsResult.count || 0, recent: campaigns, loaded: campaigns.length },
    ana: { total: anaResult.count || 0, recent: ana, loaded: ana.length },
    consent_summary: consentSummary,
    generated_at: new Date().toISOString(),
  };
}


function isIsoCursorTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

async function adminFavoriteUserId() {
  const result = await db.from("admin_users").select("user_id")
    .eq("role", "owner").eq("is_active", true).limit(2);
  if (result.error) throw result.error;
  const owners = result.data || [];
  return owners.length === 1 ? uuid(owners[0].user_id) : "";
}

async function conversationFavoriteIds(adminUserId: string) {
  const ids: string[] = [];
  const pageSize = 200;
  let offset = 0;
  while (true) {
    const result = await db.from("whatsapp_conversation_favorites_v1")
      .select("conversation_id")
      .eq("admin_user_id", adminUserId)
      .order("created_at", { ascending: false })
      .order("conversation_id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const rows = result.data || [];
    ids.push(...rows.map((row: any) => uuid(row.conversation_id)).filter(Boolean));
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
  return ids;
}

async function whatsappConversationFavorite(input: any) {
  const mode = clean(input.mode, 12).toLowerCase();
  if (!["add", "remove"].includes(mode)) return { error: "invalid_favorite_action", status: 400 };
  const conversationId = uuid(input.conversation_id);
  if (!conversationId) return { error: "invalid_conversation_id", status: 400 };
  const adminUserId = await adminFavoriteUserId();
  if (!adminUserId) {
    return { error: "favorite_identity_unavailable", status: 409, message: "Não foi possível identificar o usuário administrador para salvar este favorito." };
  }
  const conversation = await db.from("conversations").select("id").eq("id", conversationId).maybeSingle();
  if (conversation.error) throw conversation.error;
  if (!conversation.data) return { error: "conversation_not_found", status: 404 };

  if (mode === "add") {
    const result = await db.from("whatsapp_conversation_favorites_v1")
      .upsert({ admin_user_id: adminUserId, conversation_id: conversationId }, { onConflict: "admin_user_id,conversation_id" });
    if (result.error) throw result.error;
    return { conversation_id: conversationId, is_favorite: true };
  }
  const result = await db.from("whatsapp_conversation_favorites_v1")
    .delete().eq("admin_user_id", adminUserId).eq("conversation_id", conversationId);
  if (result.error) throw result.error;
  return { conversation_id: conversationId, is_favorite: false };
}

async function whatsappConversationList(input: any) {
  const pageSize = 30;
  const cursorSupplied = Object.prototype.hasOwnProperty.call(input, "cursor") && input.cursor !== null;
  if (cursorSupplied && (typeof input.cursor !== "object" || Array.isArray(input.cursor))) {
    return { error: "invalid_conversation_cursor", status: 400 };
  }
  const cursor = cursorSupplied ? input.cursor : null;
  const cursorDateRaw = cursor ? clean(cursor.updated_at, 64) : "";
  const cursorIdRaw = cursor ? clean(cursor.id, 64) : "";
  const cursorId = cursorIdRaw ? uuid(cursorIdRaw) : "";
  if (cursor && (!isIsoCursorTimestamp(cursorDateRaw) || !cursorId)) {
    return { error: "invalid_conversation_cursor", status: 400 };
  }
  const requestedAccount = clean(input.account_id, 64);
  const accountId = requestedAccount ? uuid(requestedAccount) : "";
  if (requestedAccount && !accountId) return { error: "invalid_account_id", status: 400 };
  const search = clean(input.search, 80).replace(/\D/g, "");
  const filter = clean(input.filter, 20).toLowerCase();
  const onlyHuman = filter === "human";
  const onlyFavorites = filter === "favorites";
  let favoriteIds: string[] = [];
  let favoritesAvailable = false;
  try {
    const adminUserId = await adminFavoriteUserId();
    if (adminUserId) {
      favoriteIds = await conversationFavoriteIds(adminUserId);
      favoritesAvailable = true;
    }
  } catch {
    favoritesAvailable = false;
  }
  if (onlyFavorites && !favoritesAvailable) {
    return { error: "favorites_unavailable", status: 503, message: "Favoritos indisponíveis. Atualize o Admin depois de aplicar a migração necessária." };
  }

  let conversationQuery = db.from("conversations")
    .select("id,whatsapp_account_id,wa_contact_e164,status,stage,human_required,mode,last_inbound_at,last_outbound_at,updated_at,created_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);
  if (cursorDateRaw && cursorId) {
    conversationQuery = conversationQuery.or(
      "updated_at.lt." + cursorDateRaw + ",and(updated_at.eq." + cursorDateRaw + ",id.lt." + cursorId + ")",
    );
  }
  if (accountId) conversationQuery = conversationQuery.eq("whatsapp_account_id", accountId);
  if (search.length >= 4) conversationQuery = conversationQuery.ilike("wa_contact_e164", "%" + search + "%");
  if (onlyHuman) conversationQuery = conversationQuery.eq("human_required", true);
  if (onlyFavorites) {
    conversationQuery = favoriteIds.length
      ? conversationQuery.in("id", favoriteIds)
      : conversationQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const [conversationResult, accountResult] = await Promise.all([
    conversationQuery,
    db.from("whatsapp_accounts").select("id,slug,display_name,phone_e164,is_active").order("display_name"),
  ]);
  if (conversationResult.error) throw conversationResult.error;
  if (accountResult.error) throw accountResult.error;

  const rows = conversationResult.data || [];
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const accounts = accountResult.data || [];
  const accountById = new Map(accounts.map((row: any) => [row.id, row]));
  const favoriteIdSet = new Set(favoriteIds);
  const items = pageRows.map((row: any) => {
    const account: any = accountById.get(row.whatsapp_account_id) || {};
    const phoneDigits = String(row.wa_contact_e164 || "").replace(/\D/g, "");
    const accountDigits = String(account.phone_e164 || "").replace(/\D/g, "");
    const lastActivity = [row.last_inbound_at, row.last_outbound_at, row.updated_at, row.created_at]
      .filter(Boolean).sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
    return {
      id: row.id,
      channel: clean(account.display_name || account.slug || "WhatsApp", 120),
      channel_number: accountDigits.slice(-4),
      phone_last4: phoneDigits.slice(-4),
      status: clean(row.status, 40),
      stage: clean(row.stage, 40),
      mode: clean(row.mode, 40),
      human_required: row.human_required === true,
      is_favorite: favoriteIdSet.has(row.id),
      last_activity_at: lastActivity,
      updated_at: row.updated_at,
    };
  });
  const lastRow: any = pageRows[pageRows.length - 1];
  return {
    items,
    accounts: accounts.map((row: any) => ({
      id: row.id,
      name: clean(row.display_name || row.slug || "WhatsApp", 120),
      number_last4: String(row.phone_e164 || "").replace(/\D/g, "").slice(-4),
      active: row.is_active === true,
    })),
    total: conversationResult.count || 0,
    has_more: hasMore,
    next_cursor: hasMore && lastRow ? { updated_at: lastRow.updated_at, id: lastRow.id } : null,
    favorites_available: favoritesAvailable,
  };
}

function normalizeWhatsappLocation(value: any) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const candidates = [metadata.location, metadata.coordinates, metadata];
  const location = candidates.find((item: any) => item && typeof item === "object" && !Array.isArray(item)) || {};
  const rawLatitude = location.latitude ?? location.lat;
  const rawLongitude = location.longitude ?? location.lng ?? location.lon;
  if (rawLatitude === undefined || rawLatitude === null || String(rawLatitude).trim() === ""
    || rawLongitude === undefined || rawLongitude === null || String(rawLongitude).trim() === "") return null;
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    latitude,
    longitude,
    name: clean(location.name || location.label || "", 120),
    address: clean(location.address || "", 240),
  };
}

async function whatsappConversationMessages(input: any) {
  const conversationId = uuid(input.conversation_id);
  if (!conversationId) return { error: "invalid_conversation_id", status: 400 };
  if (clean(input.before, 64)) {
    return { error: "legacy_before_cursor_unsupported", message: "Atualize a página para continuar carregando o histórico.", status: 409 };
  }
  const beforeRaw = clean(input.before_created_at, 64);
  const beforeIdRaw = clean(input.before_id, 64);
  const beforeId = beforeIdRaw ? uuid(beforeIdRaw) : "";
  if (Boolean(beforeRaw) !== Boolean(beforeIdRaw)) return { error: "invalid_before_cursor", status: 400 };
  if (beforeIdRaw && (!isIsoCursorTimestamp(beforeRaw) || !beforeId)) {
    return { error: "invalid_before_cursor", status: 400 };
  }

  const conversationResult = await db.from("conversations")
    .select("id,whatsapp_account_id,wa_contact_e164,status,stage,mode,human_required")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversationResult.error) throw conversationResult.error;
  if (!conversationResult.data) return { error: "conversation_not_found", status: 404 };
  const conversation = conversationResult.data;

  const [accountResult, messageResult] = await Promise.all([
    db.from("whatsapp_accounts").select("id,slug,display_name,phone_e164").eq("id", conversation.whatsapp_account_id).maybeSingle(),
    (() => {
      let query = db.from("whatsapp_messages_v1")
        .select("id,direction,message_type,text_body,status_current,metadata,received_at,sent_at,created_at")
        .eq("conversation_id", conversationId)
        .eq("whatsapp_account_id", conversation.whatsapp_account_id);
      if (beforeRaw && beforeId) {
        query = query.or(
          "created_at.lt." + beforeRaw + ",and(created_at.eq." + beforeRaw + ",id.lt." + beforeId + ")",
        );
      }
      return query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(31);
    })(),
  ]);
  if (accountResult.error) throw accountResult.error;
  if (messageResult.error) throw messageResult.error;

  const rows = messageResult.data || [];
  const hasMore = rows.length > 30;
  const pageRows = rows.slice(0, 30);
  const oldestRow: any = pageRows[pageRows.length - 1];
  const account: any = accountResult.data || {};
  const phoneDigits = String(conversation.wa_contact_e164 || "").replace(/\D/g, "");
  const accountDigits = String(account.phone_e164 || "").replace(/\D/g, "");
  return {
    conversation: {
      id: conversation.id,
      channel: clean(account.display_name || account.slug || "WhatsApp", 120),
      channel_number: accountDigits.slice(-4),
      phone_last4: phoneDigits.slice(-4),
      status: clean(conversation.status, 40),
      stage: clean(conversation.stage, 40),
      mode: clean(conversation.mode, 40),
      human_required: conversation.human_required === true,
    },
    messages: pageRows.reverse().map((row: any) => ({
      id: row.id,
      direction: clean(row.direction, 20),
      message_type: clean(row.message_type, 30),
      text_body: String(row.text_body || "").replace(/\u0000/g, "").slice(0, 4000),
      media_filename: (() => {
        const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
        const media = metadata.media && typeof metadata.media === "object" && !Array.isArray(metadata.media) ? metadata.media : metadata;
        return ["image", "audio", "video", "document"].includes(clean(row.message_type, 30))
          ? safeWhatsappFilename(media.filename || media.file_name || metadata.media_filename || "")
          : "";
      })(),
      status_current: clean(row.status_current, 40),
      location: row.message_type === "location" ? normalizeWhatsappLocation(row.metadata) : null,
      message_at: row.received_at || row.sent_at || row.created_at,
    })),
    next_before: hasMore && oldestRow ? { created_at: oldestRow.created_at, id: oldestRow.id } : null,
  };
}

async function whatsappConversationMedia(input: any) {
  const conversationId = uuid(input.conversation_id);
  const messageId = uuid(input.message_id);
  if (!conversationId || !messageId) return { error: "invalid_media_reference", status: 400 };

  const messageResult = await db.from("whatsapp_messages_v1")
    .select("id,message_type")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (messageResult.error) throw messageResult.error;
  if (!messageResult.data) return { error: "message_not_found", status: 404 };
  const messageType = clean(messageResult.data.message_type, 30);
  if (!["image", "audio", "video", "document"].includes(messageType)) {
    return { error: "message_media_unsupported", status: 415 };
  }

  const allowedMimeTypes = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "audio/wav", "audio/x-wav",
    "video/mp4", "video/3gpp", "text/plain",
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip", "application/octet-stream",
  ]);
  let bucket = "";
  let path = "";
  let mimeType = "";
  let filename = "";
  let fileSize = 0;

  const canonicalResult = await db.from("whatsapp_media_v1")
    .select("media_type,storage_bucket,storage_path,mime_type,file_size,metadata")
    .eq("message_id", messageId)
    .eq("media_type", messageType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (canonicalResult.error) throw canonicalResult.error;
  const canonical: any = canonicalResult.data || {};
  const canonicalPath = safeWhatsappStoragePath(canonical.storage_path);
  if (canonical.media_type === messageType && canonical.storage_bucket === "attendance-media-v1" && canonicalPath) {
    bucket = canonical.storage_bucket;
    path = canonicalPath;
    mimeType = String(canonical.mime_type || "").split(";", 1)[0].trim().toLowerCase();
    fileSize = Number(canonical.file_size) || 0;
    const metadata = canonical.metadata && typeof canonical.metadata === "object" ? canonical.metadata : {};
    filename = safeWhatsappFilename(metadata.filename || metadata.file_name || "");
  }

  if (!path) {
    const now = new Date().toISOString();
    const cacheResult = await db.from("attendance_media_cache_v1")
      .select("object_path,mime_type,filename,expires_at")
      .eq("message_id", messageId)
      .gt("expires_at", now)
      .maybeSingle();
    if (cacheResult.error) throw cacheResult.error;
    const cached: any = cacheResult.data || {};
    const cachedPath = safeWhatsappStoragePath(cached.object_path);
    if (cachedPath) {
      bucket = "attendance-media-v1";
      path = cachedPath;
      mimeType = String(cached.mime_type || "").split(";", 1)[0].trim().toLowerCase();
      filename = safeWhatsappFilename(cached.filename || "");
    }
  }

  if (!path) return { error: "media_not_cached", message: "Esta mídia ainda não está disponível no cache privado.", status: 404 };
  // O bucket privado limita objetos do cache a 20 MB; attendance_media_cache_v1 não armazena file_size.
  if (fileSize > 20 * 1024 * 1024) return { error: "media_too_large", status: 413 };
  if (!allowedMimeTypes.has(mimeType)) return { error: "media_type_not_allowed", status: 415 };

  const signed = await db.storage.from(bucket).createSignedUrl(path, 600, { download: messageType === "document" });
  if (signed.error || !signed.data?.signedUrl) return { error: "media_sign_failed", status: 503 };
  return {
    url: signed.data.signedUrl,
    mime_type: mimeType,
    filename: filename || "arquivo",
    expires_at: new Date(Date.now() + 600000).toISOString(),
  };
}

function safeWhatsappStoragePath(value: any) {
  const path = String(value || "").trim();
  if (!path || path.length > 800 || path.startsWith("/") || path.includes("\\")
    || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) return "";
  return path;
}

function safeWhatsappFilename(value: any) {
  const leaf = String(value || "").replace(/\\/g, "/").split("/").pop() || "arquivo";
  const safe = leaf.replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._()\- ]/g, "_").slice(0, 180).trim();
  return safe || "arquivo";
}

function stableAdminJson(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(stableAdminJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + stableAdminJson(value[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value) ?? "undefined";
}


async function whatsappCampaignPreview(input: any) {
  const campaignId = uuid(input.campaign_id);
  if (!campaignId) return { error: "invalid_campaign_id", status: 400 };
  const campaignResult = await db.from("marketing_campaigns_v1")
    .select("id,name,status,revision,filters,whatsapp_account_id,template_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignResult.error) throw campaignResult.error;
  if (!campaignResult.data) return { error: "campaign_not_found", status: 404 };
  const campaign: any = campaignResult.data;
  if (!campaign.filters || typeof campaign.filters !== "object" || Array.isArray(campaign.filters)) {
    return { error: "campaign_filters_unavailable", status: 409 };
  }

  const [previewResult, templateResult] = await Promise.all([
    db.rpc("marketing_preview_audience_v1", {
      p_filters: campaign.filters,
      p_limit: 1,
      p_offset: 0,
    }),
    db.rpc("marketing_campaign_template_snapshot_v1", {
      p_whatsapp_account_id: campaign.whatsapp_account_id,
      p_template_id: campaign.template_id,
    }),
  ]);
  if (previewResult.error) throw previewResult.error;
  const preview = previewResult.data || {};
  if (preview.ok !== true) {
    return { error: clean(preview.error || "audience_preview_unavailable", 100), status: 409 };
  }

  const exclusions = preview.exclusion_reasons && typeof preview.exclusion_reasons === "object"
    && !Array.isArray(preview.exclusion_reasons) ? preview.exclusion_reasons : {};
  const count = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  };
  const template: any = !templateResult.error && templateResult.data && typeof templateResult.data === "object"
    ? templateResult.data
    : {};
  return {
    campaign: {
      id: campaignId,
      name: clean(campaign.name, 140),
      status: clean(campaign.status, 40),
      revision: Number(campaign.revision) || 0,
    },
    preview: {
      found_count: count(preview.found_count),
      eligible_count: count(preview.eligible_count),
      excluded_count: count(preview.excluded_count),
      exclusion_counts: {
        available: true,
        opted_out_count: count(exclusions.opted_out),
        no_consent_count: count(exclusions.no_consent),
        inactive_customer_count: count(exclusions.inactive_customer),
        invalid_phone_count: count(exclusions.invalid_phone),
        duplicate_phone_count: count(exclusions.duplicate_phone),
      },
    },
    template: {
      available: !templateResult.error,
      sendable: template.ok === true,
      error: template.ok === true ? "" : clean(template.error || "template_status_unavailable", 80),
      name: template.ok === true ? clean(template.name, 160) : "",
      language: template.ok === true ? clean(template.language, 24) : "",
      category: template.ok === true ? clean(template.category, 40) : "",
    },
  };
}


async function whatsappAnaPauseChannel(input: any) {
  const accountId = uuid(input.whatsapp_account_id);
  if (!accountId) return { error: "invalid_whatsapp_account_id", status: 400 };
  const current = await db.from("whatsapp_channel_runtime_v1")
    .select("ana_enabled")
    .eq("whatsapp_account_id", accountId)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) return { error: "channel_not_found", status: 404 };
  if (current.data.ana_enabled !== true) return { already_paused: true, ana_enabled: false };

  const actorId = await adminFavoriteUserId();
  if (!actorId) return { error: "admin_identity_unavailable", status: 403 };
  const result = await db.rpc("ops2_ana_admin_set_channel_v1", {
    p_whatsapp_account_id: accountId,
    p_enabled: false,
    p_actor_id: actorId,
  });
  if (result.error) throw result.error;
  const saved = result.data || { ok: false, error: "ana_pause_failed" };
  if (saved.ok !== true) return { error: clean(saved.error || "ana_pause_failed", 80), status: 409 };
  return {
    ana_enabled: false,
    channel_key: clean(saved.channel_key, 8),
  };
}

async function whatsappAnaAdminStatus() {
  const [result, runtimeResult] = await Promise.all([
    db.rpc("ops2_ana_admin_load_v1"),
    db.from("whatsapp_channel_runtime_v1")
      .select("whatsapp_account_id,ana_enabled,capture_enabled,send_enabled,outbound_provider,homologated_at")
      .order("updated_at", { ascending: false }),
  ]);
  if (result.error) throw result.error;
  if (runtimeResult.error) throw runtimeResult.error;
  const runtimeRows = runtimeResult.data || [];
  const accountIds = runtimeRows.map((row: any) => uuid(row.whatsapp_account_id)).filter(Boolean);
  const accountsResult = accountIds.length
    ? await db.from("whatsapp_accounts").select("id,phone_e164,display_name,slug").in("id", accountIds).limit(30)
    : { data: [], error: null };
  if (accountsResult.error) throw accountsResult.error;
  const accountById = new Map((accountsResult.data || []).map((row: any) => [row.id, row]));
  const channels = runtimeRows.map((row: any) => {
    const account: any = accountById.get(row.whatsapp_account_id) || {};
    return {
      id: uuid(row.whatsapp_account_id),
      name: clean(account.display_name || account.slug || "WhatsApp", 120),
      phone_last4: String(account.phone_e164 || "").replace(/\D/g, "").slice(-4),
      ana_enabled: row.ana_enabled === true,
      can_pause: row.ana_enabled === true,
      can_enable: row.capture_enabled === true && row.send_enabled === true
        && row.outbound_provider === "meta" && Boolean(row.homologated_at),
    };
  });
  const snapshot = result.data || {};
  if (snapshot.ok !== true) return { error: "ana_admin_status_unavailable", status: 503 };

  const active = snapshot.active || {};
  const draft = snapshot.draft || {};
  const versions = Array.isArray(snapshot.versions) ? snapshot.versions : [];
  const tests = Array.isArray(snapshot.test_runs) ? snapshot.test_runs : [];
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const activeVersion = versions.find((item: any) => active.id && item.id === active.id) || {};
  const draftEvent = events.find((item: any) =>
    ["admin_save_draft", "draft_saved"].includes(clean(item.action, 60).toLowerCase())
    && Number(item.draft_revision) === Number(draft.revision)
  );
  const actorIds = Array.from(new Set([
    ...versions.map((item: any) => uuid(item.actor_id)),
    ...events.map((item: any) => uuid(item.actor_id)),
    uuid(draft.updated_by),
  ].filter(Boolean)));
  const actorNames = new Map<string, string>();
  if (actorIds.length) {
    const namesResult = await db.from("admin_users").select("user_id,display_name")
      .in("user_id", actorIds).limit(30);
    if (!namesResult.error) {
      for (const item of namesResult.data || []) {
        const userId = uuid(item.user_id);
        const displayName = clean(item.display_name, 80);
        if (userId && displayName) actorNames.set(userId, displayName);
      }
    }
  }
  const actorName = (value: any) => {
    const actorId = uuid(value);
    return actorId ? actorNames.get(actorId) || "Admin sem nome cadastrado" : "Autor não identificado";
  };
  const configSections = [
    { key: "behavior", label: "Comportamento" },
    { key: "knowledge", label: "Conhecimento" },
    { key: "triggers", label: "Gatilhos" },
    { key: "test_cases", label: "Casos de teste" },
  ];
  const diffAvailable = Boolean(active.configuration && draft.configuration);
  return {
    channels,
    active: active.version ? {
      version: Number(active.version),
      created_at: active.created_at || null,
      published_by: actorName(activeVersion.actor_id),
      change_note: clean(activeVersion.change_note, 240),
    } : null,
    draft: Number.isSafeInteger(Number(draft.revision)) ? {
      revision: Number(draft.revision),
      updated_at: draft.updated_at || null,
      updated_by: actorName(draftEvent?.actor_id || draft.updated_by),
    } : null,
    diff_available: diffAvailable,
    configuration_diff: diffAvailable ? configSections.map((section) => ({
      key: section.key,
      label: section.label,
      changed: stableAdminJson(active.configuration?.[section.key]) !== stableAdminJson(draft.configuration?.[section.key]),
    })) : [],
    versions: versions.slice(0, 10).map((item: any) => ({
      version: Number(item.version) || 0,
      is_active: Boolean(active.id && item.id === active.id),
      published_by: actorName(item.actor_id),
      change_note: clean(item.change_note, 240),
      created_at: item.created_at || null,
    })),
    test_runs: tests.slice(0, 5).map((item: any) => ({
      passed_count: Number(item.passed_count) || 0,
      failed_count: Number(item.failed_count) || 0,
      created_at: item.created_at || null,
    })),
    events: events.slice(0, 10).map((item: any) => ({
      action: clean(item.action, 60),
      actor: actorName(item.actor_id),
      version_id: item.version_id || null,
      draft_revision: Number(item.draft_revision) || null,
      channel_key: clean(item.channel_key, 40),
      created_at: item.created_at || null,
    })),
  };
}

function attendanceSendHttpStatus(error: string) {
  if (error === "rate_limited") return 429;
  if (["service_window_closed", "human_send_not_homologated", "meta_transport_not_configured", "meta_send_uncertain", "meta_canary_destination_blocked", "duplicate_not_dispatchable"].includes(error)) return 409;
  if (error.startsWith("meta_")) return 502;
  if (error === "server_config") return 503;
  return 400;
}

async function markAttendanceClaimFailed(claim: any, errorCode: string) {
  const now = new Date().toISOString();
  const updated = await db.from("whatsapp_outbox_v1")
    .update({ status: "failed", last_error: clean(errorCode, 180) || "transport_error", updated_at: now })
    .eq("id", claim?.outbox_id).eq("status", "claimed");
  if (updated.error) throw updated.error;
}

async function markAttendanceMetaUncertain(claim: any, errorCode: string) {
  const now = new Date().toISOString();
  const code = "meta_send_uncertain:" + (clean(errorCode, 120) || "unknown");
  const updated = await db.from("whatsapp_outbox_v1")
    .update({ last_error: code, updated_at: now })
    .eq("id", claim?.outbox_id).eq("status", "claimed");
  if (updated.error) throw updated.error;
  return { ok: false, error: "meta_send_uncertain", uncertain: true, retryable: false, outbox_id: claim?.outbox_id };
}

async function attendanceProviderUrl(channel: string | null) {
  if (!channel) return null;
  const result = await db.rpc("ops2_papoai_attendance_provider_url_v1", { p_channel: channel });
  if (result.error) throw result.error;
  return clean(result.data, 2048) || null;
}

function attendanceChannelFromPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.endsWith("0975")) return "0975";
  if (digits.endsWith("1018")) return "1018";
  return null;
}

async function dispatchAttendancePapoAi(claim: any) {
  const channel = attendanceChannelFromPhone(claim.account_phone_e164);
  const webhookUrl = await attendanceProviderUrl(channel);
  if (!channel || !webhookUrl) {
    await markAttendanceClaimFailed(claim, "transport_config_missing");
    return { ok: false, error: "transport_config_missing", provider: "papoai" };
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone_e164: claim.to_phone_e164,
        message_text: claim.text,
        event_id: claim.idempotency_key,
        conversation_id: claim.conversation_id,
        source: "vitrine_admin_attendance",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("papoai_http_" + response.status);
    const acceptedAt = new Date().toISOString();
    const updated = await db.from("whatsapp_outbox_v1")
      .update({ status: "sent", sent_at: acceptedAt, last_error: null, updated_at: acceptedAt })
      .eq("id", claim.outbox_id).eq("status", "claimed");
    if (updated.error) throw updated.error;
    return { ok: true, status: "accepted", outbox_status: "sent", channel, provider: "papoai" };
  } catch (error) {
    await markAttendanceClaimFailed(claim, clean(error instanceof Error ? error.message : error, 180) || "papoai_transport_failed");
    return { ok: false, error: "papoai_transport_failed", provider: "papoai" };
  }
}

async function dispatchAttendanceMeta(claim: any) {
  if (!attendanceMetaConfigReady() || !/^\d{5,30}$/.test(String(claim?.phone_number_id || ""))) {
    await markAttendanceClaimFailed(claim, "meta_transport_not_configured");
    return { ok: false, error: "meta_transport_not_configured", provider: "meta" };
  }
  try {
    const result = await sendTextViaMeta({
      accessToken: META_WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: claim.phone_number_id,
      toE164: claim.to_phone_e164,
      text: claim.text,
      graphVersion: META_WHATSAPP_GRAPH_VERSION,
      timeoutMs: 15000,
    });
    const acceptedAt = new Date().toISOString();
    const accepted = await db.rpc("ops2_admin_attendance_accept_meta_outbound_v1", {
      p_outbox_id: claim.outbox_id,
      p_provider_message_id: result.providerMessageId,
      p_accepted_at: acceptedAt,
    });
    if (accepted.error || accepted.data?.ok !== true) {
      return await markAttendanceMetaUncertain(claim, accepted.error?.message || accepted.data?.error || "canonical_persist_failed");
    }
    return {
      ok: true,
      status: "accepted",
      outbox_status: "sent",
      provider: "meta",
      provider_message_id: result.providerMessageId,
      message_id: accepted.data?.message_id || null,
      status_current: accepted.data?.status_current || "accepted",
    };
  } catch (error) {
    if (error instanceof MetaTransportError) {
      if (error.uncertain) return await markAttendanceMetaUncertain(claim, error.code);
      await markAttendanceClaimFailed(claim, error.code);
      return { ok: false, error: error.code, provider: "meta", retryable: error.retryable === true, uncertain: false, http_status: error.httpStatus };
    }
    return await markAttendanceMetaUncertain(claim, "unexpected_transport_error");
  }
}

async function dispatchAttendanceOutbox(outboxId: unknown) {
  const id = uuid(outboxId);
  if (!id) return { ok: false, error: "invalid_outbox_id" };
  const claimedResult = await db.rpc("ops2_admin_attendance_claim_outbox_v3", { p_outbox_id: id });
  if (claimedResult.error) throw claimedResult.error;
  const claim = claimedResult.data || { ok: false, error: "outbox_claim_failed" };
  if (claim.already_sent === true) return { ok: true, status: "accepted", outbox_status: "sent", duplicate: true, provider: claim.provider || null };
  if (claim.ok !== true) return claim;
  if (claim.provider === "meta") return await dispatchAttendanceMeta(claim);
  if (claim.provider === "papoai") return await dispatchAttendancePapoAi(claim);
  await markAttendanceClaimFailed(claim, "outbound_provider_unavailable");
  return { ok: false, error: "outbound_provider_unavailable", provider: claim.provider || null };
}

async function whatsappConversationSendText(input: any) {
  const conversationId = uuid(input.conversation_id);
  if (!conversationId) return { error: "invalid_conversation_id", status: 400 };
  if (input.to_phone_e164 !== undefined || input.whatsapp_account_id !== undefined || input.account_id !== undefined || input.customer_id !== undefined) {
    return { error: "destination_fields_not_allowed", status: 400 };
  }
  const text = String(input.text ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!text) return { error: "message_empty", status: 400 };
  if (text.length > 4000) return { error: "message_too_long", status: 400 };
  const idempotencyKey = clean(input.idempotency_key, 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) return { error: "invalid_idempotency_key", status: 400 };

  const queuedResult = await db.rpc("ops2_admin_attendance_enqueue_text_v3", {
    p_conversation_id: conversationId,
    p_text: text,
    p_idempotency_key: idempotencyKey,
  });
  if (queuedResult.error) throw queuedResult.error;
  const queued = queuedResult.data || { ok: false, error: "enqueue_failed" };
  if (queued.ok !== true) {
    const error = String(queued.error || "enqueue_failed");
    return { ...queued, status: attendanceSendHttpStatus(error) };
  }
  if (queued.duplicate === true && queued.status === "sent") {
    return { ok: true, status: "accepted", duplicate: true, outbox_id: queued.outbox_id, provider: queued.provider || null };
  }
  if (queued.duplicate === true && queued.status !== "queued") {
    return { error: "duplicate_not_dispatchable", status: 409, outbox_id: queued.outbox_id, outbox_status: queued.status, provider: queued.provider || null };
  }

  const sent = await dispatchAttendanceOutbox(queued.outbox_id);
  if (sent?.ok !== true) {
    const error = String(sent?.error || "send_failed");
    return { ...sent, status: attendanceSendHttpStatus(error) };
  }
  return sent;
}


function outboundMediaMime(file: any, filename: string) {
  const extension = filename.toLowerCase().match(/(\.[a-z0-9]{1,8})$/)?.[1] || "";
  const byExtension: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".aac": "audio/aac", ".amr": "audio/amr", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg",
    ".mp4": "video/mp4", ".3gp": "video/3gpp",
    ".pdf": "application/pdf", ".txt": "text/plain", ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return canonicalOutboundMetaMime(file?.type, filename)
    || canonicalOutboundMetaMime(byExtension[extension] || "", filename);
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cacheAttendanceOutboundMedia(messageId: string, filename: string, mimeType: string, bytes: Uint8Array) {
  if (bytes.byteLength > 20 * 1024 * 1024) return false;
  const safeFilename = safeWhatsappFilename(filename);
  const objectPath = "outbound/" + messageId + "/" + safeFilename;
  const storage = db.storage.from("attendance-media-v1");
  const upload = await storage.upload(objectPath, new Blob([bytes], { type: mimeType }), {
    contentType: mimeType,
    upsert: true,
  });
  if (upload.error) throw upload.error;

  const cached = await db.from("attendance_media_cache_v1").insert({
    message_id: messageId,
    object_path: objectPath,
    mime_type: mimeType,
    filename: safeFilename,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (cached.error) {
    await storage.remove([objectPath]);
    throw cached.error;
  }
  return true;
}

async function whatsappConversationSendMedia(input: any) {
  const conversationId = uuid(input.conversation_id);
  if (!conversationId) return { error: "invalid_conversation_id", status: 400 };
  if (input.to_phone_e164 !== undefined || input.whatsapp_account_id !== undefined || input.account_id !== undefined || input.customer_id !== undefined) {
    return { error: "destination_fields_not_allowed", status: 400 };
  }

  const file: any = input.file;
  if (!file || typeof file.arrayBuffer !== "function" || typeof file.name !== "string") {
    return { error: "media_file_required", status: 400 };
  }
  let filename = clean(file.name, 240)
    .replace(/[\\/]+/g, "_")
    .replace(/[^\p{L}\p{N}._() -]+/gu, "_")
    .trim()
    .slice(0, 240);
  if (!filename || filename === "." || filename === "..") return { error: "meta_media_filename_invalid", status: 400 };

  const mimeType = outboundMediaMime(file, filename);
  const maxBytes = mimeType ? outboundMetaMaxBytes(mimeType) : 0;
  if (!mimeType || maxBytes <= 0) return { error: "meta_media_type_not_allowed", status: 415 };
  if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) return { error: "media_file_empty", status: 400 };
  if (Number(file.size) > maxBytes) return { error: "media_file_too_large", status: 413 };

  const caption = String(input.caption ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (caption.length > 1024) return { error: "media_caption_too_long", status: 400 };
  const mediaType = mimeType.startsWith("image/") ? "image"
    : mimeType.startsWith("audio/") ? "audio"
    : mimeType.startsWith("video/") ? "video"
    : "document";
  const safeCaption = mediaType === "audio" ? "" : caption;
  const idempotencyKey = clean(input.idempotency_key, 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) return { error: "invalid_idempotency_key", status: 400 };

  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch { return { error: "media_file_read_failed", status: 400 }; }
  if (bytes.byteLength !== Number(file.size)) return { error: "media_file_read_failed", status: 400 };
  if (bytes.byteLength > maxBytes) return { error: "media_file_too_large", status: 413 };
  try {
    validateOutboundMetaMediaContent(mimeType, bytes);
  } catch (error) {
    const code = error instanceof MetaMediaError ? error.code : "meta_media_content_invalid";
    return { error: code, status: code === "meta_media_type_not_allowed" ? 415 : 400 };
  }
  const sha256 = await sha256Hex(bytes);

  const queuedResult = await db.rpc("ops2_admin_attendance_enqueue_media_v1", {
    p_conversation_id: conversationId,
    p_media_type: mediaType,
    p_mime_type: mimeType,
    p_filename: filename,
    p_size_bytes: bytes.byteLength,
    p_sha256: sha256,
    p_caption: safeCaption || null,
    p_idempotency_key: idempotencyKey,
  });
  if (queuedResult.error) throw queuedResult.error;
  const queued = queuedResult.data || { ok: false, error: "enqueue_failed" };
  if (queued.ok !== true) {
    const error = String(queued.error || "enqueue_failed");
    return { ...queued, status: attendanceSendHttpStatus(error) };
  }
  if (queued.duplicate === true && queued.status === "sent") {
    return { ok: true, status: "accepted", duplicate: true, outbox_id: queued.outbox_id, provider: queued.provider || "meta" };
  }
  if (queued.duplicate === true && queued.status !== "queued") {
    return { error: "duplicate_not_dispatchable", status: 409, outbox_id: queued.outbox_id, outbox_status: queued.status, provider: queued.provider || "meta" };
  }

  const claimedResult = await db.rpc("ops2_admin_attendance_claim_media_outbox_v1", { p_outbox_id: queued.outbox_id });
  if (claimedResult.error) throw claimedResult.error;
  const claim = claimedResult.data || { ok: false, error: "outbox_claim_failed" };
  if (claim.already_sent === true) {
    return { ok: true, status: "accepted", duplicate: true, outbox_id: claim.outbox_id || queued.outbox_id, provider: "meta" };
  }
  if (claim.ok !== true) {
    const error = String(claim.error || "outbox_claim_failed");
    return { ...claim, status: attendanceSendHttpStatus(error) };
  }
  if (!attendanceMetaConfigReady() || !/^\d{5,30}$/.test(String(claim.phone_number_id || ""))) {
    await markAttendanceClaimFailed(claim, "meta_transport_not_configured");
    return { error: "meta_transport_not_configured", status: 409, provider: "meta" };
  }

  let uploaded: any;
  try {
    uploaded = await uploadMetaMedia({
      accessToken: META_WHATSAPP_ACCESS_TOKEN,
      graphVersion: META_WHATSAPP_GRAPH_VERSION,
      phoneNumberId: claim.phone_number_id,
      mimeType,
      filename,
      bytes,
      timeoutMs: 20000,
    });
  } catch (error) {
    const code = error instanceof MetaMediaError ? error.code : "meta_media_upload_failed";
    await markAttendanceClaimFailed(claim, code);
    return { error: code, status: 502, provider: "meta", uncertain: false };
  }

  try {
    const sent = await sendMediaViaMeta({
      accessToken: META_WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: claim.phone_number_id,
      toE164: claim.to_phone_e164,
      mediaType,
      mediaId: uploaded.mediaId,
      caption: safeCaption,
      filename,
      graphVersion: META_WHATSAPP_GRAPH_VERSION,
      timeoutMs: 15000,
    });
    const acceptedAt = new Date().toISOString();
    const accepted = await db.rpc("ops2_admin_attendance_accept_meta_media_outbound_v1", {
      p_outbox_id: claim.outbox_id,
      p_provider_message_id: sent.providerMessageId,
      p_provider_media_id: uploaded.mediaId,
      p_accepted_at: acceptedAt,
    });
    if (accepted.error || accepted.data?.ok !== true) {
      return await markAttendanceMetaUncertain(claim, accepted.error?.message || accepted.data?.error || "canonical_persist_failed");
    }

    const messageId = uuid(accepted.data?.message_id);
    let mediaCached = false;
    if (messageId) {
      try {
        mediaCached = await cacheAttendanceOutboundMedia(messageId, filename, mimeType, bytes);
      } catch {
        console.warn("site-admin-v1 outbound media cache unavailable", messageId);
      }
    }
    return {
      ok: true,
      status: "accepted",
      outbox_status: "sent",
      provider: "meta",
      message_id: messageId || null,
      status_current: accepted.data?.status_current || "accepted",
      media_cached: mediaCached,
    };
  } catch (error) {
    if (error instanceof MetaTransportError) {
      if (error.uncertain) return await markAttendanceMetaUncertain(claim, error.code);
      await markAttendanceClaimFailed(claim, error.code);
      return { ok: false, error: error.code, status: attendanceSendHttpStatus(error.code), provider: "meta", retryable: error.retryable === true, uncertain: false, http_status: error.httpStatus };
    }
    return await markAttendanceMetaUncertain(claim, "unexpected_media_transport_error");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (!["GET", "POST"].includes(req.method)) return json(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { ok: false, error: "server_config" }, 500);
  const origin = req.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { ok: false, error: "origin_not_allowed" }, 403);
  const adminCodeStatus = verifyAdminCode(req.headers.get("x-admin-code"));
  if (adminCodeStatus === "not_configured") return json(req, { ok: false, error: "admin_auth_not_configured" }, 503);
  if (adminCodeStatus !== "valid") return json(req, { ok: false, error: "admin_code_invalid" }, 401);

  try {
    const url = new URL(req.url);
    const urlAction = clean(url.searchParams.get("action"), 40);
    let body: any = {};
    if (req.method === "POST" && urlAction === "whatsapp_conversation_send_media") {
      const contentLength = Number(req.headers.get("content-length") || 0);
      if (Number.isFinite(contentLength) && contentLength > 26 * 1024 * 1024) {
        return json(req, { ok: false, error: "media_file_too_large" }, 413);
      }
      let form: FormData;
      try { form = await req.formData(); }
      catch { return json(req, { ok: false, error: "invalid_multipart" }, 400); }
      body = {
        action: urlAction,
        conversation_id: form.get("conversation_id"),
        idempotency_key: form.get("idempotency_key"),
        caption: form.get("caption"),
        file: form.get("file"),
      };
    } else if (req.method === "POST") {
      try { body = await req.json(); }
      catch { return json(req, { ok: false, error: "invalid_json" }, 400); }
    }
    const input = { ...Object.fromEntries(url.searchParams.entries()), ...body };
    const action = clean(input.action, 40);
    let result: any;
    if (req.method === "POST" && action === "whatsapp_overview") result = await whatsappOverview();
    else if (req.method === "POST" && action === "whatsapp_conversation_list") result = await whatsappConversationList(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_messages") result = await whatsappConversationMessages(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_send_text") result = await whatsappConversationSendText(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_send_media") result = await whatsappConversationSendMedia(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_media") result = await whatsappConversationMedia(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_favorite") result = await whatsappConversationFavorite(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_preview") result = await whatsappCampaignPreview(input);
    else if (req.method === "POST" && action === "whatsapp_ana_pause_channel") result = await whatsappAnaPauseChannel(input);
    else if (req.method === "POST" && action === "whatsapp_ana_admin_status") result = await whatsappAnaAdminStatus();
    else if (req.method === "POST" && action === "customer_lookup") result = await customerLookup(input);
    else if (req.method === "POST" && action === "customer_save") result = await customerSave(input);
    else if (req.method === "GET" && action === "baskets") {
      const status = ["active", "inactive", "all"].includes(input.status) ? input.status : "active";
      result = await basketList(status);
    }
    else if (req.method === "GET" && action === "products") result = await productSearch(input);
    else if (req.method === "POST" && action === "product_save") result = await productSave(input);
    else if (req.method === "POST" && action === "product_set_active") result = await productSetActive(input);
    else if (req.method === "POST" && action === "basket_save") result = await basketSave(input);
    else if (req.method === "POST" && action === "basket_set_active") result = await basketSetActive(input);
    else if (req.method === "GET" && action === "orders_list") result = await ordersList(input);
    else if (req.method === "GET" && action === "order_detail") result = await orderDetail(input);
    else if (req.method === "GET" && action === "order_separation") result = await orderSeparation(input);
    else if (req.method === "POST" && action === "order_confirm") result = await confirmStorefrontOrder(input);
    else if (req.method === "POST" && action === "order_set_separator") result = await setOrderSeparator(input);
    else if (req.method === "POST" && action === "order_separation_item") result = await setOrderSeparationItem(input);
    else if (req.method === "POST" && action === "order_complete_separation") result = await completeOrderSeparation(input);
    else if (req.method === "POST" && action === "order_mark_delivered") result = await markOrderDelivered(input);
    else return json(req, { ok: false, error: "action_invalid" }, 400);

    if (result?.error) return json(req, { ok: false, ...result }, Number(result.status || 400));
    return json(req, { ok: true, ...result });
  } catch (error) {
    console.error("site-admin-v1", error);
    const response = errorResponse(error);
    return json(req, { ok: false, ...response }, response.status);
  }
});
