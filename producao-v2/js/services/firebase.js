import { clone, nowIso, number, productKey, text } from '../core/utils.js';

function baseUrl(config) {
  return text(config.firebaseUrl).replace(/\/+$/, '');
}

function nodePath(config) {
  return text(config.productsNode || 'produtos').replace(/^\/+|\/+$/g, '');
}

function productUrl(config, key = '') {
  const suffix = key ? `/${encodeURIComponent(key)}` : '';
  return `${baseUrl(config)}/${nodePath(config)}${suffix}.json`;
}

async function request(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Firebase retornou ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
    }
    return await response.json().catch(() => null);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao consultar o Firebase.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeProduct(key, value) {
  const product = value && typeof value === 'object' ? clone(value) : {};
  product.firebaseKey = text(product.firebaseKey || key);
  product.id = text(product.id || product.firebaseKey);
  product.codigo = text(product.codigo || product.sku || product.id || product.firebaseKey);
  product.nome = text(product.nome || product.titulo || '');
  product.preco = number(product.preco);
  product.preco_custo = number(product.preco_custo);
  product.estoque = Math.max(0, Math.floor(number(product.estoque)));
  product.situacao = text(product.situacao || product.status || 'A').toUpperCase();
  return product;
}

export async function loadProducts(config) {
  const data = await request(`${productUrl(config)}?_admin_v2=${Date.now()}`);
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([key, value]) => normalizeProduct(key, value));
}

export async function loadProduct(config, key) {
  const value = await request(productUrl(config, key));
  return value && typeof value === 'object' ? normalizeProduct(key, value) : null;
}

export async function saveProduct(config, product, originalSnapshot = null) {
  if (!config.writeMode) throw new Error('As gravações da V2 estão bloqueadas. Ative o modo de gravação somente durante testes controlados.');
  const key = productKey(product);
  if (!key) throw new Error('Produto sem chave do Firebase.');

  const remote = await loadProduct(config, key);
  if (remote && originalSnapshot) {
    const remoteStock = number(remote.estoque);
    const originalStock = number(originalSnapshot.estoque);
    const localStock = number(product.estoque);
    const localChangedStock = localStock !== originalStock;
    const remoteChangedStock = remoteStock !== originalStock
      || text(remote.stock_updated_at) !== text(originalSnapshot.stock_updated_at);
    if (localChangedStock && remoteChangedStock) {
      throw new Error('O estoque deste produto mudou em outra sessão. Recarregue antes de salvar.');
    }
  }

  const payload = clone(product);
  payload.firebaseKey = key;
  payload.id = text(payload.id || key);
  payload.codigo = text(payload.codigo || payload.sku || payload.id || key);
  payload.preco = number(payload.preco);
  payload.preco_custo = number(payload.preco_custo);
  payload.estoque = Math.max(0, Math.floor(number(payload.estoque)));
  payload.updated_at = nowIso();
  payload.last_update = Date.now();
  if (!originalSnapshot || number(payload.estoque) !== number(originalSnapshot.estoque)) payload.stock_updated_at = nowIso();

  await request(productUrl(config, key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return payload;
}
