import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const clean = (v: unknown, max = 500) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const validToken = (v: unknown) => /^[a-f0-9]{64}$/i.test(clean(v, 80));
const validUuid = (v: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v, 80));
const brl = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const DEFAULT_PHONE = "5565984491018";

const CATEGORY_GROUPS = [
  { id: "mercearia", label: "Mercearia", db: ["MERCEARIA BÁSICA", "CAFÉ DA MANHÃ", "BOLACHAS E BISCOITOS", "MACARRÃO E MOLHOS", "TEMPEROS", "CONFEITARIA", "BALAS E CHICLETES", "CHOCOLATES E DOCES", "MOLHOS E CONDIMENTOS", "SALGADINHOS E PETISCOS"] },
  { id: "limpeza", label: "Limpeza", db: ["LIMPEZA", "LAVANDERIA"] },
  { id: "higiene", label: "Higiene", db: ["HIGIENE", "SHAMPOO E CONDICIONADOR", "SABONETE", "BELEZA", "BEBÊ"] },
  { id: "bebidas", label: "Bebidas", db: ["SUCOS, REFRI E ENERGÉTICOS"] },
  { id: "casa-pet", label: "Casa e Pet", db: ["PETS"] },
] as const;

type Client = ReturnType<typeof createClient>;
type Session = {
  id: string;
  public_token: string;
  customer_id: string | null;
  conversation_id: string | null;
  cart_id: string | null;
  kind: string;
  title: string | null;
  status: string;
  expires_at: string;
  metadata: Record<string, unknown> | null;
};
type ProductRow = {
  id: string;
  name: string;
  price: number | string | null;
  image_url: string | null;
  category: string | null;
  brand: string | null;
  packaging: string | null;
  stock: number | string | null;
  is_offer: boolean | null;
  sort_order?: number | null;
};
type BasketItem = {
  product_id: string;
  name: string;
  image_url: string | null;
  packaging: string | null;
  price: number;
  stock: number | null;
  quantity: number;
  base_quantity: number;
  min_quantity: number;
  max_quantity: number;
  removable: boolean;
  quantity_editable: boolean;
  remove_unit_delta: number;
  add_unit_delta: number;
};

function productItem(p: ProductRow, index: number, quantity = 0) {
  return {
    product_id: p.id,
    rank: index + 1,
    reason: "Vitrine Dona Antônia",
    recommendation_score: 0,
    quantity,
    product: {
      id: p.id,
      name: p.name,
      price: Number(p.price || 0),
      image_url: p.image_url,
      category: p.category,
      brand: p.brand,
      packaging: p.packaging,
      stock: p.stock == null ? null : Number(p.stock),
      is_offer: Boolean(p.is_offer),
    },
  };
}

async function sessionByToken(sb: Client, token: string): Promise<Session | null> {
  if (!validToken(token)) return null;
  const { data, error } = await sb
    .from("catalog_sessions")
    .select("id,public_token,customer_id,conversation_id,cart_id,kind,title,status,expires_at,metadata")
    .eq("public_token", token)
    .maybeSingle();
  if (error) throw new Error("catalog_lookup_failed");
  if (!data || data.status !== "open" || new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data as Session;
}

async function phoneFor(sb: Client, conversationId: string | null) {
  if (!conversationId) return DEFAULT_PHONE;
  const { data } = await sb
    .from("conversations")
    .select("whatsapp_account:whatsapp_accounts(phone_e164)")
    .eq("id", conversationId)
    .maybeSingle();
  return digits((data as any)?.whatsapp_account?.phone_e164) || DEFAULT_PHONE;
}

async function publicProducts(sb: Client, mode = "home", value = "", limit = 18) {
  let q = sb
    .from("products")
    .select("id,name,price,image_url,category,brand,packaging,stock,is_offer,sort_order")
    .eq("physically_verified", true)
    .eq("is_active", true)
    .eq("is_whatsapp_active", true)
    .gt("stock", 0);

  if (mode === "search") {
    const term = clean(value, 80).replace(/[%_]/g, "");
    if (term.length < 2) return [];
    q = q.ilike("name", `%${term}%`);
  } else if (mode === "category") {
    const group = CATEGORY_GROUPS.find((x) => x.id === value);
    if (!group) return [];
    q = q.in("category", [...group.db]);
  }

  const { data, error } = await q
    .order("is_offer", { ascending: false })
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 40)));
  if (error) throw new Error("catalog_items_failed");
  return ((data || []) as ProductRow[]).map((p, i) => productItem(p, i, 0));
}

