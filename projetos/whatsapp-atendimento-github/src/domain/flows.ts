import { hasBlingProductId, type Basket, type BasketProductGroup, type Product, type BasketsDocument } from "./catalog.ts";
import { WHATSAPP_CHANNELS, type WhatsAppChannel } from "./channels.ts";
import { FLOW_MAX_PRODUCT_QUANTITY } from "./flow-runtime.ts";

export const FLOW_CHANNELS = WHATSAPP_CHANNELS;
export type FlowChannel = WhatsAppChannel;

const FLOW_VERSION = "7.3" as const;
const DATA_API_VERSION = "4.0" as const;
export const FLOW_NO_PRODUCT_ID = "__skip_product__";
const SAMPLE_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pOsAAAAASUVORK5CYII=";

export interface BasketFlowJson {
  version: typeof FLOW_VERSION;
  data_api_version: typeof DATA_API_VERSION;
  routing_model: {
    GROUP: ["CUSTOMER_REVIEW"];
    CUSTOMER_REVIEW: [];
  };
  screens: Array<{
    id: "GROUP" | "CUSTOMER_REVIEW";
    title: string;
    terminal: boolean;
    data: Record<string, unknown>;
    layout: {
      type: "SingleColumnLayout";
      children: Array<Record<string, unknown>>;
    };
  }>;
}

export interface BasketFlowDraft {
  flowName: string;
  basketId: string;
  catalogRevision: string;
  validationStatus: "local-only";
  flowJson: BasketFlowJson;
}

export interface ChannelFlowDocument {
  schemaVersion: 1;
  channel: FlowChannel;
  phoneNumberId: null;
  metaFlowId: null;
  drafts: BasketFlowDraft[];
}

export interface FlowDraftSnapshot {
  document: ChannelFlowDocument;
  commitSha: string;
  commitUrl: string;
}

export interface FlowDraftWriteSnapshot extends FlowDraftSnapshot {
  documents: Record<FlowChannel, ChannelFlowDocument>;
}

export interface SaveFlowDraftInput {
  expectedCommit: string;
  document: ChannelFlowDocument;
}

export function emptyChannelFlow(channel: FlowChannel): ChannelFlowDocument {
  return { schemaVersion: 1, channel, phoneNumberId: null, metaFlowId: null, drafts: [] };
}

function groupProducts(group: BasketProductGroup, products: Map<string, Product>): Product[] {
  return [...new Set(group.productIds)].flatMap((id) => {
    const product = products.get(id);
    return product?.active && hasBlingProductId(product) ? [product] : [];
  });
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function flowProductField(groupIndex: number): string {
  return `product_${String(groupIndex + 1).padStart(2, "0")}`;
}

export function flowQuantityField(groupIndex: number): string {
  return `quantity_${String(groupIndex + 1).padStart(2, "0")}`;
}

function productOption(product: Product): Record<string, unknown> {
  const details = [product.brand, product.presentation, formatMoney(product.unitPriceCents)].filter(Boolean).join(" · ");
  return {
    id: product.id,
    title: product.name.slice(0, 30),
    description: details.slice(0, 300),
  };
}

function arrayField(items: Array<Record<string, unknown>>, properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "array",
    items: { type: "object", properties },
    __example__: items,
  };
}

export function flowNameForBasket(basket: Basket): string {
  const id = basket.id.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `cesta-${id}`.slice(0, 60).replace(/-+$/g, "") || "cesta-atendimento";
}

