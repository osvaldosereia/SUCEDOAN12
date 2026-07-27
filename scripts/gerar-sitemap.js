const fs = require('fs');
const path = require('path');
const {
  SITE_URL, atomicWrite, loadComboCatalog, xmlEscape,
} = require('./catalogos-combos-lib');

const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '..');

const STATIC_PAGES = [
  '/',
  '/cestas/',
  '/sobre-nos.html',
  '/contato.html',
  '/politica-de-entrega.html',
  '/politica-de-troca.html',
  '/politica-de-privacidade.html',
  '/termos-de-uso.html',
];

function fileDate(relative, fallback = '') {
  try {
    return fs.statSync(path.join(OUTPUT_DIR, relative.replace(/^\//, '') || 'index.html')).mtime.toISOString().slice(0, 10);
  } catch {
    return fallback || '';
  }
}

function urlXml(entry) {
  const lines = ['  <url>', `    <loc>${xmlEscape(entry.loc)}</loc>`];
  if (entry.lastmod) lines.push(`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`);
  if (entry.image) {
    lines.push('    <image:image>');
    lines.push(`      <image:loc>${xmlEscape(entry.image)}</image:loc>`);
    if (entry.imageTitle) lines.push(`      <image:title>${xmlEscape(entry.imageTitle)}</image:title>`);
    lines.push('    </image:image>');
  }
  lines.push('  </url>');
  return lines.join('\n');
}

function buildSitemap(catalog, fallbackDate = '') {
  const entries = STATIC_PAGES.map(page => {
    const relative = page === '/' ? 'index.html' : page.replace(/^\//, '');
    return {
      loc: `${SITE_URL}${page}`,
      lastmod: fileDate(relative, fallbackDate),
    };
  });

  catalog.baskets.filter(record => record.details.valid).forEach(record => entries.push({
    loc: record.link,
    lastmod: fileDate(`${record.seoPath.replace(/^\/|\/$/g, '')}/index.html`, record.lastmod || fallbackDate),
    image: record.image,
    imageTitle: record.title,
  }));

  const unique = [...new Map(entries.map(entry => [entry.loc, entry])).values()];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${unique.map(urlXml).join('\n')}\n</urlset>\n`;
}

function robotsText() {
  return `User-agent: *\nAllow: /\nDisallow: /producao/\nDisallow: /producao-v2/\nDisallow: /site/produtos-admin.json\nDisallow: /site/produtos_admin_meta.json\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

function main() {
  const catalog = loadComboCatalog();
  const baskets = catalog.baskets.filter(item => item.details.valid);
  atomicWrite(path.join(OUTPUT_DIR, 'sitemap.xml'), buildSitemap(catalog));
  atomicWrite(path.join(OUTPUT_DIR, 'robots.txt'), robotsText());
  console.log(`Sitemap focado em cestas básicas gerado com ${baskets.length} páginas de cestas.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Erro ao gerar sitemap:', error);
    process.exit(1);
  }
}

module.exports = { buildSitemap, robotsText, urlXml };
