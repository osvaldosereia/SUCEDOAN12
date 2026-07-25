const fs = require('fs');
const path = require('path');

const FIREBASE_PRODUTOS_URL = process.env.FIREBASE_PRODUTOS_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos.json';
const SITE_URL = (process.env.SITE_URL || 'https://www.donaantonia.com.br').replace(/\/$/, '');
const OUTPUT_FILE = process.env.MERCHANT_OUTPUT || path.join(__dirname, '..', 'merchant.xml');
const MIN_ORDER_VALUE = 75;
const STORE_NAME = 'Super Cestas Básicas Dona Antônia';

function cleanText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function slug(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'produto';
}

function normalizeDate(value, endOfDay = false) {
  if (!value) return null;
  const raw = String(value).trim();
  let date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const match = raw.match(/^(\d{1,2})[\/|-](\d{1,2})[\/|-](\d{4})$/);
    if (!match) return null;
    date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

function first(product, fields, fallback = '') {
  for (const field of fields) {
    const value = product?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return fallback;
}

function productName(product) {
  return cleanText(first(product, ['nome', 'name', 'titulo', 'title'], 'Produto')).slice(0, 150);
}

function regularPrice(product) {
  return numeric(first(product, ['preco', 'price', 'valor', 'preco_venda']));
}

function offerPrice(product) {
  return numeric(first(product, ['preco_oferta', 'sale_price', 'precoPromocional']));
}

function priceData(product) {
  const regular = regularPrice(product);
  const offer = offerPrice(product);
  const offerEnd = normalizeDate(first(product, ['validade_oferta', 'fim_oferta', 'validadeOferta']), true);
  const offerStart = normalizeDate(first(product, ['inicio_oferta', 'inicioOferta']), false);
  const now = new Date();
  const withinWindow = (!offerStart || now >= offerStart) && (!offerEnd || now <= offerEnd);
  const hasSale = offer > 0 && offer < regular && withinWindow;
  return { regular, sale: hasSale ? offer : 0, offerStart, offerEnd };
}

function activeProduct(product) {
  if (!product || typeof product !== 'object') return false;
  const status = cleanText(first(product, ['situacao', 'status'], 'A')).toUpperCase();
  if (['I', 'INATIVO', 'INACTIVE', 'D', 'DESATIVADO'].includes(status)) return false;
  const name = productName(product);
  if (!name || name.toLowerCase() === 'produto') return false;
  const { regular } = priceData(product);
  if (regular <= 0) return false;
  const category = cleanText(product.categoria).toLowerCase();
  const code = cleanText(first(product, ['codigo', 'sku', 'id']));
  return !product.isComboDiscount && !code.startsWith('fee_') && !category.includes('taxa') && !category.includes('frete');
}

function productId(firebaseKey, product) {
  return cleanText(first(product, ['codigo', 'sku', 'id', 'firebaseKey'], firebaseKey));
}

function normalizeRepositoryUrl(raw) {
  const value = String(raw || '').trim().replace(/\\/g, '/');
  if (!value) return '';
  try {
    const url = new URL(value, `${SITE_URL}/`);
    if (url.hostname === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'osvaldosereia' && parts[1] === 'SUCEDOAN12' && parts.length > 3) {
        return `${SITE_URL}/${parts.slice(3).map(encodeURIComponent).join('/')}`;
      }
    }
    if (url.hostname === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const blobIndex = parts.indexOf('blob');
      if (parts[0] === 'osvaldosereia' && parts[1] === 'SUCEDOAN12' && blobIndex >= 0 && parts.length > blobIndex + 2) {
        return `${SITE_URL}/${parts.slice(blobIndex + 2).map(encodeURIComponent).join('/')}`;
      }
    }
    if (url.origin === new URL(SITE_URL).origin) return url.toString();
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    const clean = value.replace(/^(\.\.\/|\.\/|\/)+/g, '');
    return clean ? `${SITE_URL}/${clean.split('/').map(encodeURIComponent).join('/')}` : '';
  }
}

function imageUrl(product, id) {
  const raw = first(product, ['url_imagem', 'imagem', 'image', 'img', 'foto', 'foto_url', 'urlImagem', 'imagem_url'], `site/img/produtos/${id}.webp`);
  return normalizeRepositoryUrl(raw) || `${SITE_URL}/img/logoantonia5.png`;
}

function additionalImages(product) {
  const values = [product.imagens, product.images, product.fotos, product.additional_images]
    .flatMap(value => Array.isArray(value) ? value : (value ? [value] : []))
    .map(normalizeRepositoryUrl)
    .filter(Boolean);
  return [...new Set(values)].slice(0, 10);
}

function productDescription(product, name) {
  const description = cleanText(first(product, ['descricao', 'description', 'detalhes', 'observacao']));
  if (description.length >= 20) return description.slice(0, 5000);
  const brand = cleanText(first(product, ['marca', 'brand']));
  const packaging = cleanText(first(product, ['embalagem', 'volume']));
  return `${name}${packaging ? ` ${packaging}` : ''}${brand ? `, marca ${brand}` : ''}. Produto disponível na Dona Antônia, com atendimento em Cuiabá e Várzea Grande.`.slice(0, 5000);
}

function productLink(firebaseKey, product, id) {
  const reference = cleanText(first(product, ['firebaseKey', 'id', 'codigo'], firebaseKey || id));
  return `${SITE_URL}/?p=${encodeURIComponent(reference)}&produto=${encodeURIComponent(slug(productName(product)))}`;
}

function availability(product) {
  const stock = numeric(first(product, ['estoque', 'stock', 'quantidade', 'qtd']));
  return stock > 0 ? 'in_stock' : 'out_of_stock';
}

function itemXml(firebaseKey, product) {
  const id = productId(firebaseKey, product);
  const name = productName(product);
  const { regular, sale, offerStart, offerEnd } = priceData(product);
  const gtin = digits(first(product, ['gtin', 'ean', 'codigo_barras', 'barcode']));
  const brand = cleanText(first(product, ['marca', 'brand'], 'Dona Antônia')).slice(0, 70);
  const mpn = cleanText(first(product, ['mpn', 'codigo', 'sku'], id)).slice(0, 70);
  const category = cleanText(product.categoria);
  const subcategory = cleanText(product.subcategoria);
  const image = imageUrl(product, id);
  const extraImages = additionalImages(product).filter(url => url !== image);
  const lines = [
    '    <item>',
    `      <g:id>${xmlEscape(id)}</g:id>`,
    `      <g:title>${xmlEscape(name)}</g:title>`,
    `      <g:description>${xmlEscape(productDescription(product, name))}</g:description>`,
    `      <g:link>${xmlEscape(productLink(firebaseKey, product, id))}</g:link>`,
    `      <g:image_link>${xmlEscape(image)}</g:image_link>`,
    ...extraImages.map(url => `      <g:additional_image_link>${xmlEscape(url)}</g:additional_image_link>`),
    `      <g:availability>${availability(product)}</g:availability>`,
    `      <g:price>${regular.toFixed(2)} BRL</g:price>`
  ];

  if (sale > 0) {
    lines.push(`      <g:sale_price>${sale.toFixed(2)} BRL</g:sale_price>`);
    if (offerEnd) {
      const start = (offerStart || new Date()).toISOString();
      lines.push(`      <g:sale_price_effective_date>${start}/${offerEnd.toISOString()}</g:sale_price_effective_date>`);
    }
  }

  lines.push('      <g:condition>new</g:condition>');
  lines.push(`      <g:brand>${xmlEscape(brand)}</g:brand>`);
  if (gtin.length >= 8 && gtin.length <= 14) {
    lines.push(`      <g:gtin>${gtin}</g:gtin>`);
  } else if (mpn) {
    lines.push(`      <g:mpn>${xmlEscape(mpn)}</g:mpn>`);
  } else {
    lines.push('      <g:identifier_exists>no</g:identifier_exists>');
  }
  if (category || subcategory) lines.push(`      <g:product_type>${xmlEscape([category, subcategory].filter(Boolean).join(' > '))}</g:product_type>`);

  const effectivePrice = sale || regular;
  if (effectivePrice <= MIN_ORDER_VALUE) {
    lines.push('      <g:minimum_order_value>');
    lines.push('        <g:country>BR</g:country>');
    lines.push('        <g:service>Entrega local</g:service>');
    lines.push('        <g:surface>online</g:surface>');
    lines.push(`        <g:price>${MIN_ORDER_VALUE.toFixed(2)} BRL</g:price>`);
    lines.push('      </g:minimum_order_value>');
  }

  lines.push('    </item>');
  return lines.join('\n');
}

function normalizeProducts(raw) {
  const entries = Array.isArray(raw) ? raw.map((product, index) => [String(index), product]) : Object.entries(raw || {});
  return entries.filter(([, product]) => activeProduct(product));
}

function buildFeed(entries) {
  if (!entries.length) throw new Error('Nenhum produto válido foi encontrado; o merchant.xml anterior foi preservado.');
  const items = entries.map(([firebaseKey, product]) => itemXml(firebaseKey, product)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n  <channel>\n    <title>${xmlEscape(STORE_NAME)}</title>\n    <link>${xmlEscape(SITE_URL)}</link>\n    <description>Supermercado online, cestas básicas, ofertas e entrega em Cuiabá e Várzea Grande.</description>\n${items}\n  </channel>\n</rss>\n`;
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, filePath);
}

async function main() {
  console.log('Buscando produtos no Firebase...');
  const response = await fetch(FIREBASE_PRODUTOS_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Erro ao buscar produtos: HTTP ${response.status}`);
  const entries = normalizeProducts(await response.json());
  const feed = buildFeed(entries);
  atomicWrite(OUTPUT_FILE, feed);
  console.log(`merchant.xml gerado com ${entries.length} produtos em ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Erro ao gerar merchant.xml:', error);
    process.exit(1);
  });
}

module.exports = { activeProduct, buildFeed, itemXml, normalizeRepositoryUrl, numeric, priceData };
