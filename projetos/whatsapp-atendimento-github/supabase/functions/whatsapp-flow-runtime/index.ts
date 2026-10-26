import { validateCatalog, type Basket, type CatalogDocuments, type Product } from "../../../src/domain/catalog.ts";
import {
  defaultBasketSelections,
  FlowSelectionError,
  quoteBasket,
  type BasketSelections,
} from "../../../src/domain/flow-runtime.ts";

const OWNER = "osvaldosereia";
const REPOSITORY = "SUCEDOAN12";
const CATALOG_COMMIT = /^[a-f0-9]{40}$/i;
const CATALOG_REVISION = /^[a-f0-9]{40}:[a-f0-9]{40}$/i;
const FLOW_TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const BODY_LIMIT = 1024 * 1024;
const CHANNELS = ["0975", "1018"] as const;
type FlowChannel = typeof CHANNELS[number];

interface FlowSession {
  channel: FlowChannel;
  basket_id: string;
  catalog_commit: string;
  catalog_revision: string;
  phone_e164: string;
}

interface DecryptedRequest {
  action: string;
  flow_token?: string;
  screen?: string;
  data?: unknown;
  version?: string;
}

interface CatalogSnapshot {
  documents: CatalogDocuments;
  revision: string;
}

interface CustomerMatch {
  status: "matched" | "not_found" | "ambiguous" | "missing_address";
  customer: null | { name: string; addresses: CustomerAddress[] };
}

interface CustomerAddress {
  id: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  reference: string | null;
  is_default: boolean;
}

