import { validateCatalog, type Basket, type CatalogDocuments, type Product } from "../../../src/domain/catalog.ts";
import { supabaseSecretKey } from "../_shared/supabase-api-keys.ts";
import {
  FlowSelectionError,
  FLOW_MAX_PRODUCT_QUANTITY,
  quoteBasket,
  type AvailableStockByProduct,
  type BasketSelections,
} from "../../../src/domain/flow-runtime.ts";

const OWNER = "osvaldosereia";
const REPOSITORY = "SUCEDOAN12";
const CATALOG_COMMIT = /^[a-f0-9]{40}$/i;
const CATALOG_REVISION = /^[a-f0-9]{40}:[a-f0-9]{40}$/i;
const FLOW_TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const BODY_LIMIT = 1024 * 1024;
const PRODUCT_IMAGE_LIMIT = 27_000;
const NO_PRODUCT_ID = "__skip_product__";
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
const productImageCache = new Map<string, Promise<string | null>>();

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
  const secretKey = supabaseSecretKey();
  if (secretKey?.startsWith("sb_secret_")) {
    headers.set("apikey", secretKey);
  } else if (secretKey) {
    headers.set("apikey", secretKey);
    headers.set("Authorization", `Bearer ${secretKey}`);
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

async function productImageBase64(product: Product, commit: string): Promise<string | null> {
  if (!product.imagePath.startsWith("images/products/") || product.imagePath.includes("..")
    || !/^[A-Za-z0-9._/-]+$/.test(product.imagePath)) return null;
  const cacheKey = `${commit}:${product.imagePath}`;
  const cached = productImageCache.get(cacheKey);
  if (cached) return cached;
  const pending = (async () => {
    const path = product.imagePath.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`https://raw.githubusercontent.com/${OWNER}/${REPOSITORY}/${commit}/projetos/whatsapp-atendimento-github/${path}`, {
      redirect: "error",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > PRODUCT_IMAGE_LIMIT) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
    if (size < 12) return null;
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const signature = String.fromCharCode(...bytes.subarray(0, 4), ...bytes.subarray(8, 12));
    if (signature !== "RIFFWEBP") return null;
    return base64(bytes);
  })();
  productImageCache.set(cacheKey, pending);
  if (productImageCache.size > 100) productImageCache.delete(productImageCache.keys().next().value as string);
  try {
    return await pending;
  } catch {
    productImageCache.delete(cacheKey);
    return null;
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
  let parsed = value;
  if (typeof parsed === "string") {
    if (parsed.length > 16 * 1024) throw new FlowSelectionError("As escolhas desta cesta excedem o limite aceito.");
    try { parsed = JSON.parse(parsed) as unknown; } catch { throw new FlowSelectionError("As escolhas desta etapa não são válidas."); }
  }
  if (!isRecord(parsed) || Object.keys(parsed).length > 50) {
    throw new FlowSelectionError("Não foi possível validar as escolhas desta etapa.");
  }
  const selections: BasketSelections = {};
  for (const [groupId, raw] of Object.entries(parsed)) {
    const rawQuantity = isRecord(raw) ? raw.quantity : undefined;
    const quantity = typeof rawQuantity === "number"
      ? rawQuantity
      : typeof rawQuantity === "string" && /^\d{1,2}$/.test(rawQuantity) ? Number(rawQuantity) : NaN;
    if (!isRecord(raw) || typeof raw.productId !== "string" || !Number.isSafeInteger(quantity)) {
      throw new FlowSelectionError("Não foi possível validar as escolhas desta etapa.");
    }
    selections[groupId] = { productId: raw.productId, quantity };
  }
  return selections;
}

function currency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function stockAwareDefaults(
  basket: Basket,
  products: Product[],
  stockByProduct: AvailableStockByProduct,
): BasketSelections {
  const byId = new Map(products.map((product) => [product.id, product]));
  return Object.fromEntries(basket.groups.map((group) => {
    const product = group.productIds
      .map((id) => byId.get(id))
      .find((candidate) => candidate?.active && (stockByProduct.get(candidate.id) ?? 0) > 0);
    const fallback = group.productIds.map((id) => byId.get(id)).find((candidate) => candidate?.active);
    const selected = product ?? fallback;
    if (!selected) throw new FlowSelectionError("A composição desta cesta não tem uma opção de produto ativa.");
    const stock = stockByProduct.get(selected.id) ?? 0;
    const quantity = product
      ? Math.max(1, Math.min(FLOW_MAX_PRODUCT_QUANTITY, stock, group.initialQuantity || 1))
      : 0;
    return [group.id, { productId: selected.id, quantity }];
  }));
}

function productOptions(
  group: Basket["groups"][number],
  products: Product[],
  stockByProduct: AvailableStockByProduct,
) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const options = group.productIds.flatMap((id) => {
    const product = byId.get(id);
    if (!product?.active) return [];
    const available = stockByProduct.get(product.id);
    const price = currency(product.unitPriceCents);
    const status = available === undefined
      ? `${product.brand} · ${product.presentation} · ${price} · Estoque não informado`
      : available > 0
        ? `${product.brand} · ${product.presentation} · ${price} · até ${Math.min(FLOW_MAX_PRODUCT_QUANTITY, available)} un.`
        : `${product.brand} · ${product.presentation} · ${price} · Sem estoque`;
    return [{ id: product.id, title: product.name.slice(0, 30), description: status.slice(0, 300), enabled: available !== undefined && available > 0 }];
  });
  return [...options, { id: NO_PRODUCT_ID, title: "Não quero esse produto", description: "Retirar este tipo da cesta", enabled: true }];
}

function quantityOptions(maximum: number): Array<{ id: string; title: string; enabled: boolean }> {
  const count = Math.max(1, Math.min(FLOW_MAX_PRODUCT_QUANTITY, maximum));
  return Array.from({ length: count }, (_, index) => {
    const quantity = index + 1;
    return { id: String(quantity), title: String(quantity), enabled: quantity <= maximum };
  });
}

async function groupScreen(
  basket: Basket,
  products: Product[],
  index: number,
  prior: BasketSelections,
  current: BasketSelections[string],
  commit: string,
  stockByProduct: AvailableStockByProduct,
  error = "",
): Promise<Record<string, unknown>> {
  const group = basket.groups[index];
  if (!group) throw new FlowSelectionError("Esta etapa não pertence à cesta selecionada.");
  const defaults = stockAwareDefaults(basket, products, stockByProduct);
  const effective = { ...defaults, ...prior, [group.id]: current };
  const quote = quoteBasket(basket, products, effective, stockByProduct);
  const product = products.find((candidate) => candidate.id === current.productId && candidate.active);
  const selected = current.quantity > 0 && product && (stockByProduct.get(product.id) ?? 0) > 0;
  const image = selected ? await productImageBase64(product, commit) : null;
  const stock = selected ? stockByProduct.get(product.id) ?? 0 : 0;
  const maximum = Math.min(FLOW_MAX_PRODUCT_QUANTITY, stock);
  return {
    screen: "GROUP",
    data: {
      stepLabel: `Produto ${index + 1} de ${basket.groups.length}`,
      basketName: basket.name,
      groupLabel: group.label,
      productOptions: productOptions(group, products, stockByProduct),
      quantityOptions: quantityOptions(maximum),
      selectedProductId: selected ? current.productId : NO_PRODUCT_ID,
      selectedQuantity: String(selected ? current.quantity : 1),
      selectedImage: image ?? "",
      imageAvailable: Boolean(image),
      imageUnavailable: Boolean(selected && !image),
      imageFallback: "Foto indisponível neste momento.",
      quantityVisible: Boolean(selected),
      quantityLabel: selected ? `Quantidade (1 a ${maximum})` : "Quantidade",
      totalDisplay: `Total atualizado: ${currency(quote.totalCents)}`,
      selections_json: JSON.stringify(prior),
      error,
    },
  };
}

function validateFlowToken(value: unknown): string {
  if (typeof value !== "string" || !FLOW_TOKEN.test(value)) throw new RuntimeError(427, "Esta sessão não é válida. Reabra o atendimento para continuar.");
  return value;
}

function loadAvailableStock(basket: Basket, products: Product[]): AvailableStockByProduct {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productIds = [...new Set(basket.groups.flatMap((group) => group.productIds))];
  const stock = new Map<string, number>();
  for (const id of productIds) {
    const product = productsById.get(id);
    if (!product || !Number.isSafeInteger(product.stockQuantity)) {
      throw new RuntimeError(503, "O catálogo não contém um saldo válido para este produto.");
    }
    stock.set(id, product.stockQuantity);
  }
  return stock;
}

function orderedPriorSelections(value: unknown, basket: Basket): BasketSelections {
  const selections = asSelections(value);
  const groupIds = Object.keys(selections);
  if (groupIds.length > basket.groups.length) throw new FlowSelectionError("A seleção contém etapas que não pertencem a esta cesta.");
  for (let index = 0; index < groupIds.length; index += 1) {
    if (groupIds[index] !== basket.groups[index]?.id) throw new FlowSelectionError("Revise as etapas anteriores antes de continuar.");
  }
  return selections;
}

function parseChoiceQuantity(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const quantity = typeof value === "number" ? value
    : typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(quantity)) throw new FlowSelectionError("Selecione uma quantidade inteira.");
  return quantity;
}

