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
    description: 'Cestas básicas com composição completa e delivery em Cuiabá e Várzea Grande.',
    email: 'atendimento@donaantonia.com.br',
    telephone: '+5565998150975',
    taxID: '51.385.335/0001-06',
    areaServed: [
      { '@type': 'City', name: 'Cuiabá', containedInPlace: { '@type': 'State', name: 'Mato Grosso' } },
      { '@type': 'City', name: 'Várzea Grande', containedInPlace: { '@type': 'State', name: 'Mato Grosso' } },
    ],
  };
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function jsonScript(value) {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
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
    .map((schema, index) => `  <script id="basket-jsonld-${index + 1}" type="application/ld+json">${jsonScript(schema)}</script>`)
    .join('\n');
  const critical = `  <meta name="da-clean-combo-shell" content="${htmlEscape(routeKind)}">\n  <style id="seo-combos-critical">.seo-noscript{max-width:1180px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#142018}.seo-noscript h1{font-size:clamp(28px,5vw,48px)}.seo-noscript-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}.seo-noscript-card,.seo-noscript-product,.seo-answer-block{border:1px solid #dfe7df;border-radius:16px;padding:16px;background:#fff}.seo-noscript img{max-width:100%;height:auto;object-fit:contain}.seo-combo-items{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.seo-combo-items li{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #dfe7df;border-radius:12px;padding:10px}.seo-combo-items li img{width:64px;height:64px}.seo-combo-items li span{font-weight:700;white-space:nowrap}</style>\n${structuredData}`;
  html = html.replace('</head>', `${critical}\n</head>`);

  const fallback = fallbackHtml ? `<noscript>${fallbackHtml}</noscript>` : '';
  html = html.replace(/<body([^>]*)>/i, `<body$1 data-clean-combo-shell="${htmlEscape(routeKind)}">\n${fallback}`);
  return html;
}

function productName(row) {
  return cleanText(row.product?.nome || row.product?.name || row.product?.codigo || row.requestedCode || 'Produto');
}

function componentRows(record) {
  const rows = record.details.resolvedItems.filter(row => row.product);
  if (!rows.length) return '<p>Os produtos desta cesta estão sendo atualizados.</p>';
  return `<ul class="seo-combo-items">${rows.map(row => {
    const image = absoluteImage(row.product?.url_imagem || row.product?.imagem || row.product?.img || row.product?.foto);
    const packageText = cleanText(row.product?.embalagem || '');
    return `<li><img src="${htmlEscape(image)}" alt="${htmlEscape(productName(row))}" loading="lazy" decoding="async" width="64" height="64"><div><strong>${htmlEscape(productName(row))}</strong>${packageText ? `<small>${htmlEscape(packageText)}</small>` : ''}</div><span>${row.qty} un</span></li>`;
  }).join('')}</ul>`;
}

function basketProductSchema(record) {
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
    brand: { '@type': 'Brand', name: record.brand || 'Dona Antônia' },
    category: 'Cesta básica',
    areaServed: [
      { '@type': 'City', name: 'Cuiabá' },
      { '@type': 'City', name: 'Várzea Grande' },
    ],
    offers: {
      '@type': 'Offer',
      url: record.link,
      priceCurrency: 'BRL',
      price: record.details.price.toFixed(2),
      availability: record.details.catalogActive ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': ORGANIZATION_ID },
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Quantidade de produtos', value: record.details.uniqueProducts },
      { '@type': 'PropertyValue', name: 'Quantidade total de unidades', value: record.details.units },
      { '@type': 'PropertyValue', name: 'Composição', value: 'Composição completa disponível nesta página' },
      { '@type': 'PropertyValue', name: 'Personalização', value: 'Quantidades ajustáveis antes de adicionar ao pedido' },
      { '@type': 'PropertyValue', name: 'Modalidade', value: 'Somente delivery' },
      { '@type': 'PropertyValue', name: 'Área de entrega', value: 'Cuiabá e Várzea Grande' },
    ],
  };
}

function basketWebPageSchema(record) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${record.link}#webpage`,
    url: record.link,
    name: record.title,
    description: record.description,
    inLanguage: 'pt-BR',
    about: { '@id': `${record.link}#product` },
    isPartOf: { '@id': `${SITE_URL}/#website` },
    primaryImageOfPage: { '@type': 'ImageObject', url: record.image },
  };
}

