import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUCKET = "daily-offer-status";
const IMAGE_TABLE = "da_offer_status_images_v1";
const IG_USER_ID = "17841451162237654";
const GRAPH_VERSION = "v27.0";
const OIDC_AUDIENCE = "dona-antonia-instagram-stories";
const GITHUB_REPOSITORY = "osvaldosereia/SUCEDOAN12";
const GITHUB_REPOSITORY_ID = "1079998602";
const GITHUB_REF = "refs/heads/main";
const GITHUB_WORKFLOW_REF = "osvaldosereia/SUCEDOAN12/.github/workflows/dona-antonia-instagram-stories.yml@refs/heads/main";
const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";
const MAX_IMAGE_BYTES = 100_000;
const EXPECTED_IMAGES = 8;
const EXPECTED_PRODUCTS = 48;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function safeText(value: unknown, limit = 400) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJwtPart(value: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function verifySupabaseCronToken(token: string): Promise<boolean> {
  if (token.length < 32 || token.length > 256) return false;
  const { data, error } = await db.rpc("da_instagram_automation_cron_authorized_v1", { p_token: token });
  return !error && data === true;
}

async function verifyGitHubOidcToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const header = decodeJwtPart(parts[0]);
    const claims = decodeJwtPart(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return false;

    const now = Math.floor(Date.now() / 1000);
    const issuedAt = Number(claims.iat || 0);
    const notBefore = Number(claims.nbf || 0);
    const expiresAt = Number(claims.exp || 0);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

    if (claims.iss !== OIDC_ISSUER || !audience.includes(OIDC_AUDIENCE)) return false;
    if (expiresAt < now || notBefore > now + 30 || issuedAt > now + 30 || now - issuedAt > 900) return false;
    if (claims.repository !== GITHUB_REPOSITORY) return false;
    if (String(claims.repository_id || "") !== GITHUB_REPOSITORY_ID) return false;
    if (claims.ref !== GITHUB_REF || claims.workflow_ref !== GITHUB_WORKFLOW_REF) return false;
    if (!["schedule", "workflow_dispatch"].includes(String(claims.event_name || ""))) return false;

    const keyResponse = await fetch(OIDC_JWKS_URL, { signal: AbortSignal.timeout(10000) });
    if (!keyResponse.ok) return false;
    const keySet = await keyResponse.json();
    const jwk = Array.isArray(keySet?.keys)
      ? keySet.keys.find((candidate: any) => candidate?.kid === header.kid && candidate?.kty === "RSA")
      : null;
    if (!jwk) return false;

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1]),
    );
  } catch {
    return false;
  }
}

function todayInCuiaba() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function isSundayInCuiaba() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Cuiaba",
    weekday: "short",
  }).format(new Date()) === "Sun";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getInstagramToken(): Promise<string> {
  const { data, error } = await db.rpc("da_offer_story_instagram_token_v1");
  if (error) throw new Error("Não foi possível ler a credencial do Instagram no Vault.");
  const token = safeText(data, 5000);
  if (!token || token.length < 40) throw new Error("A credencial do Instagram não está configurada no Vault.");
  return token;
}

async function graphRequest(
  method: "GET" | "POST",
  path: string,
  token: string,
  params?: Record<string, string>,
) {
  const url = new URL("https://graph.facebook.com/" + GRAPH_VERSION + "/" + path.replace(/^\/+/, ""));
  const init: RequestInit = {
    method,
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(10000),
  };

  if (method === "GET" && params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  } else if (method === "POST" && params) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) body.set(key, value);
    init.headers = { Authorization: "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded" };
    init.body = body.toString();
  }

  const response = await fetch(url, init);
  const raw = await response.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  return {
    ok: response.ok,
    status: response.status,
    data,
    error: safeText(data?.error?.message || "A API do Instagram não retornou uma resposta válida."),
  };
}

async function rpcBoolean(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error("Não foi possível registrar o estado da publicação.");
  return data === true;
}

async function markFailed(date: string, number: number, message: string) {
  await rpcBoolean("da_offer_story_mark_failed_v1", {
    p_offer_date: date,
    p_image_number: number,
    p_error: safeText(message, 500),
  });
}

async function markNeedsReview(date: string, number: number, message: string) {
  await rpcBoolean("da_offer_story_mark_review_v1", {
    p_offer_date: date,
    p_image_number: number,
    p_error: safeText(message, 500),
  });
}

