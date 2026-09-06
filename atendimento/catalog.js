const PRODUCT_URL = '../site/produtos-home.json';
const BASKET_URL = '../site/produtos-cesta-basica.json';

const number = value => Number(String(value ?? 0).replace(',', '.')) || 0;

export function asset(value) {
  const path = String(value || '').trim();
  if (!path) return '/img/logoantonia5.png';
  if (/^https?:\/\//i.test(path) || path.startsWith('/')) return path;
  return `/${path.replace(/^\.\//, '')}`;
}

function imageOf(raw) {
  const candidates = [raw.thumbnail, raw.url_imagem, raw.imagem_url, raw.urlImagem, raw.imagem, raw.image, raw.img, raw.foto, raw.foto_url];
  if (Array.isArray(raw.imagens)) candidates.push(raw.imagens[0]);
  if (Array.isArray(raw.images)) candidates.push(raw.images[0]);
  return asset(candidates.find(Boolean));
}

function priceOf(raw) {
  const regular = number(raw.preco ?? raw.price ?? raw.valor);
  const special = number(raw.preco_oferta ?? raw.precoOferta ?? raw.preco_promocional);
  return special > 0 ? special : regular;
}

function offerOf(raw) {
  const regular = number(raw.preco ?? raw.price ?? raw.valor);
  const special = number(raw.preco_oferta ?? raw.precoOferta ?? raw.preco_promocional);
  const flag = raw.oferta === true || raw.em_oferta === true || String(raw.oferta || '').toLowerCase() === 'sim';
  return flag || (special > 0 && (regular <= 0 || special < regular));
}

function active(raw) {
  const status = String(raw.situacao || raw.status || '').trim().toUpperCase();
  if (['I', 'INATIVO', 'INACTIVE'].includes(status)) return false;
  const stock = raw.estoque ?? raw.stock ?? raw.saldo;
  return stock === undefined || number(stock) > 0;
}

function normalizeProduct(raw, index) {
  return {
    code: String(raw.codigo || raw.sku || raw.id || index).trim(),
    name: String(raw.nome || raw.name || raw.descricao || 'Produto').trim(),
    price: priceOf(raw),
    image: imageOf(raw),
    offer: offerOf(raw),
    categoryText: [raw.categoria, raw.category, raw.subcategoria, raw.subsubcategoria, raw.departamento].filter(Boolean).join(' ').toLowerCase(),
    raw
  };
}

function normalizeBasket(raw, index) {
  return {
    id: String(raw.id || raw.codigo || `cesta${index + 1}`),
    code: String(raw.codigo || raw.id || `cesta${index + 1}`),
    name: String(raw.nome || raw.name || 'Cesta básica'),
    price: number(raw.preco ?? raw.price),
    image: asset(raw.imagem || raw.image || raw.img),
    items: (Array.isArray(raw.produtos) ? raw.produtos : []).map(item => {
      if (typeof item === 'string') {
        const match = item.match(/^\s*(\d+)\s*x\s*(.+)$/i);
        return { qty: match ? Number(match[1]) : 1, code: String(match ? match[2] : item).trim() };
      }
      return { qty: Math.max(0, Number(item.qtd ?? item.qty ?? item.quantidade ?? 1) || 0), code: String(item.codigo ?? item.sku ?? item.id ?? '').trim() };
    }).filter(item => item.code)
  };
}

async function safeJson(url, fallback) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return fallback;
    const text = await response.text();
    if (!text.trim()) return fallback;
    return JSON.parse(text);
  } catch (error) {
    console.warn(`Catálogo parcial: ${url} indisponível`, error);
    return fallback;
  }
}

export function classify(product) {
  const text = `${product.categoryText} ${product.name}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/(pet|animal|racao|utilidade|utensilio|cozinha|descartavel|pilha|lampada|saco de lixo)/.test(text)) return 'utilidades';
  if (/(higiene|beleza|perfum|sabonete|shampoo|condicionador|desodorante|absorvente|creme dental|escova dental|papel higienico|fralda)/.test(text)) return 'higiene';
  if (/(limpeza|lavanderia|detergente|desinfetante|amaciante|sabao|agua sanitaria|multiuso|esponja|lava roupa|alvejante)/.test(text)) return 'limpeza';
  return 'mercearia';
}

export async function loadCatalog() {
  const basketRaw = await safeJson(BASKET_URL, []);
  const productRaw = await safeJson(PRODUCT_URL, []);

  const products = (Array.isArray(productRaw) ? productRaw : Object.values(productRaw || {}))
    .map(normalizeProduct)
    .filter(p => p.code && p.name && p.price > 0 && active(p.raw));

  const baskets = (Array.isArray(basketRaw) ? basketRaw : Object.values(basketRaw || {}))
    .map(normalizeBasket)
    .filter(basket => basket.id && basket.name && basket.price > 0);

  const productByCode = new Map(products.map(product => [product.code.toLowerCase(), product]));
  return { products, baskets, productByCode };
}