function selectionForAction(
  group: Basket["groups"][number],
  productIdValue: unknown,
  quantityValue: unknown,
  action: string,
  fallback: BasketSelections[string],
  products: Product[],
  stockByProduct: AvailableStockByProduct,
): BasketSelections[string] {
  if (productIdValue === NO_PRODUCT_ID) {
    const fallbackProductId = group.productIds.find((id) => products.some((product) => product.id === id && product.active));
    if (!fallbackProductId) throw new FlowSelectionError("A composição padrão desta etapa está incompleta.");
    return { productId: fallbackProductId, quantity: 0 };
  }
  const productId = typeof productIdValue === "string" && productIdValue ? productIdValue : fallback.productId;
  if (!group.productIds.includes(productId)) throw new FlowSelectionError("Escolha um produto disponível neste tipo.");
  const product = products.find((candidate) => candidate.id === productId && candidate.active);
  if (!product) throw new FlowSelectionError("Esta opção não está disponível.");
  const stock = stockByProduct.get(product.id);
  if (!Number.isSafeInteger(stock) || (stock as number) < 1) throw new FlowSelectionError("Este produto está sem estoque.");
  const maximum = Math.min(FLOW_MAX_PRODUCT_QUANTITY, stock as number);
  let quantity = parseChoiceQuantity(quantityValue, product.id === fallback.productId && fallback.quantity > 0 ? fallback.quantity : 1);
  if (action === "product_change") quantity = Math.max(1, Math.min(quantity, maximum));
  if (quantity < 1 || quantity > maximum) throw new FlowSelectionError(`Escolha uma quantidade de 1 a ${maximum}.`);
  return { productId, quantity };
}

