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
  metaChannel: MetaChannelStatus;
  selectedMetaFlowId: string;
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

export interface MetaChannelStatus {
  channel: FlowChannel;
  loaded: boolean;
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
  const selectedMetaFlow = model.metaChannel.flows.find((flow) => flow.id === model.selectedMetaFlowId);
  const selectedCanBind = Boolean(selectedMetaFlow
    && selectedMetaFlow.status === "PUBLISHED"
    && selectedMetaFlow.uploadedByAdmin
    && selectedMetaFlow.validationErrors.length === 0
    && selectedMetaFlow.endpointUri === model.metaChannel.endpointUri
    && model.metaChannel.encryptionConfigured
    && model.metaChannel.bindingStoreReady);
  const metaBlockers = model.metaChannel.blockers.length
    ? `<ul>${model.metaChannel.blockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join("")}</ul>`
    : "";
  const status = savedForBasket
    ? savedForBasket.catalogRevision === model.catalogRevision
      ? "Rascunho salvo nesta revisão do catálogo"
      : `Rascunho salvo em ${savedForBasket.catalogRevision.slice(0, 7)}; gere novamente para a revisão atual`
    : "Ainda não salvo no GitHub";

  return `<section class="workspace-heading">
      <div><span class="eyebrow">Mesmo conteúdo nos dois números · ${savedDrafts.length} rascunho(s) neste canal</span><h1>Flows</h1><p>O JSON é gerado pelas mesmas cestas, produtos e regras para 0975 e 1018; a conta Meta e o vínculo são próprios de cada número.</p></div>
    </section>
    <div class="flow-safety-note"><strong>Conteúdo igual, configuração por canal</strong><span>Os dois números usam o mesmo JSON de Flow, catálogo e regras. WABA, ID do Flow, chave de criptografia, status e vínculo são separados por canal. O rascunho salvo no GitHub não altera a Meta; ações de envio, criptografia ou publicação só ocorrem quando acionadas aqui.</span></div>
    <section class="meta-flow-admin"><div class="meta-flow-heading"><div><span class="eyebrow">Deploy por conta Meta</span><h2>Final ${model.channel}</h2><p>${model.metaChannel.accountName ? escapeHtml(model.metaChannel.accountName) : "Conta vinculada por canal no servidor"}</p></div><button class="button button-soft" data-action="meta-refresh" ${model.busy ? "disabled" : ""}>Atualizar status</button></div>
      ${!model.metaChannel.loaded ? `<p class="flow-muted">Status Meta ainda não carregado. Atualize para consultar somente leitura.</p>` : model.metaChannel.configured ? `<div class="meta-flow-readiness"><span>WABA associado no servidor</span><strong>${model.metaChannel.encryptionConfigured ? "Chave de endpoint configurada" : "Chave de endpoint pendente"}</strong></div>${metaBlockers ? `<div class="flow-muted">Há configuração operacional pendente.${metaBlockers}</div>` : ""}` : `<div class="flow-muted">Meta ainda não configurada para este canal.${metaBlockers}</div>`}
      ${model.metaChannel.configured ? `<div class="meta-flow-controls"><div class="form-grid"><label>Novo Flow (rascunho)<input id="meta-flow-name" maxlength="60" value="${escapeHtml(model.flowName)}"></label><button class="button button-soft" data-action="meta-create" ${model.busy ? "disabled" : ""}>Criar rascunho na Meta</button></div>
        <div class="form-grid"><label>Flow deste WABA<select id="meta-flow-select"><option value="">Selecione um Flow da conta</option>${model.metaChannel.flows.map((flow) => `<option value="${escapeHtml(flow.id)}" ${flow.id === model.selectedMetaFlowId ? "selected" : ""}>${escapeHtml(flow.name)} · ${escapeHtml(flow.status)} · ${escapeHtml(flow.id)}${flow.uploadedByAdmin ? " · JSON novo verificado" : " · Flow externo"}</option>`).join("")}</select></label><button class="button button-soft" data-action="meta-upload" ${!selectedMetaFlow || model.busy || !flowJson || validationErrors.length ? "disabled" : ""}>Enviar JSON e endpoint</button></div>
        ${selectedMetaFlow ? `<div class="meta-flow-selected"><span>Status: <strong>${escapeHtml(selectedMetaFlow.status)}</strong></span><span>Endpoint: ${selectedMetaFlow.endpointUri ? escapeHtml(selectedMetaFlow.endpointUri) : "não configurado"}</span><span>JSON gerado pelo Admin novo: <strong>${selectedMetaFlow.uploadedByAdmin ? "sim" : "não · envie o JSON para habilitar o vínculo"}</strong></span>${selectedMetaFlow.validationErrors.length ? `<ul>${selectedMetaFlow.validationErrors.slice(0, 5).map(escapeHtml).map((item) => `<li>${item}</li>`).join("")}</ul>` : `<span>Sem erros de validação reportados pela Meta.</span>`}</div>` : ""}
        <div class="meta-flow-binding"><span>Flow vinculado ao canal: <strong>${model.metaChannel.activeBinding ? `${escapeHtml(model.metaChannel.activeBinding.flowId)} · tela ${escapeHtml(model.metaChannel.activeBinding.firstScreen)}` : "nenhum"}</strong></span><div>${model.metaChannel.activeBinding ? `<button class="button button-soft" data-action="meta-unbind" ${model.busy || !model.metaChannel.bindingStoreReady ? "disabled" : ""}>Remover vínculo</button>` : ""}<button class="button button-primary" data-action="meta-bind" ${!selectedCanBind || model.busy || selectedMetaFlow?.id === model.metaChannel.activeBinding?.flowId ? "disabled" : ""}>Vincular Flow publicado ao canal</button></div></div>
        <p class="flow-muted">Vincular define qual Flow será usado por este número. O envio continua desligado pela chave global do worker.</p>
        <div class="meta-flow-controls-footer"><span>${model.metaChannel.endpointUri ? `Endpoint do runtime: ${escapeHtml(model.metaChannel.endpointUri)}` : "Endpoint do runtime não configurado no servidor."}</span><button class="button button-soft" data-action="meta-encryption" ${model.busy || model.metaChannel.encryptionConfigured ? "disabled" : ""}>Configurar chave do endpoint</button><button class="button button-primary" data-action="meta-publish" ${!selectedMetaFlow || model.busy || selectedMetaFlow.status !== "DRAFT" || selectedMetaFlow.validationErrors.length > 0 || !model.metaChannel.encryptionConfigured ? "disabled title=Exige%20Flow%20DRAFT%20validado%20e%20endpoint%20criptografado" : ""}>Publicar Flow</button></div>
        <p class="flow-muted">Publicar torna o Flow imutável. Use esta ação apenas depois de validar no aparelho e de confirmar a conta e o endpoint.</p>
      </div>` : ""}
    </section>
    ${model.notice ? `<div class="notice notice-${model.noticeType}" role="status"><span>${escapeHtml(model.notice)}</span><button data-action="clear-notice" aria-label="Fechar">×</button></div>` : ""}
    <div class="flow-layout">
      <section class="flow-editor-card">
        <div class="section-title"><div><span class="eyebrow">Configuração por número</span><h2>Canal de atendimento</h2></div></div>
        <div class="flow-channel-picker">${FLOW_CHANNELS.map((channel) => `<button type="button" class="flow-channel ${channel === model.channel ? "is-selected" : ""}" data-action="select-flow-channel" data-channel="${channel}"><strong>Final ${channel}</strong><small>${channel === model.channel && model.metaChannel.configured ? "Conta Meta conectada" : channel === model.channel && model.metaChannel.loaded ? "Configuração pendente" : "Status próprio por canal"}</small></button>`).join("")}</div>
        <div class="flow-fields">
          <label>Tamanho da cesta<select id="flow-basket">${model.baskets.filter((item) => item.active).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === model.basketId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
          <label>Nome técnico do Flow<input id="flow-name" maxlength="60" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="${escapeHtml(model.flowName || (basket ? flowNameForBasket(basket) : ""))}" placeholder="cesta-mini"></label>
        </div>
        ${basket ? `<div class="flow-basket-summary"><div><span class="eyebrow">Cesta associada</span><strong>${escapeHtml(basket.name)} · ${optionCount} produtos possíveis</strong></div><span>${basket.groups.length} tipos</span></div><div class="flow-group-list">${basket.groups.map((group) => `<div><strong>${escapeHtml(group.label)}</strong><span>1–6 unidades conforme estoque GitHub · ${new Set(group.productIds).size} opções + retirada</span></div>`).join("")}</div><section class="flow-simulator"><div class="flow-json-heading"><div><span class="eyebrow">Prévia controlada no navegador</span><h2>Uma escolha por tipo</h2></div><span class="subtle">Sem WhatsApp ou rede</span></div><p>O saldo exibido vem do catálogo GitHub versionado. A quantidade vai de 1 a 6, limitada ao saldo disponível nesta revisão; pedidos confirmados baixam o estoque no servidor.</p>${basket.groups.map((group, groupIndex) => {
          const productKey = `${basket.id}:${flowProductField(groupIndex)}`;
          const quantityKey = `${basket.id}:${flowQuantityField(groupIndex)}`;
          const activeProducts = group.productIds.flatMap((id) => {
            const product = productsById.get(id);
            return product?.active ? [product] : [];
          });
          const requestedProductId = model.productChoices.get(productKey);
          const defaultProduct = activeProducts.find((product) => product.stockQuantity > 0);
          const requestedProduct = activeProducts.find((product) => product.id === requestedProductId && product.stockQuantity > 0);
          const selectedProductId = requestedProductId === FLOW_NO_PRODUCT_ID
            ? FLOW_NO_PRODUCT_ID
            : requestedProduct?.id ?? defaultProduct?.id ?? FLOW_NO_PRODUCT_ID;
          const selectedProduct = activeProducts.find((product) => product.id === selectedProductId);
          const removed = selectedProductId === FLOW_NO_PRODUCT_ID;
          const quantityLimit = selectedProduct ? Math.min(6, group.maximumQuantity, selectedProduct.stockQuantity) : 0;
          const requestedQuantity = model.quantities.get(quantityKey) ?? Math.max(1, group.initialQuantity || 1);
          const quantity = quantityLimit ? Math.min(quantityLimit, Math.max(1, requestedQuantity)) : 0;
          const productOptions = activeProducts.map((product) => {
            const label = `${product.name} · ${product.brand} · ${money(product.unitPriceCents)}`;
            return `<option value="${escapeHtml(product.id)}" ${product.stockQuantity <= 0 ? "disabled" : ""} ${product.id === selectedProductId ? "selected" : ""}>${escapeHtml(label)}${product.stockQuantity <= 0 ? " · sem estoque" : ` · até ${Math.min(6, product.stockQuantity)} un.`}</option>`;
          }).join("");
          const quantityOptions = Array.from({ length: quantityLimit }, (_, index) => index + 1)
            .map((value) => `<option value="${value}" ${value === quantity ? "selected" : ""}>${value}</option>`).join("");
          return `<fieldset class="flow-simulation-group"><legend>${escapeHtml(group.label)}</legend><label>Produto<select data-flow-product="${groupIndex}">${productOptions}<option value="${FLOW_NO_PRODUCT_ID}" ${removed ? "selected" : ""}>Não quero esse produto</option></select></label><label ${removed ? "hidden" : ""}>Quantidade<select data-flow-quantity="${groupIndex}">${quantityOptions}</select></label><span class="flow-group-count is-valid" data-flow-group-count="${groupIndex}">${removed ? "Este tipo será retirado da cesta." : `${quantity} unidade(s) · ${escapeHtml(selectedProduct?.name ?? "Produto selecionado")}`}</span></fieldset>`;
        }).join("")}</section>` : ""}
        <div class="flow-channel-status"><span class="status-pill is-inactive">${escapeHtml(status)}</span><span>${selectedMetaFlow ? `Flow Meta ${escapeHtml(selectedMetaFlow.id)} · ${escapeHtml(selectedMetaFlow.status)}` : "Nenhum Flow Meta selecionado neste canal"}</span></div>
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
