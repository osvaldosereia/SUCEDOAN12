import type { CatalogDocuments } from "../domain/catalog";
import type { FlowChannel, FlowDraftSnapshot, SaveFlowDraftInput } from "../domain/flows";
import type { OrderDetailRecord, OrderListEntry, OrderPickingInput } from "../domain/orders";

export interface CatalogSnapshot extends CatalogDocuments {
  commitSha: string;
  commitUrl: string;
  catalogRevision: string;
}

export interface PendingImage {
  productId: string;
  contentBase64: string;
  previewUrl?: string;
}

export interface SaveCatalogInput {
  expectedCommit: string;
  products: CatalogDocuments["products"];
  baskets: CatalogDocuments["baskets"];
  images?: Array<Pick<PendingImage, "productId" | "contentBase64">>;
}

export class AdminApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const apiBase = supabaseUrl ? `${supabaseUrl}/functions/v1/whatsapp-admin-api` : "";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function apiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  if (!apiBase || !publishableKey) {
    throw new AdminApiError("API administrativa não configurada. A prévia local continua disponível.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("apikey", publishableKey);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const result = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) {
    const message = result.error ?? `Falha na API administrativa (${response.status}).`;
    throw new AdminApiError(message, response.status);
  }
  return result;
}

export function getCatalog(accessToken: string): Promise<CatalogSnapshot> {
  return apiRequest<CatalogSnapshot>("/catalog", accessToken);
}

export function saveCatalog(accessToken: string, input: SaveCatalogInput): Promise<CatalogSnapshot> {
  return apiRequest<CatalogSnapshot>("/catalog", accessToken, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getFlowDraft(accessToken: string, channel: FlowChannel): Promise<FlowDraftSnapshot> {
  return apiRequest<FlowDraftSnapshot>(`/flow-drafts/${channel}`, accessToken);
}

export function saveFlowDraft(accessToken: string, channel: FlowChannel, input: SaveFlowDraftInput): Promise<FlowDraftSnapshot> {
  return apiRequest<FlowDraftSnapshot>(`/flow-drafts/${channel}`, accessToken, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getOrders(accessToken: string): Promise<{ orders: OrderListEntry[] }> {
  return apiRequest<{ orders: OrderListEntry[] }>("/orders", accessToken);
}

export function getOrder(accessToken: string, orderId: string): Promise<OrderDetailRecord> {
  return apiRequest<OrderDetailRecord>(`/orders/${encodeURIComponent(orderId)}`, accessToken);
}

export function assignOrder(accessToken: string, orderId: string, revision: number): Promise<OrderDetailRecord> {
  return apiRequest<OrderDetailRecord>(`/orders/${encodeURIComponent(orderId)}/assign`, accessToken, {
    method: "POST",
    body: JSON.stringify({ revision }),
  });
}

export function saveOrderBlingContact(
  accessToken: string,
  orderId: string,
  input: { revision: number; blingContactId: number; customerMatchConfirmed: true },
): Promise<OrderDetailRecord> {
  return apiRequest<OrderDetailRecord>(`/orders/${encodeURIComponent(orderId)}/bling-contact`, accessToken, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function saveOrderPicking(accessToken: string, orderId: string, input: OrderPickingInput): Promise<OrderDetailRecord> {
  return apiRequest<OrderDetailRecord>(`/orders/${encodeURIComponent(orderId)}/picking`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function completeOrderSeparation(accessToken: string, orderId: string, revision: number): Promise<OrderDetailRecord> {
  return apiRequest<OrderDetailRecord>(`/orders/${encodeURIComponent(orderId)}/separation/complete`, accessToken, {
    method: "POST",
    body: JSON.stringify({ revision }),
  });
}
