import postgres, { type Sql } from "npm:postgres@3.4.7";
import { wakeOutboxWorker } from "../_shared/outbox-dispatch.ts";
import { flowEndpointUri, flowPrivateKey, metaAccessToken, metaGraphVersion } from "../_shared/meta-config.ts";
import { supabasePublishableKey, supabaseSecretKey } from "../_shared/supabase-api-keys.ts";
import {
  classifyBlingSaleReconciliation,
  reconcileBlingCommercialTotals,
  type BlingCommercialTotals,
  type BlingSaleReconciliationOutcome,
} from "../../../src/domain/bling.ts";
import { validateCatalog, type Basket, type CatalogDocuments, type Product } from "../../../src/domain/catalog.ts";
import { WHATSAPP_CHANNEL_PATTERN, whatsappChannelFromPhone, type WhatsAppChannel } from "../../../src/domain/channels.ts";
import { quoteBasket, type BasketSelections } from "../../../src/domain/flow-runtime.ts";
import type { OutboxMessageType, OutboxStatus } from "../../../src/domain/outbox.ts";
import {
  FLOW_CHANNELS,
  validateBasketFlow,
  validateChannelFlowDocument,
  type ChannelFlowDocument,
  type FlowChannel,
} from "../../../src/domain/flows.ts";

const OWNER = "osvaldosereia";
const REPOSITORY = "SUCEDOAN12";
const BRANCH = "project/whatsapp-atendimento-github-20261025";
const PRODUCTS_PATH = "projetos/whatsapp-atendimento-github/catalog/products.json";
const BASKETS_PATH = "projetos/whatsapp-atendimento-github/catalog/baskets.json";
const IMAGE_PREFIX = "projetos/whatsapp-atendimento-github/images/products/";
const FLOWS_PATH = "projetos/whatsapp-atendimento-github/flows";
const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const MAX_IMAGE_BYTES = 27 * 1024;
const MAX_PENDING_IMAGES = 61;
const MAX_FLOW_DRAFT_BYTES = 150_000;
const OUTBOX_RECENT_LIMIT = 50;
const ORDER_ID = /^[0-9a-f-]{36}$/i;
const CHANNEL_PATTERN = WHATSAPP_CHANNEL_PATTERN;
const BLING_API = "https://api.bling.com.br/Api/v3";
const BLING_AUTHORIZE_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const BLING_TOKEN_URL = `${BLING_API}/oauth/token`;
let orderDatabase: Sql | null = null;

interface Operator {
  id: string;
  app_metadata?: { provider?: string; providers?: string[] };
  identities?: Array<{ provider?: string }>;
}

interface GitHubResponse {
  json: unknown;
  response: Response;
}

interface ImageInput {
  productId: string;
  contentBase64: string;
}

interface SaveInput {
  expectedCommit: string;
  products: CatalogDocuments["products"];
  baskets: CatalogDocuments["baskets"];
  images?: ImageInput[];
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function configuredList(name: string): string[] {
  return (Deno.env.get(name) ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function jsonResponse(payload: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders });
}

function corsHeaders(origin: string): Headers {
  const origins = configuredList("ADMIN_ALLOWED_ORIGINS");
  if (!origin || !origins.includes(origin)) throw new HttpError(403, "Origem não autorizada.");

  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, PATCH, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, apikey, content-type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  });
}

async function authorize(request: Request): Promise<{ operator: Operator; headers: Headers }> {
  const headers = corsHeaders(request.headers.get("Origin") ?? "");
  const allowedUsers = configuredList("ADMIN_ALLOWED_USER_IDS");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = supabasePublishableKey();
  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!allowedUsers.length || !supabaseUrl || !publishableKey) {
    throw new HttpError(503, "Acesso administrativo ainda não foi configurado no servidor.");
  }
  if (!accessToken) throw new HttpError(401, "Entre com sua conta GitHub autorizada.");

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new HttpError(401, "Sessão inválida ou expirada.");

  const operator = await response.json() as Operator;
  const hasGitHubIdentity = Array.isArray(operator.identities)
    && operator.identities.some((identity) => identity.provider === "github");
  if (!operator.id || !hasGitHubIdentity || operator.app_metadata?.provider !== "github" || !allowedUsers.includes(operator.id)) {
    throw new HttpError(403, "Esta conta não está autorizada a administrar o catálogo.");
  }
  return { operator, headers };
}

function supabaseFunctionUrl(slug: string): URL {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  if (!base || !/^[a-z0-9-]+$/.test(slug)) throw new HttpError(503, "O atendimento não está configurado no servidor.");
  return new URL(`${base}/functions/v1/${slug}`);
}

async function forwardSupabaseFunction(
  request: Request,
  slug: string,
  method: "GET" | "POST",
  query?: URLSearchParams,
  body?: unknown,
): Promise<{ payload: unknown; status: number }> {
  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const publishableKey = supabasePublishableKey();
  if (!accessToken || !publishableKey) throw new HttpError(503, "O atendimento não está configurado no servidor.");
  const endpoint = supabaseFunctionUrl(slug);
  if (query) endpoint.search = query.toString();
  const headers = new Headers({ Authorization: `Bearer ${accessToken}`, apikey: publishableKey });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(endpoint, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let payload: unknown = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { error: "attendance_backend_invalid_response" }; }
  return { payload, status: response.status };
}

async function requireSupportedAttendanceAccount(request: Request, accountId: string): Promise<WhatsAppChannel> {
  if (!ORDER_ID.test(accountId)) throw new HttpError(400, "Selecione um canal WhatsApp válido.");
  const { payload, status } = await forwardSupabaseFunction(request, "admin-whatsapp-ops-v1", "GET", new URLSearchParams({ action: "accounts" }));
  if (status < 200 || status >= 300 || !isRecord(payload) || !Array.isArray(payload.items)) {
    throw new HttpError(502, "Não foi possível validar o canal WhatsApp.");
  }
  const account = payload.items.find((item) => isRecord(item) && item.id === accountId);
  if (!isRecord(account) || typeof account.phone_e164 !== "string") throw new HttpError(404, "Canal WhatsApp não encontrado.");
  const channel = whatsappChannelFromPhone(account.phone_e164);
  if (channel) return channel;
  throw new HttpError(403, "A Central deste Admin atende somente os canais 0975 e 1018.");
}

async function requireSupportedAttendanceConversation(
  request: Request,
  conversationId: string,
  expectedAccountId?: string,
): Promise<{ payload: unknown; status: number; accountId: string }> {
  const query = new URLSearchParams({ action: "conversation", conversation_id: conversationId, limit: "50" });
  const forwarded = await forwardSupabaseFunction(request, "admin-whatsapp-ops-v1", "GET", query);
  if (forwarded.status < 200 || forwarded.status >= 300 || !isRecord(forwarded.payload) || !isRecord(forwarded.payload.conversation)) {
    throw new HttpError(forwarded.status === 404 ? 404 : 502, "A conversa não pôde ser validada.");
  }
  const accountId = forwarded.payload.conversation.whatsapp_account_id;
  if (typeof accountId !== "string") throw new HttpError(502, "O canal da conversa não foi informado pelo serviço.");
  await requireSupportedAttendanceAccount(request, accountId);
  if (expectedAccountId && accountId !== expectedAccountId) throw new HttpError(403, "A conversa pertence a outro canal selecionado.");
  return { ...forwarded, accountId };
}

type AttendanceOperatorAssignment = "current" | "other" | "unassigned";

interface AttendanceControlState {
  mode: string;
  operatorAssignment: AttendanceOperatorAssignment;
}

/** Reads only the current mode and owner; the operator UUID stays server-side. */
async function attendanceControlState(
  conversationId: string,
  accountId: string,
  operatorId: string,
): Promise<AttendanceControlState> {
  const rows = await ordersDb()<{ mode: string; assigned_admin_user_id: string | null }>`
    select mode, assigned_admin_user_id
    from public.conversations
    where id = ${conversationId} and whatsapp_account_id = ${accountId}
    limit 1
  `;
  if (!rows.length) throw new HttpError(409, "A atribuição desta conversa não pôde ser confirmada.");
  const { mode, assigned_admin_user_id: assignedOperatorId } = rows[0];
  if (typeof mode !== "string" || !mode) throw new HttpError(502, "O modo da conversa retornou um formato inválido.");
  if (assignedOperatorId !== null && (typeof assignedOperatorId !== "string" || !ORDER_ID.test(assignedOperatorId))) {
    throw new HttpError(502, "A atribuição da conversa retornou um formato inválido.");
  }
  const operatorAssignment = assignedOperatorId === operatorId ? "current" : assignedOperatorId ? "other" : "unassigned";
  return { mode, operatorAssignment };
}

async function proxyAttendanceOperation(request: Request, body: Record<string, unknown>, operatorId: string) {
  const action = typeof body.action === "string" ? body.action : "";
  const conversationId = typeof body.conversation_id === "string" && ORDER_ID.test(body.conversation_id) ? body.conversation_id : "";
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  if (action !== "send_text" || !conversationId || !accountId) throw new HttpError(400, "A operação de atendimento é inválida.");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!text || text.length > 4000 || !/^[A-Za-z0-9:_-]{8,160}$/.test(idempotencyKey)) {
    throw new HttpError(400, "Revise o texto e a chave da resposta.");
  }
  const conversationSnapshot = await requireSupportedAttendanceConversation(request, conversationId, accountId);
  const sendCapability = isRecord(conversationSnapshot.payload) && isRecord(conversationSnapshot.payload.send_capability)
    ? conversationSnapshot.payload.send_capability
    : {};
  if (sendCapability.enabled !== true) {
    throw new HttpError(409, "O canal não está liberado para envio humano neste momento.");
  }
  const control = await attendanceControlState(conversationId, accountId, operatorId);
  if (control.mode !== "human" && control.mode !== "human_copilot") {
    throw new HttpError(409, "Assuma a conversa no atendimento humano antes de responder.");
  }
  if (control.operatorAssignment !== "current") {
    throw new HttpError(409, control.operatorAssignment === "other"
      ? "A conversa está atribuída a outro operador. Assuma a conversa antes de responder."
      : "Assuma a conversa antes de responder.");
  }
  const forwarded = await forwardSupabaseFunction(
    request,
    "admin-whatsapp-ops-v1",
    "POST",
    new URLSearchParams({ action }),
    { conversation_id: conversationId, text, idempotency_key: idempotencyKey },
  );
  return forwarded;
}

const ATTENDANCE_MEDIA_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav",
  "video/mp4",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/octet-stream",
]);

async function proxyAttendanceMedia(request: Request, conversationId: string, accountId: string, messageId: string, headers: Headers): Promise<Response> {
  const snapshot = await requireSupportedAttendanceConversation(request, conversationId, accountId);
  const messages = isRecord(snapshot.payload) && Array.isArray(snapshot.payload.messages) ? snapshot.payload.messages : [];
  if (!messages.some((message) => isRecord(message) && message.id === messageId)) {
    throw new HttpError(404, "O anexo não pertence ao histórico desta conversa ou não está mais carregado.");
  }

  const forwarded = await forwardSupabaseFunction(
    request,
    "admin-whatsapp-ops-v1",
    "GET",
    new URLSearchParams({ action: "media", message_id: messageId }),
  );
  if (forwarded.status < 200 || forwarded.status >= 300 || !isRecord(forwarded.payload) || forwarded.payload.ok !== true) {
    throw new HttpError(forwarded.status === 404 ? 404 : 502, "O anexo não pôde ser aberto pelo serviço de atendimento.");
  }

  const rawUrl = forwarded.payload.url;
  const rawMimeType = typeof forwarded.payload.mime_type === "string" ? forwarded.payload.mime_type.split(";", 1)[0].trim().toLowerCase() : "";
  const rawExpiresAt = forwarded.payload.expires_at;
  const baseUrl = Deno.env.get("SUPABASE_URL");
  let mediaUrl: URL;
  try {
    mediaUrl = new URL(typeof rawUrl === "string" ? rawUrl : "");
    if (!baseUrl || mediaUrl.protocol !== "https:" || mediaUrl.origin !== new URL(baseUrl).origin
      || !mediaUrl.pathname.startsWith("/storage/v1/object/sign/")) throw new Error("media_origin_invalid");
  } catch {
    throw new HttpError(502, "O serviço retornou um link de anexo inválido.");
  }
  const expiresAt = typeof rawExpiresAt === "string" && Number.isFinite(Date.parse(rawExpiresAt)) ? new Date(rawExpiresAt).toISOString() : "";
  if (!expiresAt || Date.parse(expiresAt) <= Date.now() || Date.parse(expiresAt) > Date.now() + 20 * 60_000) {
    throw new HttpError(502, "O link temporário do anexo expirou ou é inválido.");
  }
  if (!ATTENDANCE_MEDIA_MIME_TYPES.has(rawMimeType)) throw new HttpError(502, "O tipo deste anexo não é permitido para prévia.");
  const filename = typeof forwarded.payload.filename === "string"
    ? forwarded.payload.filename.replace(/[^\w .()_-]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120)
    : "";
  const mediaResponse = await fetch(mediaUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!mediaResponse.ok || !mediaResponse.body) throw new HttpError(502, "O conteúdo do anexo não está disponível.");
  const responseMimeType = (mediaResponse.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!ATTENDANCE_MEDIA_MIME_TYPES.has(responseMimeType) || responseMimeType !== rawMimeType) {
    await mediaResponse.body.cancel();
    throw new HttpError(502, "O tipo do conteúdo do anexo não corresponde ao tipo autorizado.");
  }

  const maxBytes = 32 * 1024 * 1024;
  const contentLengthHeader = mediaResponse.headers.get("Content-Length");
  const declaredLength = contentLengthHeader === null ? NaN : Number(contentLengthHeader);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await mediaResponse.body.cancel();
    throw new HttpError(413, "O anexo excede o limite de 32 MB para prévia.");
  }
  let totalBytes = 0;
  const limitedBody = mediaResponse.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        controller.error(new HttpError(413, "O anexo excede o limite de 32 MB para prévia."));
        return;
      }
      controller.enqueue(chunk);
    },
    flush() {
      if (totalBytes === 0) throw new HttpError(502, "O anexo está vazio.");
    },
  }));

  headers.set("Content-Type", responseMimeType);
  headers.set("Content-Disposition", `attachment; filename="${filename || "anexo-whatsapp"}"`);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Attachment-Filename", filename || "Anexo do WhatsApp");
  headers.set("X-Attachment-Expires-At", expiresAt);
  headers.set("Access-Control-Expose-Headers", "Content-Type, Content-Disposition, X-Attachment-Filename, X-Attachment-Expires-At");
  return new Response(limitedBody, { status: 200, headers });
}

async function updateAttendanceMode(request: Request, body: Record<string, unknown>) {
  const conversationId = body.conversationId;
  const mode = body.mode;
  const accountId = body.accountId;
  if (typeof conversationId !== "string" || !ORDER_ID.test(conversationId) || typeof accountId !== "string"
    || !ORDER_ID.test(accountId) || (mode !== "human" && mode !== "ai")) {
    throw new HttpError(400, "A alteração do modo de atendimento é inválida.");
  }
  await requireSupportedAttendanceConversation(request, conversationId, accountId);
  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const publishableKey = supabasePublishableKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  if (!accessToken || !publishableKey || !supabaseUrl) throw new HttpError(503, "O controle de atendimento não está configurado.");
  const rpc = mode === "human" ? "ops2_admin_attendance_takeover_v1" : "ops2_admin_attendance_resume_ai_v1";
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_conversation_id: conversationId }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) throw new HttpError(response.status, "Sua conta não tem permissão para alterar o modo desta conversa.");
  if (!response.ok) throw new HttpError(502, "O estado de atendimento não pôde ser atualizado.");
  return payload;
}

async function proxyAnaAdmin(request: Request, body: Record<string, unknown>) {
  const action = body.action;
  if (action !== "admin_load" && action !== "admin_set_channel") throw new HttpError(400, "A ação da ANA é inválida.");
  if (action === "admin_load") {
    return await forwardSupabaseFunction(request, "admin-whatsapp-ana-preview-v1", "POST", undefined, { action });
  }
  const accountId = body.whatsapp_account_id;
  const enabled = body.enabled;
  if (typeof accountId !== "string" || !ORDER_ID.test(accountId) || typeof enabled !== "boolean") {
    throw new HttpError(400, "A alteração do canal ANA é inválida.");
  }
  await requireSupportedAttendanceAccount(request, accountId);
  const forwarded = await forwardSupabaseFunction(request, "admin-whatsapp-ana-preview-v1", "POST", undefined, {
    action,
    whatsapp_account_id: accountId,
    enabled,
  });
  return forwarded;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / 256)) {
    bytes.unshift(remaining & 255);
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, content: Uint8Array): Uint8Array {
  return new Uint8Array([tag, ...derLength(content.length), ...content]);
}

function privateKeyDer(pemValue: string): Uint8Array {
  const pem = pemValue.replace(/\\n/g, "\n").trim();
  const pkcs8 = pem.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  if (pkcs8) return Uint8Array.from(atob(pkcs8[1].replace(/\s/g, "")), (character) => character.charCodeAt(0));

  const pkcs1 = pem.match(/-----BEGIN RSA PRIVATE KEY-----([\s\S]+?)-----END RSA PRIVATE KEY-----/);
  if (!pkcs1) throw new HttpError(503, "A chave do GitHub App não está em um formato suportado.");
  const key = Uint8Array.from(atob(pkcs1[1].replace(/\s/g, "")), (character) => character.charCodeAt(0));
  const algorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const privateKey = der(0x04, key);
  return der(0x30, new Uint8Array([0x02, 0x01, 0x00, ...algorithm, ...privateKey]));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function createAppJwt(): Promise<string> {
  const appId = Deno.env.get("GITHUB_APP_ID");
  const privateKey = Deno.env.get("GITHUB_PRIVATE_KEY");
  if (!appId || !privateKey) throw new HttpError(503, "A integração GitHub ainda não foi configurada no servidor.");

  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ iss: appId, iat: now - 60, exp: now + 8 * 60 })));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    asArrayBuffer(privateKeyDer(privateKey)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, asArrayBuffer(new TextEncoder().encode(unsigned)));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function githubRequest(path: string, token: string, init: RequestInit = {}): Promise<GitHubResponse> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-GitHub-Api-Version", GITHUB_API_VERSION);
  headers.set("User-Agent", "whatsapp-atendimento-github-admin");
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${GITHUB_API}${path}`, { ...init, headers });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 409 || response.status === 422) throw new HttpError(409, "O branch mudou durante a gravação. Recarregue o catálogo e reaplique sua edição.");
    throw new HttpError(502, "O GitHub não concluiu a operação. Tente novamente mais tarde.");
  }
  return { json, response };
}

async function installationToken(permission: "read" | "write"): Promise<string> {
  const installationId = Deno.env.get("GITHUB_INSTALLATION_ID");
  if (!installationId) throw new HttpError(503, "A instalação GitHub App ainda não foi configurada no servidor.");

  const appJwt = await createAppJwt();
  const response = await fetch(`${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${appJwt}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "Content-Type": "application/json",
      "User-Agent": "whatsapp-atendimento-github-admin",
    },
    body: JSON.stringify({ repositories: [REPOSITORY], permissions: { contents: permission } }),
  });
  if (!response.ok) throw new HttpError(503, "O acesso do GitHub App precisa ser revisado no servidor.");
  const result = await response.json() as { token?: string };
  if (!result.token) throw new HttpError(503, "O GitHub App não forneceu uma credencial temporária.");
  return result.token;
}

async function githubJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const result = await githubRequest(path, token, init);
  return result.json as T;
}

function repositoryPath(path: string): string {
  return `/repos/${OWNER}/${REPOSITORY}${path}`;
}

function decodeFileContent(content: string): string {
  const binary = atob(content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function branchHead(token: string): Promise<string> {
  const branch = await githubJson<{ commit: { sha: string } }>(
    repositoryPath(`/branches/${encodeURIComponent(BRANCH)}`),
    token,
  );
  return branch.commit.sha;
}

async function readCatalog(token: string, expectedHead?: string) {
  const commitSha = await branchHead(token);
  if (expectedHead && expectedHead !== commitSha) {
    throw new HttpError(409, "O branch mudou desde que você abriu o catálogo. Recarregue para evitar sobrescrever outra edição.");
  }
  const ref = new URLSearchParams({ ref: commitSha }).toString();
  const [productsFile, basketsFile] = await Promise.all([
    githubJson<{ content: string; sha: string }>(repositoryPath(`/contents/${PRODUCTS_PATH}?${ref}`), token),
    githubJson<{ content: string; sha: string }>(repositoryPath(`/contents/${BASKETS_PATH}?${ref}`), token),
  ]);
  const products = JSON.parse(decodeFileContent(productsFile.content));
  const baskets = JSON.parse(decodeFileContent(basketsFile.content));
  return {
    products,
    baskets,
    commitSha,
    catalogRevision: `${productsFile.sha}:${basketsFile.sha}`,
    commitUrl: `https://github.com/${OWNER}/${REPOSITORY}/commit/${commitSha}`,
  };
}

function isFlowChannel(value: string): value is FlowChannel {
  return FLOW_CHANNELS.includes(value as FlowChannel);
}

function flowPath(channel: FlowChannel): string {
  return `${FLOWS_PATH}/channel-${channel}.json`;
}

async function readFlowDraft(channel: FlowChannel, token: string) {
  const commitSha = await branchHead(token);
  const catalog = await readCatalog(token, commitSha);
  const file = await githubJson<{ content: string }>(
    repositoryPath(`/contents/${flowPath(channel)}?${new URLSearchParams({ ref: commitSha })}`),
    token,
  );
  let document: unknown;
  try {
    document = JSON.parse(decodeFileContent(file.content));
  } catch {
    throw new HttpError(502, "O rascunho deste canal no GitHub não contém JSON válido.");
  }
  const errors = validateChannelFlowDocument(document, channel, catalog.baskets.baskets, catalog.products.products);
  if (errors.length) throw new HttpError(422, `Revise o rascunho do Flow: ${errors.slice(0, 5).join("; ")}`);
  return {
    document: document as ChannelFlowDocument,
    commitSha,
    commitUrl: `https://github.com/${OWNER}/${REPOSITORY}/commit/${commitSha}`,
  };
}

async function writeFlowDraft(channel: FlowChannel, input: unknown, token: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "A solicitação do rascunho não tem o formato esperado.");
  }
  const request = input as Record<string, unknown>;
  if (Object.keys(request).some((key) => !["expectedCommit", "document"].includes(key))) {
    throw new HttpError(400, "A solicitação do rascunho contém campos não permitidos.");
  }
  if (typeof request.expectedCommit !== "string" || !/^[0-9a-f]{40}$/i.test(request.expectedCommit)) {
    throw new HttpError(400, "A revisão do catálogo é inválida.");
  }
  const headSha = await branchHead(token);
  if (headSha !== request.expectedCommit) {
    throw new HttpError(409, "O branch mudou desde que você abriu o catálogo. Recarregue antes de salvar o Flow.");
  }
  const catalog = await readCatalog(token, headSha);
  const errors = validateChannelFlowDocument(request.document, channel, catalog.baskets.baskets, catalog.products.products, catalog.catalogRevision);
  if (errors.length) throw new HttpError(422, `Revise o rascunho do Flow: ${errors.slice(0, 5).join("; ")}`);

  const content = `${JSON.stringify(request.document, null, 2)}\n`;
  if (new TextEncoder().encode(content).byteLength > MAX_FLOW_DRAFT_BYTES) throw new HttpError(413, "O rascunho do Flow excede o limite permitido.");
  const blob = await createBlob(encodeBase64(content), token);
  const parent = await githubJson<{ tree: { sha: string } }>(repositoryPath(`/git/commits/${headSha}`), token);
  const tree = await githubJson<{ sha: string }>(repositoryPath("/git/trees"), token, {
    method: "POST",
    body: JSON.stringify({
      base_tree: parent.tree.sha,
      tree: [{ path: flowPath(channel), mode: "100644", type: "blob", sha: blob }],
    }),
  });
  const commit = await githubJson<{ sha: string; html_url: string }>(repositoryPath("/git/commits"), token, {
    method: "POST",
    body: JSON.stringify({ message: `admin: salvar rascunho Flow ${channel}`, tree: tree.sha, parents: [headSha] }),
  });
  await githubJson(repositoryPath(`/git/refs/heads/${BRANCH}`), token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return {
    document: request.document as ChannelFlowDocument,
    commitSha: commit.sha,
    commitUrl: commit.html_url,
  };
}

function readU24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } {
  const text = (start: number, length: number) => new TextDecoder().decode(bytes.slice(start, start + length));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP" || view.getUint32(4, true) !== bytes.length - 8) {
    throw new HttpError(400, "Envie uma imagem WebP válida.");
  }

  let offset = 12;
  let extendedDimensions: { width: number; height: number } | undefined;
  let imageDimensions: { width: number; height: number } | undefined;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new HttpError(400, "A estrutura da foto WebP está incompleta.");
    const kind = text(offset, 4);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    const paddedEnd = end + (length & 1);
    if (end > bytes.length || paddedEnd > bytes.length) throw new HttpError(400, "A estrutura da foto WebP está incompleta.");

    if (kind === "VP8X") {
      if (length !== 10 || extendedDimensions || (bytes[start] & 0xc1) !== 0) throw new HttpError(400, "A estrutura da foto WebP é inválida.");
      if ((bytes[start] & 0x02) !== 0) throw new HttpError(400, "Fotos animadas não são aceitas.");
      extendedDimensions = { width: readU24(bytes, start + 4) + 1, height: readU24(bytes, start + 7) + 1 };
    } else if (kind === "VP8 ") {
      if (imageDimensions || length <= 10 || (bytes[start] & 1) !== 0
        || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) {
        throw new HttpError(400, "A estrutura da foto WebP é inválida.");
      }
      imageDimensions = {
        width: (bytes[start + 6] | (bytes[start + 7] << 8)) & 0x3fff,
        height: (bytes[start + 8] | (bytes[start + 9] << 8)) & 0x3fff,
      };
    } else if (kind === "VP8L") {
      if (imageDimensions || length <= 5 || bytes[start] !== 0x2f) throw new HttpError(400, "A estrutura da foto WebP é inválida.");
      imageDimensions = {
        width: 1 + bytes[start + 1] + ((bytes[start + 2] & 0x3f) << 8),
        height: 1 + (bytes[start + 2] >> 6) + (bytes[start + 3] << 2) + ((bytes[start + 4] & 0x0f) << 10),
      };
    } else if (kind === "ANIM" || kind === "ANMF") {
      throw new HttpError(400, "Fotos animadas não são aceitas.");
    }
    offset = paddedEnd;
  }
  const dimensions = imageDimensions;
  if (!dimensions || (extendedDimensions && imageDimensions
    && (extendedDimensions.width !== imageDimensions.width || extendedDimensions.height !== imageDimensions.height))) {
    throw new HttpError(400, "A foto WebP não contém uma imagem válida.");
  }
  return dimensions;
}

