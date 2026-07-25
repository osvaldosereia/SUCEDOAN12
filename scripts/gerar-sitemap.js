const fs = require('fs');
const path = require('path');

const FIREBASE_URL = process.env.FIREBASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos.json';
const SITE_URL = (process.env.SITE_URL || 'https://www.donaantonia.com.br').replace(/\/$/, '');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '..');

const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.00' },
  { path: '/sobre-nos.html', changefreq: 'monthly', priority: '0.60' },
  { path: '/contato.html', changefreq: 'monthly', priority: '0.55' },
  { path: '/politica-de-entrega.html', changefreq: 'monthly', priority: '0.50' },
  { path: '/politica-de-troca.html', changefreq: 'monthly', priority: '0.50' },
  { path: '/politica-de-privacidade.html', changefreq: 'yearly', priority: '0.35' },
  { path: '/termos-de-uso.html', changefreq: 'yearly', priority: '0.35' }
];

const SECTIONS = [
  { value: 'ofertas', priority: '0.90', changefreq: 'daily' },
  { value: 'cestas', priority: '0.85', changefreq: 'weekly' },
  { value: 'kits', priority: '0.80', changefreq: 'daily' },
  { value: 'categorias', priority: '0.75', changefreq: 'weekly' },
  { value: 'informacoes', priority: '0.50', changefreq: 'monthly' }
];

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function queryUrl(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) query.set(key, String(value));
  });
  return `${SITE_URL}/?${query.toString()}`;
}

function validProduct(product) {
  if (!product || typeof product !== 'object') return false;
  const status = clean(product.situacao || product.status || 'A').toUpperCase();
  if (['I', 'INATIVO', 'INACTIVE', 'D', 'DESATIVADO'].includes(status)) return false;
  return Boolean(clean(product.nome || product.name)) && numeric(product.preco ?? product.price) > 0;
}

function normalizeProducts(raw) {
  const entries = Array.isArray(raw) ? raw.map((product, index) => [String(index), product]) : Object.entries(raw || {});
  return entries
    .filter(([, product]) => validProduct(product))
    .map(([firebaseKey, product]) => ({ firebaseKey, ...product }));
}

function productReference(product) {
  return clean(product.firebaseKey || product.id || product.codigo || product.sku);
}

function isoDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString().slice(0, 10);
}

function addUrl(urls, seen, entry) {
  if (!entry.loc || seen.has(entry.loc)) return;
  seen.add(entry.loc);
  urls.push(entry);
}

function urlXml(entry) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(entry.loc)}</loc>`,
    `    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`,
    `    <changefreq>${entry.changefreq}</changefreq>`,
    `    <priority>${entry.priority}</priority>`,
    '  </url>'
  ].join('\n');
}

function buildSitemap(products, today = new Date().toISOString().slice(0, 10)) {
  const urls = [];
  const seen = new Set();

  STATIC_PAGES.forEach(page => addUrl(urls, seen, {
    loc: `${SITE_URL}${page.path}`,
    lastmod: today,
    changefreq: page.changefreq,
    priority: page.priority
  }));

  SECTIONS.forEach(section => addUrl(urls, seen, {
    loc: queryUrl({ secao: section.value }),
    lastmod: today,
    changefreq: section.changefreq,
    priority: section.priority
  }));

  const categories = [...new Set(products.map(product => clean(product.categoria)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const subcategories = [...new Set(products.map(product => clean(product.subcategoria)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const brands = [...new Set(products.map(product => clean(product.marca)).filter(Boolean))]
    .filter(brand => products.filter(product => clean(product.marca) === brand).length >= 2)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  categories.forEach(category => addUrl(urls, seen, {
    loc: queryUrl({ categoria: category }), lastmod: today, changefreq: 'weekly', priority: '0.78'
  }));
  subcategories.forEach(subcategory => addUrl(urls, seen, {
    loc: queryUrl({ subcategoria: subcategory }), lastmod: today, changefreq: 'weekly', priority: '0.66'
  }));
  brands.forEach(brand => addUrl(urls, seen, {
    loc: queryUrl({ marca: brand }), lastmod: today, changefreq: 'weekly', priority: '0.62'
  }));

  products.forEach(product => {
    const reference = productReference(product);
    if (!reference) return;
    addUrl(urls, seen, {
      loc: queryUrl({ p: reference }),
      lastmod: isoDate(product.last_update || product.updated_at || product.descricao_atualizada_em, today),
      changefreq: numeric(product.estoque ?? product.stock) > 0 ? 'weekly' : 'monthly',
      priority: numeric(product.estoque ?? product.stock) > 0 ? '0.80' : '0.45'
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(urlXml).join('\n')}\n</urlset>\n`;
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, filePath);
}

async function main() {
  const response = await fetch(FIREBASE_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Erro ao buscar produtos: HTTP ${response.status}`);
  const products = normalizeProducts(await response.json());
  if (!products.length) throw new Error('Nenhum produto válido encontrado; sitemap anterior preservado.');

  atomicWrite(path.join(OUTPUT_DIR, 'sitemap.xml'), buildSitemap(products));
  atomicWrite(path.join(OUTPUT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`Sitemap gerado com ${products.length} produtos e páginas institucionais.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Erro ao gerar sitemap:', error);
    process.exit(1);
  });
}

module.exports = { buildSitemap, normalizeProducts, queryUrl };
