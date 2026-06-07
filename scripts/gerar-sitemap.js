/*
  Sitemap profissional para SEO local da Dona Antônia.
  Gera sitemap.xml e robots.txt com:
  - home
  - páginas locais: Cuiabá e Várzea Grande
  - seções principais
  - categorias
  - subcategorias
  - marcas
  - buscas comerciais locais
  - produtos individuais

  Rodar localmente: node scripts/gerar-sitemap.js
*/

const fs = require('fs');
const path = require('path');

const FIREBASE_URL = process.env.FIREBASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos.json';
const SITE_URL = (process.env.SITE_URL || 'https://www.donaantonia.com.br').replace(/\/$/, '');
const OUTPUT_DIR = process.env.OUTPUT_DIR || process.cwd();

const CIDADES = ['cuiaba', 'varzea-grande'];
const SECOES = [
  { slug: 'ofertas', changefreq: 'daily', priority: '0.90' },
  { slug: 'cestas-basicas', changefreq: 'weekly', priority: '0.90' },
  { slug: 'combos', changefreq: 'daily', priority: '0.75' },
  { slug: 'mercado', changefreq: 'weekly', priority: '0.70' },
  { slug: 'informacoes', changefreq: 'monthly', priority: '0.40' }
];

const BUSCAS_LOCAIS_IMPORTANTES = [
  'cesta basica',
  'cestas basicas',
  'supermercado online',
  'mercado online',
  'entrega de mercado',
  'produtos de limpeza',
  'produtos de beleza',
  'higiene pessoal',
  'mercearia',
  'ofertas de supermercado'
];

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugify(value, fallback = 'produto') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^\-+|\-+$/g, '') || fallback;
}

function urlWith(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && String(value).trim() !== '') qs.set(key, String(value));
  }
  const query = qs.toString();
  return `${SITE_URL}/${query ? '?' + query : ''}`;
}

function getProductRouteKey(produto) {
  const nome = produto.nome || produto.name || produto.titulo || produto.id || produto.codigo || 'produto';
  const slug = slugify(produto.slug || nome);
  const codigo = String(produto.codigo || produto.id || produto.firebaseKey || '').trim();
  return codigo ? `${encodeURIComponent(codigo)}-${slug}` : slug;
}

function getProductUrl(produto) {
  return urlWith({ p: getProductRouteKey(produto) });
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

function addUrl(urls, seen, data) {
  if (!data.loc || seen.has(data.loc)) return;
  seen.add(data.loc);
  urls.push(data);
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
  const urls = [];

  addUrl(urls, seen, { loc: `${SITE_URL}/`, lastmod: today, changefreq: 'daily', priority: '1.00' });

  for (const cidade of CIDADES) {
    addUrl(urls, seen, { loc: urlWith({ cidade }), lastmod: today, changefreq: 'weekly', priority: '0.95' });
  }

  for (const secao of SECOES) {
    addUrl(urls, seen, { loc: urlWith({ secao: secao.slug }), lastmod: today, changefreq: secao.changefreq, priority: secao.priority });
  }

  const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean).filter(c => c !== 'Cestas'))].sort((a,b) => a.localeCompare(b));
  const subcategorias = [...new Set(produtos.map(p => p.subcategoria).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const marcas = [...new Set(produtos.map(p => p.marca).filter(Boolean))]
    .filter(m => produtos.filter(p => p.marca === m).length >= 2)
    .sort((a,b) => a.localeCompare(b));

  for (const categoria of categorias) {
    const count = produtos.filter(p => p.categoria === categoria).length;
    addUrl(urls, seen, {
      loc: urlWith({ categoria: slugify(categoria, 'categoria') }),
      lastmod: today,
      changefreq: 'weekly',
      priority: count >= 10 ? '0.85' : '0.75'
    });
  }

  for (const subcategoria of subcategorias) {
    const count = produtos.filter(p => p.subcategoria === subcategoria).length;
    if (count < 2) continue;
    addUrl(urls, seen, {
      loc: urlWith({ subcategoria: slugify(subcategoria, 'subcategoria') }),
      lastmod: today,
      changefreq: 'weekly',
      priority: count >= 10 ? '0.78' : '0.68'
    });
  }

  for (const marca of marcas) {
    const count = produtos.filter(p => p.marca === marca).length;
    addUrl(urls, seen, {
      loc: urlWith({ marca: slugify(marca, 'marca') }),
      lastmod: today,
      changefreq: 'weekly',
      priority: count >= 8 ? '0.82' : '0.72'
    });
  }

  for (const termo of BUSCAS_LOCAIS_IMPORTANTES) {
    addUrl(urls, seen, {
      loc: urlWith({ busca: termo }),
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.62'
    });
  }

  for (const produto of produtos) {
    const loc = getProductUrl(produto);
    addUrl(urls, seen, {
      loc,
      lastmod: toDateIso(produto.last_update || produto.updated_at || produto.descricao_atualizada_em) || today,
      changefreq: Number(produto.estoque || produto.stock || 0) > 0 ? 'weekly' : 'monthly',
      priority: Number(produto.estoque || produto.stock || 0) > 0 ? '0.80' : '0.45'
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

  console.log(`Sitemap SEO local gerado com ${urls.length} URLs.`);
  console.log(`Produtos: ${produtos.length} | Categorias: ${categorias.length} | Subcategorias: ${subcategorias.length} | Marcas: ${marcas.length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
