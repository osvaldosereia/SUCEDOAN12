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
  flowNameForBasket,
  flowQuantityField,
  generateBasketFlow,
  validateChannelFlowDocument,
  type BasketFlowDraft,
  type ChannelFlowDocument,
  type FlowChannel,
} from "../domain/flows";
import { AdminApiError, assignOrder, completeOrderSeparation, getCatalog, getFlowDraft, getOrder, getOrders, saveCatalog, saveFlowDraft, saveOrderPicking, type PendingImage } from "./api";
import type { OrderDetailRecord, OrderListEntry } from "../domain/orders";
import { renderFlowsPanel } from "./flows-panel";
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
  accessMessage: "Prévia local: alterações ficam apenas nesta sessão do navegador.",
  busy: false,
  tab: "products" as "products" | "baskets" | "flows" | "orders",
  search: "",
  selectedBasketId: initialDocuments.baskets.baskets[0]?.id ?? "",
  flowDocuments: structuredClone(initialFlowDocuments),
  flowChannel: "0975" as FlowChannel,
  flowBasketId: initialFlowBasket?.id ?? "",
  flowName: initialFlowBasket ? flowNameForBasket(initialFlowBasket) : "cesta-atendimento",
  flowQuantities: new Map<string, number>(),
  flowReviewDocument: null as ChannelFlowDocument | null,
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
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
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

function currentDocuments(): CatalogDocuments {
  return { products: state.products, baskets: state.baskets };
}

function isDirty(): boolean {
  return JSON.stringify(currentDocuments()) !== state.baseline || state.pendingImages.size > 0 || Boolean(state.editorImage);
}

function selectedFlowBasket(): Basket | undefined {
  return state.baskets.baskets.find((basket) => basket.id === state.flowBasketId && basket.active);
}

