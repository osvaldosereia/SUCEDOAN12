import { createClient, type Session } from "@supabase/supabase-js";
import initialProducts from "../../catalog/products.json";
import initialBaskets from "../../catalog/baskets.json";
import initialFlow0975 from "../../flows/channel-0975.json";
import initialFlow1018 from "../../flows/channel-1018.json";
import {
  validateCatalog,
  type Basket,
  type BasketProductGroup,
  type BasketsDocument,
  type CatalogDocuments,
  type Product,
  type ProductsDocument,
} from "../domain/catalog";
import {
  FLOW_CHANNELS,
  FLOW_NO_PRODUCT_ID,
  flowNameForBasket,
  flowProductField,
  flowQuantityField,
  generateBasketFlow,
  validateChannelFlowDocument,
  type BasketFlowDraft,
  type ChannelFlowDocument,
  type FlowChannel,
} from "../domain/flows";
import { AdminApiError, assignOrder, bindPublishedMetaFlow, completeOrderDelivery, completeOrderSeparation, createMetaFlow, createOrderBlingSale, generateOrderBlingInvoice, getAnaAdmin, getAttendanceAccounts, getAttendanceConversation, getAttendanceMedia, getAttendanceQueue, getCatalog, getCustomer, getCustomers, getFlowDraft, getMetaFlows, getOrder, getOrders, getOutbox, lookupBlingProductByCatalogGtin, publishMetaFlow, reconcileOrderBlingSale, saveCatalog, saveCustomer, saveFlowDraft, saveOrderBlingContact, saveOrderPicking, sendAttendanceText, setAnaChannel, setAttendanceMode, setupMetaFlowEncryption, startOrderDispatch, unbindMetaFlow, uploadMetaFlowJson, type MetaChannelSnapshot, type PendingImage } from "./api";
import type { OrderDetailRecord, OrderListEntry } from "../domain/orders";
import type { OutboxMessageSummary, OutboxQueueSnapshot, OutboxStatus } from "../domain/outbox";
import { attendanceChannelFromPhone, type AnaAdminSnapshot, type AttendanceChannel, type AttendanceConversationSnapshot, type AttendanceMediaPreview, type AttendanceQueueItem } from "../domain/attendance";
import { emptyCustomer, type CustomerListItem, type CustomerRecord } from "../domain/customers";
import { renderFlowsPanel } from "./flows-panel";
import { renderAttendancePanel } from "./attendance-panel";
import { renderCustomerAddressEditor, renderCustomersPanel } from "./customers-panel";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Container da aplicação não encontrado.");
const appRoot = app as HTMLDivElement;