function validateImage(image: ImageInput, documents: CatalogDocuments): { path: string; contentBase64: string } {
  if (!image || typeof image !== "object" || Array.isArray(image)
    || Object.keys(image).some((key) => !["productId", "contentBase64"].includes(key))
    || typeof image.productId !== "string" || typeof image.contentBase64 !== "string") {
    throw new HttpError(400, "Os dados da foto não têm o formato esperado.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(image.productId)) throw new HttpError(400, "Identificador da foto inválido.");
  const product = documents.products.products.find((item) => item.id === image.productId);
  const expectedPath = `images/products/${image.productId}.webp`;
  if (!product || product.imagePath !== expectedPath) throw new HttpError(400, "A foto precisa pertencer a um produto do catálogo.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.contentBase64)) throw new HttpError(400, "A foto WebP não pôde ser lida.");

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(image.contentBase64), (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(400, "A foto WebP não pôde ser lida.");
  }
  if (bytes.length < 16 || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(400, "A foto deve ter até 27 KB.");
  const { width, height } = webpDimensions(bytes);
  if (width !== 240 || height !== 190) throw new HttpError(400, "A foto precisa ter exatamente 240 × 190 pixels.");
  return { path: `${IMAGE_PREFIX}${image.productId}.webp`, contentBase64: image.contentBase64 };
}

async function createBlob(contentBase64: string, token: string): Promise<string> {
  const blob = await githubJson<{ sha: string }>(repositoryPath("/git/blobs"), token, {
    method: "POST",
    body: JSON.stringify({ content: contentBase64, encoding: "base64" }),
  });
  return blob.sha;
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function writeCatalog(input: SaveInput, token: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "O catálogo enviado não tem o formato esperado.");
  }
  if (!input.expectedCommit || typeof input.expectedCommit !== "string") {
    throw new HttpError(400, "A revisão do catálogo é obrigatória para salvar.");
  }
  if (Object.keys(input).some((key) => !["expectedCommit", "products", "baskets", "images"].includes(key))) {
    throw new HttpError(400, "A solicitação contém campos não permitidos.");
  }
  if (!/^[0-9a-f]{40}$/i.test(input.expectedCommit)) throw new HttpError(400, "A revisão do catálogo é inválida.");
  if (Object.keys(input).some((key) => !["expectedCommit", "products", "baskets", "images"].includes(key))) {
    throw new HttpError(400, "A solicitação contém campos não permitidos.");
  }
  if (!/^[0-9a-f]{40}$/i.test(input.expectedCommit)) throw new HttpError(400, "A revisão do catálogo é inválida.");
  const documents: CatalogDocuments = { products: input.products, baskets: input.baskets };
  const validationErrors = validateCatalog(documents);
  if (validationErrors.length) throw new HttpError(422, `Revise o catálogo: ${validationErrors.slice(0, 5).join("; ")}`);
  const headSha = await branchHead(token);
  if (headSha !== input.expectedCommit) throw new HttpError(409, "O branch mudou desde que você abriu o catálogo. Recarregue antes de salvar.");

  if (input.images !== undefined && (!Array.isArray(input.images) || input.images.length > MAX_PENDING_IMAGES)) {
    throw new HttpError(400, "A quantidade de fotos excede o limite permitido.");
  }
  const images = (input.images ?? []).map((image) => validateImage(image, documents));
  if (new Set(images.map((image) => image.path)).size !== images.length) throw new HttpError(400, "Há fotos duplicadas nesta gravação.");
  const files: Array<{ path: string; content: string }> = [
    { path: PRODUCTS_PATH, content: `${JSON.stringify(input.products, null, 2)}\n` },
    { path: BASKETS_PATH, content: `${JSON.stringify(input.baskets, null, 2)}\n` },
  ];
  files.push(...images.map((image) => ({ path: image.path, content: image.contentBase64 })));

  const treeEntries = await Promise.all(files.map(async (file) => ({
    path: file.path,
    mode: "100644",
    type: "blob",
    sha: await createBlob(file.path.startsWith(IMAGE_PREFIX) ? file.content : encodeBase64(file.content), token),
  })));

  const parent = await githubJson<{ tree: { sha: string } }>(repositoryPath(`/git/commits/${headSha}`), token);
  const tree = await githubJson<{ sha: string }>(repositoryPath("/git/trees"), token, {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: treeEntries }),
  });
  const commit = await githubJson<{ sha: string; html_url: string }>(repositoryPath("/git/commits"), token, {
    method: "POST",
    body: JSON.stringify({
      message: "admin: atualizar catálogo de atendimento",
      tree: tree.sha,
      parents: [headSha],
    }),
  });
  await githubJson(repositoryPath(`/git/refs/heads/${BRANCH}`), token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    products: input.products,
    baskets: input.baskets,
    commitSha: commit.sha,
    commitUrl: commit.html_url,
    catalogRevision: `${treeEntries[0].sha}:${treeEntries[1].sha}`,
  };
}

function ordersDb(): Sql {
  if (orderDatabase) return orderDatabase;
  const connectionString = Deno.env.get("SUPABASE_DB_URL");
  if (!connectionString) throw new HttpError(503, "A conexão privada do banco ainda não foi configurada.");
  orderDatabase = postgres(connectionString, { max: 1, idle_timeout: 10, connect_timeout: 5, prepare: false, ssl: "require" });
  return orderDatabase;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 32_000) throw new HttpError(413, "A solicitação excede o limite permitido.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new HttpError(400, "O conteúdo enviado não é JSON válido."); }
  if (!isRecord(value)) throw new HttpError(400, "A solicitação não tem o formato esperado.");
  return value;
}

interface DbOrder {
  id: string; status: string; total_cents: number; snapshot: Record<string, unknown>; channel: string;
  revision: number; assigned_operator_id: string | null; customer_acceptance_status: string;
  invoice_status: string; invoice_id: number | null; attention_code: string | null;
  created_at: string; separation_completed_at: string | null; bling_sale_reference: string | null; bling_sale_id: number | null;
  dispatched_at: string | null; completed_at: string | null; received_payment_cents: number | string | null; received_payment_method: string | null;
}

interface DbOrderItem {
  id: number; group_id: string; product_id: string; quantity: number; picked_quantity: number;
  unit_price_cents: number; line_total_cents: number; picking_status: string; snapshot: Record<string, unknown>;
  replacement_product_id: string | null;
}

interface DbOrderQueueRow {
  id: string;
  status: string;
  total_cents: number;
  basket_name: string | null;
  customer_name: string | null;
  city: string | null;
  channel: string;
  item_count: number;
  revision: number;
  created_at: string;
}

interface DbOutboxQueueRow {
  id: string;
  channel: string;
  message_type: string;
  status: string;
  available_at: string;
  created_at: string;
  sent_at: string | null;
  last_error_code: string | null;
  provider_status: string | null;
  provider_status_at: string | null;
  provider_error_code: string | null;
}

interface BlingSalePreviewSummary {
  externalReference: string;
  saleDate: string;
  itemCount: number;
  paymentObservation: string;
}

interface BlingSaleRequestPreview {
  contato: { id: number };
  data: string;
  numeroLoja: string;
  totalProdutos: number;
  total: number;
  outrasDespesas: number;
  desconto: { valor: number; unidade: "REAL" };
  itens: Array<{
    produto: { id: number };
    codigo?: string;
    descricao: string;
    quantidade: number;
    valor: number;
  }>;
  transporte: { etiqueta: {
    nome: string;
    endereco: string;
    numero: string;
    complemento?: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
  } };
  observacoes: string;
}

interface BlingSalePreviewBuild {
  requestSha256: string | null;
  summary: BlingSalePreviewSummary | null;
  blockers: string[];
  candidate: BlingSaleRequestPreview | null;
}

interface BlingSaleReconciliationSummary {
  status: "running" | "complete";
  outcome: BlingSaleReconciliationOutcome | null;
  externalId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  idempotencyKey: string | null;
}

function stableBlingSaleReference(orderId: string): string | null {
  if (!ORDER_ID.test(orderId)) return null;
  return `WA-${orderId.replaceAll("-", "").toLowerCase()}`;
}

function blingSaleDate(createdAt: string): string | null {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return fields.year && fields.month && fields.day ? `${fields.year}-${fields.month}-${fields.day}` : null;
}

function paymentObservation(value: unknown): string | null {
  const labels: Record<string, string> = {
    pix: "PIX", cash: "Dinheiro", debit_card: "Cartão de débito", credit_card: "Cartão de crédito",
  };
  return typeof value === "string" ? labels[value] ?? null : null;
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= 240 ? text : null;
}

async function hashBlingSaleRequest(request: BlingSaleRequestPreview): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(request));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function moneyToCents(value: unknown): number | null {
  const amount = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function blingSaleMatchesCandidate(value: unknown, candidate: BlingSaleRequestPreview): boolean {
  const remote = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(remote) || remote.numeroLoja !== candidate.numeroLoja || remote.data !== candidate.data) return false;
  const remoteContact = isRecord(remote.contato) ? Number(remote.contato.id) : NaN;
  if (remoteContact !== candidate.contato.id
    || moneyToCents(remote.totalProdutos) !== moneyToCents(candidate.totalProdutos)
    || moneyToCents(remote.total) !== moneyToCents(candidate.total)
    || String(remote.observacoes ?? "") !== candidate.observacoes) return false;

  const remoteExpenses = remote.outrasDespesas === undefined ? 0 : moneyToCents(remote.outrasDespesas);
  if (remoteExpenses !== moneyToCents(candidate.outrasDespesas)) return false;
  const remoteDiscount = isRecord(remote.desconto) ? remote.desconto : null;
  const remoteDiscountCents = remoteDiscount
    ? moneyToCents(remoteDiscount.valor)
    : 0;
  if (remoteDiscountCents !== moneyToCents(candidate.desconto.valor)
    || (candidate.desconto.valor > 0 && remoteDiscount?.unidade !== "REAL")) return false;

  if (!Array.isArray(remote.itens) || remote.itens.length !== candidate.itens.length) return false;
  const unmatched = [...remote.itens];
  for (const expected of candidate.itens) {
    const index = unmatched.findIndex((value) => {
      if (!isRecord(value) || !isRecord(value.produto)) return false;
      return Number(value.produto.id) === expected.produto.id
        && value.codigo === expected.codigo
        && value.descricao === expected.descricao
        && Number(value.quantidade) === expected.quantidade
        && moneyToCents(value.valor) === moneyToCents(expected.valor);
    });
    if (index < 0) return false;
    unmatched.splice(index, 1);
  }

  const remoteTransport = isRecord(remote.transporte) ? remote.transporte : null;
  const remoteLabel = remoteTransport && isRecord(remoteTransport.etiqueta) ? remoteTransport.etiqueta : null;
  if (!remoteLabel) return false;
  const expectedLabel = candidate.transporte.etiqueta;
  const equalText = (actual: unknown, expected: string | undefined) => String(actual ?? "").trim() === (expected ?? "");
  return equalText(remoteLabel.nome, expectedLabel.nome)
    && equalText(remoteLabel.endereco, expectedLabel.endereco)
    && equalText(remoteLabel.numero, expectedLabel.numero)
    && equalText(remoteLabel.complemento, expectedLabel.complemento)
    && equalText(remoteLabel.bairro, expectedLabel.bairro)
    && equalText(remoteLabel.municipio, expectedLabel.municipio)
    && equalText(remoteLabel.uf, expectedLabel.uf)
    && equalText(remoteLabel.cep, expectedLabel.cep);
}

interface BlingSaleReferenceLookup {
  complete: boolean;
  ids: number[];
  detail: Record<string, unknown> | null;
}

/** Dormant read-only lookup; no HTTP route or worker invokes it in this development stage. */
async function lookupBlingSaleReference(reference: string): Promise<BlingSaleReferenceLookup> {
  if (!/^WA-[0-9a-f]{32}$/.test(reference)) return { complete: false, ids: [], detail: null };
  const pageSize = 100;
  const maximumPages = 25;
  const matches = new Set<number>();
  let complete = false;

  for (let page = 1; page <= maximumPages; page += 1) {
    const query = new URLSearchParams({ pagina: String(page), limite: String(pageSize) });
    query.append("numerosLojas[]", reference);
    let response: unknown;
    try { response = await blingApiGet(`/pedidos/vendas?${query.toString()}`); }
    catch { return { complete: false, ids: [...matches], detail: null }; }
    if (!isRecord(response) || !Array.isArray(response.data)) return { complete: false, ids: [...matches], detail: null };

    for (const row of response.data) {
      if (!isRecord(row) || row.numeroLoja !== reference) continue;
      const id = typeof row.id === "number" || typeof row.id === "string" ? Number(row.id) : NaN;
      if (!Number.isSafeInteger(id) || id <= 0) return { complete: false, ids: [...matches], detail: null };
      matches.add(id);
      if (matches.size > 1) return { complete: false, ids: [...matches], detail: null };
    }

    if (response.data.length < pageSize) {
      complete = true;
      break;
    }
  }

  const ids = [...matches];
  if (!complete || ids.length !== 1) return { complete, ids, detail: null };
  let detailResponse: unknown;
  try { detailResponse = await blingApiGet(`/pedidos/vendas/${ids[0]}`); }
  catch { return { complete: false, ids, detail: null }; }
  if (!isRecord(detailResponse) || !isRecord(detailResponse.data)
    || detailResponse.data.numeroLoja !== reference) return { complete: false, ids, detail: null };
  return { complete: true, ids, detail: detailResponse.data };
}

/** GET-only reconciliation decision. It returns no remote PII and never writes to Bling or the database. */
export async function reconcileBlingSaleByReference(
  reference: string,
  candidate: BlingSaleRequestPreview,
): Promise<{ outcome: BlingSaleReconciliationOutcome; externalId: string | null }> {
  if (candidate.numeroLoja !== reference) return { outcome: "unknown", externalId: null };
  const lookup = await lookupBlingSaleReference(reference);
  const matching = lookup.ids.length === 1 && lookup.detail !== null
    ? blingSaleMatchesCandidate(lookup.detail, candidate)
    : null;
  const outcome = classifyBlingSaleReconciliation({
    lookupComplete: lookup.complete,
    matchingIds: lookup.ids,
    candidateMatches: matching,
  });
  return { outcome, externalId: outcome === "matched" ? String(lookup.ids[0]) : null };
}

function isRecentReconciliationLease(startedAt: unknown): boolean {
  if (typeof startedAt !== "string") return false;
  const started = Date.parse(startedAt);
  const elapsed = Date.now() - started;
  return Number.isFinite(started) && elapsed >= 0 && elapsed < 5 * 60 * 1000;
}

async function reconcileOrderBlingSale(orderId: string, operatorId: string, body: Record<string, unknown>) {
  if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision)) {
    throw new HttpError(400, "A revisão do pedido é obrigatória.");
  }
  const idempotencyKey = body.idempotencyKey;
  if (typeof idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    throw new HttpError(400, "A chave idempotente da consulta é inválida.");
  }

  const database = ordersDb();
  const eventKey = `${orderId}:bling-reconcile:${idempotencyKey}`;
  const operation: {
    lookup: { reference: string; candidate: BlingSaleRequestPreview; requestSha256: string } | null;
    attempt: number;
    replay: boolean;
  } = { lookup: null, attempt: 0, replay: false };
  await database.begin(async (tx) => {
    const orders = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
    const order = orders[0];
    if (!order) throw new HttpError(404, "Pedido não encontrado.");
    if (order.revision !== body.revision) throw new HttpError(409, "O pedido mudou. Recarregue antes de consultar o Bling.");
    if (order.status !== "awaiting_invoice") throw new HttpError(409, "Somente pedidos concluídos podem consultar a referência de venda.");
    const jobs = await tx<{
      status: string; error_code: string | null; request_sha256: string | null; result_summary: Record<string, unknown>;
    }>`select status, error_code, request_sha256, result_summary
      from whatsapp_atendimento.integration_jobs
      where order_id = ${orderId} and operation = 'create_sale'
      for update`;
    const job = jobs[0];
    if (!job || !["blocked", "unknown"].includes(job.status)) {
      throw new HttpError(409, "A operação de venda não está em um estado que permita reconciliação.");
    }

    const customer = isRecord(order.snapshot.customer) ? order.snapshot.customer : {};
    const customerId = typeof customer.customerId === "string" ? customer.customerId : "";
    const contactMappings = ORDER_ID.test(customerId)
      ? await tx<{ bling_contact_id: number; verified_at: string }>`select bling_contact_id, verified_at
          from whatsapp_atendimento.customer_bling_contacts where customer_id = ${customerId}`
      : [];
    const contactId = contactMappings[0]?.verified_at
      && Number.isSafeInteger(Number(contactMappings[0].bling_contact_id))
      ? Number(contactMappings[0].bling_contact_id)
      : null;
    const items = await tx<DbOrderItem>`select * from whatsapp_atendimento.order_items where order_id = ${orderId} order by position`;
    const rawTotals = job.result_summary.commercialTotals;
    const commercialTotals = isRecord(rawTotals)
      && typeof rawTotals.lineTotalCents === "number" && Number.isSafeInteger(rawTotals.lineTotalCents)
      && typeof rawTotals.acceptedTotalCents === "number" && Number.isSafeInteger(rawTotals.acceptedTotalCents)
      && typeof rawTotals.commercialDeltaCents === "number" && Number.isSafeInteger(rawTotals.commercialDeltaCents)
      && typeof rawTotals.otherExpensesCents === "number" && Number.isSafeInteger(rawTotals.otherExpensesCents)
      && typeof rawTotals.discountCents === "number" && Number.isSafeInteger(rawTotals.discountCents)
      && typeof rawTotals.balances === "boolean"
      ? rawTotals as unknown as BlingCommercialTotals
      : null;
    const preview = await buildBlingSalePreview(order, items, contactId, commercialTotals);
    const reference = order.bling_sale_reference;
    if (!reference || !/^WA-[0-9a-f]{32}$/.test(reference) || !preview.candidate
      || !preview.requestSha256 || preview.blockers.length
      || preview.requestSha256 !== job.request_sha256
      || preview.candidate.numeroLoja !== reference) {
      throw new HttpError(409, "A prévia da venda mudou ou ainda não tem dados suficientes para consultar a referência.");
    }

    const events = await tx<{ event_data: Record<string, unknown> }>`select event_data from whatsapp_atendimento.order_events
      where event_key = ${eventKey} and order_id = ${orderId} for update`;
    const previous = events[0]?.event_data;
    if (previous && previous.requestSha256 !== preview.requestSha256) {
      throw new HttpError(409, "Esta chave idempotente já foi usada com outra prévia de venda.");
    }
    if (previous?.status === "complete") {
      operation.replay = true;
      return;
    }

    const latest = isRecord(job.result_summary.reconciliation) ? job.result_summary.reconciliation : null;
    if (latest?.status === "running" && isRecentReconciliationLease(latest.startedAt)
      && latest.idempotencyKey !== idempotencyKey) {
      throw new HttpError(409, "Já existe uma consulta Bling em andamento para este pedido.");
    }
    if (previous?.status === "running" && isRecentReconciliationLease(previous.startedAt)) {
      throw new HttpError(409, "Esta consulta Bling ainda está em andamento.");
    }
    operation.attempt = typeof previous?.attempt === "number" && Number.isSafeInteger(previous.attempt)
      ? previous.attempt + 1
      : 1;
    const startedAt = new Date().toISOString();
    const run = {
      status: "running",
      outcome: null,
      externalId: null,
      idempotencyKey,
      requestSha256: preview.requestSha256,
      startedAt,
      completedAt: null,
      attempt: operation.attempt,
    };
    if (events[0]) {
      await tx`update whatsapp_atendimento.order_events set event_data = ${tx.json({ ...previous, ...run, operatorId })}
        where event_key = ${eventKey} and order_id = ${orderId}`;
    } else {
      await tx`insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data)
        values (${orderId}, ${eventKey}, 'bling_sale_reconciliation', ${tx.json({ ...run, operatorId })})`;
    }
    await tx`update whatsapp_atendimento.integration_jobs
      set result_summary = ${tx.json({ ...job.result_summary, reconciliation: run })}, updated_at = now()
      where order_id = ${orderId} and operation = 'create_sale'`;
    operation.lookup = { reference, candidate: preview.candidate, requestSha256: preview.requestSha256 };
  });

  if (operation.replay) return orderDetail(orderId);
  const lookup = operation.lookup;
  if (!lookup) throw new HttpError(409, "A consulta Bling não pôde ser iniciada.");
  const attempt = operation.attempt;

  let result: { outcome: BlingSaleReconciliationOutcome; externalId: string | null };
  try {
    const token = await getSharedBlingAccessToken();
    const remote = await lookupSharedBlingSale(lookup.reference, token);
    const candidateMatches = remote.ids.length === 1 && remote.detail
      ? sharedBlingSaleMatches(remote.detail, lookup.candidate)
      : null;
    const outcome = classifyBlingSaleReconciliation({
      lookupComplete: remote.complete,
      matchingIds: remote.ids,
      candidateMatches,
    });
    result = { outcome, externalId: outcome === "matched" ? String(remote.ids[0]) : null };
  } catch {
    result = { outcome: "unknown", externalId: null };
  }
  await database.begin(async (tx) => {
    const jobs = await tx<{
      request_sha256: string | null; result_summary: Record<string, unknown>;
    }>`select request_sha256, result_summary from whatsapp_atendimento.integration_jobs
      where order_id = ${orderId} and operation = 'create_sale' for update`;
    const job = jobs[0];
    const events = await tx<{ event_data: Record<string, unknown> }>`select event_data from whatsapp_atendimento.order_events
      where event_key = ${eventKey} and order_id = ${orderId} for update`;
    const event = events[0]?.event_data;
    if (!job || !event || event.status !== "running" || event.attempt !== attempt) return;
    const currentCandidate = job.request_sha256 === lookup.requestSha256;
    const outcome = currentCandidate ? result.outcome : "unknown";
    const externalId = currentCandidate && outcome === "matched" ? result.externalId : null;
    const completedAt = new Date().toISOString();
    await tx`update whatsapp_atendimento.order_events
      set event_data = ${tx.json({ ...event, status: "complete", outcome, externalId, completedAt,
        ...(currentCandidate ? {} : { reason: "candidate_changed_during_lookup" }) })}
      where event_key = ${eventKey} and order_id = ${orderId}`;
    const latest = isRecord(job.result_summary.reconciliation) ? job.result_summary.reconciliation : null;
    if (currentCandidate && latest?.idempotencyKey === idempotencyKey
      && latest.requestSha256 === lookup.requestSha256) {
      const reconciliation = { ...latest, status: "complete", outcome, externalId, completedAt };
      await tx`update whatsapp_atendimento.integration_jobs
        set result_summary = ${tx.json({ ...job.result_summary, blockers: outcome === "matched" ? [] : job.result_summary.blockers, reconciliation })}, updated_at = now()
        where order_id = ${orderId} and operation = 'create_sale'`;
    }
    if (currentCandidate && outcome === "matched" && externalId && /^\d+$/.test(externalId)) {
      await tx`update whatsapp_atendimento.orders
        set bling_sale_id = ${Number(externalId)}, attention_code = 'bling_invoice_pending', updated_at = now()
        where id = ${orderId} and status = 'awaiting_invoice'`;
      await tx`update whatsapp_atendimento.integration_jobs
        set status = 'succeeded', error_code = null, external_id = ${externalId}, finished_at = now(), updated_at = now()
        where order_id = ${orderId} and operation = 'create_sale'`;
      await tx`insert into whatsapp_atendimento.integration_jobs (order_id, operation, idempotency_key, status, error_code, result_summary)
        values (${orderId}, 'generate_invoice', ${`${orderId}:generate_invoice`}, 'blocked', 'BLING_NFE_HUMAN_CONFIRMATION_REQUIRED', ${tx.json({ externalReference: lookup.reference, saleId: Number(externalId) })})
        on conflict (order_id, operation) do nothing`;
    }
  });
  return orderDetail(orderId);
}

