const fs = require('fs');
const path = require('path');

const SITE_URL = (process.env.SITE_URL || 'https://donaantonia.com.br').replace(/\/$/, '');
const STORE_NAME = 'Super Cestas Básicas Dona Antônia';

function cleanText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').replace(/R\$/gi, '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value) {
  return Math.max(0, Math.floor(numeric(value)));
}

function round(value) {
  return Math.round((numeric(value) + Number.EPSILON) * 100) / 100;
}

function slug(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'combo';
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (fallback !== undefined && error?.code === 'ENOENT') return fallback;
    throw new Error(`Não foi possível ler ${filePath}: ${error.message}`);
  }
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    if (fs.readFileSync(filePath, 'utf8') === content) return false;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, filePath);
  return true;
}

function isActiveProduct(product) {
  const status = cleanText(product?.situacao ?? product?.status ?? 'A').toUpperCase();
  return !['I', 'INATIVO', 'INACTIVE', '0', 'FALSE', 'EXCLUIDO', 'EXCLUÍDO', 'D', 'DESATIVADO'].includes(status)
    && product?.ativo !== false
    && product?.visivel !== false;
}

function productCodes(key, product) {
  return [key, product?.firebaseKey, product?.id, product?.codigo, product?.sku, product?.gtin, product?.ean]
    .map(cleanText)
    .filter(Boolean);
}

function normalizeProducts(raw) {
  const entries = Array.isArray(raw)
    ? raw.map((product, index) => [String(index), product])
    : Object.entries(raw || {});
  const products = entries
    .filter(([, product]) => product && typeof product === 'object' && !Array.isArray(product))
    .map(([key, product]) => ({ key, ...product }));
  const index = new Map();
  products.forEach(product => productCodes(product.key, product).forEach(code => {
    index.set(code, product);
    index.set(code.toLowerCase(), product);
  }));
  return { products, index };
}

function findProduct(index, code) {
  const value = cleanText(code);
  return index.get(value) || index.get(value.toLowerCase()) || null;
}

function productStock(product) {
  return integer(product?.estoque ?? product?.stock ?? product?.quantidade ?? product?.qtd);
}

function productPrice(product) {
  return round(product?.preco ?? product?.price ?? product?.valor ?? product?.preco_venda);
}

function resolveComboItem(item, productIndex) {
  const codes = [item?.codigo, ...(Array.isArray(item?.substitutos) ? item.substitutos : [])]
    .map(cleanText)
    .filter(Boolean);
  const candidates = codes
    .map(code => ({ code, product: findProduct(productIndex, code) }))
    .filter(row => row.product);
  return candidates.find(row => isActiveProduct(row.product) && productPrice(row.product) > 0 && productStock(row.product) > 0)
    || candidates.find(row => isActiveProduct(row.product) && productPrice(row.product) > 0)
    || candidates[0]
    || null;
}