async function processImage(
  date: string,
  number: number,
  path: string,
  token: string,
): Promise<{ number: number; status: string; detail?: string }> {
  const { data: claim, error: claimError } = await db.rpc("da_offer_story_claim_v1", {
    p_offer_date: date,
    p_image_number: number,
    p_source_path: path,
  });
  if (claimError || !claim) throw new Error("Não foi possível reservar a imagem " + number + " para publicação.");

  let action = safeText(claim.action, 40);
  let creationId = safeText(claim.creation_id, 120);

  if (action === "skip") return { number, status: "already_published" };
  if (action === "busy") return { number, status: "pending", detail: "A publicação já está em andamento." };
  if (action === "needs_review") {
    return { number, status: "needs_review", detail: safeText(claim.last_error || "", 300) };
  }
  if (action === "failed") {
    return { number, status: "failed", detail: safeText(claim.last_error || "", 300) };
  }

  if (action === "create") {
    let signedUrl = "";
    try {
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) throw new Error("Não foi possível criar o link temporário da imagem.");
      signedUrl = new URL(data.signedUrl, SUPABASE_URL).toString();
    } catch (error) {
      const detail = safeText(error instanceof Error ? error.message : "Falha no armazenamento.", 300);
      await markFailed(date, number, detail);
      return { number, status: "failed", detail };
    }

    let created;
    try {
      created = await graphRequest("POST", IG_USER_ID + "/media", token, {
        image_url: signedUrl,
        media_type: "STORIES",
      });
    } catch {
      const detail = "A chamada de criação do Story ficou sem confirmação; verificar antes de tentar novamente.";
      await markNeedsReview(date, number, detail);
      return { number, status: "needs_review", detail };
    }

    if (!created.ok) {
      if (created.status >= 500) {
        await markNeedsReview(date, number, created.error);
        return { number, status: "needs_review", detail: created.error };
      }
      await markFailed(date, number, created.error);
      return { number, status: "failed", detail: created.error };
    }

    creationId = safeText(created.data?.id, 120);
    if (!creationId) {
      const detail = "A Meta aceitou a criação, mas não retornou o identificador do contêiner.";
      await markNeedsReview(date, number, detail);
      return { number, status: "needs_review", detail };
    }

    try {
      const saved = await rpcBoolean("da_offer_story_container_created_v1", {
        p_offer_date: date,
        p_image_number: number,
        p_creation_id: creationId,
      });
      if (!saved) throw new Error("O estado do contêiner não foi salvo.");
    } catch {
      const detail = "O contêiner foi criado, mas não foi possível salvar seu identificador.";
      await markNeedsReview(date, number, detail);
      return { number, status: "needs_review", detail };
    }
    action = "check_container";
  }

  if (action !== "check_container" || !creationId) {
    return { number, status: "needs_review", detail: "Estado inesperado da publicação." };
  }

  let containerStatus = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    let statusResponse;
    try {
      statusResponse = await graphRequest("GET", creationId, token, { fields: "status_code" });
    } catch {
      return { number, status: "pending", detail: "A Meta ainda não confirmou o processamento da imagem." };
    }
    if (!statusResponse.ok) {
      if (statusResponse.status === 429 || statusResponse.status >= 500) {
        return { number, status: "pending", detail: "A Meta pediu para tentar novamente em seguida." };
      }
      await markNeedsReview(date, number, statusResponse.error);
      return { number, status: "needs_review", detail: statusResponse.error };
    }
    containerStatus = safeText(statusResponse.data?.status_code, 40).toUpperCase();
    if (containerStatus === "FINISHED") break;
    if (containerStatus === "ERROR" || containerStatus === "EXPIRED") {
      const detail = "A Meta não conseguiu processar a imagem (" + containerStatus + ").";
      await markFailed(date, number, detail);
      return { number, status: "failed", detail };
    }
    if (containerStatus !== "IN_PROGRESS") {
      return { number, status: "pending", detail: "A Meta ainda está processando a imagem." };
    }
    if (attempt < 3) await wait(1200);
  }

  if (containerStatus !== "FINISHED") {
    return { number, status: "pending", detail: "A Meta ainda está processando a imagem." };
  }

  let publishing: boolean;
  try {
    publishing = await rpcBoolean("da_offer_story_begin_publish_v1", {
      p_offer_date: date,
      p_image_number: number,
    });
  } catch {
    const detail = "Não foi possível confirmar a reserva antes da publicação.";
    await markNeedsReview(date, number, detail);
    return { number, status: "needs_review", detail };
  }
  if (!publishing) {
    const detail = "A reserva do contêiner mudou; verificar o estado antes de tentar novamente.";
    await markNeedsReview(date, number, detail);
    return { number, status: "needs_review", detail };
  }

  let published;
  try {
    published = await graphRequest("POST", IG_USER_ID + "/media_publish", token, {
      creation_id: creationId,
    });
  } catch {
    const detail = "A chamada de publicação ficou sem confirmação; verificar o Instagram antes de tentar novamente.";
    await markNeedsReview(date, number, detail);
    return { number, status: "needs_review", detail };
  }

  if (!published.ok) {
    await markNeedsReview(date, number, published.error);
    return { number, status: "needs_review", detail: published.error };
  }

  const storyId = safeText(published.data?.id, 120);
  if (!storyId) {
    const detail = "A publicação foi aceita, mas a Meta não retornou o identificador do Story.";
    await markNeedsReview(date, number, detail);
    return { number, status: "needs_review", detail };
  }

  try {
    const saved = await rpcBoolean("da_offer_story_mark_published_v1", {
      p_offer_date: date,
      p_image_number: number,
      p_story_id: storyId,
    });
    if (!saved) throw new Error("O identificador do Story não foi salvo.");
  } catch {
    const detail = "O Story foi publicado, mas não foi possível registrar seu identificador.";
    await markNeedsReview(date, number, detail);
    return { number, status: "needs_review", detail };
  }

  return { number, status: "published" };
}

