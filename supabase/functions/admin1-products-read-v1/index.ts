import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { ADMIN_PRODUCT_COLUMNS, parseCatalogRequest } from "./read-contract.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const PRODUCT_SELECT = ADMIN_PRODUCT_COLUMNS.join(",");
const ASSIGNMENT_CATEGORIES = ["Mercearia", "Limpeza e lavanderia", "Higiene e beleza", "Casa e pet"];
const ALLOWED_ORIGINS = new Set(["https://donaantonia.com.br", "https://www.donaantonia.com.br"]);

function cors(req) {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

async function productRows(query) {
  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: Number(count || 0) };
}

async function products(params) {
  const { data, error } = await db.rpc("admin1_products_page_v1", {
    p_limit: params.limit,
    p_offset: params.offset,
    p_query: params.q,
    p_category: params.category,
    p_status: params.status,
    p_stock: params.stock
  });
  if (error) throw error;
  return data;
}

async function product(productId) {
  const result = await productRows(db.from("products").select(PRODUCT_SELECT).eq("id", productId).limit(1));
  const row = result.data[0];
  if (!row) return { ok: true, product: null };
  const { data: stock, error } = await db.rpc("basket_component_fresh_sellable_stock_v1", { p_product_id: productId });
  if (error) throw error;
  return { ok: true, product: { ...row, stock } };
}

async function matches(params) {
  const queries = [];
  if (params.gtins.length) queries.push(db.from("products").select(PRODUCT_SELECT).in("gtin", params.gtins));
  if (params.skus.length) queries.push(db.from("products").select(PRODUCT_SELECT).in("sku", params.skus));
  const results = await Promise.all(queries.map(productRows));
  const productsById = new Map();
  for (const result of results) for (const row of result.data) productsById.set(String(row.id), row);
  return { ok: true, products: [...productsById.values()] };
}

async function categories() {
  const values = new Set();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const result = await productRows(db.from("products").select("category").order("category").range(offset, offset + pageSize - 1));
    for (const row of result.data) {
      const value = String(row.category || "").trim();
      if (value) values.add(value);
    }
    if (result.data.length < pageSize) break;
  }
  return {
    ok: true,
    categories: [...values].sort((a, b) => a.localeCompare(b, "pt-BR")),
    assignment_categories: ASSIGNMENT_CATEGORIES
  };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const parsed = parseCatalogRequest(req);
  if (!parsed.ok) return json(req, { ok: false, error: parsed.error }, parsed.status);
  try {
    if (parsed.action === "health") return json(req, { ok: true, service: "admin1-products-read-v1", mode: "read-only" });
    if (parsed.action === "products") return json(req, await products(parsed.params));
    if (parsed.action === "product") return json(req, await product(parsed.params.product_id));
    if (parsed.action === "matches") return json(req, await matches(parsed.params));
    if (parsed.action === "categories") return json(req, await categories());
    return json(req, { ok: false, error: "read_action_not_allowed" }, 400);
  } catch (error) {
    console.error("admin1-products-read-v1", error);
    return json(req, { ok: false, error: "catalog_read_failed" }, 500);
  }
});