function dateAtBrazil(value, endOfDay = false) {
  const raw = cleanText(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T${endOfDay ? '23:59:59' : '00:00:00'}-04:00`);
  const brazil = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brazil) {
    return new Date(`${brazil[3]}-${String(brazil[2]).padStart(2, '0')}-${String(brazil[1]).padStart(2, '0')}T${endOfDay ? '23:59:59' : '00:00:00'}-04:00`);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(value) {
  const date = value instanceof Date ? value : dateAtBrazil(value, false);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function newestDate(values) {
  return values
    .map(value => value instanceof Date ? value : dateAtBrazil(value, false))
    .filter(date => date && !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0] || null;
}

function sourceUpdatedDate(source, fallback = null) {
  const newest = newestDate([
    source?.atualizado_em,
    source?.atualizadoEm,
    source?.updated_at,
    source?.updatedAt,
    source?.last_update,
    source?.modificado_em,
    source?.data_atualizacao,
    source?.criado_em,
    source?.criadoEm,
    source?.created_at,
    source?.createdAt,
    fallback,
  ]);
  return dateOnly(newest);
}

function absoluteImage(value) {
  const raw = cleanText(value);
  if (!raw) return `${SITE_URL}/img/logoantonia5.png`;
  try {
    const url = new URL(raw, `${SITE_URL}/`);
    if (url.hostname === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const branchIndex = parts.findIndex(part => part === 'main' || part === 'master');
      if (parts[0] === 'osvaldosereia' && parts[1] === 'SUCEDOAN12' && branchIndex >= 0) {
        return `${SITE_URL}/${parts.slice(branchIndex + 1).join('/')}`;
      }
    }
    if (url.hostname === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const blobIndex = parts.indexOf('blob');
      if (parts[0] === 'osvaldosereia' && parts[1] === 'SUCEDOAN12' && blobIndex >= 0) {
        return `${SITE_URL}/${parts.slice(blobIndex + 2).join('/')}`;
      }
    }
    if (url.hostname === 'www.donaantonia.com.br') url.hostname = 'donaantonia.com.br';
    if (url.origin === new URL(SITE_URL).origin || /^https:$/i.test(url.protocol)) return url.toString();
  } catch {}
  const clean = raw.replace(/^(?:\.\.\/|\.\/|\/)+/g, '');
  return `${SITE_URL}/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

function comboPeriodStatus(combo, type, now = new Date()) {
  if (combo?.ativo === false) return 'inactive';
  if (type !== 'kit') return 'active';
  const start = dateAtBrazil(combo?.data_inicio ?? combo?.dataInicio, false);
  const end = dateAtBrazil(combo?.data_fim ?? combo?.dataFim, true);
  if (start && now < start) return 'scheduled';
  if (end && now > end) return 'expired';
  return 'active';
}

function comboDetails(combo, type, productIndex, now = new Date()) {
  const items = Array.isArray(combo?.produtos) ? combo.produtos : [];
  let stock = Infinity;
  let regularTotal = 0;
  const resolvedItems = items.map(item => {
    const qty = Math.max(1, integer(item?.qtd || 1));
    const selected = resolveComboItem(item, productIndex);
    const product = selected?.product || null;
    if (!product) stock = 0;
    else {
      regularTotal += productPrice(product) * qty;
      stock = Math.min(stock, Math.floor(productStock(product) / qty));
    }
    return { qty, requestedCode: cleanText(item?.codigo), selectedCode: selected?.code || '', product };
  });
  if (!Number.isFinite(stock)) stock = 0;
  const configuredStock = integer(combo?.estoque_disponivel ?? combo?.estoqueDisponivel ?? combo?.limite_kits ?? combo?.limiteKits);
  if (type === 'kit' && configuredStock > 0) stock = Math.min(stock, configuredStock);
  const periodStatus = comboPeriodStatus(combo, type, now);
  const price = round(combo?.preco ?? combo?.preco_novo ?? combo?.price ?? combo?.preco_promocional);
  const oldPrice = round(combo?.preco_anterior ?? combo?.precoOriginal ?? combo?.preco_original ?? regularTotal);
  const valid = Boolean(cleanText(combo?.id || combo?.codigo) && cleanText(combo?.nome) && price > 0 && items.length);
  const catalogActive = valid && periodStatus === 'active' && stock > 0;
  const uniqueProducts = resolvedItems.filter(row => row.product).length;
  const units = resolvedItems.reduce((sum, row) => sum + row.qty, 0);
  return {
    valid,
    catalogActive,
    periodStatus,
    stock,
    price,
    oldPrice: oldPrice > price ? oldPrice : 0,
    regularTotal: round(regularTotal),
    uniqueProducts,
    units,
    resolvedItems,
  };
}

function comboIdentifier(combo, type) {
  const base = cleanText(combo?.codigo || combo?.id || combo?.nome);
  return `${type === 'kit' ? 'kit' : 'cesta'}-${slug(base)}`.slice(0, 100);
}

function comboTitle(combo, type, details) {
  const name = cleanText(combo?.nome) || (type === 'kit' ? 'Kit promocional' : 'Cesta básica');
  const hasKind = type === 'kit' ? /\bkit\b/i.test(name) : /\bcesta\b/i.test(name);
  const base = hasKind ? name : `${type === 'kit' ? 'Kit Promocional' : 'Cesta Básica'} ${name}`;
  const count = details.uniqueProducts || details.units;
  return cleanText(`${base}${count ? ` com ${count} ${count === 1 ? 'produto' : 'produtos'}` : ''}`).slice(0, 150);
}

function comboDescription(combo, type, details) {
  const supplied = cleanText(combo?.descricao || combo?.description || combo?.descricao_oferta || combo?.detalhes);
  if (supplied.length >= 35) return supplied.slice(0, 5000);
  const kind = type === 'kit' ? 'Kit promocional' : 'Cesta básica';
  const names = details.resolvedItems
    .filter(row => row.product)
    .slice(0, 6)
    .map(row => `${row.qty}x ${cleanText(row.product.nome || row.product.name || row.product.codigo)}`)
    .filter(Boolean);
  return cleanText(`${kind} ${combo?.nome || ''} com ${details.units} unidades selecionadas${names.length ? `: ${names.join(', ')}` : ''}. Entrega em Cuiabá e Várzea Grande pela Dona Antônia.`).slice(0, 5000);
}

function comboSeoPath(combo, type) {
  const name = slug(combo?.nome || (type === 'kit' ? 'kit-promocional' : 'cesta-basica'));
  const reference = slug(combo?.codigo || combo?.id || name);
  return `/${type === 'kit' ? 'kits' : 'cestas'}/${name}-${reference}/`;
}

function comboLink(combo, type) {
  return `${SITE_URL}${comboSeoPath(combo, type)}`;
}

function legacyComboLink(combo, type) {
  const key = cleanText(combo?.id || combo?.codigo);
  return `${SITE_URL}/?${type === 'kit' ? 'kit' : 'cesta'}=${encodeURIComponent(key)}`;
}

function comboRecord(combo, type, productIndex, now = new Date(), fallbackUpdatedAt = null) {
  const details = comboDetails(combo, type, productIndex, now);
  return {
    source: combo,
    type,
    id: comboIdentifier(combo, type),
    reference: cleanText(combo?.id || combo?.codigo),
    code: cleanText(combo?.codigo || combo?.id),
    title: comboTitle(combo, type, details),
    description: comboDescription(combo, type, details),
    seoPath: comboSeoPath(combo, type),
    link: comboLink(combo, type),
    legacyLink: legacyComboLink(combo, type),
    image: absoluteImage(combo?.imagem || combo?.img || combo?.url_imagem),
    productType: type === 'kit' ? 'Kits promocionais' : 'Cestas básicas',
    brand: 'Dona Antônia',
    lastmod: sourceUpdatedDate(combo, fallbackUpdatedAt),
    details,
  };
}

function buildComboCatalog({
  productsRaw,
  basketsRaw,
  kitsRaw,
  now = new Date(),
  basketsUpdatedAt = null,
  kitsUpdatedAt = null,
} = {}) {
  const { index } = normalizeProducts(productsRaw);
  const baskets = (Array.isArray(basketsRaw) ? basketsRaw : Object.values(basketsRaw || {}))
    .filter(Boolean)
    .map(combo => comboRecord(combo, 'basket', index, now, basketsUpdatedAt));
  const kits = (Array.isArray(kitsRaw) ? kitsRaw : Object.values(kitsRaw || {}))
    .filter(Boolean)
    .map(combo => comboRecord(combo, 'kit', index, now, kitsUpdatedAt));
  const all = [...baskets, ...kits];
  return {
    baskets,
    kits,
    all,
    active: all.filter(record => record.details.catalogActive),
    valid: all.filter(record => record.details.valid),
    generatedAt: now.toISOString(),
  };
}

function fileMtime(filePath) {
  try { return fs.statSync(filePath).mtime; } catch { return null; }
}

function loadComboCatalog({ rootDir = path.join(__dirname, '..'), now = new Date() } = {}) {
  const productsPath = process.env.PRODUCTS_INPUT || path.join(rootDir, 'site', 'produtos-home.json');
  const basketsPath = process.env.BASKETS_INPUT || path.join(rootDir, 'site', 'produtos-cesta-basica.json');
  const kitsPath = process.env.KITS_INPUT || path.join(rootDir, 'site', 'kits.json');
  return buildComboCatalog({
    productsRaw: readJson(productsPath, {}),
    basketsRaw: readJson(basketsPath, []),
    kitsRaw: readJson(kitsPath, []),
    basketsUpdatedAt: fileMtime(basketsPath),
    kitsUpdatedAt: fileMtime(kitsPath),
    now,
  });
}

module.exports = {
  SITE_URL,
  STORE_NAME,
  absoluteImage,
  atomicWrite,
  buildComboCatalog,
  cleanText,
  comboLink,
  comboSeoPath,
  csvCell,
  dateOnly,
  htmlEscape,
  legacyComboLink,
  loadComboCatalog,
  numeric,
  readJson,
  round,
  slug,
  sourceUpdatedDate,
  xmlEscape,
};