class RuntimeError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const catalogCache = new Map<string, Promise<CatalogSnapshot>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / 256)) bytes.unshift(remaining & 0xff);
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, content: Uint8Array): Uint8Array {
  return new Uint8Array([tag, ...derLength(content.length), ...content]);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function pemBytes(value: string, label: string): Uint8Array | null {
  const pem = value.replace(/\\n/g, "\n").trim();
  const match = pem.match(new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`));
  return match ? bytesFromBase64(match[1].replace(/\s/g, "")) : null;
}

function privateKeyPkcs8(value: string): Uint8Array {
  const pkcs8 = pemBytes(value, "PRIVATE KEY");
  if (pkcs8) return pkcs8;
  const pkcs1 = pemBytes(value, "RSA PRIVATE KEY");
  if (!pkcs1) throw new RuntimeError(503, "Uma chave privada do endpoint não está em formato RSA suportado.");
  const rsaAlgorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const privateKey = der(0x04, pkcs1);
  return der(0x30, new Uint8Array([0x02, 0x01, 0x00, ...rsaAlgorithm, ...privateKey]));
}

async function importFlowPrivateKey(channel: FlowChannel): Promise<CryptoKey | null> {
  const value = Deno.env.get(`META_FLOW_PRIVATE_KEY_${channel}`);
  if (!value) return null;
  return crypto.subtle.importKey(
    "pkcs8",
    asArrayBuffer(privateKeyPkcs8(value)),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
}

async function decryptRequest(envelope: Record<string, unknown>): Promise<{
  channel: FlowChannel;
  request: DecryptedRequest;
  aesKey: CryptoKey;
  iv: Uint8Array;
}> {
  if (typeof envelope.encrypted_aes_key !== "string"
    || typeof envelope.encrypted_flow_data !== "string"
    || typeof envelope.initial_vector !== "string") {
    throw new RuntimeError(400, "Envelope criptografado incompleto.");
  }
  const encryptedKey = bytesFromBase64(envelope.encrypted_aes_key);
  const encryptedData = bytesFromBase64(envelope.encrypted_flow_data);
  const iv = bytesFromBase64(envelope.initial_vector);
  if (iv.byteLength !== 16 || encryptedData.byteLength < 17) throw new RuntimeError(400, "Envelope criptografado inválido.");
  if (!CHANNELS.some((channel) => Deno.env.get(`META_FLOW_PRIVATE_KEY_${channel}`))) {
    throw new RuntimeError(503, "As chaves privadas dos canais ainda não estão configuradas.");
  }

  for (const channel of CHANNELS) {
    try {
      const privateKey = await importFlowPrivateKey(channel);
      if (!privateKey) continue;
      const rawAesKey = new Uint8Array(await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        asArrayBuffer(encryptedKey),
      ));
      if (rawAesKey.byteLength !== 16) continue;
      const aesKey = await crypto.subtle.importKey("raw", asArrayBuffer(rawAesKey), "AES-GCM", false, ["decrypt", "encrypt"]);
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: asArrayBuffer(iv), tagLength: 128 },
        aesKey,
        asArrayBuffer(encryptedData),
      );
      const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
      if (!isRecord(parsed) || typeof parsed.action !== "string") throw new RuntimeError(400, "Conteúdo de Flow inválido.");
      return { channel, request: parsed as unknown as DecryptedRequest, aesKey, iv };
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
    }
  }
  throw new RuntimeError(421, "Não foi possível abrir o envelope com as chaves configuradas.");
}

async function encryptResponse(value: unknown, aesKey: CryptoKey, requestIv: Uint8Array): Promise<string> {
  const responseIv = requestIv.map((byte) => byte ^ 0xff);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(responseIv), tagLength: 128 },
    aesKey,
    asArrayBuffer(new TextEncoder().encode(JSON.stringify(value))),
  );
  return base64(new Uint8Array(encrypted));
}

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const secret = Deno.env.get("META_APP_SECRET");
  if (!secret) throw new RuntimeError(503, "O segredo do aplicativo Meta ainda não está configurado.");
  if (!signatureHeader || !/^sha256=[a-f0-9]{64}$/i.test(signatureHeader)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const expected = `sha256=${hex(signature)}`;
  let mismatch = expected.length ^ signatureHeader.length;
  for (let index = 0; index < Math.max(expected.length, signatureHeader.length); index += 1) {
    mismatch |= (expected.charCodeAt(index) || 0) ^ (signatureHeader.toLowerCase().charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function serviceHeaders(): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const directSecret = Deno.env.get("SUPABASE_SECRET_KEY");
  const legacyServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let secretKey = directSecret;
  if (!secretKey) {
    const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (rawKeys) {
      try {
        const parsed = JSON.parse(rawKeys) as unknown;
        if (isRecord(parsed)) secretKey = Object.values(parsed).find((value) => typeof value === "string" && value.startsWith("sb_secret_")) as string | undefined;
      } catch {
        secretKey = undefined;
      }
    }
  }
  if (secretKey?.startsWith("sb_secret_")) {
    headers.set("apikey", secretKey);
  } else if (legacyServiceRole) {
    headers.set("apikey", legacyServiceRole);
    headers.set("Authorization", `Bearer ${legacyServiceRole}`);
  } else {
    throw new RuntimeError(503, "O acesso de serviço ao cadastro ainda não está configurado.");
  }
  return headers;
}

async function restRows<T>(table: string, params: URLSearchParams): Promise<T[]> {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new RuntimeError(503, "O Supabase ainda não está configurado no servidor.");
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?${params}`, {
    headers: serviceHeaders(),
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new RuntimeError(503, "A consulta protegida ao cadastro não está disponível.");
  const json = await response.json() as unknown;
  if (!Array.isArray(json)) throw new RuntimeError(503, "O cadastro retornou uma resposta inválida.");
  return json as T[];
}

async function findCustomer(phoneE164: string): Promise<CustomerMatch> {
  const primaryParams = new URLSearchParams({
    select: "id,name,is_active,primary_whatsapp_e164",
    primary_whatsapp_e164: `eq.${phoneE164}`,
    is_active: "eq.true",
    limit: "11",
  });
  const phoneParams = new URLSearchParams({
    select: "customer_id",
    phone_e164: `eq.${phoneE164}`,
    verified_at: "not.is.null",
    limit: "11",
  });
  const [primaryRows, verifiedPhones] = await Promise.all([
    restRows<{ id: string; name: string }>("customers", primaryParams),
    restRows<{ customer_id: string }>("customer_phones", phoneParams),
  ]);

  const verifiedIds = [...new Set(verifiedPhones.map((row) => row.customer_id))];
  const ids = [...new Set([...primaryRows.map((row) => row.id), ...verifiedIds])];
  if (ids.length > 10) return { status: "ambiguous", customer: null };
  if (!ids.length) return { status: "not_found", customer: null };
  if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new RuntimeError(503, "O cadastro retornou uma identidade inválida.");

  let customers = primaryRows;
  const primaryIsUnambiguous = primaryRows.length === 1 && verifiedIds.every((id) => id === primaryRows[0].id);
  if (!primaryIsUnambiguous) {
    const customerParams = new URLSearchParams({
      select: "id,name,is_active",
      id: `in.(${ids.join(",")})`,
      is_active: "eq.true",
      limit: "11",
    });
    customers = await restRows<{ id: string; name: string }>("customers", customerParams);
  }
  if (customers.length > 1) return { status: "ambiguous", customer: null };
  const customer = customers[0];
  if (!customer) return { status: "not_found", customer: null };

  const addressParams = new URLSearchParams({
    select: "id,street,number,complement,neighborhood,city,state,postal_code,reference,is_default,is_active",
    customer_id: `eq.${customer.id}`,
    is_active: "eq.true",
    order: "is_default.desc",
    limit: "20",
  });
  const addresses = await restRows<CustomerAddress>("customer_addresses", addressParams);
  if (!addresses.length) return { status: "missing_address", customer: { name: customer.name, addresses: [] } };
  return { status: "matched", customer: { name: customer.name, addresses } };
}

async function loadCatalog(commit: string): Promise<CatalogSnapshot> {
  if (!CATALOG_COMMIT.test(commit)) throw new RuntimeError(400, "A revisão do catálogo da sessão é inválida.");
  const cached = catalogCache.get(commit);
  if (cached) return cached;
  const pending = (async () => {
    const root = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/contents/projetos/whatsapp-atendimento-github/catalog`;
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    const [productsResponse, basketsResponse] = await Promise.all([
      fetch(`${root}/products.json?ref=${commit}`, { headers, signal: AbortSignal.timeout(2500) }),
      fetch(`${root}/baskets.json?ref=${commit}`, { headers, signal: AbortSignal.timeout(2500) }),
    ]);
    if (!productsResponse.ok || !basketsResponse.ok) throw new RuntimeError(503, "A revisão fixada do catálogo não está disponível.");
    const [productsFile, basketsFile] = await Promise.all([
      productsResponse.json() as Promise<{ content: string; sha: string }>,
      basketsResponse.json() as Promise<{ content: string; sha: string }>,
    ]);
    const [products, baskets] = [
      JSON.parse(new TextDecoder().decode(bytesFromBase64(productsFile.content))),
      JSON.parse(new TextDecoder().decode(bytesFromBase64(basketsFile.content))),
    ];
    const documents = { products, baskets } as CatalogDocuments;
    const errors = validateCatalog(documents);
    if (errors.length) throw new RuntimeError(503, "A revisão fixada do catálogo não passou pela validação do servidor.");
    const revision = `${productsFile.sha}:${basketsFile.sha}`;
    return { documents, revision };
  })();
  catalogCache.set(commit, pending);
  if (catalogCache.size > 4) catalogCache.delete(catalogCache.keys().next().value as string);
  try {
    return await pending;
  } catch (error) {
    catalogCache.delete(commit);
    throw error;
  }
}

function sessionHeaders(): Headers {
  const headers = serviceHeaders();
  headers.set("Accept", "application/json");
  return headers;
}

async function readSession(token: string): Promise<FlowSession> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new RuntimeError(503, "O Supabase ainda não está configurado no servidor.");
  const tokenHash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
  const params = new URLSearchParams({
    select: "channel,basket_id,catalog_commit,catalog_revision,phone_e164",
    token_hash: `eq.${tokenHash}`,
    expires_at: `gt.${new Date().toISOString()}`,
    revoked_at: "is.null",
    limit: "2",
  });
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/whatsapp_flow_sessions?${params}`, {
    headers: sessionHeaders(),
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new RuntimeError(503, "A consulta protegida da sessão não está disponível.");
  const rows = await response.json() as unknown;
  if (!Array.isArray(rows) || rows.length !== 1) throw new RuntimeError(427, "Esta sessão expirou. Reabra o atendimento para continuar.");
  const session = rows[0] as FlowSession;
  if (!CHANNELS.includes(session.channel) || !CATALOG_COMMIT.test(session.catalog_commit)
    || !CATALOG_REVISION.test(session.catalog_revision) || !/^\+[1-9][0-9]{1,14}$/.test(session.phone_e164)) {
    throw new RuntimeError(427, "Esta sessão não é válida. Reabra o atendimento para continuar.");
  }
  return session;
}

function asSelections(value: unknown): BasketSelections {
  if (!isRecord(value)) throw new FlowSelectionError("Não foi possível validar as escolhas desta etapa.");
  const selections: BasketSelections = {};
  for (const [groupId, raw] of Object.entries(value)) {
    if (!isRecord(raw) || typeof raw.productId !== "string" || !Number.isSafeInteger(raw.quantity)) {
      throw new FlowSelectionError("Não foi possível validar as escolhas desta etapa.");
    }
    selections[groupId] = { productId: raw.productId, quantity: raw.quantity as number };
  }
  return selections;
}

function productOptions(group: Basket["groups"][number], products: Product[], commit: string) {
  const byId = new Map(products.map((product) => [product.id, product]));
  return group.productIds.flatMap((id) => {
    const product = byId.get(id);
    if (!product?.active) return [];
    return [{
      id: product.id,
      label: product.name,
      brand: product.brand,
      presentation: product.presentation,
      unitPriceCents: product.unitPriceCents,
      imageUrl: `https://raw.githubusercontent.com/${OWNER}/${REPOSITORY}/${commit}/projetos/whatsapp-atendimento-github/${product.imagePath}`,
    }];
  });
}

function groupScreen(
  basket: Basket,
  products: Product[],
  index: number,
  selections: BasketSelections,
  commit: string,
): Record<string, unknown> {
  const group = basket.groups[index];
  const defaults = defaultBasketSelections(basket);
  const effective = { ...defaults, ...selections };
  const quote = quoteBasket(basket, products, effective);
  return {
    screen: `GROUP_${String(index + 1).padStart(2, "0")}`,
    data: {
      groupId: group.id,
      groupLabel: group.label,
      minimumQuantity: group.minimumQuantity,
      maximumQuantity: group.maximumQuantity,
      removalAllowed: group.removalAllowed,
      selection: effective[group.id],
      options: productOptions(group, products, commit),
      selections,
      totalCents: quote.totalCents,
    },
  };
}

function validateFlowToken(value: unknown): string {
  if (typeof value !== "string" || !FLOW_TOKEN.test(value)) throw new RuntimeError(427, "Esta sessão não é válida. Reabra o atendimento para continuar.");
  return value;
}

async function handleDataExchange(request: DecryptedRequest, channel: FlowChannel): Promise<Record<string, unknown>> {
  if (request.action === "ping") return { version: "3.0", data: { status: "active" } };
  if (request.action !== "INIT" && request.action !== "data_exchange") {
    throw new RuntimeError(400, "Ação de Flow não suportada.");
  }
  const flowToken = validateFlowToken(request.flow_token);
  const session = await readSession(flowToken);
  if (session.channel !== channel) throw new RuntimeError(427, "Esta sessão não é válida para este canal.");
  const snapshot = await loadCatalog(session.catalog_commit);
  if (snapshot.revision !== session.catalog_revision) throw new RuntimeError(409, "A revisão do catálogo da sessão não corresponde ao conteúdo fixado.");

  const basket = snapshot.documents.baskets.baskets.find((candidate) => candidate.id === session.basket_id && candidate.active);
  if (!basket) throw new RuntimeError(409, "A cesta desta sessão não está disponível na revisão fixada.");
  const products = snapshot.documents.products.products;

  if (request.action === "INIT") return { version: "3.0", ...groupScreen(basket, products, 0, {}, session.catalog_commit) };
  if (typeof request.screen !== "string" || !/^GROUP_\d{2}$/.test(request.screen) || !isRecord(request.data)) {
    throw new FlowSelectionError("Não foi possível identificar esta etapa do atendimento.");
  }
  const groupIndex = Number(request.screen.slice("GROUP_".length)) - 1;
  if (groupIndex < 0 || groupIndex >= basket.groups.length) throw new FlowSelectionError("Esta etapa não pertence à cesta selecionada.");
  const group = basket.groups[groupIndex];
  const prior = asSelections(request.data.selections ?? {});
  for (const groupId of Object.keys(prior)) {
    const index = basket.groups.findIndex((candidate) => candidate.id === groupId);
    if (index < 0 || index >= groupIndex) throw new FlowSelectionError("A seleção contém uma etapa fora de ordem.");
  }
  for (let index = 0; index < groupIndex; index += 1) {
    if (!prior[basket.groups[index].id]) throw new FlowSelectionError("Revise as etapas anteriores antes de continuar.");
  }
  const current = asSelections({ [group.id]: request.data.selection })[group.id];
  const selections = { ...prior, [group.id]: current };
  const effective = { ...defaultBasketSelections(basket), ...selections };
  const quote = quoteBasket(basket, products, effective);

  if (groupIndex + 1 < basket.groups.length) {
    return { version: "3.0", ...groupScreen(basket, products, groupIndex + 1, selections, session.catalog_commit) };
  }
  const customer = await findCustomer(session.phone_e164);
  return {
    version: "3.0",
    screen: "CUSTOMER_REVIEW",
    data: {
      basketName: basket.name,
      totalCents: quote.totalCents,
      flow_token: flowToken,
      customerStatus: customer.status,
      customerName: customer.customer?.name ?? "",
      addresses: customer.customer?.addresses ?? [],
      selections: quote.selections,
    },
  };
}

function plainError(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function readBodyLimited(request: Request): Promise<string | null> {
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > BODY_LIMIT) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

Deno.serve(async (httpRequest) => {
  if (httpRequest.method !== "POST") return plainError(405, "Method not allowed");
  const rawBody = await readBodyLimited(httpRequest);
  if (rawBody === null) return plainError(413, "Payload too large or invalid encoding");
  try {
    if (!await verifySignature(rawBody, httpRequest.headers.get("X-Hub-Signature-256"))) {
      return plainError(432, "Invalid signature");
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(rawBody) as unknown;
    } catch {
      return plainError(400, "Invalid JSON");
    }
    if (!isRecord(envelope)) return plainError(400, "Invalid request envelope");
    const decrypted = await decryptRequest(envelope);
    try {
      const response = await handleDataExchange(decrypted.request, decrypted.channel);
      const encrypted = await encryptResponse(response, decrypted.aesKey, decrypted.iv);
      return new Response(encrypted, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof FlowSelectionError) {
        const errorResponse = {
          version: "3.0",
          screen: decrypted.request.screen ?? "GROUP_01",
          data: { error: error.message },
        };
        const encrypted = await encryptResponse(errorResponse, decrypted.aesKey, decrypted.iv);
        return new Response(encrypted, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      if (error instanceof RuntimeError && error.status === 427) {
        const encrypted = await encryptResponse({ error_msg: error.message }, decrypted.aesKey, decrypted.iv);
        return new Response(encrypted, {
          status: 427,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      if (error instanceof RuntimeError) return plainError(error.status, error.message);
      return plainError(500, "Flow endpoint temporarily unavailable");
    }
  } catch (error) {
    if (error instanceof RuntimeError) return plainError(error.status, error.message);
    return plainError(421, "Unable to decrypt request");
  }
});
