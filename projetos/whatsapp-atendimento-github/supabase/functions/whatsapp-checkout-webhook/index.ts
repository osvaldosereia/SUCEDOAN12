import postgres, { type Sql } from "npm:postgres@3.4.7";
import { validateCatalog, type Basket, type CatalogDocuments } from "../../../src/domain/catalog.ts";
import { FlowSelectionError, quoteBasket, type BasketSelections } from "../../../src/domain/flow-runtime.ts";
import { wakeOutboxWorker } from "../_shared/outbox-dispatch.ts";
import { loadSellableStock } from "../_shared/sellable-stock.ts";

const OWNER = "osvaldosereia";
const REPOSITORY = "SUCEDOAN12";
const BRANCH = "project/whatsapp-atendimento-github-20261025";
const CATALOG_PATH = "projetos/whatsapp-atendimento-github/catalog";
const BODY_LIMIT = 1024 * 1024;
const CHANNELS = ["0975", "1018"] as const;
type Channel = typeof CHANNELS[number];

interface CatalogSnapshot {
  documents: CatalogDocuments;
  commit: string;
  revision: string;
}

interface Session {
  id: string;
  channel: Channel;
  basket_id: string;
  catalog_commit: string;
  catalog_revision: string;
  phone_e164: string;
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

interface Customer {
  id: string;
  name: string;
  address: CustomerAddress;
}

interface WebhookMessage {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  interactive?: {
    list_reply?: { id?: string };
    button_reply?: { id?: string };
    nfm_reply?: { response_json?: string };
  };
}

class WebhookError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

let database: Sql | null = null;
const catalogCache = new Map<string, Promise<CatalogSnapshot>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function hex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

function base64Url(value: Uint8Array): string {
  return base64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

async function digestHex(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function verifySignature(rawBody: string, supplied: string | null): Promise<boolean> {
  const secret = Deno.env.get("META_APP_SECRET");
  if (!secret) throw new WebhookError(503, "O segredo do aplicativo Meta não está configurado no servidor.");
  if (!supplied || !/^sha256=[a-f0-9]{64}$/i.test(supplied)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  return constantTimeEqual(`sha256=${hex(signature)}`, supplied.toLowerCase());
}

function getDatabase(): Sql {
  if (database) return database;
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) throw new WebhookError(503, "A conexão privada do banco não está configurada no servidor.");
  database = postgres(url, { max: 1, idle_timeout: 10, connect_timeout: 5, prepare: false, ssl: "require" });
  return database;
}

function channelForPhoneNumberId(value: unknown): Channel {
  if (typeof value !== "string" || !value) throw new WebhookError(400, "O evento não informa o número de destino.");
  for (const channel of CHANNELS) {
    const configured = Deno.env.get(`META_PHONE_NUMBER_ID_${channel}`);
    if (configured && configured === value) return channel;
  }
  throw new WebhookError(403, "O número Meta do evento não está vinculado a um canal configurado.");
}

function phoneE164(value: unknown): string {
  if (typeof value !== "string") throw new WebhookError(400, "O evento não informa o telefone de origem.");
  const normalized = `+${value.replace(/\D/g, "")}`;
  if (!/^\+[1-9][0-9]{1,14}$/.test(normalized)) throw new WebhookError(400, "O telefone de origem não é válido.");
  return normalized;
}

async function catalogAt(commit: string): Promise<CatalogSnapshot> {
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new WebhookError(409, "A revisão fixada do catálogo é inválida.");
  const cached = catalogCache.get(commit);
  if (cached) return cached;
  const snapshot = (async () => {
    const ref = encodeURIComponent(commit);
    const root = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/contents/${CATALOG_PATH}`;
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    const [productsResponse, basketsResponse] = await Promise.all([
      fetch(`${root}/products.json?ref=${ref}`, { headers, signal: AbortSignal.timeout(3000) }),
      fetch(`${root}/baskets.json?ref=${ref}`, { headers, signal: AbortSignal.timeout(3000) }),
    ]);
    if (!productsResponse.ok || !basketsResponse.ok) throw new WebhookError(503, "O catálogo atual não está disponível.");
    const [productsFile, basketsFile] = await Promise.all([
      productsResponse.json() as Promise<{ content: string; sha: string; _links?: { git?: string } }>,
      basketsResponse.json() as Promise<{ content: string; sha: string; _links?: { git?: string } }>,
    ]);
    if (!/^[a-f0-9]{40}$/i.test(productsFile.sha) || !/^[a-f0-9]{40}$/i.test(basketsFile.sha)) {
      throw new WebhookError(503, "Os hashes dos documentos do catálogo são inválidos.");
    }
    const [products, baskets] = [
      JSON.parse(new TextDecoder().decode(bytesFromBase64(productsFile.content))),
      JSON.parse(new TextDecoder().decode(bytesFromBase64(basketsFile.content))),
    ];
    const documents = { products, baskets } as CatalogDocuments;
    if (validateCatalog(documents).length) throw new WebhookError(503, "O catálogo não passou pela validação de servidor.");
    return { documents, commit, revision: `${productsFile.sha}:${basketsFile.sha}` };
  })();
  catalogCache.set(commit, snapshot);
  if (catalogCache.size > 4) catalogCache.delete(catalogCache.keys().next().value as string);
  try {
    return await snapshot;
  } catch (error) {
    catalogCache.delete(commit);
    throw error;
  }
}

async function currentCatalog(): Promise<CatalogSnapshot> {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPOSITORY}/commits?sha=${encodeURIComponent(BRANCH)}&per_page=1`, {
    headers,
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new WebhookError(503, "Não foi possível fixar a revisão atual do catálogo.");
  const commits = await response.json() as unknown;
  const commit = Array.isArray(commits) && isRecord(commits[0]) ? commits[0].sha : undefined;
  if (typeof commit !== "string" || !/^[a-f0-9]{40}$/i.test(commit)) throw new WebhookError(503, "O commit atual do catálogo é inválido.");
  return await catalogAt(commit);
}

function serviceHeaders(): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const direct = Deno.env.get("SUPABASE_SECRET_KEY");
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let key = direct;
  if (!key) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as unknown;
      if (isRecord(keys)) key = Object.values(keys).find((item) => typeof item === "string" && item.startsWith("sb_secret_")) as string | undefined;
    } catch {
      key = undefined;
    }
  }
  if (key?.startsWith("sb_secret_")) headers.set("apikey", key);
  else if (legacy) {
    headers.set("apikey", legacy);
    headers.set("Authorization", `Bearer ${legacy}`);
  } else throw new WebhookError(503, "A credencial protegida do Supabase não está configurada.");
  return headers;
}

async function restRows<Row>(table: string, params: URLSearchParams): Promise<Row[]> {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new WebhookError(503, "O Supabase não está configurado no servidor.");
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?${params}`, {
    headers: serviceHeaders(),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new WebhookError(503, "A consulta protegida de sessão/cliente não está disponível.");
  const result = await response.json() as unknown;
  if (!Array.isArray(result)) throw new WebhookError(503, "A consulta protegida retornou dados inválidos.");
  return result as Row[];
}

async function loadSession(tx: Sql, token: string, channel: Channel, phone: string): Promise<Session> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new WebhookError(422, "O Flow não contém uma sessão válida.");
  const hash = await digestHex(token);
  const rows = await tx<Session>`
    select id, channel, basket_id, catalog_commit, catalog_revision, phone_e164
    from public.whatsapp_flow_sessions
    where token_hash = ${hash} and expires_at > now() and revoked_at is null
    limit 2
  `;
  const session = rows.length === 1 ? rows[0] : undefined;
  if (!session || session.channel !== channel || session.phone_e164 !== phone) throw new WebhookError(422, "Esta sessão expirou ou não pertence a esta conversa.");
  return session;
}

async function insertSession(tx: Sql, channel: Channel, basket: Basket, phone: string, catalog: CatalogSnapshot): Promise<string> {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digestHex(token);
  await tx`
    insert into public.whatsapp_flow_sessions
      (token_hash, channel, basket_id, catalog_commit, catalog_revision, phone_e164, expires_at)
    values (
      ${tokenHash}, ${channel}, ${basket.id}, ${catalog.commit}, ${catalog.revision}, ${phone}, now() + interval '30 minutes'
    )
  `;
  return token;
}

async function encryptPayload(value: unknown): Promise<{ iv: string; ciphertext: string }> {
  const configured = Deno.env.get("META_OUTBOX_ENCRYPTION_KEY");
  if (!configured) throw new WebhookError(503, "A chave de cifragem da fila não está configurada.");
  const rawKey = bytesFromBase64(configured);
  if (rawKey.byteLength !== 32) throw new WebhookError(503, "A chave de cifragem da fila tem formato inválido.");
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(rawKey), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv) },
    key,
    asArrayBuffer(new TextEncoder().encode(JSON.stringify(value))),
  );
  return { iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) };
}

async function queueMessage(
  tx: Sql,
  channel: Channel,
  messageType: "basket_menu" | "flow_launch" | "order_summary" | "order_cancelled",
  eventKey: string,
  payload: unknown,
): Promise<void> {
  const encrypted = await encryptPayload(payload);
  await tx`
    insert into whatsapp_atendimento.message_outbox
      (channel, event_key, message_type, payload_iv, payload_ciphertext)
    values (${channel}, ${eventKey}, ${messageType}, ${encrypted.iv}, ${encrypted.ciphertext})
    on conflict (event_key) do nothing
  `;
}

function graphMessage(to: string, type: string, interactive: unknown): Record<string, unknown> {
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type, interactive };
}

async function queueBasketMenu(tx: Sql, channel: Channel, phone: string, eventId: string): Promise<void> {
  const catalog = await currentCatalog();
  const baskets = catalog.documents.baskets.baskets.filter((basket) => basket.active).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!baskets.length) throw new WebhookError(503, "Não há cestas ativas para atendimento.");
  const rows = baskets.map((basket) => ({
    id: `basket:${basket.id}`,
    title: basket.name,
    description: `A partir de ${formatMoney(basket.basePriceCents)}`,
  }));
  await queueMessage(tx, channel, "basket_menu", `${channel}:${eventId}:basket-menu`, graphMessage(phone, "interactive", {
    type: "list",
    body: { text: "Escolha o tamanho da cesta para continuar." },
    action: { button: "Ver cestas", sections: [{ title: "Cestas disponíveis", rows }] },
  }));
}

async function queueFlowLaunch(tx: Sql, channel: Channel, phone: string, basket: Basket, token: string, eventKey: string): Promise<void> {
  const flowId = Deno.env.get(`META_FLOW_ID_${channel}`) ?? null;
  await queueMessage(tx, channel, "flow_launch", eventKey, graphMessage(phone, "interactive", {
    type: "flow",
    body: { text: `Vamos montar sua cesta ${basket.name}.` },
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_token: token,
        flow_id: flowId,
        flow_cta: "Montar cesta",
        flow_action: "navigate",
        flow_action_payload: { screen: "GROUP", data: { basketId: basket.id } },
      },
    },
  }));
}

function parseSelections(value: unknown): BasketSelections {
  let parsed = value;
  if (typeof parsed === "string") {
    if (parsed.length > 16 * 1024) throw new WebhookError(413, "A seleção do Flow excede o limite aceito.");
    try { parsed = JSON.parse(parsed) as unknown; } catch { throw new WebhookError(422, "A seleção do Flow não é JSON válido."); }
  }
  if (!isRecord(parsed) || Object.keys(parsed).length > 50) throw new WebhookError(422, "A seleção do Flow está ausente ou excede os limites.");
  const result: BasketSelections = {};
  for (const [groupId, choice] of Object.entries(parsed)) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(groupId) || !isRecord(choice)
      || typeof choice.productId !== "string" || !Number.isSafeInteger(choice.quantity)) {
      throw new WebhookError(422, "A seleção do Flow contém campos inválidos.");
    }
    result[groupId] = { productId: choice.productId, quantity: choice.quantity as number };
  }
  return result;
}

async function findCustomer(phone: string, selectedCustomerId: unknown, addressId: unknown): Promise<Customer> {
  const primary = await restRows<{ id: string; name: string; is_active: boolean }>("customers", new URLSearchParams({
    select: "id,name,is_active",
    primary_whatsapp_e164: `eq.${phone}`,
    is_active: "eq.true",
    limit: "11",
  }));
  const verified = await restRows<{ customer_id: string }>("customer_phones", new URLSearchParams({
    select: "customer_id",
    phone_e164: `eq.${phone}`,
    verified_at: "not.is.null",
    limit: "11",
  }));
  const ids = [...new Set([...primary.map((row) => row.id), ...verified.map((row) => row.customer_id)])];
  if (ids.length !== 1 || (selectedCustomerId !== undefined && selectedCustomerId !== ids[0])) {
    throw new WebhookError(422, "Confirme o cadastro vinculado a este telefone antes de concluir o Flow.");
  }
  const customerRows = primary.length === 1 && primary[0].id === ids[0]
    ? primary
    : await restRows<{ id: string; name: string; is_active: boolean }>("customers", new URLSearchParams({
      select: "id,name,is_active",
      id: `eq.${ids[0]}`,
      is_active: "eq.true",
      limit: "2",
    }));
  const customer = customerRows.length === 1 ? customerRows[0] : undefined;
  if (!customer || !customer.is_active) throw new WebhookError(422, "O cadastro não está ativo para este pedido.");
  const addressParams = new URLSearchParams({
    select: "id,street,number,complement,neighborhood,city,state,postal_code,reference,is_default",
    customer_id: `eq.${customer.id}`,
    is_active: "eq.true",
    order: "is_default.desc",
    limit: "30",
  });
  const addresses = await restRows<CustomerAddress>("customer_addresses", addressParams);
  const address = typeof addressId === "string" ? addresses.find((item) => item.id === addressId) : undefined;
  if (!address) throw new WebhookError(422, "Selecione e confirme um endereço ativo do cadastro.");
  return { id: customer.id, name: customer.name, address };
}

async function buildOrderSnapshot(
  catalog: CatalogSnapshot,
  session: Session,
  selections: BasketSelections,
  customer: Customer,
  paymentMethod: string,
) {
  const basket = catalog.documents.baskets.baskets.find((candidate) => candidate.id === session.basket_id && candidate.active);
  if (!basket) throw new WebhookError(409, "A cesta da sessão não está ativa na revisão fixada.");
  const products = catalog.documents.products.products;
  const selectedProductIds = [...new Set(Object.values(selections)
    .filter((selection) => selection.quantity > 0)
    .map((selection) => selection.productId))];
  let stockByProduct: Map<string, number>;
  try {
    stockByProduct = await loadSellableStock(selectedProductIds, restRows);
  } catch {
    throw new WebhookError(503, "Não foi possível confirmar o estoque atual; o pedido não foi criado.");
  }
  let quote: ReturnType<typeof quoteBasket>;
  try {
    quote = quoteBasket(basket, products, selections, stockByProduct);
  } catch (error) {
    if (error instanceof FlowSelectionError) throw new WebhookError(409, `${error.message} Reabra o Flow para atualizar a disponibilidade.`);
    throw error;
  }
  const productById = new Map(products.map((product) => [product.id, product]));
  const items = basket.groups.flatMap((group) => {
    const selection = quote.selections[group.id];
    if (selection.quantity === 0) return [];
    const product = productById.get(selection.productId);
    if (!product?.sku || !product.blingProductId) throw new WebhookError(409, `A opção ${product?.name ?? selection.productId} ainda não possui SKU e vínculo Bling.`);
    return [{
      groupId: group.id,
      productId: product.id,
      name: product.name,
      brand: product.brand,
      presentation: product.presentation,
      sku: product.sku,
      gtin: product.gtin,
      blingProductId: product.blingProductId,
      quantity: selection.quantity,
      unitPriceCents: product.unitPriceCents,
      lineTotalCents: product.unitPriceCents * selection.quantity,
    }];
  });
  if (items.length === 0) throw new WebhookError(422, "Mantenha pelo menos um produto na cesta antes de concluir.");
  const snapshot = {
    catalogCommit: session.catalog_commit,
    catalogRevision: session.catalog_revision,
    basketId: basket.id,
    basketName: basket.name,
    channelId: session.channel,
    selections: quote.selections,
    customer: {
      customerId: customer.id,
      name: customer.name,
      phoneE164: session.phone_e164,
      address: {
        addressId: customer.address.id,
        street: customer.address.street,
        number: customer.address.number,
        complement: customer.address.complement,
        neighborhood: customer.address.neighborhood,
        city: customer.address.city,
        state: customer.address.state,
        postalCode: customer.address.postal_code,
        reference: customer.address.reference,
      },
    },
    paymentMethod,
    items,
    totalCents: quote.totalCents,
  };
  return { basket, snapshot, totalCents: quote.totalCents, items };
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function createDraft(tx: Sql, message: WebhookMessage, channel: Channel, phone: string, responseJson: string): Promise<void> {
  if (responseJson.length > 64 * 1024) throw new WebhookError(413, "A resposta do Flow excede o tamanho aceito.");
  let response: unknown;
  try { response = JSON.parse(responseJson); } catch { throw new WebhookError(422, "A resposta do Flow não é JSON válido."); }
  if (!isRecord(response) || response.contract_version !== 1 || typeof response.flow_token !== "string"
    || typeof response.address_id !== "string"
    || typeof response.payment_method !== "string" || !["pix", "cash", "debit_card", "credit_card"].includes(response.payment_method)) {
    throw new WebhookError(422, "A resposta do Flow não corresponde ao contrato de checkout versão 1.");
  }
  let selectedCustomerId: string | undefined;
  if (response.customer_id !== undefined) {
    if (typeof response.customer_id !== "string" || response.customer_id.length === 0) {
      throw new WebhookError(422, "O identificador de cliente enviado pelo Flow é inválido.");
    }
    selectedCustomerId = response.customer_id;
  }
  const session = await loadSession(tx, response.flow_token, channel, phone);
  const catalog = await catalogAt(session.catalog_commit);
  if (catalog.revision !== session.catalog_revision) {
    throw new WebhookError(409, "A revisão de catálogo mudou; reabra o Flow antes de confirmar.");
  }
  const customer = await findCustomer(phone, selectedCustomerId, response.address_id);
  const built = await buildOrderSnapshot(catalog, session, parseSelections(response.selections), customer, response.payment_method);
  const snapshotJson = JSON.stringify(built.snapshot);
  const summaryHash = await digestHex(snapshotJson);
  const expiry = new Date(Date.now() + 15 * 60_000).toISOString();
  const inserted = await tx<{ id: string }>`
    insert into whatsapp_atendimento.order_drafts
      (channel, phone_e164, session_id, status, snapshot, summary_hash, source_event_id, expires_at)
    values (${channel}, ${phone}, ${session.id}, 'awaiting_customer_confirmation', ${tx.json(built.snapshot)}, ${summaryHash}, ${message.id}, ${expiry})
    on conflict (channel, source_event_id) do nothing
    returning id
  `;
  const draftId = inserted[0]?.id;
  if (!draftId) return;
  const snapshot = built.snapshot;
  const customerSnapshot = snapshot.customer;
  const address = customerSnapshot.address;
  const itemLines = built.items.map((item) => `• ${item.quantity} × ${item.name} (${item.brand})`).join("\n");
  const body = [
    `Resumo da cesta ${built.basket.name}`,
    itemLines,
    `Total: ${formatMoney(built.totalCents)}`,
    `Pagamento: ${snapshot.paymentMethod}`,
    `Cliente: ${customerSnapshot.name}`,
    `Endereço: ${address.street}, ${address.number}${address.complement ? `, ${address.complement}` : ""} — ${address.neighborhood}, ${address.city}/${address.state}`,
    "Confira os dados e escolha uma ação.",
  ].join("\n");
  await queueMessage(tx, channel, "order_summary", `${channel}:${message.id}:order-summary`, graphMessage(phone, "interactive", {
    type: "button",
    body: { text: body },
    action: { buttons: [
      { type: "reply", reply: { id: `confirm:${draftId}:1`, title: "Confirmar pedido" } },
      { type: "reply", reply: { id: `edit:${draftId}:1`, title: "Editar pedido" } },
      { type: "reply", reply: { id: `cancel:${draftId}:1`, title: "Cancelar" } },
    ] },
  }));
}

async function confirmDraft(tx: Sql, channel: Channel, phone: string, draftId: string, revision: number, eventId: string): Promise<void> {
  const drafts = await tx<{ id: string; channel: string; status: string; revision: number; phone_e164: string; snapshot: Record<string, unknown>; expires_at: string; catalog_commit: string; catalog_revision: string }>`
    select id, channel, status, revision, phone_e164, snapshot, expires_at,
      snapshot->>'catalogCommit' as catalog_commit, snapshot->>'catalogRevision' as catalog_revision
    from whatsapp_atendimento.order_drafts where id = ${draftId} for update
  `;
  const draft = drafts[0];
  if (!draft || draft.channel !== channel || draft.status !== "awaiting_customer_confirmation" || draft.revision !== revision
    || draft.phone_e164 !== phone || new Date(draft.expires_at).getTime() <= Date.now()) return;
  const snapshot = draft.snapshot;
  const total = Number(snapshot.totalCents);
  const created = await tx<{ id: string }>`
    insert into whatsapp_atendimento.orders
      (draft_id, channel, catalog_commit, catalog_revision, total_cents, snapshot)
    values (${draftId}, ${channel}, ${draft.catalog_commit}, ${draft.catalog_revision}, ${total}, ${tx.json(snapshot)})
    on conflict (draft_id) do nothing
    returning id
  `;
  let orderId = created[0]?.id;
  if (!orderId) {
    const existing = await tx<{ id: string }>`select id from whatsapp_atendimento.orders where draft_id = ${draftId}`;
    orderId = existing[0]?.id;
  }
  if (!orderId) throw new WebhookError(503, "Não foi possível confirmar o pedido.");
  const items = Array.isArray(snapshot.items) ? snapshot.items as Array<Record<string, unknown>> : [];
  for (const [index, item] of items.entries()) {
    await tx`
      insert into whatsapp_atendimento.order_items
        (order_id, position, group_id, product_id, quantity, unit_price_cents, line_total_cents, snapshot)
      values (${orderId}, ${index + 1}, ${String(item.groupId)}, ${String(item.productId)}, ${Number(item.quantity)}, ${Number(item.unitPriceCents)}, ${Number(item.lineTotalCents)}, ${tx.json(item)})
      on conflict (order_id, position) do nothing
    `;
  }
  await tx`
    insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data)
    values (${orderId}, ${`${channel}:${eventId}:confirmed`}, 'customer_confirmed', ${tx.json({ draftId, revision })})
    on conflict (event_key) do nothing
  `;
  await tx`update whatsapp_atendimento.order_drafts set status = 'confirmed', confirmed_order_id = ${orderId}, updated_at = now() where id = ${draftId}`;
}

async function resolveOrderAdjustment(
  tx: Sql,
  channel: Channel,
  phone: string,
  orderId: string,
  revision: number,
  action: "accept-adjustment" | "cancel-adjustment",
  eventId: string,
): Promise<void> {
  const rows = await tx<{
    id: string; channel: string; status: string; revision: number; snapshot: Record<string, unknown>;
    pending_customer_snapshot: Record<string, unknown> | null; customer_acceptance_status: string;
  }>`
    select id, channel, status, revision, snapshot, pending_customer_snapshot, customer_acceptance_status
    from whatsapp_atendimento.orders where id = ${orderId} for update
  `;
  const order = rows[0];
  if (!order || order.channel !== channel || order.status !== "attention" || order.revision !== revision
    || order.customer_acceptance_status !== "pending" || !order.pending_customer_snapshot) return;
  const customer = isRecord(order.snapshot.customer) ? order.snapshot.customer : {};
  if (customer.phoneE164 !== phone) return;

  if (action === "cancel-adjustment") {
    await tx`
      update whatsapp_atendimento.orders set status = 'cancelled', attention_code = null,
        customer_acceptance_status = 'rejected', pending_customer_snapshot = null,
        pending_customer_total_cents = null, revision = revision + 1, updated_at = now()
      where id = ${orderId}
    `;
  } else {
    const snapshot = order.pending_customer_snapshot;
    const items = Array.isArray(snapshot.items) ? snapshot.items as Array<Record<string, unknown>> : [];
    if (!Number.isSafeInteger(snapshot.totalCents) || !items.every((item) => typeof item.groupId === "string"
      && typeof item.productId === "string" && Number.isSafeInteger(item.quantity)
      && Number.isSafeInteger(item.unitPriceCents) && Number.isSafeInteger(item.lineTotalCents))) {
      throw new WebhookError(409, "A alteração pendente do pedido está incompleta.");
    }
    await tx`delete from whatsapp_atendimento.order_items where order_id = ${orderId}`;
    for (const [index, item] of items.entries()) {
      await tx`
        insert into whatsapp_atendimento.order_items
          (order_id, position, group_id, product_id, quantity, unit_price_cents, line_total_cents, snapshot, picked_quantity, picking_status)
        values (${orderId}, ${index + 1}, ${String(item.groupId)}, ${String(item.productId)}, ${Number(item.quantity)}, ${Number(item.unitPriceCents)}, ${Number(item.lineTotalCents)}, ${tx.json(item)}, 0, 'pending')
      `;
    }
    await tx`
      update whatsapp_atendimento.orders set status = 'packing', snapshot = ${tx.json(snapshot)},
        total_cents = ${Number(snapshot.totalCents)}, attention_code = null, customer_acceptance_status = 'accepted',
        pending_customer_snapshot = null, pending_customer_total_cents = null,
        revision = revision + 1, updated_at = now()
      where id = ${orderId}
    `;
  }
  await tx`
    insert into whatsapp_atendimento.order_events (order_id, event_key, event_type, event_data)
    values (${orderId}, ${`${channel}:${eventId}:adjustment`}, ${action === "accept-adjustment" ? "customer_adjustment_accepted" : "customer_adjustment_rejected"}, ${tx.json({ revision, action })})
    on conflict (event_key) do nothing
  `;
}

async function cancelOrEditDraft(
  tx: Sql,
  channel: Channel,
  phone: string,
  draftId: string,
  revision: number,
  action: "edit" | "cancel",
): Promise<{ basketId: string } | null> {
  const drafts = await tx<{ status: string; revision: number; phone_e164: string; snapshot: Record<string, unknown>; expires_at: string }>`
    select status, revision, phone_e164, snapshot, expires_at
    from whatsapp_atendimento.order_drafts where id = ${draftId} and channel = ${channel} for update
  `;
  const draft = drafts[0];
  if (!draft || draft.status !== "awaiting_customer_confirmation" || draft.revision !== revision
    || draft.phone_e164 !== phone || new Date(draft.expires_at).getTime() <= Date.now()) return null;
  await tx`update whatsapp_atendimento.order_drafts set status = ${action === "edit" ? "superseded" : "cancelled"}, updated_at = now() where id = ${draftId}`;
  if (action === "cancel") return null;
  const snapshot = draft.snapshot;
  return { basketId: String(snapshot.basketId) };
}

async function createSessionFromReply(tx: Sql, channel: Channel, phone: string, basketId: string, eventId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(basketId)) throw new WebhookError(422, "A cesta selecionada é inválida.");
  const catalog = await currentCatalog();
  const basket = catalog.documents.baskets.baskets.find((item) => item.id === basketId && item.active);
  if (!basket) throw new WebhookError(422, "Esta cesta não está disponível.");
  const token = await insertSession(tx, channel, basket, phone, catalog);
  await queueFlowLaunch(tx, channel, phone, basket, token, `${channel}:${eventId}:flow-launch`);
}

async function processMessage(message: WebhookMessage, channel: Channel, rawBody: string): Promise<void> {
  if (typeof message.id !== "string" || message.id.length > 256) throw new WebhookError(400, "A mensagem não contém um ID válido.");
  const phone = phoneE164(message.from);
  const db = getDatabase();
  await db.begin(async (tx) => {
    const accepted = await tx<{ id: number }>`
      insert into whatsapp_atendimento.webhook_events (channel, message_id, message_type, body_sha256)
      values (${channel}, ${message.id}, ${message.type}, ${await digestHex(rawBody)})
      on conflict (channel, message_id) do nothing
      returning id
    `;
    if (!accepted.length) return;

    if (message.type === "text") {
      const body = message.text?.body?.trim().toLocaleLowerCase("pt-BR");
      if (body && /^(oi|ol[aá]|quero|comprar|cesta|pedido)\b/.test(body)) await queueBasketMenu(tx, channel, phone, message.id);
      return;
    }

    const listId = message.interactive?.list_reply?.id;
    if (message.type === "interactive" && typeof listId === "string" && listId.startsWith("basket:")) {
      await createSessionFromReply(tx, channel, phone, listId.slice("basket:".length), message.id);
      return;
    }

    const flowResponse = message.interactive?.nfm_reply?.response_json;
    if (message.type === "interactive" && typeof flowResponse === "string") {
      await createDraft(tx, message, channel, phone, flowResponse);
      return;
    }

    const buttonId = message.interactive?.button_reply?.id;
    const adjustment = typeof buttonId === "string" ? buttonId.match(/^(accept-adjustment|cancel-adjustment):([0-9a-f-]{36}):(\d+)$/i) : null;
    if (message.type === "interactive" && adjustment) {
      const adjustmentAction = adjustment[1].toLowerCase() as "accept-adjustment" | "cancel-adjustment";
      await resolveOrderAdjustment(tx, channel, phone, adjustment[2], Number(adjustment[3]), adjustmentAction, message.id);
      return;
    }
    const action = typeof buttonId === "string" ? buttonId.match(/^(confirm|edit|cancel):([0-9a-f-]{36}):(\d+)$/i) : null;
    if (message.type === "interactive" && action) {
      const [, actionName, draftId, revisionText] = action;
      const revision = Number(revisionText);
      if (actionName === "confirm") {
        await confirmDraft(tx, channel, phone, draftId, revision, message.id);
      } else {
        const result = await cancelOrEditDraft(tx, channel, phone, draftId, revision, actionName as "edit" | "cancel");
        if (actionName === "edit" && result) await createSessionFromReply(tx, channel, phone, result.basketId, message.id);
        if (actionName === "cancel") {
          await queueMessage(tx, channel, "order_cancelled", `${channel}:${message.id}:cancelled`, {
            messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "text", text: { body: "O pedido foi cancelado." },
          });
        }
      }
    }
  });
}

async function handleWebhook(rawBody: string): Promise<void> {
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { throw new WebhookError(400, "O corpo do webhook não é JSON válido."); }
  if (!isRecord(payload) || !Array.isArray(payload.entry)) throw new WebhookError(400, "O corpo do webhook não tem o formato esperado.");
  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value) || !isRecord(change.value.metadata)) continue;
      const channel = channelForPhoneNumberId(change.value.metadata.phone_number_id);
      if (!Array.isArray(change.value.messages)) continue;
      for (const rawMessage of change.value.messages) {
        if (isRecord(rawMessage)) await processMessage(rawMessage as unknown as WebhookMessage, channel, rawBody);
      }
    }
  }
}

function plain(status: number, message: string): Response {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > BODY_LIMIT) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > BODY_LIMIT) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
    if (!expected) return plain(503, "Webhook verification is not configured.");
    if (mode !== "subscribe" || !token || !challenge || !constantTimeEqual(token, expected)) return plain(403, "Forbidden");
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  }
  if (request.method !== "POST") return plain(405, "Method not allowed");
  const body = await readBody(request);
  if (body === null) return plain(413, "Payload too large");
  try {
    if (!await verifySignature(body, request.headers.get("X-Hub-Signature-256"))) return plain(432, "Invalid signature");
    await handleWebhook(body);
    wakeOutboxWorker();
    return Response.json({ accepted: true });
  } catch (error) {
    if (error instanceof WebhookError) return plain(error.status, error.message);
    console.error("WhatsApp checkout webhook failed", error instanceof Error ? error.name : "unknown");
    return plain(500, "Webhook processing failed");
  }
}

Deno.serve(handle);
