const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function file(relative) {
  return path.join(ROOT, relative);
}

function read(relative) {
  return fs.readFileSync(file(relative), 'utf8');
}

function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === content) return false;
  fs.writeFileSync(target, content, 'utf8');
  console.log(`Atualizado: ${relative}`);
  return true;
}

function replaceRequired(source, search, replacement, label) {
  const updated = source.replace(search, replacement);
  if (updated === source && !source.includes(replacement)) {
    throw new Error(`Não foi possível aplicar: ${label}`);
  }
  return updated;
}

function removeIfExists(relative) {
  const target = file(relative);
  if (!fs.existsSync(target)) return false;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removido código temporário: ${relative}`);
  return true;
}

const bundleRoutes = `import { norm, slug } from './core.js';

function decodeRouteReference(value) {
  try { return decodeURIComponent(String(value || '').trim()); }
  catch { return String(value || '').trim(); }
}

export function comboSeoPath(combo, type) {
  const kind = type === 'kit' ? 'kits' : 'cestas';
  const fallback = type === 'kit' ? 'kit-promocional' : 'cesta-basica';
  const name = slug(combo?.nome || fallback) || fallback;
  const reference = slug(combo?.codigo || combo?.id || name) || name;
  return \`/\${kind}/\${name}-\${reference}/\`;
}

export function comboRouteReference(combo, type) {
  return comboSeoPath(combo, type).split('/').filter(Boolean).pop() || '';
}

function matchesCombo(combo, reference, type) {
  const decoded = decodeRouteReference(reference);
  const normalized = norm(decoded);
  const pathReference = comboRouteReference(combo, type);
  return [
    combo?.id,
    combo?.codigo,
    combo?.nome,
    pathReference,
    comboSeoPath(combo, type),
  ].some(value => {
    const text = String(value || '').trim();
    return text === decoded || norm(text) === normalized || slug(text) === slug(decoded);
  });
}

export function findBasketByReference(state, reference) {
  return (state?.baskets || []).find(item => matchesCombo(item, reference, 'basket')) || null;
}

export function findKitByReference(state, reference) {
  return (state?.kits || []).find(item => matchesCombo(item, reference, 'kit')) || null;
}

export function cleanComboRouteFromLocation(locationLike = globalThis.location) {
  if (!locationLike) return null;
  const pathname = String(locationLike.pathname || '/').replace(/\\/{2,}/g, '/');
  const match = pathname.match(/^\\/(cestas|kits)(?:\\/([^/]+))?\\/?$/i);
  if (match) {
    const collection = match[1].toLowerCase();
    const reference = decodeRouteReference(match[2] || '');
    return {
      name: reference ? (collection === 'kits' ? 'kit' : 'basket') : (collection === 'kits' ? 'kits' : 'baskets'),
      reference,
    };
  }
  const params = new URLSearchParams(String(locationLike.search || ''));
  if (params.get('cesta')) return { name: 'basket', reference: params.get('cesta') };
  if (params.get('kit')) return { name: 'kit', reference: params.get('kit') };
  return null;
}
`;
write('app-next/src/bundle-routes.js', bundleRoutes);

{
  let source = read('app-next/src/core.js');
  const router = `export function createRouter(onRoute) {
  const aliases = { categorias: 'categories', categoria: 'category', subcategoria: 'subcategory', marca: 'brand', ofertas: 'offers', favoritos: 'favorites', produto: 'product', cestas: 'baskets', cesta: 'basket', kits: 'kits', kit: 'kit', busca: 'search', rotina: 'routine', informacoes: 'info', 'campanha-cupom': 'campaignCoupon' };

  const parseHash = hashValue => {
    const hash = String(hashValue || '#/');
    const [pathPart, queryPart = ''] = hash.replace(/^#\\/?/, '').split('?');
    const parts = pathPart.split('/').filter(Boolean).map(part => {
      try { return decodeURIComponent(part); } catch { return part; }
    });
    const first = parts[0] || 'home';
    return { name: aliases[first] || first || 'home', hash: \`#/\${pathPart}\`, params: { segments: parts.slice(1) }, query: new URLSearchParams(queryPart) };
  };

  const parseCleanLocation = () => {
    if (!hasDOM) return null;
    const pathname = String(window.location.pathname || '/').replace(/\\/{2,}/g, '/');
    const pathMatch = pathname.match(/^\\/(cestas|kits)(?:\\/([^/]+))?\\/?$/i);
    if (pathMatch) {
      const collection = pathMatch[1].toLowerCase();
      let reference = pathMatch[2] || '';
      try { reference = decodeURIComponent(reference); } catch {}
      return {
        name: reference ? (collection === 'kits' ? 'kit' : 'basket') : (collection === 'kits' ? 'kits' : 'baskets'),
        hash: '',
        params: { segments: reference ? [reference] : [] },
        query: new URLSearchParams(window.location.search),
      };
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('cesta')) return { name: 'basket', hash: '', params: { segments: [params.get('cesta')] }, query: params };
    if (params.get('kit')) return { name: 'kit', hash: '', params: { segments: [params.get('kit')] }, query: params };
    return null;
  };

  const parse = () => {
    if (!hasDOM) return parseHash('#/');
    const hash = window.location.hash || '';
    if (hash && hash !== '#' && hash !== '#/') return parseHash(hash);
    return parseCleanLocation() || parseHash(hash || '#/');
  };

  const normalizeHashFromCleanPath = route => {
    if (!hasDOM || !window.location.hash || !/^\\/(?:cestas|kits)(?:\\/|$)/i.test(window.location.pathname)) return;
    const target = \`/\${window.location.search || ''}\${route.hash || window.location.hash}\`;
    window.history.replaceState({}, '', target);
  };

  const run = () => {
    const route = parse();
    normalizeHashFromCleanPath(route);
    onRoute(route);
  };

  return {
    current: parse,
    start() {
      if (!hasDOM) return;
      window.addEventListener('hashchange', run);
      window.addEventListener('popstate', run);
      run();
    },
    navigate(target, { replace = false } = {}) {
      if (!hasDOM) return;
      const destination = String(target || '#/');
      if (destination.startsWith('#')) {
        if (/^\\/(?:cestas|kits)(?:\\/|$)/i.test(window.location.pathname)) {
          window.history[replace ? 'replaceState' : 'pushState']({}, '', \`/\${destination}\`);
          run();
        } else if (replace) {
          window.history.replaceState({}, '', \`\${window.location.pathname}\${window.location.search}\${destination}\`);
          run();
        } else {
          window.location.hash = destination;
        }
        return;
      }
      const url = new URL(destination, window.location.origin);
      if (url.origin !== window.location.origin) {
        window.location.assign(url.href);
        return;
      }
      window.history[replace ? 'replaceState' : 'pushState']({}, '', \`\${url.pathname}\${url.search}\${url.hash}\`);
      run();
    }
  };
}
`;
  source = replaceRequired(source, /export function createRouter\(onRoute\) \{[\s\S]*$/, router, 'router com History API e rotas limpas');
  write('app-next/src/core.js', source);
}

{
  let source = read('app-next/src/catalog.js');
  source = replaceRequired(source, /id: String\(item\.id\),\n\s+nome:/, "id: String(item.id),\n    codigo: String(item.codigo || item.id),\n    nome:", 'código oficial nas cestas normalizadas');
  write('app-next/src/catalog.js', source);
}

{
  let source = read('app-next/src/ui.js');
  if (!source.includes("from './bundle-routes.js'")) {
    source = replaceRequired(source, "import { findProductByReference, searchProducts } from './catalog.js';", "import { findProductByReference, searchProducts } from './catalog.js';\nimport { comboSeoPath, findBasketByReference, findKitByReference } from './bundle-routes.js';", 'importação das rotas de combos');
  }

  source = source.replace(/function basketCard\(basket\) \{[\s\S]*?\n\}/, `function basketCard(basket) {
  const href = comboSeoPath(basket, 'basket');
  return \`<article class="bundle-card"><a class="bundle-media" href="\${href}"><img loading="lazy" src="\${escapeHtml(basket.imagem)}" alt="\${escapeHtml(basket.nome)}"></a><div><a class="bundle-name" href="\${href}">\${escapeHtml(basket.nome)}</a><p>\${escapeHtml(truncate(basket.descricao, 90))}</p><div class="bundle-price">\${basket.precoOriginal > basket.preco ? \`<s>\${fmt(basket.precoOriginal)}</s>\` : ''}<strong>\${basket.preco ? fmt(basket.preco) : 'Ver itens'}</strong></div><a class="secondary-button" href="\${href}">Ver produtos</a></div></article>\`;
}`);

  source = source.replace(/function kitCard\(state, kit\) \{[\s\S]*?\n\}/, `function kitCard(state, kit) {
  const original = kitOriginalPrice(state, kit);
  const discount = kitDiscountPercent(state, kit);
  const href = comboSeoPath(kit, 'kit');
  return \`<article class="bundle-card"><div class="bundle-media-wrap"><a class="bundle-media" href="\${href}"><img loading="lazy" src="\${escapeHtml(kit.imagem)}" alt="\${escapeHtml(kit.nome)}"></a>\${favoriteButton(state, kit.id, 'kit')}\${discount ? \`<span class="discount-badge">-\${discount}%</span>\` : ''}</div><div><a class="bundle-name" href="\${href}">\${escapeHtml(kit.nome)}</a><p>\${escapeHtml(truncate(kit.descricao, 90))}</p><div class="bundle-price">\${original > kit.preco ? \`<s>\${fmt(original)}</s>\` : ''}<strong>\${fmt(kit.preco)}</strong></div><div class="bundle-actions"><a class="secondary-button" href="\${href}">Ver produtos</a><button class="primary-button" data-action="add-kit" data-id="\${escapeHtml(kit.id)}">Adicionar</button></div></div></article>\`;
}`);

  source = source.replace(/function companySummaryHtml\(\) \{[\s\S]*?\n\}/, `function companySummaryHtml() {
  return \`<section class="home-company-info" aria-labelledby="home-company-title"><div class="home-company-copy"><small>Delivery local</small><h2 id="home-company-title">Dona Antônia em Cuiabá e Várzea Grande</h2><p>Cestas básicas, kits promocionais e produtos de supermercado com atendimento humano, conferência do pedido e delivery. Pedido mínimo de R$ 75.</p></div><dl class="home-company-facts"><div><dt>Atendimento</dt><dd>Segunda a sábado, das 08h às 18h</dd></div><div><dt>WhatsApp</dt><dd>(65) 99815-0975</dd></div><div><dt>Modalidade</dt><dd>Somente delivery, sem loja física</dd></div></dl><nav class="home-company-links" aria-label="Empresa e políticas"><a href="../sobre-nos.html">Conheça a empresa</a><a href="../politica-de-entrega.html">Política de entrega</a><a href="../politica-de-troca.html">Trocas e devoluções</a><a href="../contato.html">Fale conosco</a></nav></section>\`;
}`);

  source = source.replace(/function publicFooterHtml\(\) \{[\s\S]*?\n\}/, `function publicFooterHtml() {
  return \`<footer class="public-site-footer"><div class="public-site-footer-brand"><strong>Super Cestas Básicas Dona Antônia</strong><span>CNPJ 51.385.335/0001-06</span></div><div class="public-site-footer-contact"><span>Somente delivery em Cuiabá e Várzea Grande - MT</span><a href="https://wa.me/5565998150975" target="_blank" rel="noopener">WhatsApp (65) 99815-0975</a></div><nav aria-label="Links institucionais"><a href="../sobre-nos.html">Sobre nós</a><a href="../contato.html">Contato</a><a href="../politica-de-entrega.html">Entrega</a><a href="../politica-de-troca.html">Trocas e devoluções</a><a href="../politica-de-privacidade.html">Privacidade</a><a href="../termos-de-uso.html">Termos</a></nav></footer>\`;
}`);

  source = source.replace('<h1 class="sr-only">Dona Antônia - Supermercado e Cestas</h1>', '<h1 class="sr-only">Cestas básicas e kits promocionais com delivery em Cuiabá e Várzea Grande</h1>');
  source = source.replace("'', '#/cestas')", "'', '/cestas/')");
  source = source.replace("'', '#/kits')", "'', '/kits/')");

  source = source.replace(/function basketsPage\(context\) \{[\s\S]*?\n\}/, `function basketsPage(context) {
  return \`<div class="page-container">\${pageHeader('Cestas básicas', 'Escolha uma cesta pronta e editável.')}\${bannerZone(context.state, 'cestas.topo')}\${context.state.baskets.length ? \`<div class="bundle-grid">\${context.state.baskets.map(basketCard).join('')}</div>\` : empty('Nenhuma cesta disponível', 'O arquivo de cestas ainda não possui itens.')}</div>\`;
}`);

  source = source.replace(/function basketPage\(context, id\) \{[\s\S]*?\n\}/, `function basketPage(context, id) {
  const basket = findBasketByReference(context.state, id);
  if (!basket) return \`<div class="page-container">\${pageHeader('Cesta não encontrada', '', '/cestas/')}\${empty('Cesta indisponível', 'Escolha outra cesta.')}</div>\`;
  const rows = resolveBundleRows(context.state, basket);
  const draft = context.state.basketDrafts[\`basket:\${basket.id}\`] || Object.fromEntries(rows.map(row => [row.product.id, row.qty]));
  const total = Object.entries(draft).reduce((sum, [productId, qty]) => sum + Number(context.state.productMap.get(productId)?.price || 0) * Number(qty), 0);
  return \`<div class="page-container">\${pageHeader(basket.nome, '', '/cestas/')}\${bannerZone(context.state, 'cesta', [basket.id, basket.codigo, basket.nome])}<article class="bundle-detail-hero"><img src="\${escapeHtml(basket.imagem)}" alt="\${escapeHtml(basket.nome)}"><div><span>Cesta básica</span><h1>\${escapeHtml(basket.nome)}</h1><p>\${escapeHtml(basket.descricao)}</p><strong>\${basket.preco ? fmt(basket.preco) : fmt(total)}</strong><button class="primary-button" data-action="add-basket" data-id="\${escapeHtml(basket.id)}">Adicionar cesta padrão</button></div></article><section class="content-section"><div class="section-heading"><div><h2>Produtos da cesta</h2><p>Ajuste as quantidades antes de adicionar.</p></div></div><div class="bundle-lines">\${rows.map(row => {
    const qty = Number(draft[row.product.id] ?? row.qty);
    return \`<div class="bundle-line" data-bundle-product="\${escapeHtml(row.product.id)}"><a href="#/produto/\${productRoute(row.product)}"><img src="\${escapeHtml(row.product.img)}" alt="\${escapeHtml(row.product.name)}"></a><div><a href="#/produto/\${productRoute(row.product)}">\${escapeHtml(row.product.name)}</a><small>\${fmt(row.product.price)} cada</small></div><div class="qty-control"><button data-action="basket-dec" data-basket-id="\${escapeHtml(basket.id)}" data-id="\${escapeHtml(row.product.id)}">−</button><span>\${qty}</span><button data-action="basket-inc" data-basket-id="\${escapeHtml(basket.id)}" data-id="\${escapeHtml(row.product.id)}">+</button></div></div>\`;
  }).join('')}</div></section><section class="bundle-total"><span>Total estimado da seleção</span><strong>\${fmt(total)}</strong><button class="primary-button" data-action="add-basket-custom" data-id="\${escapeHtml(basket.id)}">Adicionar cesta editada</button></section></div>\`;
}`);

  source = source.replace(/function kitsPage\(context\) \{[\s\S]*?\n\}/, `function kitsPage(context) {
  const kits = context.state.kits.filter(kit => kitIsVisible(context.state, kit));
  return \`<div class="page-container">\${pageHeader('Kits promocionais', 'Combos com desconto e estoque limitado.')}\${bannerZone(context.state, 'kits.topo')}\${kits.length ? \`<div class="bundle-grid">\${kits.map(kit => kitCard(context.state, kit)).join('')}</div>\` : empty('Nenhum kit ativo', 'Volte mais tarde para conferir novas ofertas.')}</div>\`;
}`);

  source = source.replace(/function kitPage\(context, id\) \{[\s\S]*?\n\}/, `function kitPage(context, id) {
  const kit = findKitByReference(context.state, id);
  if (!kit || !kitIsVisible(context.state, kit)) return \`<div class="page-container">\${pageHeader('Kit indisponível', '', '/kits/')}\${empty('Kit não encontrado', 'Escolha outro kit promocional.')}</div>\`;
  const rows = resolveBundleRows(context.state, kit);
  const original = kitOriginalPrice(context.state, kit);
  return \`<div class="page-container">\${pageHeader(kit.nome, '', '/kits/')}\${bannerZone(context.state, 'kit', [kit.id, kit.codigo, kit.nome])}<article class="bundle-detail-hero"><img src="\${escapeHtml(kit.imagem)}" alt="\${escapeHtml(kit.nome)}"><div><span>Kit promocional</span><h1>\${escapeHtml(kit.nome)}</h1><p>\${escapeHtml(kit.descricao)}</p><div class="bundle-price">\${original > kit.preco ? \`<s>\${fmt(original)}</s>\` : ''}<strong>\${fmt(kit.preco)}</strong></div><button class="primary-button" data-action="add-kit" data-id="\${escapeHtml(kit.id)}">Adicionar kit promocional</button></div></article>\${section('Produtos do kit', '', \`<div class="bundle-lines">\${rows.map(row => \`<a class="bundle-line bundle-line-link" href="#/produto/\${productRoute(row.product)}"><img src="\${escapeHtml(row.product.img)}" alt="\${escapeHtml(row.product.name)}"><div><strong>\${escapeHtml(row.product.name)}</strong><small>\${row.qty} \${row.qty === 1 ? 'unidade' : 'unidades'} no kit</small></div><span>\${fmt(row.product.price)}</span></a>\`).join('')}</div>\`)}</div>\`;
}`);

  source = source.replace(/function infoPage\(\) \{[\s\S]*?\n\}/, `function infoPage() {
  return \`<div class="page-container">\${pageHeader('Informações da loja')}<article class="info-card"><h2>Super Cestas Básicas Dona Antônia</h2><p>Delivery de cestas básicas, kits promocionais e produtos de supermercado em Cuiabá e Várzea Grande.</p><dl><div><dt>Modalidade</dt><dd>Somente delivery, sem loja física ou retirada no local</dd></div><div><dt>Área atendida</dt><dd>Cuiabá e Várzea Grande - MT</dd></div><div><dt>WhatsApp</dt><dd>(65) 99815-0975</dd></div><div><dt>Atendimento</dt><dd>Segunda a sábado, das 08h às 18h</dd></div><div><dt>Pedido mínimo</dt><dd>\${fmt(CONFIG.MIN_ORDER)}</dd></div></dl><div class="policy-links"><a href="../sobre-nos.html">Sobre nós</a><a href="../contato.html">Contato</a><a href="../politica-de-entrega.html">Política de entrega</a><a href="../politica-de-troca.html">Trocas e devoluções</a><a href="../politica-de-privacidade.html">Privacidade</a><a href="../termos-de-uso.html">Termos de uso</a></div></article></div>\`;
}`);

  const canonicalBlock = `function canonicalUrl(route, context) {
  const base = CONFIG.SITE_BASE_URL.replace(/\\/$/, '');
  const segment = route.params.segments[0] || '';
  const value = decodeURIComponent(segment);
  if (route.name === 'home') return \`\${base}/\`;
  if (route.name === 'basket') {
    const basket = findBasketByReference(context.state, segment);
    return basket ? \`\${base}\${comboSeoPath(basket, 'basket')}\` : \`\${base}/cestas/\`;
  }
  if (route.name === 'kit') {
    const kit = findKitByReference(context.state, segment);
    return kit ? \`\${base}\${comboSeoPath(kit, 'kit')}\` : \`\${base}/kits/\`;
  }
  if (route.name === 'baskets') return \`\${base}/cestas/\`;
  if (route.name === 'kits') return \`\${base}/kits/\`;
  if (route.name === 'product') {
    const product = findProductByReference(context.state, segment);
    return \`\${base}/?p=\${encodeURIComponent(product?.firebaseKey || product?.id || product?.codigo || value)}\`;
  }
  if (route.name === 'category') return \`\${base}/?categoria=\${encodeURIComponent(value)}\`;
  if (route.name === 'subcategory') return \`\${base}/?subcategoria=\${encodeURIComponent(value)}\`;
  if (route.name === 'brand') return \`\${base}/?marca=\${encodeURIComponent(value)}\`;
  if (route.name === 'search') return \`\${base}/?busca=\${encodeURIComponent(route.params.segments.join(' '))}\`;
  const sections = { offers: 'ofertas', categories: 'categorias', info: 'informacoes' };
  return sections[route.name] ? \`\${base}/?secao=\${sections[route.name]}\` : \`\${base}/\`;
}

function syncCleanComboUrl(route, context) {
  if (!['basket', 'baskets', 'kit', 'kits'].includes(route.name) || typeof history === 'undefined') return;
  const target = new URL(canonicalUrl(route, context));
  const current = \`\${location.pathname}\${location.search}\${location.hash}\`;
  const next = \`\${target.pathname}\${target.search}\${target.hash}\`;
  if (current !== next) history.replaceState({}, '', next);
}
`;
  source = source.replace(/function canonicalUrl\(route, context\) \{[\s\S]*?\n\}\n\nexport function createUI/, `${canonicalBlock}\nexport function createUI`);

  source = source.replace(/function updateMeta\(route, ctx\) \{[\s\S]*?\n\}\n\n  function bindImageFallbacks/, `function updateMeta(route, ctx) {
    const segment = route.params.segments[0] || '';
    const basket = route.name === 'basket' ? findBasketByReference(ctx.state, segment) : null;
    const kit = route.name === 'kit' ? findKitByReference(ctx.state, segment) : null;
    const names = { home: 'Supermercado e Cestas', categories: 'Categorias', offers: 'Ofertas', favorites: 'Favoritos', baskets: 'Cestas básicas', kits: 'Kits promocionais', info: 'Informações da loja' };
    document.title = \`\${basket?.nome || kit?.nome || names[route.name] || decodeURIComponent(segment) || 'Dona Antônia'} - Dona Antônia\`;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl(route, ctx);
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      if (basket) meta.content = \`Confira a composição de \${basket.nome} e peça com delivery em Cuiabá e Várzea Grande.\`;
      else if (kit) meta.content = \`Confira os produtos de \${kit.nome} e peça com delivery em Cuiabá e Várzea Grande.\`;
      else if (route.name === 'product') meta.content = \`Compre \${findProductByReference(ctx.state, segment)?.name || 'produtos'} com entrega em Cuiabá e Várzea Grande.\`;
      else meta.content = 'Cestas básicas, kits promocionais e supermercado online com delivery em Cuiabá e Várzea Grande.';
    }
  }

  function bindImageFallbacks`);

  source = source.replace('    updateMeta(route, ctx);\n    events.emit', '    updateMeta(route, ctx);\n    syncCleanComboUrl(route, ctx);\n    events.emit');
  source = source.replaceAll('<a href="#/cestas">Cestas básicas</a>', '<a href="/cestas/">Cestas básicas</a>');
  source = source.replaceAll('<a href="#/kits">Kits promocionais</a>', '<a href="/kits/">Kits promocionais</a>');
  write('app-next/src/ui.js', source);
}

{
  let source = read('app-next/src/main.js');
  source = source.replace("import { createUI } from './ui.js?v=20260724-7';", "import { createUI } from './ui.js?v=20260726-8';");
  if (!source.includes('function internalCleanNavigation')) {
    source = source.replace('function bindEvents() {', `function internalCleanNavigation(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return '';
  const link = event.target.closest('a[href]');
  if (!link || link.target || link.hasAttribute('download')) return '';
  let url;
  try { url = new URL(link.getAttribute('href'), location.href); } catch { return ''; }
  if (url.origin !== location.origin || !/^\\/(?:cestas|kits)(?:\\/|$)/i.test(url.pathname)) return '';
  return \`\${url.pathname}\${url.search}\`;
}

function bindEvents() {`);
  }
  source = source.replace(`      await handleAction(actionButton);
      return;
    }
    if (event.target === document.getElementById('drawer-overlay'))`, `      await handleAction(actionButton);
      return;
    }
    const cleanTarget = internalCleanNavigation(event);
    if (cleanTarget) {
      event.preventDefault();
      ui.closeDrawers();
      router.navigate(cleanTarget);
      return;
    }
    if (event.target === document.getElementById('drawer-overlay'))`);
  write('app-next/src/main.js', source);
}

{
  let source = read('app-next/src/live-polish.js');
  if (!source.includes("from './bundle-routes.js'")) {
    source = source.replace("import { escapeHtml, fmt, readStorage } from './core.js';", "import { escapeHtml, fmt, readStorage } from './core.js';\nimport { comboSeoPath } from './bundle-routes.js';");
  }
  source = source.replace("const POLISH_VERSION = '2026-07-24-live-polish-v3';", "const POLISH_VERSION = '2026-07-26-live-polish-v4';");
  source = source.replace(/function basketCardHtml\(basket\) \{[\s\S]*?\n\}/, `function basketCardHtml(basket) {
  const href = comboSeoPath(basket, 'basket');
  return \`<article class="bundle-card"><a class="bundle-media" href="\${href}">\${optimizedImage(basket.imagem, basket.nome)}</a><div><a class="bundle-name" href="\${href}">\${escapeHtml(basket.nome)}</a><p>\${escapeHtml(truncate(basket.descricao))}</p><div class="bundle-price">\${Number(basket.precoOriginal || 0) > Number(basket.preco || 0) ? \`<s>\${fmt(basket.precoOriginal)}</s>\` : ''}<strong>\${basket.preco ? fmt(basket.preco) : 'Ver itens'}</strong></div><a class="secondary-button" href="\${href}">Ver produtos</a></div></article>\`;
}`);
  source = source.replace(/function kitCardHtml\(state, kit, favorites\) \{[\s\S]*?\n\}/, `function kitCardHtml(state, kit, favorites) {
  const original = kitOriginalPrice(state, kit);
  const discount = kitDiscountPercent(state, kit);
  const favoriteKey = \`kit:\${kit.id}\`;
  const active = favorites.has(favoriteKey);
  const href = comboSeoPath(kit, 'kit');
  return \`<article class="bundle-card"><div class="bundle-media-wrap"><a class="bundle-media" href="\${href}">\${optimizedImage(kit.imagem, kit.nome)}</a><button class="favorite-button \${active ? 'active' : ''}" data-action="favorite" data-id="\${escapeHtml(kit.id)}" data-kind="kit" aria-label="\${active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" aria-pressed="\${active}">♡</button>\${discount ? \`<span class="discount-badge">-\${discount}%</span>\` : ''}</div><div><a class="bundle-name" href="\${href}">\${escapeHtml(kit.nome)}</a><p>\${escapeHtml(truncate(kit.descricao))}</p><div class="bundle-price">\${original > Number(kit.preco || 0) ? \`<s>\${fmt(original)}</s>\` : ''}<strong>\${fmt(kit.preco)}</strong></div><div class="bundle-actions"><a class="secondary-button" href="\${href}">Ver produtos</a><button class="primary-button" data-action="add-kit" data-id="\${escapeHtml(kit.id)}">Adicionar</button></div></div></article>\`;
}`);
  write('app-next/src/live-polish.js', source);
}

{
  let source = read('app-next/src/seo-combos.js');
  if (!source.includes("from './bundle-routes.js'")) {
    source = source.replace("import { kitIsVisible, kitOriginalPrice, kitStockCapacity, resolveBundleRows } from './commerce.js';", "import { kitIsVisible, kitOriginalPrice, kitStockCapacity, resolveBundleRows } from './commerce.js';\nimport { comboSeoPath, findBasketByReference, findKitByReference } from './bundle-routes.js';");
  }
  source = source.replace(/function slug\(value\) \{[\s\S]*?\n\}\n\n/, '');
  source = source.replace(/function comboSeoPath\(bundle, type\) \{[\s\S]*?\n\}\n\n/, '');
  source = source.replace(/function routeTarget\(\) \{[\s\S]*?\n\}/, `function routeTarget() {
  const params = new URLSearchParams(location.search);
  const pathMatch = String(location.pathname || '/').match(/^\\/(cestas|kits)(?:\\/([^/]+))?\\/?$/i);
  if (pathMatch) {
    const collection = pathMatch[1].toLowerCase();
    const reference = pathMatch[2] ? decodeURIComponent(pathMatch[2]) : '';
    if (reference) return { type: collection === 'kits' ? 'kit' : 'basket', id: reference };
    return { type: 'section', id: collection };
  }
  const hash = String(location.hash || '').replace(/^#\\/?/, '').split('?')[0];
  const parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
  if (params.get('cesta')) return { type: 'basket', id: params.get('cesta') };
  if (params.get('kit')) return { type: 'kit', id: params.get('kit') };
  if (parts[0] === 'cesta' && parts[1]) return { type: 'basket', id: parts[1] };
  if (parts[0] === 'kit' && parts[1]) return { type: 'kit', id: parts[1] };
  const section = params.get('secao') || parts[0] || '';
  return { type: 'section', id: section };
}`);
  source = source.replace(/const list = target\.type === 'kit' \? data\.kits : data\.baskets;\n\s+const bundle = \(list \|\| \[\]\)\.find\(item =>[\s\S]*?\n\s+\);/, "const bundle = target.type === 'kit'\n      ? findKitByReference(data, target.id)\n      : findBasketByReference(data, target.id);");
  write('app-next/src/seo-combos.js', source);
}

{
  let source = read('index.html');
  source = source.replace(/\s*if \(params\.get\('cesta'\)\) route = '#\/cesta\/' \+ encodeURIComponent\(params\.get\('cesta'\)\);\n\s*else if \(params\.get\('kit'\)\) route = '#\/kit\/' \+ encodeURIComponent\(params\.get\('kit'\)\);\n\s*else if \(params\.get\('p'\)\)/, "\n      if (params.get('p'))");
  source = source.replace(/\n\s*<script type="module" src="app-next\/src\/delivery-only\.js[^\n]*<\/script>/g, '');
  source = source.replaceAll('app-next/src/main.js?v=20260724-8', 'app-next/src/main.js?v=20260726-9');
  source = source.replaceAll("./app-next/src/live-polish.js?v=20260724-7", "./app-next/src/live-polish.js?v=20260726-8");
  write('index.html', source);
}

{
  let source = read('app-next/index.html');
  source = source.replaceAll('src/main.js?v=20260724-8', 'src/main.js?v=20260726-9');
  source = source.replaceAll("./src/live-polish.js?v=20260724-7", "./src/live-polish.js?v=20260726-8");
  source = source.replace('https://www.donaantonia.com.br/', 'https://donaantonia.com.br/');
  source = source.replace('"@type":"GroceryStore"', '"@type":"OnlineStore"');
  source = source.replace("const routeNeedsDetails = () => /^#\\/(cesta|kit)(\\/|$)/.test(location.hash || '');", "const routeNeedsDetails = () => /^#\\/(cesta|kit)(\\/|$)/.test(location.hash || '') || /^\\/(cestas|kits)\\/[^/]+\\/?$/.test(location.pathname || '');");
  source = source.replace("window.addEventListener('hashchange', () => { if (routeNeedsDetails()) loadDetails(); });", "window.addEventListener('hashchange', () => { if (routeNeedsDetails()) loadDetails(); });\n    window.addEventListener('popstate', () => { if (routeNeedsDetails()) loadDetails(); });");
  write('app-next/index.html', source);
}

{
  let source = read('scripts/injetar-seo-combos.js');
  source = source.replace(/\n\s*if \(!output\.includes\("params\.get\('cesta'\)"\)\) \{[\s\S]*?\n\s*\}\n/, '\n');
  source = source.replace(/\n\s*output = ensureModule\(output, 'app-next\/src\/delivery-only\.js[^\n]+\);/, '');
  source = source.replace("output = output.replace(\n    'app-next/src/seo-combos.js?v=20260726-1',\n    'app-next/src/seo-combos.js?v=20260726-2',\n  );", "output = output.replace(\n    'app-next/src/seo-combos.js?v=20260726-1',\n    'app-next/src/seo-combos.js?v=20260726-2',\n  );\n  output = output.replace(/\\n\\s*<script type=\\\"module\\\" src=\\\"app-next\\/src\\/delivery-only\\.js[^\\n]*<\\/script>/g, '');");
  write('scripts/injetar-seo-combos.js', source);
}

function patchSmoke(relative, isRootCheck = false) {
  let source = read(relative);
  source = source.replaceAll("'src/seo-combos.js', 'src/delivery-only.js'", "'src/seo-combos.js', 'src/bundle-routes.js'");
  source = source.replaceAll("'app-next/src/seo-combos.js', 'app-next/src/delivery-only.js', 'app-next/src/config.js'", "'app-next/src/seo-combos.js', 'app-next/src/bundle-routes.js', 'app-next/src/config.js'");
  source = source.replaceAll("'app-next/src/seo-combos.js', 'app-next/src/delivery-only.js'", "'app-next/src/seo-combos.js', 'app-next/src/bundle-routes.js'");
  source = source.replaceAll('src/main.js?v=20260724-8', 'src/main.js?v=20260726-9');
  source = source.replaceAll('app-next/src/main.js?v=20260724-8', 'app-next/src/main.js?v=20260726-9');
  source = source.replace(/\s*'app-next\/src\/delivery-only\.js\?v=20260726-1',?\n?/g, '\n');
  source = source.replace(/\s*'src\/delivery-only\.js\?v=20260726-1',?\n?/g, '\n');
  source = source.replace(/\nconst deliveryOnly = read\('[^']*delivery-only\.js'\);[\s\S]*?\n\}/, '');
  source = source.replace(/\nconst deliveryOnly = read\('[^']*delivery-only\.js'\);[\s\S]*?\n\}\n/, '\n');
  source = source.replace(/\nfor \(const marker of \['Somente delivery, sem loja física'[\s\S]*?\n\}/, '');
  source = source.replace("'app-next/src/delivery-only.js',", "'app-next/src/bundle-routes.js',");
  source = source.replace("'app-next/src/delivery-only.js'", "'app-next/src/bundle-routes.js'");
  source = source.replace("'scripts/normalizar-seo-delivery.js', 'producao-v2/js/services/collections.js'", "'scripts/normalizar-seo-delivery.js', 'producao-v2/js/services/collections.js'");
  if (!source.includes("const bundleRoutes = read('src/bundle-routes.js')") && !isRootCheck) {
    source = source.replace("const seoCombos = read('src/seo-combos.js');", `const bundleRoutes = read('src/bundle-routes.js');
for (const marker of ['comboSeoPath', 'findBasketByReference', 'findKitByReference', 'cleanComboRouteFromLocation']) {
  if (!bundleRoutes.includes(marker)) throw new Error(\`Rotas limpas incompletas: \${marker}\`);
}

const seoCombos = read('src/seo-combos.js');`);
    source = source.replace("if (seoCombos.includes('/?cesta=') || seoCombos.includes('/?kit='))", "if (seoCombos.includes('/?cesta=') || seoCombos.includes('/?kit='))");
    source = source.replace("const checkout = read('src/checkout.js');", `if (ui.includes('#/cesta/') || ui.includes('#/kit/')) throw new Error('UI ainda gera links antigos de cesta ou kit');
if (livePolish.includes('#/cesta/') || livePolish.includes('#/kit/')) throw new Error('Carrossel ainda gera links antigos de cesta ou kit');

const checkout = read('src/checkout.js');`);
  }
  write(relative, source);
}
patchSmoke('app-next/tests/smoke.test.js', false);
patchSmoke('scripts/check-public-site.mjs', true);

removeIfExists('app-next/src/delivery-only.js');
removeIfExists('scripts/garantir-sinal-delivery.js');
removeIfExists('scripts/aplicar-seo-delivery-v2.js');
removeIfExists('scripts/seo-delivery-payload');
removeIfExists('.seo-delivery-v2-aplicado');

console.log('Refatoração concluída: rotas limpas ativas e remendos temporários removidos.');