async function buildBlingSalePreview(
  order: DbOrder,
  items: DbOrderItem[],
  contactId: number | null,
  commercialTotals: BlingCommercialTotals | null,
): Promise<BlingSalePreviewBuild> {
  const blockers: string[] = [];
  const customer = isRecord(order.snapshot.customer) ? order.snapshot.customer : {};
  const address = isRecord(customer.address) ? customer.address : {};
  const externalReference = order.bling_sale_reference ?? stableBlingSaleReference(order.id);
  const saleDate = blingSaleDate(order.created_at);
  const paymentLabel = paymentObservation(order.snapshot.paymentMethod);
  const customerName = safeText(customer.name);
  const street = safeText(address.street);
  const number = safeText(address.number);
  const neighborhood = safeText(address.neighborhood);
  const city = safeText(address.city);
  const state = safeText(address.state);
  const postalCode = safeText(address.postalCode);

  if (!externalReference || !saleDate) blockers.push("BLING_SALE_REFERENCE_OR_DATE_INVALID");
  if (!Number.isSafeInteger(contactId) || Number(contactId) <= 0) blockers.push("BLING_CUSTOMER_CONTACT_MAPPING_MISSING");
  if (!customerName || !street || !number || !neighborhood || !city || !state || !postalCode) {
    blockers.push("BLING_SALE_ADDRESS_INCOMPLETE");
  }
  if (!paymentLabel) blockers.push("BLING_SALE_PAYMENT_METHOD_UNSUPPORTED");
  if (!commercialTotals?.balances || !items.length) blockers.push("BLING_SALE_TOTALS_OR_ITEMS_INVALID");

  let lineTotalCents = 0;
  const previewItems: BlingSaleRequestPreview["itens"] = [];
  for (const item of items) {
    const snapshot = item.snapshot;
    const productIdText = typeof snapshot.blingProductId === "string" || typeof snapshot.blingProductId === "number"
      ? String(snapshot.blingProductId) : "";
    const productId = /^\d+$/.test(productIdText) ? Number(productIdText) : NaN;
    const sku = safeText(snapshot.sku);
    const description = safeText(snapshot.name);
    const unitPriceCents = Number(item.unit_price_cents);
    const quantity = item.picked_quantity;
    const expectedLineTotal = unitPriceCents * quantity;
    const actualLineTotal = Number(item.line_total_cents);
    if (!Number.isSafeInteger(productId) || productId <= 0 || !description
      || !Number.isSafeInteger(quantity) || quantity <= 0
      || !Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0
      || !Number.isSafeInteger(expectedLineTotal) || expectedLineTotal !== actualLineTotal) {
      blockers.push("BLING_SALE_ITEM_MAPPING_INVALID");
      continue;
    }
    lineTotalCents += actualLineTotal;
    previewItems.push({
      produto: { id: productId }, ...(sku ? { codigo: sku } : {}), descricao: description,
      quantidade: quantity, valor: unitPriceCents / 100,
    });
  }
  if (!Number.isSafeInteger(lineTotalCents) || lineTotalCents !== commercialTotals?.lineTotalCents
    || Number(order.total_cents) !== commercialTotals?.acceptedTotalCents) {
    blockers.push("BLING_SALE_TOTALS_OR_ITEMS_INVALID");
  }

  const summary = externalReference && saleDate && paymentLabel ? {
    externalReference, saleDate, itemCount: items.length, paymentObservation: `Pagamento: ${paymentLabel}`,
  } : null;
  if (blockers.length || !summary || !customerName || !street || !number || !neighborhood || !city || !state || !postalCode || !paymentLabel) {
    return { requestSha256: null, summary, blockers: [...new Set(blockers)], candidate: null };
  }

  // Match the active account's sale payload: payment is preserved in observations;
  // do not invent installment due dates or payment IDs that the workflow does not send.
  const request: BlingSaleRequestPreview = {
    contato: { id: Number(contactId) },
    data: summary.saleDate,
    numeroLoja: summary.externalReference,
    totalProdutos: lineTotalCents / 100,
    total: Number(order.total_cents) / 100,
    outrasDespesas: commercialTotals!.otherExpensesCents / 100,
    desconto: { valor: commercialTotals!.discountCents / 100, unidade: "REAL" },
    itens: previewItems,
    transporte: { etiqueta: {
      nome: customerName, endereco: street, numero: number,
      ...(safeText(address.complement) ? { complemento: safeText(address.complement)! } : {}),
      bairro: neighborhood, municipio: city, uf: state, cep: postalCode,
    } },
    observacoes: `Pagamento: ${paymentLabel}`,
  };
  return { requestSha256: await hashBlingSaleRequest(request), summary, blockers: [], candidate: request };
}

function orderPresentation(order: DbOrder, items: DbOrderItem[] = []) {
  const customer = isRecord(order.snapshot.customer) ? order.snapshot.customer : {};
  const address = isRecord(customer.address) ? customer.address : {};
  return {
    id: order.id,
    status: order.status,
    totalCents: Number(order.total_cents),
    basketName: String(order.snapshot.basketName ?? "Cesta"),
    customerName: String(customer.name ?? "Cliente"),
    city: String(address.city ?? ""),
    channel: order.channel,
    itemCount: items.length || (Array.isArray(order.snapshot.items) ? order.snapshot.items.length : 0),
    revision: order.revision,
    createdAt: order.created_at,
    items: items.map((item) => ({
      id: item.id, groupId: item.group_id, productId: item.product_id,
      name: String(item.snapshot.name ?? "Produto"), brand: String(item.snapshot.brand ?? ""),
      presentation: String(item.snapshot.presentation ?? ""), sku: String(item.snapshot.sku ?? ""),
      blingProductId: String(item.snapshot.blingProductId ?? ""), quantity: item.quantity,
      pickedQuantity: item.picked_quantity, pickingStatus: item.picking_status,
      replacementProductId: item.replacement_product_id,
      replacementOptions: [] as Array<{ id: string; name: string; brand: string }>,
    })),
    assignedOperatorId: order.assigned_operator_id,
    customerAcceptanceStatus: order.customer_acceptance_status,
    invoiceStatus: order.invoice_status,
    invoiceId: order.invoice_id,
    blingSaleId: order.bling_sale_id === null ? null : Number(order.bling_sale_id),
    attentionCode: order.attention_code,
    separationCompletedAt: order.separation_completed_at,
    dispatchedAt: order.dispatched_at,
    completedAt: order.completed_at,
    receivedPaymentCents: order.received_payment_cents === null ? null : Number(order.received_payment_cents),
    receivedPaymentMethod: ["pix", "cash", "debit_card", "credit_card"].includes(String(order.received_payment_method))
      ? order.received_payment_method as "pix" | "cash" | "debit_card" | "credit_card"
      : null,
    blingContactId: null as number | null,
    blingContactVerifiedAt: null as string | null,
    blingSaleReference: order.bling_sale_reference,
    invoiceJob: null as {
      status: string; errorCode: string | null; invoiceNumber: string | null;
      invoiceStatus: "authorized" | "pending" | "rejected" | "unknown" | null; danfeUrl: string | null;
    } | null,
    integrationJob: null as {
      operation: string; status: string; errorCode: string | null; blockers: string[];
      commercialTotals: BlingCommercialTotals | null;
      salePreview: (BlingSalePreviewSummary & { fingerprintReady: boolean }) | null;
      reconciliationEnabled: boolean;
      reconciliation: BlingSaleReconciliationSummary | null;
    } | null,
    dispatchJob: null as { status: string; errorCode: string | null } | null,
    deliveryJob: null as { status: string; errorCode: string | null } | null,
  };
}

async function loadOrder(orderId: string): Promise<{ order: DbOrder; items: DbOrderItem[] }> {
  const db = ordersDb();
  const rows = await db<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId}`;
  const order = rows[0];
  if (!order) throw new HttpError(404, "Pedido não encontrado.");
  const items = await db<DbOrderItem>`select * from whatsapp_atendimento.order_items where order_id = ${orderId} order by position`;
  return { order, items };
}

async function listOrders() {
  const db = ordersDb();
  const orders = await db<DbOrderQueueRow>`
    select id, status, total_cents, channel, revision, created_at,
      snapshot ->> 'basketName' as basket_name,
      snapshot #>> '{customer,name}' as customer_name,
      snapshot #>> '{customer,address,city}' as city,
      case when jsonb_typeof(snapshot -> 'items') = 'array'
        then jsonb_array_length(snapshot -> 'items') else 0 end as item_count
    from whatsapp_atendimento.orders
    where status not in ('completed', 'cancelled')
    order by created_at asc limit 200
  `;
  return orders.map((order) => ({
    id: order.id,
    status: order.status,
    totalCents: Number(order.total_cents),
    basketName: order.basket_name ?? "Cesta",
    customerName: order.customer_name ?? "Cliente",
    city: order.city ?? "",
    channel: order.channel,
    itemCount: Number(order.item_count),
    revision: order.revision,
    createdAt: order.created_at,
  }));
}

async function listOutboxMessages() {
  const db = ordersDb();
  const [countRows, messageRows] = await Promise.all([
    db<{ status: string; count: number }>`
      select status, count(*)::integer as count
      from whatsapp_atendimento.message_outbox
      group by status
    `,
    db<DbOutboxQueueRow>`
      select id, channel, message_type, status, available_at, created_at, sent_at, last_error_code,
        provider_status, provider_status_at, provider_error_code
      from whatsapp_atendimento.message_outbox
      order by created_at desc, id desc
      limit ${OUTBOX_RECENT_LIMIT}
    `,
  ]);
  const counts: Record<OutboxStatus, number> = { pending: 0, sent: 0, failed: 0, cancelled: 0 };
  for (const row of countRows) {
    if (row.status in counts) counts[row.status as OutboxStatus] = Number(row.count);
  }
  return {
    messages: messageRows.map((message) => ({
      id: message.id,
      channel: message.channel as WhatsAppChannel,
      messageType: message.message_type as OutboxMessageType,
      status: message.status as OutboxStatus,
      availableAt: message.available_at,
      createdAt: message.created_at,
      sentAt: message.sent_at,
      lastErrorCode: message.last_error_code,
      providerStatus: ["accepted", "sent", "delivered", "read", "failed"].includes(message.provider_status ?? "")
        ? message.provider_status as "accepted" | "sent" | "delivered" | "read" | "failed"
        : null,
      providerStatusAt: message.provider_status_at,
      providerErrorCode: message.provider_error_code && /^[0-9]{1,12}$/.test(message.provider_error_code)
        ? message.provider_error_code
        : null,
    })),
    counts,
    senderEnabled: Deno.env.get("META_OUTBOX_SENDER_ENABLED") === "true",
    limit: OUTBOX_RECENT_LIMIT,
  };
}

async function orderDetail(orderId: string) {
  const { order, items } = await loadOrder(orderId);
  const customer = isRecord(order.snapshot.customer) ? order.snapshot.customer : {};
  const address = isRecord(customer.address) ? customer.address : {};
  const detail = {
    ...orderPresentation(order, items),
    paymentMethod: safeText(order.snapshot.paymentMethod),
    deliveryAddress: {
      street: safeText(address.street),
      number: safeText(address.number),
      complement: safeText(address.complement),
      neighborhood: safeText(address.neighborhood),
      city: safeText(address.city),
      state: safeText(address.state),
      postalCode: safeText(address.postalCode),
      reference: safeText(address.reference),
    },
  };
  const db = ordersDb();
  const customerId = typeof customer.customerId === "string" ? customer.customerId : "";
  if (ORDER_ID.test(customerId)) {
    const contactMappings = await db<{ bling_contact_id: number; verified_at: string }>`
      select bling_contact_id, verified_at from whatsapp_atendimento.customer_bling_contacts where customer_id = ${customerId}
    `;
    if (contactMappings[0]) {
      detail.blingContactId = Number(contactMappings[0].bling_contact_id);
      detail.blingContactVerifiedAt = contactMappings[0].verified_at;
    }
  }
  const jobs = await db<{
    operation: string; status: string; error_code: string | null; request_sha256: string | null; result_summary: Record<string, unknown>;
  }>`select operation, status, error_code, request_sha256, result_summary from whatsapp_atendimento.integration_jobs where order_id = ${orderId} and operation in ('create_sale', 'generate_invoice', 'start_dispatch', 'complete_delivery') order by created_at desc`;
  const saleJob = jobs.find((job) => job.operation === "create_sale");
  const invoiceJob = jobs.find((job) => job.operation === "generate_invoice");
  const dispatchJob = jobs.find((job) => job.operation === "start_dispatch");
  const deliveryJob = jobs.find((job) => job.operation === "complete_delivery");
  detail.dispatchJob = dispatchJob ? { status: dispatchJob.status, errorCode: dispatchJob.error_code } : null;
  detail.deliveryJob = deliveryJob ? { status: deliveryJob.status, errorCode: deliveryJob.error_code } : null;
  if (invoiceJob) {
    const rawInvoiceStatus = invoiceJob.result_summary.invoiceStatus;
    detail.invoiceJob = {
      status: invoiceJob.status,
      errorCode: invoiceJob.error_code,
      invoiceNumber: typeof invoiceJob.result_summary.invoiceNumber === "string" ? invoiceJob.result_summary.invoiceNumber : null,
      invoiceStatus: ["authorized", "pending", "rejected", "unknown"].includes(String(rawInvoiceStatus))
        ? rawInvoiceStatus as "authorized" | "pending" | "rejected" | "unknown"
        : null,
      danfeUrl: typeof invoiceJob.result_summary.danfeUrl === "string"
        && /^https:\/\/([a-z0-9-]+\.)*bling\.com\.br\//i.test(invoiceJob.result_summary.danfeUrl)
        ? invoiceJob.result_summary.danfeUrl : null,
    };
  }
  if (saleJob) {
    const blockers = Array.isArray(saleJob.result_summary.blockers)
      ? saleJob.result_summary.blockers.filter((value): value is string => typeof value === "string")
      : [];
    const rawTotals = saleJob.result_summary.commercialTotals;
    const commercialTotals = isRecord(rawTotals)
      && typeof rawTotals.lineTotalCents === "number" && Number.isSafeInteger(rawTotals.lineTotalCents)
      && typeof rawTotals.acceptedTotalCents === "number" && Number.isSafeInteger(rawTotals.acceptedTotalCents)
      && typeof rawTotals.commercialDeltaCents === "number" && Number.isSafeInteger(rawTotals.commercialDeltaCents)
      && typeof rawTotals.otherExpensesCents === "number" && Number.isSafeInteger(rawTotals.otherExpensesCents)
      && typeof rawTotals.discountCents === "number" && Number.isSafeInteger(rawTotals.discountCents)
      && typeof rawTotals.balances === "boolean"
      ? rawTotals as unknown as BlingCommercialTotals
      : null;
    const rawPreview = saleJob.result_summary.salePreview;
    const salePreview = isRecord(rawPreview)
      && typeof rawPreview.externalReference === "string"
      && typeof rawPreview.saleDate === "string"
      && typeof rawPreview.itemCount === "number" && Number.isSafeInteger(rawPreview.itemCount)
      && typeof rawPreview.paymentObservation === "string"
      ? {
        externalReference: rawPreview.externalReference,
        saleDate: rawPreview.saleDate,
        itemCount: rawPreview.itemCount,
        paymentObservation: rawPreview.paymentObservation,
      fingerprintReady: /^[0-9a-f]{64}$/.test(saleJob.request_sha256 ?? ""),
      }
      : null;
    const rawReconciliation = saleJob.result_summary.reconciliation;
    const reconciliation = isRecord(rawReconciliation)
      && (rawReconciliation.status === "running" || rawReconciliation.status === "complete")
      ? {
        status: rawReconciliation.status as "running" | "complete",
        outcome: ["absent", "matched", "ambiguous", "unknown"].includes(String(rawReconciliation.outcome))
          ? rawReconciliation.outcome as BlingSaleReconciliationOutcome
          : null,
        externalId: typeof rawReconciliation.externalId === "string" && /^\d+$/.test(rawReconciliation.externalId)
          ? rawReconciliation.externalId
          : null,
        startedAt: typeof rawReconciliation.startedAt === "string" ? rawReconciliation.startedAt : null,
        completedAt: typeof rawReconciliation.completedAt === "string" ? rawReconciliation.completedAt : null,
        idempotencyKey: null,
      }
      : null;
    detail.integrationJob = {
      operation: saleJob.operation, status: saleJob.status, errorCode: saleJob.error_code, blockers, commercialTotals, salePreview,
      reconciliationEnabled: true,
      reconciliation,
    };
  }
  const catalog = await catalogAt(String(order.snapshot.catalogCommit ?? ""));
  const basket = catalog.baskets.baskets.find((candidate) => candidate.id === order.snapshot.basketId);
  const products = new Map(catalog.products.products.map((product) => [product.id, product]));
  detail.items = detail.items.map((item) => ({
    ...item,
    replacementOptions: (basket?.groups.find((group) => group.id === item.groupId)?.productIds ?? [])
      .map((id) => products.get(id)).filter((product): product is Product => Boolean(product?.active))
      .map((product) => ({ id: product.id, name: product.name, brand: product.brand })),
  }));
  return detail;
}

async function catalogAt(commit: string): Promise<CatalogDocuments> {
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new HttpError(409, "A revisão de catálogo do pedido é inválida.");
  const token = await installationToken("read");
  const ref = new URLSearchParams({ ref: commit });
  const [productsFile, basketsFile] = await Promise.all([
    githubJson<{ content: string }>(repositoryPath(`/contents/${PRODUCTS_PATH}?${ref}`), token),
    githubJson<{ content: string }>(repositoryPath(`/contents/${BASKETS_PATH}?${ref}`), token),
  ]);
  let documents: CatalogDocuments;
  try {
    documents = { products: JSON.parse(decodeFileContent(productsFile.content)), baskets: JSON.parse(decodeFileContent(basketsFile.content)) };
  } catch { throw new HttpError(502, "O catálogo fixado pelo pedido não pôde ser lido."); }
  const errors = validateCatalog(documents);
  if (errors.length) throw new HttpError(502, "O catálogo fixado pelo pedido não passou na validação.");
  return documents;
}

async function encryptOutboxPayload(value: unknown): Promise<{ iv: string; ciphertext: string }> {
  const configured = Deno.env.get("META_OUTBOX_ENCRYPTION_KEY");
  if (!configured) throw new HttpError(503, "A chave privada da outbox não está configurada.");
  let raw: Uint8Array;
  try { raw = Uint8Array.from(atob(configured), (char) => char.charCodeAt(0)); } catch { throw new HttpError(503, "A chave da outbox tem formato inválido."); }
  if (raw.byteLength !== 32) throw new HttpError(503, "A chave da outbox tem formato inválido.");
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(raw), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(iv) }, key, asArrayBuffer(new TextEncoder().encode(JSON.stringify(value))));
  return { iv: btoa(String.fromCharCode(...iv)), ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))) };
}

function blingOAuthConfig() {
  const clientId = Deno.env.get("BLING_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("BLING_CLIENT_SECRET");
  const redirectUri = Deno.env.get("BLING_REDIRECT_URI")?.trim();
  const enabled = Deno.env.get("BLING_OAUTH_ENABLED") === "true";
  if (!enabled) throw new HttpError(503, "A conexão Bling está desabilitada neste ambiente.");
  if (!clientId || !clientSecret || !redirectUri) throw new HttpError(503, "A conexão Bling não está configurada no servidor.");
  let callback: URL;
  try { callback = new URL(redirectUri); } catch { throw new HttpError(503, "O endereço de retorno OAuth do Bling é inválido."); }
  if (callback.protocol !== "https:" && callback.hostname !== "localhost") {
    throw new HttpError(503, "O endereço de retorno OAuth do Bling precisa usar HTTPS.");
  }
  return { clientId, clientSecret, redirectUri };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function blingEncryptionKey(): Promise<CryptoKey> {
  const encoded = Deno.env.get("BLING_TOKEN_ENCRYPTION_KEY");
  if (!encoded) throw new HttpError(503, "A chave privada das credenciais Bling não está configurada.");
  let raw: Uint8Array;
  try { raw = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)); }
  catch { throw new HttpError(503, "A chave privada das credenciais Bling tem formato inválido."); }
  if (raw.byteLength !== 32) throw new HttpError(503, "A chave privada das credenciais Bling tem formato inválido.");
  return crypto.subtle.importKey("raw", asArrayBuffer(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function oauthStateHash(state: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encryptBlingTokens(tokens: Record<string, unknown>): Promise<{ nonce: string; ciphertext: string }> {
  const key = await blingEncryptionKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(tokens));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(nonce), additionalData: new TextEncoder().encode("whatsapp_atendimento:bling:v1") },
    key,
    asArrayBuffer(plaintext),
  );
  return { nonce: base64(nonce), ciphertext: base64(new Uint8Array(encrypted)) };
}

async function decryptBlingTokens(ciphertext: string, nonce: string): Promise<Record<string, unknown>> {
  let nonceBytes: Uint8Array;
  let encryptedBytes: Uint8Array;
  try {
    nonceBytes = Uint8Array.from(atob(nonce), (char) => char.charCodeAt(0));
    encryptedBytes = Uint8Array.from(atob(ciphertext), (char) => char.charCodeAt(0));
  } catch { throw new HttpError(503, "As credenciais armazenadas do Bling não puderam ser lidas."); }
  if (nonceBytes.byteLength !== 12) throw new HttpError(503, "As credenciais armazenadas do Bling não puderam ser lidas.");
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asArrayBuffer(nonceBytes), additionalData: new TextEncoder().encode("whatsapp_atendimento:bling:v1") },
      await blingEncryptionKey(),
      asArrayBuffer(encryptedBytes),
    );
  } catch { throw new HttpError(503, "As credenciais armazenadas do Bling não puderam ser lidas."); }
  let tokens: unknown;
  try { tokens = JSON.parse(new TextDecoder().decode(plaintext)); } catch { throw new HttpError(503, "As credenciais armazenadas do Bling não puderam ser lidas."); }
  if (!isRecord(tokens) || typeof tokens.access_token !== "string" || !tokens.access_token
    || typeof tokens.refresh_token !== "string" || !tokens.refresh_token) {
    throw new HttpError(503, "As credenciais armazenadas do Bling não puderam ser lidas.");
  }
  return tokens;
}

function blingTokenEndpointAuth(clientId: string, clientSecret: string): string {
  return `Basic ${base64(new TextEncoder().encode(`${clientId}:${clientSecret}`))}`;
}

async function exchangeBlingAuthorizationCode(code: string, config: ReturnType<typeof blingOAuthConfig>) {
  const response = await fetch(BLING_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: blingTokenEndpointAuth(config.clientId, config.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri }),
  });
  if (!response.ok) throw new HttpError(502, "O Bling não concluiu a conexão. Inicie uma nova tentativa pelo Admin.");
  let tokens: unknown;
  try { tokens = await response.json(); } catch { throw new HttpError(502, "O Bling retornou uma resposta de conexão inválida."); }
  if (!isRecord(tokens) || typeof tokens.access_token !== "string" || !tokens.access_token
    || typeof tokens.refresh_token !== "string" || !tokens.refresh_token
    || typeof tokens.expires_in !== "number" || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) {
    throw new HttpError(502, "O Bling retornou credenciais incompletas.");
  }
  return tokens;
}

async function getBlingAccessToken(): Promise<string> {
  const config = blingOAuthConfig();
  return await ordersDb().begin(async (tx) => {
    // Serialize token refresh across Edge Function instances because Bling rotates refresh tokens.
    await tx`select pg_advisory_xact_lock(517520261025)`;
    const rows = await tx<{ ciphertext: string; nonce: string; expires_at: Date; scopes: string[] }>`
      select ciphertext, nonce, expires_at, scopes
      from whatsapp_atendimento.integration_credentials
      where provider = 'bling'
      for update
    `;
    const stored = rows[0];
    if (!stored) throw new HttpError(503, "A conta Bling ainda não foi conectada.");
    const tokens = await decryptBlingTokens(stored.ciphertext, stored.nonce);
    if (stored.expires_at.getTime() > Date.now() + 30_000) return String(tokens.access_token);

    const response = await fetch(BLING_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: blingTokenEndpointAuth(config.clientId, config.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: String(tokens.refresh_token) }),
    });
    if (!response.ok) throw new HttpError(503, "A sessão Bling expirou ou não pôde ser renovada. Reconecte a conta pelo Admin.");
    let renewed: unknown;
    try { renewed = await response.json(); } catch { throw new HttpError(503, "O Bling retornou uma renovação inválida."); }
    if (!isRecord(renewed) || typeof renewed.access_token !== "string" || !renewed.access_token
      || typeof renewed.refresh_token !== "string" || !renewed.refresh_token
      || typeof renewed.expires_in !== "number" || !Number.isFinite(renewed.expires_in) || renewed.expires_in <= 0) {
      throw new HttpError(503, "O Bling retornou credenciais incompletas na renovação.");
    }
    const encrypted = await encryptBlingTokens(renewed);
    const scope = typeof renewed.scope === "string" ? renewed.scope.trim().split(/\s+/).filter(Boolean) : stored.scopes;
    const expiresAt = new Date(Date.now() + Math.max(1, Math.floor(Number(renewed.expires_in)) - 60) * 1000).toISOString();
    await tx`
      update whatsapp_atendimento.integration_credentials
      set ciphertext = ${encrypted.ciphertext}, nonce = ${encrypted.nonce}, expires_at = ${expiresAt}, scopes = ${scope}, updated_at = now()
      where provider = 'bling'
    `;
    return renewed.access_token;
  });
}

async function sharedBlingRpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serviceKey = supabaseSecretKey();
  if (!base || !serviceKey || !/^(get_bling_api_credentials_v1|claim_bling_hub_oauth_lock_v2|release_bling_hub_oauth_lock_v2|set_bling_api_refresh_token_v1|reserve_bling_hub_rate_slot_v2)$/.test(name)) {
    throw new HttpError(503, "A conexão Bling compartilhada não está disponível no servidor.");
  }
  const headers = new Headers({ apikey: serviceKey, "Content-Type": "application/json" });
  if (!serviceKey.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${serviceKey}`);
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new HttpError(503, "A conexão Bling existente não pôde ser consultada.");
  return await response.json() as T;
}

