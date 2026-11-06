import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EXPECTED_ADMIN_CODE = (Deno.env.get("DONA_ADMIN_CODE") || "").trim();
const ALLOWED_ORIGINS = new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://donaantonia.com.br",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-admin-code, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function verifyAdminCode(supplied: string | null) {
  if (EXPECTED_ADMIN_CODE.length < 13 || EXPECTED_ADMIN_CODE.length > 128) return "not_configured";
  if (typeof supplied !== "string" || supplied.length !== EXPECTED_ADMIN_CODE.length) return "invalid";
  let mismatch = 0;
  for (let index = 0; index < EXPECTED_ADMIN_CODE.length; index += 1) {
    mismatch |= EXPECTED_ADMIN_CODE.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return mismatch === 0 ? "valid" : "invalid";
}

function parseMoney(value: unknown) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount > 0 && amount <= 9999999999.99
    ? Math.round(amount * 100) / 100
    : null;
}

function errorResponse(req: Request, error: string, message: string, status: number) {
  return json(req, { ok: false, error, message }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return errorResponse(req, "method_not_allowed", "Método não permitido.", 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return errorResponse(req, "server_config", "O serviço de cartões não está configurado.", 500);
  }

  const origin = req.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return errorResponse(req, "origin_not_allowed", "Origem não autorizada.", 403);
  }

  const adminStatus = verifyAdminCode(req.headers.get("x-admin-code"));
  if (adminStatus === "not_configured") {
    return errorResponse(req, "admin_auth_not_configured", "O código de acesso não está configurado.", 503);
  }
  if (adminStatus !== "valid") {
    return errorResponse(req, "admin_code_invalid", "Código de acesso inválido.", 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_body");
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse(req, "invalid_body", "Envie os dados da operação em JSON.", 400);
  }

  const action = clean(body.action, 40);

  try {
    if (action === "list") {
      const { data: cardRows, error: cardsError } = await db
        .from("admin_saved_cards_v1")
        .select("id,name,brand,initial_value,current_balance,created_at,updated_at")
        .order("created_at", { ascending: false });
      if (cardsError) return errorResponse(req, "cards_load_failed", "Não foi possível carregar os cartões.", 500);

      const cards = cardRows || [];
      if (!cards.length) return json(req, { ok: true, cards: [] });

      const ids = cards.map((card) => card.id);
      const { data: useRows, error: usesError } = await db
        .from("admin_saved_card_uses_v1")
        .select("id,card_id,amount,used_at")
        .in("card_id", ids)
        .order("used_at", { ascending: false })
        .limit(5000);
      if (usesError) return errorResponse(req, "cards_history_load_failed", "Não foi possível carregar o histórico.", 500);

      const usesByCard = new Map<string, Array<Record<string, unknown>>>();
      for (const use of useRows || []) {
        const list = usesByCard.get(use.card_id) || [];
        list.push(use);
        usesByCard.set(use.card_id, list);
      }
      return json(req, {
        ok: true,
        cards: cards.map((card) => ({ ...card, uses: usesByCard.get(card.id) || [] })),
      });
    }

    if (action === "create") {
      const name = clean(body.name, 120);
      const brand = clean(body.brand, 60);
      const password = String(body.password ?? "").trim().slice(0, 120);
      const initialValue = parseMoney(body.value);
      if (!name || !brand || !password || initialValue === null) {
        return errorResponse(req, "invalid_card", "Preencha nome, bandeira, valor e senha com dados válidos.", 400);
      }

      const { data, error } = await db
        .from("admin_saved_cards_v1")
        .insert({
          name,
          brand,
          initial_value: initialValue,
          current_balance: initialValue,
          card_password: password,
        })
        .select("id,name,brand,initial_value,current_balance,created_at,updated_at")
        .single();
      if (error) return errorResponse(req, "card_create_failed", "Não foi possível cadastrar o cartão.", 500);
      return json(req, { ok: true, card: data }, 201);
    }

    if (action === "reveal_password") {
      const cardId = uuid(body.card_id);
      if (!cardId) return errorResponse(req, "invalid_card", "Cartão inválido.", 400);
      const { data, error } = await db
        .from("admin_saved_cards_v1")
        .select("card_password")
        .eq("id", cardId)
        .maybeSingle();
      if (error) return errorResponse(req, "card_read_failed", "Não foi possível carregar a senha.", 500);
      if (!data) return errorResponse(req, "card_not_found", "Cartão não encontrado.", 404);
      return json(req, { ok: true, password: data.card_password });
    }

    if (action === "register_use") {
      const cardId = uuid(body.card_id);
      const amount = parseMoney(body.amount);
      const idempotencyKey = uuid(body.idempotency_key);
      if (!cardId) return errorResponse(req, "invalid_card", "Cartão inválido.", 400);
      if (amount === null) return errorResponse(req, "invalid_amount", "Informe um valor maior que zero.", 400);
      if (!idempotencyKey) return errorResponse(req, "invalid_idempotency_key", "Chave da operação inválida.", 400);

      const { data, error } = await db.rpc("register_admin_saved_card_use_v1", {
        p_card_id: cardId,
        p_amount: amount,
        p_idempotency_key: idempotencyKey,
      });
      if (error) {
        const detail = String(error.message || "");
        if (detail.includes("insufficient_balance")) return errorResponse(req, "insufficient_balance", "Valor maior que o saldo disponível.", 409);
        if (detail.includes("card_not_found")) return errorResponse(req, "card_not_found", "Cartão não encontrado.", 404);
        if (detail.includes("idempotency_key_conflict")) return errorResponse(req, "idempotency_key_conflict", "Operação já usada com outros dados. Atualize a página.", 409);
        if (detail.includes("invalid_amount")) return errorResponse(req, "invalid_amount", "Informe um valor válido, com até duas casas decimais.", 400);
        return errorResponse(req, "card_use_failed", "Não foi possível registrar o uso.", 500);
      }
      const usage = Array.isArray(data) ? data[0] : data;
      return json(req, { ok: true, usage });
    }

    return errorResponse(req, "unknown_action", "Operação desconhecida.", 400);
  } catch {
    return errorResponse(req, "unexpected_error", "Não foi possível concluir a operação.", 500);
  }
});