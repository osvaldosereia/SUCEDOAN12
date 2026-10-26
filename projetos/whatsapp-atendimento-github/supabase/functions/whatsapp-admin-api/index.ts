import postgres, { type Sql } from "npm:postgres@3.4.7";
import { reconcileBlingCommercialTotals, type BlingCommercialTotals } from "../../../src/domain/bling.ts";
import { validateCatalog, type Basket, type CatalogDocuments, type Product } from "../../../src/domain/catalog.ts";
import { quoteBasket, type BasketSelections } from "../../../src/domain/flow-runtime.ts";
import {
  FLOW_CHANNELS,
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
const ORDER_ID = /^[0-9a-f-]{36}$/i;
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
    "Access-Control-Allow-Methods": "GET, PUT, PATCH, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, apikey, content-type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  });
}

async function authorize(request: Request): Promise<{ operator: Operator; headers: Headers }> {
  const headers = corsHeaders(request.headers.get("Origin") ?? "");
  const allowedUsers = configuredList("ADMIN_ALLOWED_USER_IDS");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
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
  created_at: string; separation_completed_at: string | null; bling_sale_reference: string | null;
}

interface DbOrderItem {
  id: number; group_id: string; product_id: string; quantity: number; picked_quantity: number;
  unit_price_cents: number; line_total_cents: number; picking_status: string; snapshot: Record<string, unknown>;
  replacement_product_id: string | null;
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
    codigo: string;
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

async function buildBlingSalePreview(
  order: DbOrder,
  items: DbOrderItem[],
  contactId: number | null,
  commercialTotals: BlingCommercialTotals | null,
): Promise<{
  requestSha256: string | null;
  summary: BlingSalePreviewSummary | null;
  blockers: string[];
}> {
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
    if (!Number.isSafeInteger(productId) || productId <= 0 || !sku || !description
      || !Number.isSafeInteger(quantity) || quantity <= 0
      || !Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0
      || !Number.isSafeInteger(expectedLineTotal) || expectedLineTotal !== actualLineTotal) {
      blockers.push("BLING_SALE_ITEM_MAPPING_INVALID");
      continue;
    }
    lineTotalCents += actualLineTotal;
    previewItems.push({
      produto: { id: productId }, codigo: sku, descricao: description,
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
    return { requestSha256: null, summary, blockers: [...new Set(blockers)] };
  }

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
  return { requestSha256: await hashBlingSaleRequest(request), summary, blockers: [] };
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
    snapshot: order.snapshot,
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
    attentionCode: order.attention_code,
    separationCompletedAt: order.separation_completed_at,
    blingContactId: null as number | null,
    blingContactVerifiedAt: null as string | null,
    blingSaleReference: order.bling_sale_reference,
    integrationJob: null as {
      operation: string; status: string; errorCode: string | null; blockers: string[];
      commercialTotals: BlingCommercialTotals | null;
      salePreview: (BlingSalePreviewSummary & { fingerprintReady: boolean }) | null;
    } | null,
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
  const orders = await db<DbOrder>`
    select * from whatsapp_atendimento.orders
    where status not in ('completed', 'cancelled')
    order by created_at asc limit 200
  `;
  return orders.map((order) => orderPresentation(order));
}

async function orderDetail(orderId: string) {
  const { order, items } = await loadOrder(orderId);
  const detail = orderPresentation(order, items);
  const db = ordersDb();
  const customer = isRecord(order.snapshot.customer) ? order.snapshot.customer : {};
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
  }>`select operation, status, error_code, request_sha256, result_summary from whatsapp_atendimento.integration_jobs where order_id = ${orderId} order by created_at desc limit 1`;
  if (jobs[0]) {
    const blockers = Array.isArray(jobs[0].result_summary.blockers)
      ? jobs[0].result_summary.blockers.filter((value): value is string => typeof value === "string")
      : [];
    const rawTotals = jobs[0].result_summary.commercialTotals;
    const commercialTotals = isRecord(rawTotals)
      && typeof rawTotals.lineTotalCents === "number" && Number.isSafeInteger(rawTotals.lineTotalCents)
      && typeof rawTotals.acceptedTotalCents === "number" && Number.isSafeInteger(rawTotals.acceptedTotalCents)
      && typeof rawTotals.commercialDeltaCents === "number" && Number.isSafeInteger(rawTotals.commercialDeltaCents)
      && typeof rawTotals.otherExpensesCents === "number" && Number.isSafeInteger(rawTotals.otherExpensesCents)
      && typeof rawTotals.discountCents === "number" && Number.isSafeInteger(rawTotals.discountCents)
      && typeof rawTotals.balances === "boolean"
      ? rawTotals as unknown as BlingCommercialTotals
      : null;
    const rawPreview = jobs[0].result_summary.salePreview;
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
        fingerprintReady: /^[0-9a-f]{64}$/.test(jobs[0].request_sha256 ?? ""),
      }
      : null;
    detail.integrationJob = { operation: jobs[0].operation, status: jobs[0].status, errorCode: jobs[0].error_code, blockers, commercialTotals, salePreview };
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

/** Read-only server-side client. Keep order writes behind their own preflight and idempotent job handlers. */
export async function blingApiGet(path: string): Promise<unknown> {
  if (typeof path !== "string" || !path.startsWith("/")) throw new HttpError(400, "O caminho Bling precisa ser relativo à API v3.");
  const endpoint = new URL(path, `${BLING_API}/`);
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
    if (!product?.sku || !product.blingProductId) throw new HttpError(409, `A opção ${product?.name ?? choice.productId} ainda não possui SKU e vínculo Bling.`);
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
      const previewBlockers = new Set([
        "BLING_CUSTOMER_CONTACT_MAPPING_MISSING", "BLING_SALE_REFERENCE_OR_DATE_INVALID",
        "BLING_SALE_ADDRESS_INCOMPLETE", "BLING_SALE_PAYMENT_METHOD_UNSUPPORTED",
        "BLING_SALE_TOTALS_OR_ITEMS_INVALID", "BLING_SALE_ITEM_MAPPING_INVALID",
        "BLING_PAYMENT_FORM_MAPPING_MISSING", "BLING_DUE_DATE_POLICY_MISSING",
      ]);
      const retainedBlockers = new Set([
        "BLING_OAUTH_CREDENTIAL_MISSING", "BLING_TOTAL_RECONCILIATION_INVALID",
        "BLING_CONNECTOR_DISABLED_IN_DEVELOPMENT", "BLING_BASKET_ADJUSTMENT_RULE_UNRESOLVED",
      ]);
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
        const previousBlockers = Array.isArray(affectedOrder.result_summary.blockers)
          ? affectedOrder.result_summary.blockers.filter((value): value is string => typeof value === "string")
          : [];
        const blockers = [...new Set([
          ...previousBlockers.filter((value) => retainedBlockers.has(value) && !previewBlockers.has(value)),
          ...preview.blockers,
        ])];
        await tx`
          update whatsapp_atendimento.integration_jobs
          set request_sha256 = ${preview.requestSha256},
              result_summary = ${tx.json({ blockers, commercialTotals: totals, salePreview: preview.summary })},
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
    const credential = await tx<{ provider: string }>`select provider from whatsapp_atendimento.integration_credentials where provider = 'bling' and expires_at > now()`;
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
      ...(!credential.length ? ["BLING_OAUTH_CREDENTIAL_MISSING"] : []),
      ...(!commercialTotals?.balances ? ["BLING_TOTAL_RECONCILIATION_INVALID"] : []),
      ...salePreview.blockers,
      "BLING_CONNECTOR_DISABLED_IN_DEVELOPMENT",
    ];
    await tx`update whatsapp_atendimento.orders set status = 'awaiting_invoice', separation_completed_at = now(), bling_sale_reference = ${saleReference}, revision = revision + 1, attention_code = 'bling_preflight_required', updated_at = now() where id = ${orderId}`;
    await tx`
      insert into whatsapp_atendimento.integration_jobs (order_id, operation, idempotency_key, status, error_code, request_sha256, result_summary)
      values (${orderId}, 'create_sale', ${`${orderId}:create_sale`}, 'blocked', 'BLING_PREFLIGHT_REQUIRED', ${salePreview.requestSha256}, ${tx.json({ blockers: [...new Set(blockers)], commercialTotals, salePreview: salePreview.summary })})
      on conflict (order_id, operation) do nothing
    `;
    await tx`insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data) values (${orderId}, ${`${orderId}:separation-complete:${order.revision + 1}`}, 'separation_completed', ${tx.json({ operatorId, integrationBlocked: true })}) on conflict (event_key) do nothing`;
  });
  return orderDetail(orderId);
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

    if (url.pathname.endsWith("/integrations/bling/oauth/start") && request.method === "POST") {
      return jsonResponse(await startBlingOAuth(authorization.operator.id), 200, headers);
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
    const flowMatch = url.pathname.match(/\/flow-drafts\/(0975|1018)$/);
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
    if (url.pathname.endsWith("/orders") && request.method === "GET") {
      return jsonResponse({ orders: await listOrders() }, 200, headers);
    }
    const orderMatch = url.pathname.match(/\/orders\/([0-9a-f-]{36})(?:\/(picking|assign|separation\/complete|bling-contact))?$/i);
    if (orderMatch && ORDER_ID.test(orderMatch[1])) {
      const [, orderId, action] = orderMatch;
      if (!action && request.method === "GET") return jsonResponse(await orderDetail(orderId), 200, headers);
      if (action === "picking" && request.method === "PATCH") {
        return jsonResponse(await savePicking(orderId, authorization.operator.id, await readJson(request)), 200, headers);
      }
      if (action === "assign" && request.method === "POST") {
        return jsonResponse(await assignOrder(orderId, authorization.operator.id, await readJson(request)), 200, headers);
      }
      if (action === "bling-contact" && request.method === "PUT") {
        return jsonResponse(await saveOrderBlingContact(orderId, authorization.operator.id, await readJson(request)), 200, headers);
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