const imageFiles = import.meta.glob<string>("../../images/products/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const imageUrls = new Map(Object.entries(imageFiles).map(([path, url]) => [path.split("/").pop() ?? "", url]));

const initialDocuments: CatalogDocuments = {
  products: initialProducts as ProductsDocument,
  baskets: initialBaskets as BasketsDocument,
};
const initialFlowDocuments: Record<FlowChannel, ChannelFlowDocument> = {
  "0975": initialFlow0975 as ChannelFlowDocument,
  "1018": initialFlow1018 as ChannelFlowDocument,
};
const initialFlowBasket = initialDocuments.baskets.baskets.find((basket) => basket.active);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

const state = {
  products: structuredClone(initialDocuments.products),
  baskets: structuredClone(initialDocuments.baskets),
  baseline: JSON.stringify(initialDocuments),
  commitSha: "",
  catalogRevision: "",
  commitUrl: "",
  session: null as Session | null,
  access: "preview" as "preview" | "loading" | "authorized" | "denied",
  accessMessage: "Prévia local: entre com o link enviado ao e-mail de uma conta administrativa ativa.",
  authEmail: "",
  authMessage: "",
  busy: false,
  tab: "products" as "products" | "baskets" | "flows" | "orders" | "outbox" | "customers" | "attendance",
  search: "",
  selectedBasketId: initialDocuments.baskets.baskets[0]?.id ?? "",
  flowDocuments: structuredClone(initialFlowDocuments),
  flowChannel: "0975" as FlowChannel,
  flowBasketId: initialFlowBasket?.id ?? "",
  flowName: initialFlowBasket ? flowNameForBasket(initialFlowBasket) : "cesta-atendimento",
  flowProductChoices: new Map<string, string>(),
  flowQuantities: new Map<string, number>(),
  flowReviewDocument: null as ChannelFlowDocument | null,
  metaChannels: {} as Partial<Record<FlowChannel, MetaChannelSnapshot>>,
  metaSelectedFlowIds: {} as Partial<Record<FlowChannel, string>>,
  pendingImages: new Map<string, PendingImage>(),
  editorImage: null as PendingImage | null,
  editorImageProductId: "",
  conflict: false,
  optionEditor: null as { groupIndex: number; optionIds: string[]; search: string } | null,
  modalKind: null as "product" | "options" | "review" | "flow-review" | null,
  notice: "",
  noticeType: "info" as "info" | "success" | "error",
  orders: [] as OrderListEntry[],
  selectedOrder: null as OrderDetailRecord | null,
  ordersLoaded: false,
  customers: [] as CustomerListItem[],
  customersLoaded: false,
  customerSearch: "",
  customerEditor: null as CustomerRecord | null,
  outbox: [] as OutboxMessageSummary[],
  outboxCounts: { pending: 0, sent: 0, failed: 0, cancelled: 0 } as OutboxQueueSnapshot["counts"],
  outboxLimit: 50,
  outboxLoaded: false,
  outboxSenderEnabled: false,
  reconciliationRequestKeys: new Map<string, string>(),
  attendanceChannel: "0975" as AttendanceChannel,
  attendanceAccounts: [] as Array<{ id: string; display_name: string; phone_e164: string; is_active: boolean }>,
  attendanceQueue: [] as AttendanceQueueItem[],
  attendanceQueueLoaded: false,
  attendanceSelectedConversationId: "",
  attendanceConversation: null as AttendanceConversationSnapshot | null,
  attendanceMedia: new Map<string, AttendanceMediaPreview>(),
  attendanceMediaExpiryTimers: new Map<string, number>(),
  attendanceMediaLoadingId: "",
  attendanceSearch: "",
  attendanceAna: null as AnaAdminSnapshot | null,
  attendanceNotice: "",
  attendanceSendKey: null as { conversationId: string; text: string; key: string } | null,
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function normalizeGtin(value: string): string {
  return value.replace(/\D/g, "");
}

function money(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function slug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "item";
}

function uniqueInOrder(values: string[]): string[] {
  return [...new Set(values)];
}

function productMap(): Map<string, Product> {
  return new Map(state.products.products.map((product) => [product.id, product]));
}

function imageUrl(product: Product): string {
  if (state.editorImageProductId === product.id && state.editorImage?.previewUrl) return state.editorImage.previewUrl;
  const pending = state.pendingImages.get(product.id);
  if (pending?.previewUrl) return pending.previewUrl;
  const filename = product.imagePath.split("/").pop() ?? "";
  if (state.access === "authorized" && state.commitSha) {
    return `https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/${state.commitSha}/projetos/whatsapp-atendimento-github/${product.imagePath}`;
  }
  return imageUrls.get(filename)
    ?? `https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/project/whatsapp-atendimento-github-20261025/projetos/whatsapp-atendimento-github/${product.imagePath}`;
}

function tell(message: string, type: "info" | "success" | "error" = "info"): void {
  state.notice = message;
  state.noticeType = type;
  render();
}

function revokeAttendanceMedia(messageId: string): void {
  const timer = state.attendanceMediaExpiryTimers.get(messageId);
  if (timer !== undefined) window.clearTimeout(timer);
  state.attendanceMediaExpiryTimers.delete(messageId);
  const preview = state.attendanceMedia.get(messageId);
  if (preview?.url.startsWith("blob:")) URL.revokeObjectURL(preview.url);
  state.attendanceMedia.delete(messageId);
}

function clearAttendanceMedia(): void {
  for (const messageId of state.attendanceMedia.keys()) revokeAttendanceMedia(messageId);
  state.attendanceMediaLoadingId = "";
}

function pruneAttendanceMedia(): void {
  const messages = Array.isArray(state.attendanceConversation?.messages) ? state.attendanceConversation.messages : [];
  const allowedIds = new Set(messages
    .filter((message) => ["image", "audio", "video", "document", "sticker"].includes(String(message.message_type ?? "").toLowerCase()))
    .map((message) => message.id)
    .filter((id): id is string => typeof id === "string"));
  for (const [messageId, preview] of state.attendanceMedia) {
    if (!allowedIds.has(messageId) || Date.parse(preview.expires_at) <= Date.now()) revokeAttendanceMedia(messageId);
  }
}

function currentDocuments(): CatalogDocuments {
  return { products: state.products, baskets: state.baskets };
}

function isDirty(): boolean {
  return JSON.stringify(currentDocuments()) !== state.baseline || state.pendingImages.size > 0 || Boolean(state.editorImage);
}

function selectedFlowBasket(): Basket | undefined {
  return state.baskets.baskets.find((basket) => basket.id === state.flowBasketId && basket.active);
}

function currentFlowDraft(): BasketFlowDraft | null {
  const basket = selectedFlowBasket();
  if (!basket) return null;
  return {
    flowName: state.flowName.trim(),
    basketId: basket.id,
    catalogRevision: state.catalogRevision,
    validationStatus: "local-only",
    flowJson: generateBasketFlow(basket, state.products.products),
  };
}

function flowDocumentWithDraft(): { document: ChannelFlowDocument | null; errors: string[]; refreshedCount: number } {
  const draft = currentFlowDraft();
  const basket = selectedFlowBasket();
  if (!draft || !basket) return { document: null, errors: ["Escolha uma cesta ativa."], refreshedCount: 0 };
  const existing = state.flowDocuments[state.flowChannel];
  const activeBaskets = new Map(state.baskets.baskets.filter((item) => item.active).map((item) => [item.id, item]));
  const drafts: BasketFlowDraft[] = existing.drafts.flatMap((saved) => {
    if (saved.basketId === basket.id) return [];
    const latestBasket = activeBaskets.get(saved.basketId);
    if (!latestBasket) return [];
    return [{
      ...saved,
      catalogRevision: state.catalogRevision,
      validationStatus: "local-only",
      flowJson: generateBasketFlow(latestBasket, state.products.products),
    }];
  });
  drafts.push(draft);
  const document: ChannelFlowDocument = { ...existing, drafts };
  const errors = validateChannelFlowDocument(document, state.flowChannel, state.baskets.baskets, state.products.products, state.catalogRevision);
  return { document, errors, refreshedCount: drafts.length - 1 };
}

function openFlowReview(): void {
  if (isDirty()) {
    tell("Grave primeiro as alterações de produtos e cestas para fixar a revisão usada pelo Flow.", "error");
    return;
  }
  if (!state.catalogRevision || !state.commitSha) {
    tell("Carregue a revisão atual do catálogo antes de salvar um rascunho Flow.", "error");
    return;
  }
  const { document, errors, refreshedCount } = flowDocumentWithDraft();
  const draft = currentFlowDraft();
  const basket = selectedFlowBasket();
  if (!document || !draft || !basket || errors.length) {
    tell(`Revise o Flow: ${(errors.length ? errors : ["Configuração incompleta."]).slice(0, 4).join(" · ")}`, "error");
    return;
  }
  state.flowReviewDocument = document;
  openModal(`<div class="modal-card review-modal"><div class="modal-heading"><div><span class="eyebrow">Revisão antes do commit</span><h2>Salvar rascunho Flow?</h2></div><button class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div><p>O commit sincronizará o mesmo conteúdo para 0975 e 1018, associado à cesta ${escapeHtml(basket.name)} e à revisão de catálogo <code>${escapeHtml(state.catalogRevision.slice(0, 7))}</code>.</p>${refreshedCount ? `<p class="inline-note">${refreshedCount} outro(s) rascunho(s) também será(ão) regenerado(s) para a mesma revisão do catálogo nos dois canais.</p>` : ""}<p class="flow-muted">A gravação não cria Flow na Meta, não publica e não envia mensagens. O status Meta permanece desconhecido.</p><div class="review-target"><span>Rascunhos sincronizados</span><strong>${escapeHtml(draft.flowName)}</strong><code>flows/channel-0975.json · flows/channel-1018.json</code></div><div class="modal-actions"><button class="button button-soft" data-action="close-modal">Voltar</button><button class="button button-primary" data-action="confirm-save-flow">Confirmar e gravar rascunho</button></div></div>`, "flow-review");
}

async function performFlowSave(): Promise<void> {
  const document = state.flowReviewDocument;
  if (state.access !== "authorized" || !state.session || !state.commitSha || !document) {
    tell("A gravação exige sessão autorizada, revisão atual e um rascunho conferido.", "error");
    return;
  }
  state.busy = true;
  render();
  try {
    const snapshot = await saveFlowDraft(state.session.access_token, state.flowChannel, {
      expectedCommit: state.commitSha,
      document,
    });
    state.flowDocuments = snapshot.documents;
    state.commitSha = snapshot.commitSha;
    state.commitUrl = snapshot.commitUrl;
    state.notice = `Rascunhos de Flow sincronizados para 0975 e 1018 no commit ${snapshot.commitSha.slice(0, 7)}.`;
    state.noticeType = "success";
    state.flowReviewDocument = null;
  } catch (error) {
    state.notice = error instanceof AdminApiError ? error.message : "Falha ao gravar o rascunho Flow.";
    state.noticeType = "error";
  } finally {
    state.busy = false;
    render();
  }
}

function accessLabel(): string {
  if (state.access === "authorized") return "Operador autorizado";
  if (state.access === "loading") return "Verificando acesso";
  if (state.access === "denied") return "Acesso não validado";
  return "Prévia local";
}

function productCard(product: Product): string {
  const source = imageUrl(product);
  return `<article class="product-card">
    <div class="product-photo">${source ? `<img src="${escapeHtml(source)}" alt="" loading="lazy">` : `<span class="photo-placeholder">Foto</span>`}</div>
    <div class="product-card-copy">
      <div class="card-title-row"><h3>${escapeHtml(product.name)}</h3><span class="status-pill ${product.active ? "is-active" : "is-inactive"}">${product.active ? "Ativo" : "Inativo"}</span></div>
      <p>${escapeHtml(product.brand)} · ${escapeHtml(product.presentation)}</p>
      <strong>${money(product.unitPriceCents)}</strong>
      <small>Estoque no GitHub: ${product.stockQuantity.toLocaleString("pt-BR")} unidade(s)</small>
      <small>${escapeHtml(product.sku ?? "Sem SKU")} · ${escapeHtml(product.id.slice(0, 8))}</small>
      <div class="card-actions"><button class="button button-soft" data-action="edit-product" data-id="${escapeHtml(product.id)}">Editar</button><button class="icon-button" aria-label="Remover produto" title="Remover" data-action="delete-product" data-id="${escapeHtml(product.id)}">×</button></div>
    </div>
  </article>`;
}

function productsView(): string {
  const query = state.search.trim().toLocaleLowerCase("pt-BR");
  const filtered = state.products.products.filter((product) =>
    !query || [product.name, product.brand, product.sku ?? "", product.id].join(" ").toLocaleLowerCase("pt-BR").includes(query)
  );
  return `<section class="workspace-heading">
      <div><span class="eyebrow">Catálogo · ${state.products.products.length} produtos</span><h1>Produtos</h1><p>Cadastre e revise os itens usados nas cestas.</p></div>
      <button class="button button-primary" data-action="new-product"><span>＋</span> Novo produto</button>
    </section>
    <div class="toolbar"><label class="search-field"><span>⌕</span><input id="product-search" type="search" value="${escapeHtml(state.search)}" placeholder="Buscar por nome, marca ou SKU"></label><span class="subtle">${filtered.length} resultado${filtered.length === 1 ? "" : "s"}</span></div>
    ${filtered.length ? `<div class="product-grid">${filtered.map(productCard).join("")}</div>` : `<div class="empty-state"><strong>Nenhum produto encontrado</strong><span>Experimente outro nome ou identificador.</span></div>`}`;
}

function productName(id: string): string {
  const product = productMap().get(id);
  return product ? product.name : `Produto removido (${id.slice(0, 8)})`;
}

function basketPreview(basket: Basket): string {
  return `<div class="preview-card">
    <div class="preview-top"><div><span class="eyebrow">Prévia para o atendimento</span><h3>${escapeHtml(basket.name || "Nova cesta")}</h3></div><strong>${money(basket.basePriceCents || 0)}</strong></div>
    <p class="preview-caption">Preço base cadastrado · ${basket.active ? "disponível" : "inativa"}</p>
    <div class="preview-groups">${basket.groups.map((group) => `<div class="preview-group"><div><strong>${escapeHtml(group.label)}</strong><span>${group.initialQuantity} un. na referência de preço</span></div><p>${uniqueInOrder(group.productIds).map(productName).map(escapeHtml).join(" · ")}</p></div>`).join("") || `<p class="subtle">Adicione um tipo de produto para completar a prévia.</p>`}</div>
  </div>`;
}

function basketEditor(basket: Basket): string {
  const groups = basket.groups.map((group, index) => {
    const options = uniqueInOrder(group.productIds);
    return `<article class="group-card" data-group-index="${index}">
      <div class="group-card-heading"><div class="drag-order"><button class="icon-button compact" title="Mover para cima" aria-label="Mover tipo para cima" data-action="move-group" data-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button><button class="icon-button compact" title="Mover para baixo" aria-label="Mover tipo para baixo" data-action="move-group" data-index="${index}" data-direction="1" ${index === basket.groups.length - 1 ? "disabled" : ""}>↓</button></div><div><span class="eyebrow">Tipo ${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(group.label)}</strong></div><button class="icon-button" title="Remover tipo" aria-label="Remover tipo" data-action="delete-group" data-index="${index}">×</button></div>
      <div class="group-fields"><label>Nome do tipo<input name="group_label_${index}" value="${escapeHtml(group.label)}" required maxlength="80"></label><label>Categoria<input name="group_category_${index}" value="${escapeHtml(group.category)}" required maxlength="80"></label></div>
      <div class="quantity-fields"><label>Quantidade base da cesta<input name="group_initial_${index}" type="number" min="0" max="6" value="${group.initialQuantity}" required></label><span class="quantity-hint">No Flow, o cliente escolhe de 1 a 6 conforme o estoque e pode sempre retirar este tipo.</span></div>
      <div class="selected-options"><div><strong>Opções (${options.length})</strong><button type="button" class="text-button" data-action="edit-group-options" data-index="${index}">Editar opções</button></div><p>${options.map((id) => `<span class="option-chip">${escapeHtml(productName(id))}</span>`).join("") || `<span class="subtle">Nenhuma opção selecionada</span>`}</p></div>
    </article>`;
  }).join("");

  return `<section class="workspace-heading">
      <div><span class="eyebrow">Composição versionada · ${state.baskets.baskets.length} cestas</span><h1>Cestas</h1><p>Organize tamanhos, tipos, opções e quantidades.</p></div>
      <button class="button button-primary" data-action="new-basket"><span>＋</span> Nova cesta</button>
    </section>
    <div class="basket-layout">
      <aside class="basket-sidebar"><div class="sidebar-title"><strong>Tamanhos</strong><span>${state.baskets.baskets.length}</span></div>${state.baskets.baskets.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item, index, all) => `<div class="basket-choice-row"><button class="basket-choice ${item.id === basket.id ? "is-selected" : ""}" data-action="select-basket" data-id="${escapeHtml(item.id)}"><span class="order-badge">${String(item.sortOrder).padStart(2, "0")}</span><span>${escapeHtml(item.name)}</span><span class="basket-choice-price">${money(item.basePriceCents)}</span></button><div class="drag-order"><button class="icon-button compact" title="Subir" aria-label="Subir cesta" data-action="move-basket" data-id="${escapeHtml(item.id)}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button><button class="icon-button compact" title="Descer" aria-label="Descer cesta" data-action="move-basket" data-id="${escapeHtml(item.id)}" data-direction="1" ${index === all.length - 1 ? "disabled" : ""}>↓</button></div></div>`).join("")}</aside>
      <div class="basket-main">
        <form id="basket-form" data-id="${escapeHtml(basket.id)}" class="basket-form">
          <div class="basket-form-heading"><div><span class="eyebrow">Configuração da cesta</span><h2>${escapeHtml(basket.name || "Nova cesta")}</h2><p>ID estável: <code>${escapeHtml(basket.id)}</code></p></div><button type="button" class="button button-soft" data-action="delete-basket" data-id="${escapeHtml(basket.id)}">Remover cesta</button></div>
          <div class="basket-fields"><label>Nome exibido<input name="basket_name" value="${escapeHtml(basket.name)}" required maxlength="80"></label><label>Preço base (R$)<input name="basket_price" type="number" min="0" step="0.01" value="${(basket.basePriceCents / 100).toFixed(2)}" required><small>Valor comercial cadastrado, em reais.</small></label><label class="checkbox-label"><input name="basket_active" type="checkbox" ${basket.active ? "checked" : ""}> Disponível para atendimento</label></div>
          <div class="section-title"><div><span class="eyebrow">Composição</span><h3>Tipos e quantidades</h3></div><button type="button" class="button button-soft" data-action="new-group">＋ Adicionar tipo</button></div>
          <div class="group-list">${groups || `<div class="empty-state compact-empty"><strong>Esta cesta ainda não tem tipos.</strong><span>Adicione um tipo para configurar as opções e a quantidade.</span></div>`}</div>
          <div class="inline-validation">${validateCatalog(currentDocuments()).slice(0, 3).map(escapeHtml).join(" · ")}</div>
          <button class="button button-primary save-inline" type="submit">Aplicar alterações da cesta</button>
        </form>
        ${basketPreview(basket)}
      </div>
    </div>`;
}

async function loadOrders(): Promise<void> {
  if (!state.session || state.access !== "authorized") {
    tell("Entre com o e-mail de uma conta administrativa ativa para acessar os pedidos.", "error");
    return;
  }
  state.busy = true;
  render();
  try {
    const result = await getOrders(state.session.access_token);
    state.orders = result.orders;
    state.ordersLoaded = true;
    state.selectedOrder = null;
    state.notice = "Fila de pedidos atualizada.";
    state.noticeType = "success";
  } catch (error) {
    state.notice = error instanceof AdminApiError ? error.message : "Não foi possível carregar os pedidos.";
    state.noticeType = "error";
  } finally {
    state.busy = false;
    render();
  }
}

async function loadCustomers(query = state.customerSearch): Promise<void> {
  if (!state.session || state.access !== "authorized") return;
  state.busy = true;
  state.customerSearch = query;
  render();
  try {
    const result = await getCustomers(state.session.access_token, query);
    state.customers = result.customers;
    state.customersLoaded = true;
    state.notice = `${result.customers.length} cadastro(s) encontrado(s).`;
    state.noticeType = "success";
  } catch (error) {
    state.notice = error instanceof AdminApiError ? error.message : "Não foi possível pesquisar os clientes.";
    state.noticeType = "error";
  } finally {
    state.busy = false;
    render();
  }
}

async function refreshMetaFlows(channel = state.flowChannel): Promise<void> {
  if (!state.session || state.access !== "authorized") return;
  state.busy = true;
  render();
  try {
    const snapshot = await getMetaFlows(state.session.access_token, channel);
    state.metaChannels[channel] = snapshot;
    const selected = state.metaSelectedFlowIds[channel];
    if (!selected || !snapshot.flows.some((flow) => flow.id === selected)) {
      state.metaSelectedFlowIds[channel] = snapshot.activeBinding?.flowId
        ?? state.flowDocuments[channel].metaFlowId
        ?? snapshot.flows.find((flow) => flow.status === "DRAFT")?.id
        ?? "";
    }
    state.notice = snapshot.configured
      ? `Status Meta do canal ${channel} atualizado (${snapshot.flows.length} Flow(s)).`
      : `Canal ${channel} ainda tem configurações pendentes no servidor.`;
    state.noticeType = snapshot.configured ? "success" : "info";
  } catch (error) {
    state.notice = error instanceof AdminApiError ? error.message : "Não foi possível consultar os Flows da Meta.";
    state.noticeType = "error";
  } finally {
    state.busy = false;
    render();
  }
}

async function loadOutbox(): Promise<void> {
  if (!state.session || state.access !== "authorized") {
    tell("Entre com o e-mail de uma conta administrativa ativa para acompanhar as mensagens.", "error");
    return;
  }
  state.busy = true;
  render();
  try {
    const snapshot = await getOutbox(state.session.access_token);
    state.outbox = snapshot.messages;
    state.outboxCounts = snapshot.counts;
    state.outboxLimit = snapshot.limit;
    state.outboxSenderEnabled = snapshot.senderEnabled;
    state.outboxLoaded = true;
    state.notice = "Acompanhamento de mensagens atualizado.";
    state.noticeType = "success";
  } catch (error) {
    state.notice = error instanceof AdminApiError ? error.message : "Não foi possível consultar o estado das mensagens.";
    state.noticeType = "error";
  } finally {
    state.busy = false;
    render();
  }
}

async function loadAttendance(): Promise<void> {
  if (!state.session || state.access !== "authorized") {
    state.attendanceNotice = "Entre com o e-mail de uma conta administrativa ativa para abrir o atendimento.";
    render();
    return;
  }
  state.busy = true;
  state.attendanceNotice = "Consultando os canais autorizados…";
  render();
  try {
    const token = state.session.access_token;
    const [accountsResult, anaResult] = await Promise.allSettled([
      getAttendanceAccounts(token),
      getAnaAdmin(token),
    ]);
    if (accountsResult.status === "rejected") throw accountsResult.reason;
    state.attendanceAccounts = accountsResult.value;
    state.attendanceAna = anaResult.status === "fulfilled" ? anaResult.value : null;
    const account = state.attendanceAccounts.find((item) => attendanceChannelFromPhone(item.phone_e164) === state.attendanceChannel);
    if (!account) {
      state.attendanceQueue = [];
      state.attendanceQueueLoaded = false;
      state.attendanceSelectedConversationId = "";
      state.attendanceConversation = null;
      clearAttendanceMedia();
      state.attendanceNotice = `O número final ${state.attendanceChannel} não foi retornado pelo serviço autorizado.`;
      return;
    }
    state.attendanceQueue = await getAttendanceQueue(token, account.id, state.attendanceSearch);
    state.attendanceQueueLoaded = true;
    if (!state.attendanceQueue.some((item) => String(item.conversation_id ?? item.id ?? "") === state.attendanceSelectedConversationId)) {
      state.attendanceSelectedConversationId = "";
      state.attendanceConversation = null;
      clearAttendanceMedia();
    }
    if (state.attendanceSelectedConversationId) {
      state.attendanceConversation = await getAttendanceConversation(token, state.attendanceSelectedConversationId, account.id);
      pruneAttendanceMedia();
    }
    state.attendanceNotice = anaResult.status === "rejected"
      ? "A fila carregou. A configuração global da ANA não pôde ser consultada pela permissão atual."
      : `Canal ${state.attendanceChannel} atualizado.`;
  } catch (error) {
    state.attendanceNotice = error instanceof AdminApiError ? error.message : "Não foi possível consultar o atendimento.";
    state.attendanceQueueLoaded = false;
  } finally {
    state.busy = false;
    render();
  }
}

async function selectAttendanceChannel(channel: AttendanceChannel): Promise<void> {
  state.attendanceChannel = channel;
  state.attendanceSearch = "";
  state.attendanceSelectedConversationId = "";
  state.attendanceConversation = null;
  clearAttendanceMedia();
  state.attendanceQueue = [];
  state.attendanceQueueLoaded = false;
  await loadAttendance();
}

async function openAttendanceConversation(conversationId: string): Promise<void> {
  if (!state.session || !conversationId) return;
  clearAttendanceMedia();
  state.busy = true;
  state.attendanceNotice = "Carregando conversa…";
  render();
  try {
    state.attendanceSelectedConversationId = conversationId;
    const account = state.attendanceAccounts.find((item) => attendanceChannelFromPhone(item.phone_e164) === state.attendanceChannel);
    if (!account) throw new AdminApiError("O canal selecionado não está disponível.");
    state.attendanceConversation = await getAttendanceConversation(state.session.access_token, conversationId, account.id);
    pruneAttendanceMedia();
    state.attendanceNotice = "Conversa atualizada."
  } catch (error) {
    state.attendanceConversation = null;
    state.attendanceNotice = error instanceof AdminApiError ? error.message : "Não foi possível abrir esta conversa.";
  } finally {
    state.busy = false;
    render();
  }
}

async function refreshAttendanceConversation(): Promise<void> {
  if (!state.session || !state.attendanceSelectedConversationId) return;
  try {
    const account = state.attendanceAccounts.find((item) => attendanceChannelFromPhone(item.phone_e164) === state.attendanceChannel);
    if (!account) throw new AdminApiError("O canal selecionado não está disponível.");
    state.attendanceConversation = await getAttendanceConversation(state.session.access_token, state.attendanceSelectedConversationId, account.id);
    pruneAttendanceMedia();
  } catch (error) {
    state.attendanceNotice = error instanceof AdminApiError ? error.message : "Não foi possível atualizar o histórico.";
  }
}

async function openOrder(orderId: string): Promise<void> {
  if (!state.session) return;
  state.busy = true;
  render();
  try {
    state.selectedOrder = await getOrder(state.session.access_token, orderId);
    state.notice = "";
  } catch (error) {
    state.notice = error instanceof AdminApiError ? error.message : "Não foi possível abrir o pedido.";
    state.noticeType = "error";
  } finally {
    state.busy = false;
    render();
  }
}

function orderStatusLabel(status: string): string {
  return ({ received: "Recebido", packing: "Em separação", attention: "Atenção", awaiting_invoice: "Pré-validação Bling", invoice_authorized: "NF-e autorizada", out_for_delivery: "Saiu para entrega", completed: "Concluído", cancelled: "Cancelado" } as Record<string, string>)[status] ?? status;
}

function paymentMethodLabel(method: string | null): string {
  return ({ pix: "Pix", cash: "Dinheiro", debit_card: "Cartão de débito", credit_card: "Cartão de crédito" } as Record<string, string>)[method ?? ""] ?? "A confirmar";
}

function outboxStatusLabel(status: OutboxStatus): string {
  return ({ pending: "Na fila", sent: "Aceita pela Graph", failed: "Falha para conferir", cancelled: "Cancelada" })[status];
}

function outboxProviderStatusLabel(status: OutboxMessageSummary["providerStatus"]): string | null {
  if (!status) return null;
  return ({ accepted: "Aceita pela Graph", sent: "Enviada pela Meta", delivered: "Entregue", read: "Lida", failed: "Falha reportada pela Meta" })[status];
}

function outboxTypeLabel(type: OutboxMessageSummary["messageType"]): string {
  return ({ basket_menu: "Menu de cestas", flow_launch: "Abertura do Flow", order_summary: "Resumo do pedido", order_adjustment: "Ajuste da separação", order_cancelled: "Cancelamento" })[type];
}

function outboxErrorLabel(code: string | null): string {
  if (!code) return "Sem erro registrado.";
  if (code === "delivery_unknown") return "Entrega incerta. Confira o histórico no WhatsApp Manager antes de qualquer reenvio manual.";
  const providerFailure = code.match(/^meta_status_failed_(\d+|unknown)$/);
  if (providerFailure) return `A Meta reportou falha de entrega${providerFailure[1] === "unknown" ? "." : ` (código ${providerFailure[1]}).`}`;
  const graphError = code.match(/^meta_http_(\d{3})_code_(\d+|unknown)$/);
  if (graphError) return `A Graph API respondeu HTTP ${graphError[1]} (código ${graphError[2]}).`;
  const labels: Record<string, string> = {
    channel_credentials_missing: "Credenciais do canal incompletas.",
    encryption_key_missing: "Chave de cifragem não configurada.",
    encryption_key_invalid: "Chave de cifragem inválida.",
    encrypted_payload_invalid: "Payload cifrado incompleto ou acima do limite.",
    payload_decryption_failed: "Não foi possível abrir o payload cifrado.",
    payload_json_invalid: "O payload cifrado não contém JSON válido.",
    payload_shape_invalid: "O payload não corresponde ao formato esperado.",
    flow_configuration_mismatch: "O Flow da mensagem difere da configuração do canal.",
    message_type_unsupported: "Tipo de mensagem não reconhecido.",
    message_payload_invalid: "O conteúdo não corresponde ao tipo de mensagem.",
    recipient_invalid: "O destinatário da mensagem não passou pela validação.",
    outbox_processing_failed: "Falha interna ao processar a mensagem.",
  };
  return labels[code] ?? `Falha registrada (${code}).`;
}

function outboxView(): string {
  if (state.access !== "authorized") return `<section class="workspace-heading"><div><span class="eyebrow">Operação</span><h1>Mensagens WhatsApp</h1><p>O acompanhamento exige uma sessão administrativa ativa.</p></div></section><div class="empty-state"><strong>Acesso administrativo necessário</strong><span>Entre com o e-mail de uma conta administrativa ativa para consultar a outbox.</span></div>`;
  return `<section class="workspace-heading"><div><span class="eyebrow">Operação · outbox</span><h1>Mensagens WhatsApp</h1><p>Acompanhe o que aguarda envio e o que precisa de conferência.</p></div><button class="button button-primary" data-action="outbox-refresh">Atualizar mensagens</button></section>
    <div class="outbox-safety-note ${state.outboxSenderEnabled && state.outboxLoaded ? "is-enabled" : ""}"><strong>${!state.outboxLoaded ? "Estado do envio não consultado" : state.outboxSenderEnabled ? "Gate de envio ligado no servidor" : "Gate de envio desligado no servidor"}</strong><span>Este estado indica somente a flag do worker; não confirma credenciais nem entrega. O conteúdo e o telefone não são exibidos aqui. Não há reenvio nesta tela. Mensagens com entrega incerta precisam ser conferidas no WhatsApp Manager antes de qualquer recuperação manual.</span></div>
    ${!state.outboxLoaded ? `<div class="empty-state"><strong>Carregue o acompanhamento</strong><span>A consulta mostra apenas status e metadados mínimos da fila.</span><button class="button button-primary" data-action="outbox-refresh">Carregar mensagens</button></div>` : `<div class="outbox-count-grid">${(["pending", "sent", "failed", "cancelled"] as OutboxStatus[]).map((status) => `<article class="outbox-count-card"><span>${escapeHtml(outboxStatusLabel(status))}</span><strong>${state.outboxCounts[status].toLocaleString("pt-BR")}</strong></article>`).join("")}</div>
      <div class="outbox-list-heading"><strong>Últimas ${state.outbox.length} de até ${state.outboxLimit} mensagens</strong><span>Ordenadas da mais recente para a mais antiga.</span></div>
      ${state.outbox.length ? `<div class="outbox-list">${state.outbox.map((message) => {
        const providerStatusLabel = outboxProviderStatusLabel(message.providerStatus);
        const providerStatusTime = message.providerStatusAt ?? (message.providerStatus === "accepted" ? message.sentAt : null);
        const providerStatusMeta = providerStatusLabel
          ? `<span>${escapeHtml(providerStatusLabel)}${providerStatusTime ? ` · ${new Date(providerStatusTime).toLocaleString("pt-BR")}` : ""}</span>`
          : message.sentAt ? `<span>Aceita ${new Date(message.sentAt).toLocaleString("pt-BR")}</span>` : "";
        const failureMessage = message.providerStatus === "failed"
          ? `A Meta reportou falha de entrega${message.providerErrorCode ? ` (código ${message.providerErrorCode})` : " (código não informado)"}.`
          : outboxErrorLabel(message.lastErrorCode);
        return `<article class="outbox-row"><div class="outbox-row-top"><span class="outbox-status-pill is-${escapeHtml(message.status)}">${escapeHtml(outboxStatusLabel(message.status))}</span><span>${escapeHtml(outboxTypeLabel(message.messageType))}</span><strong>Canal ${escapeHtml(message.channel)}</strong></div><div class="outbox-row-meta"><span>Criada ${new Date(message.createdAt).toLocaleString("pt-BR")}</span>${message.status === "pending" ? `<span>Disponível ${new Date(message.availableAt).toLocaleString("pt-BR")}</span>` : ""}${providerStatusMeta}</div>${message.status === "failed" ? `<p class="outbox-row-error">${escapeHtml(failureMessage)}</p>` : ""}</article>`;
      }).join("")}</div>` : `<div class="empty-state"><strong>Nenhuma mensagem na outbox</strong><span>Quando o webhook ou a separação gerar uma mensagem, ela aparecerá aqui.</span></div>`}`}`;
}

function integrationBlockerLabel(code: string): string {
  return ({
    BLING_CUSTOMER_CONTACT_MAPPING_MISSING: "Vincular o cliente ao contato do Bling",
    BLING_PAYMENT_FORM_MAPPING_MISSING: "Mapear a forma de pagamento",
    BLING_DUE_DATE_POLICY_MISSING: "Definir o vencimento da parcela",
    BLING_BASKET_ADJUSTMENT_RULE_UNRESOLVED: "Definir o tratamento fiscal do ajuste da cesta",
    BLING_TOTAL_RECONCILIATION_INVALID: "Revisar a conciliação do total comercial com as linhas",
    BLING_SALE_REFERENCE_OR_DATE_INVALID: "Revisar a referência ou data da prévia da venda",
    BLING_SALE_ADDRESS_INCOMPLETE: "Completar o endereço de entrega do pedido",
    BLING_SALE_PAYMENT_METHOD_UNSUPPORTED: "Revisar a forma de pagamento registrada no pedido",
    BLING_SALE_TOTALS_OR_ITEMS_INVALID: "Revisar itens e totais da prévia da venda",
    BLING_SALE_ITEM_MAPPING_INVALID: "Revisar vínculo Bling e dados comerciais de um ou mais itens",
    BLING_SHARED_CREDENTIALS_UNAVAILABLE: "A conexão compartilhada do Bling não está disponível no servidor",
  } as Record<string, string>)[code] ?? code;
}

function reconciliationOutcomeLabel(order: OrderDetailRecord): string {
  const reconciliation = order.integrationJob?.reconciliation;
  if (!reconciliation) return "";
  if (reconciliation.status === "running") return "Consulta somente leitura em andamento.";
  if (reconciliation.outcome === "absent") return "Consulta concluída: nenhuma venda encontrada para esta referência.";
  if (reconciliation.outcome === "matched") {
    return `Venda compatível localizada (ID ${reconciliation.externalId ?? "indisponível"}) e vinculada ao pedido.`;
  }
  if (reconciliation.outcome === "ambiguous") return "Mais de uma venda usa esta referência. Confira no Bling antes de qualquer nova tentativa.";
  return "A consulta foi inconclusiva. Confira no Bling antes de qualquer nova tentativa.";
}

function invoiceStatusLabel(status: OrderDetailRecord["invoiceStatus"]): string {
  return ({ not_requested: "Ainda não solicitada", pending: "Aguardando autorização", authorized: "Autorizada", rejected: "Rejeitada", unknown: "Estado incerto" })[status];
}

function ordersView(): string {
  if (state.access !== "authorized") return `<section class="workspace-heading"><div><span class="eyebrow">Operação</span><h1>Pedidos</h1><p>A fila exige uma sessão administrativa autorizada pelo servidor.</p></div></section><div class="empty-state"><strong>Acesso administrativo necessário</strong><span>Entre com o e-mail de uma conta administrativa ativa para consultar os pedidos.</span></div>`;
  const order = state.selectedOrder;
  if (order) {
    const pending = order.customerAcceptanceStatus === "pending";
    const address = order.deliveryAddress;
    const addressStreet = [address.street, address.number].filter(Boolean).join(", ");
    const addressComplement = [address.complement, address.neighborhood].filter(Boolean).join(" · ");
    const addressCity = [address.city, address.state].filter(Boolean).join(" / ");
    const addressPostalCode = address.postalCode ? `CEP ${address.postalCode}` : "";
    const addressLine = [addressStreet, addressComplement, addressCity, addressPostalCode].filter(Boolean).join(" · ");
    const totals = order.integrationJob?.commercialTotals;
    const adjustmentLabel = totals?.otherExpensesCents
      ? `Outras despesas +${money(totals.otherExpensesCents)}`
      : totals?.discountCents ? `Desconto −${money(totals.discountCents)}` : "Sem ajuste";
    const commercialPreview = totals
      ? `<span>Prévia de conciliação (sem envio): linhas ${money(totals.lineTotalCents)} · total aceito ${money(totals.acceptedTotalCents)} · ${escapeHtml(adjustmentLabel)}${totals.balances ? " · conciliado" : " · divergência"}</span>`
      : "";
    const salePreview = order.integrationJob?.salePreview;
    const salePreviewMarkup = salePreview
      ? `<span>Referência ${escapeHtml(salePreview.externalReference)} · data ${escapeHtml(salePreview.saleDate)} · ${salePreview.itemCount} item(ns) · ${escapeHtml(salePreview.paymentObservation)} · impressão digital ${salePreview.fingerprintReady ? "calculada no servidor" : "aguardando correções"}</span>`
      : "";
    const reconciliation = order.integrationJob?.reconciliation;
    const reconciliationMarkup = reconciliation
      ? `<span>${escapeHtml(reconciliationOutcomeLabel(order))}${reconciliation.completedAt ? ` · concluída em ${new Date(reconciliation.completedAt).toLocaleString("pt-BR")}` : ""}</span>`
      : "";
    const reconciliationAction = !order.blingSaleId && order.integrationJob?.reconciliationEnabled
      && (order.integrationJob.status === "blocked" || order.integrationJob.status === "unknown")
      ? `<button class="button button-soft" data-action="order-bling-reconcile" data-id="${escapeHtml(order.id)}" data-revision="${order.revision}">Consultar referência no Bling (GET)</button>`
      : "";
    const canRetrySale = !order.blingSaleId && (order.integrationJob?.status === "blocked" || order.integrationJob?.status === "failed"
      || order.integrationJob?.reconciliation?.outcome === "absent");
    const saleRetryAction = canRetrySale
      ? `<button class="button button-soft" data-action="order-bling-create" data-id="${escapeHtml(order.id)}" data-revision="${order.revision}">Tentar criar venda no Bling</button>`
      : "";
    const invoiceStatus = invoiceStatusLabel(order.invoiceStatus);
    const invoiceAction = order.blingSaleId && order.invoiceStatus !== "authorized"
      ? `<button class="button button-primary" data-action="order-invoice-generate" data-id="${escapeHtml(order.id)}" data-revision="${order.revision}" ${order.invoiceJob?.status === "running" ? "disabled" : ""}>${order.invoiceId ? "Consultar NF-e no Bling" : "Solicitar NF-e no Bling"}</button>`
      : "";
    const invoiceMarkup = order.blingSaleId
      ? `<div class="bling-invoice-summary"><strong>Venda Bling ${order.blingSaleId}</strong><span>NF-e: ${escapeHtml(invoiceStatus)}${order.invoiceId ? ` · ID ${order.invoiceId}` : ""}${order.invoiceJob?.invoiceNumber ? ` · nº ${escapeHtml(order.invoiceJob.invoiceNumber)}` : ""}</span>${order.invoiceJob?.errorCode ? `<small>Estado técnico: ${escapeHtml(order.invoiceJob.errorCode)}</small>` : ""}${order.invoiceJob?.danfeUrl ? `<a href="${escapeHtml(order.invoiceJob.danfeUrl)}" target="_blank" rel="noopener noreferrer">Abrir DANFE no Bling</a>` : ""}<p>Solicitar a NF-e requer confirmação digitada. O Bling ainda controla a autorização fiscal.</p>${invoiceAction}</div>`
      : `<div class="bling-invoice-summary"><strong>NF-e aguardando venda</strong><span>A venda é criada após a separação, desde que o pedido e o contato estejam válidos no Bling.</span></div>`;
    const dispatchMarkup = order.status === "invoice_authorized"
      ? `<section class="order-items-card delivery-operation"><div class="section-title"><div><span class="eyebrow">Expedição</span><h2>Pronto para sair</h2></div></div><p>A autorização da NF-e será consultada novamente no Bling antes do registro da saída.</p>${order.dispatchJob?.errorCode ? `<small class="delivery-operation-error">A última conferência não liberou a saída. Tente consultar novamente após revisar a NF-e no Bling.</small>` : ""}<button class="button button-primary" data-action="order-dispatch" data-id="${escapeHtml(order.id)}" data-revision="${order.revision}">Registrar saída para entrega</button></section>`
      : order.status === "out_for_delivery"
        ? `<section class="order-items-card delivery-operation"><div class="section-title"><div><span class="eyebrow">Expedição</span><h2>Saiu para entrega</h2></div></div><p>Saída registrada${order.dispatchedAt ? ` em ${new Date(order.dispatchedAt).toLocaleString("pt-BR")}` : ""}. Confirme abaixo quando entregar e receber o pagamento.</p><label>Forma recebida<select id="delivery-payment-method">${(["pix", "cash", "debit_card", "credit_card"] as const).map((method) => `<option value="${method}" ${(order.paymentMethod === method ? "selected" : "")}>${paymentMethodLabel(method)}</option>`).join("")}</select></label><p class="delivery-amount">Valor a receber: <strong>${money(order.totalCents)}</strong></p>${order.deliveryJob?.errorCode ? `<small class="delivery-operation-error">A última confirmação precisa ser revisada antes de repetir.</small>` : ""}<button class="button button-primary" data-action="order-delivery-complete" data-id="${escapeHtml(order.id)}" data-revision="${order.revision}">Confirmar entrega e recebimento</button></section>`
        : order.status === "completed"
          ? `<section class="order-items-card delivery-operation"><div class="section-title"><div><span class="eyebrow">Concluído</span><h2>Entrega e pagamento registrados</h2></div></div><p>${order.completedAt ? `Concluído em ${new Date(order.completedAt).toLocaleString("pt-BR")}. ` : ""}Recebido ${money(order.receivedPaymentCents ?? order.totalCents)} via ${escapeHtml(paymentMethodLabel(order.receivedPaymentMethod))}.</p></section>`
          : "";
    return `<section class="workspace-heading"><div><span class="eyebrow">Pedido · ${escapeHtml(order.id.slice(0, 8))}</span><h1>${escapeHtml(order.customerName)}</h1><p>${escapeHtml(order.basketName)} · ${escapeHtml(order.city)} · recebido ${new Date(order.createdAt).toLocaleString("pt-BR")}</p></div><div class="order-heading-actions"><button class="button button-soft" data-action="orders-back">← Fila</button><button class="button button-soft" data-action="orders-refresh">Atualizar</button></div></section>
      <div class="order-summary-grid"><article><span>Status</span><strong>${escapeHtml(orderStatusLabel(order.status))}</strong></article><article><span>Total confirmado</span><strong>${money(order.totalCents)}</strong></article><article><span>Canal / pagamento</span><strong>${escapeHtml(order.channel)} · ${escapeHtml(order.paymentMethod ?? "—")}</strong></article><article><span>Revisão</span><strong>${order.revision}</strong></article></div>
      <section class="order-items-card"><div class="section-title"><div><span class="eyebrow">Entrega</span><h2>Endereço confirmado</h2></div></div><p>${escapeHtml(addressLine || "Endereço não disponível")}</p>${address.reference ? `<small>Referência: ${escapeHtml(address.reference)}</small>` : ""}</section>
      ${pending ? `<div class="flow-safety-note"><strong>Aguardando aceite do cliente</strong><span>Há falta ou substituição pendente. A separação e o Bling ficam bloqueados até a resposta chegar pelo webhook.</span></div>` : ""}
      <section class="order-items-card"><div class="section-title"><div><span class="eyebrow">Integração Bling</span><h2>Vínculo do contato</h2></div><strong>${order.blingContactId ? `ID ${order.blingContactId} · conferido manualmente` : "Sem vínculo"}</strong></div><p>Informe o ID do contato e confirme que conferiu a identidade no painel Bling. Esta tela não consulta o Bling; o ID será salvo no cadastro privado do cliente.</p><form id="order-bling-contact-form"><label>ID do contato Bling<input name="bling_contact_id" type="number" min="1" max="9007199254740991" step="1" value="${order.blingContactId ?? ""}" required></label><label class="checkbox-label"><input name="customer_match_confirmed" type="checkbox" required> Conferi que este contato pertence a ${escapeHtml(order.customerName)}</label><button class="button button-soft" type="submit">${order.blingContactId ? "Atualizar vínculo" : "Salvar vínculo"}</button></form>${order.blingContactVerifiedAt ? `<small>Conferido em ${new Date(order.blingContactVerifiedAt).toLocaleString("pt-BR")}</small>` : ""}</section>
      ${["awaiting_invoice", "invoice_authorized"].includes(order.status) ? `<div class="flow-safety-note"><strong>Integração Bling · venda ${order.blingSaleId ? "confirmada" : escapeHtml(order.integrationJob?.status ?? "aguardando")}</strong><span>Ao concluir a separação, o servidor tenta criar a venda com a conexão Bling já usada pelo atendimento. O estoque negativo não bloqueia essa etapa. A NF-e só é solicitada mediante confirmação do operador.</span>${salePreviewMarkup}${commercialPreview}${reconciliationMarkup}${reconciliationAction}${saleRetryAction}<ul>${(order.integrationJob?.blockers ?? []).map((code) => `<li>${escapeHtml(integrationBlockerLabel(code))}</li>`).join("") || (!order.blingSaleId ? `<li>${order.integrationJob?.status === "unknown" ? "Reconcilie a referência no Bling antes de repetir." : canRetrySale ? "Revise os dados acima e confirme a tentativa manual." : "A venda aguarda o processamento no servidor."}</li>` : "")}</ul>${invoiceMarkup}</div>` : ""}
      ${dispatchMarkup}
      <section class="order-items-card"><div class="section-title"><div><span class="eyebrow">Separação</span><h2>Itens do pedido</h2></div>${!pending && ["received", "packing", "attention"].includes(order.status) ? `<button class="button button-soft" data-action="order-assign" data-id="${escapeHtml(order.id)}" data-revision="${order.revision}">Assumir separação</button>` : ""}</div>
      ${order.items.map((item) => `<form class="order-item-row" id="order-picking-item" data-item-id="${item.id}"><div class="order-item-main"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.brand)} · ${escapeHtml(item.presentation)} · ${item.quantity} pedida(s)</span><small>Separada(s): ${item.pickedQuantity} · ${escapeHtml(item.pickingStatus)}</small></div><label>Separar<input name="picked_quantity" type="number" min="0" max="${item.quantity}" step="1" value="${item.pickedQuantity}" required></label><label>Substituto<select name="replacement_product_id"><option value="">Sem substituição</option>${item.replacementOptions.filter((option) => option.id !== item.productId).map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.name)} · ${escapeHtml(option.brand)}</option>`).join("")}</select></label><button class="button button-soft" type="submit" ${pending || !["received", "packing", "attention"].includes(order.status) ? "disabled" : ""}>Salvar linha</button></form>`).join("") || `<div class="empty-state"><strong>Sem itens para separar</strong></div>`}
      <div class="order-footer-actions"><span>As faltas e substituições só alteram o total após o cliente aceitar.</span><button class="button button-primary" data-action="order-separation-complete" data-id="${escapeHtml(order.id)}" data-revision="${order.revision}" ${pending || !["received", "packing", "attention"].includes(order.status) ? "disabled" : ""}>Concluir separação e validar Bling</button></div></section>`;
  }
  return `<section class="workspace-heading"><div><span class="eyebrow">Operação · ${state.orders.length} em aberto</span><h1>Fila de pedidos</h1><p>Pedidos confirmados pelo cliente, organizados por chegada.</p></div><button class="button button-primary" data-action="orders-refresh">Atualizar fila</button></section>
    ${!state.ordersLoaded ? `<div class="empty-state"><strong>Carregue a fila autorizada</strong><span>A consulta usa a conexão privada do servidor.</span><button class="button button-primary" data-action="orders-refresh">Carregar pedidos</button></div>` : state.orders.length ? `<div class="order-queue">${state.orders.map((entry) => `<button class="order-queue-row" data-action="order-open" data-id="${escapeHtml(entry.id)}"><span class="order-queue-status">${escapeHtml(orderStatusLabel(entry.status))}</span><span><strong>${escapeHtml(entry.customerName)}</strong><small>${escapeHtml(entry.basketName)} · ${escapeHtml(entry.city)} · ${entry.itemCount} itens</small></span><strong>${money(entry.totalCents)}</strong><time>${new Date(entry.createdAt).toLocaleString("pt-BR")}</time></button>`).join("")}</div>` : `<div class="empty-state"><strong>Nenhum pedido em aberto</strong><span>Novas confirmações aparecerão nesta fila.</span></div>`}`;
}

function modalMarkup(): string {
  return `<dialog id="modal" class="modal"></dialog>`;
}

function render(): void {
  const selectedBasket = state.baskets.baskets.find((basket) => basket.id === state.selectedBasketId) ?? state.baskets.baskets[0];
  if (!selectedBasket && state.tab === "baskets") state.selectedBasketId = "";
  const flowsPanel = renderFlowsPanel({
    channel: state.flowChannel,
    basketId: state.flowBasketId,
    flowName: state.flowName,
    baskets: state.baskets.baskets,
    products: state.products.products,
    documents: state.flowDocuments,
    catalogRevision: state.catalogRevision,
    catalogDirty: isDirty(),
    authorized: state.access === "authorized",
    busy: state.busy || state.access === "loading",
    notice: "",
    noticeType: "info",
    productChoices: state.flowProductChoices,
    quantities: state.flowQuantities,
    metaChannel: state.metaChannels[state.flowChannel] ?? {
      channel: state.flowChannel, loaded: false, configured: false, accountName: null, blockers: [], flows: [],
      encryptionConfigured: false, endpointUri: null, bindingStoreReady: false, activeBinding: null,
    },
    selectedMetaFlowId: state.metaSelectedFlowIds[state.flowChannel] ?? "",
  });
  const customersPanel = renderCustomersPanel({
    customers: state.customers,
    loaded: state.customersLoaded,
    busy: state.busy || state.access === "loading",
    query: state.customerSearch,
    editor: state.customerEditor,
    authorized: state.access === "authorized",
  });
  const attendancePanel = renderAttendancePanel({
    authorized: state.access === "authorized",
    busy: state.busy || state.access === "loading",
    loaded: state.attendanceQueueLoaded,
    channel: state.attendanceChannel,
    accounts: state.attendanceAccounts,
    queue: state.attendanceQueue,
    selectedConversationId: state.attendanceSelectedConversationId,
    conversation: state.attendanceConversation,
    mediaPreviews: Object.fromEntries(state.attendanceMedia),
    mediaLoadingMessageId: state.attendanceMediaLoadingId,
    search: state.attendanceSearch,
    ana: state.attendanceAna,
    notice: state.attendanceNotice,
  });
  const identityLabel = state.session?.user.user_metadata?.user_name
    ?? state.session?.user.user_metadata?.preferred_username
    ?? state.session?.user.email
    ?? "Conta GitHub";
  const statusClass = state.access === "authorized" ? "is-authorized" : state.access === "denied" ? "is-denied" : "is-preview";

  appRoot.innerHTML = `<div class="app-shell">
    <header class="topbar"><a class="brand" href="#"><span class="brand-mark">DA</span><span><strong>Dona Antônia</strong><small>Atendimento WhatsApp</small></span></a>
      <div class="topbar-actions"><span class="access-status ${statusClass}"><i></i>${escapeHtml(accessLabel())}</span>${state.session ? `<span class="user-chip"><span class="user-avatar">${escapeHtml(String(identityLabel).slice(0, 1).toUpperCase())}</span>${escapeHtml(identityLabel)}</span><button class="button button-soft" data-action="sign-out">Sair</button>` : `<button class="button button-dark" data-action="sign-in" ${supabase ? "" : "disabled title=Configure%20Supabase%20em%20.env.local"}>Entrar</button>`}</div>
    </header>
    <div class="security-banner ${state.access === "authorized" ? "is-ready" : ""}"><span class="security-icon">${state.access === "authorized" ? "✓" : "⌑"}</span><span><strong>${state.access === "authorized" ? "Acesso confirmado pelo servidor" : escapeHtml(state.accessMessage)}</strong><small>${state.access === "authorized" ? `Sessão Supabase validada. Salvamentos usam a branch project/whatsapp-atendimento-github-20261025 quando o GitHub App do servidor está configurado${state.commitSha ? ` · revisão ${state.commitSha.slice(0, 7)}` : ""}.` : supabase ? "O acesso usa a conta Supabase já cadastrada como administradora; não há senha própria nem login GitHub separado." : "Configure Supabase no .env.local para habilitar o login; sem autorização do servidor, nenhuma gravação será aceita."}</small></span>${state.commitUrl ? `<a class="text-link" href="${escapeHtml(state.commitUrl)}" target="_blank" rel="noreferrer">Ver commit ↗</a>` : ""}</div>
    <div class="app-body"><aside class="main-nav"><div class="nav-label">CATÁLOGO</div><button class="nav-item ${state.tab === "products" ? "is-active" : ""}" data-action="tab" data-tab="products"><span class="nav-icon">▦</span> Produtos <span class="nav-count">${state.products.products.length}</span></button><button class="nav-item ${state.tab === "baskets" ? "is-active" : ""}" data-action="tab" data-tab="baskets"><span class="nav-icon">▤</span> Cestas <span class="nav-count">${state.baskets.baskets.length}</span></button><button class="nav-item ${state.tab === "flows" ? "is-active" : ""}" data-action="tab" data-tab="flows"><span class="nav-icon">⌁</span> Flows <span class="nav-count">${state.flowDocuments[state.flowChannel].drafts.length}</span></button><div class="nav-label nav-orders-label">OPERAÇÃO</div><button class="nav-item ${state.tab === "attendance" ? "is-active" : ""}" data-action="tab" data-tab="attendance"><span class="nav-icon">☏</span> Atendimento</button><button class="nav-item ${state.tab === "customers" ? "is-active" : ""}" data-action="tab" data-tab="customers"><span class="nav-icon">♙</span> Clientes ${state.customersLoaded ? `<span class="nav-count">${state.customers.length}</span>` : ""}</button><button class="nav-item ${state.tab === "orders" ? "is-active" : ""}" data-action="tab" data-tab="orders"><span class="nav-icon">▣</span> Pedidos <span class="nav-count">${state.orders.length}</span></button><button class="nav-item ${state.tab === "outbox" ? "is-active" : ""}" data-action="tab" data-tab="outbox"><span class="nav-icon">↗</span> Mensagens ${state.outboxLoaded ? `<span class="nav-count">${state.outboxCounts.pending + state.outboxCounts.failed}</span>` : ""}</button></aside>
      <main class="content"><div class="content-topline"><span>Administração</span><span class="breadcrumb-sep">/</span><strong>${state.tab === "products" ? "Produtos" : state.tab === "baskets" ? "Cestas" : state.tab === "flows" ? "Flows" : state.tab === "orders" ? "Pedidos" : state.tab === "customers" ? "Clientes" : state.tab === "attendance" ? "Atendimento" : "Mensagens WhatsApp"}</strong><span class="dirty-indicator ${isDirty() && !["orders", "outbox", "customers", "attendance"].includes(state.tab) ? "is-dirty" : ""}">${isDirty() && !["orders", "outbox", "customers", "attendance"].includes(state.tab) ? "Alterações pendentes" : "Tudo salvo"}</span></div>${!state.session && supabase ? `<section class="auth-card"><div><span class="eyebrow">Acesso ao Admin</span><h2>Entrar sem senha</h2><p>Enviaremos um link ao e-mail de uma conta administrativa ativa no Supabase.</p></div><form id="auth-form"><label for="auth-email">E-mail da conta<input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="254" value="${escapeHtml(state.authEmail)}" placeholder="voce@exemplo.com"></label><button class="button button-dark" type="submit" ${state.busy ? "disabled" : ""}>Enviar link de acesso</button></form>${state.authMessage ? `<small class="auth-feedback" role="status">${escapeHtml(state.authMessage)}</small>` : ""}</section>` : ""}${state.notice ? `<div class="notice notice-${state.noticeType}" role="status"><span>${escapeHtml(state.notice)}</span>${state.conflict ? `<div class="conflict-actions"><button class="text-button" data-action="export-draft">Baixar meu rascunho</button><button class="text-button" data-action="reload-catalog">Descartar e recarregar</button></div>` : ""}<button data-action="clear-notice" aria-label="Fechar">×</button></div>` : ""}${state.tab === "products" ? productsView() : state.tab === "baskets" ? selectedBasket ? basketEditor(selectedBasket) : `<div class="empty-state"><strong>Nenhuma cesta cadastrada</strong><span>Crie a primeira cesta para começar.</span><button class="button button-primary" data-action="new-basket">＋ Nova cesta</button></div>` : state.tab === "flows" ? flowsPanel : state.tab === "customers" ? customersPanel : state.tab === "outbox" ? outboxView() : state.tab === "attendance" ? attendancePanel : ordersView()}</main>
    </div>
    <footer class="page-footer"><span>Catálogo público versionado no GitHub</span><span>Dados pessoais e credenciais ficam fora deste projeto</span></footer>
    ${state.access === "authorized" && isDirty() && !["customers", "orders", "outbox", "attendance"].includes(state.tab) ? `<button class="floating-save" data-action="review-save"><span>Revisar alterações</span><strong>Salvar no GitHub ↗</strong></button>` : ""}
    ${modalMarkup()}
  </div>`;
  const locked = state.busy || state.access === "loading";
  appRoot.inert = locked;
  appRoot.setAttribute("aria-busy", String(locked));
}

function openModal(content: string, kind: "product" | "options" | "review" | "flow-review" | null = null): HTMLDialogElement {
  const modal = document.querySelector<HTMLDialogElement>("#modal");
  if (!modal) throw new Error("Janela de edição não encontrada.");
  state.modalKind = kind;
  modal.innerHTML = content;
  modal.showModal();
  return modal;
}

function priceInputValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

function openProductEditor(productId?: string): void {
  const product = productId ? state.products.products.find((item) => item.id === productId) : undefined;
  const id = product?.id ?? crypto.randomUUID();
  state.editorImageProductId = id;
  state.editorImage = state.pendingImages.get(id) ?? null;
  const source = product ? imageUrl(product) : "";
  const modal = openModal(`<form id="product-form" class="modal-card">
    <div class="modal-heading"><div><span class="eyebrow">${product ? "Editar cadastro" : "Novo cadastro"}</span><h2>${product ? "Produto" : "Adicionar produto"}</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div>
    <input type="hidden" name="product_id" value="${escapeHtml(id)}">
    <div class="product-form-layout"><div><label>Nome do produto<input name="name" required maxlength="160" value="${escapeHtml(product?.name ?? "")}"></label><div class="form-grid"><label>Marca<input name="brand" required maxlength="80" value="${escapeHtml(product?.brand ?? "")}"></label><label>Apresentação<input name="presentation" required maxlength="80" placeholder="Ex.: 500 g" value="${escapeHtml(product?.presentation ?? "")}"></label></div><div class="form-grid"><label>Preço unitário (R$)<input name="price" type="number" min="0" step="0.01" required value="${product ? priceInputValue(product.unitPriceCents) : "0.00"}"></label><label>Estoque no GitHub<input name="stock_quantity" type="number" step="1" value="${product?.stockQuantity ?? 0}" required><small>Saldo pode ficar negativo após uma confirmação.</small></label></div><small>O catálogo GitHub mantém e controla o saldo. A baixa ocorre quando o cliente confirma o pedido.</small><div class="form-grid"><label>SKU<input name="sku" maxlength="80" value="${escapeHtml(product?.sku ?? "")}"></label><label>GTIN / EAN<input name="gtin" maxlength="32" value="${escapeHtml(product?.gtin ?? "")}"></label></div><label>ID do Bling<input name="bling" maxlength="80" value="${escapeHtml(product?.blingProductId ?? "")}"></label>${product && !product.blingProductId && state.access === "authorized" ? isDirty() ? `<small>Grave as alterações pendentes do catálogo antes de consultar o GTIN no Bling.</small>` : `<div class="bling-product-lookup"><button type="button" class="button button-soft" data-action="lookup-bling-product" data-id="${escapeHtml(product.id)}">Buscar no Bling pelo GTIN salvo</button><small>A consulta usa o GTIN do catálogo no GitHub. Confira o nome e o SKU antes de selecionar; o vínculo só será gravado na revisão do catálogo.</small><div id="bling-lookup-results" aria-live="polite"></div></div>` : ""}<label class="checkbox-label"><input name="active" type="checkbox" ${product?.active ?? true ? "checked" : ""}> Produto ativo</label></div>
      <div class="image-editor"><div class="image-preview-box">${source ? `<img id="product-image-preview" src="${escapeHtml(source)}" alt="Prévia do produto">` : `<div class="image-empty" id="product-image-empty"><span>＋</span>Foto do produto</div>`}</div><label class="button button-soft upload-button">Escolher foto<input id="product-image-input" type="file" accept="image/*" hidden></label><small>Será convertida para WebP 240 × 190, até 27 KB.${product ? " A foto atual é mantida se você não selecionar outra." : " Selecione uma foto para cadastrar o produto."}</small><small id="image-feedback" role="status"></small></div></div>
    <div class="modal-actions"><button type="button" class="button button-soft" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Aplicar produto</button></div>
  </form>`, "product");
  modal.addEventListener("cancel", () => { state.editorImage = null; state.editorImageProductId = ""; }, { once: true });
}

function syncBasketFormToState(form: HTMLFormElement): void {
  const basket = state.baskets.baskets.find((item) => item.id === form.dataset.id);
  if (!basket) return;
  const values = new FormData(form);
  basket.name = String(values.get("basket_name") ?? basket.name).trim();
  basket.basePriceCents = Math.round(Number(values.get("basket_price")) * 100);
  basket.active = values.has("basket_active");
  basket.groups = basket.groups.map((group, index) => ({
    ...group,
    label: String(values.get(`group_label_${index}`) ?? group.label).trim(),
    category: String(values.get(`group_category_${index}`) ?? group.category).trim(),
    minimumQuantity: 0,
    initialQuantity: Number(values.get(`group_initial_${index}`)),
    maximumQuantity: 6,
    removalAllowed: true,
  }));
}

function openOptionEditor(groupIndex: number): void {
  const basket = state.baskets.baskets.find((item) => item.id === state.selectedBasketId);
  const group = basket?.groups[groupIndex];
  if (!group) return;
  state.optionEditor = { groupIndex, optionIds: uniqueInOrder(group.productIds), search: "" };
  renderOptionModal();
}

function renderOptionModal(): void {
  const editor = state.optionEditor;
  if (!editor) return;
  const basket = state.baskets.baskets.find((item) => item.id === state.selectedBasketId);
  const group = basket?.groups[editor.groupIndex];
  if (!group) return;
  const modal = document.querySelector<HTMLDialogElement>("#modal");
  if (!modal) return;
  state.modalKind = "options";
  const query = editor.search.trim().toLocaleLowerCase("pt-BR");
  const products = state.products.products.filter((product) =>
    (product.active || editor.optionIds.includes(product.id))
    && (!query || `${product.name} ${product.brand} ${product.sku ?? ""}`.toLocaleLowerCase("pt-BR").includes(query))
  );
  modal.innerHTML = `<div class="modal-card options-modal"><div class="modal-heading"><div><span class="eyebrow">${escapeHtml(basket.name)} · ${escapeHtml(group.label)}</span><h2>Opções deste tipo</h2></div><button type="button" class="icon-button" data-action="close-options" aria-label="Fechar">×</button></div>
    <p class="modal-intro">A ordem abaixo será exibida no atendimento. IDs repetidos do catálogo inicial aparecem uma vez e só mudam quando você confirmar a lista.</p>
    <div class="option-picker"><div class="option-list"><div class="form-label">Adicionar produto</div><label class="search-field"><span>⌕</span><input id="option-search" type="search" value="${escapeHtml(editor.search)}" placeholder="Buscar produto"></label><div class="option-results">${products.map((product) => `<button class="option-result" data-action="toggle-option" data-id="${escapeHtml(product.id)}"><span>${editor.optionIds.includes(product.id) ? "✓" : "+"}</span><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.brand)} · ${money(product.unitPriceCents)}</small></span></button>`).join("") || `<span class="subtle">Nenhum produto encontrado.</span>`}</div></div>
      <div class="ordered-options"><strong>Ordem selecionada (${editor.optionIds.length})</strong><ol>${editor.optionIds.map((id, index) => `<li><span>${escapeHtml(productName(id))}</span><div class="drag-order"><button class="icon-button compact" aria-label="Mover opção para cima" data-action="move-option" data-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button><button class="icon-button compact" aria-label="Mover opção para baixo" data-action="move-option" data-index="${index}" data-direction="1" ${index === editor.optionIds.length - 1 ? "disabled" : ""}>↓</button><button class="icon-button compact danger" aria-label="Remover opção" data-action="remove-option" data-index="${index}">×</button></div></li>`).join("") || `<li class="subtle">Nenhuma opção adicionada.</li>`}</ol></div></div>
    <div class="modal-actions"><button type="button" class="button button-soft" data-action="close-options">Cancelar</button><button type="button" class="button button-primary" data-action="apply-options">Aplicar opções</button></div></div>`;
  if (!modal.open) modal.showModal();
}

