import {
  normalizeCity,
  normalizeDigits,
  PAYMENT_METHODS,
  type CheckoutOrderRequest,
  type PaymentMethod,
} from '../../core/checkout-order.ts';

export interface FlowCatalogProduct {
  readonly sku: string;
  readonly name: string;
  readonly active: boolean;
  readonly stock: number;
  readonly priceCents?: number;
}

export interface FlowCatalogType {
  readonly id: string;
  readonly name: string;
  readonly productSkus: readonly string[];
  readonly active?: boolean;
  readonly order?: number;
}

export interface FlowCatalogBasket {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly lines: readonly {
    readonly typeId: string;
    readonly defaultQuantity: number;
    readonly order: number;
  }[];
}

export interface FlowCatalogExtra {
  readonly typeId: string;
  readonly active: boolean;
  readonly order: number;
}

export interface WhatsAppFlowCatalog {
  readonly products: readonly FlowCatalogProduct[];
  readonly types: readonly FlowCatalogType[];
  readonly baskets: readonly FlowCatalogBasket[];
  readonly extras: readonly FlowCatalogExtra[];
}

export interface WhatsAppFlowScreenResponse {
  readonly screen?: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface WhatsAppFlowControllerDependencies {
  readonly readCatalog: () => Promise<WhatsAppFlowCatalog>;
  readonly quote: (payload: CheckoutOrderRequest) => Promise<unknown>;
  readonly verifyFlowToken: (token: string) => Promise<boolean>;
}

interface ProductOption {
  readonly id: string;
  readonly title: string;
}

interface ProductGroup {
  readonly typeId: string;
  readonly typeName: string;
  readonly quantity: number;
  readonly options: readonly ProductOption[];
}

interface ExtraGroup {
  readonly typeId: string;
  readonly typeName: string;
  readonly options: readonly ProductOption[];
}

const MAX_BASKETS = 20;
const MAX_ACTIVE_PRODUCTS = 50;
const MAX_OPTIONS_PER_GROUP = 50;
const MAX_RESPONSE_CHARACTERS = 32_000;
const MAX_QUANTITY = 99;

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Campo de Flow inválido: ${field}.`);
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, field: string, maxLength = 160): string {
  if (typeof value !== 'string') throw new Error(`Campo de Flow inválido: ${field}.`);
  const result = value.trim();
  if (!result || result.length > maxLength) throw new Error(`Campo de Flow inválido: ${field}.`);
  return result;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d{1,3}$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_QUANTITY)
    throw new Error(`Quantidade inválida: ${field}.`);
  return parsed;
}

function makeResponse(screen: string, data: Record<string, unknown>): WhatsAppFlowScreenResponse {
  const response: WhatsAppFlowScreenResponse = { screen, data };
  if (JSON.stringify(response).length > MAX_RESPONSE_CHARACTERS)
    throw new Error('A resposta dinâmica do Flow excede o limite permitido.');
  return response;
}

function activeProducts(catalog: WhatsAppFlowCatalog): FlowCatalogProduct[] {
  if (!Array.isArray(catalog.products)) throw new Error('Catálogo público inválido.');
  const active = catalog.products.filter(
    (product) =>
      product.active === true &&
      Number.isSafeInteger(product.stock) &&
      product.stock > 0 &&
      typeof product.sku === 'string' &&
      typeof product.name === 'string',
  );
  if (active.length > MAX_ACTIVE_PRODUCTS)
    throw new Error('O catálogo excede o limite de opções do WhatsApp Flow.');
  return active;
}

function productOptions(
  catalog: WhatsAppFlowCatalog,
  typeId: string,
  products: readonly FlowCatalogProduct[],
): ProductOption[] {
  const type = catalog.types.find((item) => item.id === typeId && item.active !== false);
  if (!type || !Array.isArray(type.productSkus)) return [];
  const available = products
    .filter((product) => type.productSkus.includes(product.sku))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  if (available.length > MAX_OPTIONS_PER_GROUP)
    throw new Error('O grupo de produtos excede o limite do WhatsApp Flow.');
  return available.map((product) => ({
    id: text(product.sku, 'SKU', 128),
    title: text(product.name, 'produto', 100),
  }));
}

function productGroupsForBasket(
  catalog: WhatsAppFlowCatalog,
  basket: FlowCatalogBasket,
  products: readonly FlowCatalogProduct[],
): ProductGroup[] {
  return basket.lines
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((line) => {
      const type = catalog.types.find((item) => item.id === line.typeId && item.active !== false);
      const options = productOptions(catalog, line.typeId, products);
      if (!type || options.length === 0) throw new Error('Uma cesta contém opções indisponíveis.');
      return {
        typeId: text(type.id, 'tipo de produto', 128),
        typeName: text(type.name, 'grupo de produtos', 100),
        quantity: positiveInteger(line.defaultQuantity, 'quantidade da cesta'),
        options,
      };
    });
}

function extraGroups(
  catalog: WhatsAppFlowCatalog,
  products: readonly FlowCatalogProduct[],
): ExtraGroup[] {
  if (!Array.isArray(catalog.extras)) throw new Error('Catálogo público inválido.');
  const groups: ExtraGroup[] = [];
  const extras = catalog.extras
    .filter((extra) => extra.active === true)
    .slice()
    .sort((left, right) => left.order - right.order);

  for (const extra of extras) {
    const type = catalog.types.find((item) => item.id === extra.typeId && item.active !== false);
    const options = productOptions(catalog, extra.typeId, products);
    if (!type || options.length === 0) continue;
    groups.push({
      typeId: text(type.id, 'tipo extra', 128),
      typeName: text(type.name, 'grupo extra', 100),
      options,
    });
  }
  return groups;
}

function availableBaskets(
  catalog: WhatsAppFlowCatalog,
  products: readonly FlowCatalogProduct[],
): { readonly id: string; readonly title: string }[] {
  if (!Array.isArray(catalog.baskets)) throw new Error('Catálogo público inválido.');
  const active = catalog.baskets.filter((basket) => basket.active === true);
  if (active.length > MAX_BASKETS)
    throw new Error('O catálogo excede o limite de cestas do WhatsApp Flow.');

  return active
    .filter((basket) => {
      if (!Array.isArray(basket.lines) || basket.lines.length === 0) return false;
      try {
        productGroupsForBasket(catalog, basket, products);
        return true;
      } catch {
        return false;
      }
    })
    .map((basket) => ({
      id: text(basket.id, 'cesta', 128),
      title: text(basket.name, 'nome da cesta', 100),
    }));
}

function basketById(catalog: WhatsAppFlowCatalog, basketId: string): FlowCatalogBasket | null {
  return catalog.baskets.find((basket) => basket.active === true && basket.id === basketId) ?? null;
}

function parseSelectedLines(
  value: unknown,
  groups: readonly { readonly typeId: string; readonly options: readonly ProductOption[] }[],
  field: string,
  required: boolean,
): { typeId: string; sku: string; quantity: number }[] {
  if (!Array.isArray(value)) {
    if (!required && (value === undefined || value === null)) return [];
    throw new Error(`Seleção inválida: ${field}.`);
  }
  if (value.length > MAX_OPTIONS_PER_GROUP) throw new Error(`Seleção inválida: ${field}.`);

  const selected = value.map((entry, index) => {
    const row = asRecord(entry, `${field}[${index}]`);
    const typeId = text(row.typeId, 'tipo', 128);
    const sku = text(row.sku, 'SKU', 128);
    const options = groups.find((group) => group.typeId === typeId)?.options ?? [];
    if (!options.some((option) => option.id === sku))
      throw new Error(`Produto indisponível: ${field}.`);
    return { typeId, sku, quantity: positiveInteger(row.quantity, 'produto') };
  });

  if (new Set(selected.map((line) => line.typeId)).size !== selected.length)
    throw new Error(`Seleção duplicada: ${field}.`);
  if (required && groups.some((group) => !selected.some((line) => line.typeId === group.typeId)))
    throw new Error(`Faltam itens obrigatórios: ${field}.`);
  return selected;
}

function optionalText(value: unknown, field: string, maxLength = 160): string {
  if (value === undefined || value === null || value === '') return '';
  return text(value, field, maxLength);
}

function normalizePhone(value: unknown): string {
  let digits = normalizeDigits(text(value, 'telefone', 32));
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13))
    digits = digits.slice(2);
  if (!/^\d{10,11}$/.test(digits)) throw new Error('Telefone inválido.');
  return digits;
}

function deliveryDate(value: unknown): string {
  const date = text(value, 'data de entrega', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data de entrega inválida.');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date)
    throw new Error('Data de entrega inválida.');
  return date;
}

function checkoutRequest(
  catalog: WhatsAppFlowCatalog,
  products: readonly FlowCatalogProduct[],
  data: Record<string, unknown>,
  flowToken: string,
): CheckoutOrderRequest {
  if (!/^[A-Za-z0-9._-]{16,120}$/.test(flowToken)) throw new Error('Token do Flow inválido.');
  const basketId = text(data.basketId, 'cesta', 128);
  const basket = basketById(catalog, basketId);
  if (!basket) throw new Error('Cesta indisponível.');
  const basketGroups = productGroupsForBasket(catalog, basket, products);
  const basketLines = parseSelectedLines(data.basketLines, basketGroups, 'cesta', true);
  const extras = parseSelectedLines(
    data.extraLines,
    extraGroups(catalog, products),
    'extras',
    false,
  );

  const customerName = text(data.customerName, 'nome', 120);
  if (customerName.length < 3) throw new Error('Nome inválido.');
  const city = normalizeCity(text(data.city, 'cidade', 80));
  if (!city) throw new Error('Cidade fora da área de entrega.');
  const rawPaymentMethod = text(data.paymentMethod, 'forma de pagamento', 40);
  if (!(PAYMENT_METHODS as readonly string[]).includes(rawPaymentMethod))
    throw new Error('Forma de pagamento inválida.');
  const postalCode = normalizeDigits(text(data.postalCode, 'CEP', 16));
  if (!/^\d{8}$/.test(postalCode)) throw new Error('CEP inválido.');

  return {
    basketId,
    basketQuantity: positiveInteger(data.basketQuantity, 'cesta'),
    basketLines,
    extraLines: extras,
    customer: {
      name: customerName,
      phone: normalizePhone(data.phone),
      address: {
        recipientName: optionalText(data.recipientName, 'destinatário', 120) || customerName,
        postalCode,
        street: text(data.street, 'logradouro', 160),
        streetNumber: text(data.streetNumber, 'número', 32),
        complement: optionalText(data.complement, 'complemento', 120),
        neighborhood: text(data.neighborhood, 'bairro', 120),
        city,
        stateCode: 'MT',
        referenceNote: optionalText(data.referenceNote, 'referência', 240),
      },
    },
    paymentMethod: rawPaymentMethod as PaymentMethod,
    deliveryDate: deliveryDate(data.deliveryDate),
    idempotencyKey: `flow:${flowToken}`,
  };
}

function publicReviewData(
  request: CheckoutOrderRequest,
  flowToken: string,
  quoteValue: unknown,
): Record<string, unknown> {
  const quote = asRecord(quoteValue, 'cotação');
  if (
    'privateAdjustmentCents' in quote ||
    'unitPriceCents' in quote ||
    'sku' in quote ||
    !Number.isSafeInteger(quote.totalCents) ||
    Number(quote.totalCents) < 0
  )
    throw new Error('Cotação pública inválida.');

  return {
    flow_token: flowToken,
    basketId: request.basketId,
    basketQuantity: request.basketQuantity,
    basketLines: request.basketLines,
    extraLines: request.extraLines,
    customerName: request.customer.name,
    phone: request.customer.phone,
    recipientName: request.customer.address.recipientName,
    postalCode: request.customer.address.postalCode,
    street: request.customer.address.street,
    streetNumber: request.customer.address.streetNumber,
    complement: request.customer.address.complement,
    neighborhood: request.customer.address.neighborhood,
    city: request.customer.address.city,
    referenceNote: request.customer.address.referenceNote,
    paymentMethod: request.paymentMethod,
    deliveryDate: request.deliveryDate,
    totalCents: Number(quote.totalCents),
    totalLabel: new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(quote.totalCents) / 100),
  };
}

export function createWhatsAppFlowController(
  dependencies: WhatsAppFlowControllerDependencies,
): (input: unknown) => Promise<WhatsAppFlowScreenResponse> {
  const loadCatalog = async (): Promise<WhatsAppFlowCatalog> => dependencies.readCatalog();

  return async (input) => {
    const body = asRecord(input, 'requisição');
    const action = text(body.action, 'action', 40);
    const data = optionalRecord(body.data);

    if (action === 'ping') return { data: { status: 'active' } };

    const flowToken = typeof body.flow_token === 'string' ? body.flow_token : '';
    if (!flowToken || !(await dependencies.verifyFlowToken(flowToken)))
      throw new Error('Token do WhatsApp Flow inválido.');
    if (data.error) return { data: { acknowledged: true } };
    if (!['INIT', 'data_exchange', 'BACK'].includes(action))
      throw new Error('Ação do WhatsApp Flow não suportada.');

    if (action === 'INIT' || (action === 'BACK' && body.screen === 'PRODUCTS')) {
      let catalog: WhatsAppFlowCatalog;
      try {
        catalog = await loadCatalog();
        const products = activeProducts(catalog);
        const baskets = availableBaskets(catalog, products);
        return makeResponse(
          'BASKET',
          baskets.length
            ? { baskets }
            : {
                baskets: [],
                errorMessage: 'As opções de compra estão temporariamente indisponíveis.',
              },
        );
      } catch {
        if (action === 'BACK') throw new Error('Não foi possível carregar as opções do catálogo.');
        return makeResponse('BASKET', {
          baskets: [],
          errorMessage: 'As opções de compra estão temporariamente indisponíveis.',
        });
      }
    }

    if (action === 'data_exchange' && body.screen === 'BASKET') {
      let catalog: WhatsAppFlowCatalog;
      try {
        catalog = await loadCatalog();
        const products = activeProducts(catalog);
        const baskets = availableBaskets(catalog, products);
        const basketId = text(data.basketId, 'cesta', 128);
        const basket = basketById(catalog, basketId);
        if (!basket || !baskets.some((option) => option.id === basketId))
          return makeResponse('BASKET', {
            baskets,
            errorMessage: 'Esta cesta está temporariamente indisponível.',
          });

        return makeResponse('PRODUCTS', {
          basketId: basket.id,
          basketName: basket.name,
          basketQuantity: positiveInteger(data.basketQuantity, 'cesta'),
          productGroups: productGroupsForBasket(catalog, basket, products),
          extraGroups: extraGroups(catalog, products),
        });
      } catch {
        return makeResponse('BASKET', {
          baskets: [],
          errorMessage: 'As opções de compra estão temporariamente indisponíveis.',
        });
      }
    }

    if (action === 'data_exchange' && body.screen === 'PRODUCTS') {
      let catalog: WhatsAppFlowCatalog;
      let products: FlowCatalogProduct[];
      let baskets: { readonly id: string; readonly title: string }[];
      try {
        catalog = await loadCatalog();
        products = activeProducts(catalog);
        baskets = availableBaskets(catalog, products);
      } catch {
        return makeResponse('BASKET', {
          baskets: [],
          errorMessage: 'As opções de compra estão temporariamente indisponíveis.',
        });
      }

      const basketId = typeof data.basketId === 'string' ? data.basketId : '';
      const basket = basketById(catalog, basketId);
      if (!basket || !baskets.some((option) => option.id === basketId))
        return makeResponse('BASKET', {
          baskets,
          errorMessage: 'Esta cesta está temporariamente indisponível.',
        });

      const productGroups = productGroupsForBasket(catalog, basket, products);
      const allExtraGroups = extraGroups(catalog, products);
      try {
        const selectedBasketLines = parseSelectedLines(
          data.basketLines,
          productGroups,
          'cesta',
          true,
        );
        const selectedExtraLines = parseSelectedLines(
          data.extraLines,
          allExtraGroups,
          'extras',
          false,
        );

        return makeResponse('CUSTOMER', {
          basketId: basket.id,
          basketName: basket.name,
          basketQuantity: positiveInteger(data.basketQuantity, 'cesta'),
          basketLines: selectedBasketLines,
          extraLines: selectedExtraLines,
        });
      } catch {
        return makeResponse('PRODUCTS', {
          basketId: basket.id,
          basketName: basket.name,
          basketQuantity: typeof data.basketQuantity === 'number' ? data.basketQuantity : 1,
          productGroups,
          extraGroups: allExtraGroups,
          errorMessage: 'Revise as opções selecionadas.',
        });
      }
    }

    if (action === 'data_exchange' && body.screen === 'CUSTOMER') {
      try {
        const catalog = await loadCatalog();
        const products = activeProducts(catalog);
        const request = checkoutRequest(catalog, products, data, flowToken);
        const quote = await dependencies.quote(request);
        return makeResponse('REVIEW', publicReviewData(request, flowToken, quote));
      } catch {
        return makeResponse('CUSTOMER', {
          errorMessage: 'Não foi possível calcular o pedido. Revise os dados.',
        });
      }
    }

    throw new Error('Transição do WhatsApp Flow não suportada.');
  };
}
