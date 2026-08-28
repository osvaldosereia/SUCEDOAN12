const ROUTE_STORAGE_KEY = 'da_admin_v2_route_v12';
const CONFIG_STORAGE_KEY = 'da_admin_v2_config';
const ACTIVE_BUILD = document.querySelector('meta[name="admin-save-build"]')?.content
  || new URLSearchParams(window.location.search).get('admin_build')
  || '20260826-mug-studio-single-v19';

function withBuild(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}admin_build=${encodeURIComponent(ACTIVE_BUILD)}`;
}

const ROUTES = Object.freeze({
  dashboard: ['Visão geral', 'Indicadores, prioridades e estado do sistema.'],
  products: ['Produtos', 'Consulta, cadastro e edição do catálogo.'],
  'mug-studio': ['Criador de canecas', 'Envie uma imagem de inspiração, combine comandos salvos e gere somente a arte horizontal pronta para impressão.'],
  'mug-customers': ['Canecas de clientes', 'Criações feitas no site, WhatsApp do cliente e acompanhamento comercial.'],
  stock: ['Estoque e validade', 'Estoque baixo, vencimentos, lotes e localização.'],
  nfe: ['Entrada de NF-e', 'Leitura, conferência, cadastro completo e importação real do XML.'],
  orders: ['Pedidos', 'Lista paginada, separação, conferência e entrega.'],
  customers: ['Clientes', 'Cadastro gerado pelos pedidos, contatos, enderecos e historico.'],
  'order-tools': ['Contingência de pedidos', 'Make, Bling, reenvios e etiquetas sem pesar a lista principal.'],
  baskets: ['Cestas básicas', 'Composição, estoque, substituições e publicação.'],
  kits: ['Kits promocionais', 'Preço, desconto, composição, IA e Instagram.'],
  offers: ['Ofertas automáticas', 'Regras por validade, simulação e aplicação segura.'],
  'offers-rules': ['Ofertas por regra', 'Campanhas automáticas por categoria.'],
  coupons: ['Cupons', 'Criação, edição, validade e publicação no checkout.'],
  categories: ['Categorias', 'Categorias, subcategorias e padronização em lote.'],
  brands: ['Marcas', 'Marcas usadas pelos produtos e suas variações.'],
  suppliers: ['Fornecedores', 'Fornecedores cadastrados e padronização.'],
  tags: ['Tags', 'Marcadores universais sem duplicações.'],
  integrations: ['Integrações', 'Firebase, GitHub, Make, Bling e canais externos.'],
  maintenance: ['Diagnóstico e backup', 'Saúde do sistema, auditoria, exportações e contingência.'],
});

let currentRoute = 'dashboard';
let dispatching = false;
let mugStudioPromise = null;
let mugPhrasesAddonPromise = null;
let mugCustomerLeadsPromise = null;

function routeFromLocation() {
  try {
    const hash = location.hash.replace(/^#/, '');
    if (ROUTES[hash]) return hash;
    const saved = localStorage.getItem(ROUTE_STORAGE_KEY);
    if (ROUTES[saved]) return saved;
  } catch {}
  return 'dashboard';
}

function installMugStudioShell() {
  const nav = document.getElementById('mainNav');
  if (nav && !nav.querySelector('[data-route="mug-studio"]')) {
    const productsButton = nav.querySelector('[data-route="products"]');
    if (productsButton) {
      productsButton.insertAdjacentHTML('afterend', '<button class="nav-item" data-route="mug-studio" type="button"><span class="nav-icon">CN</span><span>Criador de canecas</span></button>');
    }
  }
  if (nav && !nav.querySelector('[data-route="mug-customers"]')) {
    const studioButton = nav.querySelector('[data-route="mug-studio"]') || nav.querySelector('[data-route="products"]');
    if (studioButton) studioButton.insertAdjacentHTML('afterend', '<button class="nav-item" data-route="mug-customers" type="button"><span class="nav-icon">CC</span><span>Canecas de clientes</span></button>');
  }

  const main = document.getElementById('mainContent');
  if (main && !main.querySelector('.view[data-view="mug-studio"]')) {
    const productsView = main.querySelector('.view[data-view="products"]');
    const html = '<section class="view route-view" data-view="mug-studio" aria-labelledby="pageTitle"><div class="route-placeholder" data-route-placeholder><div><span class="route-placeholder-icon">CN</span><strong>Preparando Criador de Canecas</strong><small>Imagem de inspiração → comandos → arte horizontal → cadastro inativo.</small></div></div></section>';
    if (productsView) productsView.insertAdjacentHTML('afterend', html);
    else main.insertAdjacentHTML('beforeend', html);
  }
  if (main && !main.querySelector('.view[data-view="mug-customers"]')) {
    const studioView = main.querySelector('.view[data-view="mug-studio"]');
    const html = '<section class="view route-view" data-view="mug-customers" aria-labelledby="pageTitle"><div class="route-placeholder" data-route-placeholder><div><span class="route-placeholder-icon">CC</span><strong>Preparando canecas de clientes</strong><small>Criações do site, contato do cliente e acompanhamento de conversão.</small></div></div></section>';
    if (studioView) studioView.insertAdjacentHTML('afterend', html);
    else main.insertAdjacentHTML('beforeend', html);
  }

  if (!document.getElementById('mugStudioRouteStyle')) {
    const style = document.createElement('style');
    style.id = 'mugStudioRouteStyle';
    style.textContent = '.view[data-view="products"] #mugAutomationPanel{display:none!important}.view[data-view="mug-studio"] #mugAutomationPanel{display:grid!important}';
    document.head.appendChild(style);
  }
}

function prepareMugStudioPanel() {
  const view = document.querySelector('.view[data-view="mug-studio"]');
  const panel = document.getElementById('mugAutomationPanel');
  if (!view || !panel) return false;
  if (panel.parentElement !== view) view.appendChild(panel);
  const placeholder = view.querySelector(':scope > [data-route-placeholder]');
  if (placeholder) placeholder.hidden = true;
  return true;
}

function scheduleMugPhrasesAddon() {
  if (mugPhrasesAddonPromise) return;
  const load = () => {
    if (mugPhrasesAddonPromise) return;
    mugPhrasesAddonPromise = import(withBuild('./mug-phrase-picker-v2.js')).catch(error => {
      mugPhrasesAddonPromise = null;
      console.warn('Biblioteca opcional de frases não foi carregada:', error);
    });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 1500 });
  else setTimeout(load, 250);
}

function loadMugStudio() {
  if (mugStudioPromise) return mugStudioPromise;
  mugStudioPromise = Promise.all([
    import(withBuild('./mug-product-media-enhancement-v19.js')),
    import(withBuild('./mug-make-native-openai-bridge.js')),
  ]).then(() => {
    prepareMugStudioPanel();
    window.dispatchEvent(new CustomEvent('admin-v2-route-ready', {
      detail: { route: 'mug-studio', source: 'mug-studio-loader-unified', build: ACTIVE_BUILD },
    }));
    scheduleMugPhrasesAddon();
  }).catch(error => {
    mugStudioPromise = null;
    console.error('Não foi possível abrir o Criador de Canecas:', error);
    throw error;
  });
  return mugStudioPromise;
}

function loadMugCustomerLeads() {
  if (mugCustomerLeadsPromise) return mugCustomerLeadsPromise;
  mugCustomerLeadsPromise = import(withBuild('./mug-customer-leads-v1.js')).then(module => {
    window.dispatchEvent(new CustomEvent('admin-v2-route-ready', {
      detail: { route: 'mug-customers', source: 'mug-customer-leads-loader', build: ACTIVE_BUILD },
    }));
    if (typeof module.load === 'function') return module.load();
    return module;
  }).catch(error => {
    mugCustomerLeadsPromise = null;
    console.error('Não foi possível abrir Canecas de clientes:', error);
    throw error;
  });
  return mugCustomerLeadsPromise;
}

function bindOrderWebhookSetting() {
  const input = document.getElementById('makeOrderWebhookSetting');
  if (!input || input.dataset.adminOrderSetting === '1') return;
  input.dataset.adminOrderSetting = '1';
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || '{}');
    input.value = String(config.makeOrderWebhookUrl || '');
  } catch {
    input.value = '';
  }
  input.addEventListener('change', () => {
    try {
      const config = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || '{}');
      config.makeOrderWebhookUrl = input.value.trim();
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {}
  });
}

function syncPlaceholder(view) {
  if (!view) return;
  const placeholder = view.querySelector(':scope > [data-route-placeholder]');
  if (!placeholder) return;
  const hasContent = [...view.children].some(child => child !== placeholder && !child.matches('[hidden]'));
  placeholder.hidden = hasContent;
}

function syncAllPlaceholders() {
  document.querySelectorAll('.route-view').forEach(syncPlaceholder);
}

function activate(route, { persist = true, emit = true } = {}) {
  if (!ROUTES[route]) route = 'dashboard';
  const view = document.querySelector(`.view[data-view="${CSS.escape(route)}"]`);
  if (!view) route = 'dashboard';
  currentRoute = route;

  document.querySelectorAll('.view').forEach(node => node.classList.toggle('active', node.dataset.view === route));
  document.querySelectorAll('#mainNav [data-route]').forEach(button => {
    const active = button.dataset.route === route;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  const [title, subtitle] = ROUTES[route];
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  if (pageTitle) pageTitle.textContent = title;
  if (pageSubtitle) pageSubtitle.textContent = subtitle;

  const publishButton = document.getElementById('publishButton');
  if (publishButton) publishButton.hidden = !['dashboard', 'products'].includes(route);
  const reloadButton = document.getElementById('reloadButton');
  if (reloadButton) reloadButton.hidden = !['dashboard', 'products', 'stock', 'nfe'].includes(route);
  const banner = document.querySelector('.environment-banner');
  if (banner) banner.hidden = route !== 'dashboard';

  document.getElementById('sidebar')?.classList.remove('open');
  const overlay = document.getElementById('mobileOverlay');
  if (overlay && !document.getElementById('productEditor')?.classList.contains('open')) overlay.hidden = true;
  document.getElementById('mainContent')?.focus({ preventScroll: true });

  if (persist) {
    try { localStorage.setItem(ROUTE_STORAGE_KEY, route); } catch {}
    try { history.replaceState(null, '', `#${route}`); } catch {}
  }

  syncAllPlaceholders();
  if (route === 'mug-studio') {
    loadMugStudio().catch(error => {
      const placeholder = document.querySelector('.view[data-view="mug-studio"] [data-route-placeholder] small');
      if (placeholder) placeholder.textContent = `Falha ao carregar: ${error?.message || error}`;
    });
  }
  if (route === 'mug-customers') {
    loadMugCustomerLeads().catch(error => {
      const placeholder = document.querySelector('.view[data-view="mug-customers"] [data-route-placeholder] small');
      if (placeholder) placeholder.textContent = `Falha ao carregar: ${error?.message || error}`;
    });
  }
  if (emit) {
    dispatching = true;
    window.dispatchEvent(new CustomEvent('admin-v2-route', { detail: { route, source: 'navigation-v12' } }));
    dispatching = false;
  }
}

function start() {
  installMugStudioShell();
  bindOrderWebhookSetting();
  const nav = document.getElementById('mainNav');
  nav?.addEventListener('click', event => {
    const button = event.target.closest('[data-route]');
    if (!button || !ROUTES[button.dataset.route]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activate(button.dataset.route);
  }, true);

  window.addEventListener('hashchange', () => activate(routeFromLocation(), { persist: false }));
  window.addEventListener('admin-v2-route', event => {
    const route = event.detail?.route;
    if (dispatching || event.detail?.source === 'navigation-v12' || !ROUTES[route]) return;
    activate(route, { persist: true, emit: false });
  });
  window.addEventListener('admin-v2-route-ready', () => {
    prepareMugStudioPanel();
    syncAllPlaceholders();
  });
  window.addEventListener('admin-v2-open-product', () => activate('products'));
  window.adminV2CurrentRoute = () => currentRoute;
  window.adminV2Navigate = route => activate(route);
  activate(routeFromLocation(), { persist: false });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

export { activate, routeFromLocation, ROUTES };