async function getSharedBlingAccessToken(): Promise<string> {
  const owner = crypto.randomUUID();
  let locked = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const claimed = await sharedBlingRpc<boolean>("claim_bling_hub_oauth_lock_v2", { p_owner: owner, p_ttl_seconds: 90 });
    if (claimed === true) { locked = true; break; }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, [800, 1800, 3200][attempt]));
  }
  if (!locked) throw new HttpError(503, "A renovação segura da sessão Bling está ocupada. Tente novamente.");
  try {
    const raw = await sharedBlingRpc<unknown>("get_bling_api_credentials_v1");
    if (!isRecord(raw)) throw new HttpError(503, "A conexão Bling compartilhada está incompleta.");
    const clientId = typeof raw.client_id === "string" ? raw.client_id.trim() : "";
    const clientSecret = typeof raw.client_secret === "string" ? raw.client_secret.trim() : "";
    const refreshToken = typeof raw.refresh_token === "string" ? raw.refresh_token.trim() : "";
    if (!clientId || !clientSecret || !refreshToken) throw new HttpError(503, "A conexão Bling compartilhada está incompleta.");
    const authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    const endpoints = ["https://api.bling.com.br/oauth/token", BLING_TOKEN_URL];
    let tokenResult: Record<string, unknown> | null = null;
    let lastStatus = 0;
    for (const endpoint of endpoints) {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: authorization, "Content-Type": "application/x-www-form-urlencoded", Accept: "1.0", "enable-jwt": "1" },
          body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch { throw new HttpError(503, "O Bling não respondeu à renovação do token."); }
      lastStatus = response.status;
      const parsed = await response.json().catch(() => ({}));
      if (response.ok && isRecord(parsed) && typeof parsed.access_token === "string" && parsed.access_token) {
        tokenResult = parsed;
        break;
      }
      if (![403, 404, 405].includes(response.status)) break;
    }
    if (!tokenResult) {
      void lastStatus;
      throw new HttpError(503, "O Bling não autorizou a renovação da conexão existente.");
    }
    const rotated = typeof tokenResult.refresh_token === "string" ? tokenResult.refresh_token.trim() : "";
    if (rotated && rotated !== refreshToken) {
      await sharedBlingRpc("set_bling_api_refresh_token_v1", { p_refresh_token: rotated });
    }
    return String(tokenResult.access_token);
  } finally {
    await sharedBlingRpc("release_bling_hub_oauth_lock_v2", { p_owner: owner }).catch(() => undefined);
  }
}

async function sharedBlingRequest(path: string, method: "GET" | "POST", body?: unknown, accessToken?: string): Promise<{ status: number; data: unknown }> {
  const endpoint = new URL(path.replace(/^\/+/, ""), `${BLING_API}/`);
  if (endpoint.origin !== "https://api.bling.com.br" || !endpoint.pathname.startsWith("/Api/v3/")) {
    throw new HttpError(400, "O caminho solicitado ao Bling não é permitido.");
  }
  const wait = await sharedBlingRpc<number>("reserve_bling_hub_rate_slot_v2");
  if (Number(wait) > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(Number(wait), 10_000)));
  const token = accessToken ?? await getSharedBlingAccessToken();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "enable-jwt": "1",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(method === "GET" ? 10_000 : 15_000),
    });
  } catch { throw new HttpError(502, "O Bling não respondeu à operação solicitada."); }
  const raw = await response.text();
  let data: unknown = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  return { status: response.status, data };
}

/** Read-only server-side client. Keep order writes behind their own preflight and idempotent job handlers. */
export async function blingApiGet(path: string): Promise<unknown> {
  if (typeof path !== "string" || !path.startsWith("/")) throw new HttpError(400, "O caminho Bling precisa ser relativo à API v3.");
  const endpoint = new URL(path.replace(/^\/+/, ""), `${BLING_API}/`);
  if (endpoint.origin !== "https://api.bling.com.br" || !endpoint.pathname.startsWith("/Api/v3/")) {
    throw new HttpError(400, "O caminho Bling solicitado não é permitido.");
  }
  const accessToken = await getBlingAccessToken();
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) throw new HttpError(502, "O Bling não concluiu a consulta solicitada.");
  try { return await response.json(); } catch { throw new HttpError(502, "O Bling retornou uma resposta inválida."); }
}

async function lookupBlingProductByCatalogGtin(productId: string) {
  if (Deno.env.get("BLING_PRODUCT_LOOKUP_ENABLED") !== "true"
    || Deno.env.get("BLING_OAUTH_ENABLED") !== "true") {
    throw new HttpError(503, "A consulta de produtos Bling está desabilitada neste ambiente.");
  }
  if (!ORDER_ID.test(productId)) throw new HttpError(400, "O produto selecionado é inválido.");

  const catalog = await readCatalog(await installationToken("read"));
  const product = catalog.products.products.find((item: Product) => item.id === productId);
  if (!product) throw new HttpError(404, "O produto não existe na revisão atual do catálogo GitHub.");
  if (product.blingProductId?.trim()) throw new HttpError(409, "Este produto já tem um ID Bling no catálogo. Revise o cadastro atual antes de substituir.");

  const gtin = product.gtin?.replace(/\D/g, "") ?? "";
  if (!/^(?:\d{8}|\d{12,14})$/.test(gtin)) {
    throw new HttpError(422, "Cadastre um GTIN/EAN válido no catálogo GitHub antes de consultar o Bling.");
  }

  const query = new URLSearchParams();
  query.append("gtins[]", gtin);
  const response = await blingApiGet(`/produtos?${query.toString()}`);
  if (!isRecord(response) || !Array.isArray(response.data)) {
    throw new HttpError(502, "O Bling retornou uma lista de produtos inválida.");
  }
  if (response.data.length > 25) {
    throw new HttpError(502, "A busca por GTIN retornou muitos resultados para uma associação segura.");
  }

  const products = new Map<string, { id: string; name: string; sku: string | null }>();
  for (const value of response.data) {
    if (!isRecord(value)) continue;
    const id = typeof value.id === "string" && /^\d{1,20}$/.test(value.id)
      ? value.id
      : typeof value.id === "number" && Number.isSafeInteger(value.id) && value.id > 0
        ? String(value.id)
        : "";
    const name = typeof value.nome === "string" ? value.nome.trim().slice(0, 160) : "";
    if (!id || !name) continue;
    const sku = typeof value.codigo === "string" && value.codigo.trim()
      ? value.codigo.trim().slice(0, 80)
      : null;
    products.set(id, { id, name, sku });
  }
  return { gtin, products: [...products.values()] };
}

async function startBlingOAuth(operatorId: string) {
  const config = blingOAuthConfig();
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const stateHash = await oauthStateHash(state);
  await ordersDb()`
    insert into whatsapp_atendimento.integration_oauth_states (state_hash, created_by, expires_at)
    values (${stateHash}, ${operatorId}, now() + interval '5 minutes')
  `;
  const authorizeUrl = new URL(BLING_AUTHORIZE_URL);
  authorizeUrl.search = new URLSearchParams({ response_type: "code", client_id: config.clientId, state }).toString();
  return { authorizeUrl: authorizeUrl.toString(), expiresInSeconds: 300 };
}

async function blingOAuthCallback(url: URL): Promise<Response> {
  const text = (message: string, status = 200) => new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
  try {
    const config = blingOAuthConfig();
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (url.searchParams.has("error") || !/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 2048) {
      throw new HttpError(400, "A tentativa de conexão expirou ou foi recusada. Inicie outra pelo Admin.");
    }
    const stateHash = await oauthStateHash(state);
    const consumed = await ordersDb()`
      update whatsapp_atendimento.integration_oauth_states
      set consumed_at = now()
      where state_hash = ${stateHash} and consumed_at is null and expires_at > now()
      returning created_by
    `;
    if (!consumed.length) throw new HttpError(400, "A tentativa de conexão expirou ou já foi utilizada. Inicie outra pelo Admin.");

    const tokens = await exchangeBlingAuthorizationCode(code, config);
    const encrypted = await encryptBlingTokens(tokens);
    const scope = typeof tokens.scope === "string" ? tokens.scope.trim().split(/\s+/).filter(Boolean) : [];
    const expiresIn = tokens.expires_in;
    if (typeof expiresIn !== "number") throw new HttpError(502, "O Bling retornou credenciais incompletas.");
    const expiresAt = new Date(Date.now() + Math.max(1, Math.floor(expiresIn) - 60) * 1000).toISOString();
    await ordersDb()`
      insert into whatsapp_atendimento.integration_credentials (provider, ciphertext, nonce, expires_at, scopes)
      values ('bling', ${encrypted.ciphertext}, ${encrypted.nonce}, ${expiresAt}, ${scope})
      on conflict (provider) do update set ciphertext = excluded.ciphertext, nonce = excluded.nonce,
        expires_at = excluded.expires_at, scopes = excluded.scopes, updated_at = now()
    `;
    return text("Conta Bling conectada. Você pode voltar ao Admin.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) console.error("Bling OAuth callback failed", error instanceof Error ? error.name : "unknown error");
    return text(error instanceof HttpError ? error.message : "Não foi possível concluir a conexão Bling.", status);
  }
}

function adjustedSnapshot(snapshot: Record<string, unknown>, basket: Basket, products: Product[], selections: BasketSelections) {
  const adjustmentBasket: Basket = {
    ...basket,
    groups: basket.groups.map((group) => ({ ...group, minimumQuantity: 0, removalAllowed: true })),
  };
  const quote = quoteBasket(adjustmentBasket, products, selections);
  const productById = new Map(products.map((product) => [product.id, product]));
  const items = basket.groups.flatMap((group) => {
    const choice = quote.selections[group.id];
    if (!choice.quantity) return [];
    const product = productById.get(choice.productId);
    if (!product?.blingProductId) throw new HttpError(409, `A opção ${product?.name ?? choice.productId} ainda não possui vínculo Bling.`);
    return [{
      groupId: group.id, productId: product.id, name: product.name, brand: product.brand,
      presentation: product.presentation, sku: product.sku, gtin: product.gtin,
      blingProductId: product.blingProductId, quantity: choice.quantity,
      unitPriceCents: product.unitPriceCents, lineTotalCents: product.unitPriceCents * choice.quantity,
    }];
  });
  return { ...snapshot, selections: quote.selections, items, totalCents: quote.totalCents };
}

async function savePicking(orderId: string, operatorId: string, body: Record<string, unknown>) {
  const revision = body.revision;
  const itemId = body.itemId;
  const pickedQuantity = body.pickedQuantity;
  const replacementProductId = body.replacementProductId;
  if (replacementProductId !== undefined && typeof replacementProductId !== "string") {
    throw new HttpError(400, "O produto substituto é inválido.");
  }
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || typeof itemId !== "number" || !Number.isSafeInteger(itemId)
    || typeof pickedQuantity !== "number" || !Number.isSafeInteger(pickedQuantity)) {
    throw new HttpError(400, "Revisão, item e quantidade separada são obrigatórios.");
  }
  const db = ordersDb();
  await db.begin(async (tx) => {
    const orders = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
    const order = orders[0];
    if (!order) throw new HttpError(404, "Pedido não encontrado.");
    if (order.revision !== revision) throw new HttpError(409, "O pedido foi atualizado por outro operador. Recarregue o detalhe.");
    if (!['received', 'packing', 'attention'].includes(order.status) || order.customer_acceptance_status === 'pending') {
      throw new HttpError(409, "Este pedido não está disponível para alteração de separação.");
    }
    const currentRows = await tx<DbOrderItem>`select * from whatsapp_atendimento.order_items where order_id = ${orderId} order by position for update`;
    const target = currentRows.find((row) => row.id === itemId);
    if (!target || pickedQuantity < 0 || pickedQuantity > target.quantity) throw new HttpError(422, "A quantidade separada precisa estar entre zero e a quantidade pedida.");
    const snapshot = order.snapshot;
    if (!isRecord(snapshot.selections)) throw new HttpError(409, "Este pedido não contém as seleções necessárias para recalcular uma falta.");
    const catalog = await catalogAt(String(snapshot.catalogCommit ?? ""));
    const basket = catalog.baskets.baskets.find((candidate) => candidate.id === snapshot.basketId && candidate.active);
    if (!basket) throw new HttpError(409, "A cesta do pedido não existe mais na revisão fixada.");
    const originalChoice = snapshot.selections[target.group_id];
    if (!isRecord(originalChoice) || typeof originalChoice.productId !== "string" || !Number.isSafeInteger(originalChoice.quantity)) {
      throw new HttpError(409, "A seleção desta linha está incompleta.");
    }
    const choiceProductId = typeof replacementProductId === "string" && replacementProductId ? replacementProductId : target.product_id;
    const selectionQuantity = choiceProductId !== target.product_id ? target.quantity : pickedQuantity;
    const selections: BasketSelections = structuredClone(snapshot.selections) as BasketSelections;
    selections[target.group_id] = { productId: choiceProductId, quantity: selectionQuantity };
    let nextSnapshot: Record<string, unknown>;
    try { nextSnapshot = adjustedSnapshot(snapshot, basket, catalog.products.products, selections); }
    catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "A seleção não pode ser recalculada."); }

    const changed = choiceProductId !== target.product_id || selectionQuantity !== target.quantity;
    if (changed) {
      const nextRevision = order.revision + 1;
      const customer = isRecord(snapshot.customer) ? snapshot.customer : {};
      const phone = String(customer.phoneE164 ?? "");
      if (!/^\\+[1-9][0-9]{1,14}$/.test(phone)) throw new HttpError(409, "O telefone do pedido não está disponível para pedir aceite.");
      const encrypted = await encryptOutboxPayload({
        messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "interactive",
          interactive: {
          type: "button",
          body: { text: `Ajuste na separação da cesta ${String(snapshot.basketName ?? "")}: ${String(target.snapshot.name ?? "Produto")} (${target.quantity} un.) → ${choiceProductId === target.product_id ? `${selectionQuantity} un.` : `${String((nextSnapshot.items as Array<Record<string, unknown>>).find((item) => item.groupId === target.group_id)?.name ?? "Substituto")} (${selectionQuantity} un.)`}. O total atualizado é ${(Number(nextSnapshot.totalCents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Deseja aceitar?` },
          action: { buttons: [
            { type: "reply", reply: { id: `accept-adjustment:${orderId}:${nextRevision}`, title: "Aceitar alteração" } },
            { type: "reply", reply: { id: `cancel-adjustment:${orderId}:${nextRevision}`, title: "Cancelar pedido" } },
          ] },
        },
      });
      await tx`
        update whatsapp_atendimento.orders set status = 'attention', attention_code = 'customer_adjustment_pending',
          pending_customer_snapshot = ${tx.json(nextSnapshot)}, pending_customer_total_cents = ${Number(nextSnapshot.totalCents)},
          customer_acceptance_status = 'pending', assigned_operator_id = ${operatorId}, revision = ${nextRevision}, updated_at = now()
        where id = ${orderId}
      `;
      await tx`
        insert into whatsapp_atendimento.message_outbox (channel, event_key, message_type, payload_iv, payload_ciphertext)
        values (${order.channel}, ${`${orderId}:adjustment:${nextRevision}`}, 'order_adjustment', ${encrypted.iv}, ${encrypted.ciphertext})
        on conflict (event_key) do nothing
      `;
      await tx`
        insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data)
        values (${orderId}, ${`${orderId}:adjustment:${nextRevision}`}, 'customer_adjustment_requested', ${tx.json({ revision: nextRevision, itemId, previousTotalCents: Number(order.total_cents), nextTotalCents: Number(nextSnapshot.totalCents) })})
        on conflict (event_key) do nothing
      `;
    } else {
      await tx`update whatsapp_atendimento.order_items set picked_quantity = ${pickedQuantity}, picking_status = ${pickedQuantity === target.quantity ? 'separated' : pickedQuantity === 0 ? 'pending' : 'partial'} where id = ${itemId}`;
      await tx`update whatsapp_atendimento.orders set status = 'packing', assigned_operator_id = ${operatorId}, revision = revision + 1, attention_code = null, updated_at = now() where id = ${orderId}`;
      await tx`
        insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data)
        values (${orderId}, ${`${orderId}:pick:${order.revision + 1}`}, 'item_picked', ${tx.json({ itemId, pickedQuantity, operatorId })})
        on conflict (event_key) do nothing
      `;
    }
  });
  return orderDetail(orderId);
}