function basketFallback(record) {
  const whatsappText = encodeURIComponent(`Olá, quero pedir ${record.source?.nome || record.title}. Vi no site: ${record.link}`);
  return `<main class="seo-noscript"><p><a href="/">Início</a> › <a href="/cestas/">Cestas básicas</a></p><article class="seo-noscript-product"><img src="${htmlEscape(record.image)}" alt="${htmlEscape(record.title)}" width="720" height="720"><p><strong>Cesta básica · Somente delivery</strong></p><h1>${htmlEscape(record.title)}</h1><p>${htmlEscape(record.description)}</p><p><strong>${htmlEscape(money(record.details.price))}</strong></p><div class="seo-answer-block"><h2>Onde comprar esta cesta básica?</h2><p>A Dona Antônia atende por delivery em Cuiabá e Várzea Grande. O pedido é conferido e confirmado pelo WhatsApp.</p><h2>Posso conferir e ajustar a composição?</h2><p>Sim. Todos os produtos e quantidades aparecem abaixo. Na loja, as quantidades da cesta podem ser ajustadas antes de adicionar ao pedido.</p><h2>Qual é o pedido mínimo?</h2><p>O pedido mínimo é de R$ 75,00, com entrega grátis dentro da área atendida.</p></div><p><a href="${htmlEscape(record.legacyLink)}">Abrir a cesta na loja</a> · <a href="https://wa.me/${WHATSAPP}?text=${whatsappText}">Pedir pelo WhatsApp</a></p><h2>Produtos desta cesta básica</h2>${componentRows(record)}</article></main>`;
}

function kitFallback(record) {
  return `<main class="seo-noscript"><p><a href="/">Início</a> › <a href="/kits/">Kits promocionais</a></p><article class="seo-noscript-product"><img src="${htmlEscape(record.image)}" alt="${htmlEscape(record.title)}" width="720" height="720"><p><strong>Kit promocional</strong></p><h1>${htmlEscape(record.title)}</h1><p>${htmlEscape(record.description)}</p><p><strong>${htmlEscape(money(record.details.price))}</strong></p><p><a href="${htmlEscape(record.legacyLink)}">Abrir na loja</a></p>${componentRows(record)}</article></main>`;
}

function basketPage(record) {
  const breadcrumb = breadcrumbSchema([
    { name: 'Dona Antônia', url: `${SITE_URL}/` },
    { name: 'Cestas básicas', url: `${SITE_URL}/cestas/` },
    { name: record.source?.nome || record.title, url: record.link },
  ]);
  const title = `${record.title} - Cesta Básica em Cuiabá e Várzea Grande | Dona Antônia`;
  const description = `${cleanText(record.description)} Confira a composição completa, ajuste as quantidades e peça com delivery em Cuiabá e Várzea Grande.`.slice(0, 300);
  return appShellPage({
    title,
    description,
    canonical: record.link,
    image: record.image,
    robots: record.details.catalogActive ? 'index,follow,max-image-preview:large,max-snippet:-1' : 'noindex,follow',
    schemas: [basketProductSchema(record), basketWebPageSchema(record), breadcrumb],
    fallbackHtml: basketFallback(record),
    ogType: 'product',
    routeKind: 'basket',
  });
}

function kitPage(record) {
  return appShellPage({
    title: `${record.title} | Dona Antônia`,
    description: cleanText(record.description).slice(0, 300),
    canonical: record.link,
    image: record.image,
    robots: 'noindex,follow',
    schemas: [],
    fallbackHtml: kitFallback(record),
    ogType: 'website',
    routeKind: 'kit',
  });
}

