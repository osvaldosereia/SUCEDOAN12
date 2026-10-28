import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { verifyAdminCode } from "../_shared/admin-code-v1.ts";
import { sendTextViaMeta, sendMediaViaMeta, MetaTransportError } from "../_shared/whatsapp-meta-transport-v1.mjs";
import { canonicalOutboundMetaMime, outboundMetaMaxBytes, validateOutboundMetaMediaContent, uploadMetaMedia, fetchMetaMediaInfo, fetchMetaMediaResponse, MetaMediaError } from "../_shared/whatsapp-meta-media-v1.mjs";
import { cacheInboundMetaMedia } from "../_shared/whatsapp-inbound-media-cache-v1.mjs";
import { ANA_DRY_RUN_INSTRUCTIONS, ANA_DRY_RUN_SCHEMA, buildAnaDryRunInput, normalizeAnaDryRunResult, isSimpleAnaGreeting } from "../_shared/ana-policy-v1.mjs";
import { validateAnaConfiguration, buildAnaRuntimeInstructions, routeAnaMessage } from "../_shared/ana-admin-config-v1.mjs";
import { shouldSendAnaLiveReply } from "../_shared/ana-live-policy-v1.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const META_WHATSAPP_ACCESS_TOKEN = (Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "").trim();
const META_WHATSAPP_GRAPH_VERSION = (Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "").trim();
const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") || "").trim();
const ANA_MODEL = (Deno.env.get("ANA_OPENAI_MODEL") || "gpt-6-luna").trim();
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
const MOST_SOLD_TAG = "mais-vendidos";
function isMostSoldTag(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === MOST_SOLD_TAG;
}

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

function normalizeQuickBalanceEan(value: unknown) {
  const scanned = clean(value, 40).replace(/\D/g, "");
  return scanned.length >= 8 && scanned.length <= 14 ? scanned : "";
}

function quickBalanceEanCandidates(value: string) {
  const scanned = String(value || "").replace(/\D/g, "");
  const canonical = scanned.replace(/^0+/, "") || "0";
  const candidates = new Set<string>([scanned, canonical]);
  for (const length of [8, 12, 13, 14]) {
    if (canonical.length <= length) candidates.add(canonical.padStart(length, "0"));
  }
  return [...candidates];
}

async function quickBalanceLookup(input: any) {
  const ean = normalizeQuickBalanceEan(input.ean);
  if (!ean) return { status: 400, error: "invalid_ean", message: "Leia um código EAN válido." };

  const candidates = quickBalanceEanCandidates(ean);
  const productFields = "id,name,brand,sku,gtin,image_url,stock,validity_date,gondola,is_active";
  const [gtinResult, captureResult, gondolaResult] = await Promise.all([
    db.from("products").select(productFields).in("gtin", candidates).limit(50),
    db.from("ean_capture_records_v1").select("matched_product_id").in("ean", candidates).eq("sync_status", "found").not("matched_product_id", "is", null).limit(100),
    db.from("vitrine_gondolas").select("number").eq("active", true).order("number"),
  ]);
  if (gtinResult.error) throw gtinResult.error;
  if (captureResult.error) throw captureResult.error;
  if (gondolaResult.error) throw gondolaResult.error;

  const byId = new Map<string, any>();
  for (const product of gtinResult.data || []) byId.set(String(product.id), product);
  const mappedIds = [...new Set((captureResult.data || []).map((row: any) => clean(row.matched_product_id, 80)).filter(Boolean))];
  const missingIds = mappedIds.filter((id) => !byId.has(id));
  if (missingIds.length) {
    const mapped = await db.from("products").select(productFields).in("id", missingIds).limit(50);
    if (mapped.error) throw mapped.error;
    for (const product of mapped.data || []) byId.set(String(product.id), product);
  }

  const products = [...byId.values()];
  if (!products.length) return { found: false, message: "Produto não encontrado para este EAN." };
  if (products.length > 1) {
    return { status: 409, error: "ambiguous_ean", message: "Este EAN está ligado a mais de um produto. Confira o cadastro antes de continuar." };
  }

  let product = products[0];
  let activatedOnRead = false;
  if (product.is_active !== true) {
    const activation = await db.from("products")
      .update({ is_active: true })
      .eq("id", product.id)
      .select(productFields)
      .single();
    if (activation.error) throw activation.error;
    product = activation.data;
    activatedOnRead = true;
  }
  const stock = product.stock === null || product.stock === undefined ? null : Number(product.stock);
  const stockReady = Number.isFinite(stock);
  return {
    found: true,
    activated_on_read: activatedOnRead,
    gondolas: (gondolaResult.data || []).map((row: any) => String(row.number)),
    product: {
      id: product.id,
      name: product.name || "",
      brand: product.brand || "",
      sku: product.sku || "",
      gtin: product.gtin || "",
      image_url: product.image_url || "",
      is_active: product.is_active === true,
      validity_date: product.validity_date || null,
      gondola: product.gondola ?? null,
      current_stock: stockReady ? stock : null,
      stock_ready: stockReady,
      stock_source: "supabase",
    },
  };
}

async function quickBalanceSave(input: any) {
  const productId = uuid(input.product_id);
  const ean = normalizeQuickBalanceEan(input.ean);
  const rawQuantity = String(input.counted_quantity ?? "").trim().replace(",", ".");
  const quantity = rawQuantity === "" ? NaN : Number(rawQuantity);
  if (!productId) return { status: 400, error: "invalid_product_id", message: "Produto inválido. Leia o EAN novamente." };
  if (!ean) return { status: 400, error: "invalid_ean", message: "Leia o código EAN novamente." };
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 999999.999 || (rawQuantity.split(".")[1] || "").length > 3) {
    return { status: 400, error: "invalid_count", message: "Informe uma quantidade válida, com até três casas decimais." };
  }
  if (!Object.prototype.hasOwnProperty.call(input, "expected_stock")) {
    return { status: 400, error: "invalid_product_snapshot", message: "Atualize o produto antes de salvar." };
  }
  const expectedStock = input.expected_stock === null ? null : Number(input.expected_stock);
  if (expectedStock !== null && (!Number.isFinite(expectedStock) || expectedStock < 0)) {
    return { status: 400, error: "invalid_product_snapshot", message: "Atualize o produto antes de salvar." };
  }
  const countedQuantity = Math.round(quantity * 1000) / 1000;
  const parseDate = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const date = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) return undefined;
    return date;
  };
  const validityDate = parseDate(input.validity_date);
  const expectedValidityDate = parseDate(input.expected_validity_date);
  if (validityDate === undefined || expectedValidityDate === undefined
    || !Object.prototype.hasOwnProperty.call(input, "expected_gondola")) {
    return { status: 400, error: "invalid_product_snapshot", message: "Atualize o produto antes de salvar." };
  }
  const gondola = clean(input.gondola, 24);
  const expectedGondola = input.expected_gondola === null ? null : clean(input.expected_gondola, 24);

  const [productResult, gondolaResult] = await Promise.all([
    db.from("products").select("id,gondola").eq("id", productId).maybeSingle(),
    db.from("vitrine_gondolas").select("number").eq("active", true),
  ]);
  if (productResult.error) throw productResult.error;
  if (gondolaResult.error) throw gondolaResult.error;
  if (!productResult.data) return { status: 404, error: "product_not_found", message: "Produto não encontrado. Leia o EAN novamente." };
  const currentGondola = productResult.data.gondola ?? null;
  const activeGondolas = new Set((gondolaResult.data || []).map((row: any) => String(row.number)));
  if (gondola && gondola !== currentGondola && !activeGondolas.has(gondola)) {
    return { status: 400, error: "invalid_gondola", message: "Selecione uma gôndola ativa." };
  }

  const saved = await db.rpc("ops_quick_balance_save_v1", {
    p_product_id: productId,
    p_scanned_ean: ean,
    p_counted_quantity: countedQuantity,
    p_validity_date: validityDate,
    p_gondola: gondola || null,
    p_expected_stock: expectedStock,
    p_expected_validity_date: expectedValidityDate,
    p_expected_gondola: expectedGondola,
    p_operator_label: "Admin · Balanço rápido",
  });
  if (saved.error) throw saved.error;
  if (saved.data?.ok !== true) {
    const code = clean(saved.data?.error, 60) || "quick_balance_save_failed";
    const status = code === "product_not_found" ? 404
      : code === "product_changed" || code === "ean_mismatch" ? 409 : 400;
    const messages: Record<string, string> = {
      product_not_found: "Produto não encontrado. Leia o EAN novamente.",
      product_changed: "O produto mudou em outra tela. Leia o EAN novamente antes de salvar.",
      ean_mismatch: "O EAN não corresponde a este produto. Leia o código novamente.",
      invalid_count: "Informe uma quantidade válida.",
      invalid_gondola: "Selecione uma gôndola ativa.",
    };
    return { status, error: code, message: messages[code] || "Não foi possível salvar o balanço." };
  }
  return { saved: true, ...saved.data };
}

async function productSearch(input: any) {
  const limit = integer(input.limit ?? 24, 1, 50) || 24;
  const offset = integer(input.offset ?? 0, 0, 100000) || 0;
  const status = ["active", "inactive"].includes(input.status) ? input.status : "all";
  const segment = ["no_photo", "zero_stock", "recently_edited", "recently_added", "no_ean", "no_ncm"].includes(input.segment)
    ? input.segment
    : "all";
  const queryText = clean(input.q, 80).replace(/[^\p{L}\p{N}\s._-]/gu, " ").replace(/\s+/g, " ").trim();
  let query = db.from("products").select(PRODUCT_COLUMNS, { count: "exact" });
  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);

  const logicGroups: string[] = [];
  if (queryText) {
    const pattern = `*${queryText}*`;
    logicGroups.push(`or(name.ilike.${pattern},sku.ilike.${pattern},brand.ilike.${pattern},gtin.ilike.${pattern})`);
  }
  if (segment === "no_photo") logicGroups.push('or(image_url.is.null,image_url.eq."")');
  if (segment === "no_ean") logicGroups.push('or(gtin.is.null,gtin.eq."")');
  if (segment === "no_ncm") logicGroups.push('or(ncm.is.null,ncm.eq."")');
  if (logicGroups.length === 1) query = query.or(logicGroups[0].slice(3, -1));
  else if (logicGroups.length > 1) query = query.or(`and(${logicGroups.join(",")})`);

  const recentAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (segment === "zero_stock") query = query.eq("stock", 0);
  if (segment === "recently_added") query = query.gte("created_at", recentAfter);
  if (segment === "recently_edited") query = query.gte("metadata->>admin_last_edited_at", recentAfter);

  if (segment === "recently_added") query = query.order("created_at", { ascending: false });
  else if (segment === "recently_edited") query = query.order("metadata->>admin_last_edited_at", { ascending: false });
  else query = query.order("is_active", { ascending: false }).order("name", { ascending: true });
  const result = await query.range(offset, offset + limit - 1);
  if (result.error) throw result.error;
  return { products: result.data || [], total: result.count || 0, offset, limit };
}
async function adminProductMetadataForEdit(productId: string) {
  const result = await db.from("products").select("metadata").eq("id", productId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const existing = result.data.metadata && typeof result.data.metadata === "object" && !Array.isArray(result.data.metadata)
    ? result.data.metadata
    : {};
  return { ...existing, admin_last_edited_at: new Date().toISOString() };
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
  const inputTags = Array.isArray(input.tags)
    ? input.tags.map((tag: unknown) => clean(tag, 60)).filter(Boolean).slice(0, 40)
    : clean(input.tags, 1000).split(",").map((tag) => clean(tag, 60)).filter(Boolean).slice(0, 40);
  const showInMostSold = payload.storefront_featured === true || inputTags.some(isMostSoldTag);
  const regularTags = inputTags.filter((tag) => !isMostSoldTag(tag)).slice(0, 40);
  payload.storefront_featured = showInMostSold;
  payload.tags = showInMostSold && regularTags.length < 40
    ? [...regularTags, MOST_SOLD_TAG]
    : regularTags;

  if (id) {
    const metadata = await adminProductMetadataForEdit(id);
    if (!metadata) return { status: 404, error: "product_not_found", message: "Produto não encontrado." };
    payload.metadata = metadata;
  } else {
    payload.metadata = { admin_last_edited_at: new Date().toISOString() };
  }

  const query = id
    ? db.from("products").update(payload).eq("id", id)
    : db.from("products").insert({ ...payload, is_active: input.is_active !== false });
  const result = await query.select(PRODUCT_COLUMNS).single();
  if (result.error) throw result.error;
  return { product: result.data };
}

async function productSetMostSold(input: any) {
  const id = uuid(input.id ?? input.product_id);
  const isMostSold = input.is_most_sold;
  if (!id || typeof isMostSold !== "boolean") {
    return { status: 400, error: "invalid_most_sold_status", message: "Produto ou situação inválida." };
  }

  const current = await db.from("products").select("id,name,tags").eq("id", id).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) return { status: 404, error: "product_not_found", message: "Produto não encontrado." };

  const tags = (Array.isArray(current.data.tags) ? current.data.tags : [])
    .map((tag: unknown) => clean(tag, 60)).filter(Boolean).filter((tag: string) => !isMostSoldTag(tag)).slice(0, 40);
  if (isMostSold && tags.length < 40) tags.push(MOST_SOLD_TAG);
  const metadata = await adminProductMetadataForEdit(id);
  if (!metadata) return { status: 404, error: "product_not_found", message: "Produto não encontrado." };

  const result = await db.from("products")
    .update({ storefront_featured: isMostSold, tags, metadata })
    .eq("id", id)
    .select("id,name,storefront_featured,tags")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return { status: 404, error: "product_not_found", message: "Produto não encontrado." };
  return { product: result.data };
}