async function assignOrder(orderId: string, operatorId: string, body: Record<string, unknown>) {
  if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision)) throw new HttpError(400, "A revisão do pedido é obrigatória.");
  const db = ordersDb();
  await db.begin(async (tx) => {
    const rows = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
    const order = rows[0];
    if (!order) throw new HttpError(404, "Pedido não encontrado.");
    if (order.revision !== body.revision) throw new HttpError(409, "O pedido mudou. Recarregue antes de assumir a separação.");
    if (!['received', 'packing', 'attention'].includes(order.status) || order.customer_acceptance_status === 'pending') throw new HttpError(409, "Este pedido não pode ser assumido para separação.");
    await tx`update whatsapp_atendimento.orders set assigned_operator_id = ${operatorId}, status = 'packing', revision = revision + 1, updated_at = now() where id = ${orderId}`;
    await tx`insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data) values (${orderId}, ${`${orderId}:assigned:${order.revision + 1}`}, 'separation_assigned', ${tx.json({ operatorId })}) on conflict (event_key) do nothing`;
  });
  return orderDetail(orderId);
}

async function saveOrderBlingContact(orderId: string, operatorId: string, body: Record<string, unknown>) {
  if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision)) throw new HttpError(400, "A revisão do pedido é obrigatória.");
  const blingContactId = body.blingContactId;
  if (typeof blingContactId !== "number" || !Number.isSafeInteger(blingContactId) || blingContactId <= 0) {
    throw new HttpError(400, "Informe um ID de contato Bling válido.");
  }
  if (body.customerMatchConfirmed !== true) throw new HttpError(400, "Confirme que verificou o contato no Bling.");
  const db = ordersDb();
  try {
    await db.begin(async (tx) => {
      const rows = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
      const order = rows[0];
      if (!order) throw new HttpError(404, "Pedido não encontrado.");
      if (order.revision !== body.revision) throw new HttpError(409, "O pedido mudou. Recarregue o detalhe.");
      const customer = isRecord(order.snapshot.customer) ? order.snapshot.customer : {};
      const customerId = typeof customer.customerId === "string" ? customer.customerId : "";
      if (!ORDER_ID.test(customerId)) throw new HttpError(409, "Este pedido não tem um cliente cadastrado para vincular.");
      await tx`select pg_advisory_xact_lock(hashtext(${customerId}))`;

      const duplicate = await tx<{ customer_id: string }>`
        select customer_id from whatsapp_atendimento.customer_bling_contacts
        where bling_contact_id = ${blingContactId} and customer_id <> ${customerId}
      `;
      if (duplicate.length) throw new HttpError(409, "Este contato Bling já está vinculado a outro cliente.");
      const current = await tx<{ bling_contact_id: number }>`
        select bling_contact_id from whatsapp_atendimento.customer_bling_contacts where customer_id = ${customerId}
      `;
      if (!current[0] || Number(current[0].bling_contact_id) !== blingContactId) {
        await tx`
          insert into whatsapp_atendimento.customer_bling_contacts (customer_id, bling_contact_id, verified_at, updated_by)
          values (${customerId}, ${blingContactId}, now(), ${operatorId})
          on conflict (customer_id) do update
          set bling_contact_id = excluded.bling_contact_id, verified_at = excluded.verified_at,
              updated_by = excluded.updated_by, updated_at = now()
        `;
        await tx`update whatsapp_atendimento.orders set revision = revision + 1, updated_at = now() where id = ${orderId}`;
        await tx`
          insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data)
          values (${orderId}, ${`${orderId}:bling-contact:${order.revision + 1}`}, 'bling_contact_linked',
            ${tx.json({ operatorId, customerId, blingContactId })})
          on conflict (event_key) do nothing
        `;
      }
      const affectedOrders = await tx<DbOrder & { result_summary: Record<string, unknown> }>`
        select o.*, j.result_summary
        from whatsapp_atendimento.orders o
        join whatsapp_atendimento.integration_jobs j on j.order_id = o.id
        where o.snapshot #>> '{customer,customerId}' = ${customerId}
          and j.operation = 'create_sale' and j.status = 'blocked' and j.error_code = 'BLING_PREFLIGHT_REQUIRED'
        order by o.created_at, o.id
      `;
      for (const affectedOrder of affectedOrders) {
        const affectedItems = await tx<DbOrderItem>`
          select * from whatsapp_atendimento.order_items where order_id = ${affectedOrder.id} order by position
        `;
        const rawTotals = affectedOrder.result_summary.commercialTotals;
        const totals = isRecord(rawTotals)
          && typeof rawTotals.lineTotalCents === "number" && Number.isSafeInteger(rawTotals.lineTotalCents)
          && typeof rawTotals.acceptedTotalCents === "number" && Number.isSafeInteger(rawTotals.acceptedTotalCents)
          && typeof rawTotals.commercialDeltaCents === "number" && Number.isSafeInteger(rawTotals.commercialDeltaCents)
          && typeof rawTotals.otherExpensesCents === "number" && Number.isSafeInteger(rawTotals.otherExpensesCents)
          && typeof rawTotals.discountCents === "number" && Number.isSafeInteger(rawTotals.discountCents)
          && typeof rawTotals.balances === "boolean"
          ? rawTotals as unknown as BlingCommercialTotals
          : null;
        const reference = affectedOrder.bling_sale_reference ?? stableBlingSaleReference(affectedOrder.id);
        if (affectedOrder.id === orderId && reference && !affectedOrder.bling_sale_reference) {
          await tx`update whatsapp_atendimento.orders set bling_sale_reference = ${reference} where id = ${affectedOrder.id}`;
        }
        const preview = await buildBlingSalePreview(affectedOrder, affectedItems, blingContactId, totals);
        const blockers = [...new Set(preview.blockers)];
        const refreshedSummary = { blockers, commercialTotals: totals, salePreview: preview.summary };
        await tx`
          update whatsapp_atendimento.integration_jobs as current_job
          set request_sha256 = ${preview.requestSha256},
              result_summary = case
                when current_job.request_sha256 is not distinct from ${preview.requestSha256}
                then ${tx.json(refreshedSummary)} || case
                  when current_job.result_summary ? 'reconciliation'
                  then jsonb_build_object('reconciliation', current_job.result_summary->'reconciliation')
                  else '{}'::jsonb
                end
                else ${tx.json(refreshedSummary)}
              end,
              updated_at = now()
          where order_id = ${affectedOrder.id} and operation = 'create_sale' and status = 'blocked'
        `;
      }
    });
  } catch (error) {
    if (isRecord(error) && error.code === "23505") throw new HttpError(409, "Este contato Bling já está vinculado a outro cliente.");
    throw error;
  }
  return orderDetail(orderId);
}

async function finishSeparation(orderId: string, operatorId: string, body: Record<string, unknown>) {
  if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision)) throw new HttpError(400, "A revisão do pedido é obrigatória.");
  const db = ordersDb();
  await db.begin(async (tx) => {
    const rows = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
    const order = rows[0];
    if (!order) throw new HttpError(404, "Pedido não encontrado.");
    if (order.revision !== body.revision) throw new HttpError(409, "O pedido mudou. Recarregue o detalhe.");
    if (order.customer_acceptance_status === 'pending') throw new HttpError(409, "A alteração ainda aguarda resposta do cliente.");
    if (order.status !== 'packing') throw new HttpError(409, "Somente um pedido em separação pode concluir esta etapa.");
    const items = await tx<DbOrderItem>`select * from whatsapp_atendimento.order_items where order_id = ${orderId} order by position for update`;
    if (!items.length || items.some((item) => item.picked_quantity !== item.quantity || item.picking_status !== 'separated')) {
      throw new HttpError(409, "Separe todas as quantidades antes de concluir esta etapa.");
    }
    const customer = isRecord(order.snapshot.customer) ? order.snapshot.customer : {};
    const customerId = typeof customer.customerId === "string" ? customer.customerId : "";
    const contactMapping = customerId
      ? await tx<{ customer_id: string; bling_contact_id: number; verified_at: string }>`
          select customer_id, bling_contact_id, verified_at from whatsapp_atendimento.customer_bling_contacts where customer_id = ${customerId}
        `
      : [];
    const itemLineTotals = items.map((item) => Number(item.line_total_cents));
    const lineTotalCents = itemLineTotals.reduce((sum, value) => sum + value, 0);
    const acceptedTotalCents = Number(order.total_cents);
    const commercialTotals = itemLineTotals.every((value) => Number.isSafeInteger(value) && value >= 0)
      ? reconcileBlingCommercialTotals(lineTotalCents, acceptedTotalCents)
      : null;
    const saleReference = order.bling_sale_reference ?? stableBlingSaleReference(order.id);
    const salePreview = await buildBlingSalePreview(
      { ...order, bling_sale_reference: saleReference },
      items,
      contactMapping[0] ? Number(contactMapping[0].bling_contact_id) : null,
      commercialTotals,
    );
    const blockers = [
      ...(!contactMapping.length || !Number.isSafeInteger(Number(contactMapping[0]?.bling_contact_id)) || !contactMapping[0]?.verified_at ? ["BLING_CUSTOMER_CONTACT_MAPPING_MISSING"] : []),
      ...(!commercialTotals?.balances ? ["BLING_TOTAL_RECONCILIATION_INVALID"] : []),
      ...salePreview.blockers,
    ];
    const uniqueBlockers = [...new Set(blockers)];
    const jobStatus = uniqueBlockers.length ? "blocked" : "pending";
    const errorCode = uniqueBlockers.length ? "BLING_PREFLIGHT_REQUIRED" : null;
    await tx`update whatsapp_atendimento.orders set status = 'awaiting_invoice', separation_completed_at = now(), bling_sale_reference = ${saleReference}, revision = revision + 1, attention_code = ${uniqueBlockers.length ? "bling_preflight_required" : "bling_sale_pending"}, updated_at = now() where id = ${orderId}`;
    await tx`
      insert into whatsapp_atendimento.integration_jobs (order_id, operation, idempotency_key, status, error_code, request_sha256, result_summary)
      values (${orderId}, 'create_sale', ${`${orderId}:create_sale`}, ${jobStatus}, ${errorCode}, ${salePreview.requestSha256}, ${tx.json({ blockers: uniqueBlockers, commercialTotals, salePreview: salePreview.summary })})
      on conflict (order_id, operation) do nothing
    `;
    await tx`insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data) values (${orderId}, ${`${orderId}:separation-complete:${order.revision + 1}`}, 'separation_completed', ${tx.json({ operatorId, integrationBlocked: uniqueBlockers.length > 0 })}) on conflict (event_key) do nothing`;
  });
  await createBlingSaleForOrder(orderId);
  return orderDetail(orderId);
}

async function lookupSharedBlingSale(reference: string, token: string): Promise<BlingSaleReferenceLookup> {
  if (!/^WA-[0-9a-f]{32}$/.test(reference)) return { complete: false, ids: [], detail: null };
  const pageSize = 100;
  const matches = new Set<number>();
  let complete = false;
  for (let page = 1; page <= 25; page += 1) {
    const query = new URLSearchParams({ pagina: String(page), limite: String(pageSize) });
    query.append("numerosLojas[]", reference);
    let result: { status: number; data: unknown };
    try { result = await sharedBlingRequest(`/pedidos/vendas?${query}`, "GET", undefined, token); }
    catch { return { complete: false, ids: [...matches], detail: null }; }
    if (result.status < 200 || result.status >= 300 || !isRecord(result.data) || !Array.isArray(result.data.data)) {
      return { complete: false, ids: [...matches], detail: null };
    }
    for (const item of result.data.data) {
      if (!isRecord(item) || item.numeroLoja !== reference) continue;
      const id = Number(item.id);
      if (!Number.isSafeInteger(id) || id <= 0) return { complete: false, ids: [...matches], detail: null };
      matches.add(id);
      if (matches.size > 1) return { complete: false, ids: [...matches], detail: null };
    }
    if (result.data.data.length < pageSize) { complete = true; break; }
  }
  const ids = [...matches];
  if (!complete || ids.length !== 1) return { complete, ids, detail: null };
  const detail = await sharedBlingRequest(`/pedidos/vendas/${ids[0]}`, "GET", undefined, token).catch(() => null);
  if (!detail || detail.status < 200 || detail.status >= 300 || !isRecord(detail.data) || !isRecord(detail.data.data)
    || detail.data.data.numeroLoja !== reference) return { complete: false, ids, detail: null };
  return { complete: true, ids, detail: detail.data.data };
}

function sharedBlingSaleMatches(value: Record<string, unknown>, candidate: BlingSaleRequestPreview): boolean {
  return blingSaleMatchesCandidate(value, candidate);
}

async function finishBlingSaleJob(
  orderId: string,
  status: "succeeded" | "failed" | "unknown" | "blocked",
  errorCode: string | null,
  details: Record<string, unknown>,
  externalId: string | null = null,
) {
  const db = ordersDb();
  await db.begin(async (tx) => {
    const rows = await tx<{ result_summary: Record<string, unknown> }>`select result_summary from whatsapp_atendimento.integration_jobs where order_id = ${orderId} and operation = 'create_sale' for update`;
    if (!rows[0]) return;
    await tx`update whatsapp_atendimento.integration_jobs
      set status = ${status}, error_code = ${errorCode}, external_id = ${externalId},
      result_summary = ${tx.json({ ...rows[0].result_summary, ...details, ...(status === "succeeded" ? { blockers: [] } : {}) })},
        finished_at = ${new Date().toISOString()}, updated_at = now()
      where order_id = ${orderId} and operation = 'create_sale'`;
    if (status === "succeeded" && externalId && /^\d+$/.test(externalId)) {
      await tx`update whatsapp_atendimento.orders
        set bling_sale_id = ${Number(externalId)}, attention_code = 'bling_invoice_pending', updated_at = now()
        where id = ${orderId} and status = 'awaiting_invoice'`;
      await tx`insert into whatsapp_atendimento.integration_jobs (order_id, operation, idempotency_key, status, error_code, result_summary)
        values (${orderId}, 'generate_invoice', ${`${orderId}:generate_invoice`}, 'blocked', 'BLING_NFE_HUMAN_CONFIRMATION_REQUIRED', ${tx.json({ externalReference: details.externalReference ?? null, saleId: Number(externalId) })})
        on conflict (order_id, operation) do nothing`;
    }
  });
}

async function createBlingSaleForOrder(orderId: string) {
  const db = ordersDb();
  let candidate: BlingSaleRequestPreview | null = null;
  let requestSha256 = "";
  let reference = "";
  try {
    const { order, items } = await loadOrder(orderId);
    if (order.status !== "awaiting_invoice" || !order.separation_completed_at || order.customer_acceptance_status === "pending") {
      throw new HttpError(409, "A venda só pode ser enviada depois de concluir a separação e o aceite do cliente.");
    }
    if (items.some((item) => item.picked_quantity !== item.quantity || item.picking_status !== "separated")) {
      throw new HttpError(409, "A separação contém itens que ainda não foram confirmados.");
    }
    const customer = isRecord(order.snapshot.customer) ? order.snapshot.customer : {};
    const customerId = typeof customer.customerId === "string" ? customer.customerId : "";
    const mappings = ORDER_ID.test(customerId)
      ? await db<{ bling_contact_id: number; verified_at: string }>`select bling_contact_id, verified_at from whatsapp_atendimento.customer_bling_contacts where customer_id = ${customerId}`
      : [];
    const contactId = mappings[0]?.verified_at ? Number(mappings[0].bling_contact_id) : null;
    const lineTotals = items.map((item) => Number(item.line_total_cents));
    const lineTotalCents = lineTotals.reduce((sum, item) => sum + item, 0);
    const totals = lineTotals.every((value) => Number.isSafeInteger(value) && value >= 0)
      ? reconcileBlingCommercialTotals(lineTotalCents, Number(order.total_cents))
      : null;
    const preview = await buildBlingSalePreview(order, items, contactId, totals);
    const blockers = [
      ...(!mappings.length || !Number.isSafeInteger(contactId) || !mappings[0]?.verified_at ? ["BLING_CUSTOMER_CONTACT_MAPPING_MISSING"] : []),
      ...(!totals?.balances ? ["BLING_TOTAL_RECONCILIATION_INVALID"] : []),
      ...preview.blockers,
    ];
    reference = order.bling_sale_reference ?? stableBlingSaleReference(order.id) ?? "";
    candidate = preview.candidate;
    requestSha256 = preview.requestSha256 ?? "";
    if (blockers.length || !candidate || !reference || !requestSha256) {
      await finishBlingSaleJob(orderId, "blocked", "BLING_PREFLIGHT_REQUIRED", {
        blockers: [...new Set(blockers)],
        commercialTotals: totals,
        salePreview: preview.summary,
      });
      return { ok: false, status: "blocked", blockers: [...new Set(blockers)] };
    }

    const job = await db.begin(async (tx) => {
      const orderRows = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
      const current = orderRows[0];
      if (!current || current.status !== "awaiting_invoice" || !current.separation_completed_at) throw new HttpError(409, "O pedido não está mais pronto para venda.");
      const jobs = await tx<{ status: string; external_id: string | null; started_at: string | null; request_sha256: string | null; result_summary: Record<string, unknown> }>`
        select status, external_id, started_at, request_sha256, result_summary from whatsapp_atendimento.integration_jobs where order_id = ${orderId} and operation = 'create_sale' for update
      `;
      const currentJob = jobs[0];
      if (!currentJob) throw new HttpError(409, "A operação de venda ainda não foi preparada.");
      if (currentJob.status === "succeeded" && currentJob.external_id) return { duplicate: true, externalId: currentJob.external_id };
      if (currentJob.status === "running" && isRecentReconciliationLease(currentJob.started_at)) throw new HttpError(409, "A criação da venda ainda está em andamento.");
      if (currentJob.request_sha256 && currentJob.request_sha256 !== requestSha256) throw new HttpError(409, "O pedido mudou desde a última prévia Bling. Atualize e revise.");
      await tx`update whatsapp_atendimento.integration_jobs set status = 'running', error_code = null, attempts = attempts + 1, started_at = now(), finished_at = null, request_sha256 = ${requestSha256}, updated_at = now() where order_id = ${orderId} and operation = 'create_sale'`;
      return { duplicate: false, externalId: null };
    });
    if (job.duplicate) return { ok: true, status: "succeeded", externalId: job.externalId, duplicate: true };

    const token = await getSharedBlingAccessToken();
    const existing = await lookupSharedBlingSale(reference, token);
    if (existing.ids.length > 1) {
      await finishBlingSaleJob(orderId, "unknown", "BLING_SALE_REFERENCE_AMBIGUOUS", { reconciliation: { outcome: "ambiguous", matchingIds: existing.ids } });
      return { ok: false, status: "unknown", error: "BLING_SALE_REFERENCE_AMBIGUOUS" };
    }
    if (!existing.complete) {
      await finishBlingSaleJob(orderId, "unknown", "BLING_SALE_RECONCILIATION_UNKNOWN", { reconciliation: { outcome: "unknown", matchingIds: existing.ids } });
      return { ok: false, status: "unknown", error: "BLING_SALE_RECONCILIATION_UNKNOWN" };
    }
    if (existing.ids.length === 1 && existing.detail) {
      if (!sharedBlingSaleMatches(existing.detail, candidate)) {
        await finishBlingSaleJob(orderId, "unknown", "BLING_SALE_REFERENCE_MISMATCH", { reconciliation: { outcome: "unknown", matchingIds: existing.ids } });
        return { ok: false, status: "unknown", error: "BLING_SALE_REFERENCE_MISMATCH" };
      }
      await finishBlingSaleJob(orderId, "succeeded", null, { externalReference: reference, reconciliation: { outcome: "matched" } }, String(existing.ids[0]));
      return { ok: true, status: "succeeded", externalId: String(existing.ids[0]), reconciled: true };
    }

    const payload = {
      contato: candidate.contato,
      data: candidate.data,
      numeroLoja: candidate.numeroLoja,
      totalProdutos: candidate.totalProdutos,
      total: candidate.total,
      outrasDespesas: candidate.outrasDespesas,
      desconto: candidate.desconto,
      itens: candidate.itens.map(({ produto, codigo, descricao, quantidade, valor }) => ({ produto, codigo, descricao, quantidade, valor })),
      transporte: candidate.transporte,
      observacoes: candidate.observacoes,
    };
    let created: { status: number; data: unknown };
    try { created = await sharedBlingRequest("/pedidos/vendas", "POST", payload, token); }
    catch {
      const recovery = await lookupSharedBlingSale(reference, token);
      if (recovery.complete && recovery.ids.length === 1 && recovery.detail && sharedBlingSaleMatches(recovery.detail, candidate)) {
        await finishBlingSaleJob(orderId, "succeeded", null, { externalReference: reference, reconciliation: { outcome: "matched_after_uncertain_create" } }, String(recovery.ids[0]));
        return { ok: true, status: "succeeded", externalId: String(recovery.ids[0]), reconciled: true };
      }
      await finishBlingSaleJob(orderId, "unknown", "BLING_SALE_CREATE_UNCERTAIN", { reconciliation: { outcome: "unknown", matchingIds: recovery.ids } });
      return { ok: false, status: "unknown", error: "BLING_SALE_CREATE_UNCERTAIN" };
    }
    const createdData = isRecord(created.data) && isRecord(created.data.data) ? created.data.data : isRecord(created.data) ? created.data : {};
    const externalId = Number(createdData.id);
    if (created.status < 200 || created.status >= 300 || !Number.isSafeInteger(externalId) || externalId <= 0) {
      if (created.status >= 500) {
        const recovery = await lookupSharedBlingSale(reference, token);
        if (recovery.complete && recovery.ids.length === 1 && recovery.detail && sharedBlingSaleMatches(recovery.detail, candidate)) {
          await finishBlingSaleJob(orderId, "succeeded", null, { externalReference: reference, reconciliation: { outcome: "matched_after_error" } }, String(recovery.ids[0]));
          return { ok: true, status: "succeeded", externalId: String(recovery.ids[0]), reconciled: true };
        }
        await finishBlingSaleJob(orderId, "unknown", "BLING_SALE_CREATE_UNCERTAIN", { reconciliation: { outcome: "unknown", matchingIds: recovery.ids } });
        return { ok: false, status: "unknown", error: "BLING_SALE_CREATE_UNCERTAIN" };
      }
      await finishBlingSaleJob(orderId, "failed", `BLING_SALE_CREATE_HTTP_${created.status}`, { reconciliation: { outcome: "absent" } });
      return { ok: false, status: "failed", error: `BLING_SALE_CREATE_HTTP_${created.status}` };
    }
    const verified = await sharedBlingRequest(`/pedidos/vendas/${externalId}`, "GET", undefined, token).catch(() => null);
    const verifiedRecord = verified && verified.status >= 200 && verified.status < 300 && isRecord(verified.data) && isRecord(verified.data.data)
      ? verified.data.data : null;
    if (!verifiedRecord || !sharedBlingSaleMatches(verifiedRecord, candidate)) {
      await finishBlingSaleJob(orderId, "unknown", "BLING_SALE_POST_WRITE_VERIFY_FAILED", { externalReference: reference, reconciliation: { outcome: "unknown", matchingIds: [externalId] } });
      return { ok: false, status: "unknown", error: "BLING_SALE_POST_WRITE_VERIFY_FAILED" };
    }
    await finishBlingSaleJob(orderId, "succeeded", null, { externalReference: reference, reconciliation: { outcome: "matched" } }, String(externalId));
    return { ok: true, status: "succeeded", externalId: String(externalId) };
  } catch (error) {
    const status = error instanceof HttpError && error.status === 409 ? "blocked" : error instanceof HttpError && error.status >= 500 ? "blocked" : "failed";
    const code = error instanceof HttpError ? `BLING_${error.status}_REQUEST_BLOCKED` : "BLING_REQUEST_FAILED";
    await finishBlingSaleJob(orderId, status, code, { blockers: [code] }).catch(() => undefined);
    return { ok: false, status, error: code };
  }
}

