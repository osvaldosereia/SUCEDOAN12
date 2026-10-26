import type { Basket, BasketProductGroup, Product, BasketsDocument } from "./catalog";

export const FLOW_CHANNELS = ["0975", "1018"] as const;
export type FlowChannel = typeof FLOW_CHANNELS[number];

export interface BasketFlowJson {
  version: "3.1";
  screens: Array<{
    id: "BASKET_ORDER";
    title: string;
    terminal: true;
    data: Record<string, never>;
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
    return product ? [product] : [];
  });
}

export function flowQuantityField(groupIndex: number, productIndex: number): string {
  return `quantity_${String(groupIndex + 1).padStart(2, "0")}_${String(productIndex + 1).padStart(2, "0")}`;
}

export function flowNameForBasket(basket: Basket): string {
  const id = basket.id.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `cesta-${id}`.slice(0, 60).replace(/-+$/g, "") || "cesta-atendimento";
}

/** Generates the local one-screen quantity draft; it is not Meta-validated. */
export function generateBasketFlow(basket: Basket, productsList: Product[]): BasketFlowJson {
  const products = new Map(productsList.map((product) => [product.id, product]));
  const children: Array<Record<string, unknown>> = [
    { type: "TextHeading", text: `Monte sua cesta ${basket.name}` },
    { type: "TextBody", text: "Informe a quantidade para cada produto. Deixe em branco para não incluir. O atendimento confirmará o total antes de concluir o pedido." },
  ];
  const payload: Record<string, string> = { basket_id: basket.id };

  basket.groups.forEach((group, groupIndex) => {
    children.push({ type: "TextSubheading", text: group.label });
    children.push({
      type: "TextBody",
      text: `Escolha entre ${group.minimumQuantity} e ${group.maximumQuantity} unidade(s) neste tipo. A quantidade inicial cadastrada é ${group.initialQuantity}.`,
    });
    const options = groupProducts(group, products);
    options.forEach((product, productIndex) => {
      const name = flowQuantityField(groupIndex, productIndex);
      children.push({
        type: "TextInput",
        name,
        label: `Quantidade — ${product.name} (${product.brand})`,
        "input-type": "number",
        required: false,
      });
      payload[name] = "${form." + name + "}";
    });
  });

  children.push({
    type: "Footer",
    label: "Enviar escolhas",
    "on-click-action": { name: "complete", payload },
  });

  return {
    version: "3.1",
    screens: [{
      id: "BASKET_ORDER",
      title: basket.name.slice(0, 30),
      terminal: true,
      data: {},
      layout: { type: "SingleColumnLayout", children: [{ type: "Form", name: "basket", children }] },
    }],
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
  if (!hasOnlyKeys(value, ["version", "screens"])) return ["Flow JSON contém campos não permitidos"];
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
    } else if (!isRecord(rawDraft.flowJson) || rawDraft.flowJson.version !== "3.1" || !Array.isArray(rawDraft.flowJson.screens)) {
      errors.push(`${at}.flowJson não tem a estrutura mínima esperada`);
    }
  }
  return errors;
}
