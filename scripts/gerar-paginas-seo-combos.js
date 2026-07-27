const fs = require('fs');
const path = require('path');
const {
  SITE_URL, STORE_NAME, absoluteImage, atomicWrite, cleanText, htmlEscape,
  loadComboCatalog,
} = require('./catalogos-combos-lib');

const ROOT = process.env.OUTPUT_DIR || path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'site', 'seo-combos-manifest.json');
const APP_SHELL_PATH = path.join(ROOT, 'index.html');
const WHATSAPP = '5565998150975';
const ORGANIZATION_ID = `${SITE_URL}/#organization`;

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function jsonScript(value) {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': ORGANIZATION_ID,
    name: STORE_NAME,
    alternateName: 'Dona Antônia',
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/img/logoantonia5.png`,
    image: `${SITE_URL}/img/logoantonia5.png`,
    description: 'Delivery de cestas básicas, kits promocionais e produtos de supermercado em Cuiabá e Várzea Grande.',
    email: 'atendimento@donaantonia.com.br',
    telephone: '+5565998150975',
    taxID: '51.385.335/0001-06',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      telephone: '+5565998150975',
      email: 'atendimento@donaantonia.com.br',
      areaServed: 'BR',
      availableLanguage: 'Portuguese',
    },
    areaServed: [
      { '@type': 'City', name: 'Cuiabá', containedInPlace: { '@type': 'State', name: 'Mato Grosso' } },
      { '@type': 'City', name: 'Várzea Grande', containedInPlace: { '@type': 'State', name: 'Mato Grosso' } },
    ],
  };
}

function breadcrumbSchema(entries) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.url,
    })),
  };
}

function replaceOrInsert(html, pattern, replacement) {
  if (pattern.test(html)) return html.replace(pattern, replacement);
  return html.replace('</head>', `  ${replacement}\n</head>`);
}

function appShellPage({
  title,
  description,
  canonical,
  image,
  robots = 'index,follow,max-image-preview:large,max-snippet:-1',
  schemas = [],
  fallbackHtml = '',
  ogType = 'website',
  routeKind = 'collection',
}) {
  if (!fs.existsSync(APP_SHELL_PATH)) throw new Error(`Shell principal ausente: ${APP_SHELL_PATH}`);
  let html = fs.readFileSync(APP_SHELL_PATH, 'utf8');

  html = replaceOrInsert(html, /<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(title)}</title>`);
  html = replaceOrInsert(html, /<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${htmlEscape(description)}">`);
  html = replaceOrInsert(html, /<meta\s+name=["']robots["'][^>]*>/i, `<meta name="robots" content="${htmlEscape(robots)}">`);
  html = replaceOrInsert(html, /<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${htmlEscape(canonical)}">`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:type["'][^>]*>/i, `<meta property="og:type" content="${htmlEscape(ogType)}">`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${htmlEscape(title)}">`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${htmlEscape(description)}">`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${htmlEscape(canonical)}">`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${htmlEscape(image || `${SITE_URL}/img/logoantonia5.png`)}">`);

  if (!/<base\s/i.test(html)) {
    html = html.replace(/(<meta\s+name=["']viewport["'][^>]*>)/i, '$1\n  <base href="/">');
  }

  const structuredData = schemas
    .map((schema, index) => `  <script id="combo-jsonld-${index + 1}" type="application/ld+json">${jsonScript(schema)}</script>`)
    .join('\n');
  const compatibilityHead = `  <meta name="da-clean-combo-shell" content="${htmlEscape(routeKind)}">\n  <style id="seo-combos-critical">.seo-noscript{max-width:1180px;margin:0 auto;padding:24px;font-family:Arial,sans-serif}.seo-noscript h1{font-size:clamp(28px,5vw,48px)}.seo-noscript-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}.seo-noscript-card,.seo-noscript-product{border:1px solid #e5e7eb;border-radius:16px;padding:16px;background:#fff}.seo-noscript img{max-width:100%;height:auto;object-fit:contain}.seo-combo-items{list-style:none;padding:0;display:grid;gap:10px}.seo-combo-items li{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #e5e7eb;border-radius:12px;padding:10px}.seo-combo-items li img{width:64px;height:64px}.seo-combo-items li span{font-weight:700;white-space:nowrap}</style>\n${structuredData}`;
  html = html.replace('</head>', `${compatibilityHead}\n</head>`);

  const fallback = fallbackHtml ? `<noscript>${fallbackHtml}</noscript>` : '';
  html = html.replace(/<body([^>]*)>/i, `<body$1 data-clean-combo-shell="${htmlEscape(routeKind)}">\n${fallback}`);
  return html;
}

function productName(row) {
  return cleanText(row.product?.nome || row.product?.name || row.product?.codigo || row.requestedCode || 'Produto');
}

function componentRows(record) {
  const rows = record.details.resolvedItems.filter(row => row.product);
  if (!rows.length) return '<p>Os produtos desta opção estão sendo atualizados.</p>';
  return `<ul class="seo-combo-items">${rows.map(row => {
    const image = absoluteImage(row.product?.url_imagem || row.product?.imagem || row.product?.img || row.product?.foto);
    const packageText = cleanText(row.product?.embalagem || '');
    return `<li><img src="${htmlEscape(image)}" alt="${htmlEscape(productName(row))}" loading="lazy" decoding="async"><div><strong>${htmlEscape(productName(row))}</strong>${packageText ? `<small>${htmlEscape(packageText)}</small>` : ''}</div><span>${row.qty} un</span></li>`;
  }).join('')}</ul>`;
}

function productSchema(record) {
  const end = record.source?.data_fim || record.source?.dataFim || '';
  const offer = {
    '@type': 'Offer',
    url: record.link,
    priceCurrency: 'BRL',
    price: record.details.price.toFixed(2),
    availability: record.details.catalogActive ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@id': ORGANIZATION_ID },
  };
  if (end && record.type === 'kit') offer.priceValidUntil = end;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${record.link}#product`,
    name: record.title,
    description: record.description,
    image: [record.image],
    url: record.link,
    sku: record.id,
    mpn: record.code || record.id,
    brand: { '@type': 'Brand', name: record.brand },
    category: record.productType,
    offers: offer,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Quantidade de produtos', value: record.details.uniqueProducts },
      { '@type': 'PropertyValue', name: 'Quantidade total de unidades', value: record.details.units },
      { '@type': 'PropertyValue', name: 'Modalidade', value: 'Somente delivery' },
      { '@type': 'PropertyValue', name: 'Área de entrega', value: 'Cuiabá e Várzea Grande' },
    ],
  };
}

function productFallback(record) {
  const typeLabel = record.type === 'kit' ? 'Kit promocional' : 'Cesta básica';
  const collectionPath = record.type === 'kit' ? '/kits/' : '/cestas/';
  const whatsappText = encodeURIComponent(`Olá, quero pedir ${record.source?.nome || record.title}. Vi no site: ${record.link}`);
  return `<main class="seo-noscript"><p><a href="/">Início</a> › <a href="${collectionPath}">${record.type === 'kit' ? 'Kits' : 'Cestas'}</a></p><article class="seo-noscript-product"><img src="${htmlEscape(record.image)}" alt="${htmlEscape(record.title)}" width="720" height="720"><p><strong>${htmlEscape(typeLabel)} · Somente delivery</strong></p><h1>${htmlEscape(record.title)}</h1><p>${htmlEscape(record.description)}</p><p><strong>${htmlEscape(money(record.details.price))}</strong></p><p>Entrega em Cuiabá e Várzea Grande. Pedido mínimo de R$ 75,00.</p><p><a href="${htmlEscape(record.legacyLink)}">Abrir na loja</a> · <a href="https://wa.me/${WHATSAPP}?text=${whatsappText}">Pedir pelo WhatsApp</a></p><h2>Produtos desta ${record.type === 'kit' ? 'oferta' : 'cesta'}</h2>${componentRows(record)}</article></main>`;
}

function productPage(record) {
  const collectionUrl = `${SITE_URL}/${record.type === 'kit' ? 'kits' : 'cestas'}/`;
  const breadcrumb = breadcrumbSchema([
    { name: 'Dona Antônia', url: `${SITE_URL}/` },
    { name: record.type === 'kit' ? 'Kits promocionais' : 'Cestas básicas', url: collectionUrl },
    { name: record.source?.nome || record.title, url: record.link },
  ]);
  const title = `${record.title} em Cuiabá e Várzea Grande | Dona Antônia`;
  const description = cleanText(record.description).slice(0, 300);
  return appShellPage({
    title,
    description,
    canonical: record.link,
    image: record.image,
    robots: record.details.catalogActive ? 'index,follow,max-image-preview:large,max-snippet:-1' : 'noindex,follow',
    schemas: [productSchema(record), breadcrumb],
    fallbackHtml: productFallback(record),
    ogType: 'product',
    routeKind: record.type,
  });
}

function faqSchema(type) {
  const isKit = type === 'kit';
  const questions = [
    {
      q: isKit ? 'Como funcionam os kits promocionais?' : 'Posso conferir os produtos da cesta antes de comprar?',
      a: isKit ? 'Cada kit reúne produtos selecionados por um preço promocional. A composição completa aparece na página do kit.' : 'Sim. Cada página informa a composição e as quantidades. A cesta também pode ser ajustada antes de ser adicionada ao pedido.',
    },
    { q: 'A Dona Antônia possui loja física?', a: 'Não. A Dona Antônia trabalha somente com delivery em Cuiabá e Várzea Grande.' },
    { q: 'Qual é o pedido mínimo?', a: 'O pedido mínimo é de R$ 75,00. A entrega é grátis dentro da área atendida.' },
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

function collectionFallback(type, records, description) {
  const isKit = type === 'kit';
  return `<main class="seo-noscript"><section><p><strong>Somente delivery</strong></p><h1>${isKit ? 'Kits promocionais' : 'Cestas básicas'} em Cuiabá e Várzea Grande</h1><p>${htmlEscape(description)}</p><p>Pedido mínimo: R$ 75,00 · Entrega grátis na área atendida · Confirmação pelo WhatsApp</p></section><section class="seo-noscript-grid">${records.map(record => `<article class="seo-noscript-card"><a href="${htmlEscape(record.seoPath)}"><img src="${htmlEscape(record.image)}" alt="${htmlEscape(record.title)}" loading="lazy"><h2>${htmlEscape(record.title)}</h2><p>${htmlEscape(cleanText(record.description).slice(0, 150))}</p><strong>${htmlEscape(money(record.details.price))}</strong></a></article>`).join('')}</section></main>`;
}

function collectionPage(type, records) {
  const isKit = type === 'kit';
  const title = isKit
    ? 'Kits promocionais com delivery em Cuiabá e Várzea Grande | Dona Antônia'
    : 'Cestas básicas com delivery em Cuiabá e Várzea Grande | Dona Antônia';
  const description = isKit
    ? 'Confira kits promocionais ativos, composição, preços e disponibilidade para delivery em Cuiabá e Várzea Grande.'
    : 'Compare cestas básicas econômicas, pequenas, médias e grandes com composição completa e delivery em Cuiabá e Várzea Grande.';
  const canonical = `${SITE_URL}/${isKit ? 'kits' : 'cestas'}/`;
  const visibleRecords = isKit ? records.filter(record => record.details.catalogActive) : records.filter(record => record.details.valid);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: isKit ? 'Kits promocionais Dona Antônia' : 'Cestas básicas Dona Antônia',
    numberOfItems: visibleRecords.length,
    itemListElement: visibleRecords.map((record, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: record.link,
      name: record.title,
    })),
  };
  const breadcrumb = breadcrumbSchema([
    { name: 'Dona Antônia', url: `${SITE_URL}/` },
    { name: isKit ? 'Kits promocionais' : 'Cestas básicas', url: canonical },
  ]);
  return appShellPage({
    title,
    description,
    canonical,
    image: visibleRecords[0]?.image,
    schemas: [itemList, breadcrumb, faqSchema(type)],
    fallbackHtml: collectionFallback(type, visibleRecords, description),
    routeKind: isKit ? 'kits' : 'cestas',
  });
}

function safeManifest() {
  try {
    const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return Array.isArray(data?.files) ? data.files : [];
  } catch {
    return [];
  }
}

function removeStaleFiles(previous, current) {
  const keep = new Set(current);
  previous.filter(file => !keep.has(file)).forEach(relative => {
    if (!/^(cestas|kits)\/[a-z0-9-]+\/index\.html$/.test(relative)) return;
    const full = path.join(ROOT, relative);
    try { fs.unlinkSync(full); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    try { fs.rmdirSync(path.dirname(full)); } catch {}
  });
}

function buildPages(catalog) {
  const files = [];
  const write = (relative, content) => {
    atomicWrite(path.join(ROOT, relative), content);
    files.push(relative);
  };

  write('cestas/index.html', collectionPage('basket', catalog.baskets));
  write('kits/index.html', collectionPage('kit', catalog.kits));

  catalog.baskets.filter(record => record.details.valid).forEach(record => {
    const relative = `${record.seoPath.replace(/^\/|\/$/g, '')}/index.html`;
    write(relative, productPage(record));
  });

  catalog.kits.filter(record => record.details.valid).forEach(record => {
    const relative = `${record.seoPath.replace(/^\/|\/$/g, '')}/index.html`;
    write(relative, productPage(record));
  });

  const sorted = files.sort();
  removeStaleFiles(safeManifest(), sorted);
  atomicWrite(MANIFEST_PATH, `${JSON.stringify({ version: 2, shell: 'index.html', files: sorted }, null, 2)}\n`);
  return sorted;
}

function main() {
  const catalog = loadComboCatalog();
  const files = buildPages(catalog);
  console.log(`Páginas SEO integradas à aplicação geradas: ${files.length} arquivos para cestas e kits.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error('Erro ao gerar páginas integradas de cestas e kits:', error); process.exit(1); }
}

module.exports = {
  appShellPage,
  buildPages,
  collectionPage,
  organizationSchema,
  productPage,
  productSchema,
};