function blingInvoiceSituation(invoice: Record<string, unknown>): { id: number | null; status: "authorized" | "pending" | "rejected" | "unknown" } {
  const raw = invoice.situacao;
  const value = isRecord(raw) ? raw.id ?? raw.codigo ?? raw.valor ?? raw.value ?? raw.situacao : raw;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) return { id: null, status: "unknown" };
  if ([5, 6, 7].includes(id)) return { id, status: "authorized" };
  if ([1, 3, 8, 10].includes(id)) return { id, status: "pending" };
  if ([2, 4, 9, 11].includes(id)) return { id, status: "rejected" };
  return { id, status: "unknown" };
}

async function findSharedBlingInvoice(reference: string, token: string): Promise<{ complete: boolean; matches: Array<Record<string, unknown>> }> {
  const pageSize = 100;
  const matches = new Map<number, Record<string, unknown>>();
  let complete = false;
  for (let page = 1; page <= 20; page += 1) {
    const query = new URLSearchParams({ pagina: String(page), limite: String(pageSize), numeroLoja: reference, tipo: "1" });
    const response = await sharedBlingRequest(`/nfe?${query}`, "GET", undefined, token).catch(() => null);
    if (!response || response.status < 200 || response.status >= 300 || !isRecord(response.data) || !Array.isArray(response.data.data)) {
      return { complete: false, matches: [...matches.values()] };
    }
    for (const raw of response.data.data) {
      if (!isRecord(raw) || raw.numeroLoja !== reference) continue;
      const id = Number(raw.id ?? raw.idNotaFiscal);
      if (!Number.isSafeInteger(id) || id <= 0) return { complete: false, matches: [...matches.values()] };
      matches.set(id, raw);
      if (matches.size > 1) return { complete: false, matches: [...matches.values()] };
    }
    if (response.data.data.length < pageSize) { complete = true; break; }
  }
  const entries = [...matches.entries()];
  if (!complete || entries.length !== 1) return { complete, matches: entries.map(([, item]) => item) };
  const detail = await sharedBlingRequest(`/nfe/${entries[0][0]}`, "GET", undefined, token).catch(() => null);
  if (!detail || detail.status < 200 || detail.status >= 300) return { complete: false, matches: [] };
  const invoice = isRecord(detail.data) && isRecord(detail.data.data) ? detail.data.data : isRecord(detail.data) ? detail.data : null;
  if (!invoice || invoice.numeroLoja !== reference) return { complete: false, matches: [] };
  return { complete: true, matches: [invoice] };
}

async function persistBlingInvoice(orderId: string, expectedRevision: number, invoice: Record<string, unknown>, lookup: "found" | "created") {
  const id = Number(invoice.id ?? invoice.idNotaFiscal);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(502, "O Bling retornou um identificador fiscal inválido.");
  const situation = blingInvoiceSituation(invoice);
  const db = ordersDb();
  await db.begin(async (tx) => {
    const rows = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
    const order = rows[0];
    if (!order) throw new HttpError(404, "Pedido não encontrado.");
    const stateMatches = order.revision === expectedRevision && Number(order.bling_sale_id) > 0;
    const previouslyAuthorized = order.invoice_status === "authorized" && Number(order.invoice_id) === id;
    const resultStatus = previouslyAuthorized && situation.status === "unknown"
      ? "authorized"
      : stateMatches ? situation.status : previouslyAuthorized ? "authorized" : "unknown";
    await tx`update whatsapp_atendimento.orders
      set invoice_id = ${id}, invoice_status = ${resultStatus},
        invoice_authorized_at = case when ${resultStatus} = 'authorized' then coalesce(invoice_authorized_at, now()) else invoice_authorized_at end,
        status = case when ${resultStatus} = 'authorized' then 'invoice_authorized' else 'awaiting_invoice' end,
        attention_code = case when ${resultStatus} = 'authorized' then 'bling_invoice_authorized' else 'bling_invoice_review' end,
        updated_at = now()
      where id = ${orderId}`;
    const jobs = await tx<{ result_summary: Record<string, unknown> }>`select result_summary from whatsapp_atendimento.integration_jobs where order_id = ${orderId} and operation = 'generate_invoice' for update`;
    const previous = jobs[0]?.result_summary ?? {};
    await tx`update whatsapp_atendimento.integration_jobs
      set status = ${resultStatus === "unknown" ? "unknown" : "succeeded"}, error_code = ${resultStatus === "rejected" ? "BLING_NFE_REJECTED" : resultStatus === "unknown" ? "BLING_NFE_STATUS_UNKNOWN" : null},
        external_id = ${String(id)}, result_summary = ${tx.json({ ...previous, lookup, invoiceId: id, invoiceStatus: resultStatus, invoiceSituationId: situation.id, invoiceNumber: typeof invoice.numero === "string" ? invoice.numero.slice(0, 80) : null, danfeUrl: typeof invoice.linkDanfe === "string" && /^https:\/\/([a-z0-9-]+\.)*bling\.com\.br\//i.test(invoice.linkDanfe) ? invoice.linkDanfe : null })},
        started_at = coalesce(started_at, now()), finished_at = now(), updated_at = now()
      where order_id = ${orderId} and operation = 'generate_invoice'`;
    if (!stateMatches) {
      await tx`insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data)
        values (${orderId}, ${`${orderId}:bling-invoice-state-changed:${id}`}, 'bling_invoice_reconciled_after_order_change', ${tx.json({ invoiceId: id, expectedRevision, actualRevision: order.revision })}) on conflict (event_key) do nothing`;
    }
  });
}

async function generateBlingInvoice(orderId: string, operatorId: string, body: Record<string, unknown>) {
  if (body.confirmation !== "EMITIR_NFE") throw new HttpError(409, "Confirme explicitamente a emissão da NF-e.");
  if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision)) throw new HttpError(400, "A revisão do pedido é obrigatória.");
  const db = ordersDb();
  const { order } = await loadOrder(orderId);
  if (order.revision !== body.revision) throw new HttpError(409, "O pedido mudou. Atualize antes de emitir a NF-e.");
  if (!order.separation_completed_at || order.customer_acceptance_status === "pending"
    || !["awaiting_invoice", "invoice_authorized"].includes(order.status)) {
    throw new HttpError(409, "A NF-e exige separação concluída e aceite do cliente resolvido.");
  }
  const saleJob = await db<{ status: string; external_id: string | null }>`select status, external_id from whatsapp_atendimento.integration_jobs where order_id = ${orderId} and operation = 'create_sale'`;
  const saleId = Number(order.bling_sale_id ?? saleJob[0]?.external_id ?? 0);
  if (saleJob[0]?.status !== "succeeded" || !Number.isSafeInteger(saleId) || saleId <= 0) {
    throw new HttpError(409, "A venda precisa estar confirmada no Bling antes da emissão fiscal.");
  }
  await db.begin(async (tx) => {
    const current = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
    if (!current[0] || current[0].revision !== body.revision) throw new HttpError(409, "O pedido mudou. Atualize antes de emitir a NF-e.");
    if (current[0].invoice_status === "authorized" && current[0].invoice_id) throw new HttpError(409, "A NF-e já está autorizada.");
    const jobs = await tx<{ status: string; started_at: string | null }>`select status, started_at from whatsapp_atendimento.integration_jobs where order_id = ${orderId} and operation = 'generate_invoice' for update`;
    if (jobs[0]?.status === "running" && isRecentReconciliationLease(jobs[0].started_at)) throw new HttpError(409, "A emissão da NF-e já está em andamento.");
    await tx`insert into whatsapp_atendimento.integration_jobs (order_id, operation, idempotency_key, status, error_code, result_summary, attempts, started_at)
      values (${orderId}, 'generate_invoice', ${`${orderId}:generate_invoice`}, 'running', null, ${tx.json({ operatorId, explicitConfirmation: true })}, 1, now())
      on conflict (order_id, operation) do update set status = 'running', error_code = null, attempts = whatsapp_atendimento.integration_jobs.attempts + 1, started_at = now(), finished_at = null, updated_at = now()`;
    await tx`update whatsapp_atendimento.orders set invoice_status = 'pending', attention_code = 'bling_invoice_pending', updated_at = now() where id = ${orderId}`;
  });

  let token: string;
  try { token = await getSharedBlingAccessToken(); }
  catch (error) {
    await finishInvoiceJob(orderId, "blocked", "BLING_SHARED_CREDENTIALS_UNAVAILABLE");
    throw error;
  }
  const reference = order.bling_sale_reference ?? stableBlingSaleReference(orderId);
  if (!reference) {
    await finishInvoiceJob(orderId, "blocked", "BLING_SALE_REFERENCE_INVALID");
    throw new HttpError(409, "A referência imutável da venda está inválida.");
  }

  const existingInvoiceId = Number(order.invoice_id ?? 0);
  if (Number.isSafeInteger(existingInvoiceId) && existingInvoiceId > 0) {
    const existing = await sharedBlingRequest(`/nfe/${existingInvoiceId}`, "GET", undefined, token).catch(() => null);
    const existingData = existing && existing.status >= 200 && existing.status < 300 && isRecord(existing.data)
      ? (isRecord(existing.data.data) ? existing.data.data : existing.data)
      : null;
    if (!existingData || existingData.numeroLoja !== reference) {
      await finishInvoiceJob(orderId, "unknown", "BLING_NFE_EXISTING_READ_UNCERTAIN");
      throw new HttpError(502, "A NF-e já registrada não pôde ser confirmada. Nenhuma nova foi solicitada.");
    }
    await persistBlingInvoice(orderId, body.revision, existingData, "found");
    return orderDetail(orderId);
  }

  const before = await findSharedBlingInvoice(reference, token);
  if (before.matches.length > 1 || !before.complete) {
    await finishInvoiceJob(orderId, "unknown", "BLING_NFE_RECONCILIATION_UNKNOWN");
    throw new HttpError(409, "A consulta da NF-e ficou inconclusiva; nenhuma nova emissão foi enviada.");
  }
  if (before.matches.length === 1) {
    await persistBlingInvoice(orderId, body.revision, before.matches[0], "found");
    return orderDetail(orderId);
  }

  let generated: { status: number; data: unknown };
  try { generated = await sharedBlingRequest(`/pedidos/vendas/${saleId}/gerar-nfe`, "POST", undefined, token); }
  catch {
    const recovered = await findSharedBlingInvoice(reference, token);
    if (recovered.complete && recovered.matches.length === 1) {
      await persistBlingInvoice(orderId, body.revision, recovered.matches[0], "found");
      return orderDetail(orderId);
    }
    await finishInvoiceJob(orderId, "unknown", "BLING_NFE_GENERATION_UNCERTAIN");
    throw new HttpError(502, "A emissão pode ter sido processada. Confira a NF-e antes de tentar novamente.");
  }
  const generatedData = isRecord(generated.data) && isRecord(generated.data.data) ? generated.data.data : isRecord(generated.data) ? generated.data : {};
  const generatedId = Number(generatedData.idNotaFiscal ?? generatedData.id);
  if (generated.status < 200 || generated.status >= 300 || !Number.isSafeInteger(generatedId) || generatedId <= 0) {
    const recovered = await findSharedBlingInvoice(reference, token);
    if (recovered.complete && recovered.matches.length === 1) {
      await persistBlingInvoice(orderId, body.revision, recovered.matches[0], "found");
      return orderDetail(orderId);
    }
    const unknown = generated.status >= 500 || !recovered.complete;
    await finishInvoiceJob(orderId, unknown ? "unknown" : "failed", unknown ? "BLING_NFE_GENERATION_UNCERTAIN" : `BLING_NFE_GENERATION_HTTP_${generated.status}`);
    throw new HttpError(unknown ? 502 : 409, unknown ? "A emissão ficou incerta; confira a NF-e antes de uma nova tentativa." : `O Bling recusou a geração da NF-e (HTTP ${generated.status}).`);
  }
  const after = await sharedBlingRequest(`/nfe/${generatedId}`, "GET", undefined, token).catch(() => null);
  const invoice = after && after.status >= 200 && after.status < 300 && isRecord(after.data)
    ? (isRecord(after.data.data) ? after.data.data : after.data)
    : null;
  if (!invoice || invoice.numeroLoja !== reference) {
    await finishInvoiceJob(orderId, "unknown", "BLING_NFE_POST_WRITE_VERIFY_FAILED");
    throw new HttpError(502, "A NF-e foi solicitada, mas a leitura de verificação falhou. Confira o Bling antes de repetir.");
  }
  await persistBlingInvoice(orderId, body.revision, invoice, "created");
  return orderDetail(orderId);
}

const DELIVERY_PAYMENT_METHODS = ["pix", "cash", "debit_card", "credit_card"] as const;
type DeliveryPaymentMethod = typeof DELIVERY_PAYMENT_METHODS[number];

async function finishDispatchJob(
  orderId: string,
  operatorId: string,
  status: "blocked" | "failed" | "unknown",
  errorCode: string,
  invoiceId: number | null,
) {
  await ordersDb()`
    insert into whatsapp_atendimento.integration_jobs
      (order_id, operation, idempotency_key, status, error_code, external_id, result_summary, attempts, started_at, finished_at)
    values (${orderId}, 'start_dispatch', ${`${orderId}:start_dispatch`}, ${status}, ${errorCode}, ${invoiceId ? String(invoiceId) : null}, ${ordersDb().json({ operatorId, invoiceId })}, 1, now(), now())
    on conflict (order_id, operation) do update set
      status = excluded.status, error_code = excluded.error_code, external_id = excluded.external_id,
      result_summary = whatsapp_atendimento.integration_jobs.result_summary || excluded.result_summary,
      attempts = whatsapp_atendimento.integration_jobs.attempts + 1, started_at = now(), finished_at = now(), updated_at = now()
  `;
}

async function persistLiveInvoiceReadback(
  orderId: string,
  expectedRevision: number,
  invoice: Record<string, unknown>,
  status: "pending" | "rejected" | "unknown",
) {
  const id = Number(invoice.id ?? invoice.idNotaFiscal);
  const db = ordersDb();
  await db.begin(async (tx) => {
    const rows = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
    const order = rows[0];
    if (!order) throw new HttpError(404, "Pedido não encontrado.");
    if (order.revision !== expectedRevision || Number(order.invoice_id) !== id || order.status !== "invoice_authorized") {
      throw new HttpError(409, "O pedido mudou durante a leitura fiscal. Atualize antes de registrar a saída.");
    }
    await tx`update whatsapp_atendimento.orders set invoice_status = ${status}, status = 'awaiting_invoice',
      attention_code = ${status === "unknown" ? "bling_invoice_status_unverified" : status === "rejected" ? "bling_invoice_rejected" : "bling_invoice_pending"},
      revision = revision + 1, updated_at = now() where id = ${orderId}`;
    const jobs = await tx<{ result_summary: Record<string, unknown> }>`select result_summary from whatsapp_atendimento.integration_jobs
      where order_id = ${orderId} and operation = 'generate_invoice' for update`;
    const previous = jobs[0]?.result_summary ?? {};
    await tx`update whatsapp_atendimento.integration_jobs set status = ${status === "unknown" ? "unknown" : "succeeded"},
      error_code = ${status === "unknown" ? "BLING_NFE_STATUS_UNKNOWN" : status === "rejected" ? "BLING_NFE_REJECTED" : null},
      result_summary = ${tx.json({ ...previous, lookup: "live_dispatch_gate", invoiceId: id, invoiceStatus: status,
        invoiceSituationId: blingInvoiceSituation(invoice).id,
        invoiceNumber: typeof invoice.numero === "string" ? invoice.numero.slice(0, 80) : null,
        danfeUrl: typeof invoice.linkDanfe === "string" && /^https:\/\/([a-z0-9-]+\.)*bling\.com\.br\//i.test(invoice.linkDanfe) ? invoice.linkDanfe : null })},
      finished_at = now(), updated_at = now() where order_id = ${orderId} and operation = 'generate_invoice'`;
    await tx`insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data)
      values (${orderId}, ${`${orderId}:invoice-live-state:${id}:${status}`}, 'bling_invoice_live_state_changed',
        ${tx.json({ invoiceId: id, invoiceStatus: status })}) on conflict (event_key) do nothing`;
  });
}

async function startOrderDispatch(orderId: string, operatorId: string, body: Record<string, unknown>) {
  const { order, items } = await loadOrder(orderId);
  if (body.confirmation !== "SAIR_PARA_ENTREGA") throw new HttpError(409, "Confirme explicitamente a saída para entrega.");
  if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision)) throw new HttpError(400, "A revisão do pedido é inválida.");
  if (order.status === "out_for_delivery" && order.dispatched_at) return orderDetail(orderId);
  if (order.revision !== body.revision) {
    throw new HttpError(409, "O pedido mudou. Atualize antes de registrar a saída.");
  }
  if (order.status !== "invoice_authorized" || order.invoice_status !== "authorized"
    || !order.invoice_id || !order.bling_sale_id || !order.separation_completed_at
    || order.customer_acceptance_status === "pending" || order.customer_acceptance_status === "rejected"
    || !items.length || items.some((item) => item.picking_status !== "separated" || item.picked_quantity !== item.quantity)) {
    throw new HttpError(409, "A saída exige separação completa, sem aceite pendente, venda vinculada e NF-e autorizada.");
  }
  const reference = order.bling_sale_reference ?? stableBlingSaleReference(orderId);
  if (!reference || Number(order.invoice_id) <= 0) throw new HttpError(409, "O vínculo da NF-e com a venda não está completo.");

  let response: { status: number; data: unknown };
  try {
    const token = await getSharedBlingAccessToken();
    response = await sharedBlingRequest(`/nfe/${Number(order.invoice_id)}`, "GET", undefined, token);
  } catch {
    await finishDispatchJob(orderId, operatorId, "blocked", "BLING_NFE_LIVE_CHECK_UNAVAILABLE", Number(order.invoice_id));
    throw new HttpError(503, "Não foi possível confirmar a autorização atual da NF-e. A saída não foi registrada.");
  }
  const invoice = response.status >= 200 && response.status < 300 && isRecord(response.data)
    ? (isRecord(response.data.data) ? response.data.data : response.data)
    : null;
  const liveInvoiceId = invoice ? Number(invoice.id ?? invoice.idNotaFiscal) : 0;
  if (!invoice || !Number.isSafeInteger(liveInvoiceId) || liveInvoiceId !== Number(order.invoice_id)
    || invoice.numeroLoja !== reference) {
    await finishDispatchJob(orderId, operatorId, "unknown", "BLING_NFE_LIVE_CHECK_MISMATCH", Number(order.invoice_id));
    throw new HttpError(409, "A leitura atual da NF-e não corresponde à venda deste pedido. A saída não foi registrada.");
  }
  const liveSituation = blingInvoiceSituation(invoice);
  if (liveSituation.status !== "authorized") {
    await persistLiveInvoiceReadback(orderId, body.revision, invoice, liveSituation.status);
    await finishDispatchJob(orderId, operatorId, "blocked", `BLING_NFE_NOT_AUTHORIZED_${liveSituation.status.toUpperCase()}`, Number(order.invoice_id));
    return orderDetail(orderId);
  }

  const db = ordersDb();
  await db.begin(async (tx) => {
    const currentRows = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
    const current = currentRows[0];
    if (!current) throw new HttpError(404, "Pedido não encontrado.");
    if (current.status === "out_for_delivery" && current.dispatched_at) return;
    if (current.revision !== body.revision) throw new HttpError(409, "O pedido mudou durante a conferência. Atualize antes de registrar a saída.");
    if (current.status !== "invoice_authorized" || current.invoice_status !== "authorized"
      || Number(current.invoice_id) !== liveInvoiceId || !current.bling_sale_id || !current.separation_completed_at
      || ["pending", "rejected"].includes(current.customer_acceptance_status)) {
      throw new HttpError(409, "O pedido ou a NF-e mudou durante a conferência. A saída não foi registrada.");
    }
    await tx`insert into whatsapp_atendimento.integration_jobs
      (order_id, operation, idempotency_key, status, external_id, result_summary, attempts, started_at, finished_at)
      values (${orderId}, 'start_dispatch', ${`${orderId}:start_dispatch`}, 'succeeded', ${String(liveInvoiceId)}, ${tx.json({ operatorId, invoiceStatus: "authorized", invoiceId: liveInvoiceId })}, 1, now(), now())
      on conflict (order_id, operation) do update set status = 'succeeded', error_code = null,
        external_id = excluded.external_id, result_summary = excluded.result_summary,
        attempts = whatsapp_atendimento.integration_jobs.attempts + 1, started_at = now(), finished_at = now(), updated_at = now()`;
    await tx`update whatsapp_atendimento.orders set status = 'out_for_delivery', dispatched_at = coalesce(dispatched_at, now()),
      revision = revision + 1, attention_code = 'dispatch_started', updated_at = now() where id = ${orderId}`;
    await tx`insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data)
      values (${orderId}, ${`${orderId}:dispatch-started`}, 'dispatch_started', ${tx.json({ operatorId, invoiceId: liveInvoiceId })})
      on conflict (event_key) do nothing`;
  });
  return orderDetail(orderId);
}

async function completeOrderDelivery(orderId: string, operatorId: string, body: Record<string, unknown>) {
  const { order } = await loadOrder(orderId);
  const paymentMethod = body.paymentMethod;
  const amountCents = body.amountCents;
  if (typeof paymentMethod !== "string" || !DELIVERY_PAYMENT_METHODS.includes(paymentMethod as DeliveryPaymentMethod)) {
    throw new HttpError(400, "Selecione uma forma de pagamento válida.");
  }
  if (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents !== Number(order.total_cents)) {
    throw new HttpError(409, "O valor recebido precisa corresponder ao total confirmado do pedido.");
  }
  if (body.confirmation !== "CONFIRMAR_ENTREGA") throw new HttpError(409, "Confirme explicitamente a entrega e o recebimento.");
  if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision)) throw new HttpError(400, "A revisão do pedido é inválida.");
  if (order.status === "completed") {
    if (Number(order.received_payment_cents) === amountCents && order.received_payment_method === paymentMethod) return orderDetail(orderId);
    throw new HttpError(409, "A entrega já foi concluída com outro registro de pagamento.");
  }
  if (order.revision !== body.revision) {
    throw new HttpError(409, "O pedido mudou. Atualize antes de confirmar a entrega.");
  }
  if (order.status !== "out_for_delivery" || !order.dispatched_at || order.invoice_status !== "authorized"
    || !order.invoice_id || order.customer_acceptance_status === "pending" || order.customer_acceptance_status === "rejected") {
    throw new HttpError(409, "A entrega só pode ser concluída depois da saída e com NF-e autorizada.");
  }

  const db = ordersDb();
  await db.begin(async (tx) => {
    const currentRows = await tx<DbOrder>`select * from whatsapp_atendimento.orders where id = ${orderId} for update`;
    const current = currentRows[0];
    if (!current) throw new HttpError(404, "Pedido não encontrado.");
    if (current.status === "completed") {
      if (Number(current.received_payment_cents) === amountCents && current.received_payment_method === paymentMethod) return;
      throw new HttpError(409, "A entrega já foi concluída com outro registro de pagamento.");
    }
    if (current.revision !== body.revision || current.status !== "out_for_delivery" || !current.dispatched_at
      || current.invoice_status !== "authorized" || !current.invoice_id
      || ["pending", "rejected"].includes(current.customer_acceptance_status)) {
      throw new HttpError(409, "O pedido mudou durante a confirmação. Atualize antes de continuar.");
    }
    await tx`insert into whatsapp_atendimento.integration_jobs
      (order_id, operation, idempotency_key, status, result_summary, attempts, started_at, finished_at)
      values (${orderId}, 'complete_delivery', ${`${orderId}:complete_delivery`}, 'succeeded', ${tx.json({ operatorId, paymentMethod, amountCents })}, 1, now(), now())
      on conflict (order_id, operation) do update set status = 'succeeded', error_code = null,
        result_summary = excluded.result_summary, attempts = whatsapp_atendimento.integration_jobs.attempts + 1,
        started_at = now(), finished_at = now(), updated_at = now()`;
    await tx`update whatsapp_atendimento.orders set status = 'completed', completed_at = coalesce(completed_at, now()),
      received_payment_cents = ${amountCents}, received_payment_method = ${paymentMethod}, revision = revision + 1,
      attention_code = null, updated_at = now() where id = ${orderId}`;
    await tx`insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data)
      values (${orderId}, ${`${orderId}:delivery-completed`}, 'delivery_payment_recorded', ${tx.json({ operatorId, paymentMethod, amountCents })})
      on conflict (event_key) do nothing`;
  });
  return orderDetail(orderId);
}