async function publicBaskets(sb: Client) {
  const { data, error } = await sb
    .from("basket_templates")
    .select("id,sku,name,base_price,image_url,sort_order")
    .eq("is_active", true)
    .eq("is_whatsapp_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(9);
  if (error) throw new Error("basket_list_failed");
  return (data || []).map((b: any) => ({
    id: b.id,
    sku: b.sku,
    name: b.name,
    price: Number(b.base_price || 0),
    image_url: b.image_url || null,
  }));
}

async function personalizedItems(sb: Client, sessionId: string) {
  const { data, error } = await sb
    .from("catalog_session_items")
    .select("product_id,rank,reason,recommendation_score,quantity,product:products(id,name,price,image_url,category,brand,packaging,stock,is_offer)")
    .eq("catalog_session_id", sessionId)
    .order("rank", { ascending: true });
  if (error) throw new Error("catalog_items_failed");
  return data || [];
}

async function basketDetail(sb: Client, basketId: string) {
  if (!validUuid(basketId)) throw new Error("invalid_basket");
  const [basketResult, itemsResult] = await Promise.all([
    sb
      .from("basket_templates")
      .select("id,name,base_price,image_url,description")
      .eq("id", basketId)
      .eq("is_active", true)
      .eq("is_whatsapp_active", true)
      .maybeSingle(),
    sb
      .from("basket_template_items")
      .select("product_id,quantity,removable,quantity_editable,remove_unit_delta,add_unit_delta,sort_order,product:products(id,name,image_url,packaging,price,stock)")
      .eq("basket_id", basketId)
      .order("sort_order", { ascending: true }),
  ]);

  if (basketResult.error || !basketResult.data) throw new Error("basket_not_found");
  if (itemsResult.error) throw new Error("basket_items_failed");

  const items: BasketItem[] = (itemsResult.data || []).map((x: any) => {
    const base = Math.max(0, Math.trunc(Number(x.quantity || 0)));
    const rawStock = x.product?.stock;
    const stock =
      rawStock === null || rawStock === undefined || rawStock === ""
        ? null
        : Math.max(0, Math.floor(Number(rawStock) || 0));

    // Itens legados de cesta ainda podem não ter estoque migrado.
    // Neles, não bloqueamos a personalização: o teto operacional é 99.
    const max = stock === null ? 99 : Math.max(base, stock);
    const price = Number(x.product?.price || 0);
    const removeDelta = Number(x.remove_unit_delta ?? price ?? 0) || 0;
    const addDelta = Number(x.add_unit_delta ?? price ?? 0) || 0;

    return {
      product_id: String(x.product_id),
      name: clean(x.product?.name || "Produto", 140),
      image_url: x.product?.image_url || null,
      packaging: x.product?.packaging || null,
      price,
      stock,
      quantity: base,
      base_quantity: base,
      min_quantity: 0,
      max_quantity: max,
      removable: true,
      quantity_editable: true,
      remove_unit_delta: removeDelta,
      add_unit_delta: addDelta,
    };
  });

  const b = basketResult.data as any;
  return {
    id: b.id,
    name: b.name,
    price: Number(b.base_price || 0),
    base_price: Number(b.base_price || 0),
    image_url: b.image_url || null,
    description: b.description || null,
    items,
    selection: items.map((x) => ({ product_id: x.product_id, quantity: x.quantity })),
  };
}

function normalizeBasketSelection(basket: Awaited<ReturnType<typeof basketDetail>>, raw: unknown) {
  if (!Array.isArray(raw)) throw new Error("basket_selection_invalid");
  const requested = new Map<string, number>();
  for (const entry of raw) {
    const id = clean((entry as any)?.product_id, 80);
    const q = Number((entry as any)?.quantity);
    if (!validUuid(id) || !Number.isInteger(q) || q < 0) throw new Error("invalid_quantity");
    if (requested.has(id)) throw new Error("duplicate_product");
    requested.set(id, q);
  }
  if (requested.size !== basket.items.length) throw new Error("basket_selection_incomplete");

  return basket.items.map((item) => {
    if (!requested.has(item.product_id)) throw new Error("basket_selection_incomplete");
    const quantity = requested.get(item.product_id)!;
    if (quantity < 0 || quantity > item.max_quantity) throw new Error("stock_insufficient");
    return { ...item, quantity, changed: quantity !== item.base_quantity };
  });
}

function basketTotal(basePrice: number, rows: ReturnType<typeof normalizeBasketSelection>) {
  let total = Number(basePrice || 0);
  for (const x of rows) {
    if (x.quantity < x.base_quantity) {
      total -= (x.base_quantity - x.quantity) * Number(x.remove_unit_delta || 0);
    } else if (x.quantity > x.base_quantity) {
      total += (x.quantity - x.base_quantity) * Number(x.add_unit_delta || 0);
    }
  }
  return Math.max(0, Math.round((total + Number.EPSILON) * 100) / 100);
}

async function validatedLooseOrder(sb: Client, raw: unknown) {
  if (!Array.isArray(raw) || !raw.length) throw new Error("empty_cart");
  if (raw.length > 100) throw new Error("too_many_items");

  const quantities = new Map<string, number>();
  for (const entry of raw) {
    const id = clean((entry as any)?.product_id, 80);
    const q = Number((entry as any)?.quantity);
    if (!validUuid(id) || !Number.isInteger(q) || q <= 0) throw new Error("invalid_quantity");
    quantities.set(id, Math.min(q, 999));
  }

  const ids = [...quantities.keys()];
  const { data, error } = await sb
    .from("products")
    .select("id,name,price,stock,is_active,is_whatsapp_active,physically_verified")
    .in("id", ids);
  if (error) throw new Error("cart_products_failed");

  const byId = new Map<string, any>((data || []).map((p: any) => [String(p.id), p]));
  const lines: { product_id: string; name: string; quantity: number; price: number }[] = [];

  for (const id of ids) {
    const p = byId.get(id);
    if (!p || !p.is_active || !p.is_whatsapp_active || !p.physically_verified) throw new Error("product_unavailable");
    const quantity = quantities.get(id)!;
    const stock = p.stock == null ? null : Math.max(0, Math.floor(Number(p.stock) || 0));
    if (stock !== null && quantity > stock) throw new Error("stock_insufficient");
    lines.push({
      product_id: id,
      name: clean(p.name || "Produto", 140),
      quantity,
      price: Number(p.price || 0),
    });
  }

  const total = Math.round(
    (lines.reduce((sum, x) => sum + x.quantity * x.price, 0) + Number.EPSILON) * 100,
  ) / 100;
  return { lines, total };
}

async function bestEffortEvent(
  sb: Client,
  session: Session | null,
  eventType: string,
  eventData: Record<string, unknown>,
) {
  if (!session?.id) return;
  try {
    await sb.from("catalog_events").insert({
      catalog_session_id: session.id,
      customer_id: session.customer_id,
      event_type: eventType,
      event_data: eventData,
    });
  } catch {
    // Telemetria nunca pode impedir o cliente de continuar para o WhatsApp.
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "server_config" }, 500);

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const action = clean(body?.action || "open_public", 40).toLowerCase();
  const token = clean(body?.token, 80);

  try {
    if (action === "open_public") {
      const [items, basketRows] = await Promise.all([
        publicProducts(sb, "home", "", 18),
        publicBaskets(sb),
      ]);
      return json({
        ok: true,
        session: { title: "Produtos", kind: "browse", public_guest: true, shopping_mode: "catalog_first" },
        items,
        baskets: basketRows,
        categories: CATEGORY_GROUPS.map(({ id, label }) => ({ id, label })),
        cart: null,
        whatsapp_url: `https://wa.me/${DEFAULT_PHONE}?text=${encodeURIComponent("Olá! Vim pela vitrine da Dona Antônia.")}`,
      });
    }

    if (action === "browse") {
      const mode = clean(body?.mode || "all", 20);
      const value = clean(body?.value, 100);
      const items = await publicProducts(sb, mode === "popular" ? "home" : mode, value, mode === "popular" ? 18 : 30);
      return json({ ok: true, items });
    }

    if (action === "basket_detail") {
      return json({ ok: true, basket: await basketDetail(sb, clean(body?.basket_id, 80)) });
    }

    if (action === "basket_quote") {
      const basket = await basketDetail(sb, clean(body?.basket_id, 80));
      const normalized = normalizeBasketSelection(basket, body?.selection);
      const total = basketTotal(basket.base_price, normalized);
      return json({
        ok: true,
        total,
        selection: normalized.map((x) => ({ product_id: x.product_id, quantity: x.quantity })),
      });
    }

    if (action === "basket_interest") {
      const basket = await basketDetail(sb, clean(body?.basket_id, 80));
      const normalized = normalizeBasketSelection(basket, body?.selection);
      const kept = normalized.filter((x) => x.quantity > 0);
      if (!kept.length) return json({ ok: false, error: "basket_empty" }, 400);
      const total = basketTotal(basket.base_price, normalized);
      const session = await sessionByToken(sb, token);
      const phone = await phoneFor(sb, session?.conversation_id || null);
      const orderRef = String(Date.now()).slice(-6);
      const title = /cesta/i.test(basket.name) ? basket.name : `Cesta ${basket.name}`;
      const itemsTxt = kept.map((x) => `${x.quantity}x ${x.name}`).join("\n");
      const message =
        `*PEDIDO #${orderRef}*\n\n*CESTA:* ${title}\n\n*ITENS:*\n${itemsTxt}\n\n*TOTAL: ${brl(total)}*`;
      const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

      // A URL é calculada primeiro; falha de telemetria não invalida o pedido.
      await bestEffortEvent(sb, session, "basket_interest", {
        order_ref: orderRef,
        basket_id: basket.id,
        basket_name: basket.name,
        total,
        selection: normalized.map((x) => ({ product_id: x.product_id, quantity: x.quantity })),
        customized: normalized.some((x) => x.changed),
        source: "catalogo_vitrine",
      });

      return json({
        ok: true,
        order_ref: orderRef,
        total,
        whatsapp_url: whatsappUrl,
      });
    }

    if (action === "return_whatsapp") {
      const order = await validatedLooseOrder(sb, body?.items);
      const session = await sessionByToken(sb, token);
      const phone = await phoneFor(sb, session?.conversation_id || null);
      const orderRef = String(Date.now()).slice(-6);
      const itemsTxt = order.lines.map((x) => `${x.quantity}x ${x.name}`).join("\n");
      const message =
        `*PEDIDO #${orderRef}*\n\n*ITENS:*\n${itemsTxt}\n\n*TOTAL: ${brl(order.total)}*`;
      const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

      await bestEffortEvent(sb, session, "catalog_checkout_return", {
        order_ref: orderRef,
        total: order.total,
        items: order.lines.map((x) => ({ product_id: x.product_id, name: x.name, quantity: x.quantity })),
        source: "catalogo_vitrine",
      });

      return json({ ok: true, order_ref: orderRef, total: order.total, whatsapp_url: whatsappUrl });
    }

    const session = await sessionByToken(sb, token);
    if (!session) return json({ ok: false, error: "catalog_unavailable" }, 404);

    if (action === "open") {
      const isPublicGuest = session.metadata?.public_guest === true;
      const [items, basketRows, cart] = await Promise.all([
        isPublicGuest ? publicProducts(sb, "home", "", 18) : personalizedItems(sb, session.id),
        isPublicGuest ? publicBaskets(sb) : Promise.resolve([]),
        session.cart_id
          ? sb.from("carts").select("id,total,status,version").eq("id", session.cart_id).maybeSingle().then((r) => r.data || null)
          : Promise.resolve(null),
      ]);
      const phone = await phoneFor(sb, session.conversation_id);
      return json({
        ok: true,
        token: session.public_token,
        session: {
          title: session.title,
          kind: session.kind,
          expires_at: session.expires_at,
          public_guest: isPublicGuest,
          shopping_mode: (session.metadata as any)?.shopping_mode || null,
        },
        items,
        baskets: basketRows,
        categories: isPublicGuest ? CATEGORY_GROUPS.map(({ id, label }) => ({ id, label })) : [],
        cart,
        whatsapp_url: `https://wa.me/${phone}?text=${encodeURIComponent("Olá! Vim pela vitrine da Dona Antônia.")}`,
      });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const error = clean((e as Error)?.message || "server_error", 120);
    const status = [
      "invalid_basket",
      "basket_selection_invalid",
      "basket_selection_incomplete",
      "invalid_quantity",
      "duplicate_product",
      "stock_insufficient",
      "empty_cart",
      "too_many_items",
      "product_unavailable",
      "basket_empty",
    ].includes(error)
      ? 400
      : error === "basket_not_found"
        ? 404
        : 500;
    return json({ ok: false, error }, status);
  }
});
