import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRODUCT_FIELDS = "id,firebase_key,sku,name,gtin,ncm,price,cost,stock,image_url,brand,category,subcategory,subsubcategory,packaging,supplier,unit,validity_date,gondola,shelf,is_active,is_whatsapp_active,physically_verified,updated_at";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const text = (value: unknown, max = 240) => String(value ?? "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);
const digits = (value: unknown, max = 32) => String(value ?? "").replace(/\D/g, "").slice(0, max);
const finite = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const isoDate = (value: unknown) => {
  const raw = text(value, 40);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

function cleanProduct(input: any, fallbackCode = "") {
  const gtin = digits(input?.gtin || input?.ean || fallbackCode);
  return {
    id: text(input?.id, 80) || null,
    firebase_key: text(input?.firebase_key || input?.firebaseKey, 160) || null,
    sku: text(input?.sku || input?.codigo, 120) || null,
    name: text(input?.name || input?.nome || input?.titulo, 300) || (gtin ? `EAN ${gtin}` : "Produto sem nome"),
    gtin: gtin || null,
    ncm: digits(input?.ncm, 16) || null,
    price: finite(input?.price ?? input?.preco),
    cost: finite(input?.cost ?? input?.preco_custo ?? input?.custo),
    stock: finite(input?.stock ?? input?.estoque),
    image_url: text(input?.image_url || input?.url_imagem || input?.imagem_url || input?.imagem, 1200) || null,
    brand: text(input?.brand || input?.marca, 160) || null,
    category: text(input?.category || input?.categoria, 160) || null,
    subcategory: text(input?.subcategory || input?.subcategoria, 160) || null,
    subsubcategory: text(input?.subsubcategory || input?.subsubcategoria, 160) || null,
    packaging: text(input?.packaging || input?.embalagem, 120) || null,
    supplier: text(input?.supplier || input?.fornecedor, 200) || null,
    unit: text(input?.unit || input?.unidade, 40) || null,
    validity_date: isoDate(input?.validity_date || input?.validade || input?.data_validade),
    gondola: text(input?.gondola ?? input?.["gôndola"], 80) || null,
    shelf: text(input?.shelf || input?.prateleira, 80) || null,
    fast_source: text(input?.fast_source, 60) || null,
  };
}

function cleanKnownRows(input: any) {
  const rows = Array.isArray(input) ? input.slice(0, 1000) : [];
  return rows.map((row: any) => {
    const code = digits(row?.code || row?.product?.gtin);
    const quantity = Math.max(0, Math.min(1000000, Math.trunc(Number(row?.quantity || 0))));
    return {
      key: text(row?.key, 180) || code,
      product_id: text(row?.product_id || row?.product?.id, 80) || null,
      code,
      name: text(row?.name || row?.product?.name || row?.product?.nome, 300) || (code ? `EAN ${code}` : "Produto"),
      quantity,
      last_scanned_at: text(row?.last_scanned_at, 80) || null,
      product: cleanProduct(row?.product || {}, code),
    };
  }).filter((row: any) => row.code && row.quantity > 0);
}

function cleanUnknownRows(input: any) {
  const rows = Array.isArray(input) ? input.slice(0, 1000) : [];
  return rows.map((row: any) => ({
    code: digits(row?.code),
    name: text(row?.name, 300) || null,
    quantity: Math.max(0, Math.min(1000000, Math.trunc(Number(row?.quantity || 0)))),
    status: text(row?.status, 40) || "checking",
    firebase_key: text(row?.firebase_key, 160) || null,
    first_scanned_at: text(row?.first_scanned_at, 80) || null,
    last_scanned_at: text(row?.last_scanned_at, 80) || null,
  })).filter((row: any) => row.code && row.quantity > 0);
}

async function ensureDiscoveredProduct(sb: any, userId: string, row: any) {
  const source = row?.product || {};
  const gtin = digits(source?.gtin || row?.code);
  if (!gtin) return row;

  const { data: existing } = await sb.from("products").select(PRODUCT_FIELDS).eq("gtin", gtin).limit(1).maybeSingle();
  if (existing) return { ...row, product_id: existing.id, product: { ...source, ...existing } };

  const payload = {
    firebase_key: source.firebase_key || null,
    sku: source.sku || null,
    name: source.name || `EAN ${gtin}`,
    gtin,
    ncm: source.ncm || null,
    price: source.price,
    cost: source.cost,
    stock: null,
    image_url: source.image_url || null,
    brand: source.brand || null,
    category: source.category || null,
    subcategory: source.subcategory || null,
    subsubcategory: source.subsubcategory || null,
    packaging: source.packaging || null,
    supplier: source.supplier || null,
    unit: source.unit || null,
    validity_date: source.validity_date || null,
    gondola: source.gondola || null,
    shelf: source.shelf || null,
    source_system: "inventory_fast_discovered",
    sync_status: "local",
    firebase_snapshot: source,
    is_whatsapp_active: false,
    is_active: false,
    physically_verified: false,
    metadata: { discovered_by: "inventory_fast_autosave_v1", discovered_by_user: userId },
  };

  const { data: inserted, error } = await sb.from("products").insert(payload).select(PRODUCT_FIELDS).single();
  if (error) {
    const { data: raced } = await sb.from("products").select(PRODUCT_FIELDS).eq("gtin", gtin).limit(1).maybeSingle();
    if (!raced) throw error;
    return { ...row, product_id: raced.id, product: { ...source, ...raced } };
  }
  return { ...row, product_id: inserted.id, product: { ...source, ...inserted } };
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
  const user = userData?.user;
  if (userError || !user?.id) return json({ ok: false, error: "invalid_user" }, 401);

  const { data: admin, error: adminError } = await sb.from("admin_users")
    .select("role,is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminError) return json({ ok: false, error: "admin_lookup_failed" }, 500);
  if (!admin?.is_active) return json({ ok: false, error: "admin_not_authorized" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const action = text(body?.action || "health", 40).toLowerCase();
  const deviceLabel = text(body?.device_label, 120) || "Browser";

  if (action === "health") return json({ ok: true, autosave_every_reads: 3 });

  if (action === "restore") {
    const { data, error } = await sb.from("inventory_fast_checkpoints")
      .select("id,device_label,operation_mode,scan_total,known_rows,unknown_rows,updated_at")
      .eq("user_id", user.id)
      .eq("device_label", deviceLabel)
      .is("closed_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json({ ok: false, error: "restore_failed", detail: error.message }, 400);
    return json({ ok: true, checkpoint: data || null });
  }

  if (admin.role === "viewer") return json({ ok: false, error: "read_only" }, 403);

  if (action === "record_unknown") {
    const ean = digits(body?.ean);
    const delta = Math.max(1, Math.min(1000, Math.trunc(Number(body?.delta || 1))));
    if (ean.length < 5) return json({ ok: false, error: "invalid_ean" }, 400);
    const { data, error } = await sb.rpc("record_unresolved_product_ean_v1", {
      p_ean: ean,
      p_user_id: user.id,
      p_delta: delta,
      p_source: "inventory_fast",
      p_metadata: { device_label: deviceLabel },
    });
    if (error) return json({ ok: false, error: "record_unknown_failed", detail: error.message }, 400);
    return json({ ok: true, item: data });
  }

  if (action === "checkpoint") {
    const mode = text(body?.mode, 20).toLowerCase();
    if (!["add", "balance"].includes(mode)) return json({ ok: false, error: "invalid_mode" }, 400);
    const scanTotal = Math.max(0, Math.min(10000000, Math.trunc(Number(body?.scan_total || 0))));
    let knownRows = cleanKnownRows(body?.known_rows);
    const unknownRows = cleanUnknownRows(body?.unknown_rows);

    const migrated: any[] = [];
    for (const row of knownRows) {
      try {
        const next = await ensureDiscoveredProduct(sb, user.id, row);
        migrated.push(next);
      } catch {
        migrated.push(row);
      }
    }
    knownRows = migrated;

    const { data: current, error: currentError } = await sb.from("inventory_fast_checkpoints")
      .select("id")
      .eq("user_id", user.id)
      .eq("device_label", deviceLabel)
      .is("closed_at", null)
      .limit(1)
      .maybeSingle();
    if (currentError) return json({ ok: false, error: "checkpoint_lookup_failed", detail: currentError.message }, 400);

    const values = {
      user_id: user.id,
      device_label: deviceLabel,
      operation_mode: mode,
      scan_total: scanTotal,
      known_rows: knownRows,
      unknown_rows: unknownRows,
      updated_at: new Date().toISOString(),
    };

    let saved: any = null;
    if (current?.id) {
      const { data, error } = await sb.from("inventory_fast_checkpoints").update(values).eq("id", current.id).select("id,operation_mode,scan_total,updated_at").single();
      if (error) return json({ ok: false, error: "checkpoint_update_failed", detail: error.message }, 400);
      saved = data;
    } else {
      const { data, error } = await sb.from("inventory_fast_checkpoints").insert(values).select("id,operation_mode,scan_total,updated_at").single();
      if (error) return json({ ok: false, error: "checkpoint_insert_failed", detail: error.message }, 400);
      saved = data;
    }

    return json({ ok: true, checkpoint: saved, known_rows: knownRows });
  }

  if (action === "complete") {
    const { error } = await sb.from("inventory_fast_checkpoints")
      .update({ closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("device_label", deviceLabel)
      .is("closed_at", null);
    if (error) return json({ ok: false, error: "checkpoint_complete_failed", detail: error.message }, 400);
    return json({ ok: true });
  }

  return json({ ok: false, error: "unknown_action" }, 400);
});
