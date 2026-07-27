const fs = require('fs');
const path = require('path');
const {
  SITE_URL, STORE_NAME, absoluteImage, atomicWrite, cleanText, htmlEscape,
  loadComboCatalog,
} = require('./catalogos-combos-lib');

const ROOT = process.env.OUTPUT_DIR || path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'site', 'seo-combos-manifest.json');
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
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Cestas básicas e kits promocionais',
      itemListElement: [
        { '@type': 'OfferCatalog', name: 'Cestas básicas', url: `${SITE_URL}/cestas/` },
        { '@type': 'OfferCatalog', name: 'Kits promocionais', url: `${SITE_URL}/kits/` },
      ],
    },
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

function baseHead({ title, description, canonical, image, robots = 'index,follow,max-image-preview:large,max-snippet:-1', schemas = [] }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base href="/">
  <title>${htmlEscape(title)}</title>
  <meta name="description" content="${htmlEscape(description)}">
  <meta name="robots" content="${htmlEscape(robots)}">
  <link rel="canonical" href="${htmlEscape(canonical)}">
  <link rel="icon" href="/img/logoantonia5.png">
  <link rel="stylesheet" href="/site-public/assets/institutional.css?v=20260727-4">
  <link rel="stylesheet" href="/site-public/assets/seo-combos.css?v=20260727-4">
  <style id="seo-combos-critical">.seo-combo-items{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:10px}.seo-combo-items li{display:grid!important;grid-template-columns:64px minmax(0,1fr) auto!important;gap:14px!important;align-items:center!important;padding:10px!important;border:1px solid #e5e7eb!important;border-radius:14px!important}.seo-combo-items li>img{display:block!important;width:64px!important;height:64px!important;min-width:64px!important;max-width:64px!important;object-fit:contain!important;background:#fff!important;border-radius:10px!important}.seo-combo-items li>div{min-width:0!important}.seo-combo-items li strong{overflow-wrap:anywhere}.seo-combo-items li>span{font-weight:800;white-space:nowrap}@media(max-width:600px){.seo-combo-items li{grid-template-columns:54px minmax(0,1fr) auto!important}.seo-combo-items li>img{width:54px!important;height:54px!important;min-width:54px!important;max-width:54px!important}}</style>
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="Dona Antônia">
  <meta property="og:title" content="${htmlEscape(title)}">
  <meta property="og:description" content="${htmlEscape(description)}">
  <meta property="og:url" content="${htmlEscape(canonical)}">
  <meta property="og:image" content="${htmlEscape(image || `${SITE_URL}/img/logoantonia5.png`)}">
  <meta name="twitter:card" content="summary_large_image">
${schemas.map(schema => `  <script type="application/ld+json">${jsonScript(schema)}</script>`).join('\n')}
</head>`;
}

function header() {
  return `<header class="site-head"><div class="wrap"><div class="site-head-row"><a class="brand" href="/"><img src="/img/logoantonia5.png" alt="Dona Antônia"><span>Dona Antônia</span></a><a class="whatsapp" href="https://wa.me/${WHATSAPP}" target="_blank" rel="noopener">WhatsApp</a></div><nav class="site-nav" aria-label="Navegação principal"><a href="/">Loja</a><a href="/cestas/">Cestas básicas</a><a href="/kits/">Kits promocionais</a><a href="/sobre-nos.html">Sobre nós</a><a href="/politica-de-entrega.html">Entrega</a><a href="/contato.html">Contato</a></nav></div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="wrap site-footer-grid"><div><strong>${STORE_NAME}</strong><br>Somente delivery em Cuiabá e Várzea Grande - MT<br>CNPJ 51.385.335/0001-06 · WhatsApp (65) 99815-0975</div><nav><a href="/cestas/">Cestas</a><a href="/kits/">Kits</a><a href="/sobre-nos.html">Sobre nós</a><a href="/contato.html">Contato</a><a href="/politica-de-entrega.html">Entrega</a><a href="/politica-de-troca.html">Trocas</a></nav></div></footer>`;
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
    return `<li><img src="${htmlEscape(image)}" alt="${htmlEscape(productName(row))}" loading="lazy" decoding="async"><div><strong>${htmlEscape(productName(row))}</strong>${packageText ? `<small>${htmlEscape(packageText)}</small>` : ''}</div><span>${row.qty} ${row.qty === 1 ? 'un' : 'un'}</span></li>`;
  }).join('')}</ul>`;
}

function productSchema(record) {
  const end = record.source?.data_fim || record.source?.dataFim || '';
  const offer = {
    '@type': 'Offer',
    url: record.link,
    priceCurrency: 'BRL',
    price: record.details.price.toFixed(2),
    availability: record.details.catalogActive
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
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

function productPage(record) {
  const typeLabel = record.type === 'kit' ? 'Kit promocional' : 'Cesta básica';
  const collectionUrl = `${SITE_URL}/${record.type === 'kit' ? 'kits' : 'cestas'}/`;
  const appUrl = record.legacyLink;
  const whatsappText = encodeURIComponent(`Olá, quero pedir ${record.source?.nome || record.title}. Vi no site: ${record.link}`);
  const robots = record.details.catalogActive
    ? 'index,follow,max-image-preview:large,max-snippet:-1'
    : 'noindex,follow';
  const breadcrumb = breadcrumbSchema([
    { name: 'Dona Antônia', url: `${SITE_URL}/` },
    { name: record.type === 'kit' ? 'Kits promocionais' : 'Cestas básicas', url: collectionUrl },
    { name: record.source?.nome || record.title, url: record.link },
  ]);
  const title = `${record.title} em Cuiabá e Várzea Grande | Dona Antônia`;
  const description = cleanText(record.description).slice(0, 300);
  const status = record.details.catalogActive ? 'Disponível para delivery' : 'Indisponível no momento';
  return `${baseHead({
    title,
    description,
    canonical: record.link,
    image: record.image,
    robots,
    schemas: [productSchema(record), breadcrumb],
  })}
<body>
${header()}
<main class="wrap seo-combo-page">
  <nav class="seo-breadcrumb" aria-label="Navegação estrutural"><a href="/">Início</a><span>›</span><a href="/${record.type === 'kit' ? 'kits' : 'cestas'}/">${record.type === 'kit' ? 'Kits' : 'Cestas'}</a><span>›</span><span>${htmlEscape(record.source?.nome || record.title)}</span></nav>
  <article class="seo-product">
    <div class="seo-product-media"><img src="${htmlEscape(record.image)}" alt="${htmlEscape(record.title)}" width="720" height="720" fetchpriority="high"></div>
    <div class="seo-product-copy">
      <span class="eyebrow">${htmlEscape(typeLabel)} · Somente delivery</span>
      <h1>${htmlEscape(record.title)}</h1>
      <p class="lead">${htmlEscape(record.description)}</p>
      <div class="seo-availability ${record.details.catalogActive ? 'available' : 'unavailable'}">${htmlEscape(status)}</div>
      <div class="seo-price">${record.details.oldPrice > record.details.price ? `<s>${htmlEscape(money(record.details.oldPrice))}</s>` : ''}<strong>${htmlEscape(money(record.details.price))}</strong></div>
      <p class="seo-delivery-note">Entrega em Cuiabá e Várzea Grande. Pedido mínimo de R$ 75,00 e entrega grátis dentro da área atendida.</p>
      <div class="seo-actions">
        ${record.details.catalogActive ? `<a class="seo-primary" href="${htmlEscape(appUrl)}">Adicionar e montar pedido</a>` : `<a class="seo-primary" href="${htmlEscape(collectionUrl)}">Ver outras opções</a>`}
        <a class="seo-secondary" href="https://wa.me/${WHATSAPP}?text=${whatsappText}" target="_blank" rel="noopener">Pedir pelo WhatsApp</a>
      </div>
    </div>
  </article>
  <section class="card seo-products-section">
    <div class="seo-section-heading"><span class="eyebrow">Composição</span><h2>Produtos desta ${record.type === 'kit' ? 'oferta' : 'cesta'}</h2><p>${record.details.uniqueProducts} produtos diferentes e ${record.details.units} unidades no total.</p></div>
    ${componentRows(record)}
  </section>
  <section class="card seo-local-copy">
    <h2>${htmlEscape(typeLabel)} com delivery local</h2>
    <p>A Dona Antônia trabalha exclusivamente com entrega. Não temos loja física nem retirada no endereço administrativo. Os pedidos são confirmados pelo WhatsApp antes da separação e da rota de entrega.</p>
    <p>Atendemos Cuiabá e Várzea Grande com conferência dos produtos, confirmação de disponibilidade e suporte humano.</p>
  </section>
</main>
${footer()}
</body>
</html>
`;
}

function card(record) {
  const status = record.details.catalogActive ? 'Disponível' : 'Indisponível';
  return `<article class="seo-combo-card"><a href="${htmlEscape(record.seoPath)}"><img src="${htmlEscape(record.image)}" alt="${htmlEscape(record.title)}" loading="lazy" decoding="async"><div><small>${htmlEscape(status)} · ${record.details.uniqueProducts} produtos</small><h2>${htmlEscape(record.title)}</h2><p>${htmlEscape(cleanText(record.description).slice(0, 150))}</p><div class="seo-card-price">${record.details.oldPrice > record.details.price ? `<s>${htmlEscape(money(record.details.oldPrice))}</s>` : ''}<strong>${htmlEscape(money(record.details.price))}</strong></div><span class="seo-card-link">Ver composição e pedir</span></div></a></article>`;
}

function faqSchema(type) {
  const isKit = type === 'kit';
  const questions = [
    {
      q: isKit ? 'Como funcionam os kits promocionais?' : 'Posso conferir os produtos da cesta antes de comprar?',
      a: isKit ? 'Cada kit reúne produtos selecionados por um preço promocional. A composição completa aparece na página do kit.' : 'Sim. Cada página informa a composição e as quantidades. A cesta também pode ser ajustada antes de ser adicionada ao pedido.',
    },
    {
      q: 'A Dona Antônia possui loja física?',
      a: 'Não. A Dona Antônia trabalha somente com delivery em Cuiabá e Várzea Grande.',
    },
    {
      q: 'Qual é o pedido mínimo?',
      a: 'O pedido mínimo é de R$ 75,00. A entrega é grátis dentro da área atendida.',
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
  return `${baseHead({
    title,
    description,
    canonical,
    image: visibleRecords[0]?.image,
    schemas: [itemList, breadcrumb, faqSchema(type)],
  })}
<body>
${header()}
<main class="wrap seo-collection-page">
  <section class="page-hero"><span class="eyebrow">Somente delivery</span><h1>${isKit ? 'Kits promocionais' : 'Cestas básicas'} em Cuiabá e Várzea Grande</h1><p class="lead">${htmlEscape(description)}</p><div class="seo-collection-facts"><span>Pedido mínimo: R$ 75,00</span><span>Entrega grátis na área atendida</span><span>Pedido confirmado pelo WhatsApp</span></div></section>
  <section class="seo-card-grid">${visibleRecords.map(card).join('')}</section>
  <section class="card seo-local-copy">
    <h2>${isKit ? 'Como comprar os kits' : 'Como escolher sua cesta básica'}</h2>
    <p>Abra uma opção para conferir todos os produtos, quantidades, preço e disponibilidade. Depois, adicione ao pedido no site ou chame diretamente no WhatsApp.</p>
    <p>A Dona Antônia não possui loja física. Todo o atendimento é feito por delivery em Cuiabá e Várzea Grande.</p>
  </section>
  <section class="card seo-faq"><h2>Perguntas frequentes</h2><details><summary>${isKit ? 'Como funcionam os kits promocionais?' : 'Posso conferir a composição da cesta?'}</summary><p>${isKit ? 'Os kits reúnem produtos selecionados por preço promocional e ficam disponíveis enquanto houver estoque e validade da oferta.' : 'Sim. A composição completa e as quantidades aparecem em cada página, e a cesta pode ser ajustada no site.'}</p></details><details><summary>A empresa tem loja física?</summary><p>Não. O atendimento é exclusivamente por delivery.</p></details><details><summary>Qual é o pedido mínimo?</summary><p>R$ 75,00, com entrega grátis em Cuiabá e Várzea Grande dentro da área atendida.</p></details></section>
</main>
${footer()}
</body>
</html>
`;
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
  atomicWrite(MANIFEST_PATH, `${JSON.stringify({ version: 1, files: sorted }, null, 2)}\n`);
  return sorted;
}

function main() {
  const catalog = loadComboCatalog();
  const files = buildPages(catalog);
  console.log(`Páginas SEO geradas: ${files.length} arquivos para cestas e kits.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error('Erro ao gerar páginas SEO de cestas e kits:', error); process.exit(1); }
}

module.exports = {
  buildPages,
  collectionPage,
  organizationSchema,
  productPage,
  productSchema,
};