async function publishDailyStories() {
  if (isSundayInCuiaba()) {
    return { ok: false, date: todayInCuiaba(), error: "sunday_disabled" };
  }

  const date = todayInCuiaba();
  const { data: row, error } = await db.from(IMAGE_TABLE)
    .select("offer_date,status,product_count,image_count,unpictured_count,image_paths")
    .eq("offer_date", date)
    .maybeSingle();

  if (error) throw new Error("Não foi possível consultar as imagens das ofertas.");
  if (!row || row.status !== "ready") {
    return { ok: false, date, error: "images_not_ready", current_status: safeText(row?.status || "missing", 40) };
  }

  const entries = Array.isArray(row.image_paths) ? row.image_paths : [];
  if (
    Number(row.product_count) !== EXPECTED_PRODUCTS ||
    Number(row.image_count) !== EXPECTED_IMAGES ||
    Number(row.unpictured_count) !== 0 ||
    entries.length !== EXPECTED_IMAGES
  ) {
    return {
      ok: false,
      date,
      error: "daily_offer_set_incomplete",
      product_count: Number(row.product_count || 0),
      image_count: Number(row.image_count || 0),
      unpictured_count: Number(row.unpictured_count || 0),
    };
  }

  const paths: Array<{ number: number; path: string }> = [];
  for (let number = 1; number <= EXPECTED_IMAGES; number++) {
    const expectedPath = date + "/ofertas-" + String(number).padStart(2, "0") + ".jpg";
    const entry = entries.find((candidate: any) => safeText(candidate?.path, 300) === expectedPath);
    const size = Number(entry?.size_bytes || 0);
    if (!entry || size < 1 || size > MAX_IMAGE_BYTES) {
      return { ok: false, date, error: "image_invalid", image_number: number };
    }
    paths.push({ number, path: expectedPath });
  }

  const token = await getInstagramToken();
  const items: Array<{ number: number; status: string; detail?: string }> = [];
  for (const image of paths) {
    try {
      items.push(await processImage(date, image.number, image.path, token));
    } catch (error) {
      items.push({
        number: image.number,
        status: "needs_review",
        detail: safeText(error instanceof Error ? error.message : "Falha inesperada.", 300),
      });
    }
  }

  const publishedCount = items.filter((item) => item.status === "published").length;
  const skippedCount = items.filter((item) => item.status === "already_published").length;
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const reviewCount = items.filter((item) => item.status === "needs_review").length;

  return {
    ok: pendingCount === 0 && failedCount === 0 && reviewCount === 0,
    date,
    expected_images: EXPECTED_IMAGES,
    published_count: publishedCount,
    skipped_count: skippedCount,
    pending_count: pendingCount,
    failed_count: failedCount,
    review_count: reviewCount,
    items,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: "server_config" }, 500);

  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const cronToken = (req.headers.get("x-da-instagram-cron-key") || "").trim();
  const authorized = bearer
    ? await verifyGitHubOidcToken(bearer)
    : cronToken ? await verifySupabaseCronToken(cronToken) : false;
  if (!authorized) return json({ ok: false, error: "scheduler_unauthorized" }, 401);

  try {
    const input = await req.json();
    if (safeText(input?.action, 40) !== "publish") return json({ ok: false, error: "invalid_action" }, 400);
    const result = await publishDailyStories();
    return json(result, 200);
  } catch (error) {
    return json({
      ok: false,
      error: "story_publication_failed",
      message: safeText(error instanceof Error ? error.message : "Falha ao processar os Stories.", 300),
    }, 500);
  }
});