function newGroupId(basket: Basket): string {
  const root = `${slug(basket.id)}-tipo-${basket.groups.length + 1}`;
  const used = new Set(basket.groups.map((group) => group.id));
  let candidate = root;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${root}-${suffix++}`;
  return candidate;
}

function newGroup(basket: Basket): BasketProductGroup {
  const firstActive = state.products.products.find((product) => product.active)?.id;
  return {
    id: newGroupId(basket), label: "Novo tipo", category: "Alimentos",
    productIds: firstActive ? [firstActive] : [], minimumQuantity: 0,
    maximumQuantity: 6, initialQuantity: 1, removalAllowed: true,
  };
}

function reorder<T>(items: T[], index: number, direction: number): T[] {
  const next = items.slice();
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function reviewChanges(): string {
  const baseline = JSON.parse(state.baseline) as CatalogDocuments;
  const changes = (before: Array<{ id: string }>, after: Array<{ id: string }>) => {
    const beforeIds = new Set(before.map((item) => item.id));
    const afterIds = new Set(after.map((item) => item.id));
    return {
      added: [...afterIds].filter((id) => !beforeIds.has(id)).length,
      removed: [...beforeIds].filter((id) => !afterIds.has(id)).length,
      updated: after.filter((item) => beforeIds.has(item.id) && JSON.stringify(item) !== JSON.stringify(before.find((entry) => entry.id === item.id))).length,
    };
  };
  const products = changes(baseline.products.products, state.products.products);
  const baskets = changes(baseline.baskets.baskets, state.baskets.baskets);
  return `<div class="review-summary"><div><span>Produtos adicionados</span><strong>${products.added}</strong></div><div><span>Produtos editados</span><strong>${products.updated}</strong></div><div><span>Produtos removidos</span><strong>${products.removed}</strong></div><div><span>Cestas alteradas</span><strong>${baskets.added + baskets.updated + baskets.removed}</strong></div></div>${state.pendingImages.size ? `<p class="inline-note">${state.pendingImages.size} nova(s) foto(s) WebP também fará(ão) parte do commit.</p>` : ""}`;
}

async function reloadCatalog(session: Session): Promise<void> {
  state.access = "loading";
  state.outboxLoaded = false;
  state.outbox = [];
  state.outboxCounts = { pending: 0, sent: 0, failed: 0, cancelled: 0 };
  state.outboxLimit = 50;
  state.outboxSenderEnabled = false;
  state.accessMessage = "Validando sua identidade e a autorização do servidor.";
  render();
  try {
    const [snapshot, flow0975, flow1018] = await Promise.all([
      getCatalog(session.access_token),
      getFlowDraft(session.access_token, "0975"),
      getFlowDraft(session.access_token, "1018"),
    ]);
    state.products = snapshot.products;
    state.baskets = snapshot.baskets;
    state.commitSha = snapshot.commitSha;
    state.commitUrl = snapshot.commitUrl;
    state.catalogRevision = snapshot.catalogRevision;
    state.flowDocuments = { "0975": flow0975.document, "1018": flow1018.document };
    state.baseline = JSON.stringify(currentDocuments());
    state.conflict = false;
    state.access = "authorized";
    state.accessMessage = "Sua sessão Supabase foi validada como proprietário ativo.";
    if (!state.baskets.baskets.some((basket) => basket.id === state.selectedBasketId)) {
      state.selectedBasketId = state.baskets.baskets[0]?.id ?? "";
    }
    if (!state.baskets.baskets.some((basket) => basket.id === state.flowBasketId && basket.active)) {
      state.flowBasketId = state.baskets.baskets.find((basket) => basket.active)?.id ?? "";
    }
    const savedFlow = state.flowDocuments[state.flowChannel].drafts.find((draft) => draft.basketId === state.flowBasketId);
    const selectedFlowBasket = state.baskets.baskets.find((basket) => basket.id === state.flowBasketId);
    state.flowName = savedFlow?.flowName ?? (selectedFlowBasket ? flowNameForBasket(selectedFlowBasket) : "cesta-atendimento");
    state.flowProductChoices.clear();
    state.flowQuantities.clear();
    render();
  } catch (error) {
    state.access = "denied";
    state.accessMessage = error instanceof AdminApiError ? error.message : "Não foi possível validar o acesso no servidor.";
    render();
  }
}

async function initializeAuth(): Promise<void> {
  if (!supabase) {
    state.accessMessage = "Prévia local: configure Supabase no .env.local para habilitar o link de acesso.";
    render();
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    state.session = data.session;
    await reloadCatalog(data.session);
  } else {
    render();
  }
  supabase.auth.onAuthStateChange((event, session) => {
    const hadSession = Boolean(state.session);
    state.session = session;
    if (session) {
      if (event === "SIGNED_IN" && (!hadSession || state.access !== "authorized")) void reloadCatalog(session);
      return;
    } else {
      state.access = "preview";
      state.accessMessage = "Prévia local: entre com o link enviado ao e-mail de uma conta administrativa ativa.";
      state.commitSha = "";
      state.catalogRevision = "";
      state.commitUrl = "";
      state.products = structuredClone(initialDocuments.products);
      state.baskets = structuredClone(initialDocuments.baskets);
      state.baseline = JSON.stringify(initialDocuments);
      state.flowDocuments = structuredClone(initialFlowDocuments);
      state.flowProductChoices.clear();
      state.flowQuantities.clear();
      state.flowReviewDocument = null;
      state.pendingImages.clear();
      state.editorImage = null;
      state.editorImageProductId = "";
      state.outboxLoaded = false;
      state.outbox = [];
      state.outboxCounts = { pending: 0, sent: 0, failed: 0, cancelled: 0 };
      state.outboxLimit = 50;
      state.outboxSenderEnabled = false;
      state.attendanceAccounts = [];
      state.attendanceQueue = [];
      state.attendanceQueueLoaded = false;
      state.attendanceSelectedConversationId = "";
      state.attendanceConversation = null;
      clearAttendanceMedia();
      render();
    }
  });
}

function openReviewModal(): void {
  const errors = validateCatalog(currentDocuments());
  if (errors.length) {
    tell(`Não é possível salvar: ${errors.slice(0, 3).join(" · ")}`, "error");
    return;
  }
  openModal(`<div class="modal-card review-modal"><div class="modal-heading"><div><span class="eyebrow">Revisão antes do commit</span><h2>Salvar catálogo?</h2></div><button class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div><p>O GitHub criará um commit no branch do projeto. O histórico do catálogo ficará associado à revisão atual.</p>${reviewChanges()}<div class="review-target"><span>Destino</span><strong>osvaldosereia/SUCEDOAN12</strong><code>project/whatsapp-atendimento-github-20261025</code></div><div class="modal-actions"><button class="button button-soft" data-action="close-modal">Voltar à edição</button><button class="button button-primary" data-action="confirm-save">Confirmar e gravar</button></div></div>`, "review");
}

async function performSave(): Promise<void> {
  if (state.access !== "authorized" || !state.session || !state.commitSha) {
    tell("A gravação exige uma sessão e autorização confirmadas pelo servidor.", "error");
    return;
  }
  const errors = validateCatalog(currentDocuments());
  if (errors.length) {
    tell(`Revise o catálogo: ${errors.slice(0, 3).join(" · ")}`, "error");
    return;
  }
  state.busy = true;
  render();
  try {
    const snapshot = await saveCatalog(state.session.access_token, {
      expectedCommit: state.commitSha,
      products: state.products,
      baskets: state.baskets,
      ...(state.pendingImages.size ? {
        images: [...state.pendingImages.values()].map(({ productId, contentBase64 }) => ({ productId, contentBase64 })),
      } : {}),
    });
    state.products = snapshot.products;
    state.baskets = snapshot.baskets;
    state.commitSha = snapshot.commitSha;
    state.catalogRevision = snapshot.catalogRevision;
    state.commitUrl = snapshot.commitUrl;
    state.baseline = JSON.stringify(currentDocuments());
    state.pendingImages.clear();
    state.editorImage = null;
    state.editorImageProductId = "";
    state.conflict = false;
    state.notice = `Catálogo gravado no commit ${snapshot.commitSha.slice(0, 7)}.`;
    state.noticeType = "success";
  } catch (error) {
    const message = error instanceof AdminApiError ? error.message : "Falha ao gravar o catálogo.";
    state.notice = message;
    state.noticeType = "error";
    state.conflict = error instanceof AdminApiError && error.status === 409;
  } finally {
    state.busy = false;
    state.optionEditor = null;
    render();
  }
}

async function convertImage(file: File): Promise<{ contentBase64: string; previewUrl: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Escolha uma imagem de até 10 MB para preparar a foto.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 190;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a foto neste navegador.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  bitmap.close();

  let blob: Blob | null = null;
  for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58, 0.5]) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= 27 * 1024) break;
  }
  if (!blob || blob.type !== "image/webp" || blob.size > 27 * 1024) {
    throw new Error("A foto não coube no limite de 27 KB. Escolha uma imagem mais simples.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler a foto."));
    reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
    reader.readAsDataURL(blob);
  });
  return { contentBase64: dataUrl.split(",", 2)[1], previewUrl: dataUrl };
}

appRoot.addEventListener("input", (event) => {
  if (state.busy) return;
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === "auth-email") state.authEmail = target.value;
  if (target instanceof HTMLInputElement && target.id === "flow-name") state.flowName = target.value;
  if (target instanceof HTMLInputElement && target.id === "product-search") {
    state.search = target.value;
    const cursor = target.selectionStart;
    render();
    const search = document.querySelector<HTMLInputElement>("#product-search");
    search?.focus();
    if (cursor !== null) search?.setSelectionRange(cursor, cursor);
  }
  if (target instanceof HTMLInputElement && target.id === "option-search" && state.optionEditor) {
    state.optionEditor.search = target.value;
    renderOptionModal();
    const search = document.querySelector<HTMLInputElement>("#option-search");
    search?.focus();
    search?.setSelectionRange(target.value.length, target.value.length);
  }
});

appRoot.addEventListener("change", async (event) => {
  if (state.busy) return;
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.dataset.flowProduct !== undefined) {
    const groupIndex = Number(target.dataset.flowProduct);
    const basket = selectedFlowBasket();
    const group = basket?.groups[groupIndex];
    if (!basket || !group) return;
    const productKey = `${basket.id}:${flowProductField(groupIndex)}`;
    const quantityKey = `${basket.id}:${flowQuantityField(groupIndex)}`;
    state.flowProductChoices.set(productKey, target.value);
    state.flowQuantities.set(quantityKey, target.value === FLOW_NO_PRODUCT_ID
      ? 0
      : Math.min(6, Math.max(1, group.initialQuantity || 1)));
    render();
    return;
  }
  if (target instanceof HTMLSelectElement && target.dataset.flowQuantity !== undefined) {
    const groupIndex = Number(target.dataset.flowQuantity);
    const basket = selectedFlowBasket();
    if (!basket?.groups[groupIndex]) return;
    state.flowQuantities.set(`${basket.id}:${flowQuantityField(groupIndex)}`, Number(target.value));
    render();
    return;
  }
  if (target instanceof HTMLSelectElement && target.id === "meta-flow-select") {
    state.metaSelectedFlowIds[state.flowChannel] = target.value;
    render();
    return;
  }
  if (target instanceof HTMLSelectElement && target.id === "flow-basket") {
    state.flowBasketId = target.value;
    const saved = state.flowDocuments[state.flowChannel].drafts.find((draft) => draft.basketId === target.value);
    const selected = state.baskets.baskets.find((basket) => basket.id === target.value);
    state.flowName = saved?.flowName ?? (selected ? flowNameForBasket(selected) : "cesta-atendimento");
    state.flowProductChoices.clear();
    state.flowQuantities.clear();
    render();
    return;
  }
  if (!(target instanceof HTMLInputElement) || target.id !== "product-image-input") return;
  const file = target.files?.[0];
  const form = target.closest("#product-form");
  const id = form?.querySelector<HTMLInputElement>("[name=product_id]")?.value;
  if (!file || !id) return;
  try {
    const converted = await convertImage(file);
    state.editorImage = { productId: id, contentBase64: converted.contentBase64, previewUrl: converted.previewUrl };
    const preview = document.querySelector<HTMLImageElement>("#product-image-preview");
    if (preview) preview.src = converted.previewUrl;
    else document.querySelector("#product-image-empty")?.replaceWith(Object.assign(document.createElement("img"), { id: "product-image-preview", src: converted.previewUrl, alt: "Prévia do produto" }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar a foto.";
    const feedback = document.querySelector<HTMLElement>("#image-feedback");
    if (feedback) feedback.textContent = message;
    else tell(message, "error");
  }
});

appRoot.addEventListener("submit", async (event) => {
  if (state.busy) return;
  const target = event.target;
  if (!(target instanceof HTMLFormElement)) return;
  if (target.id === "auth-form") {
    event.preventDefault();
    if (!supabase) return;
    const email = String(new FormData(target).get("email") ?? "").trim().toLowerCase();
    if (!email) return;
    state.authEmail = email;
    state.authMessage = "";
    state.busy = true;
    render();
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        },
      });
      if (error) throw error;
      state.authMessage = "Se o endereço pertence a uma conta administrativa ativa, o link de acesso foi enviado.";
    } catch {
      state.authMessage = "Não foi possível enviar o link. Confira o e-mail e tente novamente.";
    } finally {
      state.busy = false;
      render();
    }
    return;
  }
  if (target.id === "attendance-search-form") {
    event.preventDefault();
    state.attendanceSearch = String(new FormData(target).get("query") ?? "").trim().slice(0, 80);
    state.attendanceSelectedConversationId = "";
    state.attendanceConversation = null;
    clearAttendanceMedia();
    await loadAttendance();
    return;
  }
  if (target.id === "attendance-send-form") {
    event.preventDefault();
    if (!state.session || !state.attendanceSelectedConversationId) return;
    const message = String(new FormData(target).get("text") ?? "").trim();
    if (!message) return;
    const conversationId = state.attendanceSelectedConversationId;
    const account = state.attendanceAccounts.find((item) => attendanceChannelFromPhone(item.phone_e164) === state.attendanceChannel);
    if (!account) return;
    if (state.attendanceSendKey?.conversationId !== conversationId || state.attendanceSendKey.text !== message) {
      state.attendanceSendKey = { conversationId, text: message, key: `att:${crypto.randomUUID()}` };
    }
    state.busy = true;
    state.attendanceNotice = "Enviando pela conexão existente, sujeita aos gates do canal…";
    render();
    try {
      const result = await sendAttendanceText(state.session.access_token, {
        conversationId,
        accountId: account.id,
        text: message,
        idempotencyKey: state.attendanceSendKey.key,
      });
      if (result.ok !== true) throw new AdminApiError(String(result.error ?? "O canal não aceitou a resposta."));
      state.attendanceSendKey = null;
      state.attendanceConversation = await getAttendanceConversation(state.session.access_token, conversationId, account.id);
      state.attendanceQueue = await getAttendanceQueue(state.session.access_token, account.id, state.attendanceSearch);
      state.attendanceNotice = "Resposta aceita pelo serviço de atendimento. Confira o estado da mensagem na conversa.";
      target.reset();
    } catch (error) {
      state.attendanceNotice = error instanceof AdminApiError ? error.message : "Não foi possível enviar a resposta. Repetir mantém a mesma chave de idempotência.";
    } finally {
      state.busy = false;
      render();
    }
    return;
  }
  if (target.id === "customer-search-form") {
    event.preventDefault();
    await loadCustomers(String(new FormData(target).get("query") ?? ""));
    return;
  }
  if (target.id === "customer-form") {
    event.preventDefault();
    if (!state.session) return;
    const values = new FormData(target);
    const addresses = [...target.querySelectorAll<HTMLElement>(".customer-address")].map((element) => {
      const index = Number(element.dataset.index);
      return {
        ...(values.get(`address_id_${index}`) ? { id: String(values.get(`address_id_${index}`)) } : {}),
        label: String(values.get(`address_label_${index}`) ?? "").trim() || null,
        street: String(values.get(`address_street_${index}`) ?? "").trim(),
        number: String(values.get(`address_number_${index}`) ?? "").trim(),
        complement: String(values.get(`address_complement_${index}`) ?? "").trim() || null,
        neighborhood: String(values.get(`address_neighborhood_${index}`) ?? "").trim(),
        city: String(values.get(`address_city_${index}`) ?? "").trim(),
        state: String(values.get(`address_state_${index}`) ?? "").trim().toUpperCase(),
        postalCode: String(values.get(`address_postal_${index}`) ?? "").trim(),
        reference: String(values.get(`address_reference_${index}`) ?? "").trim() || null,
        isDefault: values.has(`address_default_${index}`),
        isActive: values.has(`address_active_${index}`),
      };
    });
    const customer: CustomerRecord = {
      id: target.dataset.id || null,
      name: String(values.get("customer_name") ?? "").trim(),
      cpfCnpj: String(values.get("customer_document") ?? "").trim() || null,
      phoneE164: String(values.get("customer_phone") ?? "").trim(),
      preferredReply: String(values.get("customer_preferred_reply") ?? "auto") as CustomerRecord["preferredReply"],
      isActive: values.has("customer_active"),
      addresses,
    };
    state.busy = true;
    render();
    try {
      const saved = await saveCustomer(state.session.access_token, customer);
      const result = await getCustomers(state.session.access_token, state.customerSearch);
      state.customerEditor = null;
      state.customers = result.customers;
      state.customersLoaded = true;
      state.notice = `Cadastro ${saved.name} salvo no Supabase privado.`;
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível salvar o cadastro do cliente.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
    return;
  }
  if (target.id === "order-picking-item") {
    event.preventDefault();
    if (!state.session || !state.selectedOrder) return;
    const values = new FormData(target);
    const pickedQuantity = Number(values.get("picked_quantity"));
    if (!Number.isSafeInteger(pickedQuantity) || pickedQuantity < 0) {
      tell("Informe uma quantidade inteira separada.", "error");
      return;
    }
    state.busy = true;
    render();
    try {
      state.selectedOrder = await saveOrderPicking(state.session.access_token, state.selectedOrder.id, {
        revision: state.selectedOrder.revision,
        itemId: Number(target.dataset.itemId),
        pickedQuantity,
        ...(values.get("replacement_product_id") ? { replacementProductId: String(values.get("replacement_product_id")) } : {}),
      });
      const result = await getOrders(state.session.access_token);
      state.orders = result.orders;
      state.notice = state.selectedOrder.customerAcceptanceStatus === "pending"
        ? "A proposta de alteração foi cifrada e entrou na outbox aguardando o cliente."
        : "Separação da linha atualizada.";
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível salvar a separação.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
    return;
  }
  if (target.id === "order-bling-contact-form") {
    event.preventDefault();
    if (!state.session || !state.selectedOrder) return;
    const values = new FormData(target);
    const blingContactId = Number(values.get("bling_contact_id"));
    if (!Number.isSafeInteger(blingContactId) || blingContactId <= 0 || !values.has("customer_match_confirmed")) {
      tell("Informe um ID válido e confirme que conferiu a identidade do contato.", "error");
      return;
    }
    state.busy = true;
    render();
    try {
      state.selectedOrder = await saveOrderBlingContact(state.session.access_token, state.selectedOrder.id, {
        revision: state.selectedOrder.revision,
        blingContactId,
        customerMatchConfirmed: true,
      });
      state.notice = "Vínculo de contato salvo e conferido manualmente. Nenhuma chamada ao Bling foi feita.";
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível salvar o vínculo do contato.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
    return;
  }
  if (target.id === "product-form") {
    event.preventDefault();
    const values = new FormData(target);
    const id = String(values.get("product_id"));
    const previous = state.products.products.find((product) => product.id === id);
    if (!previous && state.pendingImages.get(id)?.productId !== id && state.editorImage?.productId !== id) {
      const feedback = document.querySelector<HTMLElement>("#image-feedback");
      if (feedback) feedback.textContent = "Escolha uma foto para cadastrar o produto.";
      return;
    }
    const price = Number(values.get("price"));
    const stockQuantity = Number(values.get("stock_quantity"));
    if (!Number.isFinite(price) || price < 0) {
      tell("Informe um preço válido em reais.", "error");
      return;
    }
    if (!Number.isSafeInteger(stockQuantity)) {
      tell("Informe um saldo inteiro seguro.", "error");
      return;
    }
    const product: Product = {
      id,
      name: String(values.get("name") ?? "").trim(),
      brand: String(values.get("brand") ?? "").trim(),
      presentation: String(values.get("presentation") ?? "").trim(),
      unitPriceCents: Math.round(price * 100),
      stockQuantity,
      imagePath: `images/products/${id}.webp`,
      sku: String(values.get("sku") ?? "").trim() || null,
      gtin: String(values.get("gtin") ?? "").trim() || null,
      blingProductId: String(values.get("bling") ?? "").trim() || null,
      active: values.has("active"),
    };
    const list = state.products.products.slice();
    const index = list.findIndex((item) => item.id === id);
    if (index >= 0) list[index] = product;
    else list.push(product);
    state.products = { ...state.products, products: list };
    if (state.editorImage?.productId === id) state.pendingImages.set(id, state.editorImage);
    state.editorImage = null;
    state.editorImageProductId = "";
    const modal = document.querySelector<HTMLDialogElement>("#modal");
    state.modalKind = null;
    modal?.close();
    state.notice = "Produto aplicado à prévia.";
    state.noticeType = "info";
    render();
  }
  if (target.id === "basket-form") {
    event.preventDefault();
    syncBasketFormToState(target);
    const errors = validateCatalog(currentDocuments());
    if (errors.length) tell(`Revise a cesta: ${errors.slice(0, 3).join(" · ")}`, "error");
    else tell("Cesta aplicada à prévia.", "info");
    render();
  }
});

appRoot.addEventListener("click", async (event) => {
  if (state.busy) return;
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]") : null;
  if (!target || target.hasAttribute("disabled")) return;
  const action = target.dataset.action;
  const id = target.dataset.id ?? "";
  const index = Number(target.dataset.index);
  const direction = Number(target.dataset.direction);
  const basketForm = document.querySelector<HTMLFormElement>("#basket-form");

  if (action === "sign-in") {
    const emailInput = document.querySelector<HTMLInputElement>("#auth-email");
    emailInput?.scrollIntoView({ behavior: "smooth", block: "center" });
    emailInput?.focus({ preventScroll: true });
  } else if (action === "sign-out") {
    if (isDirty() && !window.confirm("Sair descartará as alterações desta prévia. Deseja continuar?")) return;
    await supabase?.auth.signOut();
  } else if (action === "tab") {
    const nextTab = target.dataset.tab;
    state.tab = nextTab === "baskets" || nextTab === "flows" || nextTab === "orders" || nextTab === "outbox" || nextTab === "customers" || nextTab === "attendance" ? nextTab : "products";
    state.notice = "";
    render();
    if (state.tab === "orders" && !state.ordersLoaded && state.access === "authorized") await loadOrders();
    if (state.tab === "outbox" && !state.outboxLoaded && state.access === "authorized") await loadOutbox();
    if (state.tab === "customers" && !state.customersLoaded && state.access === "authorized") await loadCustomers("");
    if (state.tab === "attendance" && !state.attendanceQueueLoaded && state.access === "authorized") await loadAttendance();
    if (state.tab === "flows" && !state.metaChannels[state.flowChannel] && state.access === "authorized") await refreshMetaFlows();
  } else if (action === "customer-new") {
    state.customerEditor = emptyCustomer();
    state.notice = "";
    render();
  } else if (action === "customer-edit" && state.session) {
    state.busy = true;
    render();
    try {
      state.customerEditor = await getCustomer(state.session.access_token, id);
      state.notice = "";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível abrir o cadastro.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "customer-cancel-edit") {
    state.customerEditor = null;
    render();
  } else if (action === "customer-add-address") {
    const list = document.querySelector<HTMLElement>("#customer-address-list");
    if (!list) return;
    const addresses = [...list.querySelectorAll<HTMLElement>(".customer-address")];
    const index = Math.max(-1, ...addresses.map((item) => Number(item.dataset.index))) + 1;
    const firstDefault = !addresses.some((item) => item.querySelector<HTMLInputElement>('input[name^="address_default_"]')?.checked);
    const element = document.createElement("div");
    element.innerHTML = renderCustomerAddressEditor({
      label: "", street: "", number: "", complement: null, neighborhood: "", city: "", state: "", postalCode: "", reference: null,
      isDefault: firstDefault, isActive: true,
    }, index);
    list.append(element.firstElementChild!);
  } else if (action === "customer-remove-address") {
    target.closest(".customer-address")?.remove();
  } else if (action === "orders-refresh") {
    await loadOrders();
  } else if (action === "outbox-refresh") {
    await loadOutbox();
  } else if (action === "attendance-refresh") {
    await loadAttendance();
  } else if (action === "attendance-channel") {
    const channel = target.dataset.channel;
    if (FLOW_CHANNELS.includes(channel as FlowChannel)) await selectAttendanceChannel(channel as AttendanceChannel);
  } else if (action === "attendance-open") {
    await openAttendanceConversation(id);
  } else if (action === "attendance-load-media" && state.session && state.attendanceConversation
    && state.attendanceSelectedConversationId && !state.attendanceMediaLoadingId) {
    const conversationId = state.attendanceSelectedConversationId;
    const channel = state.attendanceChannel;
    const messageId = id;
    const messages = Array.isArray(state.attendanceConversation.messages) ? state.attendanceConversation.messages : [];
    const message = messages.find((item) => item.id === messageId);
    if (!message || !["image", "audio", "video", "document", "sticker"].includes(String(message.message_type ?? "").toLowerCase())) return;
    const account = state.attendanceAccounts.find((item) => attendanceChannelFromPhone(item.phone_e164) === channel);
    if (!account) return;
    const accessToken = state.session.access_token;
    state.attendanceMediaLoadingId = messageId;
    state.attendanceNotice = "Solicitando prévia temporária do anexo…";
    render();
    try {
      const preview = await getAttendanceMedia(accessToken, conversationId, account.id, messageId);
      if (state.attendanceSelectedConversationId !== conversationId || state.attendanceChannel !== channel) {
        URL.revokeObjectURL(preview.url);
        return;
      }
      const oldPreview = state.attendanceMedia.get(messageId);
      if (oldPreview) revokeAttendanceMedia(messageId);
      state.attendanceMedia.set(messageId, preview);
      const expiryTimer = window.setTimeout(() => {
        if (state.attendanceMedia.get(messageId) === preview) {
          revokeAttendanceMedia(messageId);
          render();
        }
      }, Math.max(0, Date.parse(preview.expires_at) - Date.now()));
      state.attendanceMediaExpiryTimers.set(messageId, expiryTimer);
      state.attendanceNotice = "Prévia do anexo disponível temporariamente.";
    } catch (error) {
      if (state.attendanceSelectedConversationId !== conversationId || state.attendanceChannel !== channel) return;
      state.attendanceNotice = error instanceof AdminApiError ? error.message : "Não foi possível abrir este anexo.";
    } finally {
      if (state.attendanceMediaLoadingId === messageId) {
        state.attendanceMediaLoadingId = "";
        render();
      }
    }
  } else if ((action === "attendance-takeover" || action === "attendance-resume") && state.session) {
    const account = state.attendanceAccounts.find((item) => attendanceChannelFromPhone(item.phone_e164) === state.attendanceChannel);
    if (!account) return;
    if (action === "attendance-takeover" && target.dataset.assignment === "other"
      && !window.confirm("Esta conversa está atribuída a outra pessoa. Assumir transfere o atendimento para você. Continuar?")) return;
    if (action === "attendance-resume" && !window.confirm("Liberar a conversa para a ANA? O atendimento automático poderá responder conforme as regras e os gates ativos.")) return;
    state.busy = true;
    state.attendanceNotice = action === "attendance-resume" ? "Retomando atendimento ANA…" : "Assumindo a conversa…";
    render();
    try {
      const result = await setAttendanceMode(state.session.access_token, id, account.id, action === "attendance-resume" ? "ai" : "human");
      if (result.ok === false) throw new AdminApiError(String(result.error ?? "O modo não foi alterado."));
      await refreshAttendanceConversation();
      state.attendanceNotice = action === "attendance-resume" ? "A conversa foi liberada para a ANA." : "Conversa atribuída ao atendimento humano.";
    } catch (error) {
      state.attendanceNotice = error instanceof AdminApiError ? error.message : "Não foi possível alterar o modo da conversa.";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "attendance-toggle-ana" && state.session) {
    const accountId = target.dataset.account ?? "";
    const enabled = target.dataset.enabled === "true";
    const selectedAccount = state.attendanceAccounts.find((item) => item.id === accountId && attendanceChannelFromPhone(item.phone_e164) === state.attendanceChannel);
    if (!selectedAccount || !window.confirm(`${enabled ? "Ativar" : "Desligar"} a ANA para o número final ${state.attendanceChannel}?`)) return;
    state.busy = true;
    state.attendanceNotice = "Atualizando o canal ANA…";
    render();
    try {
      const result = await setAnaChannel(state.session.access_token, accountId, enabled);
      if (result.ok === false) throw new AdminApiError(String(result.error ?? "O canal ANA não foi alterado."));
      state.attendanceAna = await getAnaAdmin(state.session.access_token);
      state.attendanceNotice = `ANA ${enabled ? "ativada" : "desligada"} para o número final ${state.attendanceChannel}.`;
    } catch (error) {
      state.attendanceNotice = error instanceof AdminApiError ? error.message : "Não foi possível alterar o canal ANA.";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "order-open") {
    await openOrder(id);
  } else if (action === "orders-back") {
    state.selectedOrder = null;
    state.notice = "";
    render();
  } else if (action === "order-assign" && state.session && state.selectedOrder) {
    state.busy = true;
    render();
    try {
      state.selectedOrder = await assignOrder(state.session.access_token, id, Number(target.dataset.revision));
      state.notice = "Separação atribuída à sua sessão.";
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível assumir o pedido.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "order-separation-complete" && state.session && state.selectedOrder) {
    state.busy = true;
    render();
    try {
      state.selectedOrder = await completeOrderSeparation(state.session.access_token, id, Number(target.dataset.revision));
      const result = await getOrders(state.session.access_token);
      state.orders = result.orders;
      state.notice = state.selectedOrder.blingSaleId
        ? `Separação concluída e venda ${state.selectedOrder.blingSaleId} confirmada no Bling. A NF-e exige confirmação do operador.`
        : `Separação concluída. Estado da venda no Bling: ${state.selectedOrder.integrationJob?.status ?? "em processamento"}.`;
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível concluir a separação.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "order-bling-reconcile" && state.session && state.selectedOrder) {
    const idempotencyKey = state.reconciliationRequestKeys.get(id) ?? crypto.randomUUID();
    state.reconciliationRequestKeys.set(id, idempotencyKey);
    state.busy = true;
    render();
    try {
      state.selectedOrder = await reconcileOrderBlingSale(
        state.session.access_token,
        id,
        Number(target.dataset.revision),
        idempotencyKey,
      );
      state.reconciliationRequestKeys.delete(id);
      state.notice = reconciliationOutcomeLabel(state.selectedOrder);
      state.noticeType = state.selectedOrder.integrationJob?.reconciliation?.outcome === "unknown"
        || state.selectedOrder.integrationJob?.reconciliation?.outcome === "ambiguous" ? "error" : "success";
    } catch (error) {
      if (error instanceof AdminApiError && [400, 404, 409].includes(error.status ?? 0)) {
        state.reconciliationRequestKeys.delete(id);
      }
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível consultar a referência Bling.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "order-bling-create" && state.session && state.selectedOrder) {
    const confirmation = window.prompt("Para tentar criar a venda, digite CRIAR_VENDA:");
    if (confirmation !== "CRIAR_VENDA") return;
    state.busy = true;
    render();
    try {
      state.selectedOrder = await createOrderBlingSale(state.session.access_token, id, Number(target.dataset.revision));
      state.notice = state.selectedOrder.blingSaleId
        ? `Venda ${state.selectedOrder.blingSaleId} confirmada no Bling.`
        : `A venda não foi confirmada. Estado: ${state.selectedOrder.integrationJob?.status ?? "desconhecido"}.`;
      state.noticeType = state.selectedOrder.blingSaleId ? "success" : "error";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível tentar a venda no Bling.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "order-invoice-generate" && state.session && state.selectedOrder) {
    const confirmation = window.prompt("A NF-e será solicitada ao Bling. Digite EMITIR_NFE para confirmar:");
    if (confirmation !== "EMITIR_NFE") return;
    state.busy = true;
    render();
    try {
      state.selectedOrder = await generateOrderBlingInvoice(state.session.access_token, id, Number(target.dataset.revision));
      state.notice = `NF-e no Bling: ${invoiceStatusLabel(state.selectedOrder.invoiceStatus)}.`;
      state.noticeType = state.selectedOrder.invoiceStatus === "authorized" ? "success" : "info";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível solicitar ou consultar a NF-e no Bling.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "order-dispatch" && state.session && state.selectedOrder) {
    const confirmation = window.prompt("O pedido vai sair para entrega. Digite SAIR_PARA_ENTREGA para confirmar:");
    if (confirmation !== "SAIR_PARA_ENTREGA") return;
    state.busy = true;
    render();
    try {
      state.selectedOrder = await startOrderDispatch(state.session.access_token, id, Number(target.dataset.revision));
      state.orders = (await getOrders(state.session.access_token)).orders;
      state.notice = state.selectedOrder.status === "out_for_delivery"
        ? "Saída registrada após nova conferência da NF-e no Bling."
        : `A NF-e está ${invoiceStatusLabel(state.selectedOrder.invoiceStatus).toLowerCase()}; a saída continua bloqueada.`;
      state.noticeType = state.selectedOrder.status === "out_for_delivery" ? "success" : "error";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível conferir a NF-e e registrar a saída.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "order-delivery-complete" && state.session && state.selectedOrder) {
    const selectedMethod = document.querySelector<HTMLSelectElement>("#delivery-payment-method")?.value ?? "";
    if (!["pix", "cash", "debit_card", "credit_card"].includes(selectedMethod)) return;
    const method = selectedMethod as "pix" | "cash" | "debit_card" | "credit_card";
    if (!window.confirm(`Confirmar entrega e recebimento de ${money(state.selectedOrder.totalCents)} via ${paymentMethodLabel(method)}?`)) return;
    state.busy = true;
    render();
    try {
      state.selectedOrder = await completeOrderDelivery(state.session.access_token, id, {
        revision: Number(target.dataset.revision),
        paymentMethod: method,
        amountCents: state.selectedOrder.totalCents,
      });
      state.orders = (await getOrders(state.session.access_token)).orders;
      state.notice = "Entrega e recebimento registrados no novo Admin.";
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível concluir a entrega.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "select-flow-channel") {
    const channel = target.dataset.channel;
    if (!FLOW_CHANNELS.includes(channel as FlowChannel)) return;
    state.flowChannel = channel as FlowChannel;
    const saved = state.flowDocuments[state.flowChannel].drafts.find((draft) => draft.basketId === state.flowBasketId);
    const selected = state.baskets.baskets.find((basket) => basket.id === state.flowBasketId);
    state.flowName = saved?.flowName ?? (selected ? flowNameForBasket(selected) : "cesta-atendimento");
    state.flowProductChoices.clear();
    state.flowQuantities.clear();
    state.notice = "";
    render();
    if (!state.metaChannels[state.flowChannel] && state.access === "authorized") await refreshMetaFlows(state.flowChannel);
  } else if (action === "meta-refresh") {
    await refreshMetaFlows();
  } else if (action === "meta-create") {
    if (!state.session) return;
    const name = document.querySelector<HTMLInputElement>("#meta-flow-name")?.value.trim() || state.flowName;
    state.busy = true;
    render();
    try {
      const created = await createMetaFlow(state.session.access_token, state.flowChannel, name);
      state.metaSelectedFlowIds[state.flowChannel] = created.id;
      state.metaChannels[state.flowChannel] = await getMetaFlows(state.session.access_token, state.flowChannel);
      state.notice = `Flow DRAFT ${created.id} criado na conta Meta do canal ${state.flowChannel}.`;
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "A Meta não criou o rascunho Flow.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "meta-upload") {
    if (!state.session || !state.catalogRevision || isDirty()) {
      tell("Salve o catálogo antes de enviar um Flow para a Meta.", "error");
      return;
    }
    const flowId = state.metaSelectedFlowIds[state.flowChannel] ?? "";
    const draft = currentFlowDraft();
    if (!flowId || !draft) return;
    state.busy = true;
    render();
    try {
      const result = await uploadMetaFlowJson(state.session.access_token, state.flowChannel, flowId, draft.flowJson, draft.flowName, draft.basketId);
      state.metaChannels[state.flowChannel] = await getMetaFlows(state.session.access_token, state.flowChannel);
      state.notice = result.validationErrors.length
        ? `JSON enviado ao Flow ${flowId}; a Meta retornou ${result.validationErrors.length} erro(s) de validação.`
        : `JSON e endpoint enviados ao Flow ${flowId}. Confirme o preview e o status reportado pela Meta.`;
      state.noticeType = result.validationErrors.length ? "error" : "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível atualizar o Flow na Meta.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "meta-encryption") {
    if (!state.session || !window.confirm(`Configurar a chave pública da Meta para o phone number do canal ${state.flowChannel}?`)) return;
    state.busy = true;
    render();
    try {
      await setupMetaFlowEncryption(state.session.access_token, state.flowChannel);
      state.metaChannels[state.flowChannel] = await getMetaFlows(state.session.access_token, state.flowChannel);
      state.notice = state.metaChannels[state.flowChannel]?.encryptionConfigured
        ? `Chave de endpoint configurada para o canal ${state.flowChannel}.`
        : `A solicitação da chave foi enviada; confirme a configuração Meta do canal ${state.flowChannel}.`;
      state.noticeType = state.metaChannels[state.flowChannel]?.encryptionConfigured ? "success" : "info";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível configurar a criptografia Meta.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "meta-publish") {
    const flowId = state.metaSelectedFlowIds[state.flowChannel] ?? "";
    const flow = state.metaChannels[state.flowChannel]?.flows.find((item) => item.id === flowId);
    if (!state.session || !flow) return;
    if (!window.confirm(`Publicar o Flow ${flow.name} (${flow.id}) no canal ${state.flowChannel}? A Meta torna os assets publicados imutáveis.`)) return;
    state.busy = true;
    render();
    try {
      await publishMetaFlow(state.session.access_token, state.flowChannel, flowId);
      state.metaChannels[state.flowChannel] = await getMetaFlows(state.session.access_token, state.flowChannel);
      state.notice = `A Meta confirmou a publicação do Flow ${flowId} para o canal ${state.flowChannel}.`;
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "A Meta não confirmou a publicação do Flow.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "meta-bind") {
    const flowId = state.metaSelectedFlowIds[state.flowChannel] ?? "";
    const flow = state.metaChannels[state.flowChannel]?.flows.find((item) => item.id === flowId);
    const currentFlowId = state.metaChannels[state.flowChannel]?.activeBinding?.flowId ?? null;
    if (!state.session || !flow || currentFlowId === flowId) return;
    if (!window.confirm(`Vincular o Flow publicado ${flow.name} (${flow.id}) ao número final ${state.flowChannel}? Isso só atualiza a configuração do canal; não publica Flow nem envia mensagem.`)) return;
    state.busy = true;
    render();
    try {
      await bindPublishedMetaFlow(state.session.access_token, state.flowChannel, flowId, currentFlowId);
      state.metaChannels[state.flowChannel] = await getMetaFlows(state.session.access_token, state.flowChannel);
      state.notice = `Flow ${flowId} vinculado ao canal ${state.flowChannel}. O envio permanece desligado pelo controle global.`;
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível vincular o Flow ao canal.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "meta-unbind") {
    const currentFlowId = state.metaChannels[state.flowChannel]?.activeBinding?.flowId;
    if (!state.session || !currentFlowId) return;
    if (!window.confirm(`Remover o vínculo do Flow ${currentFlowId} do número final ${state.flowChannel}? Nenhum Flow será publicado e nenhuma mensagem será enviada.`)) return;
    state.busy = true;
    render();
    try {
      await unbindMetaFlow(state.session.access_token, state.flowChannel, currentFlowId);
      state.metaChannels[state.flowChannel] = await getMetaFlows(state.session.access_token, state.flowChannel);
      state.notice = `Vínculo do Flow removido do canal ${state.flowChannel}.`;
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível remover o vínculo do Flow.";
      state.noticeType = "error";
    } finally {
      state.busy = false;
      render();
    }
  } else if (action === "download-flow-json") {
    const draft = currentFlowDraft();
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft.flowJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.flowName || "flow-rascunho"}-${state.flowChannel}.json`;
    link.click();
    URL.revokeObjectURL(url);
  } else if (action === "review-flow-save") {
    openFlowReview();
  } else if (action === "confirm-save-flow") {
    state.busy = true;
    target.setAttribute("disabled", "true");
    target.textContent = "Gravando rascunho…";
    await performFlowSave();
  } else if (action === "new-product") {
    openProductEditor();
  } else if (action === "edit-product") {
    openProductEditor(id);
  } else if (action === "lookup-bling-product") {
    const form = document.querySelector<HTMLFormElement>("#product-form");
    const results = document.querySelector<HTMLElement>("#bling-lookup-results");
    if (!state.session || !form || !results) return;
    target.setAttribute("disabled", "true");
    target.textContent = "Consultando…";
    results.textContent = "Consultando o catálogo Bling pelo GTIN salvo no GitHub…";
    try {
      const lookup = await lookupBlingProductByCatalogGtin(state.session.access_token, id);
      const gtinField = form.elements.namedItem("gtin");
      const currentGtin = gtinField instanceof HTMLInputElement ? normalizeGtin(gtinField.value) : "";
      results.dataset.gtin = lookup.gtin;
      if (currentGtin !== lookup.gtin) {
        results.innerHTML = `<small>O GTIN do formulário (${escapeHtml(currentGtin || "vazio")}) difere do catálogo salvo (${escapeHtml(lookup.gtin)}). Atualize ou salve o catálogo antes de associar um ID.</small>`;
      } else if (!lookup.products.length) {
        results.innerHTML = `<small>Nenhum produto foi encontrado para o GTIN ${escapeHtml(lookup.gtin)}. O ID Bling continua sem vínculo.</small>`;
      } else {
        results.innerHTML = `<p class="inline-note">${lookup.products.length} resultado(s) para ${escapeHtml(lookup.gtin)}. Confira a descrição/SKU e escolha o produto correspondente.</p><div class="bling-lookup-candidates">${lookup.products.map((candidate) => `<div><span><strong>${escapeHtml(candidate.name)}</strong><small>ID ${escapeHtml(candidate.id)}${candidate.sku ? ` · SKU ${escapeHtml(candidate.sku)}` : ""}</small></span><button type="button" class="button button-soft" data-action="select-bling-product" data-id="${escapeHtml(candidate.id)}">Usar este ID</button></div>`).join("")}<small id="bling-lookup-status" role="status"></small></div>`;
      }
    } catch (error) {
      results.textContent = error instanceof AdminApiError ? error.message : "Não foi possível consultar o catálogo Bling.";
    } finally {
      if (target.isConnected) {
        target.removeAttribute("disabled");
        target.textContent = "Consultar novamente";
      }
    }
  } else if (action === "select-bling-product") {
    const form = document.querySelector<HTMLFormElement>("#product-form");
    const results = document.querySelector<HTMLElement>("#bling-lookup-results");
    const idInput = form?.elements.namedItem("bling");
    const gtinField = form?.elements.namedItem("gtin");
    if (!form || !results || !(idInput instanceof HTMLInputElement) || !(gtinField instanceof HTMLInputElement)) return;
    const currentGtin = normalizeGtin(gtinField.value);
    const resultIds = [...results.querySelectorAll<HTMLElement>('[data-action="select-bling-product"]')]
      .map((candidate) => candidate.dataset.id);
    const status = results.querySelector<HTMLElement>("#bling-lookup-status");
    if (currentGtin !== results.dataset.gtin) {
      if (status) status.textContent = "O GTIN foi alterado. Faça a consulta novamente antes de associar o ID.";
      return;
    }
    if (!/^\d{1,20}$/.test(id) || !resultIds.includes(id)) return;
    idInput.value = id;
    if (status) status.textContent = `ID ${id} preenchido. A associação será gravada somente ao salvar a revisão do catálogo.`;
  } else if (action === "delete-product") {
    const referenced = state.baskets.baskets.some((basket) => basket.groups.some((group) => group.productIds.includes(id)));
    if (referenced) tell("Remova este produto das opções das cestas antes de excluí-lo.", "error");
    else if (window.confirm("Remover este produto da prévia do catálogo?")) {
      state.pendingImages.delete(id);
      state.products = { ...state.products, products: state.products.products.filter((product) => product.id !== id) };
      render();
    }
  } else if (action === "new-basket") {
    const base = slug("nova-cesta");
    let nextId = base;
    let sequence = 2;
    while (state.baskets.baskets.some((basket) => basket.id === nextId)) nextId = `${base}-${sequence++}`;
    const basket: Basket = { id: nextId, name: "Nova cesta", active: false, sortOrder: state.baskets.baskets.length + 1, basePriceCents: 0, groups: [] };
    state.baskets = { ...state.baskets, baskets: [...state.baskets.baskets, basket] };
    state.selectedBasketId = basket.id;
    state.tab = "baskets";
    render();
  } else if (action === "select-basket") {
    if (basketForm) syncBasketFormToState(basketForm);
    state.selectedBasketId = id;
    state.notice = "";
    render();
  } else if (action === "move-basket") {
    if (basketForm) syncBasketFormToState(basketForm);
    const sorted = state.baskets.baskets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const at = sorted.findIndex((basket) => basket.id === id);
    const reordered = reorder(sorted, at, direction).map((basket, position) => ({ ...basket, sortOrder: position + 1 }));
    state.baskets = { ...state.baskets, baskets: reordered };
    render();
  } else if (action === "delete-basket") {
    if (basketForm) syncBasketFormToState(basketForm);
    if (window.confirm("Remover esta cesta da prévia do catálogo?")) {
      state.baskets = { ...state.baskets, baskets: state.baskets.baskets.filter((basket) => basket.id !== id).map((basket, position) => ({ ...basket, sortOrder: position + 1 })) };
      state.selectedBasketId = state.baskets.baskets[0]?.id ?? "";
      render();
    }
  } else if (action === "new-group") {
    if (!basketForm) return;
    syncBasketFormToState(basketForm);
    const basket = state.baskets.baskets.find((item) => item.id === state.selectedBasketId);
    if (basket) basket.groups.push(newGroup(basket));
    render();
  } else if (action === "delete-group") {
    if (!basketForm) return;
    syncBasketFormToState(basketForm);
    const basket = state.baskets.baskets.find((item) => item.id === state.selectedBasketId);
    if (basket && window.confirm("Remover este tipo e suas opções da cesta?")) basket.groups.splice(index, 1);
    render();
  } else if (action === "move-group") {
    if (!basketForm) return;
    syncBasketFormToState(basketForm);
    const basket = state.baskets.baskets.find((item) => item.id === state.selectedBasketId);
    if (basket) basket.groups = reorder(basket.groups, index, direction);
    render();
  } else if (action === "edit-group-options") {
    if (basketForm) syncBasketFormToState(basketForm);
    openOptionEditor(index);
  } else if (action === "toggle-option" && state.optionEditor) {
    const options = state.optionEditor.optionIds;
    state.optionEditor.optionIds = options.includes(id) ? options.filter((optionId) => optionId !== id) : [...options, id];
    renderOptionModal();
  } else if (action === "move-option" && state.optionEditor) {
    state.optionEditor.optionIds = reorder(state.optionEditor.optionIds, index, direction);
    renderOptionModal();
  } else if (action === "remove-option" && state.optionEditor) {
    state.optionEditor.optionIds.splice(index, 1);
    renderOptionModal();
  } else if (action === "apply-options" && state.optionEditor) {
    const editor = state.optionEditor;
    const basket = state.baskets.baskets.find((item) => item.id === state.selectedBasketId);
    const group = basket?.groups[editor.groupIndex];
    if (group) {
      const previousCounts = new Map<string, number>();
      for (const productId of group.productIds) previousCounts.set(productId, (previousCounts.get(productId) ?? 0) + 1);
      group.productIds = editor.optionIds.flatMap((productId) => Array.from({ length: previousCounts.get(productId) ?? 1 }, () => productId));
      state.optionEditor = null;
      document.querySelector<HTMLDialogElement>("#modal")?.close();
      render();
    }
  } else if (action === "close-options") {
    state.optionEditor = null;
    document.querySelector<HTMLDialogElement>("#modal")?.close();
  } else if (action === "close-modal") {
    if (state.modalKind === "product") {
      state.editorImage = null;
      state.editorImageProductId = "";
    }
    if (state.modalKind === "flow-review") state.flowReviewDocument = null;
    document.querySelector<HTMLDialogElement>("#modal")?.close();
  } else if (action === "review-save") {
    openReviewModal();
  } else if (action === "confirm-save") {
    state.busy = true;
    target.setAttribute("disabled", "true");
    target.textContent = "Gravando…";
    await performSave();
  } else if (action === "export-draft") {
    const draft = {
      ...currentDocuments(),
      ...(state.pendingImages.size ? { images: [...state.pendingImages.values()].map(({ productId, contentBase64 }) => ({ productId, contentBase64 })) } : {}),
      ...(state.editorImage ? { editorImage: { productId: state.editorImage.productId, contentBase64: state.editorImage.contentBase64 } } : {}),
    };
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "whatsapp-atendimento-rascunho.json";
    link.click();
    URL.revokeObjectURL(url);
  } else if (action === "reload-catalog") {
    if (!state.session || !window.confirm("Isso substituirá as alterações locais pelos dados atuais do GitHub. Baixe o rascunho antes, se precisar recuperá-lo.")) return;
    state.pendingImages.clear();
    state.editorImage = null;
    state.editorImageProductId = "";
    await reloadCatalog(state.session);
  } else if (action === "clear-notice") {
    state.notice = "";
    render();
  }
});

appRoot.addEventListener("close", (event) => {
  if (event.target instanceof HTMLDialogElement && event.target.id === "modal") {
    if (state.modalKind === "options") state.optionEditor = null;
    if (state.modalKind === "product") {
      state.editorImage = null;
      state.editorImageProductId = "";
    }
    if (state.modalKind === "flow-review") state.flowReviewDocument = null;
    state.modalKind = null;
  }
}, true);

render();
void initializeAuth();