/** Generates a local dynamic Flow draft; Meta Builder validation is still required. */
export function generateBasketFlow(basket: Basket, productsList: Product[]): BasketFlowJson {
  const products = new Map(productsList.map((product) => [product.id, product]));
  const firstGroup = basket.groups[0];
  const firstOptions = firstGroup ? groupProducts(firstGroup, products) : [];
  if (productsList.some((product) => product.id === FLOW_NO_PRODUCT_ID)) {
    throw new Error(`O ID reservado ${FLOW_NO_PRODUCT_ID} não pode ser usado por um produto.`);
  }
  const firstAvailableProduct = firstOptions.find((product) => product.active && product.stockQuantity > 0);
  const exampleOptions = [
    ...firstOptions.map((product) => ({ ...productOption(product), enabled: product.active && product.stockQuantity > 0 })),
    { id: FLOW_NO_PRODUCT_ID, title: "Não quero esse produto", description: "Retirar este tipo da cesta", enabled: true },
  ];
  const firstProductId = firstAvailableProduct?.id ?? FLOW_NO_PRODUCT_ID;
  const quantityOptions = Array.from({ length: FLOW_MAX_PRODUCT_QUANTITY }, (_, index) => ({
    id: String(index + 1),
    title: String(index + 1),
    enabled: Boolean(firstAvailableProduct),
  }));

  const groupData = {
    stepLabel: { type: "string", __example__: `Produto 1 de ${basket.groups.length}` },
    basketName: { type: "string", __example__: basket.name },
    groupLabel: { type: "string", __example__: firstGroup?.label ?? "Produto" },
    productOptions: arrayField(exampleOptions, {
      id: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      enabled: { type: "boolean" },
    }),
    quantityOptions: arrayField(quantityOptions, {
      id: { type: "string" },
      title: { type: "string" },
      enabled: { type: "boolean" },
    }),
    selectedProductId: { type: "string", __example__: firstProductId },
    selectedQuantity: { type: "string", __example__: String(Math.max(1, Math.min(FLOW_MAX_PRODUCT_QUANTITY, firstAvailableProduct?.stockQuantity ?? 1, firstGroup?.initialQuantity || 1))) },
    selectedImage: { type: "string", __example__: SAMPLE_IMAGE },
    imageAvailable: { type: "boolean", __example__: true },
    imageUnavailable: { type: "boolean", __example__: false },
    imageFallback: { type: "string", __example__: "Foto indisponível neste momento." },
    quantityVisible: { type: "boolean", __example__: Boolean(firstAvailableProduct) },
    quantityLabel: { type: "string", __example__: `Quantidade (1 a ${FLOW_MAX_PRODUCT_QUANTITY})` },
    totalDisplay: { type: "string", __example__: `Total atualizado: ${formatMoney(basket.basePriceCents)}` },
    selections_json: { type: "string", __example__: "{}" },
    error: { type: "string", __example__: "" },
  };

  const productChangePayload = {
    component_action: "product_change",
    product_id: "${form.product_id}",
    quantity: "${form.quantity}",
    selections_json: "${data.selections_json}",
  };
  const quantityChangePayload = {
    component_action: "quantity_change",
    product_id: "${form.product_id}",
    quantity: "${form.quantity}",
    selections_json: "${data.selections_json}",
  };

  const groupChildren: Array<Record<string, unknown>> = [
    { type: "TextHeading", text: "${data.stepLabel}" },
    { type: "TextSubheading", text: "${data.groupLabel}" },
    { type: "TextBody", text: "Escolha um produto. Para retirar este tipo da cesta, selecione a última opção." },
    { type: "Image", src: "${data.selectedImage}", "scale-type": "contain", visible: "${data.imageAvailable}" },
    { type: "TextBody", text: "${data.imageFallback}", visible: "${data.imageUnavailable}" },
    {
      type: "Dropdown",
      name: "product_id",
      label: "Produto",
      "data-source": "${data.productOptions}",
      required: true,
      "on-select-action": { name: "data_exchange", payload: productChangePayload },
    },
    {
      type: "Dropdown",
      name: "quantity",
      label: "${data.quantityLabel}",
      "data-source": "${data.quantityOptions}",
      required: "${data.quantityVisible}",
      visible: "${data.quantityVisible}",
      "on-select-action": { name: "data_exchange", payload: quantityChangePayload },
    },
    { type: "TextBody", text: "${data.totalDisplay}" },
    { type: "TextBody", text: "${data.error}" },
    {
      type: "Footer",
      label: "Continuar",
      "on-click-action": {
        name: "data_exchange",
        payload: {
          component_action: "continue",
          product_id: "${form.product_id}",
          quantity: "${form.quantity}",
          selections_json: "${data.selections_json}",
        },
      },
    },
  ];

  const addressExample = [{ id: "address-default", title: "Endereço cadastrado", description: "Endereço ativo confirmado", enabled: true }];
  const reviewData = {
    basketName: { type: "string", __example__: basket.name },
    selectionSummary: { type: "string", __example__: "2 × Produto de exemplo\n1 × Outro produto" },
    totalDisplay: { type: "string", __example__: formatMoney(basket.basePriceCents) },
    customerName: { type: "string", __example__: "Cliente" },
    reviewNote: { type: "string", __example__: "Confira o endereço e o pagamento antes de concluir." },
    flow_token: { type: "string", __example__: "example-flow-token-00000000000000000000000000000000" },
    selections_json: { type: "string", __example__: "{}" },
    defaultAddressId: { type: "string", __example__: "address-default" },
    addressOptions: arrayField(addressExample, {
      id: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      enabled: { type: "boolean" },
    }),
  };

  return {
    version: FLOW_VERSION,
    data_api_version: DATA_API_VERSION,
    routing_model: { GROUP: ["CUSTOMER_REVIEW"], CUSTOMER_REVIEW: [] },
    screens: [
      {
        id: "GROUP",
        title: "Monte sua cesta",
        terminal: false,
        data: groupData,
        layout: {
          type: "SingleColumnLayout",
          children: [{
            type: "Form",
            name: "basket_group",
            "init-values": {
              product_id: "${data.selectedProductId}",
              quantity: "${data.selectedQuantity}",
            },
            children: groupChildren,
          }],
        },
      },
      {
        id: "CUSTOMER_REVIEW",
        title: "Revisar pedido",
        terminal: true,
        data: reviewData,
        layout: {
          type: "SingleColumnLayout",
          children: [{
            type: "Form",
            name: "checkout",
            "init-values": { address_id: "${data.defaultAddressId}" },
            children: [
              { type: "TextHeading", text: "Revise sua cesta ${data.basketName}" },
              { type: "TextBody", text: "${data.selectionSummary}" },
              { type: "TextSubheading", text: "Total da cesta" },
              { type: "TextBody", text: "${data.totalDisplay}" },
              { type: "TextSubheading", text: "Cliente" },
              { type: "TextBody", text: "${data.customerName}" },
              { type: "TextBody", text: "${data.reviewNote}" },
              {
                type: "Dropdown",
                name: "address_id",
                label: "Endereço de entrega",
                "data-source": "${data.addressOptions}",
                required: true,
              },
              {
                type: "Dropdown",
                name: "payment_method",
                label: "Pagamento",
                "data-source": [
                  { id: "pix", title: "Pix" },
                  { id: "cash", title: "Dinheiro" },
                  { id: "debit_card", title: "Cartão de débito" },
                  { id: "credit_card", title: "Cartão de crédito" },
                ],
                required: true,
              },
              {
                type: "Footer",
                label: "Concluir e receber resumo",
                "on-click-action": {
                  name: "complete",
                  payload: {
                    contract_version: 1,
                    flow_token: "${data.flow_token}",
                    selections: "${data.selections_json}",
                    address_id: "${form.address_id}",
                    payment_method: "${form.payment_method}",
                  },
                },
              },
            ],
          }],
        },
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function validateBasketFlow(basket: Basket, products: Product[], value: unknown): string[] {
  if (!isRecord(value)) return ["Flow JSON deve ser um objeto"];
  if (!hasOnlyKeys(value, ["version", "data_api_version", "routing_model", "screens"])) {
    return ["Flow JSON contém campos não permitidos"];
  }
  const expected = generateBasketFlow(basket, products);
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    return ["O JSON diverge do rascunho gerado para esta cesta. Gere novamente antes de gravar."];
  }
  return [];
}

export function validateChannelFlowDocument(
  value: unknown,
  expectedChannel: FlowChannel,
  baskets: BasketsDocument["baskets"],
  products: Product[],
  expectedCatalogRevision?: string,
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["Documento do canal deve ser um objeto"];
  if (!hasOnlyKeys(value, ["schemaVersion", "channel", "phoneNumberId", "metaFlowId", "drafts"])) {
    errors.push("Documento do canal contém campos não permitidos");
  }
  if (value.schemaVersion !== 1) errors.push("schemaVersion do canal deve ser 1");
  if (value.channel !== expectedChannel) errors.push("O canal do arquivo não corresponde à rota solicitada");
  if (value.phoneNumberId !== null || value.metaFlowId !== null) {
    errors.push("IDs Meta permanecem nulos até confirmação oficial e homologação");
  }
  if (!Array.isArray(value.drafts)) return [...errors, "drafts deve ser uma lista"];

  const basketById = new Map(baskets.map((basket) => [basket.id, basket]));
  const draftBasketIds = new Set<string>();
  const flowNames = new Set<string>();
  for (const [index, rawDraft] of value.drafts.entries()) {
    const at = `drafts[${index}]`;
    if (!isRecord(rawDraft)) {
      errors.push(`${at} deve ser um objeto`);
      continue;
    }
    if (!hasOnlyKeys(rawDraft, ["flowName", "basketId", "catalogRevision", "validationStatus", "flowJson"])) {
      errors.push(`${at} contém campos não permitidos`);
    }
    if (typeof rawDraft.flowName !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawDraft.flowName) || rawDraft.flowName.length > 60) {
      errors.push(`${at}.flowName deve usar letras minúsculas, números e hífen (até 60 caracteres)`);
    } else if (flowNames.has(rawDraft.flowName)) errors.push(`${at}.flowName está duplicado`);
    else flowNames.add(rawDraft.flowName);
    if (typeof rawDraft.basketId !== "string") {
      errors.push(`${at}.basketId deve ser texto`);
      continue;
    }
    if (draftBasketIds.has(rawDraft.basketId)) errors.push(`${at}.basketId está duplicado no canal`);
    draftBasketIds.add(rawDraft.basketId);
    const basket = basketById.get(rawDraft.basketId);
    if (expectedCatalogRevision && (!basket || !basket.active)) {
      errors.push(`${at}.basketId deve apontar para uma cesta ativa`);
      continue;
    }
    if (typeof rawDraft.catalogRevision !== "string" || !/^[0-9a-f]{40}:[0-9a-f]{40}$/i.test(rawDraft.catalogRevision)) {
      errors.push(`${at}.catalogRevision deve conter a revisão dos documentos de catálogo associados`);
    }
    if (rawDraft.validationStatus !== "local-only") errors.push(`${at}.validationStatus deve permanecer local-only`);
    if (expectedCatalogRevision) {
      if (rawDraft.catalogRevision !== expectedCatalogRevision) errors.push(`${at} está associado a uma revisão antiga do catálogo`);
      if (!basket) continue;
      errors.push(...validateBasketFlow(basket, products, rawDraft.flowJson).map((error) => `${at}: ${error}`));
    } else if (!isRecord(rawDraft.flowJson) || rawDraft.flowJson.version !== FLOW_VERSION || !Array.isArray(rawDraft.flowJson.screens)) {
      errors.push(`${at}.flowJson não tem a estrutura mínima esperada`);
    }
  }
  return errors;
}
