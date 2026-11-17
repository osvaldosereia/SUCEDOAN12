import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { Image } from "jsr:@matmen/imagescript@3.20.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_CODE = (Deno.env.get("DONA_ADMIN_CODE") || "").trim();
const BUCKET = "daily-offer-status";
const AUTOMATIONS = "da_instagram_automations_v1";
const JOBS = "da_instagram_jobs_v1";
const ITEMS = "da_instagram_job_items_v1";
const EVENTS = "da_instagram_job_events_v1";
const STORY_JOBS = "da_offer_story_publications_v1";
const IG_USER_ID = "17841451162237654";
const GRAPH_VERSION = "v27.0";
const OIDC_AUDIENCE = "dona-antonia-instagram-stories";
const GITHUB_REPOSITORY = "osvaldosereia/SUCEDOAN12";
const GITHUB_REPOSITORY_ID = "1079998602";
const GITHUB_REF = "refs/heads/main";
const GITHUB_WORKFLOW_REF = "osvaldosereia/SUCEDOAN12/.github/workflows/dona-antonia-instagram-stories.yml@refs/heads/main";
const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";
const LOGO_URL = "https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/img/logoantonia5.png";
const FONT_URL = "https://raw.githubusercontent.com/google/fonts/7af0d90b4d532ffa4b041937b560c6df4e7b1e95/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf";
const ALLOWED_IMAGE_HOSTS = new Set(["raw.githubusercontent.com", "ssbesxgaijknwsjbsbcz.supabase.co"]);
const ALLOWED_ORIGINS = new Set(["https://donaantonia.com.br", "https://www.donaantonia.com.br"]);
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function safeText(value: unknown, limit = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
function safeCaption(value: unknown) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim().slice(0, 2200);
}
function xml(value: unknown, limit = 240) {
  return safeText(value, limit).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function money(value: unknown) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function json(req: Request, body: unknown, status = 200) {
  const origin = req.headers.get("origin") || "";
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://donaantonia.com.br",
      "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-admin-code",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}
function verifyAdminCode(supplied: string | null): "valid" | "invalid" | "not_configured" {
  if (ADMIN_CODE.length < 13 || ADMIN_CODE.length > 128) return "not_configured";
  if (typeof supplied !== "string" || supplied.length !== ADMIN_CODE.length) return "invalid";
  let mismatch = 0;
  for (let index = 0; index < ADMIN_CODE.length; index += 1) {
    mismatch |= ADMIN_CODE.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return mismatch === 0 ? "valid" : "invalid";
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
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== OIDC_ISSUER || !audiences.includes(OIDC_AUDIENCE)) return false;
    if (expiresAt < now || notBefore > now + 30 || issuedAt > now + 30 || now - issuedAt > 900) return false;
    if (claims.repository !== GITHUB_REPOSITORY || String(claims.repository_id || "") !== GITHUB_REPOSITORY_ID) return false;
    if (claims.ref !== GITHUB_REF || claims.workflow_ref !== GITHUB_WORKFLOW_REF || !["schedule", "workflow_dispatch"].includes(String(claims.event_name || ""))) return false;
    const keyResponse = await fetch(OIDC_JWKS_URL, { signal: AbortSignal.timeout(10000) });
    if (!keyResponse.ok) return false;
    const keySet = await keyResponse.json();
    const jwk = Array.isArray(keySet?.keys) ? keySet.keys.find((candidate: any) => candidate?.kid === header.kid && candidate?.kty === "RSA") : null;
    if (!jwk) return false;
    const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  } catch {
    return false;
  }
}
function dateInCuiaba(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}
function addDays(dateValue: string, days: number) {
  const date = new Date(dateValue + "T12:00:00-04:00");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function weekdayInCuiaba(date = new Date()) {
  const value = new Intl.DateTimeFormat("en-US", { timeZone: "America/Cuiaba", weekday: "short" }).format(date);
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[value] || 0;
}
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function getInstagramToken(): Promise<string> {
  const { data, error } = await db.rpc("da_offer_story_instagram_token_v1");
  if (error) throw new Error("A credencial do Instagram não pôde ser lida do Vault.");
  const token = safeText(data, 5000);
  if (!token || token.length < 40) throw new Error("A credencial do Instagram não está configurada no Vault.");
  return token;
}
async function graphRequest(method: "GET" | "POST", path: string, token: string, params?: Record<string, string>) {
  const url = new URL("https://graph.facebook.com/" + GRAPH_VERSION + "/" + path.replace(/^\/+/, ""));
  const init: RequestInit = { method, headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(15000) };
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
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  return { ok: response.ok, status: response.status, data, error: safeText(data?.error?.message || "A API do Instagram não retornou uma resposta válida.", 300) };
}
async function getPublishingQuota(token: string) {
  const response = await graphRequest("GET", IG_USER_ID + "/content_publishing_limit", token, { fields: "quota_usage,config" });
  if (!response.ok) throw new Error("Não foi possível consultar o limite atual de publicações do Instagram: " + response.error);
  const entry = Array.isArray(response.data?.data) ? response.data.data[0] : null;
  const quota = entry?.config || entry || {};
  const usage = Number(entry?.quota_usage ?? quota?.quota_usage);
  const total = Number(quota?.quota_total);
  if (!Number.isFinite(usage) || !Number.isFinite(total) || total < 1) {
    throw new Error("A Meta não retornou a cota de publicações necessária para liberar a automação.");
  }
  return { usage, total, remaining: Math.max(0, total - usage) };
}
async function getAccountHealth() {
  try {
    const token = await getInstagramToken();
    const [profile, quota] = await Promise.all([
      graphRequest("GET", IG_USER_ID, token, { fields: "username,account_type" }),
      getPublishingQuota(token),
    ]);
    return {
      connected: true,
      username: profile.ok ? safeText(profile.data?.username, 80) : "",
      account_type: profile.ok ? safeText(profile.data?.account_type, 40) : "",
      profile_error: profile.ok ? "" : profile.error,
      quota,
    };
  } catch (error) {
    return { connected: false, error: safeText(error instanceof Error ? error.message : "A conta não respondeu.", 240), quota: null };
  }
}
async function addEvent(jobId: string, eventType: string, message: string, details: Record<string, unknown> = {}) {
  await db.from(EVENTS).insert({ job_id: jobId, event_type: eventType, message: safeText(message, 500), details });
}
async function updateJob(jobId: string, patch: Record<string, unknown>) {
  const { error } = await db.from(JOBS).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (error) throw new Error("Não foi possível salvar o andamento da publicação.");
}
async function updateItem(jobId: string, itemNumber: number, patch: Record<string, unknown>) {
  const { error } = await db.from(ITEMS).update({ ...patch, updated_at: new Date().toISOString() })
    .eq("job_id", jobId).eq("item_number", itemNumber);
  if (error) throw new Error("Não foi possível salvar o andamento do item da publicação.");
}
async function selectDailyOffers() {
  const { data, error } = await db.rpc("da_offer_rotation_admin_v1", { p_action: "get", p_payload: {} });
  if (error) throw new Error("Não foi possível consultar as ofertas automáticas do dia.");
  const date = safeText(data?.config?.today || dateInCuiaba(), 10);
  const raw = Array.isArray(data?.offers) ? data.offers : [];
  const offers = raw.filter((item: any) => item && item.id && item.name && item.image_url
    && Number(item.price) > 0 && Number(item.offer_price) > 0 && Number(item.offer_price) < Number(item.price));
  return { date, offers, config: data?.config || {} };
}
function defaultCaption(format: string) {
  if (format === "carousel") return "Deslize para conferir ofertas da Dona Antônia. Peça pelo WhatsApp 65 99815-0975. Entrega grátis a partir de R$ 75 em Cuiabá e Várzea Grande.";
  return "Oferta da Dona Antônia! Peça pelo WhatsApp 65 99815-0975. Entrega grátis a partir de R$ 75 em Cuiabá e Várzea Grande.";
}
function buildCaption(template: string, products: any[], date: string, format: string) {
  const product = products[0] || {};
  const base = safeCaption(template) || defaultCaption(format);
  return base
    .replaceAll("{{loja}}", "Dona Antônia")
    .replaceAll("{{whatsapp}}", "65 99815-0975")
    .replaceAll("{{entrega_minima}}", "R$ 75")
    .replaceAll("{{data}}", date)
    .replaceAll("{{produto}}", safeText(product.name || "ofertas do dia", 120))
    .replaceAll("{{preco}}", money(product.offer_price))
    .slice(0, 2200);
}
async function fetchBytes(urlValue: unknown, allowed: Set<string>, maxBytes: number, kind: "image" | "font" = "image") {
  const url = new URL(String(urlValue || ""));
  if (url.protocol !== "https:" || !allowed.has(url.hostname.toLowerCase())) throw new Error("Uma imagem está fora das origens permitidas.");
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Imagem indisponível (HTTP " + response.status + ").");
  const finalUrl = new URL(response.url || url.toString());
  if (finalUrl.protocol !== "https:" || !allowed.has(finalUrl.hostname.toLowerCase())) throw new Error("A origem de uma imagem foi redirecionada para um endereço não permitido.");
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (kind === "image" && !["image/png", "image/jpeg", "image/webp"].includes(contentType)) throw new Error("Uma imagem não está em PNG, JPEG ou WebP.");
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new Error("Um arquivo de imagem ultrapassa o limite permitido.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytes) throw new Error("Um arquivo de imagem está vazio ou é grande demais.");
  return bytes;
}
function wrapName(value: unknown, maxChars = 24, maxLines = 3) {
  const words = safeText(value, 240).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? current + " " + word : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else current = next;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[.…]*$/, "") + "…";
  }
  return lines;
}
async function renderFeedCard(product: any, index: number, total: number, date: string, logoBytes: Uint8Array, fontBytes: Uint8Array) {
  const photo = await fetchBytes(product.image_url, ALLOWED_IMAGE_HOSTS, 8 * 1024 * 1024, "image");
  const images: Record<string, Uint8Array> = { "brand.png": logoBytes, "product.img": photo };
  const original = Number(product.price || 0);
  const offer = Number(product.offer_price || 0);
  const discount = Math.max(0, Math.round(original > 0 ? (1 - offer / original) * 100 : 0));
  const name = wrapName(product.name, 24, 3).map((line, lineIndex) =>
    '<text x="540" y="' + (900 + lineIndex * 58) + '" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="46" font-weight="700" fill="#302820">' + xml(line) + "</text>"
  ).join("");
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Cuiaba", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(date + "T12:00:00-04:00"));
  const pageLabel = total > 1 ? '<text x="1000" y="1295" text-anchor="end" font-family="Roboto, Arial, sans-serif" font-size="24" font-weight="700" fill="#ffffff">' + (index + 1) + " / " + total + "</text>" : "";
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">',
    '<rect width="1080" height="1350" fill="#f4eee5"/>',
    '<image href="brand.png" x="305" y="26" width="470" height="103" preserveAspectRatio="xMidYMid meet"/>',
    '<text x="540" y="180" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="52" font-weight="800" fill="#7e3029">OFERTAS DO DIA</text>',
    '<text x="540" y="222" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="23" fill="#71665b">' + xml(dateLabel) + '</text>',
    '<rect x="84" y="260" width="912" height="545" rx="40" fill="#fffdf9" stroke="#e7d7c5" stroke-width="4"/>',
    '<rect x="106" y="283" width="164" height="50" rx="14" fill="#c9382f"/>',
    '<text x="188" y="317" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="24" font-weight="800" fill="#ffffff">-' + discount + '%</text>',
    '<image href="product.img" x="164" y="344" width="752" height="410" preserveAspectRatio="xMidYMid meet"/>',
    name,
    '<text x="540" y="1100" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="30" fill="#796e63">De ' + xml(money(original)) + '</text>',
    '<line x1="380" y1="1080" x2="700" y2="1080" stroke="#c9382f" stroke-width="3"/>',
    '<text x="540" y="1172" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="60" font-weight="800" fill="#842f28">Por ' + xml(money(offer)) + '</text>',
    '<rect x="34" y="1210" width="1012" height="112" rx="24" fill="#7e3029"/>',
    '<text x="540" y="1257" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="27" font-weight="700" fill="#ffffff">Entrega grátis a partir de R$ 75 · WhatsApp 65 99815-0975</text>',
    pageLabel,
    "</svg>",
  ].join("");
  const image = await Image.renderSVG(svg, { images, fonts: [fontBytes] });
  const bytes = await image.resize({ width: 1080 }).encodeJPEG({ quality: 82 });
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("A arte gerada excedeu o limite de imagem do Instagram.");
  return bytes;
}
async function createAsset(job: any, product: any, number: number, total: number, logoBytes: Uint8Array, fontBytes: Uint8Array) {
  const bytes = await renderFeedCard(product, number - 1, total, safeText(job.source_date, 10), logoBytes, fontBytes);
  const path = "instagram/" + job.id + "/" + String(number).padStart(2, "0") + ".jpg";
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (error) throw new Error("Não foi possível salvar a arte para publicação.");
  return path;
}
async function signedAsset(path: string) {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("Não foi possível liberar a imagem para o Instagram.");
  return data.signedUrl;
}
async function pollContainer(creationId: string, token: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const status = await graphRequest("GET", creationId, token, { fields: "status_code" });
    if (!status.ok) {
      if (status.status === 429 || status.status >= 500) return "PENDING";
      return "ERROR";
    }
    const code = safeText(status.data?.status_code, 40).toUpperCase();
    if (code === "FINISHED") return "FINISHED";
    if (code === "ERROR" || code === "EXPIRED") return "ERROR";
    if (code !== "IN_PROGRESS") return "PENDING";
    if (attempt < 5) await wait(2000);
  }
  return "PENDING";
}
async function materializeJobItems(job: any, products: any[]) {
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const { error } = await db.from(ITEMS).upsert({
      job_id: job.id,
      item_number: index + 1,
      product_id: product.id,
      product_name: safeText(product.name, 180),
      status: "queued",
      updated_at: new Date().toISOString(),
    }, { onConflict: "job_id,item_number", ignoreDuplicates: true });
    if (error) throw new Error("Não foi possível preparar os itens da publicação.");
  }
}
async function ensureJobAssets(job: any, products: any[]) {
  const { data: existing, error } = await db.from(ITEMS).select("*").eq("job_id", job.id).order("item_number");
  if (error) throw new Error("Não foi possível consultar os arquivos da publicação.");
  const logoPromise = fetchBytes(LOGO_URL, new Set(["raw.githubusercontent.com"]), 2 * 1024 * 1024, "image");
  const fontPromise = fetchBytes(FONT_URL, new Set(["raw.githubusercontent.com"]), 2 * 1024 * 1024, "font");
  const [logoBytes, fontBytes] = await Promise.all([logoPromise, fontPromise]);
  for (let index = 0; index < products.length; index += 1) {
    const itemNumber = index + 1;
    const row = (existing || []).find((item: any) => Number(item.item_number) === itemNumber);
    if (row?.asset_path && row.status !== "failed") continue;
    const path = await createAsset(job, products[index], itemNumber, products.length, logoBytes, fontBytes);
    await updateItem(job.id, itemNumber, { asset_path: path, status: "asset_ready", last_error: null });
    await addEvent(job.id, "asset_ready", "Arte " + itemNumber + " gerada.", { item_number: itemNumber, path });
  }
  await updateJob(job.id, { status: "assets_ready", last_error: null });
}
async function prepareProducts(job: any) {
  const required = job.content_format === "feed" ? 1 : Number(job.products_per_post);
  let products = Array.isArray(job.selected_products) ? job.selected_products : [];
  if (products.length !== required || !job.source_date) {
    const snapshot = await selectDailyOffers();
    if (snapshot.offers.length < required) throw new Error("Há somente " + snapshot.offers.length + " ofertas com foto; são necessárias " + required + ".");
    products = [...snapshot.offers].sort(() => Math.random() - 0.5).slice(0, required);
    if (products.length !== required) throw new Error("Não foi possível selecionar produtos suficientes.");
    const finalCaption = buildCaption(job.caption, products, snapshot.date, job.content_format);
    await updateJob(job.id, {
      source_date: snapshot.date,
      selected_products: products,
      caption: finalCaption,
    });
    job.source_date = snapshot.date;
    job.selected_products = products;
    job.caption = finalCaption;
    await addEvent(job.id, "products_selected", products.length + " produto(s) selecionado(s) nas ofertas do dia.", { source_date: snapshot.date, product_ids: products.map((item: any) => item.id) });
    await materializeJobItems(job, products);
  }
  return products;
}
async function postFeedOrCarousel(job: any, token: string) {
  const requestedCount = job.content_format === "feed" ? 1 : Number(job.products_per_post);
  const quota = await getPublishingQuota(token);
  if (quota.remaining < 1) {
    await updateJob(job.id, { status: "pending", last_error: "A cota diária de publicação do Instagram está cheia.", result: { quota_usage: quota.usage, quota_total: quota.total } });
    await addEvent(job.id, "quota_wait", "A publicação aguardará a liberação de cota da Meta.", { quota_usage: quota.usage, quota_total: quota.total });
    return "pending";
  }
  const products = await prepareProducts(job);
  if (products.length < requestedCount) throw new Error("A seleção de produtos ficou incompleta.");
  await materializeJobItems(job, products);
  await ensureJobAssets(job, products);
  const { data: itemRows, error: itemsError } = await db.from(ITEMS).select("*").eq("job_id", job.id).order("item_number");
  if (itemsError || !itemRows?.length) throw new Error("Os arquivos da publicação não foram encontrados.");
  const items = itemRows.slice(0, requestedCount);
  let creationId = safeText(job.meta_creation_id, 120);

  if (job.content_format === "feed") {
    if (!creationId) {
      const imageUrl = await signedAsset(safeText(items[0].asset_path, 300));
      const created = await graphRequest("POST", IG_USER_ID + "/media", token, { image_url: imageUrl, caption: safeCaption(job.caption) });
      if (!created.ok || !created.data?.id) throw new Error("A Meta não criou a publicação de Feed: " + created.error);
      creationId = safeText(created.data.id, 120);
      await updateJob(job.id, { status: "container_created", meta_creation_id: creationId, last_error: null });
      await updateItem(job.id, 1, { creation_id: creationId, status: "container_created" });
      await addEvent(job.id, "container_created", "Contêiner de Feed criado na Meta.", { creation_id: creationId });
    }
  } else {
    const childIds: string[] = [];
    for (const item of items) {
      let childId = safeText(item.creation_id, 120);
      if (!childId) {
        const imageUrl = await signedAsset(safeText(item.asset_path, 300));
        const created = await graphRequest("POST", IG_USER_ID + "/media", token, { image_url: imageUrl, is_carousel_item: "true" });
        if (!created.ok || !created.data?.id) throw new Error("A Meta não criou a página " + item.item_number + " do carrossel: " + created.error);
        childId = safeText(created.data.id, 120);
        await updateItem(job.id, Number(item.item_number), { creation_id: childId, status: "container_created", last_error: null });
      }
      childIds.push(childId);
      const childStatus = await pollContainer(childId, token);
      if (childStatus === "ERROR") throw new Error("A Meta não conseguiu processar a página " + item.item_number + " do carrossel.");
      if (childStatus !== "FINISHED") {
        await updateJob(job.id, { status: "pending", last_error: "A Meta ainda está processando as páginas do carrossel." });
        return "pending";
      }
    }
    if (!creationId) {
      const children = childIds;
      if (children.length !== requestedCount) throw new Error("O carrossel não possui todas as páginas.");
      const created = await graphRequest("POST", IG_USER_ID + "/media", token, {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption: safeCaption(job.caption),
      });
      if (!created.ok || !created.data?.id) throw new Error("A Meta não criou o contêiner do carrossel: " + created.error);
      creationId = safeText(created.data.id, 120);
      await updateJob(job.id, { status: "container_created", meta_creation_id: creationId, last_error: null });
      await addEvent(job.id, "container_created", "Contêiner do carrossel criado na Meta.", { creation_id: creationId, item_count: children.length });
    }
  }

  const containerStatus = await pollContainer(creationId, token);
  if (containerStatus === "ERROR") throw new Error("A Meta não conseguiu processar a publicação.");
  if (containerStatus !== "FINISHED") {
    await updateJob(job.id, { status: "pending", last_error: "A Meta ainda está processando a publicação." });
    return "pending";
  }

  await updateJob(job.id, { status: "publishing", last_error: null });
  await addEvent(job.id, "publishing", "A publicação foi enviada para a Meta.");
  let published;
  try {
    published = await graphRequest("POST", IG_USER_ID + "/media_publish", token, { creation_id: creationId });
  } catch (error) {
    const message = safeText(error instanceof Error ? error.message : "A resposta da Meta ficou inconclusiva.", 300);
    await updateJob(job.id, { status: "needs_review", last_error: "A confirmação da Meta ficou inconclusiva. Confira o Instagram antes de repetir." });
    await addEvent(job.id, "needs_review", "Não foi possível confirmar se a Meta publicou o item.", { detail: message });
    return "needs_review";
  }
  if (!published.ok || !published.data?.id) {
    if (published.status === 429) {
      await updateJob(job.id, { status: "pending", last_error: published.error });
      await addEvent(job.id, "quota_wait", "A Meta pediu para aguardar antes de publicar.", { status: published.status });
      return "pending";
    }
    if (published.status >= 500) {
      await updateJob(job.id, { status: "needs_review", last_error: "A resposta da Meta ficou inconclusiva. Confira o Instagram antes de repetir." });
      await addEvent(job.id, "needs_review", "A Meta não confirmou o resultado da publicação.", { status: published.status, detail: published.error });
      return "needs_review";
    }
    throw new Error("A Meta recusou a publicação: " + published.error);
  }
  const mediaId = safeText(published.data.id, 120);
  await updateJob(job.id, {
    status: "published",
    meta_media_id: mediaId,
    published_at: new Date().toISOString(),
    last_error: null,
    result: { item_count: requestedCount },
  });
  await db.from(ITEMS).update({ status: "published", meta_media_id: mediaId, published_at: new Date().toISOString(), last_error: null })
    .eq("job_id", job.id);
  await db.from(AUTOMATIONS).update({ last_run_at: new Date().toISOString() }).eq("id", job.automation_id);
  await addEvent(job.id, "published", job.content_format === "carousel" ? "Carrossel publicado no Instagram." : "Imagem publicada no Feed do Instagram.", { media_id: mediaId });
  return "published";
}
async function postStories(job: any, oidcToken: string, token: string) {
  const quota = await getPublishingQuota(token);
  if (quota.remaining < 8) {
    await updateJob(job.id, { status: "pending", last_error: "A cota atual não comporta as oito imagens de Stories.", result: { quota_usage: quota.usage, quota_total: quota.total } });
    await addEvent(job.id, "quota_wait", "Os Stories aguardam cota suficiente da Meta.", { quota_usage: quota.usage, quota_total: quota.total, required: 8 });
    return "pending";
  }
  const response = await fetch(SUPABASE_URL + "/functions/v1/publish-daily-offer-instagram-stories-v1", {
    method: "POST",
    headers: { Authorization: "Bearer " + oidcToken, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "publish" }),
    signal: AbortSignal.timeout(240000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error === "github_oidc_unauthorized") throw new Error("O publicador de Stories não aceitou a chamada agendada.");
  const date = safeText(result?.date || dateInCuiaba(), 10);
  const { data: storyRows } = await db.from(STORY_JOBS).select("image_number,status,story_id,last_error,published_at")
    .eq("offer_date", date).order("image_number");
  if (storyRows?.length) {
    for (const row of storyRows) {
      await db.from(ITEMS).upsert({
        job_id: job.id,
        item_number: Number(row.image_number),
        product_name: "Imagem " + row.image_number + " dos Stories de ofertas",
        status: row.status === "published" ? "published" : row.status === "needs_review" ? "needs_review" : row.status === "failed" ? "failed" : "queued",
        meta_media_id: row.story_id,
        last_error: row.last_error,
        published_at: row.published_at,
        updated_at: new Date().toISOString(),
      }, { onConflict: "job_id,item_number" });
    }
  }
  const publishedCount = Number(result?.published_count || 0);
  const skippedCount = Number(result?.skipped_count || 0);
  const pendingCount = Number(result?.pending_count || 0);
  const failedCount = Number(result?.failed_count || 0);
  const reviewCount = Number(result?.review_count || 0);
  const imagesNotReady = result?.error === "images_not_ready";
  const status = reviewCount ? "needs_review" : failedCount ? "failed" : pendingCount || imagesNotReady ? "pending" :
    (publishedCount + skippedCount >= 8 ? "published" : "failed");
  const error = imagesNotReady
    ? "As imagens de hoje ainda não estão prontas."
    : result?.error === "sunday_disabled"
    ? "Stories diários não são publicados aos domingos."
    : safeText(result?.error || "", 300);
  await updateJob(job.id, {
    status,
    source_date: date,
    result: { published_count: publishedCount, skipped_count: skippedCount, pending_count: pendingCount, failed_count: failedCount, review_count: reviewCount },
    last_error: status === "published" ? null : (error || (reviewCount ? "Há itens que precisam de conferência." : failedCount ? "Alguns Stories falharam." : "A publicação ainda está pendente.")),
    published_at: status === "published" ? new Date().toISOString() : null,
  });
  await db.from(AUTOMATIONS).update({ last_run_at: new Date().toISOString() }).eq("id", job.automation_id);
  await addEvent(job.id, status, status === "published" ? "As oito imagens de Stories foram publicadas ou já estavam publicadas." : "Resultado do envio dos Stories.", { date, published_count: publishedCount, skipped_count: skippedCount, pending_count: pendingCount, failed_count: failedCount, review_count: reviewCount });
  return status;
}
async function processClaimedJob(job: any, oidcToken: string, token: string) {
  if (Number(job.attempt_count || 0) > 12) {
    await updateJob(job.id, { status: "failed", last_error: "A execução ultrapassou o limite de tentativas." });
    await addEvent(job.id, "failed", "A execução ultrapassou o limite de tentativas.");
    return "failed";
  }
  if (job.content_format === "story") return await postStories(job, oidcToken, token);
  return await postFeedOrCarousel(job, token);
}
async function runScheduled(oidcToken: string) {
  const { data: materialized, error: materializeError } = await db.rpc("da_instagram_materialize_due_v1", { p_now: new Date().toISOString() });
  if (materializeError) throw new Error("Não foi possível localizar os horários de publicação.");
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await db.from(JOBS).update({
    status: "needs_review",
    last_error: "Uma execução ficou interrompida. Confira o Instagram antes de repetir.",
    updated_at: new Date().toISOString(),
  }).eq("status", "running").lt("updated_at", staleBefore);
  const expiredBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await db.from(JOBS).update({
    status: "failed",
    last_error: "O horário de publicação expirou sem confirmação.",
    updated_at: new Date().toISOString(),
  }).in("status", ["queued", "pending", "assets_ready", "container_created"]).lt("scheduled_for", expiredBefore);
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await db.from(JOBS).select("*")
    .in("status", ["queued", "pending", "assets_ready", "container_created"])
    .gte("scheduled_for", cutoff)
    .order("scheduled_for", { ascending: true })
    .limit(8);
  if (error) throw new Error("Não foi possível carregar as publicações pendentes.");
  const output: Array<Record<string, unknown>> = [];
  for (const candidate of pending || []) {
    const { data: claimed, error: claimError } = await db.from(JOBS).update({
      status: "running",
      attempt_count: Number(candidate.attempt_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", candidate.id).in("status", ["queued", "pending", "assets_ready", "container_created"]).select("*").maybeSingle();
    if (claimError || !claimed) continue;
    await addEvent(claimed.id, "started", "A automação começou a processar esta publicação.", { run_kind: claimed.run_kind });
    try {
      const token = await getInstagramToken();
      const status = await processClaimedJob(claimed, oidcToken, token);
      output.push({ job_id: claimed.id, status });
    } catch (error) {
      const message = safeText(error instanceof Error ? error.message : "Falha ao processar a publicação.", 300);
      const { data: currentJob } = await db.from(JOBS).select("status").eq("id", claimed.id).maybeSingle();
      const targetStatus = currentJob?.status === "publishing" ? "needs_review" : "failed";
      await updateJob(claimed.id, {
        status: targetStatus,
        last_error: targetStatus === "needs_review" ? "A confirmação da Meta ficou inconclusiva. Confira o Instagram antes de repetir." : message,
      });
      await addEvent(claimed.id, targetStatus, message);
      output.push({ job_id: claimed.id, status: targetStatus, error: message });
    }
  }
  return { ok: true, materialized: Array.isArray(materialized) ? materialized.length : 0, processed: output.length, items: output };
}
function parseDays(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  const days = [...new Set(list.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 1 && item <= 7))].sort((a, b) => a - b);
  if (!days.length) throw new Error("Escolha pelo menos um dia da semana.");
  return days;
}
function parseTimes(value: unknown) {
  const raw = Array.isArray(value) ? value.map(String).join(",") : String(value || "");
  const times = [...new Set(raw.split(/[,\n;]+/).map((value) => value.trim()).filter(Boolean))].sort();
  if (!times.length || times.length > 8) throw new Error("Informe de 1 a 8 horários.");
  for (const time of times) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || Number(time.slice(3)) % 5 !== 0) {
      throw new Error("Use horários de cinco em cinco minutos, por exemplo 07:05, 12:00.");
    }
  }
  return times;
}
async function getDashboard() {
  const [automationResult, jobsResult, offerResult, storyResult] = await Promise.all([
    db.from(AUTOMATIONS).select("*").neq("status", "archived").order("created_at", { ascending: true }),
    db.from(JOBS).select("*").order("scheduled_for", { ascending: false }).limit(100),
    db.rpc("da_offer_rotation_admin_v1", { p_action: "get", p_payload: {} }),
    db.from(STORY_JOBS).select("offer_date,image_number,status,story_id,last_error,published_at,updated_at")
      .gte("offer_date", addDays(dateInCuiaba(), -30)).order("offer_date", { ascending: false }).order("image_number"),
  ]);
  if (automationResult.error || jobsResult.error) throw new Error("Não foi possível carregar o gerenciador do Instagram.");
  const jobs = jobsResult.data || [];
  const jobIds = jobs.map((job: any) => job.id);
  let items: any[] = [];
  let events: any[] = [];
  if (jobIds.length) {
    const [itemResult, eventResult] = await Promise.all([
      db.from(ITEMS).select("job_id,item_number,product_name,asset_path,meta_media_id,status,last_error,published_at")
        .in("job_id", jobIds).order("item_number"),
      db.from(EVENTS).select("job_id,event_type,message,created_at")
        .in("job_id", jobIds).order("created_at", { ascending: true }).limit(1000),
    ]);
    if (!itemResult.error) items = itemResult.data || [];
    if (!eventResult.error) events = eventResult.data || [];
  }
  const itemsByJob: Record<string, any[]> = {};
  const eventsByJob: Record<string, any[]> = {};
  for (const item of items) (itemsByJob[item.job_id] ||= []).push(item);
  for (const event of events) (eventsByJob[event.job_id] ||= []).push(event);
  const jobsWithItems = jobs.map((job: any) => ({
    ...job,
    items: itemsByJob[job.id] || [],
    events: eventsByJob[job.id] || [],
  }));
  const counts = {
    active: (automationResult.data || []).filter((item: any) => item.status === "active").length,
    published_7d: jobs.filter((job: any) => job.status === "published" && Date.now() - new Date(job.published_at || job.updated_at).getTime() <= 7 * 86400000).length,
    pending: jobs.filter((job: any) => ["queued", "running", "pending", "assets_ready", "container_created", "publishing"].includes(job.status)).length,
    attention: jobs.filter((job: any) => ["failed", "needs_review"].includes(job.status)).length,
  };
  const offers = offerResult.error ? [] : (Array.isArray(offerResult.data?.offers) ? offerResult.data.offers : []);
  return {
    ok: true,
    automations: automationResult.data || [],
    jobs: jobsWithItems,
    story_history: storyResult.error ? [] : (storyResult.data || []),
    counts,
    offer_count: offers.filter((item: any) => item && item.image_url && Number(item.offer_price) > 0).length,
    account: await getAccountHealth(),
  };
}
async function saveAutomation(input: any) {
  const name = safeText(input.name, 80);
  const format = safeText(input.content_format, 20);
  if (name.length < 2 || !["story", "feed", "carousel"].includes(format)) throw new Error("Informe um nome e um formato válido.");
  const days = parseDays(input.schedule_days);
  const times = parseTimes(input.schedule_times);
  const products = format === "story" ? 48 : format === "feed" ? 1 : Number(input.products_per_post || 5);
  if (!Number.isInteger(products) || (format === "carousel" && (products < 2 || products > 10))) {
    throw new Error("O carrossel deve ter de 2 a 10 produtos.");
  }
  const caption = safeCaption(input.caption_template);
  const status = input.active === false ? "paused" : "active";
  if (format === "story" && status === "active") {
    if (days.includes(7)) throw new Error("Os Stories diários de ofertas não são publicados aos domingos.");
    if (times.length !== 1) throw new Error("Escolha somente um horário para o conjunto diário de 8 Stories.");
    let otherStories = db.from(AUTOMATIONS).select("id").eq("content_format", "story").eq("status", "active");
    if (input.id) otherStories = otherStories.neq("id", safeText(input.id, 36));
    const { data: activeStories, error: activeStoryError } = await otherStories.limit(1);
    if (activeStoryError) throw new Error("Não foi possível validar outra automação de Stories ativa.");
    if (activeStories?.length) throw new Error("Mantenha apenas uma automação ativa para os 8 Stories das ofertas do dia.");
  }
  const patch = {
    name,
    content_format: format,
    source_type: "daily_offers",
    status,
    schedule_days: days,
    schedule_times: times,
    time_zone: "America/Cuiaba",
    products_per_post: products,
    caption_template: caption,
    updated_at: new Date().toISOString(),
  };
  const id = safeText(input.id, 36);
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Identificador de automação inválido.");
  if (id) {
    const { data, error } = await db.from(AUTOMATIONS).update(patch).eq("id", id).select("*").maybeSingle();
    if (error || !data) throw new Error("Não foi possível atualizar essa automação.");
    return { ok: true, automation: data };
  }
  const { data, error } = await db.from(AUTOMATIONS).insert({
    ...patch,
    automation_key: "custom-" + crypto.randomUUID(),
  }).select("*").single();
  if (error || !data) throw new Error("Não foi possível criar essa automação.");
  return { ok: true, automation: data };
}
async function runNow(input: any) {
  const id = safeText(input.id, 36);
  const { data: automation, error: lookupError } = await db.from(AUTOMATIONS).select("*").eq("id", id).neq("status", "archived").maybeSingle();
  if (lookupError || !automation) throw new Error("Automação não encontrada.");
  const { data, error } = await db.from(JOBS).insert({
    automation_id: automation.id,
    automation_name: automation.name,
    content_format: automation.content_format,
    source_type: automation.source_type,
    scheduled_for: new Date().toISOString(),
    run_kind: "manual",
    products_per_post: automation.products_per_post,
    caption: automation.caption_template,
    status: "queued",
  }).select("id,status").single();
  if (error || !data) throw new Error("Não foi possível colocar a publicação na fila.");
  await addEvent(data.id, "queued", "Publicação solicitada manualmente pelo admin.");
  return { ok: true, job: data };
}
async function toggleAutomation(input: any) {
  const id = safeText(input.id, 36);
  const status = input.active === true ? "active" : "paused";
  const { data: current, error: lookupError } = await db.from(AUTOMATIONS).select("*").eq("id", id).neq("status", "archived").maybeSingle();
  if (lookupError || !current) throw new Error("Automação não encontrada.");
  if (status === "active" && current.content_format === "story") {
    if ((current.schedule_days || []).includes(7)) throw new Error("Os Stories diários de ofertas não são publicados aos domingos.");
    if ((current.schedule_times || []).length !== 1) throw new Error("Escolha somente um horário para o conjunto diário de 8 Stories.");
    const { data: otherStories, error: activeError } = await db.from(AUTOMATIONS).select("id")
      .eq("content_format", "story").eq("status", "active").neq("id", id).limit(1);
    if (activeError) throw new Error("Não foi possível validar outra automação de Stories ativa.");
    if (otherStories?.length) throw new Error("Mantenha apenas uma automação ativa para os 8 Stories das ofertas do dia.");
  }
  const { data, error } = await db.from(AUTOMATIONS).update({ status, updated_at: new Date().toISOString() }).eq("id", id).neq("status", "archived").select("*").maybeSingle();
  if (error || !data) throw new Error("Não foi possível atualizar o status.");
  return { ok: true, automation: data };
}
async function archiveAutomation(input: any) {
  const id = safeText(input.id, 36);
  const { data, error } = await db.from(AUTOMATIONS).update({
    status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", id).neq("status", "archived").select("*").maybeSingle();
  if (error || !data) throw new Error("Não foi possível arquivar essa automação.");
  return { ok: true };
}
async function retryJob(input: any) {
  const id = safeText(input.id, 36);
  const { data: job, error } = await db.from(JOBS).select("*").eq("id", id).maybeSingle();
  if (error || !job) throw new Error("Publicação não encontrada.");
  if (job.status !== "failed") throw new Error("Somente uma publicação com falha confirmada pode ser tentada novamente. Confira os itens pendentes antes de repetir.");
  await db.from(ITEMS).update({ creation_id: null, status: "asset_ready", last_error: null, updated_at: new Date().toISOString() }).eq("job_id", id);
  const { error: updateError } = await db.from(JOBS).update({
    status: "queued", meta_creation_id: null, meta_media_id: null, last_error: null,
    attempt_count: 0, published_at: null, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "failed");
  if (updateError) throw new Error("Não foi possível enfileirar novamente.");
  await addEvent(id, "retry_queued", "A publicação com falha foi colocada novamente na fila.");
  return { ok: true };
}
async function manage(req: Request, input: any) {
  const action = safeText(input.action, 40);
  if (action === "dashboard") return await getDashboard();
  if (action === "save_automation") return await saveAutomation(input);
  if (action === "toggle_automation") return await toggleAutomation(input);
  if (action === "archive_automation") return await archiveAutomation(input);
  if (action === "run_now") return await runNow(input);
  if (action === "retry_job") return await retryJob(input);
  throw new Error("Ação do gerenciador não reconhecida.");
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json(req, { ok: true });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { ok: false, error: "server_config" }, 500);
  let input: any = {};
  try { input = await req.json(); } catch { return json(req, { ok: false, error: "invalid_json" }, 400); }
  const action = safeText(input?.action, 40);
  if (action === "run_scheduled") {
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer || !(await verifyGitHubOidcToken(bearer))) return json(req, { ok: false, error: "github_oidc_unauthorized" }, 401);
    try { return json(req, await runScheduled(bearer)); }
    catch (error) { return json(req, { ok: false, error: safeText(error instanceof Error ? error.message : "Falha no agendador.", 300) }, 500); }
  }
  const origin = req.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { ok: false, error: "origin_not_allowed" }, 403);
  const auth = verifyAdminCode(req.headers.get("x-admin-code"));
  if (auth !== "valid") return json(req, { ok: false, error: auth === "not_configured" ? "admin_auth_not_configured" : "admin_code_invalid" }, auth === "not_configured" ? 503 : 401);
  try { return json(req, await manage(req, input)); }
  catch (error) { return json(req, { ok: false, error: safeText(error instanceof Error ? error.message : "Falha ao processar a solicitação.", 300) }, 400); }
});