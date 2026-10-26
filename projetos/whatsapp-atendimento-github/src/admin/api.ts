import type { CatalogDocuments } from "../domain/catalog";
import type { BasketFlowJson, FlowChannel, FlowDraftSnapshot, SaveFlowDraftInput } from "../domain/flows";
import type { OrderDetailRecord, OrderListEntry, OrderPickingInput } from "../domain/orders";
import type { OutboxQueueSnapshot } from "../domain/outbox";
import type { CustomerListItem, CustomerRecord } from "../domain/customers";
import { attendanceQueueItems, type AnaAdminSnapshot, type AttendanceAccount, type AttendanceConversationSnapshot, type AttendanceQueueItem } from "../domain/attendance";

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

export interface MetaFlowSummary {
  id: string;
  name: string;
  status: string;
  categories: string[];
  validationErrors: string[];
  endpointUri: string | null;
  uploadedByAdmin: boolean;
}

export interface MetaChannelSnapshot {
  channel: FlowChannel;
  loaded: true;
  configured: boolean;
  accountName: string | null;
  blockers: string[];
  flows: MetaFlowSummary[];
  encryptionConfigured: boolean;
  endpointUri: string | null;
  bindingStoreReady: boolean;
  activeBinding: {
    flowId: string;
    flowMessageVersion: string;
    flowCta: string;
    flowAction: string;
    firstScreen: string;
  } | null;
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

export function getOutbox(accessToken: string): Promise<OutboxQueueSnapshot> {
  return apiRequest<OutboxQueueSnapshot>("/outbox", accessToken);
}

export async function getAttendanceAccounts(accessToken: string): Promise<AttendanceAccount[]> {
  const result = await apiRequest<{ items?: unknown[] }>("/attendance/accounts", accessToken);
  return (result.items ?? []).flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const account = value as Record<string, unknown>;
    if (typeof account.id !== "string" || typeof account.phone_e164 !== "string") return [];
    const digits = account.phone_e164.replace(/\D/g, "");
    if (!digits.endsWith("0975") && !digits.endsWith("1018")) return [];
    return [{
      id: account.id,
      display_name: typeof account.display_name === "string" ? account.display_name : "WhatsApp",
      phone_e164: account.phone_e164,
      is_active: account.is_active === true,
    }];
  });
}

export async function getAttendanceQueue(accessToken: string, accountId: string, query = ""): Promise<AttendanceQueueItem[]> {
  const params = new URLSearchParams({ accountId });
  if (query.trim()) params.set("q", query.trim());
  const result = await apiRequest<Record<string, unknown>>(`/attendance/queue?${params}`, accessToken);
  return attendanceQueueItems(result);
}

export function getAttendanceConversation(accessToken: string, conversationId: string, accountId: string): Promise<AttendanceConversationSnapshot> {
  const query = new URLSearchParams({ accountId });
  return apiRequest<AttendanceConversationSnapshot>(`/attendance/conversations/${encodeURIComponent(conversationId)}?${query}`, accessToken);
}

export function sendAttendanceText(
  accessToken: string,
  input: { conversationId: string; accountId: string; text: string; idempotencyKey: string },
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>("/attendance/operations", accessToken, {
    method: "POST",
    body: JSON.stringify({ action: "send_text", conversation_id: input.conversationId, accountId: input.accountId, text: input.text, idempotency_key: input.idempotencyKey }),
  });
}

export function setAttendanceMode(accessToken: string, conversationId: string, accountId: string, mode: "human" | "ai"): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>("/attendance/mode", accessToken, {
    method: "POST",
    body: JSON.stringify({ conversationId, accountId, mode }),
  });
}

export function getAnaAdmin(accessToken: string): Promise<AnaAdminSnapshot> {
  return apiRequest<AnaAdminSnapshot>("/attendance/ana", accessToken, {
    method: "POST",
    body: JSON.stringify({ action: "admin_load" }),
  });
}

export function setAnaChannel(accessToken: string, accountId: string, enabled: boolean): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>("/attendance/ana", accessToken, {
    method: "POST",
    body: JSON.stringify({ action: "admin_set_channel", whatsapp_account_id: accountId, enabled }),
  });
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