function updateFlowQuantitiesSummary(): void {
  const basket = selectedFlowBasket();
  if (!basket) return;
  basket.groups.forEach((group, groupIndex) => {
    const options = [...new Set(group.productIds)];
    const total = options.reduce((sum, _id, productIndex) =>
      sum + (state.flowQuantities.get(`${basket.id}:${flowQuantityField(groupIndex, productIndex)}`) ?? 0), 0);
    const target = document.querySelector<HTMLElement>(`[data-flow-group-count="${groupIndex}"]`);
    if (!target) return;
    const inRange = total >= group.minimumQuantity && total <= group.maximumQuantity;
    target.textContent = `Total escolhido: ${total} · ${inRange ? "dentro do limite" : `requer ${group.minimumQuantity}–${group.maximumQuantity}`}`;
    target.classList.toggle("is-valid", inRange);
    target.classList.toggle("is-invalid", !inRange);
  });
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
  openModal(`<div class="modal-card review-modal"><div class="modal-heading"><div><span class="eyebrow">Revisão antes do commit</span><h2>Salvar rascunho Flow?</h2></div><button class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div><p>O commit guardará o JSON para o canal final ${state.flowChannel}, associado à cesta ${escapeHtml(basket.name)} e à revisão de catálogo <code>${escapeHtml(state.catalogRevision.slice(0, 7))}</code>.</p>${refreshedCount ? `<p class="inline-note">${refreshedCount} outro(s) rascunho(s) deste canal será(ão) regenerado(s) para a mesma revisão do catálogo.</p>` : ""}<p class="flow-muted">A gravação não cria Flow na Meta, não publica e não envia mensagens. O status Meta permanece desconhecido.</p><div class="review-target"><span>Rascunho</span><strong>${escapeHtml(draft.flowName)}</strong><code>flows/channel-${state.flowChannel}.json</code></div><div class="modal-actions"><button class="button button-soft" data-action="close-modal">Voltar</button><button class="button button-primary" data-action="confirm-save-flow">Confirmar e gravar rascunho</button></div></div>`, "flow-review");
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
    state.flowDocuments = { ...state.flowDocuments, [state.flowChannel]: snapshot.document };
    state.commitSha = snapshot.commitSha;
    state.commitUrl = snapshot.commitUrl;
    state.notice = `Rascunho Flow ${state.flowChannel} gravado no commit ${snapshot.commitSha.slice(0, 7)}.`;
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
  if (state.access === "denied") return "Sem permissão para gravar";
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
    <div class="preview-groups">${basket.groups.map((group) => `<div class="preview-group"><div><strong>${escapeHtml(group.label)}</strong><span>${group.initialQuantity} un. · ${group.minimumQuantity}–${group.maximumQuantity}</span></div><p>${uniqueInOrder(group.productIds).map(productName).map(escapeHtml).join(" · ")}</p></div>`).join("") || `<p class="subtle">Adicione um tipo de produto para completar a prévia.</p>`}</div>
  </div>`;
}

function basketEditor(basket: Basket): string {
  const groups = basket.groups.map((group, index) => {
    const options = uniqueInOrder(group.productIds);
    return `<article class="group-card" data-group-index="${index}">
      <div class="group-card-heading"><div class="drag-order"><button class="icon-button compact" title="Mover para cima" aria-label="Mover tipo para cima" data-action="move-group" data-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button><button class="icon-button compact" title="Mover para baixo" aria-label="Mover tipo para baixo" data-action="move-group" data-index="${index}" data-direction="1" ${index === basket.groups.length - 1 ? "disabled" : ""}>↓</button></div><div><span class="eyebrow">Tipo ${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(group.label)}</strong></div><button class="icon-button" title="Remover tipo" aria-label="Remover tipo" data-action="delete-group" data-index="${index}">×</button></div>
      <div class="group-fields"><label>Nome do tipo<input name="group_label_${index}" value="${escapeHtml(group.label)}" required maxlength="80"></label><label>Categoria<input name="group_category_${index}" value="${escapeHtml(group.category)}" required maxlength="80"></label></div>
      <div class="quantity-fields"><label>Mínimo<input name="group_min_${index}" type="number" min="0" max="10" value="${group.minimumQuantity}" required></label><label>Inicial<input name="group_initial_${index}" type="number" min="0" max="10" value="${group.initialQuantity}" required></label><label>Máximo<input name="group_max_${index}" type="number" min="0" max="10" value="${group.maximumQuantity}" required></label><span class="quantity-hint">${group.removalAllowed ? "O cliente pode remover este tipo." : "Este tipo é obrigatório."}</span></div>
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
    tell("Entre com a conta GitHub autorizada para acessar os pedidos.", "error");
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

function integrationBlockerLabel(code: string): string {
  return ({
    BLING_CUSTOMER_CONTACT_MAPPING_MISSING: "Vincular o cliente ao contato do Bling",
    BLING_PAYMENT_FORM_MAPPING_MISSING: "Mapear a forma de pagamento",
    BLING_DUE_DATE_POLICY_MISSING: "Definir o vencimento da parcela",
    BLING_OAUTH_CREDENTIAL_MISSING: "Conectar a conta Bling por OAuth",
    BLING_BASKET_ADJUSTMENT_RULE_UNRESOLVED: "Definir o tratamento fiscal do ajuste da cesta",
    BLING_CONNECTOR_DISABLED_IN_DEVELOPMENT: "Conector desativado durante o desenvolvimento",
  } as Record<string, string>)[code] ?? code;
}

function ordersView(): string {
  if (state.access !== "authorized") return `<section class="workspace-heading"><div><span class="eyebrow">Operação</span><h1>Pedidos</h1><p>A fila exige uma sessão GitHub autorizada pelo servidor.</p></div></section><div class="empty-state"><strong>Acesso administrativo necessário</strong><span>Entre com a conta GitHub autorizada para consultar os pedidos.</span></div>`;
  const order = state.selectedOrder;
  if (order) {
    const pending = order.customerAcceptanceStatus === "pending";
    return `<section class="workspace-heading"><div><span class="eyebrow">Pedido · ${escapeHtml(order.id.slice(0, 8))}</span><h1>${escapeHtml(order.customerName)}</h1><p>${escapeHtml(order.basketName)} · ${escapeHtml(order.city)} · recebido ${new Date(order.createdAt).toLocaleString("pt-BR")}</p></div><div class="order-heading-actions"><button class="button button-soft" data-action="orders-back">← Fila</button><button class="button button-soft" data-action="orders-refresh">Atualizar</button></div></section>
      <div class="order-summary-grid"><article><span>Status</span><strong>${escapeHtml(orderStatusLabel(order.status))}</strong></article><article><span>Total confirmado</span><strong>${money(order.totalCents)}</strong></article><article><span>Canal / pagamento</span><strong>${escapeHtml(order.channel)} · ${escapeHtml(String(order.snapshot.paymentMethod ?? "—"))}</strong></article><article><span>Revisão</span><strong>${order.revision}</strong></article></div>
      ${pending ? `<div class="flow-safety-note"><strong>Aguardando aceite do cliente</strong><span>Há falta ou substituição pendente. A separação e o Bling ficam bloqueados até a resposta chegar pelo webhook.</span></div>` : ""}
      ${order.status === "awaiting_invoice" ? `<div class="flow-safety-note"><strong>Pré-validação Bling bloqueada</strong><span>Nenhuma venda ou NF-e foi criada. Resolva os bloqueios registrados:</span><ul>${(order.integrationJob?.blockers ?? []).map((code) => `<li>${escapeHtml(integrationBlockerLabel(code))}</li>`).join("") || `<li>Consulte o estado de integração no servidor.</li>`}</ul></div>` : ""}
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
    quantities: state.flowQuantities,
  });
  const identityLabel = state.session?.user.user_metadata?.user_name
    ?? state.session?.user.user_metadata?.preferred_username
    ?? state.session?.user.email
    ?? "Conta GitHub";
  const statusClass = state.access === "authorized" ? "is-authorized" : state.access === "denied" ? "is-denied" : "is-preview";

  appRoot.innerHTML = `<div class="app-shell">
    <header class="topbar"><a class="brand" href="#"><span class="brand-mark">DA</span><span><strong>Dona Antônia</strong><small>Atendimento WhatsApp</small></span></a>
      <div class="topbar-actions"><span class="access-status ${statusClass}"><i></i>${escapeHtml(accessLabel())}</span>${state.session ? `<span class="user-chip"><span class="user-avatar">${escapeHtml(String(identityLabel).slice(0, 1).toUpperCase())}</span>${escapeHtml(identityLabel)}</span><button class="button button-soft" data-action="sign-out">Sair</button>` : `<button class="button button-dark" data-action="sign-in" ${supabase ? "" : "disabled title=Configure%20Supabase%20em%20.env.local"}>Entrar com GitHub</button>`}</div>
    </header>
    <div class="security-banner ${state.access === "authorized" ? "is-ready" : ""}"><span class="security-icon">${state.access === "authorized" ? "✓" : "⌑"}</span><span><strong>${state.access === "authorized" ? "Acesso confirmado pelo servidor" : escapeHtml(state.accessMessage)}</strong><small>${state.access === "authorized" ? `Gravações ficam restritas ao branch project/whatsapp-atendimento-github-20261025${state.commitSha ? ` · revisão ${state.commitSha.slice(0, 7)}` : ""}.` : "Sem GitHub App, allowlist e origem configurados no servidor, nenhuma gravação será aceita."}</small></span>${state.commitUrl ? `<a class="text-link" href="${escapeHtml(state.commitUrl)}" target="_blank" rel="noreferrer">Ver commit ↗</a>` : ""}</div>
    <div class="app-body"><aside class="main-nav"><div class="nav-label">CATÁLOGO</div><button class="nav-item ${state.tab === "products" ? "is-active" : ""}" data-action="tab" data-tab="products"><span class="nav-icon">▦</span> Produtos <span class="nav-count">${state.products.products.length}</span></button><button class="nav-item ${state.tab === "baskets" ? "is-active" : ""}" data-action="tab" data-tab="baskets"><span class="nav-icon">▤</span> Cestas <span class="nav-count">${state.baskets.baskets.length}</span></button><button class="nav-item ${state.tab === "flows" ? "is-active" : ""}" data-action="tab" data-tab="flows"><span class="nav-icon">⌁</span> Flows <span class="nav-count">${state.flowDocuments[state.flowChannel].drafts.length}</span></button><div class="nav-label nav-orders-label">OPERAÇÃO</div><button class="nav-item ${state.tab === "orders" ? "is-active" : ""}" data-action="tab" data-tab="orders"><span class="nav-icon">▣</span> Pedidos <span class="nav-count">${state.orders.length}</span></button></aside>
      <main class="content"><div class="content-topline"><span>Administração</span><span class="breadcrumb-sep">/</span><strong>${state.tab === "products" ? "Produtos" : state.tab === "baskets" ? "Cestas" : state.tab === "flows" ? "Flows" : "Pedidos"}</strong><span class="dirty-indicator ${isDirty() && state.tab !== "orders" ? "is-dirty" : ""}">${isDirty() && state.tab !== "orders" ? "Alterações pendentes" : "Tudo salvo"}</span></div>${state.notice ? `<div class="notice notice-${state.noticeType}" role="status"><span>${escapeHtml(state.notice)}</span>${state.conflict ? `<div class="conflict-actions"><button class="text-button" data-action="export-draft">Baixar meu rascunho</button><button class="text-button" data-action="reload-catalog">Descartar e recarregar</button></div>` : ""}<button data-action="clear-notice" aria-label="Fechar">×</button></div>` : ""}${state.tab === "products" ? productsView() : state.tab === "baskets" ? selectedBasket ? basketEditor(selectedBasket) : `<div class="empty-state"><strong>Nenhuma cesta cadastrada</strong><span>Crie a primeira cesta para começar.</span><button class="button button-primary" data-action="new-basket">＋ Nova cesta</button></div>` : state.tab === "flows" ? flowsPanel : ordersView()}</main>
    </div>
    <footer class="page-footer"><span>Catálogo público versionado no GitHub</span><span>Dados pessoais e credenciais ficam fora deste projeto</span></footer>
    ${state.access === "authorized" && isDirty() ? `<button class="floating-save" data-action="review-save"><span>Revisar alterações</span><strong>Salvar no GitHub ↗</strong></button>` : ""}
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
    <div class="product-form-layout"><div><label>Nome do produto<input name="name" required maxlength="160" value="${escapeHtml(product?.name ?? "")}"></label><div class="form-grid"><label>Marca<input name="brand" required maxlength="80" value="${escapeHtml(product?.brand ?? "")}"></label><label>Apresentação<input name="presentation" required maxlength="80" placeholder="Ex.: 500 g" value="${escapeHtml(product?.presentation ?? "")}"></label></div><div class="form-grid"><label>Preço unitário (R$)<input name="price" type="number" min="0" step="0.01" required value="${product ? priceInputValue(product.unitPriceCents) : "0.00"}"></label><label>SKU<input name="sku" maxlength="80" value="${escapeHtml(product?.sku ?? "")}"></label></div><div class="form-grid"><label>GTIN / EAN<input name="gtin" maxlength="32" value="${escapeHtml(product?.gtin ?? "")}"></label><label>ID do Bling<input name="bling" maxlength="80" value="${escapeHtml(product?.blingProductId ?? "")}"></label></div><label class="checkbox-label"><input name="active" type="checkbox" ${product?.active ?? true ? "checked" : ""}> Produto ativo</label></div>
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
    minimumQuantity: Number(values.get(`group_min_${index}`)),
    initialQuantity: Number(values.get(`group_initial_${index}`)),
    maximumQuantity: Number(values.get(`group_max_${index}`)),
    removalAllowed: Number(values.get(`group_min_${index}`)) === 0,
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
    maximumQuantity: 1, initialQuantity: 1, removalAllowed: true,
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
    state.accessMessage = "Sua conta foi aprovada pela allowlist do servidor.";
    if (!state.baskets.baskets.some((basket) => basket.id === state.selectedBasketId)) {
      state.selectedBasketId = state.baskets.baskets[0]?.id ?? "";
    }
    if (!state.baskets.baskets.some((basket) => basket.id === state.flowBasketId && basket.active)) {
      state.flowBasketId = state.baskets.baskets.find((basket) => basket.active)?.id ?? "";
    }
    const savedFlow = state.flowDocuments[state.flowChannel].drafts.find((draft) => draft.basketId === state.flowBasketId);
    const selectedFlowBasket = state.baskets.baskets.find((basket) => basket.id === state.flowBasketId);
    state.flowName = savedFlow?.flowName ?? (selectedFlowBasket ? flowNameForBasket(selectedFlowBasket) : "cesta-atendimento");
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
    state.accessMessage = "Prévia local: configure Supabase no .env.local para habilitar o login GitHub.";
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
      state.accessMessage = "Prévia local: alterações ficam apenas nesta sessão do navegador.";
      state.commitSha = "";
      state.catalogRevision = "";
      state.commitUrl = "";
      state.products = structuredClone(initialDocuments.products);
      state.baskets = structuredClone(initialDocuments.baskets);
      state.baseline = JSON.stringify(initialDocuments);
      state.flowDocuments = structuredClone(initialFlowDocuments);
      state.flowQuantities.clear();
      state.flowReviewDocument = null;
      state.pendingImages.clear();
      state.editorImage = null;
      state.editorImageProductId = "";
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
  if (target instanceof HTMLInputElement && target.id === "flow-name") state.flowName = target.value;
  if (target instanceof HTMLInputElement && target.dataset.flowPreview) {
    const key = target.dataset.flowPreview;
    if (target.value === "") state.flowQuantities.delete(key);
    else state.flowQuantities.set(key, Number(target.value));
    updateFlowQuantitiesSummary();
  }
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
  if (target instanceof HTMLSelectElement && target.id === "flow-basket") {
    state.flowBasketId = target.value;
    const saved = state.flowDocuments[state.flowChannel].drafts.find((draft) => draft.basketId === target.value);
    const selected = state.baskets.baskets.find((basket) => basket.id === target.value);
    state.flowName = saved?.flowName ?? (selected ? flowNameForBasket(selected) : "cesta-atendimento");
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
    if (!Number.isFinite(price) || price < 0) {
      tell("Informe um preço válido em reais.", "error");
      return;
    }
    const product: Product = {
      id,
      name: String(values.get("name") ?? "").trim(),
      brand: String(values.get("brand") ?? "").trim(),
      presentation: String(values.get("presentation") ?? "").trim(),
      unitPriceCents: Math.round(price * 100),
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
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (error) tell(`Não foi possível iniciar o login GitHub: ${error.message}`, "error");
  } else if (action === "sign-out") {
    if (isDirty() && !window.confirm("Sair descartará as alterações desta prévia. Deseja continuar?")) return;
    await supabase?.auth.signOut();
  } else if (action === "tab") {
    const nextTab = target.dataset.tab;
    state.tab = nextTab === "baskets" || nextTab === "flows" || nextTab === "orders" ? nextTab : "products";
    state.notice = "";
    render();
    if (state.tab === "orders" && !state.ordersLoaded && state.access === "authorized") await loadOrders();
  } else if (action === "orders-refresh") {
    await loadOrders();
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
      state.notice = "Separação concluída. Pré-validação Bling bloqueada até configurar os vínculos e a regra fiscal.";
      state.noticeType = "success";
    } catch (error) {
      state.notice = error instanceof AdminApiError ? error.message : "Não foi possível concluir a separação.";
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
    state.flowQuantities.clear();
    state.notice = "";
    render();
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
