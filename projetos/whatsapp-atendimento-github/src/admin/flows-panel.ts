import type { Basket, Product } from "../domain/catalog";
import {
  FLOW_CHANNELS,
  FLOW_NO_PRODUCT_ID,
  flowProductField,
  flowQuantityField,
  flowNameForBasket,
  generateBasketFlow,
  validateBasketFlow,
  type ChannelFlowDocument,
  type FlowChannel,
} from "../domain/flows";

export interface FlowsPanelModel {
  channel: FlowChannel;
  basketId: string;
  flowName: string;
  baskets: Basket[];
  products: Product[];
  documents: Record<FlowChannel, ChannelFlowDocument>;
  catalogRevision: string;
  catalogDirty: boolean;
  authorized: boolean;
  busy: boolean;
  notice: string;
  noticeType: "info" | "success" | "error";
  productChoices: Map<string, string>;
  quantities: Map<string, number>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function renderFlowsPanel(model: FlowsPanelModel): string {
  const basket = model.baskets.find((item) => item.id === model.basketId && item.active);
  const savedDrafts = model.documents[model.channel].drafts;
  const savedForBasket = savedDrafts.find((draft) => draft.basketId === model.basketId);
  const flowJson = basket ? generateBasketFlow(basket, model.products) : null;
  const validationErrors = basket && flowJson ? validateBasketFlow(basket, model.products, flowJson) : ["Escolha uma cesta ativa."];
  const optionCount = basket ? new Set(basket.groups.flatMap((group) => group.productIds)).size : 0;
  const flowText = flowJson ? JSON.stringify(flowJson, null, 2) : "";
  const productsById = new Map(model.products.map((product) => [product.id, product]));
  const status = savedForBasket
    ? savedForBasket.catalogRevision === model.catalogRevision
      ? "Rascunho salvo nesta revisão do catálogo"
      : `Rascunho salvo em ${savedForBasket.catalogRevision.slice(0, 7)}; gere novamente para a revisão atual`
    : "Ainda não salvo no GitHub";

  return `<section class="workspace-heading">
      <div><span class="eyebrow">Canais independentes · ${savedDrafts.length} Flow(s) salvo(s)</span><h1>Flows</h1><p>Gere e revise um rascunho de Flow por tamanho de cesta e canal.</p></div>
    </section>
    <div class="flow-safety-note"><strong>Rascunho local, sem publicação</strong><span>O JSON e o endpoint estão ligados ao contrato local. Ainda faltam validação no Flow Builder e conferência em aparelho; esta tela não chama a Meta nem envia mensagens.</span></div>
    ${model.notice ? `<div class="notice notice-${model.noticeType}" role="status"><span>${escapeHtml(model.notice)}</span><button data-action="clear-notice" aria-label="Fechar">×</button></div>` : ""}
    <div class="flow-layout">
      <section class="flow-editor-card">
        <div class="section-title"><div><span class="eyebrow">Configuração por número</span><h2>Canal de atendimento</h2></div></div>
        <div class="flow-channel-picker">${FLOW_CHANNELS.map((channel) => `<button type="button" class="flow-channel ${channel === model.channel ? "is-selected" : ""}" data-action="select-flow-channel" data-channel="${channel}"><strong>Final ${channel}</strong><small>ID oficial pendente</small></button>`).join("")}</div>
        <div class="flow-fields">
          <label>Tamanho da cesta<select id="flow-basket">${model.baskets.filter((item) => item.active).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === model.basketId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
          <label>Nome técnico do Flow<input id="flow-name" maxlength="60" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="${escapeHtml(model.flowName || (basket ? flowNameForBasket(basket) : ""))}" placeholder="cesta-mini"></label>
        </div>
        ${basket ? `<div class="flow-basket-summary"><div><span class="eyebrow">Cesta associada</span><strong>${escapeHtml(basket.name)} · ${optionCount} produtos possíveis</strong></div><span>${basket.groups.length} tipos</span></div><div class="flow-group-list">${basket.groups.map((group) => `<div><strong>${escapeHtml(group.label)}</strong><span>1–6 unidades conforme estoque · ${new Set(group.productIds).size} opções + retirada</span></div>`).join("")}</div><section class="flow-simulator"><div class="flow-json-heading"><div><span class="eyebrow">Prévia controlada no navegador</span><h2>Uma escolha por tipo</h2></div><span class="subtle">Sem WhatsApp ou rede</span></div><p>Em cada etapa, escolha um produto e depois a quantidade. O preview respeita o saldo informado neste catálogo GitHub; sem saldo ou com saldo zero, o produto fica bloqueado.</p>${basket.groups.map((group, groupIndex) => {
          const productKey = `${basket.id}:${flowProductField(groupIndex)}`;
          const quantityKey = `${basket.id}:${flowQuantityField(groupIndex)}`;
          const availableProducts = group.productIds.flatMap((id) => {
            const product = productsById.get(id);
            return product?.active ? [product] : [];
          });
          const requestedProductId = model.productChoices.get(productKey);
          const defaultProduct = availableProducts.find((product) => product.stockQuantity !== null && product.stockQuantity > 0);
          const requestedProduct = availableProducts.find((product) => product.id === requestedProductId && product.stockQuantity !== null && product.stockQuantity > 0);
          const selectedProductId = requestedProductId === FLOW_NO_PRODUCT_ID
            ? FLOW_NO_PRODUCT_ID
            : requestedProduct?.id ?? defaultProduct?.id ?? FLOW_NO_PRODUCT_ID;
          const selectedProduct = availableProducts.find((product) => product.id === selectedProductId);
          const removed = selectedProductId === FLOW_NO_PRODUCT_ID;
          const quantityLimit = selectedProduct?.stockQuantity ? Math.min(6, selectedProduct.stockQuantity) : 0;
          const requestedQuantity = model.quantities.get(quantityKey) ?? Math.max(1, group.initialQuantity || 1);
          const quantity = quantityLimit ? Math.min(quantityLimit, Math.max(1, requestedQuantity)) : 0;
          const productOptions = availableProducts.map((product) => {
            const unavailable = product.stockQuantity === null || product.stockQuantity === 0;
            const stockLabel = product.stockQuantity === null ? " · estoque não informado" : product.stockQuantity === 0 ? " · sem estoque" : "";
            const label = `${product.name} · ${product.brand} · ${money(product.unitPriceCents)}${stockLabel}`;
            return `<option value="${escapeHtml(product.id)}" ${product.id === selectedProductId ? "selected" : ""} ${unavailable ? "disabled" : ""}>${escapeHtml(label)}</option>`;
          }).join("");
          const quantityOptions = Array.from({ length: quantityLimit }, (_, index) => index + 1)
            .map((value) => `<option value="${value}" ${value === quantity ? "selected" : ""}>${value}</option>`).join("");
          return `<fieldset class="flow-simulation-group"><legend>${escapeHtml(group.label)}</legend><label>Produto<select data-flow-product="${groupIndex}">${productOptions}<option value="${FLOW_NO_PRODUCT_ID}" ${removed ? "selected" : ""}>Não quero esse produto</option></select></label><label ${removed ? "hidden" : ""}>Quantidade<select data-flow-quantity="${groupIndex}">${quantityOptions}</select></label><span class="flow-group-count is-valid" data-flow-group-count="${groupIndex}">${removed ? "Este tipo será retirado da cesta." : `${quantity} unidade(s) · ${escapeHtml(selectedProduct?.name ?? "Produto selecionado")}`}</span></fieldset>`;
        }).join("")}</section>` : ""}
        <div class="flow-channel-status"><span class="status-pill is-inactive">${escapeHtml(status)}</span><span>Número e Flow ID Meta: não configurados</span></div>
        <div class="flow-actions"><button type="button" class="button button-soft" data-action="download-flow-json" ${!flowJson || validationErrors.length || model.busy ? "disabled" : ""}>Baixar JSON</button><button type="button" class="button button-primary" data-action="review-flow-save" ${!model.authorized || !model.catalogRevision || model.catalogDirty || !flowJson || validationErrors.length || model.busy ? "disabled title=Requer%20cat%C3%A1logo%20salvo%20e%20acesso%20autorizado" : ""}>Revisar e salvar rascunho</button></div>
        ${!model.authorized ? `<p class="flow-muted">Faça login autorizado para gravar o rascunho. A prévia e o download continuam disponíveis.</p>` : !model.catalogRevision ? `<p class="flow-muted">Carregue uma revisão do catálogo no servidor antes de salvar.</p>` : model.catalogDirty ? `<p class="flow-muted">Grave primeiro as alterações do catálogo; o Flow deve usar apenas uma revisão confirmada no GitHub.</p>` : ""}
        ${validationErrors.length ? `<ul class="flow-errors">${validationErrors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : `<p class="flow-validity">Estrutura local conferida · Flow JSON ${flowJson?.version} · não validado pela Meta</p>`}
      </section>
      <section class="flow-json-card"><div class="flow-json-heading"><div><span class="eyebrow">Saída do wizard</span><h2>Flow JSON</h2></div><span class="subtle">Somente leitura</span></div><pre><code>${escapeHtml(flowText || "Selecione uma cesta ativa para gerar o JSON.")}</code></pre></section>
    </div>
    <section class="saved-flow-list"><div class="section-title"><div><span class="eyebrow">Histórico por canal</span><h2>Rascunhos salvos · final ${model.channel}</h2></div></div>${savedDrafts.length ? `<div class="saved-flow-grid">${savedDrafts.map((draft) => {
      const current = draft.catalogRevision === model.catalogRevision;
      const linkedBasket = model.baskets.find((item) => item.id === draft.basketId);
      return `<article><div><strong>${escapeHtml(linkedBasket?.name ?? draft.basketId)}</strong><span>${escapeHtml(draft.flowName)}</span></div><span class="flow-revision ${current ? "is-current" : ""}">${current ? "Revisão atual" : `Catálogo ${draft.catalogRevision.slice(0, 7)}`}</span></article>`;
    }).join("")}</div>` : `<p class="flow-muted">Este canal ainda não tem rascunhos gravados.</p>`}</section>`;
}