export function reconcileOrderBlingSale(
  accessToken: string,
  orderId: string,
  revision: number,
  idempotencyKey: string,
): Promise<OrderDetailRecord> {
  return apiRequest<OrderDetailRecord>(`/orders/${encodeURIComponent(orderId)}/bling-sale/reconcile`, accessToken, {
    method: "POST",
    body: JSON.stringify({ revision, idempotencyKey }),
  });
}

export function createOrderBlingSale(accessToken: string, orderId: string, revision: number): Promise<OrderDetailRecord> {
  return apiRequest<OrderDetailRecord>(`/orders/${encodeURIComponent(orderId)}/bling-sale/create`, accessToken, {
    method: "POST",
    body: JSON.stringify({ revision, confirmation: "CRIAR_VENDA" }),
  });
}

export function generateOrderBlingInvoice(accessToken: string, orderId: string, revision: number): Promise<OrderDetailRecord> {
  return apiRequest<OrderDetailRecord>(`/orders/${encodeURIComponent(orderId)}/bling-invoice/generate`, accessToken, {
    method: "POST",
    body: JSON.stringify({ revision, confirmation: "EMITIR_NFE" }),
  });
}

export function getCustomers(accessToken: string, query = ""): Promise<{ customers: CustomerListItem[] }> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  return apiRequest<{ customers: CustomerListItem[] }>(`/customers${params.size ? `?${params}` : ""}`, accessToken);
}

export function getCustomer(accessToken: string, customerId: string): Promise<CustomerRecord> {
  return apiRequest<CustomerRecord>(`/customers/${encodeURIComponent(customerId)}`, accessToken);
}

export function saveCustomer(accessToken: string, customer: CustomerRecord): Promise<CustomerRecord> {
  const id = customer.id;
  return apiRequest<CustomerRecord>(id ? `/customers/${encodeURIComponent(id)}` : "/customers", accessToken, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(customer),
  });
}

export function getMetaFlows(accessToken: string, channel: FlowChannel): Promise<MetaChannelSnapshot> {
  return apiRequest<MetaChannelSnapshot>(`/meta-flows/${channel}`, accessToken);
}

export function createMetaFlow(accessToken: string, channel: FlowChannel, name: string): Promise<{ id: string; name: string }> {
  return apiRequest(`/meta-flows/${channel}/create`, accessToken, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function uploadMetaFlowJson(
  accessToken: string,
  channel: FlowChannel,
  flowId: string,
  flowJson: BasketFlowJson,
  name: string,
  basketId: string,
): Promise<{ validationErrors: string[] }> {
  return apiRequest(`/meta-flows/${channel}/${encodeURIComponent(flowId)}/upload`, accessToken, {
    method: "POST",
    body: JSON.stringify({ flowJson, name, basketId }),
  });
}

export function setupMetaFlowEncryption(accessToken: string, channel: FlowChannel): Promise<{ configured: boolean }> {
  return apiRequest(`/meta-flows/${channel}/encryption`, accessToken, {
    method: "POST",
    body: JSON.stringify({ confirmChannel: channel }),
  });
}

export function publishMetaFlow(accessToken: string, channel: FlowChannel, flowId: string): Promise<{ success: true }> {
  return apiRequest(`/meta-flows/${channel}/${encodeURIComponent(flowId)}/publish`, accessToken, {
    method: "POST",
    body: JSON.stringify({ confirmPublish: "PUBLISH_FLOW", confirmChannel: channel }),
  });
}

export function bindPublishedMetaFlow(
  accessToken: string,
  channel: FlowChannel,
  flowId: string,
  expectedFlowId: string | null,
): Promise<{ channel: FlowChannel; flowId: string }> {
  return apiRequest(`/meta-flows/${channel}/binding`, accessToken, {
    method: "POST",
    body: JSON.stringify({ confirmChannel: channel, flowId, expectedFlowId }),
  });
}

export function unbindMetaFlow(
  accessToken: string,
  channel: FlowChannel,
  expectedFlowId: string,
): Promise<{ channel: FlowChannel; flowId: string; removed: true }> {
  return apiRequest(`/meta-flows/${channel}/binding`, accessToken, {
    method: "DELETE",
    body: JSON.stringify({ confirmChannel: channel, expectedFlowId }),
  });
}