async function finishInvoiceJob(orderId: string, status: "failed" | "unknown" | "blocked", errorCode: string) {
  await ordersDb()`update whatsapp_atendimento.integration_jobs
    set status = ${status}, error_code = ${errorCode}, finished_at = now(), updated_at = now()
    where order_id = ${orderId} and operation = 'generate_invoice'`;
}

interface CustomerAddressInput {
  id?: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  reference: string | null;
  isDefault: boolean;
  isActive: boolean;
}

interface CustomerInput {
  name: string;
  cpfCnpj: string | null;
  phoneE164: string;
  preferredReply: "auto" | "text" | "audio";
  isActive: boolean;
  addresses: CustomerAddressInput[];
}

function customerPhone(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Informe o WhatsApp principal do cliente.");
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
  if (!/^\+[1-9][0-9]{9,14}$/.test(normalized)) throw new HttpError(422, "Informe um WhatsApp com DDD válido.");
  return normalized;
}

function parseCustomerInput(body: Record<string, unknown>): CustomerInput {
  if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 160) {
    throw new HttpError(422, "O nome do cliente deve ter de 2 a 160 caracteres.");
  }
  const documentDigits = typeof body.cpfCnpj === "string" ? body.cpfCnpj.replace(/\D/g, "") : "";
  if (documentDigits && documentDigits.length !== 11 && documentDigits.length !== 14) {
    throw new HttpError(422, "Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.");
  }
  const preferredReply = body.preferredReply;
  if (preferredReply !== "auto" && preferredReply !== "text" && preferredReply !== "audio") {
    throw new HttpError(422, "A preferência de resposta é inválida.");
  }
  if (!Array.isArray(body.addresses) || body.addresses.length > 20) throw new HttpError(422, "A lista de endereços excede o limite permitido.");
  const addresses = body.addresses.map((raw): CustomerAddressInput => {
    if (!isRecord(raw)) throw new HttpError(422, "Um endereço do cliente é inválido.");
    const required = (key: string, label: string, maxLength: number): string => {
      const value = typeof raw[key] === "string" ? raw[key].trim() : "";
      if (!value || value.length > maxLength) throw new HttpError(422, `Revise o campo ${label} do endereço.`);
      return value;
    };
    const optional = (key: string, maxLength: number): string | null => {
      const value = typeof raw[key] === "string" ? raw[key].trim() : "";
      if (value.length > maxLength) throw new HttpError(422, "Revise o complemento ou a referência do endereço.");
      return value || null;
    };
    const id = raw.id;
    if (id !== undefined && (typeof id !== "string" || !ORDER_ID.test(id))) throw new HttpError(422, "Um endereço contém um identificador inválido.");
    const state = required("state", "UF", 2).toUpperCase();
    const postalCode = required("postalCode", "CEP", 9).replace(/\D/g, "");
    if (!/^[A-Z]{2}$/.test(state) || !/^\d{8}$/.test(postalCode)) throw new HttpError(422, "Informe uma UF e um CEP válidos.");
    return {
      ...(typeof id === "string" ? { id } : {}),
      label: optional("label", 80),
      street: required("street", "rua", 180),
      number: required("number", "número", 40),
      complement: optional("complement", 120),
      neighborhood: required("neighborhood", "bairro", 120),
      city: required("city", "cidade", 120),
      state,
      postalCode,
      reference: optional("reference", 240),
      isDefault: raw.isDefault === true,
      isActive: raw.isActive === true,
    };
  });
  const activeAddresses = addresses.filter((address) => address.isActive);
  if (body.isActive !== false && activeAddresses.length === 0) throw new HttpError(422, "Mantenha ao menos um endereço ativo para clientes ativos.");
  if (activeAddresses.filter((address) => address.isDefault).length > 1) throw new HttpError(422, "Selecione somente um endereço principal.");
  if (activeAddresses.length && !activeAddresses.some((address) => address.isDefault)) activeAddresses[0].isDefault = true;
  const ids = addresses.flatMap((address) => address.id ? [address.id] : []);
  if (new Set(ids).size !== ids.length) throw new HttpError(422, "Um endereço foi enviado mais de uma vez.");
  return {
    name: body.name.trim(),
    cpfCnpj: documentDigits || null,
    phoneE164: customerPhone(body.phoneE164),
    preferredReply,
    isActive: body.isActive === true,
    addresses,
  };
}

function customerAddressFromDb(row: Record<string, unknown>) {
  return {
    id: row.id,
    label: row.label,
    street: row.street,
    number: row.number,
    complement: row.complement,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    reference: row.reference,
    isDefault: row.is_default,
    isActive: row.is_active,
  };
}

async function searchCustomers(query: string) {
  const normalized = query.trim().slice(0, 120);
  const pattern = `%${normalized}%`;
  type Row = {
    id: string; name: string | null; cpf_cnpj: string | null; primary_whatsapp_e164: string | null;
    preferred_reply: "auto" | "text" | "audio"; is_active: boolean;
  };
  const rows = normalized
    ? await ordersDb()<Row>`
      select id, name, cpf_cnpj, primary_whatsapp_e164, preferred_reply, is_active
      from public.customers
      where name ilike ${pattern} or cpf_cnpj ilike ${pattern} or primary_whatsapp_e164 ilike ${pattern}
      order by updated_at desc limit 50
    `
    : await ordersDb()<Row>`
      select id, name, cpf_cnpj, primary_whatsapp_e164, preferred_reply, is_active
      from public.customers order by updated_at desc limit 50
    `;
  return { customers: rows.map((row) => ({
    id: row.id, name: row.name ?? "", cpfCnpj: row.cpf_cnpj, phoneE164: row.primary_whatsapp_e164 ?? "",
    preferredReply: row.preferred_reply, isActive: row.is_active, addresses: [] as [],
  })) };
}

async function customerDetail(customerId: string) {
  const rows = await ordersDb()<{
    id: string; name: string | null; cpf_cnpj: string | null; primary_whatsapp_e164: string | null;
    preferred_reply: "auto" | "text" | "audio"; is_active: boolean;
  }>`
    select id, name, cpf_cnpj, primary_whatsapp_e164, preferred_reply, is_active
    from public.customers where id = ${customerId}
  `;
  const customer = rows[0];
  if (!customer) throw new HttpError(404, "Cliente não encontrado.");
  const addresses = await ordersDb()<Record<string, unknown>>`
    select id, label, street, number, complement, neighborhood, city, state, postal_code, reference, is_default, is_active
    from public.customer_addresses where customer_id = ${customerId}
    order by is_default desc, is_active desc, created_at asc
  `;
  return {
    id: customer.id,
    name: customer.name ?? "",
    cpfCnpj: customer.cpf_cnpj,
    phoneE164: customer.primary_whatsapp_e164 ?? "",
    preferredReply: customer.preferred_reply,
    isActive: customer.is_active,
    addresses: addresses.map(customerAddressFromDb),
  };
}

async function saveCustomer(customerId: string | null, body: Record<string, unknown>) {
  if (customerId && !ORDER_ID.test(customerId)) throw new HttpError(400, "O identificador do cliente é inválido.");
  const input = parseCustomerInput(body);
  const db = ordersDb();
  const savedId = await db.begin(async (tx) => {
    let id = customerId;
    if (id) {
      const exists = await tx<{ id: string }>`select id from public.customers where id = ${id} for update`;
      if (!exists.length) throw new HttpError(404, "Cliente não encontrado.");
      await tx`
        update public.customers set name = ${input.name}, cpf_cnpj = ${input.cpfCnpj},
          primary_whatsapp_e164 = ${input.phoneE164}, preferred_reply = ${input.preferredReply},
          is_active = ${input.isActive}, updated_at = now()
        where id = ${id}
      `;
    } else {
      const inserted = await tx<{ id: string }>`
        insert into public.customers (name, cpf_cnpj, primary_whatsapp_e164, preferred_reply, is_active)
        values (${input.name}, ${input.cpfCnpj}, ${input.phoneE164}, ${input.preferredReply}, ${input.isActive})
        returning id
      `;
      id = inserted[0]?.id ?? null;
      if (!id) throw new HttpError(503, "Não foi possível criar o cadastro.");
    }

    await tx`update public.customer_phones set is_primary = false where customer_id = ${id} and is_primary`;
    const phone = await tx<{ id: string }>`
      insert into public.customer_phones (customer_id, phone_e164, source, is_primary)
      values (${id}, ${input.phoneE164}, 'manual', true)
      on conflict (phone_e164) do update set is_primary = true
      where public.customer_phones.customer_id = excluded.customer_id
      returning id
    `;
    if (!phone.length) throw new HttpError(409, "Este WhatsApp já está associado a outro cliente.");

    await tx`update public.customer_addresses set is_active = false, is_default = false, updated_at = now() where customer_id = ${id}`;
    for (const address of input.addresses) {
      const fields = [address.label, address.street, address.number, address.complement, address.neighborhood,
        address.city, address.state, address.postalCode, address.reference, address.isDefault, address.isActive];
      if (address.id) {
        const updated = await tx<{ id: string }>`
          update public.customer_addresses set
            label = ${fields[0]}, street = ${fields[1]}, number = ${fields[2]}, complement = ${fields[3]},
            neighborhood = ${fields[4]}, city = ${fields[5]}, state = ${fields[6]}, postal_code = ${fields[7]},
            reference = ${fields[8]}, is_default = ${fields[9]}, is_active = ${fields[10]}, updated_at = now()
          where id = ${address.id} and customer_id = ${id}
          returning id
        `;
        if (!updated.length) throw new HttpError(409, "Um endereço enviado não pertence a este cadastro.");
      } else {
        await tx`
          insert into public.customer_addresses
            (customer_id, label, street, number, complement, neighborhood, city, state, postal_code, reference, is_default, is_active)
          values (${id}, ${fields[0]}, ${fields[1]}, ${fields[2]}, ${fields[3]}, ${fields[4]}, ${fields[5]}, ${fields[6]}, ${fields[7]}, ${fields[8]}, ${fields[9]}, ${fields[10]})
        `;
      }
    }
    return id;
  }).catch((error: unknown) => {
    if (error instanceof HttpError) throw error;
    if (isRecord(error) && error.code === "23505") throw new HttpError(409, "CPF/CNPJ ou WhatsApp já está vinculado a outro cliente.");
    throw error;
  });
  return await customerDetail(savedId);
}

interface MetaChannelConfig {
  channel: FlowChannel;
  accountId: string | null;
  accountActive: boolean;
  accountName: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  accessToken: string | null;
  graphVersion: string | null;
  endpointUri: string | null;
  privateKey: string | null;
  blockers: string[];
}

async function metaChannelConfig(channel: FlowChannel): Promise<MetaChannelConfig> {
  const slug = `dona-antonia-${channel}`;
  const rows = await ordersDb()<{
    id: string; display_name: string; waba_id: string | null; phone_number_id: string | null; is_active: boolean;
  }>`select id, display_name, waba_id, phone_number_id, is_active from public.whatsapp_accounts where slug = ${slug} limit 1`;
  const row = rows[0];
  const accessToken = metaAccessToken(channel);
  const graphVersion = metaGraphVersion();
  const endpointUri = flowEndpointUri();
  const privateKey = flowPrivateKey(channel);
  const blockers: string[] = [];
  if (!row?.is_active) blockers.push("A conta WhatsApp deste canal não está ativa no registro privado.");
  if (!row?.waba_id) blockers.push("O WABA deste canal não está configurado no banco privado.");
  if (!row?.phone_number_id) blockers.push("O phone number ID deste canal não está configurado no banco privado.");
  if (!accessToken) blockers.push("A conexão compartilhada META_WHATSAPP_ACCESS_TOKEN não está disponível no servidor.");
  if (!graphVersion || !/^v\d+\.\d+$/.test(graphVersion)) blockers.push("A versão META_WHATSAPP_GRAPH_VERSION não está disponível no servidor.");
  if (!endpointUri) blockers.push("Configure WHATSAPP_FLOW_ENDPOINT_URI com a URL HTTPS pública do runtime.");
  else {
    try {
      const endpoint = new URL(endpointUri);
      if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) blockers.push("A URL do endpoint Flow precisa ser HTTPS e não pode conter credenciais ou fragmento.");
    } catch { blockers.push("WHATSAPP_FLOW_ENDPOINT_URI não contém uma URL válida."); }
  }
  if (!privateKey) blockers.push(`A chave privada do Flow do canal ${channel} não está disponível no servidor.`);
  return {
    channel,
    accountId: row?.id ?? null,
    accountActive: row?.is_active === true,
    accountName: row?.display_name ?? null,
    wabaId: row?.waba_id ?? null,
    phoneNumberId: row?.phone_number_id ?? null,
    accessToken,
    graphVersion,
    endpointUri,
    privateKey,
    blockers,
  };
}

interface MetaChannelFlowBinding {
  meta_flow_id: string;
  flow_message_version: string;
  flow_cta: string;
  flow_action: string;
  first_screen: string;
}

async function readMetaChannelFlowBinding(channel: FlowChannel, accountId: string | null): Promise<{
  ready: boolean;
  binding: MetaChannelFlowBinding | null;
}> {
  if (!accountId) return { ready: false, binding: null };
  try {
    const rows = await ordersDb()<MetaChannelFlowBinding>`
      select meta_flow_id, flow_message_version, flow_cta, flow_action, first_screen
      from whatsapp_atendimento.channel_flow_bindings
      where channel = ${channel} and whatsapp_account_id = ${accountId}
      limit 1
    `;
    return { ready: true, binding: rows[0] ?? null };
  } catch {
    return { ready: false, binding: null };
  }
}

interface MetaFlowUploadRecord {
  meta_flow_id: string;
  basket_id: string;
  catalog_revision: string;
  flow_json_sha256: string;
}

async function readMetaFlowUploads(channel: FlowChannel, accountId: string | null): Promise<{
  ready: boolean;
  uploads: MetaFlowUploadRecord[];
}> {
  if (!accountId) return { ready: false, uploads: [] };
  try {
    const uploads = await ordersDb()<MetaFlowUploadRecord>`
      select meta_flow_id, basket_id, catalog_revision, flow_json_sha256
      from whatsapp_atendimento.channel_flow_uploads
      where channel = ${channel} and whatsapp_account_id = ${accountId}
    `;
    return { ready: true, uploads };
  } catch {
    return { ready: false, uploads: [] };
  }
}

async function metaGraph(config: MetaChannelConfig, path: string, method: "GET" | "POST", body?: BodyInit): Promise<unknown> {
  if (!config.accessToken || !config.graphVersion) throw new HttpError(503, `A conexão Meta do canal ${config.channel} não está configurada.`);
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.accessToken}`, ...(body instanceof FormData ? {} : body ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } : {}) },
    ...(body ? { body } : {}),
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = isRecord(result) && isRecord(result.error) && typeof result.error.code === "number" ? result.error.code : null;
    throw new HttpError(502, code === 190 ? "O token da Meta expirou ou não tem as permissões necessárias." : "A Meta não concluiu a operação solicitada para este canal.");
  }
  return result;
}

function metaValidationErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item.slice(0, 500)];
    return isRecord(item) && typeof item.message === "string" ? [item.message.slice(0, 500)] : [];
  }).slice(0, 30);
}

function metaFlowSummary(value: unknown) {
  if (!isRecord(value) || typeof value.id !== "string" || !/^\d{5,32}$/.test(value.id)) return null;
  return {
    id: value.id,
    name: typeof value.name === "string" ? value.name.slice(0, 120) : "Flow sem nome",
    status: typeof value.status === "string" ? value.status : "UNKNOWN",
    categories: Array.isArray(value.categories) ? value.categories.filter((item): item is string => typeof item === "string").slice(0, 10) : [],
    validationErrors: metaValidationErrors(value.validation_errors),
    endpointUri: typeof value.endpoint_uri === "string" ? value.endpoint_uri : typeof value.data_channel_uri === "string" ? value.data_channel_uri : null,
  };
}

async function readMetaFlowList(config: MetaChannelConfig) {
  if (!config.accountActive || !config.wabaId || !config.accessToken || !config.graphVersion || !config.phoneNumberId) {
    return { channel: config.channel, loaded: true as const, configured: false, accountName: config.accountName,
      blockers: config.blockers, flows: [], encryptionConfigured: false, endpointUri: config.endpointUri,
      bindingStoreReady: false, activeBinding: null };
  }
  const query = new URLSearchParams({ fields: "id,name,status,categories,validation_errors,data_channel_uri", limit: "100" });
  const result = await metaGraph(config, `/${encodeURIComponent(config.wabaId)}/flows?${query}`, "GET");
  const rawFlows = isRecord(result) && Array.isArray(result.data) ? result.data : [];
  const rawFlowsSummary = rawFlows.flatMap((raw) => {
    const flow = metaFlowSummary(raw);
    return flow ? [flow] : [];
  });
  let encryptionConfigured = false;
  try {
    const encryption = await metaGraph(config, `/${encodeURIComponent(config.phoneNumberId)}/whatsapp_business_encryption`, "GET");
    if (isRecord(encryption)) {
      const entries = Array.isArray(encryption.data) ? encryption.data : [encryption];
      const expectedKey = config.privateKey ? await metaPublicKeyPem(config.privateKey) : null;
      const normalizeKey = (value: string) => value.replace(/\s/g, "");
      encryptionConfigured = Boolean(expectedKey) && entries.some((entry) => isRecord(entry)
        && typeof entry.business_public_key === "string" && normalizeKey(entry.business_public_key) === normalizeKey(expectedKey!));
    }
  } catch { encryptionConfigured = false; }
  const bindingState = await readMetaChannelFlowBinding(config.channel, config.accountId);
  const uploadState = await readMetaFlowUploads(config.channel, config.accountId);
  const uploadedIds = new Set(uploadState.uploads.map((upload) => upload.meta_flow_id));
  const flows = rawFlowsSummary.map((flow) => ({ ...flow, uploadedByAdmin: uploadedIds.has(flow.id) }));
  const bindingStoreReady = bindingState.ready && uploadState.ready;
  return {
    channel: config.channel,
    loaded: true as const,
    configured: true,
    accountName: config.accountName,
    blockers: bindingStoreReady
      ? config.blockers
      : [...config.blockers, "A migration local de vínculo dos Flows por canal ainda não está disponível no banco."],
    flows,
    encryptionConfigured,
    endpointUri: config.endpointUri,
    bindingStoreReady,
    activeBinding: bindingState.binding ? {
      flowId: bindingState.binding.meta_flow_id,
      flowMessageVersion: bindingState.binding.flow_message_version,
      flowCta: bindingState.binding.flow_cta,
      flowAction: bindingState.binding.flow_action,
      firstScreen: bindingState.binding.first_screen,
    } : null,
  };
}

async function getMetaFlow(config: MetaChannelConfig, flowId: string) {
  if (!/^\d{5,32}$/.test(flowId)) throw new HttpError(400, "O ID do Flow Meta é inválido.");
  const fields = "id,name,status,categories,validation_errors,data_channel_uri,whatsapp_business_account";
  return await metaGraph(config, `/${encodeURIComponent(flowId)}?${new URLSearchParams({ fields })}`, "GET");
}

async function createMetaFlow(channel: FlowChannel, body: Record<string, unknown>) {
  const name = body.name;
  if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 60) {
    throw new HttpError(422, "O nome do Flow deve usar minúsculas, números e hífen (até 60 caracteres).");
  }
  const config = await metaChannelConfig(channel);
  if (!config.accountActive || !config.wabaId) throw new HttpError(503, `A conta Meta ativa do canal ${channel} não está configurada.`);
  const form = new URLSearchParams({ name, categories: JSON.stringify(["CUSTOMER_SUPPORT"]) });
  const result = await metaGraph(config, `/${encodeURIComponent(config.wabaId)}/flows`, "POST", form);
  if (!isRecord(result) || typeof result.id !== "string" || !/^\d{5,32}$/.test(result.id)) throw new HttpError(502, "A Meta não retornou o identificador do Flow criado.");
  return { id: result.id, name: typeof result.name === "string" ? result.name : name };
}

async function uploadMetaFlow(channel: FlowChannel, flowId: string, body: Record<string, unknown>, operatorId: string) {
  const config = await metaChannelConfig(channel);
  if (config.blockers.length) throw new HttpError(503, `Revise a configuração Meta: ${config.blockers.slice(0, 4).join(" ")}`);
  const name = body.name;
  if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 60) throw new HttpError(422, "O nome técnico do Flow é inválido.");
  const basketId = body.basketId;
  if (typeof basketId !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(basketId)) throw new HttpError(422, "Selecione a cesta associada a este rascunho.");
  const catalog = await readCatalog(await installationToken("read"));
  const basket = catalog.baskets.baskets.find((item: Basket) => item.id === basketId && item.active);
  if (!basket || !isRecord(body.flowJson) || validateBasketFlow(basket, catalog.products.products, body.flowJson).length) {
    throw new HttpError(422, "O JSON enviado não corresponde à cesta ativa selecionada nesta revisão do GitHub.");
  }
  const channelFlows = await readMetaFlowList(config);
  if (!channelFlows.flows.some((entry) => entry.id === flowId)) throw new HttpError(403, "Este Flow não pertence à conta Meta vinculada ao canal selecionado.");
  const bindingState = await readMetaChannelFlowBinding(channel, config.accountId);
  const uploadState = await readMetaFlowUploads(channel, config.accountId);
  if (!bindingState.ready || !uploadState.ready || !config.accountId) throw new HttpError(503, "A migration privada de gestão dos Flows precisa estar aplicada antes de enviar assets.");
  if (bindingState.binding?.meta_flow_id === flowId) {
    throw new HttpError(409, "Este Flow está ligado ao canal. Vincule outro Flow publicado ou remova o vínculo antes de substituir seus assets.");
  }
  const flow = await getMetaFlow(config, flowId);
  if (!isRecord(flow) || flow.status !== "DRAFT") throw new HttpError(409, "Somente um Flow DRAFT desta conta pode receber atualizações.");
  const file = new File([JSON.stringify(body.flowJson)], "flow.json", { type: "application/json" });
  const upload = new FormData();
  upload.set("file", file);
  upload.set("name", "flow.json");
  upload.set("asset_type", "FLOW_JSON");
  const assetResult = await metaGraph(config, `/${encodeURIComponent(flowId)}/assets`, "POST", upload);
  const validationErrors = isRecord(assetResult) ? metaValidationErrors(assetResult.validation_errors) : [];
  const metadata = new URLSearchParams({ name, categories: JSON.stringify(["CUSTOMER_SUPPORT"]), endpoint_uri: config.endpointUri! });
  await metaGraph(config, `/${encodeURIComponent(flowId)}`, "POST", metadata);
  if (!validationErrors.length) {
    const encodedJson = new TextEncoder().encode(JSON.stringify(body.flowJson));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encodedJson));
    const flowJsonSha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    await ordersDb()`
      insert into whatsapp_atendimento.channel_flow_uploads
        (channel, whatsapp_account_id, meta_flow_id, basket_id, catalog_revision, flow_json_sha256, uploaded_by, uploaded_at)
      values (${channel}, ${config.accountId}, ${flowId}, ${basket.id}, ${catalog.catalogRevision}, ${flowJsonSha256}, ${operatorId}, now())
      on conflict (channel, meta_flow_id) do update set
        whatsapp_account_id = excluded.whatsapp_account_id,
        basket_id = excluded.basket_id,
        catalog_revision = excluded.catalog_revision,
        flow_json_sha256 = excluded.flow_json_sha256,
        uploaded_by = excluded.uploaded_by,
        uploaded_at = now()
    `;
  }
  return { validationErrors };
}

function metaPrivatePkcs8(value: string): Uint8Array {
  const pem = value.replace(/\\n/g, "\n").trim();
  const pkcs8 = pem.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  if (pkcs8) return Uint8Array.from(atob(pkcs8[1].replace(/\s/g, "")), (character) => character.charCodeAt(0));
  const pkcs1 = pem.match(/-----BEGIN RSA PRIVATE KEY-----([\s\S]+?)-----END RSA PRIVATE KEY-----/);
  if (!pkcs1) throw new HttpError(503, "A chave privada do endpoint Flow está em formato incompatível.");
  const key = Uint8Array.from(atob(pkcs1[1].replace(/\s/g, "")), (character) => character.charCodeAt(0));
  const algorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const length = (size: number): Uint8Array => size < 128 ? new Uint8Array([size]) : new Uint8Array([0x82, size >> 8, size & 255]);
  const der = (tag: number, content: Uint8Array): Uint8Array => new Uint8Array([tag, ...length(content.length), ...content]);
  const privateKey = der(0x04, key);
  return der(0x30, new Uint8Array([0x02, 0x01, 0x00, ...algorithm, ...privateKey]));
}

async function metaPublicKeyPem(privateKeyValue: string): Promise<string> {
  const privateKey = await crypto.subtle.importKey("pkcs8", asArrayBuffer(metaPrivatePkcs8(privateKeyValue)), { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
  if (!privateJwk.n || !privateJwk.e) throw new HttpError(503, "Não foi possível obter a chave pública deste canal.");
  const publicKey = await crypto.subtle.importKey("jwk", { kty: "RSA", n: privateJwk.n, e: privateJwk.e, alg: "RSA-OAEP-256", ext: true, key_ops: ["encrypt"] }, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]);
  const derBytes = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
  let binary = "";
  for (const byte of derBytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PUBLIC KEY-----\n${encoded}\n-----END PUBLIC KEY-----`;
}