function reviewAddressOptions(customer: CustomerMatch["customer"]): Array<Record<string, unknown>> {
  return (customer?.addresses ?? []).map((address) => {
    const street = `${address.street}, ${address.number}${address.complement ? ` ${address.complement}` : ""}`;
    const location = `${address.neighborhood} · ${address.city}/${address.state} · CEP ${address.postal_code}`;
    const reference = address.reference ? ` · Ref.: ${address.reference}` : "";
    return {
      id: address.id,
      title: street.slice(0, 30),
      description: `${location}${reference}`.slice(0, 300),
      enabled: true,
    };
  });
}

async function handleDataExchange(request: DecryptedRequest, channel: FlowChannel): Promise<Record<string, unknown>> {
  if (request.action === "ping") return { version: "3.0", data: { status: "active" } };
  if (request.action !== "INIT" && request.action !== "data_exchange" && request.action !== "BACK") {
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
  const stockByProduct = loadAvailableStock(basket, products);
  const defaults = stockAwareDefaults(basket, products, stockByProduct);

  if (request.action === "INIT") {
    return { version: "3.0", ...await groupScreen(basket, products, 0, {}, defaults[basket.groups[0].id], session.catalog_commit, stockByProduct) };
  }
  if (typeof request.screen !== "string" || !isRecord(request.data)) {
    throw new FlowSelectionError("Não foi possível identificar esta etapa do atendimento.");
  }
  if (request.action === "BACK") {
    if (request.screen === "CUSTOMER_REVIEW") {
      const all = orderedPriorSelections(request.data.selections_json, basket);
      if (Object.keys(all).length !== basket.groups.length) throw new FlowSelectionError("A revisão não contém todas as etapas da cesta.");
      const index = basket.groups.length - 1;
      const group = basket.groups[index];
      const prior = Object.fromEntries(basket.groups.slice(0, index).map((item) => [item.id, all[item.id]]));
      return { version: "3.0", ...await groupScreen(basket, products, index, prior, all[group.id], session.catalog_commit, stockByProduct) };
    }
    if (request.screen !== "GROUP") throw new FlowSelectionError("Esta etapa não pertence à cesta selecionada.");
    const prior = orderedPriorSelections(request.data.selections_json, basket);
    const previousIndex = Math.max(0, Object.keys(prior).length - 1);
    const group = basket.groups[previousIndex];
    const groupSelection = prior[group.id] ?? defaults[group.id];
    const previous = Object.fromEntries(basket.groups.slice(0, previousIndex).map((item) => [item.id, prior[item.id]]));
    return { version: "3.0", ...await groupScreen(basket, products, previousIndex, previous, groupSelection, session.catalog_commit, stockByProduct) };
  }
  if (request.screen !== "GROUP") throw new FlowSelectionError("Esta etapa não pertence à cesta selecionada.");

  const prior = orderedPriorSelections(request.data.selections_json, basket);
  const groupIndex = Object.keys(prior).length;
  if (groupIndex >= basket.groups.length) throw new FlowSelectionError("A seleção já passou pela última etapa.");
  const group = basket.groups[groupIndex];
  const currentFallback = defaults[group.id];
  const action = typeof request.data.component_action === "string" ? request.data.component_action : "continue";
  if (!["product_change", "quantity_change", "continue"].includes(action)) {
    throw new FlowSelectionError("Esta ação de escolha não é válida.");
  }
  let current: BasketSelections[string];
  try {
    current = selectionForAction(group, request.data.product_id, request.data.quantity, action, currentFallback, products, stockByProduct);
  } catch (error) {
    if (!(error instanceof FlowSelectionError)) throw error;
    return { version: "3.0", ...await groupScreen(basket, products, groupIndex, prior, currentFallback, session.catalog_commit, stockByProduct, error.message) };
  }
  if (action !== "continue") {
    return { version: "3.0", ...await groupScreen(basket, products, groupIndex, prior, current, session.catalog_commit, stockByProduct) };
  }

  const selections = { ...prior, [group.id]: current };
  const effective = { ...defaults, ...selections };
  const quote = quoteBasket(basket, products, effective, stockByProduct);
  if (groupIndex + 1 < basket.groups.length) {
    const nextGroup = basket.groups[groupIndex + 1];
    return { version: "3.0", ...await groupScreen(basket, products, groupIndex + 1, selections, defaults[nextGroup.id], session.catalog_commit, stockByProduct) };
  }
  if (!Object.values(quote.selections).some((selection) => selection.quantity > 0)) {
    return { version: "3.0", ...await groupScreen(basket, products, groupIndex, prior, current, session.catalog_commit, stockByProduct, "Mantenha pelo menos um produto na cesta para continuar.") };
  }
  const customer = await findCustomer(session.phone_e164);
  const productById = new Map(products.map((product) => [product.id, product]));
  const selectionSummary = basket.groups.flatMap((item) => {
    const selection = quote.selections[item.id];
    if (selection.quantity === 0) return [];
    const product = productById.get(selection.productId);
    return product ? [`${selection.quantity} × ${product.name} (${product.brand})`] : [];
  }).join("\n");
  const savedAddresses = reviewAddressOptions(customer.customer);
  const addresses = savedAddresses.length
    ? savedAddresses
    : [{ id: "__customer_action_required__", title: "Cadastro necessário", description: "Chame o atendimento para continuar.", enabled: false }];
  const defaultAddress = customer.customer?.addresses.find((address) => address.is_default) ?? customer.customer?.addresses[0];
  const reviewNote = customer.status === "matched"
    ? "Confira o endereço e o pagamento. O resumo será enviado nesta conversa após concluir; o pedido só será confirmado com seu aceite."
    : "Não encontramos um cadastro e endereço únicos para este telefone. Feche o Flow e chame o atendimento para continuar.";
  return {
    version: "3.0",
    screen: "CUSTOMER_REVIEW",
    data: {
      basketName: basket.name,
      selectionSummary,
      totalDisplay: currency(quote.totalCents),
      flow_token: flowToken,
      customerName: customer.customer?.name ?? "",
      reviewNote,
      addressOptions: addresses,
      defaultAddressId: defaultAddress?.id ?? "__customer_action_required__",
      selections_json: JSON.stringify(quote.selections),
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
        const requestData = isRecord(decrypted.request.data) ? decrypted.request.data : {};
        const selectionsJson = typeof requestData.selections_json === "string" ? requestData.selections_json : "{}";
        const isReview = decrypted.request.screen === "CUSTOMER_REVIEW";
        const errorResponse = isReview
          ? {
            version: "3.0",
            screen: "CUSTOMER_REVIEW",
            data: {
              basketName: "",
              selectionSummary: "",
              totalDisplay: "",
              customerName: "",
              reviewNote: error.message,
              flow_token: typeof decrypted.request.flow_token === "string" ? decrypted.request.flow_token : "",
              selections_json: selectionsJson,
              defaultAddressId: "error-address",
              addressOptions: [{ id: "error-address", title: "Reabra o atendimento", description: "Os dados da revisão precisam ser carregados novamente.", enabled: true }],
            },
          }
          : {
            version: "3.0",
            screen: "GROUP",
            data: {
              stepLabel: "Revise sua escolha",
              basketName: "",
              groupLabel: "Produto",
              productOptions: [{ id: NO_PRODUCT_ID, title: "Não quero esse produto", description: "Retirar este tipo da cesta", enabled: true }],
              quantityOptions: [{ id: "1", title: "1", enabled: true }],
              selectedProductId: NO_PRODUCT_ID,
              selectedQuantity: "1",
              selectedImage: "",
              imageAvailable: false,
              imageUnavailable: false,
              imageFallback: "Foto indisponível neste momento.",
              quantityVisible: false,
              quantityLabel: "Quantidade",
              totalDisplay: "",
              selections_json: selectionsJson,
              error: error.message,
            },
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
