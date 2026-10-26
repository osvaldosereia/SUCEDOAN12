import { validateCatalog, type CatalogDocuments } from "../../../src/domain/catalog.ts";

const OWNER = "osvaldosereia";
const REPOSITORY = "SUCEDOAN12";
const BRANCH = "project/whatsapp-atendimento-github-20261025";
const PRODUCTS_PATH = "projetos/whatsapp-atendimento-github/catalog/products.json";
const BASKETS_PATH = "projetos/whatsapp-atendimento-github/catalog/baskets.json";
const IMAGE_PREFIX = "projetos/whatsapp-atendimento-github/images/products/";
const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const MAX_IMAGE_BYTES = 27 * 1024;
const MAX_PENDING_IMAGES = 61;

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
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
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
    githubJson<{ content: string }>(repositoryPath(`/contents/${PRODUCTS_PATH}?${ref}`), token),
    githubJson<{ content: string }>(repositoryPath(`/contents/${BASKETS_PATH}?${ref}`), token),
  ]);
  const products = JSON.parse(decodeFileContent(productsFile.content));
  const baskets = JSON.parse(decodeFileContent(basketsFile.content));
  return {
    products,
    baskets,
    commitSha,
    commitUrl: `https://github.com/${OWNER}/${REPOSITORY}/commit/${commitSha}`,
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
  };
}

Deno.serve(async (request) => {
  let headers = new Headers();
  try {
    if (request.method === "OPTIONS") {
      headers = corsHeaders(request.headers.get("Origin") ?? "");
      return new Response(null, { status: 204, headers });
    }
    const authorization = await authorize(request);
    headers = authorization.headers;

    const url = new URL(request.url);
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
    throw new HttpError(404, "Rota administrativa não encontrada.");
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, headers);
    console.error("whatsapp-admin-api request failed", error instanceof Error ? error.name : "unknown error");
    return jsonResponse({ error: "Não foi possível concluir a solicitação administrativa." }, 500, headers);
  }
});
