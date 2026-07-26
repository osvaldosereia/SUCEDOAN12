const path = require('path');
const { SITE_URL, atomicWrite, loadComboCatalog, xmlEscape } = require('./catalogos-combos-lib');

const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '..');

const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.00' },
  { path: '/?secao=cestas', changefreq: 'daily', priority: '0.98' },
  { path: '/?secao=kits', changefreq: 'daily', priority: '0.92' },
  { path: '/sobre-nos.html', changefreq: 'monthly', priority: '0.60' },
  { path: '/contato.html', changefreq: 'monthly', priority: '0.60' },
  { path: '/politica-de-entrega.html', changefreq: 'monthly', priority: '0.50' },
  { path: '/politica-de-troca.html', changefreq: 'monthly', priority: '0.45' },
  { path: '/politica-de-privacidade.html', changefreq: 'yearly', priority: '0.30' },
  { path: '/termos-de-uso.html', changefreq: 'yearly', priority: '0.30' },
];

function urlXml(entry) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(entry.loc)}</loc>`,
    `    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`,
    `    <changefreq>${entry.changefreq}</changefreq>`,
    `    <priority>${entry.priority}</priority>`,
    '  </url>',
  ].join('\n');
}

function buildSitemap(catalog, today = new Date().toISOString().slice(0, 10)) {
  const entries = STATIC_PAGES.map(page => ({
    loc: `${SITE_URL}${page.path}`,
    lastmod: today,
    changefreq: page.changefreq,
    priority: page.priority,
  }));

  catalog.baskets.filter(record => record.details.valid).forEach(record => entries.push({
    loc: record.link,
    lastmod: today,
    changefreq: 'daily',
    priority: record.details.catalogActive ? '0.96' : '0.70',
  }));

  catalog.kits.filter(record => record.details.catalogActive).forEach(record => entries.push({
    loc: record.link,
    lastmod: today,
    changefreq: 'daily',
    priority: '0.90',
  }));

  const unique = [...new Map(entries.map(entry => [entry.loc, entry])).values()];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map(urlXml).join('\n')}\n</urlset>\n`;
}

function main() {
  const catalog = loadComboCatalog();
  const sitemap = buildSitemap(catalog);
  atomicWrite(path.join(OUTPUT_DIR, 'sitemap.xml'), sitemap);
  atomicWrite(path.join(OUTPUT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`Sitemap gerado com foco em ${catalog.baskets.filter(item => item.details.valid).length} cestas e ${catalog.kits.filter(item => item.details.catalogActive).length} kits ativos.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error('Erro ao gerar sitemap:', error); process.exit(1); }
}

module.exports = { buildSitemap };
