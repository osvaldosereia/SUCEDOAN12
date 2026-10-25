import {
  createWhatsAppFlowController,
  type FlowCatalogBasket,
  type FlowCatalogExtra,
  type FlowCatalogProduct,
  type FlowCatalogType,
  type WhatsAppFlowCatalog,
} from '../../../src/server/whatsapp/whatsapp-flow-controller.ts';
import { handleWhatsAppFlowEndpoint } from '../../../src/server/whatsapp/flow-endpoint.ts';
import { verifyWhatsAppFlowToken } from '../../../src/server/whatsapp/flow-token.ts';

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Resposta V2 inválida: ${label}.`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`Resposta V2 inválida: ${label}.`);
  return value.trim();
}

function integerValue(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`Resposta V2 inválida: ${label}.`);
  return Number(value);
}

function mapCatalog(value: unknown): WhatsAppFlowCatalog {
  const root = record(value, 'catálogo');
  if (
    !Array.isArray(root.products) ||
    !Array.isArray(root.types) ||
    !Array.isArray(root.baskets) ||
    !Array.isArray(root.extras)
  )
    throw new Error('Projeção pública V2 incompleta.');

  const products: FlowCatalogProduct[] = root.products.map((value) => {
    const row = record(value, 'produto');
    return {
      sku: stringValue(row.sku, 'SKU'),
      name: stringValue(row.name, 'nome do produto'),
      active: row.active === true,
      stock: integerValue(row.stock, 'estoque'),
    };
  });
  const types: FlowCatalogType[] = root.types.map((value) => {
    const row = record(value, 'tipo');
    if (!Array.isArray(row.productSkus)) throw new Error('Tipo V2 sem opções.');
    return {
      id: stringValue(row.id, 'tipo'),
      name: stringValue(row.name, 'nome do tipo'),
      productSkus: row.productSkus.map((sku) => stringValue(sku, 'SKU do tipo')),
      active: row.active !== false,
      order: integerValue(row.order, 'ordem do tipo'),
    };
  });
  const baskets: FlowCatalogBasket[] = root.baskets.map((value) => {
    const row = record(value, 'cesta');
    if (!Array.isArray(row.lines)) throw new Error('Cesta V2 sem itens.');
    return {
      id: stringValue(row.id, 'cesta'),
      name: stringValue(row.name, 'nome da cesta'),
      active: row.active === true,
      lines: row.lines.map((lineValue) => {
        const line = record(lineValue, 'linha da cesta');
        return {
          typeId: stringValue(line.typeId, 'tipo da cesta'),
          defaultQuantity: integerValue(line.defaultQuantity, 'quantidade da cesta'),
          order: integerValue(line.order, 'ordem da linha'),
        };
      }),
    };
  });
  const extras: FlowCatalogExtra[] = root.extras.map((value) => {
    const row = record(value, 'extra');
    return {
      typeId: stringValue(row.typeId, 'tipo extra'),
      active: row.active === true,
      order: integerValue(row.order, 'ordem do extra'),
    };
  });

  return { products, types, baskets, extras };
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Segredo de ambiente ausente: ${name}.`);
  return value;
}

async function callV2Rpc(name: string, payload: Record<string, unknown>): Promise<unknown> {
  const baseUrl = requiredEnvironment('DA_V2_SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = requiredEnvironment('DA_V2_SUPABASE_ANON_KEY');
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('RPC da Dona Antônia V2 indisponível.');
  return response.json();
}

const controller = createWhatsAppFlowController({
  readCatalog: async () => mapCatalog(await callV2Rpc('get_storefront_catalog', {})),
  quote: (payload) => callV2Rpc('quote_storefront_order', { p_payload: payload }),
  verifyFlowToken: async (token) =>
    (await verifyWhatsAppFlowToken({
      token,
      secret: requiredEnvironment('WHATSAPP_FLOW_TOKEN_SECRET'),
    })) !== null,
});

Deno.serve((request) =>
  handleWhatsAppFlowEndpoint(request, {
    appSecret: Deno.env.get('WHATSAPP_META_APP_SECRET'),
    privateKeyPem: Deno.env.get('WHATSAPP_FLOW_PRIVATE_KEY_PEM'),
    onRequest: controller,
  }),
);