async function configureMetaFlowEncryption(channel: FlowChannel, body: Record<string, unknown>) {
  if (body.confirmChannel !== channel) throw new HttpError(400, "Confirme o canal selecionado antes de configurar a criptografia.");
  const config = await metaChannelConfig(channel);
  if (config.blockers.length) throw new HttpError(503, `Revise a configuração Meta: ${config.blockers.slice(0, 4).join(" ")}`);
  if (!config.privateKey || !config.phoneNumberId) throw new HttpError(503, "A chave privada e o phone number ID deste canal são necessários.");
  const pem = await metaPublicKeyPem(config.privateKey);
  const form = new URLSearchParams({ business_public_key: pem });
  await metaGraph(config, `/${encodeURIComponent(config.phoneNumberId)}/whatsapp_business_encryption`, "POST", form);
  return { configured: true as const };
}

async function publishMetaFlow(channel: FlowChannel, flowId: string, body: Record<string, unknown>) {
  if (body.confirmPublish !== "PUBLISH_FLOW" || body.confirmChannel !== channel) throw new HttpError(400, "A publicação precisa de confirmação explícita para este canal.");
  const config = await metaChannelConfig(channel);
  if (config.blockers.length) throw new HttpError(503, `Revise a configuração Meta: ${config.blockers.slice(0, 4).join(" ")}`);
  const channelFlows = await readMetaFlowList(config);
  if (!channelFlows.flows.some((entry) => entry.id === flowId)) throw new HttpError(403, "Este Flow não pertence à conta Meta vinculada ao canal selecionado.");
  const flow = await getMetaFlow(config, flowId);
  const summary = metaFlowSummary(flow);
  if (!summary || summary.status !== "DRAFT") throw new HttpError(409, "Somente um Flow DRAFT desta conta pode ser publicado.");
  if (summary.validationErrors.length) throw new HttpError(409, "A Meta ainda reporta erros de validação neste Flow.");
  if (!summary.endpointUri || summary.endpointUri !== config.endpointUri) throw new HttpError(409, "O Flow precisa apontar para o endpoint configurado deste canal.");
  const status = await readMetaFlowList(config);
  if (!status.encryptionConfigured) throw new HttpError(409, "Configure e confirme a criptografia do endpoint deste phone number antes de publicar.");
  const result = await metaGraph(config, `/${encodeURIComponent(flowId)}/publish`, "POST", new URLSearchParams());
  if (!isRecord(result) || result.success !== true) throw new HttpError(502, "A Meta não confirmou a publicação do Flow.");
  return { success: true as const };
}

async function bindPublishedMetaFlow(channel: FlowChannel, body: Record<string, unknown>, operatorId: string) {
  const flowId = body.flowId;
  const expectedFlowId = body.expectedFlowId;
  if (body.confirmChannel !== channel || typeof flowId !== "string" || !/^\d{5,32}$/.test(flowId)
    || !(expectedFlowId === null || (typeof expectedFlowId === "string" && /^\d{5,32}$/.test(expectedFlowId)))) {
    throw new HttpError(400, "Confirme o número e envie o Flow e a revisão de vínculo esperados.");
  }
  const config = await metaChannelConfig(channel);
  if (config.blockers.length) throw new HttpError(503, `Revise a configuração Meta: ${config.blockers.slice(0, 4).join(" ")}`);
  if (!config.accountId || !config.wabaId) throw new HttpError(503, "A associação deste número à conta Meta não está completa.");
  const status = await readMetaFlowList(config);
  if (!status.bindingStoreReady) throw new HttpError(503, "A migration privada de vínculo dos Flows ainda não foi aplicada.");
  if (!status.encryptionConfigured) throw new HttpError(409, "A chave criptográfica deste phone number ainda não foi confirmada pela Meta.");
  if (!status.flows.some((item) => item.id === flowId)) throw new HttpError(403, "Este Flow não pertence ao WABA selecionado.");
  const flow = await getMetaFlow(config, flowId);
  const summary = metaFlowSummary(flow);
  if (!summary || summary.status !== "PUBLISHED") throw new HttpError(409, "Somente um Flow publicado pode ser vinculado ao atendimento.");
  if (summary.validationErrors.length) throw new HttpError(409, "A Meta ainda reporta erros de validação neste Flow.");
  if (!summary.endpointUri || summary.endpointUri !== config.endpointUri) throw new HttpError(409, "O Flow publicado não aponta para o endpoint configurado deste canal.");

  const uploads = await ordersDb()<MetaFlowUploadRecord>`
    select meta_flow_id, basket_id, catalog_revision, flow_json_sha256
    from whatsapp_atendimento.channel_flow_uploads
    where channel = ${channel} and whatsapp_account_id = ${config.accountId} and meta_flow_id = ${flowId}
    limit 1
  `;
  const upload = uploads[0];
  if (!upload) throw new HttpError(409, "Este Flow não recebeu um JSON gerado e validado pelo Admin novo; faça o upload do rascunho greenfield antes de vincular.");
  const currentCatalog = await readCatalog(await installationToken("read"));
  if (upload.catalog_revision !== currentCatalog.catalogRevision
    || !currentCatalog.baskets.baskets.some((basket: Basket) => basket.id === upload.basket_id && basket.active)) {
    throw new HttpError(409, "O catálogo mudou após o upload do Flow. Gere e envie novamente o JSON desta cesta antes de vincular.");
  }

  try {
    return await ordersDb().begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`whatsapp-atendimento:flow-binding:${channel}`}, 0))`;
      const current = await tx<{ meta_flow_id: string }>`
        select meta_flow_id from whatsapp_atendimento.channel_flow_bindings
        where channel = ${channel} and whatsapp_account_id = ${config.accountId}
        for update
      `;
      const currentFlowId = current[0]?.meta_flow_id ?? null;
      if (currentFlowId !== expectedFlowId) throw new HttpError(409, "O vínculo do canal mudou. Atualize o estado Meta antes de tentar novamente.");
      const saved = await tx<{ meta_flow_id: string }>`
        insert into whatsapp_atendimento.channel_flow_bindings
          (channel, whatsapp_account_id, meta_flow_id, updated_by, updated_at)
        values (${channel}, ${config.accountId}, ${flowId}, ${operatorId}, now())
        on conflict (channel) do update set
          whatsapp_account_id = excluded.whatsapp_account_id,
          meta_flow_id = excluded.meta_flow_id,
          updated_by = excluded.updated_by,
          updated_at = now()
        where whatsapp_atendimento.channel_flow_bindings.whatsapp_account_id = excluded.whatsapp_account_id
        returning meta_flow_id
      `;
      if (!saved.length) throw new HttpError(409, "A conta vinculada ao canal mudou; atualize a página e confira os dois números.");
      return { channel, flowId: saved[0].meta_flow_id };
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (isRecord(error) && error.code === "23505") throw new HttpError(409, "Este Flow já está vinculado a outro número.");
    throw error;
  }
}

async function unbindMetaFlow(channel: FlowChannel, body: Record<string, unknown>) {
  const expectedFlowId = body.expectedFlowId;
  if (body.confirmChannel !== channel || typeof expectedFlowId !== "string" || !/^\d{5,32}$/.test(expectedFlowId)) {
    throw new HttpError(400, "Confirme o número e o Flow atualmente vinculado.");
  }
  const config = await metaChannelConfig(channel);
  if (!config.accountId) throw new HttpError(503, "A conta WhatsApp deste canal não está configurada.");
  const removed = await ordersDb()<MetaChannelFlowBinding>`
    delete from whatsapp_atendimento.channel_flow_bindings
    where channel = ${channel} and whatsapp_account_id = ${config.accountId} and meta_flow_id = ${expectedFlowId}
    returning meta_flow_id, flow_message_version, flow_cta, flow_action, first_screen
  `;
  if (!removed.length) throw new HttpError(409, "O Flow vinculado mudou. Atualize o estado do canal antes de tentar novamente.");
  return { channel, flowId: expectedFlowId, removed: true as const };
}

Deno.serve(async (request) => {
  let headers = new Headers();
  try {
    if (request.method === "OPTIONS") {
      headers = corsHeaders(request.headers.get("Origin") ?? "");
      return new Response(null, { status: 204, headers });
    }
    const url = new URL(request.url);
    if (url.pathname.endsWith("/integrations/bling/oauth/callback") && request.method === "GET") {
      return await blingOAuthCallback(url);
    }
    const authorization = await authorize(request);
    headers = authorization.headers;

    if (url.pathname.endsWith("/attendance/accounts") && request.method === "GET") {
      const forwarded = await forwardSupabaseFunction(request, "admin-whatsapp-ops-v1", "GET", new URLSearchParams({ action: "accounts" }));
      if (!isRecord(forwarded.payload) || !Array.isArray(forwarded.payload.items)) return jsonResponse(forwarded.payload, forwarded.status, headers);
      const items = forwarded.payload.items.filter((item) => {
        if (!isRecord(item) || typeof item.phone_e164 !== "string") return false;
        return whatsappChannelFromPhone(item.phone_e164) !== null;
      });
      return jsonResponse({ ...forwarded.payload, items }, forwarded.status, headers);
    }
    if (url.pathname.endsWith("/attendance/queue") && request.method === "GET") {
      const accountId = url.searchParams.get("accountId") ?? "";
      if (!ORDER_ID.test(accountId)) throw new HttpError(400, "Selecione um canal WhatsApp válido.");
      await requireSupportedAttendanceAccount(request, accountId);
      const query = new URLSearchParams({ action: "queue", account_id: accountId, limit: "50" });
      const search = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
      if (search) query.set("search", search);
      const forwarded = await forwardSupabaseFunction(request, "admin-whatsapp-ops-v1", "GET", query);
      return jsonResponse(forwarded.payload, forwarded.status, headers);
    }
    const attendanceMedia = url.pathname.match(/\/attendance\/conversations\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})\/media$/i);
    if (attendanceMedia && request.method === "GET") {
      const accountId = url.searchParams.get("accountId") ?? "";
      if (!ORDER_ID.test(accountId)) throw new HttpError(400, "Selecione um canal WhatsApp válido.");
      return await proxyAttendanceMedia(request, attendanceMedia[1], accountId, attendanceMedia[2], headers);
    }
    const attendanceConversation = url.pathname.match(/\/attendance\/conversations\/([0-9a-f-]{36})$/i);
    if (attendanceConversation && request.method === "GET" && ORDER_ID.test(attendanceConversation[1])) {
      const accountId = url.searchParams.get("accountId") ?? "";
      if (!ORDER_ID.test(accountId)) throw new HttpError(400, "Selecione um canal WhatsApp válido.");
      const forwarded = await requireSupportedAttendanceConversation(request, attendanceConversation[1], accountId);
      const control = await attendanceControlState(attendanceConversation[1], accountId, authorization.operator.id);
      const payload = isRecord(forwarded.payload) && isRecord(forwarded.payload.conversation)
        ? { ...forwarded.payload, conversation: { ...forwarded.payload.conversation, mode: control.mode, operator_assignment: control.operatorAssignment } }
        : forwarded.payload;
      return jsonResponse(payload, forwarded.status, headers);
    }
    if (url.pathname.endsWith("/attendance/operations") && request.method === "POST") {
      const body = await readJson(request);
      const forwarded = await proxyAttendanceOperation(request, body, authorization.operator.id);
      return jsonResponse(forwarded.payload, forwarded.status, headers);
    }
    if (url.pathname.endsWith("/attendance/mode") && request.method === "POST") {
      const body = await readJson(request);
      return jsonResponse(await updateAttendanceMode(request, body), 200, headers);
    }
    if (url.pathname.endsWith("/attendance/ana") && request.method === "POST") {
      const body = await readJson(request);
      const forwarded = await proxyAnaAdmin(request, body);
      return jsonResponse(forwarded.payload, forwarded.status, headers);
    }

    const metaListMatch = url.pathname.match(new RegExp(`\\/meta-flows\\/(${CHANNEL_PATTERN})$`));
    if (metaListMatch && isFlowChannel(metaListMatch[1]) && request.method === "GET") {
      return jsonResponse(await readMetaFlowList(await metaChannelConfig(metaListMatch[1])), 200, headers);
    }
    const metaCreateMatch = url.pathname.match(new RegExp(`\\/meta-flows\\/(${CHANNEL_PATTERN})\\/create$`));
    if (metaCreateMatch && isFlowChannel(metaCreateMatch[1]) && request.method === "POST") {
      return jsonResponse(await createMetaFlow(metaCreateMatch[1], await readJson(request)), 201, headers);
    }
    const metaEncryptionMatch = url.pathname.match(new RegExp(`\\/meta-flows\\/(${CHANNEL_PATTERN})\\/encryption$`));
    if (metaEncryptionMatch && isFlowChannel(metaEncryptionMatch[1]) && request.method === "POST") {
      return jsonResponse(await configureMetaFlowEncryption(metaEncryptionMatch[1], await readJson(request)), 200, headers);
    }
    const metaBindingMatch = url.pathname.match(new RegExp(`\\/meta-flows\\/(${CHANNEL_PATTERN})\\/binding$`));
    if (metaBindingMatch && isFlowChannel(metaBindingMatch[1])) {
      if (request.method === "POST") {
        return jsonResponse(await bindPublishedMetaFlow(metaBindingMatch[1], await readJson(request), authorization.operator.id), 200, headers);
      }
      if (request.method === "DELETE") {
        return jsonResponse(await unbindMetaFlow(metaBindingMatch[1], await readJson(request)), 200, headers);
      }
    }
    const metaFlowAction = url.pathname.match(new RegExp(`\\/meta-flows\\/(${CHANNEL_PATTERN})\\/(\\d{5,32})\\/(upload|publish)$`));
    if (metaFlowAction && isFlowChannel(metaFlowAction[1])) {
      if (metaFlowAction[3] === "upload" && request.method === "POST") {
        const bodyText = await request.text();
        if (new TextEncoder().encode(bodyText).byteLength > MAX_FLOW_DRAFT_BYTES) throw new HttpError(413, "O JSON do Flow excede o limite permitido.");
        let body: unknown;
        try { body = JSON.parse(bodyText); } catch { throw new HttpError(400, "O JSON do Flow é inválido."); }
        if (!isRecord(body)) throw new HttpError(400, "A solicitação de atualização do Flow é inválida.");
        return jsonResponse(await uploadMetaFlow(metaFlowAction[1], metaFlowAction[2], body, authorization.operator.id), 200, headers);
      }
      if (metaFlowAction[3] === "publish" && request.method === "POST") {
        return jsonResponse(await publishMetaFlow(metaFlowAction[1], metaFlowAction[2], await readJson(request)), 200, headers);
      }
    }
    if (url.pathname.endsWith("/customers") && request.method === "GET") {
      return jsonResponse(await searchCustomers(url.searchParams.get("q") ?? ""), 200, headers);
    }
    if (url.pathname.endsWith("/customers") && request.method === "POST") {
      return jsonResponse(await saveCustomer(null, await readJson(request)), 201, headers);
    }
    const customerMatch = url.pathname.match(/\/customers\/([0-9a-f-]{36})$/i);
    if (customerMatch && ORDER_ID.test(customerMatch[1])) {
      if (request.method === "GET") return jsonResponse(await customerDetail(customerMatch[1]), 200, headers);
      if (request.method === "PUT") return jsonResponse(await saveCustomer(customerMatch[1], await readJson(request)), 200, headers);
    }
    if (url.pathname.endsWith("/integrations/bling/oauth/start") && request.method === "POST") {
      return jsonResponse(await startBlingOAuth(authorization.operator.id), 200, headers);
    }
    const blingProductLookup = url.pathname.match(/\/catalog\/products\/([0-9a-f-]{36})\/bling-lookup$/i);
    if (blingProductLookup && request.method === "GET") {
      return jsonResponse(await lookupBlingProductByCatalogGtin(blingProductLookup[1]), 200, headers);
    }
    if (url.pathname.endsWith("/catalog") && request.method === "GET") {
      const token = await installationToken("read");
      return jsonResponse(await readCatalog(token), 200, headers);
    }
    if (url.pathname.endsWith("/catalog") && request.method === "PUT") {
      const bodyText = await request.text();
      if (bodyText.length > 3_000_000) throw new HttpError(413, "O catálogo excede o limite permitido.");
      let input: SaveInput;
      try {
        input = JSON.parse(bodyText) as SaveInput;
      } catch {
        throw new HttpError(400, "O conteúdo enviado não é JSON válido.");
      }
      const token = await installationToken("write");
      return jsonResponse(await writeCatalog(input, token), 200, headers);
    }
    const flowMatch = url.pathname.match(new RegExp(`\\/flow-drafts\\/(${CHANNEL_PATTERN})$`));
    if (flowMatch && isFlowChannel(flowMatch[1]) && request.method === "GET") {
      const token = await installationToken("read");
      return jsonResponse(await readFlowDraft(flowMatch[1], token), 200, headers);
    }
    if (flowMatch && isFlowChannel(flowMatch[1]) && request.method === "PUT") {
      const bodyText = await request.text();
      if (new TextEncoder().encode(bodyText).byteLength > MAX_FLOW_DRAFT_BYTES) throw new HttpError(413, "O rascunho do Flow excede o limite permitido.");
      let input: unknown;
      try {
        input = JSON.parse(bodyText);
      } catch {
        throw new HttpError(400, "O conteúdo enviado não é JSON válido.");
      }
      const token = await installationToken("write");
      return jsonResponse(await writeFlowDraft(flowMatch[1], input, token), 200, headers);
    }
    if (url.pathname.endsWith("/outbox") && request.method === "GET") {
      return jsonResponse(await listOutboxMessages(), 200, headers);
    }
    if (url.pathname.endsWith("/orders") && request.method === "GET") {
      return jsonResponse({ orders: await listOrders() }, 200, headers);
    }
    const orderMatch = url.pathname.match(/\/orders\/([0-9a-f-]{36})(?:\/(picking|assign|separation\/complete|bling-contact|bling-sale\/(?:reconcile|create)|bling-invoice\/generate|dispatch\/start|delivery\/complete))?$/i);
    if (orderMatch && ORDER_ID.test(orderMatch[1])) {
      const [, orderId, action] = orderMatch;
      if (!action && request.method === "GET") return jsonResponse(await orderDetail(orderId), 200, headers);
      if (action === "picking" && request.method === "PATCH") {
        const result = await savePicking(orderId, authorization.operator.id, await readJson(request));
        wakeOutboxWorker();
        return jsonResponse(result, 200, headers);
      }
      if (action === "assign" && request.method === "POST") {
        return jsonResponse(await assignOrder(orderId, authorization.operator.id, await readJson(request)), 200, headers);
      }
      if (action === "bling-contact" && request.method === "PUT") {
        return jsonResponse(await saveOrderBlingContact(orderId, authorization.operator.id, await readJson(request)), 200, headers);
      }
      if (action === "bling-sale/reconcile" && request.method === "POST") {
        return jsonResponse(await reconcileOrderBlingSale(orderId, authorization.operator.id, await readJson(request)), 200, headers);
      }
      if (action === "bling-sale/create" && request.method === "POST") {
        const body = await readJson(request);
        if (body.confirmation !== "CRIAR_VENDA") throw new HttpError(409, "Confirme explicitamente a criação da venda no Bling.");
        const { order } = await loadOrder(orderId);
        if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision) || order.revision !== body.revision) {
          throw new HttpError(409, "O pedido mudou. Atualize antes de criar a venda.");
        }
        if (order.status !== "awaiting_invoice") throw new HttpError(409, "A venda exige separação concluída.");
        await createBlingSaleForOrder(orderId);
        return jsonResponse(await orderDetail(orderId), 200, headers);
      }
      if (action === "bling-invoice/generate" && request.method === "POST") {
        return jsonResponse(await generateBlingInvoice(orderId, authorization.operator.id, await readJson(request)), 200, headers);
      }
      if (action === "dispatch/start" && request.method === "POST") {
        return jsonResponse(await startOrderDispatch(orderId, authorization.operator.id, await readJson(request)), 200, headers);
      }
      if (action === "delivery/complete" && request.method === "POST") {
        return jsonResponse(await completeOrderDelivery(orderId, authorization.operator.id, await readJson(request)), 200, headers);
      }
      if (action === "separation/complete" && request.method === "POST") {
        return jsonResponse(await finishSeparation(orderId, authorization.operator.id, await readJson(request)), 200, headers);
      }
    }
    throw new HttpError(404, "Rota administrativa não encontrada.");
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, headers);
    console.error("whatsapp-admin-api request failed", error instanceof Error ? error.name : "unknown error");
    return jsonResponse({ error: "Não foi possível concluir a solicitação administrativa." }, 500, headers);
  }
});
