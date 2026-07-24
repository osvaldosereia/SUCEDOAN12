import { buildSystemAudit } from '../core/diagnostics.js';
import { text } from '../core/utils.js';
import { loadCollections } from './collections.js';
import { loadProducts } from './firebase.js';
import { readJsonFile } from './github.js';

async function timed(name, callback) {
  const started = performance.now();
  try {
    const data = await callback();
    return { name, ok: true, durationMs: Math.round(performance.now() - started), data, error: '' };
  } catch (error) {
    return { name, ok: false, durationMs: Math.round(performance.now() - started), data: null, error: error?.message || String(error) };
  }
}

export async function runSystemDiagnostics(config) {
  const productsResult = await timed('Firebase produtos', () => loadProducts(config));
  const collectionsResult = await timed('Cestas, kits e fila', () => loadCollections(config));
  const publicProductsResult = await timed('Produtos públicos', async () => {
    const file = await readJsonFile(config, config.productsHomePath || 'site/produtos-home.json');
    return Array.isArray(file?.data) ? file.data : [];
  });
  const versionResult = await timed('Versão do catálogo', async () => {
    const file = await readJsonFile(config, config.catalogVersionPath || 'catalog-version.json');
    return file?.data || null;
  });

  const products = productsResult.data || [];
  const collections = collectionsResult.data || { baskets: [], kits: [], queue: [] };
  const publicProducts = publicProductsResult.data || [];
  const catalogVersion = versionResult.data || null;
  const audit = buildSystemAudit({
    products,
    baskets: collections.baskets,
    kits: collections.kits,
    queue: collections.queue,
    config,
    publicProducts,
    catalogVersion,
  });
  const integrations = {
    makeOrders: {
      configured: Boolean(text(config.makeOrderWebhookUrl)),
      validUrl: !text(config.makeOrderWebhookUrl) || /^https:\/\//i.test(text(config.makeOrderWebhookUrl)),
      tested: false,
      message: text(config.makeOrderWebhookUrl) ? 'URL registrada; não foi chamada para evitar disparo de cenário.' : 'Webhook não registrado na V2.',
    },
    makeAi: {
      configured: Boolean(text(config.makeAiWebhookUrl)),
      validUrl: !text(config.makeAiWebhookUrl) || /^https:\/\//i.test(text(config.makeAiWebhookUrl)),
      tested: false,
      message: text(config.makeAiWebhookUrl) ? 'URL registrada; não foi chamada para evitar consumo ou criação de dados.' : 'Webhook não registrado na V2.',
    },
    bling: {
      configured: text(config.blingConnectionMode) === 'via-make',
      validUrl: true,
      tested: false,
      message: 'A integração Bling permanece mediada pelo Make; nenhum pedido ou contato foi enviado no diagnóstico.',
    },
  };
  return {
    generatedAt: new Date().toISOString(),
    sources: [productsResult, collectionsResult, publicProductsResult, versionResult],
    products,
    collections,
    publicProducts,
    catalogVersion,
    audit,
    integrations,
  };
}
