import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const PRODUCTS_HOME_PATH = process.env.PRODUCTS_HOME_PATH || 'site/produtos-home.json';
const PRODUCTS_ADMIN_PATH = process.env.PRODUCTS_ADMIN_PATH || 'site/produtos-admin.json';
const CATALOG_VERSION_PATH = process.env.CATALOG_VERSION_PATH || 'catalog-version.json';

const text = value => String(value ?? '').trim();
const number = value => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = value => Math.round(Math.max(0, number(value)) * 100) / 100;
const integer = value => Math.max(0, Math.floor(number(value)));
const bool = value => value === true || value === 1 || ['1','true','sim','yes'].includes(text(value).toLowerCase());

function previousFile(pathname) {
  try { return execFileSync('git', ['show', `HEAD:${pathname}`], { encoding: 'utf8' }); }
  catch { return ''; }
}

function publicImageValue(value) {
  const source = text(value);
  if (!source || /^data:/i.test(source)) return '';
  const rawMatch = source.match(/^https:\/\/raw\.githubusercontent\.com\/osvaldosereia\/SUCEDOAN12\/(?:main|master)\/(.+)$/i);
  if (rawMatch) return rawMatch[1];
  if (/^https?:\/\//i.test(source)) {
    try {
      const parsed = new URL(source);
      if (/^(?:www\.)?donaantonia\.com\.br$/i.test(parsed.hostname)) return parsed.pathname.replace(/^\/+/, '');
      return source;
    } catch { return source; }
  }
  let clean = source.replace(/^(?:\.\.\/|\.\/)+/g, '').replace(/^\/+/, '');
  if (/^img\/(produtos_3|produtos_2|produtos|kits)\//i.test(clean)) clean = `site/${clean}`;
  return clean;
}

function publicMugModel(product = {}) {
  const category = text(product.categoria || product.category).toLowerCase();
  return bool(product.modelo_publico)
    && (bool(product.modelo_caneca) || bool(product.produto_sob_encomenda) || category.includes('caneca'));
}

function mediaList(product = {}) {
  const list = [];
  const push = value => {
    const media = publicImageValue(value);
    if (media && !list.includes(media)) list.push(media);
  };
  [product.url_imagem, product.imagem_url, product.imagem, product.image, product.img, product.foto, product.foto_url, product.imagem_path, product.mockup_1, product.mockup_2, product.mockup_3].forEach(push);
  if (Array.isArray(product.imagens)) product.imagens.forEach(push);
  if (Array.isArray(product.imagens_site)) product.imagens_site.forEach(push);
  return list;
}

function compactProduct(key, product = {}) {
  const madeToOrder = publicMugModel(product);
  const media = mediaList(product);
  const result = {
    firebaseKey: text(product.firebaseKey || key),
    id: text(product.id || key),
    codigo: text(product.codigo || product.sku || product.id || key),
    nome: text(product.nome || product.name || product.titulo),
    slug: text(product.slug),
    categoria: text(product.categoria),
    subcategoria: text(product.subcategoria),
    subsubcategoria: text(product.subsubcategoria),
    marca: text(product.marca),
    embalagem: text(product.embalagem),
    preco: money(product.preco ?? product.price ?? product.valor),
    preco_oferta: money(product.preco_oferta ?? product.precoOferta),
    estoque: madeToOrder ? Math.max(1, integer(product.estoque)) : integer(product.estoque),
    situacao: madeToOrder ? 'A' : text(product.situacao || 'A'),
    modelo_caneca: bool(product.modelo_caneca),
    modelo_publico: bool(product.modelo_publico),
    personalizacao_publica: bool(product.personalizacao_publica),
    produto_sob_encomenda: madeToOrder,
    url_imagem: media[0] || '',
    imagens: media.slice(0, 3),
    mockup_1: publicImageValue(product.mockup_1),
    mockup_2: publicImageValue(product.mockup_2),
    mockup_3: publicImageValue(product.mockup_3),
    arte_horizontal: publicImageValue(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url),
    descricao: text(product.descricao || product.descricao_curta).slice(0, 1200),
    validade: text(product.validade || product.data_validade),
    data_inicio_oferta: text(product.data_inicio_oferta || product.inicio_oferta),
    validade_oferta: text(product.validade_oferta || product.validadeOferta),
    gtin: text(product.gtin || product.ean),
    ean: text(product.ean || product.gtin),
    gondola: text(product.gondola || product['gôndola']),
    prateleira: text(product.prateleira)
  };

  if (!(result.preco_oferta > 0 && result.preco_oferta < result.preco)) {
    delete result.preco_oferta;
    delete result.data_inicio_oferta;
    delete result.validade_oferta;
  }

  return Object.fromEntries(Object.entries(result).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return value;
    return value !== '' && value !== null && value !== undefined;
  }));
}

function stableJson(value) { return `${JSON.stringify(value)}\n`; }
function contentHash(value) { return createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 16); }
function parseJson(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }

const generatedPublic = parseJson(await readFile(PRODUCTS_HOME_PATH, 'utf8'));
const generatedAdminText = await readFile(PRODUCTS_ADMIN_PATH, 'utf8');
const compactPublic = Object.fromEntries(Object.entries(generatedPublic || {}).map(([key, product]) => [key, compactProduct(key, product)]));
const publicContent = stableJson(compactPublic);
const previousPublic = previousFile(PRODUCTS_HOME_PATH);
const previousAdmin = previousFile(PRODUCTS_ADMIN_PATH);
const previousVersion = parseJson(previousFile(CATALOG_VERSION_PATH));

const publicChanged = previousPublic !== publicContent;
const adminChanged = previousAdmin !== generatedAdminText;
const version = {
  version: publicChanged ? `catalog-${contentHash(compactPublic)}` : text(previousVersion.version || `catalog-${contentHash(compactPublic)}`),
  adminVersion: adminChanged ? `admin-${createHash('sha256').update(generatedAdminText).digest('hex').slice(0, 16)}` : text(previousVersion.adminVersion || ''),
  updatedAt: (publicChanged || adminChanged) ? new Date().toISOString() : text(previousVersion.updatedAt || new Date().toISOString()),
  products: PRODUCTS_HOME_PATH,
  adminProducts: PRODUCTS_ADMIN_PATH,
  changed: [...(publicChanged ? ['products'] : []), ...(adminChanged ? ['admin-products'] : [])],
  productCount: Object.keys(compactPublic).length,
  adminProductCount: Object.keys(parseJson(generatedAdminText)).length,
  source: 'firebase-official-sync',
  instructions: 'Catálogo público compacto; modelos públicos de canecas permanecem disponíveis sob encomenda e preservam as três imagens e a arte horizontal.'
};

await Promise.all([
  writeFile(PRODUCTS_HOME_PATH, publicContent, 'utf8'),
  writeFile(CATALOG_VERSION_PATH, `${JSON.stringify(version, null, 2)}\n`, 'utf8')
]);

console.log(publicChanged ? `Catálogo público alterado: versão ${version.version}.` : `Catálogo público sem alteração: versão ${version.version} preservada.`);