async function productSetActive(input: any) {
  const id = uuid(input.id ?? input.product_id);
  if (!id || typeof input.is_active !== "boolean") {
    return { status: 400, error: "invalid_product_status", message: "Produto ou situação inválida." };
  }
  const metadata = await adminProductMetadataForEdit(id);
  if (!metadata) return { status: 404, error: "product_not_found", message: "Produto não encontrado." };
  const result = await db.from("products")
    .update({ is_active: input.is_active, metadata })
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

async function separationFiscalHubCall(subaction: string, extra: any = {}) {
  const key = await db.rpc("get_bling_hub_key_v2");
  if (key.error || !key.data) return { error: "bling_bridge_not_configured", status: 503 };
  try {
    const response = await fetch(SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/admin-service-intelligence-v1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-dona-antonia-bling-hub-key": String(key.data) },
      body: JSON.stringify({ action: "vitrine_bling_hub_internal", subaction, ...extra }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json().catch(() => ({ ok: false, error: "invalid_bling_response" }));
    if (!response.ok || data?.ok === false) {
      return { error: String(data?.error || "bling_hub_unavailable"), status: response.status || 502, detail: data?.detail || null, data };
    }
    return { data };
  } catch (error) {
    return { error: "bling_hub_unavailable", status: 502, detail: clean((error as Error)?.message || error, 240) };
  }
}

async function openSeparationNotificationAttention(orderId: string, evidence: any = {}) {
  try {
    await db.rpc("ops_open_attention_v1", {
      p_type: "order_separation_notification_pending",
      p_summary: "Separação concluída; a confirmação ao cliente precisa ser conferida.",
      p_entity_type: "order", p_entity_id: orderId, p_correlation_id: orderId,
      p_priority: "high", p_owner_role: "supervisor",
      p_recommended_action: "Confira o status da mensagem de separação antes de tentar reenviar.",
      p_evidence: evidence || {}, p_source_system: "whatsapp",
      p_idempotency_key: "order-separation-whatsapp-auto-v1:" + orderId, p_due_at: null,
    });
  } catch {}
}

async function runSeparationCustomerNotification(orderId: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("whatsapp_internal_key_unavailable");
  const response = await fetch(
    SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/order-separation-notify-v1",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": SERVICE_ROLE_KEY },
      body: JSON.stringify({ order_id: orderId }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const result = await response.json().catch(() => ({ ok: false, error: "invalid_notification_response" }));
  if (!response.ok || result?.ok !== true) {
    throw new Error(String(result?.error || "separation_notification_failed"));
  }

  const status = clean(result.status, 40).toLowerCase() || "unknown";
  const saved = {
    attempted: true, status, meta_accepted: status === "accepted",
    notification_id: uuid(result.notification_id) || null,
    template_name: clean(result.template_name, 160) || null,
    provider_message_id: clean(result.provider_message_id, 160) || null,
    reason: clean(result.reason, 120) || null,
    updated_at: new Date().toISOString(),
  };
  await markSeparationFiscalMetadata(orderId, { customer_notification: saved });
  if (status === "pending") await openSeparationNotificationAttention(orderId, saved);
  return saved;
}

function separationFiscalObject(value: any) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function buildSeparationFiscalSnapshot(orderId: string) {
  const [orderResult, itemsResult, completionResult, reservationsResult] = await Promise.all([
    db.from("orders").select("*").eq("id", orderId).maybeSingle(),
    db.from("order_items").select("id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,metadata,created_at")
      .eq("order_id", orderId).order("created_at", { ascending: true }),
    db.from("order_separation_completions_v1")
      .select("deliverable_order_item_ids,completed_at,metadata").eq("order_id", orderId).maybeSingle(),
    db.from("vitrine_stock_reservations").select("status,expires_at").eq("order_id", orderId),
  ]);
  if (orderResult.error) throw orderResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (completionResult.error) throw completionResult.error;
  if (reservationsResult.error) throw reservationsResult.error;
  const order = orderResult.data;
  const completion = completionResult.data;
  if (!order) throw new Error("order_not_found");
  if (!completion?.completed_at || completion.metadata?.stock_applied !== true) {
    throw new Error("separation_completion_not_recorded");
  }

  let ids = Array.isArray(completion.deliverable_order_item_ids)
    ? completion.deliverable_order_item_ids.map((value: any) => String(value))
    : [];
  if (!ids.length) {
    const separated = await db.from("order_separation_items_v1").select("order_item_id")
      .eq("order_id", orderId).eq("state", "separated");
    if (separated.error) throw separated.error;
    ids = (separated.data || []).map((row: any) => String(row.order_item_id)).filter(Boolean);
  }
  const idSet = new Set(ids);
  const rows = (itemsResult.data || []).filter((item: any) => idSet.has(String(item.id)));
  const productIds = [...new Set(rows.map((item: any) => String(item.product_id || "")).filter(Boolean))];
  const products = new Map<string, any>();
  if (productIds.length) {
    const result = await db.from("products").select("id,sku,gtin,name").in("id", productIds);
    if (result.error) throw result.error;
    for (const product of result.data || []) products.set(String(product.id), product);
  }

  const grouped = new Map<string, any>();
  for (const item of rows) {
    if (!item.product_id) continue;
    const metadata = separationFiscalObject(item.metadata);
    const kind = String(metadata.history_kind || "");
    const centsFromMetadata = Number(metadata.unit_price_cents);
    const unit = kind.includes("component") && Number.isFinite(centsFromMetadata)
      ? Math.round(centsFromMetadata) : Math.round(Number(item.unit_price || 0) * 100);
    const quantity = Number(item.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const product = products.get(String(item.product_id));
    const key = String(item.product_id) + "|" + unit;
    const current = grouped.get(key);
    if (current) current.quantity = Math.round((current.quantity + quantity) * 1000) / 1000;
    else grouped.set(key, {
      product_id: item.product_id, sku: item.sku_snapshot || product?.sku || "",
      gtin: product?.gtin || "", name: item.name_snapshot || product?.name || "Produto",
      quantity, unit_price_cents: unit, source_kind: kind.includes("component") ? "basket_component" : "product",
    });
  }

  const items = [...grouped.values()];
  const itemCents = items.reduce((sum: number, item: any) =>
    sum + Math.round(Number(item.quantity) * Number(item.unit_price_cents)), 0);
  const customer = separationFiscalObject(order.customer_snapshot);
  const delivery = separationFiscalObject(order.delivery_address);
  const totalCents = cents(order.total);
  const reservations = reservationsResult.data || [];
  const stockConsumed = reservations.some((row: any) => row.status === "consumed");
  const stockReserved = stockConsumed || reservations.some((row: any) =>
    row.status === "reserved" && (!row.expires_at || Date.parse(row.expires_at) > Date.now())
  );
  const stockReleased = !stockReserved && reservations.some((row: any) => row.status === "released");
  const paymentMethod = clean(order.payment_method, 80);
  return {
    source_order_id: orderId, order_number: order.order_number || "",
    status: order.status || "ready", created_at: order.created_at,
    queue_reason: "separation_completed", issues: [],
    customer: {
      source_customer_id: order.customer_id || delivery.source_customer_id || customer.customer_id || null,
      name: customer.name || customer.full_name || delivery.customer_name || delivery.recipient_name || "",
    },
    delivery,
    payment: {
      method: paymentMethod, label: paymentMethod, timing: "on_delivery", source: clean(order.source, 80) || "vitrine",
      stock_reserved: stockReserved, stock_consumed: stockConsumed, stock_released: stockReleased,
      stock_model: "canonical_vitrine_v1",
    },
    items,
    totals: { individual_products_cents: itemCents, commercial_order_cents: totalCents, commercial_delta_cents: totalCents - itemCents },
  };
}

async function markSeparationFiscalMetadata(orderId: string, metadata: any) {
  const result = await db.rpc("ops2_mark_order_separation_completion_v2", {
    p_order_id: orderId, p_phase: "completed", p_metadata: metadata,
  });
  if (result.error) throw result.error;
  if (result.data?.ok !== true) throw new Error(String(result.data?.error || "separation_completion_update_failed"));
}

async function openSeparationFiscalAttention(orderId: string, type: string, summary: string, action: string, evidence: any = {}) {
  try {
    await db.rpc("ops_open_attention_v1", {
      p_type: type, p_summary: summary, p_entity_type: "order", p_entity_id: orderId,
      p_correlation_id: orderId, p_priority: "high", p_owner_role: "supervisor",
      p_recommended_action: action, p_evidence: evidence || {}, p_source_system: "bling",
      p_idempotency_key: "order-fiscal-auto-v5:" + type + ":" + orderId, p_due_at: null,
    });
  } catch {}
}

async function runSeparationFiscalIntegration(orderId: string) {
  let blingVerified: any = { attempted: true, ok: false };
  try {
    const snapshot = await buildSeparationFiscalSnapshot(orderId);
    const verified = await separationFiscalHubCall("ops2_ensure_order_state", {
      payload: snapshot, target_key: "verified", canary: false,
    });
    if (verified.error || verified.data?.ok !== true) {
      throw new Error(String(verified.error || verified.data?.error || "bling_order_verification_failed"));
    }
    blingVerified = { attempted: true, ok: true, bling_order_id: verified.data?.bling_order_id || null };
    await markSeparationFiscalMetadata(orderId, {
      bling_verified: true, bling_order_id: blingVerified.bling_order_id, verified_at: new Date().toISOString(),
    });
  } catch (error) {
    const reason = clean((error as Error)?.message || error, 300) || "bling_order_verification_failed";
    blingVerified = { attempted: true, ok: false, error: reason };
    try {
      await markSeparationFiscalMetadata(orderId, {
        bling_verified: false, bling_verify_error: reason, bling_verify_failed_at: new Date().toISOString(),
      });
    } catch {}
    await openSeparationFiscalAttention(orderId, "order_bling_verified_pending",
      "Separação concluída; sincronização Verificado no Bling está pendente.",
      "Revise a integração do pedido com o Bling. A separação física já foi concluída.", blingVerified);
    return { bling_verified: blingVerified, fiscal_auto: { attempted: false, ok: false, error: "bling_not_verified" } };
  }

  let fiscal: any;
  try {
    const preflight = await db.rpc("ops2_fiscal_dispatch_preflight_v1", { p_order_id: orderId });
    if (preflight.error) {
      fiscal = { attempted: false, ok: false, error: "fiscal_preflight_unavailable", detail: clean(preflight.error.message, 240) };
    } else if (preflight.data?.ready !== true) {
      fiscal = { attempted: false, ok: false, error: "fiscal_preflight_blocked", blockers: preflight.data?.blockers || [] };
    } else {
      const preview = await separationFiscalHubCall("fiscal_dispatch_preview", { source_order_id: orderId });
      if (preview.error || preview.data?.ok !== true) {
        fiscal = { attempted: false, ok: false, error: String(preview.error || preview.data?.error || "fiscal_dispatch_preview_unavailable") };
      } else if (preview.data?.already_authorized === true || preview.data?.invoice?.situation?.authorized === true) {
        fiscal = { attempted: false, ok: true, authorized: true, stage: "authorized", idempotent_replay: true };
      } else if (Array.isArray(preview.data?.hard_blockers) && preview.data.hard_blockers.length) {
        fiscal = { attempted: false, ok: false, error: "fiscal_dispatch_not_eligible", blockers: preview.data.hard_blockers };
      } else if (preview.data?.config?.human_issue_enabled !== true || preview.data?.config?.dispatch_gate_mode !== "enforce") {
        fiscal = { attempted: false, ok: false, error: "fiscal_auto_issue_not_enabled" };
      } else {
        const issued = await separationFiscalHubCall("fiscal_dispatch_canary_human_execute", {
          source_order_id: orderId, confirmation: "EMITIR_NFE",
        });
        if (issued.error || issued.data?.ok !== true) {
          fiscal = { attempted: true, ok: false, error: String(issued.error || issued.data?.error || "fiscal_issue_failed"), detail: issued.detail || null };
        } else {
          const invoice = issued.data?.invoice || null;
          const authorized = issued.data?.authorized === true || invoice?.situation?.authorized === true;
          const jobStatus = String(issued.data?.job?.status || "").toLowerCase();
          const failed = invoice?.situation?.failed === true || ["failed", "error", "review_required", "rejected"].includes(jobStatus);
          const processing = issued.data?.pending === true || issued.data?.generated === true
            || Number(issued.data?.invoice_id || invoice?.id || 0) > 0
            || ["generating", "generated", "authorizing", "processing"].includes(jobStatus);
          const accepted = authorized || (!failed && processing);
          fiscal = {
            attempted: true, ok: accepted, authorized,
            stage: authorized ? "authorized" : accepted ? "processing" : "blocked",
            error: accepted ? null : String(issued.data?.error || "fiscal_result_not_confirmed"),
            invoice_id: Number(issued.data?.invoice_id || invoice?.id || 0) || null,
            invoice_number: invoice?.numero || null,
          };
        }
      }
    }
  } catch (error) {
    fiscal = { attempted: true, ok: false, error: clean((error as Error)?.message || error, 300) || "fiscal_issue_failed" };
  }

  try {
    await markSeparationFiscalMetadata(orderId, {
      bling_verified: true, bling_order_id: blingVerified.bling_order_id || null,
      fiscal_auto_attempted: fiscal?.attempted === true, fiscal_auto_ok: fiscal?.ok === true,
      fiscal_auto_authorized: fiscal?.authorized === true, fiscal_auto_stage: fiscal?.stage || null,
      fiscal_auto_error: fiscal?.ok === true ? null : String(fiscal?.error || "fiscal_issue_failed"),
      fiscal_auto_at: new Date().toISOString(), external_integrations_pending: fiscal?.ok !== true,
    });
  } catch (error) {
    fiscal = { ...fiscal, metadata_persisted: false, metadata_error: clean((error as Error)?.message || error, 240) };
  }

  if (fiscal?.ok !== true) {
    await openSeparationFiscalAttention(orderId, "order_fiscal_auto_issue_pending",
      "Pedido separado; a NF-e automática precisa de atenção.",
      "Abra o pedido e revise a pendência fiscal antes de liberar a expedição.", fiscal);
  }
  return { bling_verified: blingVerified, fiscal_auto: fiscal };
}

async function completeOrderSeparation(input: any) {
  const id = uuid(input.order_id);
  const expected = clean(input.expected_order_updated_at, 80);
  if (!id || !expected) return { error: "invalid_separation_completion", status: 400, message: "Atualize a separação antes de confirmar." };

  const assignmentResult = await db.from("order_separation_assignments_v1")
    .select("separator_key,separator_label,assigned_at").eq("order_id", id).maybeSingle();
  if (assignmentResult.error) throw assignmentResult.error;
  if (!clean(assignmentResult.data?.separator_key, 40)) {
    return { error: "separator_required", status: 409, message: "Selecione o responsável pela separação para continuar." };
  }

  const prepared = await db.rpc("ops2_prepare_order_separation_completion_v2", {
    p_order_id: id, p_expected_order_updated_at: expected,
  });
  if (prepared.error) throw prepared.error;
  if (prepared.data?.ok !== true) {
    return { error: String(prepared.data?.error || "separation_incomplete"), status: 409,
      message: "Confira todos os produtos e selecione o separador antes de confirmar." };
  }

  const applied = await db.rpc("ops2_apply_order_separation_stock_v2", { p_order_id: id });
  if (applied.error) throw applied.error;
  if (applied.data?.ok !== true) {
    const code = String(applied.data?.error || "separation_stock_update_failed");
    if (code.includes("bling")) return { error: code, status: 409, message: "O estoque precisa estar sob autoridade do Bling para concluir a separação." };
    return { error: code, status: 409, message: "Não foi possível concluir a separação e atualizar o estoque." };
  }

  const orderResult = await db.from("orders").select("id,status,updated_at").eq("id", id).maybeSingle();
  if (orderResult.error) throw orderResult.error;
  if (!orderResult.data || String(orderResult.data.status) !== "ready") {
    return { error: "ready_transition_failed", status: 409,
      message: "A separação foi salva, mas o pedido não passou para expedição. Atualize a lista e revise o pedido.",
      recovery_scheduled: true };
  }

  try {
    await db.rpc("ops_sync_delivery_stop_v1", { p_order_id: id, p_order_status: "ready" });
  } catch {}

  const completed = await db.rpc("ops2_mark_order_separation_completion_v2", {
    p_order_id: id, p_phase: "completed",
    p_metadata: {
      separated_at: new Date().toISOString(), separator_key: assignmentResult.data.separator_key,
      separator_label: assignmentResult.data.separator_label || null, operational_completion: true,
      external_integrations_pending: true, physical_stock_launch_point: "dispatch",
    },
  });
  if (completed.error) throw completed.error;
  if (completed.data?.ok !== true) {
    return { error: String(completed.data?.error || "separation_completion_not_recorded"), status: 409,
      message: "A separação foi aplicada, mas não foi possível registrar sua conclusão. Atualize e revise o pedido.",
      recovery_scheduled: true };
  }

  const fiscalTask = runSeparationFiscalIntegration(id).catch(async (error) => {
    const reason = clean((error as Error)?.message || error, 300);
    await openSeparationFiscalAttention(id, "order_post_separation_integration_pending",
      "A separação terminou; a integração fiscal precisa de revisão.",
      "Revise a sincronização do pedido no Bling e a emissão da NF-e. Não refaça a separação.", { error: reason });
    return { attempted: true, ok: false, error: reason };
  });
  const notificationTask = runSeparationCustomerNotification(id).catch(async (error) => {
    const reason = clean((error as Error)?.message || error, 300);
    const failure = { attempted: true, status: "failed", error: reason, updated_at: new Date().toISOString() };
    try { await markSeparationFiscalMetadata(id, { customer_notification: failure }); } catch {}
    await openSeparationNotificationAttention(id, failure);
    return failure;
  });
  const integrationsTask = Promise.all([fiscalTask, notificationTask]).then(([fiscalIntegration, customerNotification]) => ({
    fiscal_integration: fiscalIntegration, customer_notification: customerNotification,
  }));
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  const integrationsQueued = Boolean(edgeRuntime && typeof edgeRuntime.waitUntil === "function");
  if (integrationsQueued) edgeRuntime.waitUntil(integrationsTask);
  const integrationsResult = integrationsQueued ? null : await integrationsTask;

  return {
    prepared: prepared.data, applied: applied.data, completion: completed.data,
    integrations_queued: integrationsQueued,
    fiscal_integration: integrationsResult?.fiscal_integration || null,
    customer_notification: integrationsResult?.customer_notification || null,
  };
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
  const [accountsResult, runtimeResult, campaignExecutionResult, templateCountResult, approvedCountResult, templateRowsResult, templateEventsResult, campaignsResult, anaResult, consentSummary] = await Promise.all([
    db.from("whatsapp_accounts").select("id,slug,display_name,phone_e164,is_active").order("display_name"),
    db.from("whatsapp_channel_runtime_v1").select("whatsapp_account_id,inbound_provider,outbound_provider,capture_enabled,send_enabled,ana_enabled,campaigns_enabled,human_send_enabled,homologated_at,updated_at"),
    db.from("marketing_campaign_execution_runtime_v1").select("whatsapp_account_id,mode,max_batch_size"),
    db.from("whatsapp_templates_v1").select("id", { count: "exact", head: true }),
    db.from("whatsapp_templates_v1").select("id", { count: "exact", head: true }).eq("status", "APPROVED"),
    db.from("whatsapp_templates_v1")
      .select("id,whatsapp_account_id,name,language,category,status,quality_rating,last_synced_at,updated_at")
      .order("updated_at", { ascending: false }).limit(100),
    db.from("whatsapp_template_events_v1")
      .select("whatsapp_account_id,template_name,language,status,reason,occurred_at")
      .ilike("status", "rejected")
      .not("reason", "is", null)
      .order("occurred_at", { ascending: false }).limit(200),
    db.from("marketing_campaigns_v1")
      .select("id,name,whatsapp_account_id,template_id,filters,status,revision,manual_batch_mode,scheduled_for,created_at,started_at,paused_at,completed_at,failed_at", { count: "exact" })
      .order("created_at", { ascending: false }).limit(100),
    db.from("whatsapp_ana_jobs_v1")
      .select("id,whatsapp_account_id,status,decision,created_at", { count: "exact" })
      .eq("dry_run", false).order("created_at", { ascending: false }).limit(50),
    whatsappMarketingConsentSummary(),
  ]);
  for (const result of [accountsResult, runtimeResult, campaignExecutionResult, templateCountResult, approvedCountResult, templateRowsResult, templateEventsResult, campaignsResult, anaResult]) {
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
  const campaignExecutionByAccount = new Map((campaignExecutionResult.data || []).map((row: any) => [row.whatsapp_account_id, row]));
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
      id: uuid(account.id),
      is_active: account.is_active === true,
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
    id: uuid(row.id),
    whatsapp_account_id: uuid(row.whatsapp_account_id),
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
      whatsapp_account_id: uuid(row.whatsapp_account_id),
      template_id: uuid(row.template_id),
      draft_editable: String(row.status || "").toLowerCase() === "draft" && !normalizeCampaignDraftFilters(row.filters).error,
      name: clean(row.name || "Campanha", 140),
      channel: clean(accountById.get(row.whatsapp_account_id)?.display_name || "", 120),
      status: clean(row.status, 40),
      revision: Number(row.revision) || 0,
      manual_batch_mode: row.manual_batch_mode === true,
      execution_mode: clean((campaignExecutionByAccount.get(row.whatsapp_account_id) as any)?.mode || "off", 24),
      campaigns_enabled: (runtimeByAccount.get(row.whatsapp_account_id) as any)?.campaigns_enabled === true,
      send_enabled: (runtimeByAccount.get(row.whatsapp_account_id) as any)?.send_enabled === true,
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
        currently_verified_consent_count: exclusionCountsAvailable ? Number(summary.currently_verified_consent_count) || 0 : null,
        exclusion_counts: exclusionCountsAvailable ? {
          available: true,
          opted_out_count: Number(summary.excluded_opted_out_count) || 0,
          consent_evidence_unverified_count: Number(summary.excluded_consent_evidence_unverified_count) || 0,
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

async function conversationOrderOverrides(adminUserId: string) {
  const overrides = new Map<string, string>();
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const result = await db.from("whatsapp_conversation_order_overrides_v1")
      .select("conversation_id,mode")
      .eq("admin_user_id", adminUserId)
      .order("updated_at", { ascending: false })
      .order("conversation_id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const rows = result.data || [];
    for (const row of rows) {
      const conversationId = uuid(row.conversation_id);
      const mode = clean(row.mode, 12).toLowerCase();
      if (conversationId && ["include", "exclude"].includes(mode)) overrides.set(conversationId, mode);
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
  return overrides;
}

async function recentOrderConversationIds(conversationIds?: string[]) {
  if (conversationIds && !conversationIds.length) return new Set<string>();
  const since = new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString();
  let query = db.from("whatsapp_messages_v1")
    .select("conversation_id,text_body")
    .eq("direction", "inbound")
    .gte("created_at", since)
    .or("text_body.ilike.%pedido%,text_body.ilike.%encomendar%,text_body.ilike.%pedir%")
    .limit(2000);
  if (conversationIds) query = query.in("conversation_id", conversationIds);
  const result = await query;
  if (result.error) throw result.error;
  const keyword = /(^|[^\p{L}\p{N}_])(pedido|encomendar|pedir)(?=$|[^\p{L}\p{N}_])/iu;
  return new Set((result.data || [])
    .filter((row: any) => keyword.test(String(row.text_body || "")))
    .map((row: any) => uuid(row.conversation_id))
    .filter(Boolean));
}

async function whatsappConversationOrderOverride(input: any) {
  const mode = clean(input.mode, 12).toLowerCase();
  if (!["include", "exclude"].includes(mode)) return { error: "invalid_order_override", status: 400 };
  const conversationId = uuid(input.conversation_id);
  if (!conversationId) return { error: "invalid_conversation_id", status: 400 };
  const adminUserId = await adminFavoriteUserId();
  if (!adminUserId) {
    return { error: "order_override_identity_unavailable", status: 409, message: "Não foi possível identificar o administrador para salvar esta marcação." };
  }
  const conversation = await db.from("conversations").select("id").eq("id", conversationId).maybeSingle();
  if (conversation.error) throw conversation.error;
  if (!conversation.data) return { error: "conversation_not_found", status: 404 };
  const result = await db.from("whatsapp_conversation_order_overrides_v1")
    .upsert({ admin_user_id: adminUserId, conversation_id: conversationId, mode, updated_at: new Date().toISOString() }, { onConflict: "admin_user_id,conversation_id" });
  if (result.error) throw result.error;
  return { conversation_id: conversationId, mode, is_in_orders: mode === "include" };
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
  let accountId = requestedAccount ? uuid(requestedAccount) : "";
  if (requestedAccount && !accountId) return { error: "invalid_account_id", status: 400 };
  const quickFilter = clean(input.quick_filter, 20).toLowerCase();
  if (!["", "all", "favorites", "0975", "1018", "orders"].includes(quickFilter)) {
    return { error: "invalid_quick_filter", status: 400 };
  }
  const search = clean(input.search, 80).replace(/\D/g, "");
  const filter = clean(input.filter, 20).toLowerCase();
  const onlyHuman = filter === "human";
  const onlyFavorites = quickFilter === "favorites" || filter === "favorites";
  const onlyOrders = quickFilter === "orders";
  let favoriteIds: string[] = [];
  let favoritesAvailable = false;
  let adminUserId = "";
  let orderOverrides = new Map<string, string>();
  let ordersAvailable = false;
  try { adminUserId = await adminFavoriteUserId(); } catch { adminUserId = ""; }
  if (adminUserId) {
    const [favoriteResult, orderResult] = await Promise.allSettled([
      conversationFavoriteIds(adminUserId),
      conversationOrderOverrides(adminUserId),
    ]);
    if (favoriteResult.status === "fulfilled") {
      favoriteIds = favoriteResult.value;
      favoritesAvailable = true;
    }
    if (orderResult.status === "fulfilled") {
      orderOverrides = orderResult.value;
      ordersAvailable = true;
    }
  }
  if (onlyFavorites && !favoritesAvailable) {
    return { error: "favorites_unavailable", status: 503, message: "Favoritos indisponíveis neste ambiente." };
  }

  const accountResult = await db.from("whatsapp_accounts")
    .select("id,slug,display_name,phone_e164,is_active")
    .order("display_name");
  if (accountResult.error) throw accountResult.error;
  const accounts = accountResult.data || [];
  if (["0975", "1018"].includes(quickFilter)) {
    const selectedAccount = accounts.find((row: any) => String(row.phone_e164 || "").replace(/\D/g, "").endsWith(quickFilter));
    accountId = selectedAccount ? uuid(selectedAccount.id) : "00000000-0000-0000-0000-000000000000";
  }

  let orderKeywordIds = new Set<string>();
  let orderIds = new Set<string>();
  if (onlyOrders) {
    orderKeywordIds = await recentOrderConversationIds();
    for (const id of orderKeywordIds) {
      if (orderOverrides.get(id) !== "exclude") orderIds.add(id);
    }
    for (const [id, mode] of orderOverrides) {
      if (mode === "include") orderIds.add(id);
    }
  }

  let conversationQuery = db.from("conversations")
    .select("id,customer_id,whatsapp_account_id,wa_contact_e164,status,stage,human_required,mode,last_inbound_at,last_outbound_at,updated_at,created_at", { count: "exact" })
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
  if (onlyOrders) {
    const orderIdList = Array.from(orderIds);
    conversationQuery = orderIdList.length
      ? conversationQuery.in("id", orderIdList)
      : conversationQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const conversationResult = await conversationQuery;
  if (conversationResult.error) throw conversationResult.error;
  const rows = conversationResult.data || [];
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const customerIds = Array.from(new Set(pageRows.map((row: any) => uuid(row.customer_id)).filter(Boolean)));
  const contactPhones = Array.from(new Set(pageRows.map((row: any) => String(row.wa_contact_e164 || "")).filter(Boolean)));
  const byIdQuery = customerIds.length
    ? db.from("customers").select("id,name,primary_whatsapp_e164").in("id", customerIds)
    : Promise.resolve({ data: [], error: null });
  const byPhoneQuery = contactPhones.length
    ? db.from("customers").select("id,name,primary_whatsapp_e164").in("primary_whatsapp_e164", contactPhones)
    : Promise.resolve({ data: [], error: null });
  const pageIds = pageRows.map((row: any) => uuid(row.id)).filter(Boolean);
  const customerPhonesQuery = contactPhones.length
    ? db.from("customer_phones").select("customer_id,phone_e164,is_primary,verified_at").in("phone_e164", contactPhones)
      .order("is_primary", { ascending: false }).order("verified_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const profileNamesQuery = pageIds.length
    ? db.from("whatsapp_messages_v1").select("conversation_id,metadata,created_at")
      .in("conversation_id", pageIds).eq("direction", "inbound")
      .order("created_at", { ascending: false }).limit(Math.min(pageIds.length * 8, 240))
    : Promise.resolve({ data: [], error: null });
  const recentForPageQuery = onlyOrders
    ? Promise.resolve({ data: Array.from(orderKeywordIds).filter((id) => pageIds.includes(id)).map((id) => ({ conversation_id: id })), error: null })
    : recentOrderConversationIds(pageIds).then((ids) => ({ data: Array.from(ids).map((id) => ({ conversation_id: id })), error: null }));
  const [byIdResult, byPhoneResult, recentForPageResult, customerPhonesResult, profileNamesResult] = await Promise.all([
    byIdQuery, byPhoneQuery, recentForPageQuery, customerPhonesQuery, profileNamesQuery,
  ]);
  if (byIdResult.error) throw byIdResult.error;
  if (byPhoneResult.error) throw byPhoneResult.error;
  if (recentForPageResult.error) throw recentForPageResult.error;
  const phoneRows = customerPhonesResult.error ? [] : customerPhonesResult.data || [];
  const phoneCustomerIds = Array.from(new Set(phoneRows.map((row: any) => uuid(row.customer_id)).filter(Boolean)));
  const knownCustomerIds = new Set([...(byIdResult.data || []), ...(byPhoneResult.data || [])].map((row: any) => uuid(row.id)).filter(Boolean));
  const missingPhoneCustomerIds = phoneCustomerIds.filter((id) => !knownCustomerIds.has(id));
  const secondaryCustomersResult = missingPhoneCustomerIds.length
    ? await db.from("customers").select("id,name,primary_whatsapp_e164").in("id", missingPhoneCustomerIds)
    : { data: [], error: null };
  const customerRows = [...(byIdResult.data || []), ...(byPhoneResult.data || []), ...(secondaryCustomersResult.data || [])];
  const customerById = new Map(customerRows.map((row: any) => [uuid(row.id), row]));
  const customerByPhone = new Map((byPhoneResult.data || []).map((row: any) => [String(row.primary_whatsapp_e164 || ""), row]));
  const customerIdByPhone = new Map<string, string>();
  for (const row of phoneRows) {
    const phone = String(row.phone_e164 || "");
    if (phone && !customerIdByPhone.has(phone)) customerIdByPhone.set(phone, uuid(row.customer_id));
  }
  const profileNameByConversation = new Map<string, string>();
  for (const row of profileNamesResult.error ? [] : profileNamesResult.data || []) {
    const conversationId = uuid(row.conversation_id);
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const name = clean(metadata.contact_name || metadata.profile_name || "", 180);
    if (conversationId && name && !profileNameByConversation.has(conversationId)) profileNameByConversation.set(conversationId, name);
  }
  const recentOrderSet = new Set((recentForPageResult.data || []).map((row: any) => uuid(row.conversation_id)).filter(Boolean));
  const accountById = new Map(accounts.map((row: any) => [row.id, row]));
  const favoriteIdSet = new Set(favoriteIds);
  const items = pageRows.map((row: any) => {
    const account: any = accountById.get(row.whatsapp_account_id) || {};
    const phoneDigits = String(row.wa_contact_e164 || "").replace(/\D/g, "");
    const accountDigits = String(account.phone_e164 || "").replace(/\D/g, "");
    const lastActivity = [row.last_inbound_at, row.last_outbound_at, row.updated_at, row.created_at]
      .filter(Boolean).sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
    const linkedCustomer: any = customerById.get(uuid(row.customer_id))
      || customerByPhone.get(String(row.wa_contact_e164 || ""))
      || customerById.get(customerIdByPhone.get(String(row.wa_contact_e164 || "")) || "")
      || {};
    const whatsappProfileName = profileNameByConversation.get(row.id) || "";
    const hasRecentOrderKeyword = recentOrderSet.has(row.id);
    const orderOverride = orderOverrides.get(row.id) || "";
    const isInOrders = orderOverride === "include" || (orderOverride !== "exclude" && hasRecentOrderKeyword);
    return {
      id: row.id,
      customer_name: clean(linkedCustomer.name || "", 180),
      whatsapp_profile_name: clean(whatsappProfileName, 180),
      channel: clean(account.display_name || account.slug || "WhatsApp", 120),
      channel_number: accountDigits.slice(-4),
      phone_last4: phoneDigits.slice(-4),
      status: clean(row.status, 40),
      stage: clean(row.stage, 40),
      mode: clean(row.mode, 40),
      human_required: row.human_required === true,
      is_favorite: favoriteIdSet.has(row.id),
      has_recent_order_keyword: hasRecentOrderKeyword,
      order_override: orderOverride,
      is_in_orders: isInOrders,
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
    orders_available: ordersAvailable,
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

async function whatsappConversationMessageStatuses(input: any) {
  const conversationId = uuid(input.conversation_id);
  const rawIds = input.message_ids;
  if (!conversationId) return { error: "invalid_conversation_id", status: 400 };
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 100) {
    return { error: "invalid_message_ids", status: 400 };
  }
  const messageIds = Array.from(new Set(rawIds.map((value: any) => uuid(value)).filter(Boolean)));
  if (!messageIds.length || messageIds.length !== rawIds.length) {
    return { error: "invalid_message_ids", status: 400 };
  }

  const conversationResult = await db.from("conversations")
    .select("id,whatsapp_account_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversationResult.error) throw conversationResult.error;
  if (!conversationResult.data) return { error: "conversation_not_found", status: 404 };

  const result = await db.from("whatsapp_messages_v1")
    .select("id,status_current")
    .eq("conversation_id", conversationId)
    .eq("whatsapp_account_id", conversationResult.data.whatsapp_account_id)
    .eq("direction", "outbound")
    .in("id", messageIds)
    .limit(100);
  if (result.error) throw result.error;
  return {
    conversation_id: conversationId,
    statuses: (result.data || []).map((row: any) => ({
      id: uuid(row.id),
      status_current: clean(row.status_current, 40),
    })),
  };
}

async function cacheInboundWhatsappMetaMedia(message: any, messageType: string, allowedMimeTypes: Set<string>) {
  const metadata = message?.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const media = metadata.media && typeof metadata.media === "object" ? metadata.media : {};
  const mediaId = clean(media.provider_media_id || metadata.provider_media_id, 240);
  if (message?.direction !== "inbound" || clean(metadata.source || media.source, 30).toLowerCase() !== "meta" || !mediaId) return null;
  if (!attendanceMetaConfigReady()) {
    return { error: "media_retrieval_failed", message: "Não foi possível recuperar esta mídia do WhatsApp.", status: 503 };
  }
  const result = await cacheInboundMetaMedia({
    db,
    message: Object.assign({}, message, { message_type: messageType }),
    accessToken: META_WHATSAPP_ACCESS_TOKEN,
    graphVersion: META_WHATSAPP_GRAPH_VERSION,
    fetchMediaInfo,
    fetchMediaResponse,
    allowedMimeTypes,
  });
  if (result?.error === "media_retrieval_failed") {
    return { ...result, message: "Não foi possível recuperar esta mídia do WhatsApp. Tente novamente." };
  }
  return result;
}

async function whatsappConversationMedia(input: any) {
  const conversationId = uuid(input.conversation_id);
  const messageId = uuid(input.message_id);
  if (!conversationId || !messageId) return { error: "invalid_media_reference", status: 400 };

  const messageResult = await db.from("whatsapp_messages_v1")
    .select("id,message_type,direction,metadata")
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

  if (!path) {
    const recovered = await cacheInboundWhatsappMetaMedia(messageResult.data, messageType, allowedMimeTypes);
    if (recovered?.error) return recovered;
    if (recovered) {
      bucket = "attendance-media-v1";
      path = recovered.path;
      mimeType = recovered.mimeType;
      filename = recovered.filename;
      fileSize = recovered.fileSize;
    }
  }

  if (!path) {
    const metadata = messageResult.data.metadata && typeof messageResult.data.metadata === "object" ? messageResult.data.metadata : {};
    const media = metadata.media && typeof metadata.media === "object" ? metadata.media : {};
    const source = clean(metadata.source || media.source, 30).toLowerCase();
    const hasMetaMediaId = Boolean(clean(media.provider_media_id || metadata.provider_media_id, 240));
    if (messageResult.data.direction === "inbound" && (source !== "meta" || !hasMetaMediaId)) {
      return { error: "media_not_available", message: "Este arquivo chegou sem um identificador recuperável. Novas mídias recebidas pelo WhatsApp oficial serão guardadas automaticamente.", status: 404 };
    }
    return { error: "media_not_cached", message: "Esta mídia ainda não está disponível no cache privado.", status: 404 };
  }
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



const CAMPAIGN_FILTER_TEXT_FIELDS = new Set(["city", "neighborhood", "brand", "category"]);
const CAMPAIGN_FILTER_DATE_FIELDS = new Set(["last_purchase_before", "last_purchase_after"]);
const CAMPAIGN_FILTER_NUMBER_FIELDS = new Set([
  "inactive_days", "min_order_count", "max_order_count", "min_lifetime_value", "max_lifetime_value",
]);
const CAMPAIGN_FILTER_FIELDS = new Set([
  ...CAMPAIGN_FILTER_TEXT_FIELDS,
  ...CAMPAIGN_FILTER_DATE_FIELDS,
  ...CAMPAIGN_FILTER_NUMBER_FIELDS,
]);

function normalizeCampaignDraftFilters(value: any): { error?: string; filters: Record<string, unknown> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "invalid_filters", filters: {} };
  const filters: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!CAMPAIGN_FILTER_FIELDS.has(key)) return { error: "unsupported_campaign_filter", filters: {} };
    if (raw === null || raw === undefined || raw === "") continue;
    if (CAMPAIGN_FILTER_TEXT_FIELDS.has(key)) {
      if (typeof raw !== "string") return { error: "invalid_campaign_filter", filters: {} };
      const text = clean(raw, 120);
      if (text) filters[key] = text;
      continue;
    }
    if (CAMPAIGN_FILTER_DATE_FIELDS.has(key)) {
      if (typeof raw !== "string") return { error: "invalid_campaign_filter", filters: {} };
      const date = raw.slice(0, 10);
      const parsedDate = new Date(date + "T00:00:00.000Z");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
        return { error: "invalid_campaign_filter", filters: {} };
      }
      filters[key] = date + "T00:00:00.000Z";
      continue;
    }
    if (typeof raw !== "string" && typeof raw !== "number") return { error: "invalid_campaign_filter", filters: {} };
    const number = Number(raw);
    const integer = key === "inactive_days" || key === "min_order_count" || key === "max_order_count";
    const maximum = key === "inactive_days" ? 3650
      : integer ? 1000000 : 1000000000;
    if (!Number.isFinite(number) || number < 0 || number > maximum || (integer && !Number.isInteger(number))) {
      return { error: "invalid_campaign_filter", filters: {} };
    }
    filters[key] = number;
  }
  if (filters.min_order_count !== undefined && filters.max_order_count !== undefined
      && Number(filters.min_order_count) > Number(filters.max_order_count)) {
    return { error: "invalid_campaign_filter_range", filters: {} };
  }
  if (filters.min_lifetime_value !== undefined && filters.max_lifetime_value !== undefined
      && Number(filters.min_lifetime_value) > Number(filters.max_lifetime_value)) {
    return { error: "invalid_campaign_filter_range", filters: {} };
  }
  return { filters };
}

async function validateMarketingCampaignTemplate(accountId: string, templateId: string) {
  const result = await db.from("whatsapp_templates_v1")
    .select("id,whatsapp_account_id,category,status")
    .eq("id", templateId)
    .eq("whatsapp_account_id", accountId)
    .maybeSingle();
  if (result.error) throw result.error;
  const row = result.data;
  if (!row) return { error: "template_not_found", status: 404 };
  if (String(row.category || "").toUpperCase() !== "MARKETING"
      || String(row.status || "").toUpperCase() !== "APPROVED") {
    return { error: "template_not_sendable", status: 409 };
  }
  return null;
}

async function marketingCampaignTemplateVariableIndices(accountId: string, templateId: string): Promise<{ error?: string; status?: number; indices?: number[] }> {
  const result = await db.rpc("marketing_campaign_template_snapshot_v1", {
    p_whatsapp_account_id: accountId,
    p_template_id: templateId,
  });
  if (result.error) throw result.error;
  const template: any = result.data || {};
  if (template.ok !== true) return { error: clean(template.error || "template_not_sendable", 80), status: 409, indices: [] };
  const text = (Array.isArray(template.components) ? template.components : [])
    .filter((component: any) => {
      const type = clean(component?.type, 24).toUpperCase();
      return type === "BODY" || (type === "HEADER" && clean(component?.format, 24).toUpperCase() === "TEXT");
    })
    .map((component: any) => String(component?.text || ""))
    .join(" ");
  const indices = Array.from(new Set(Array.from(text.matchAll(/{{\s*(\d{1,3})\s*}}/g), (match: any) => Number(match[1]))))
    .filter((index: number) => Number.isInteger(index) && index > 0 && index <= 999)
    .sort((a: number, b: number) => a - b);
  return { indices };
}

function normalizeCampaignTemplateVariables(input: any, indices: number[], requireAll = true): { error?: string; values?: Record<string, unknown> } {
  const isObject = input && typeof input === "object" && !Array.isArray(input);
  if (requireAll && !isObject) return { error: "invalid_campaign_variables" };
  const source = isObject ? input : {};
  const allowed = new Set(indices.map(String));
  const values: Record<string, unknown> = {};
  for (const [index, value] of Object.entries(source)) {
    if (!allowed.has(index)) {
      if (requireAll) return { error: "campaign_variable_not_in_template" };
      continue;
    }
    if (typeof value === "string") {
      const text = clean(value, 500);
      if (text) values[index] = text;
      else if (requireAll) return { error: "campaign_template_variable_required" };
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)
        && (value as any).source === "customer_first_name") {
      values[index] = {
        source: "customer_first_name",
        fallback: clean((value as any).fallback, 100) || "Cliente",
      };
      continue;
    }
    if (requireAll) return { error: "invalid_campaign_variable" };
  }
  if (requireAll && indices.some((index) => !Object.prototype.hasOwnProperty.call(values, String(index)))) {
    return { error: "campaign_template_variable_required" };
  }
  return { values };
}

async function whatsappCampaignDraftLoad(input: any) {
  const campaignId = uuid(input.campaign_id);
  if (!campaignId) return { error: "invalid_campaign_id", status: 400 };
  const result = await db.from("marketing_campaigns_v1")
    .select("id,name,status,revision,filters,variable_values,whatsapp_account_id,template_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return { error: "campaign_not_found", status: 404 };
  const campaign: any = result.data;
  if (String(campaign.status || "").toLowerCase() !== "draft") {
    return { error: "campaign_not_draft", status: 409 };
  }
  const normalized = normalizeCampaignDraftFilters(campaign.filters);
  if (normalized.error) return { error: "campaign_filters_not_editable", status: 409 };
  const variableIndices = await marketingCampaignTemplateVariableIndices(uuid(campaign.whatsapp_account_id), uuid(campaign.template_id));
  if (variableIndices.error) return variableIndices;
  const variableValues = normalizeCampaignTemplateVariables(campaign.variable_values, variableIndices.indices || [], false);
  return {
    campaign: {
      id: uuid(campaign.id),
      name: clean(campaign.name, 140),
      revision: Number(campaign.revision) || 0,
      whatsapp_account_id: uuid(campaign.whatsapp_account_id),
      template_id: uuid(campaign.template_id),
      variable_values: variableValues.values || {},
      filters: normalized.filters,
    },
  };
}

async function whatsappCampaignDraftCreate(input: any) {
  const name = clean(input.name, 140);
  const accountId = uuid(input.whatsapp_account_id);
  const templateId = uuid(input.template_id);
  const idempotencyKey = uuid(input.idempotency_key);
  if (!name) return { error: "invalid_name", status: 400 };
  if (!accountId || !templateId) return { error: "invalid_campaign_channel_or_template", status: 400 };
  if (!idempotencyKey) return { error: "invalid_idempotency_key", status: 400 };
  const normalized = normalizeCampaignDraftFilters(input.filters);
  if (normalized.error) return { error: normalized.error, status: 400 };
  if (Object.keys(normalized.filters).length === 0) {
    return { error: "campaign_filter_required", status: 400, message: "Informe ao menos um filtro de público para salvar o rascunho." };
  }
  const templateError = await validateMarketingCampaignTemplate(accountId, templateId);
  if (templateError) return templateError;
  const variableIndices = await marketingCampaignTemplateVariableIndices(accountId, templateId);
  if (variableIndices.error) return variableIndices;
  const variableValues = normalizeCampaignTemplateVariables(input.variable_values, variableIndices.indices || [], true);
  if (variableValues.error) return { error: variableValues.error, status: 400, message: "Preencha todas as variáveis do modelo aprovado." };
  const result = await db.rpc("marketing_create_campaign_v1", {
    p_name: name,
    p_whatsapp_account_id: accountId,
    p_template_id: templateId,
    p_filters: normalized.filters,
    p_variable_values: variableValues.values || {},
    p_deep_link: {},
    p_idempotency_key: idempotencyKey,
  });
  if (result.error) throw result.error;
  const saved = result.data || {};
  if (saved.ok !== true) return { error: clean(saved.error || "campaign_create_failed", 100), status: 409 };
  return {
    campaign_id: uuid(saved.campaign_id),
    revision: Number(saved.revision) || 0,
    status: clean(saved.status || "draft", 40),
    idempotent: saved.idempotent === true,
  };
}

async function whatsappCampaignDraftUpdate(input: any) {
  const campaignId = uuid(input.campaign_id);
  const accountId = uuid(input.whatsapp_account_id);
  const templateId = uuid(input.template_id);
  const revision = Number(input.revision);
  const name = clean(input.name, 140);
  if (!campaignId || !accountId || !templateId || !Number.isInteger(revision) || revision < 0) {
    return { error: "invalid_campaign_draft", status: 400 };
  }
  if (!name) return { error: "invalid_name", status: 400 };
  const normalized = normalizeCampaignDraftFilters(input.filters);
  if (normalized.error) return { error: normalized.error, status: 400 };
  if (Object.keys(normalized.filters).length === 0) {
    return { error: "campaign_filter_required", status: 400, message: "Informe ao menos um filtro de público para salvar o rascunho." };
  }
  const templateError = await validateMarketingCampaignTemplate(accountId, templateId);
  if (templateError) return templateError;
  const variableIndices = await marketingCampaignTemplateVariableIndices(accountId, templateId);
  if (variableIndices.error) return variableIndices;
  const variableValues = normalizeCampaignTemplateVariables(input.variable_values, variableIndices.indices || [], true);
  if (variableValues.error) return { error: variableValues.error, status: 400, message: "Preencha todas as variáveis do modelo aprovado." };
  const result = await db.rpc("marketing_update_campaign_draft_v1", {
    p_campaign_id: campaignId,
    p_expected_revision: revision,
    p_patch: {
      name,
      whatsapp_account_id: accountId,
      template_id: templateId,
      filters: normalized.filters,
      variable_values: variableValues.values || {},
    },
  });
  if (result.error) throw result.error;
  const saved = result.data || {};
  if (saved.ok !== true) return { error: clean(saved.error || "campaign_update_failed", 100), status: 409 };
  return {
    campaign_id: campaignId,
    revision: Number(saved.revision) || 0,
    status: clean(saved.status || "draft", 40),
    semantic_changed: saved.semantic_changed === true,
  };
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
        consent_evidence_unverified_count: count(exclusions.consent_evidence_unverified),
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




async function whatsappCampaignContentPreview(input: any) {
  const campaignId = uuid(input.campaign_id);
  let campaign: any;
  if (campaignId) {
    const campaignResult = await db.from("marketing_campaigns_v1")
      .select("id,name,revision,whatsapp_account_id,template_id")
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignResult.error) throw campaignResult.error;
    if (!campaignResult.data) return { error: "campaign_not_found", message: "Campanha não encontrada.", status: 404 };
    campaign = campaignResult.data;
  } else {
    const accountId = uuid(input.whatsapp_account_id);
    const templateId = uuid(input.template_id);
    if (!accountId || !templateId) return { error: "invalid_campaign_template", message: "Selecione o canal e o modelo aprovado.", status: 400 };
    const templateError = await validateMarketingCampaignTemplate(accountId, templateId);
    if (templateError) return templateError;
    campaign = { id: "", name: "", revision: 0, whatsapp_account_id: accountId, template_id: templateId };
  }
  const templateResult = await db.rpc("marketing_campaign_template_snapshot_v1", {
    p_whatsapp_account_id: campaign.whatsapp_account_id,
    p_template_id: campaign.template_id,
  });
  if (templateResult.error) throw templateResult.error;
  const template: any = templateResult.data || {};
  if (template.ok !== true) {
    return { error: clean(template.error || "template_not_sendable", 80), message: "O conteúdo do modelo aprovado não está disponível.", status: 409 };
  }

  const parts: any[] = [];
  for (const component of Array.isArray(template.components) ? template.components.slice(0, 8) : []) {
    const type = clean(component?.type, 24).toUpperCase();
    const format = clean(component?.format, 24).toUpperCase();
    if (type === "HEADER") {
      if (format === "TEXT") parts.push({ label: "Cabeçalho", text: clean(component?.text, 3000) });
      else parts.push({ label: "Cabeçalho", text: format ? "Conteúdo de mídia (" + format.toLowerCase() + "); o arquivo não é exibido nesta prévia." : "Conteúdo de mídia; o arquivo não é exibido nesta prévia." });
    } else if (type === "BODY") {
      parts.push({ label: "Mensagem", text: clean(component?.text, 6000) });
    } else if (type === "FOOTER") {
      parts.push({ label: "Rodapé", text: clean(component?.text, 1000) });
    } else if (type === "BUTTONS") {
      const buttons = Array.isArray(component?.buttons) ? component.buttons.slice(0, 10) : [];
      const labels = buttons.map((button: any) => {
        const label = clean(button?.text, 160);
        const buttonType = clean(button?.type, 24).toUpperCase();
        return [buttonType, label].filter(Boolean).join(": ");
      }).filter(Boolean);
      if (labels.length) parts.push({ label: "Botões", text: labels.join("\n") });
    }
  }
  const variableText = (Array.isArray(template.components) ? template.components : [])
    .filter((component: any) => {
      const type = clean(component?.type, 24).toUpperCase();
      return type === "BODY" || (type === "HEADER" && clean(component?.format, 24).toUpperCase() === "TEXT");
    })
    .map((component: any) => String(component?.text || ""))
    .join(" ");
  const variableIndices = Array.from(new Set(Array.from(variableText.matchAll(/{{\s*(\d{1,3})\s*}}/g), (match: any) => Number(match[1]))))
    .filter((index: number) => Number.isInteger(index) && index > 0 && index <= 999)
    .sort((a: number, b: number) => a - b);
  return {
    campaign: {
      id: campaignId || "",
      name: clean(campaign.name, 140),
      revision: Number(campaign.revision) || 0,
    },
    template: {
      name: clean(template.name, 160),
      language: clean(template.language, 24),
      category: clean(template.category, 40),
      parts,
      variable_count: variableIndices.length,
      variable_indices: variableIndices,
    },
  };
}

function campaignAdminCount(value: any) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

async function campaignAdminRpc(functionName: string, args: Record<string, unknown>, fallback: string) {
  const result = await db.rpc(functionName, args);
  if (result.error) throw result.error;
  const saved: any = result.data || {};
  if (saved.ok !== true) {
    const error = clean(saved.error || fallback, 100);
    const messages: Record<string, string> = {
      campaign_not_found: "Campanha não encontrada.",
      revision_conflict: "A campanha mudou em outra sessão. Atualize a lista e tente novamente.",
      snapshot_stale: "O snapshot não corresponde à revisão atual da campanha.",
      template_not_sendable: "O modelo deixou de estar aprovado ou disponível neste canal.",
      campaigns_disabled: "O envio de campanhas está desativado para este canal.",
      campaign_invalid_transition: "O status atual não permite esta ação.",
      invalid_idempotency_key: "Não foi possível identificar esta operação.",
      manual_batch_already_active: "Já existe um lote manual ativo para esta campanha.",
      manual_campaign_requires_explicit_batch: "Esta campanha exige a execução controlada em lote.",
    };
    return { error, message: messages[error] || "A operação não foi concluída.", status: 409 };
  }
  return saved;
}

async function whatsappCampaignSnapshot(input: any) {
  const campaignId = uuid(input.campaign_id);
  const revision = Number(input.revision);
  const idempotencyKey = uuid(input.idempotency_key);
  if (!campaignId || !Number.isInteger(revision) || revision < 0 || !idempotencyKey) {
    return { error: "invalid_campaign_snapshot", message: "Dados inválidos para congelar a audiência.", status: 400 };
  }
  const saved: any = await campaignAdminRpc("marketing_create_campaign_snapshot_v1", {
    p_campaign_id: campaignId,
    p_expected_revision: revision,
    p_idempotency_key: idempotencyKey,
  }, "campaign_snapshot_failed");
  if (saved.error) return saved;
  return {
    campaign_id: campaignId,
    revision: campaignAdminCount(saved.revision),
    snapshot_version: campaignAdminCount(saved.snapshot_version),
    found_count: campaignAdminCount(saved.found_count),
    eligible_count: campaignAdminCount(saved.eligible_count),
    excluded_count: campaignAdminCount(saved.excluded_count),
  };
}

async function whatsappCampaignTransition(input: any) {
  const campaignId = uuid(input.campaign_id);
  const revision = Number(input.revision);
  const toStatus = clean(input.to_status, 32).toLowerCase();
  const reasonByStatus: Record<string, string> = {
    ready_for_review: "Revisão solicitada pelo Admin",
    approved: "Audiência aprovada pelo Admin",
    draft: "Retornado a rascunho pelo Admin",
    cancelled: "Cancelado pelo Admin",
  };
  if (!campaignId || !Number.isInteger(revision) || revision < 0 || !reasonByStatus[toStatus]) {
    return { error: "invalid_campaign_transition", message: "Transição de campanha inválida.", status: 400 };
  }
  const saved: any = await campaignAdminRpc("marketing_transition_campaign_v1", {
    p_campaign_id: campaignId,
    p_expected_revision: revision,
    p_to_status: toStatus,
    p_reason: reasonByStatus[toStatus],
  }, "campaign_transition_failed");
  if (saved.error) return saved;
  return { campaign_id: campaignId, revision: campaignAdminCount(saved.revision), status: clean(saved.status, 32) };
}

async function whatsappCampaignSchedule(input: any) {
  const campaignId = uuid(input.campaign_id);
  const revision = Number(input.revision);
  const scheduledFor = clean(input.scheduled_for, 80);
  const scheduledAt = Date.parse(scheduledFor);
  if (!campaignId || !Number.isInteger(revision) || revision < 0 || !isIsoCursorTimestamp(scheduledFor)) {
    return { error: "invalid_campaign_schedule", message: "Informe data e horário válidos para o agendamento.", status: 400 };
  }
  if (!Number.isFinite(scheduledAt) || scheduledAt < Date.now() + 5 * 60 * 1000) {
    return { error: "campaign_schedule_too_soon", message: "Agende com pelo menos cinco minutos de antecedência.", status: 400 };
  }
  const saved: any = await campaignAdminRpc("marketing_schedule_campaign_v1", {
    p_campaign_id: campaignId,
    p_expected_revision: revision,
    p_scheduled_for: new Date(scheduledAt).toISOString(),
  }, "campaign_schedule_failed");
  if (saved.error) return saved;
  return {
    campaign_id: campaignId,
    revision: campaignAdminCount(saved.revision),
    status: clean(saved.status, 32),
    scheduled_for: saved.scheduled_for || null,
    mode: clean(saved.mode, 24),
  };
}

async function whatsappCampaignPause(input: any) {
  const campaignId = uuid(input.campaign_id);
  const revision = Number(input.revision);
  if (!campaignId || !Number.isInteger(revision) || revision < 0) {
    return { error: "invalid_campaign_pause", message: "Dados inválidos para pausar a campanha.", status: 400 };
  }
  const current = await db.from("marketing_campaigns_v1").select("revision,status").eq("id", campaignId).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) return { error: "campaign_not_found", message: "Campanha não encontrada.", status: 404 };
  if (Number(current.data.revision) !== revision) {
    return { error: "revision_conflict", message: "A campanha mudou em outra sessão. Atualize a lista e tente novamente.", status: 409 };
  }
  const saved: any = await campaignAdminRpc("marketing_pause_campaign_v1", {
    p_campaign_id: campaignId,
    p_reason: "Pausada pelo Admin",
  }, "campaign_pause_failed");
  if (saved.error) return saved;
  return { campaign_id: campaignId, status: clean(saved.status, 32) };
}

async function whatsappCampaignCancel(input: any) {
  const campaignId = uuid(input.campaign_id);
  const revision = Number(input.revision);
  if (!campaignId || !Number.isInteger(revision) || revision < 0) {
    return { error: "invalid_campaign_cancel", message: "Dados inválidos para cancelar a campanha.", status: 400 };
  }
  const current = await db.from("marketing_campaigns_v1").select("revision,status").eq("id", campaignId).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) return { error: "campaign_not_found", message: "Campanha não encontrada.", status: 404 };
  if (Number(current.data.revision) !== revision) {
    return { error: "revision_conflict", message: "A campanha mudou em outra sessão. Atualize a lista e tente novamente.", status: 409 };
  }
  const status = clean(current.data.status, 32).toLowerCase();
  const activeStatuses = new Set(["scheduled", "running", "paused"]);
  const saved: any = activeStatuses.has(status)
    ? await campaignAdminRpc("marketing_cancel_campaign_execution_v1", {
      p_campaign_id: campaignId,
      p_reason: "Cancelada pelo Admin",
    }, "campaign_cancel_failed")
    : await campaignAdminRpc("marketing_transition_campaign_v1", {
      p_campaign_id: campaignId,
      p_expected_revision: revision,
      p_to_status: "cancelled",
      p_reason: "Cancelada pelo Admin",
    }, "campaign_cancel_failed");
  if (saved.error) return saved;
  return {
    campaign_id: campaignId,
    status: clean(saved.status, 32),
    skipped_dispatches: campaignAdminCount(saved.skipped_dispatches),
    cancelled_outboxes: campaignAdminCount(saved.cancelled_outboxes),
  };
}


async function whatsappCampaignManualBatch(input: any) {
  const campaignId = uuid(input.campaign_id);
  const revision = Number(input.revision);
  const idempotencyKey = uuid(input.idempotency_key);
  if (!campaignId || !Number.isInteger(revision) || revision < 0 || !idempotencyKey) {
    return { error: "invalid_manual_batch", message: "Dados inválidos para iniciar o lote.", status: 400 };
  }
  const current = await db.from("marketing_campaigns_v1")
    .select("revision,status,manual_batch_mode")
    .eq("id", campaignId)
    .maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) return { error: "campaign_not_found", message: "Campanha não encontrada.", status: 404 };
  if (Number(current.data.revision) !== revision) {
    return { error: "revision_conflict", message: "A campanha mudou em outra sessão. Atualize a lista e tente novamente.", status: 409 };
  }
  const status = clean(current.data.status, 32).toLowerCase();
  const allowed = status === "approved" || (status === "paused" && current.data.manual_batch_mode === true);
  if (!allowed) {
    return { error: "campaign_invalid_transition", message: "O lote manual exige campanha aprovada ou lote pausado.", status: 409 };
  }

  const begun: any = await campaignAdminRpc("marketing_begin_manual_campaign_batch_v1", {
    p_campaign_id: campaignId,
    p_expected_revision: revision,
    p_idempotency_key: idempotencyKey,
    p_limit: 10,
  }, "manual_batch_start_failed");
  if (begun.error) return begun;
  const batchId = uuid(begun.batch_id);
  if (!batchId) return { error: "manual_batch_start_failed", message: "Não foi possível identificar o lote iniciado.", status: 409 };
  if (begun.status === "no_work") {
    return { campaign_id: campaignId, status: "no_work", claimed_count: 0, accepted_count: 0, mode: clean(begun.mode, 24) };
  }
  if (begun.worker_started_at) {
    if (begun.replayed && ["completed", "no_work"].includes(clean(begun.status, 24))) {
      return { campaign_id: campaignId, status: clean(begun.status, 24), already_processed: true, claimed_count: campaignAdminCount(begun.claimed_count), accepted_count: 0 };
    }
    return { error: "manual_batch_result_uncertain", message: "Este lote já foi adquirido pelo worker. Confira o resultado no histórico antes de tentar outro.", status: 409 };
  }

  const workerKeyResult = await db.rpc("marketing_campaign_worker_internal_key_v1");
  if (workerKeyResult.error) throw workerKeyResult.error;
  const workerKey = typeof workerKeyResult.data === "string" ? workerKeyResult.data : "";
  if (!workerKey) {
    return { error: "manual_batch_worker_unavailable", message: "O worker de campanhas não está disponível.", status: 503 };
  }

  let workerResponse: Response;
  try {
    workerResponse = await fetch(SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/whatsapp-marketing-worker-v1", {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        "x-dona-antonia-marketing-worker-key": workerKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ manual_batch_id: batchId }),
      signal: AbortSignal.timeout(130000),
    });
  } catch {
    return { error: "manual_batch_result_uncertain", message: "O worker não confirmou o resultado do lote. Confira o histórico antes de tentar novamente.", status: 409 };
  }

  const workerData: any = await workerResponse.json().catch(() => ({}));
  if (!workerResponse.ok || workerData?.ok !== true) {
    return { error: "manual_batch_result_uncertain", message: "O worker não confirmou o resultado do lote. Confira o histórico antes de tentar novamente.", status: 409 };
  }
  const results = Array.isArray(workerData.results) ? workerData.results : [];
  const countOutcome = (outcome: string) => results.filter((item: any) => item?.status === outcome).length;
  return {
    campaign_id: campaignId,
    status: clean(workerData.campaign_status || workerData.status || "processed", 32),
    mode: clean(workerData.mode, 24),
    claimed_count: campaignAdminCount(workerData.claimed),
    processed_count: campaignAdminCount(workerData.processed),
    accepted_count: countOutcome("accepted"),
    failed_count: countOutcome("failed"),
    retry_count: countOutcome("retry"),
    uncertain_count: countOutcome("uncertain"),
    skipped_count: countOutcome("skipped"),
  };
}

function anaOutputText(data: any) {
  return (Array.isArray(data?.output) ? data.output : [])
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .filter((item: any) => item?.type === "output_text")
    .map((item: any) => String(item?.text || ""))
    .join("")
    .trim();
}

async function anaOpenAiKey() {
  if (OPENAI_API_KEY) return OPENAI_API_KEY;
  if (!SERVICE_ROLE_KEY) return "";
  try {
    const result = await db.rpc("get_conversation_worker_provider_secret_v1");
    return !result.error && typeof result.data === "string" ? result.data.trim() : "";
  } catch {
    return "";
  }
}

function anaOperationalContext() {
  return {
    catalog_ordering: "Para consultar produtos e fazer pedido, direcione o cliente ao catálogo/site oficial. O atendimento pode orientar e oferecer atendimento humano, mas esta prévia não cria pedido.",
    human_support: "Atendimento humano está disponível quando o cliente pedir ajuda, quando faltar contexto confiável ou quando houver exceção operacional.",
    never_collect_in_chat: ["CPF/CNPJ", "endereço completo"],
    dynamic_data_rule: "Preço, estoque, total, composição de cesta, prazo/entrega, pagamento e dados do pedido são dinâmicos. Só afirme esses dados quando vierem explicitamente no contexto; caso contrário, encaminhe para humano ou para o catálogo/site oficial.",
    known_customer_first_name: "",
  };
}

async function generateAnaDryRunSuggestion(inboundText: string, instructions = ANA_DRY_RUN_INSTRUCTIONS) {
  const apiKey = await anaOpenAiKey();
  if (!apiKey) return { ok: false as const, error: "openai_not_configured", latency_ms: 0 };
  const input = buildAnaDryRunInput({ inboundText, history: [], operationalContext: anaOperationalContext() });
  const started = Date.now();
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ANA_MODEL,
        store: false,
        max_output_tokens: 500,
        reasoning: { effort: "low" },
        instructions,
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] }],
        text: { format: { type: "json_schema", name: "ana_dry_run_suggestion", strict: true, schema: ANA_DRY_RUN_SCHEMA } },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false as const, error: "openai_http_error", latency_ms: Date.now() - started };
    let parsed: any = {};
    try { parsed = JSON.parse(anaOutputText(data) || "{}"); }
    catch { return { ok: false as const, error: "openai_parse_error", latency_ms: Date.now() - started }; }
    return { ok: true as const, result: normalizeAnaDryRunResult(parsed), latency_ms: Date.now() - started };
  } catch (error: any) {
    return { ok: false as const, error: clean(error?.name || "openai_request_error", 120), latency_ms: Date.now() - started };
  }
}

async function whatsappAnaAdminSaveDraft(input: any) {
  const actorId = await adminFavoriteUserId();
  if (!actorId) return { error: "admin_identity_unavailable", status: 403 };
  const current = await db.rpc("ops2_ana_admin_load_v1");
  if (current.error) throw current.error;
  const draft = current.data?.draft;
  const revision = Number(draft?.revision);
  if (!Number.isSafeInteger(revision) || Number(input.expected_revision) !== revision) {
    return { error: "revision_conflict", status: 409, message: "O rascunho mudou. Atualize a tela antes de salvar." };
  }
  const configuration = input.configuration;
  const validation = validateAnaConfiguration(configuration);
  if (!validation.ok) return { error: "configuration_invalid", status: 400, message: "Revise os campos da configuração da ANA." };
  const saved = await db.rpc("ops2_ana_admin_save_draft_v1", {
    p_configuration: configuration,
    p_expected_revision: revision,
    p_note: clean(input.note || "Ajuste básico da ANA", 240),
    p_actor_id: actorId,
  });
  if (saved.error) throw saved.error;
  const result = saved.data || { ok: false, error: "ana_draft_save_failed" };
  if (result.ok !== true) return { error: clean(result.error || "ana_draft_save_failed", 100), status: 409 };
  const refreshed = await db.rpc("ops2_ana_admin_load_v1");
  if (refreshed.error) throw refreshed.error;
  return { revision: Number(refreshed.data?.draft?.revision) || revision + 1 };
}

async function whatsappAnaAdminTest(input: any) {
  const actorId = await adminFavoriteUserId();
  if (!actorId) return { error: "admin_identity_unavailable", status: 403 };
  const loaded = await db.rpc("ops2_ana_admin_load_v1");
  if (loaded.error) throw loaded.error;
  const draft = loaded.data?.draft;
  const validation = validateAnaConfiguration(draft?.configuration);
  if (!validation.ok) return { error: "configuration_invalid", status: 409 };
  const revision = Number(draft?.revision);
  if (!Number.isSafeInteger(revision) || Number(input.expected_revision) !== revision) {
    return { error: "revision_conflict", status: 409, message: "O rascunho mudou. Atualize a tela antes de testar." };
  }
  const suite = Array.isArray(draft.configuration.test_cases) ? draft.configuration.test_cases.slice(0, 20) : [];
  if (!suite.length) return { error: "required_test_cases_missing", status: 409 };

  const began = Date.now();
  let passed = 0;
  let failed = 0;
  const safeReasons: string[] = [];
  const scenarioResults: any[] = [];
  const simulate = async (message: string, channel: string, context: any = {}, options: any = {}) => {
    const trace: any[] = [];
    if (options?.deterministicGreeting === true && isSimpleAnaGreeting(message)) {
      trace.push({ step: "suite_guard", type: "simple_greeting" });
      return { outcome: "reply", reason: "required_suite_simple_greeting", response_text: "Olá! Como posso ajudar?", latency_ms: 0, trace };
    }
    if (context?.humanMode === true) {
      trace.push({ step: "gate", type: "human_mode" });
      return { outcome: "handoff", reason: "human_mode_gate", response_text: "", latency_ms: 0, trace };
    }
    const route = routeAnaMessage(draft.configuration, message, channel, context);
    if (route.triggerKey) trace.push({ step: "automation", trigger_key: route.triggerKey });
    if (route.path === "actions") {
      let responseText = "";
      let outcome = "no_reply";
      let continueAi = false;
      for (const action of route.actions || []) {
        if (action.type === "label") { trace.push({ step: "action", type: "label", label_id: action.labelId }); outcome = "label"; }
        if (action.type === "remove_label") { trace.push({ step: "action", type: "remove_label", label_id: action.labelId }); outcome = "label"; }
        if (action.type === "fixed_reply") { trace.push({ step: "action", type: "fixed_reply", response_text: action.responseText }); responseText = action.responseText; outcome = "reply"; }
        if (action.type === "handoff") { trace.push({ step: "action", type: "handoff" }); return { outcome: "handoff", reason: "trigger_actions_handoff", response_text: "", latency_ms: 0, trace }; }
        if (action.type === "continue_ai") { trace.push({ step: "action", type: "continue_ai" }); continueAi = true; }
      }
      if (responseText) return { outcome: "reply", reason: "trigger_actions_reply", response_text: responseText, latency_ms: 0, trace };
      if (!continueAi) return { outcome, reason: "trigger_actions_completed", response_text: "", latency_ms: 0, trace };
      trace.push({ step: "ai", type: "would_call_ai" });
    }
    if (route.path === "fixed_reply") return { outcome: "reply", reason: "fixed_reply_trigger", response_text: route.responseText, latency_ms: 0, trace };
    if (route.path === "handoff") return { outcome: "handoff", reason: route.reason || "trigger_handoff", response_text: "", latency_ms: 0, trace };
    if (route.path === "label") return { outcome: "label", reason: "trigger_label", response_text: "", latency_ms: 0, trace };
    if (route.path === "remove_label") return { outcome: "label", reason: "trigger_label_remove", response_text: "", latency_ms: 0, trace };
    const generated = await generateAnaDryRunSuggestion(message, buildAnaRuntimeInstructions(draft.configuration));
    if (!generated.ok) return { outcome: "handoff", reason: "ai_fallback_handoff", response_text: "", latency_ms: Number(generated.latency_ms) || 0, trace };
    const result = generated.result;
    if (result.decision === "no_reply") return { outcome: "no_reply", reason: "ai_no_reply", response_text: "", latency_ms: Number(generated.latency_ms) || 0, trace };
    if (!shouldSendAnaLiveReply({ decision: result.decision, confidence: result.confidence, responseText: result.response_text })) {
      return { outcome: "handoff", reason: "ai_low_confidence_handoff", response_text: "", latency_ms: Number(generated.latency_ms) || 0, trace };
    }
    trace.push({ step: "ai", type: "reply_eligible", confidence: result.confidence });
    return { outcome: "reply", reason: "ai_reply_eligible", response_text: result.response_text, latency_ms: Number(generated.latency_ms) || 0, trace };
  };

  for (const scenario of suite) {
    const result = await simulate(String(scenario.input || ""), String(scenario.channel || "0975"), {}, { deterministicGreeting: true });
    const ok = result.outcome === scenario.expected;
    if (ok) passed++; else failed++;
    safeReasons.push(ok ? "scenario_pass" : "scenario_failed");
    scenarioResults.push({
      key: clean(scenario.key, 40),
      expected: clean(scenario.expected, 40),
      actual: clean(result.outcome, 40),
      passed: ok,
      reason: clean(result.reason, 80),
    });
  }

  const recorded = await db.rpc("ops2_ana_admin_record_test_run_v1", {
    p_draft_revision: revision,
    p_scenario_keys: suite.map((scenario: any) => String(scenario.key)),
    p_passed_count: passed,
    p_failed_count: failed,
    p_safe_reasons: safeReasons,
    p_latency_ms: Math.max(0, Date.now() - began),
    p_actor_id: actorId,
  });
  if (recorded.error) throw recorded.error;
  const saved = recorded.data || { ok: false, error: "test_run_record_failed" };
  if (saved.ok !== true) return { error: clean(saved.error || "test_run_record_failed", 80), status: 409 };
  return {
    dry_run: true,
    dry_run_not_sendable: true,
    test_run: {
      id: uuid(saved.id),
      draft_revision: revision,
      passed_count: passed,
      failed_count: failed,
    },
    results: scenarioResults,
  };
}

async function whatsappAnaAdminPublish(input: any) {
  const testRunId = uuid(input.test_run_id);
  if (!testRunId) return { error: "test_run_required", status: 400 };
  const actorId = await adminFavoriteUserId();
  if (!actorId) return { error: "admin_identity_unavailable", status: 403 };
  const current = await db.rpc("ops2_ana_admin_load_v1");
  if (current.error) throw current.error;
  const configuration = current.data?.draft?.configuration;
  const validation = validateAnaConfiguration(configuration);
  if (!validation.ok) return { error: "configuration_invalid", status: 409 };
  if (current.data?.active?.configuration && stableAdminJson(current.data.active.configuration) === stableAdminJson(configuration)) {
    return { error: "draft_already_active", status: 409 };
  }
  const labelIds = [...new Set(configuration.triggers.flatMap((trigger: any) =>
    Array.isArray(trigger.actions) ? trigger.actions : [{ type: trigger.action, label_id: trigger.label_id }]
  ).filter((action: any) => ["label", "remove_label"].includes(action.type)).map((action: any) => String(action.label_id)))];
  if (labelIds.length) {
    const activeLabels = await db.from("attendance_labels_v1").select("id").eq("is_active", true).in("id", labelIds);
    if (activeLabels.error) throw activeLabels.error;
    const found = new Set((activeLabels.data || []).map((label: any) => label.id));
    if (labelIds.some((id: string) => !found.has(id))) return { error: "trigger_label_not_active", status: 409 };
  }
  const result = await db.rpc("ops2_ana_admin_publish_v1", {
    p_test_run_id: testRunId,
    p_note: clean(input.note || "Ativação confirmada no Admin", 240),
    p_actor_id: actorId,
  });
  if (result.error) throw result.error;
  const saved = result.data || { ok: false, error: "ana_publish_failed" };
  if (saved.ok !== true) return { error: clean(saved.error || "ana_publish_failed", 100), status: 409 };
  return { version: Number(saved.version) || 0, version_id: Number(saved.version_id) || 0, draft_revision: Number(saved.draft_revision) || 0 };
}

async function whatsappAnaAdminRollback(input: any) {
  const versionId = Number(input.version_id);
  if (!Number.isSafeInteger(versionId) || versionId < 1) return { error: "version_invalid", status: 400 };
  const actorId = await adminFavoriteUserId();
  if (!actorId) return { error: "admin_identity_unavailable", status: 403 };
  const current = await db.rpc("ops2_ana_admin_load_v1");
  if (current.error) throw current.error;
  const versions = Array.isArray(current.data?.versions) ? current.data.versions : [];
  const version = versions.find((item: any) => Number(item.id) === versionId);
  if (!version) return { error: "version_not_found", status: 404 };
  if (Number(current.data?.active?.id) === versionId) return { error: "version_already_active", status: 409 };
  const result = await db.rpc("ops2_ana_admin_rollback_v1", {
    p_version_id: versionId,
    p_note: clean(input.note || "Restauração confirmada no Admin", 240),
    p_actor_id: actorId,
  });
  if (result.error) throw result.error;
  const saved = result.data || { ok: false, error: "ana_rollback_failed" };
  if (saved.ok !== true) return { error: clean(saved.error || "ana_rollback_failed", 100), status: 409 };
  return { version: Number(saved.version) || 0, version_id: Number(saved.version_id) || 0 };
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
  const anaDeliverySampleLimit = 200;
  const [result, runtimeResult, anaDeliveryResult, anaJobsResult] = await Promise.all([
    db.rpc("ops2_ana_admin_load_v1"),
    db.from("whatsapp_channel_runtime_v1")
      .select("whatsapp_account_id,ana_enabled,capture_enabled,send_enabled,outbound_provider,homologated_at")
      .order("updated_at", { ascending: false }),
    db.from("whatsapp_messages_v1")
      .select("whatsapp_account_id,status_current,sent_at,created_at")
      .eq("direction", "outbound")
      .eq("sender_kind", "ana_ai")
      .eq("provider", "meta")
      .order("created_at", { ascending: false })
      .limit(anaDeliverySampleLimit),
    db.from("whatsapp_ana_jobs_v1")
      .select("whatsapp_account_id,status,decision,reason,created_at")
      .eq("dry_run", false)
      .order("created_at", { ascending: false })
      .limit(20),
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
  const deliveryByAccount = new Map<string, { message_count: number; status_counts: Map<string, number>; last_message_at: string | null }>();
  for (const row of anaDeliveryResult.data || []) {
    const accountId = uuid(row.whatsapp_account_id);
    if (!accountId) continue;
    const aggregate = deliveryByAccount.get(accountId) || {
      message_count: 0,
      status_counts: new Map<string, number>(),
      last_message_at: null,
    };
    const status = clean(row.status_current, 40).toLowerCase() || "pending";
    aggregate.message_count += 1;
    aggregate.status_counts.set(status, (aggregate.status_counts.get(status) || 0) + 1);
    const messageAt = row.sent_at || row.created_at || null;
    if (messageAt && (!aggregate.last_message_at || Date.parse(String(messageAt)) > Date.parse(aggregate.last_message_at))) {
      aggregate.last_message_at = String(messageAt);
    }
    deliveryByAccount.set(accountId, aggregate);
  }
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
    decisions_available: !anaJobsResult.error,
    decisions: (anaJobsResult.data || []).map((row: any) => ({
      channel: clean(accountById.get(row.whatsapp_account_id)?.display_name || "", 120),
      status: clean(row.status, 40),
      decision: clean(row.decision, 60),
      reason: clean(row.reason, 240),
      created_at: row.created_at || null,
    })),
    delivery: {
      available: !anaDeliveryResult.error,
      sample_limit: anaDeliverySampleLimit,
      channels: channels.map((channel: any) => {
        const aggregate = deliveryByAccount.get(channel.id);
        return {
          id: channel.id,
          name: channel.name,
          phone_last4: channel.phone_last4,
          message_count: aggregate?.message_count || 0,
          status_counts: aggregate ? Object.fromEntries(aggregate.status_counts) : {},
          last_message_at: aggregate?.last_message_at || null,
        };
      }),
    },
    active: active.version ? {
      version: Number(active.version),
      created_at: active.created_at || null,
      published_by: actorName(activeVersion.actor_id),
      change_note: clean(activeVersion.change_note, 240),
    } : null,
    draft: Number.isSafeInteger(Number(draft.revision)) ? {
      revision: Number(draft.revision),
      configuration: draft.configuration && typeof draft.configuration === "object" ? draft.configuration : null,
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
      id: Number(item.id) || 0,
      version: Number(item.version) || 0,
      is_active: Boolean(active.id && item.id === active.id),
      published_by: actorName(item.actor_id),
      change_note: clean(item.change_note, 240),
      created_at: item.created_at || null,
    })),
    test_runs: tests.slice(0, 5).map((item: any) => ({
      id: uuid(item.id),
      draft_revision: Number(item.draft_revision) || 0,
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

async function whatsappConversationSendStatus(input: any) {
  const conversationId = uuid(input.conversation_id);
  const idempotencyKey = clean(input.idempotency_key, 120);
  if (!conversationId || !/^(admin-text|admin-media):[A-Za-z0-9._:-]{1,100}$/.test(idempotencyKey)) {
    return { error: "invalid_send_reference", status: 400 };
  }
  const result = await db.from("whatsapp_outbox_v1")
    .select("status,message_type,updated_at")
    .eq("conversation_id", conversationId)
    .eq("idempotency_key", idempotencyKey)
    .eq("purpose", "human_attendance")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return { status: "not_found" };
  return {
    status: clean(result.data.status, 40).toLowerCase(),
    message_type: clean(result.data.message_type, 30).toLowerCase(),
    updated_at: result.data.updated_at || null,
  };
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
    else if (req.method === "POST" && action === "whatsapp_conversation_message_statuses") result = await whatsappConversationMessageStatuses(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_send_status") result = await whatsappConversationSendStatus(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_send_text") result = await whatsappConversationSendText(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_send_media") result = await whatsappConversationSendMedia(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_media") result = await whatsappConversationMedia(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_favorite") result = await whatsappConversationFavorite(input);
    else if (req.method === "POST" && action === "whatsapp_conversation_order_override") result = await whatsappConversationOrderOverride(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_draft_load") result = await whatsappCampaignDraftLoad(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_draft_create") result = await whatsappCampaignDraftCreate(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_draft_update") result = await whatsappCampaignDraftUpdate(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_preview") result = await whatsappCampaignPreview(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_content_preview") result = await whatsappCampaignContentPreview(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_snapshot") result = await whatsappCampaignSnapshot(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_transition") result = await whatsappCampaignTransition(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_schedule") result = await whatsappCampaignSchedule(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_pause") result = await whatsappCampaignPause(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_cancel") result = await whatsappCampaignCancel(input);
    else if (req.method === "POST" && action === "whatsapp_campaign_manual_batch") result = await whatsappCampaignManualBatch(input);
    else if (req.method === "POST" && action === "whatsapp_ana_admin_save_draft") result = await whatsappAnaAdminSaveDraft(input);
    else if (req.method === "POST" && action === "whatsapp_ana_admin_test") result = await whatsappAnaAdminTest(input);
    else if (req.method === "POST" && action === "whatsapp_ana_admin_publish") result = await whatsappAnaAdminPublish(input);
    else if (req.method === "POST" && action === "whatsapp_ana_admin_rollback") result = await whatsappAnaAdminRollback(input);
    else if (req.method === "POST" && action === "whatsapp_ana_pause_channel") result = await whatsappAnaPauseChannel(input);
    else if (req.method === "POST" && action === "whatsapp_ana_admin_status") result = await whatsappAnaAdminStatus();
    else if (req.method === "POST" && action === "customer_lookup") result = await customerLookup(input);
    else if (req.method === "POST" && action === "customer_save") result = await customerSave(input);
    else if (req.method === "GET" && action === "baskets") {
      const status = ["active", "inactive", "all"].includes(input.status) ? input.status : "active";
      result = await basketList(status);
    }
    else if (req.method === "POST" && action === "quick_balance_lookup") result = await quickBalanceLookup(input);
    else if (req.method === "POST" && action === "quick_balance_save") result = await quickBalanceSave(input);
    else if (req.method === "GET" && action === "products") result = await productSearch(input);
    else if (req.method === "POST" && action === "product_save") result = await productSave(input);
    else if (req.method === "POST" && action === "product_set_active") result = await productSetActive(input);
    else if (req.method === "POST" && action === "product_set_most_sold") result = await productSetMostSold(input);
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