function basketFaqSchema() {
  const questions = [
    {
      q: 'Onde comprar cesta básica em Cuiabá e Várzea Grande?',
      a: 'A Dona Antônia vende cestas básicas por delivery em Cuiabá e Várzea Grande, com atendimento e confirmação do pedido pelo WhatsApp.',
    },
    {
      q: 'Posso ver os produtos antes de comprar a cesta básica?',
      a: 'Sim. Cada cesta possui uma página com a composição completa, as marcas disponíveis e as quantidades de cada produto.',
    },
    {
      q: 'É possível alterar a quantidade dos produtos da cesta?',
      a: 'Sim. As quantidades da cesta básica podem ser ajustadas antes de adicionar a cesta ao pedido.',
    },
    {
      q: 'Qual é o pedido mínimo e o valor da entrega?',
      a: 'O pedido mínimo é de R$ 75,00 e a entrega é grátis dentro da área atendida em Cuiabá e Várzea Grande.',
    },
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

function basketCollectionFallback(records, description) {
  return `<main class="seo-noscript"><section><p><strong>Somente delivery</strong></p><h1>Cestas básicas em Cuiabá e Várzea Grande</h1><p>${htmlEscape(description)}</p><div class="seo-answer-block"><h2>Como escolher uma cesta básica?</h2><p>Compare o tamanho, o valor e a composição de cada opção. A página de cada cesta mostra todos os produtos e quantidades antes da compra.</p><h2>Quais tamanhos estão disponíveis?</h2><p>O catálogo reúne cestas econômicas, pequenas, médias e grandes, com diferentes marcas e composições.</p><h2>Como funciona a entrega?</h2><p>A Dona Antônia trabalha somente com delivery em Cuiabá e Várzea Grande. O pedido mínimo é de R$ 75,00.</p></div></section><section class="seo-noscript-grid">${records.map(record => `<article class="seo-noscript-card"><a href="${htmlEscape(record.seoPath)}"><img src="${htmlEscape(record.image)}" alt="${htmlEscape(record.title)}" loading="lazy"><h2>${htmlEscape(record.title)}</h2><p>${htmlEscape(cleanText(record.description).slice(0, 180))}</p><strong>${htmlEscape(money(record.details.price))}</strong></a></article>`).join('')}</section></main>`;
}

function kitCollectionFallback(records) {
  return `<main class="seo-noscript"><h1>Kits promocionais</h1><p>Confira os kits disponíveis na loja.</p><section class="seo-noscript-grid">${records.map(record => `<article class="seo-noscript-card"><a href="${htmlEscape(record.seoPath)}"><img src="${htmlEscape(record.image)}" alt="${htmlEscape(record.title)}" loading="lazy"><h2>${htmlEscape(record.title)}</h2><strong>${htmlEscape(money(record.details.price))}</strong></a></article>`).join('')}</section></main>`;
}

function basketCollectionPage(records) {
  const title = 'Cestas Básicas em Cuiabá e Várzea Grande | Dona Antônia';
  const description = 'Compare cestas básicas econômicas, pequenas, médias e grandes, confira a composição completa e peça com delivery em Cuiabá e Várzea Grande.';
  const canonical = `${SITE_URL}/cestas/`;
  const visible = records.filter(record => record.details.valid);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${canonical}#list`,
    name: 'Cestas básicas Dona Antônia',
    description,
    numberOfItems: visible.length,
    itemListElement: visible.map((record, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: record.link,
      name: record.title,
      image: record.image,
    })),
  };
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: 'pt-BR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntity: { '@id': `${canonical}#list` },
    about: { '@type': 'Thing', name: 'Cestas básicas com delivery em Cuiabá e Várzea Grande' },
  };
  const breadcrumb = breadcrumbSchema([
    { name: 'Dona Antônia', url: `${SITE_URL}/` },
    { name: 'Cestas básicas', url: canonical },
  ]);
  return appShellPage({
    title,
    description,
    canonical,
    image: visible[0]?.image,
    schemas: [collection, itemList, breadcrumb, basketFaqSchema()],
    fallbackHtml: basketCollectionFallback(visible, description),
    routeKind: 'cestas',
  });
}

function kitCollectionPage(records) {
  const canonical = `${SITE_URL}/kits/`;
  const visible = records.filter(record => record.details.catalogActive);
  return appShellPage({
    title: 'Kits promocionais | Dona Antônia',
    description: 'Kits promocionais disponíveis na loja Dona Antônia.',
    canonical,
    image: visible[0]?.image,
    robots: 'noindex,follow',
    schemas: [],
    fallbackHtml: kitCollectionFallback(visible),
    routeKind: 'kits',
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

  write('cestas/index.html', basketCollectionPage(catalog.baskets));
  write('kits/index.html', kitCollectionPage(catalog.kits));

  catalog.baskets.filter(record => record.details.valid).forEach(record => {
    const relative = `${record.seoPath.replace(/^\/|\/$/g, '')}/index.html`;
    write(relative, basketPage(record));
  });

  catalog.kits.filter(record => record.details.valid).forEach(record => {
    const relative = `${record.seoPath.replace(/^\/|\/$/g, '')}/index.html`;
    write(relative, kitPage(record));
  });

  const sorted = files.sort();
  removeStaleFiles(safeManifest(), sorted);
  atomicWrite(MANIFEST_PATH, `${JSON.stringify({
    version: 3,
    shell: 'index.html',
    seoFocus: 'cestas-basicas',
    indexedCollections: ['cestas'],
    files: sorted,
  }, null, 2)}\n`);
  return sorted;
}

function main() {
  const catalog = loadComboCatalog();
  buildPages(catalog);
  console.log(`Páginas públicas geradas: ${catalog.baskets.filter(item => item.details.valid).length} cestas indexáveis e kits funcionais em noindex.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Erro ao gerar páginas públicas:', error);
    process.exit(1);
  }
}

module.exports = {
  appShellPage,
  basketCollectionPage,
  basketPage,
  basketProductSchema,
  buildPages,
  kitCollectionPage,
  kitPage,
  organizationSchema,
};
