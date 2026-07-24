import { auditCatalog } from './catalog.js';
import { auditCollections } from './collections.js';
import { buildOffersPlan } from './offers.js';
import { buildRegistries, registrySummary } from './registries.js';
import { stockDashboard } from './stock.js';
import { clone, number, productCode, productKey, productName, text } from './utils.js';

export function sanitizedConfig(config = {}) {
  const copy = clone(config || {});
  delete copy.githubToken;
  return copy;
}

export function validHttpUrl(value = '') {
  try {
    const url = new URL(text(value));
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function buildSystemAudit({ products = [], baskets = [], kits = [], queue = [], config = {}, publicProducts = [], catalogVersion = null } = {}) {
  const catalog = auditCatalog(products, config);
  const collections = auditCollections(baskets, kits, products, queue);
  const offers = buildOffersPlan(products);
  const registries = buildRegistries(products);
  const registryStats = registrySummary(registries);
  const stock = stockDashboard(products, { lowThreshold: 5 });
  const publicCount = Array.isArray(publicProducts) ? publicProducts.length : 0;
  const drop = products.length > 0 ? Math.max(0, products.length - publicCount) : 0;
  const dropPercent = products.length > 0 ? Math.round((drop / products.length) * 10000) / 100 : 0;
  const issues = [];

  if (!products.length) issues.push({ level: 'error', area: 'Firebase', message: 'Nenhum produto foi carregado da fonte oficial.' });
  if (catalog.errors.length) issues.push({ level: 'error', area: 'Catálogo', message: `${catalog.errors.length} produto(s) impedem publicação.` });
  if (collections.errors.length) issues.push({ level: 'error', area: 'Cestas e kits', message: `${collections.errors.length} coleção(ões) possuem composição inválida.` });
  if (publicCount && dropPercent > 10) issues.push({ level: 'error', area: 'Produtos públicos', message: `O arquivo público possui ${dropPercent}% menos registros que o Firebase.` });
  else if (publicCount && drop > 0) issues.push({ level: 'warning', area: 'Produtos públicos', message: `${drop} produto(s) do Firebase não aparecem no arquivo público.` });
  if (!publicCount) issues.push({ level: 'warning', area: 'Produtos públicos', message: 'O arquivo produtos-home não foi carregado ou está vazio.' });
  if (registryStats.duplicates) issues.push({ level: 'warning', area: 'Cadastros', message: `${registryStats.duplicates} cadastro(s) possuem variações duplicadas.` });
  if (stock.expired) issues.push({ level: 'error', area: 'Validade', message: `${stock.expired} produto(s) estão vencidos.` });
  if (stock.noStock) issues.push({ level: 'warning', area: 'Estoque', message: `${stock.noStock} produto(s) estão sem estoque.` });
  if (offers.errors.length) issues.push({ level: 'error', area: 'Ofertas', message: `${offers.errors.length} produto(s) possuem erro na regra de validade.` });
  if (!catalogVersion) issues.push({ level: 'warning', area: 'Versão', message: 'catalog-version.json não foi carregado.' });

  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      firebaseProducts: products.length,
      publicProducts: publicCount,
      catalogErrors: catalog.errors.length,
      catalogWarnings: catalog.warnings.length,
      baskets: baskets.length,
      kits: kits.length,
      collectionErrors: collections.errors.length,
      expired: stock.expired,
      noStock: stock.noStock,
      next30: stock.next30,
      automaticOfferActions: offers.actionable.length,
      registryDuplicates: registryStats.duplicates,
      queueEntries: Array.isArray(queue) ? queue.length : 0,
    },
    issues,
    catalog,
    collections,
    offers,
    registries,
    stock,
    catalogVersion: clone(catalogVersion),
    config: sanitizedConfig(config),
  };
}

function csvCell(value) {
  const raw = String(value ?? '');
  return /[;"\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function productsCsv(products = []) {
  const headers = ['firebaseKey','codigo','nome','gtin','preco','preco_custo','estoque','validade','categoria','subcategoria','marca','fornecedor','gondola','prateleira','situacao','url_imagem'];
  const lines = [headers.join(';')];
  products.forEach(product => {
    const row = {
      firebaseKey: productKey(product), codigo: productCode(product), nome: productName(product),
      gtin: text(product.gtin || product.ean), preco: number(product.preco), preco_custo: number(product.preco_custo),
      estoque: number(product.estoque), validade: text(product.validade), categoria: text(product.categoria),
      subcategoria: text(product.subcategoria), marca: text(product.marca), fornecedor: text(product.fornecedor),
      gondola: text(product.gondola), prateleira: text(product.prateleira), situacao: text(product.situacao),
      url_imagem: text(product.url_imagem),
    };
    lines.push(headers.map(header => csvCell(row[header])).join(';'));
  });
  return '\ufeff' + lines.join('\n');
}
