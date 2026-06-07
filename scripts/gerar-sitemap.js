/*
  Gera sitemap.xml e robots.txt da Dona Antônia usando os produtos do Firebase.
  Como usar localmente: node scripts/gerar-sitemap.js
  Como usar no GitHub Actions: o workflow já executa este arquivo automaticamente.
*/

const fs = require('fs');
const path = require('path');

const FIREBASE_URL = process.env.FIREBASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos.json';
const SITE_URL = (process.env.SITE_URL || 'https://www.donaantonia.com.br').replace(/\/$/, '');
const OUTPUT_DIR = process.env.OUTPUT_DIR || process.cwd();

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugify(value) {
  return String(value || 'produto')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^\-+|\-+$/g, '') || 'produto';
}

function getProductRouteKey(produto) {
  const nome = produto.nome || produto.name || produto.titulo || produto.id || produto.codigo || 'produto';
  const slug = slugify(produto.slug || nome);
  const codigo = String(produto.codigo || produto.id || produto.firebaseKey || '').trim();
  return codigo ? `${encodeURIComponent(codigo)}-${slug}` : slug;
}

function getProductUrl(produto) {
  return `${SITE_URL}/?p=${encodeURIComponent(getProductRouteKey(produto))}`;
}

function toDateIso(value) {
  if (!value) return null;

  if (typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return null;
}

function normalizeProducts(raw) {
  const entries = Array.isArray(raw)
    ? raw.map((produto, index) => [String(index), produto])
    : Object.entries(raw || {});

  return entries
    .map(([firebaseKey, produto]) => ({ firebaseKey, ...(produto || {}) }))
    .filter(produto => produto && String(produto.situacao || 'A').toUpperCase() !== 'I')
    .filter(produto => produto.nome || produto.name)
    .filter(produto => Number(produto.preco || produto.price || 0) > 0);
}

function buildUrlEntry({ loc, lastmod, changefreq = 'weekly', priority = '0.8' }) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : '',
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>'
  ].filter(Boolean).join('\n');
}

async function main() {
  const response = await fetch(FIREBASE_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Erro ao buscar produtos: HTTP ${response.status}`);

  const raw = await response.json();
  const produtos = normalizeProducts(raw);
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();

  const urls = [
    { loc: `${SITE_URL}/`, lastmod: today, changefreq: 'daily', priority: '1.0' },
    { loc: `${SITE_URL}/#/ofertas`, lastmod: today, changefreq: 'daily', priority: '0.8' },
    { loc: `${SITE_URL}/#/cestas`, lastmod: today, changefreq: 'weekly', priority: '0.8' },
    { loc: `${SITE_URL}/#/combos`, lastmod: today, changefreq: 'daily', priority: '0.7' },
    { loc: `${SITE_URL}/#/informacoes`, lastmod: today, changefreq: 'monthly', priority: '0.3' }
  ];

  for (const produto of produtos) {
    const loc = getProductUrl(produto);
    if (seen.has(loc)) continue;
    seen.add(loc);

    urls.push({
      loc,
      lastmod: toDateIso(produto.last_update || produto.updated_at || produto.descricao_atualizada_em) || today,
      changefreq: 'weekly',
      priority: Number(produto.estoque || 0) > 0 ? '0.8' : '0.5'
    });
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(buildUrlEntry),
    '</urlset>',
    ''
  ].join('\n');

  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    ''
  ].join('\n');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), xml, 'utf8');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'robots.txt'), robots, 'utf8');

  console.log(`Sitemap gerado com ${urls.length} URLs (${produtos.length} produtos lidos).`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
