const ROUTE_STORAGE_KEY = 'da_admin_v2_route_v12';

const ROUTES = Object.freeze({
  dashboard: ['Visão geral', 'Indicadores, prioridades e estado do sistema.'],
  products: ['Produtos', 'Consulta, cadastro e edição do catálogo.'],
  stock: ['Estoque e validade', 'Estoque baixo, vencimentos, lotes e localização.'],
  'quick-read': ['Leitura rápida', 'Consulta por leitor, EAN, código ou nome.'],
  nfe: ['Entrada de NF-e', 'Leitura, simulação e importação protegida de XML.'],
  orders: ['Pedidos', 'Lista paginada, separação, conferência e entrega.'],
  'order-tools': ['Contingência de pedidos', 'Make, Bling, reenvios e etiquetas sem pesar a lista principal.'],
  baskets: ['Cestas básicas', 'Composição, estoque, substituições e publicação.'],
  kits: ['Kits promocionais', 'Preço, desconto, composição, IA e Instagram.'],
  offers: ['Ofertas automáticas', 'Regras por validade, simulação e aplicação segura.'],
  coupons: ['Cupons', 'Criação, edição, validade e publicação no checkout.'],
  'quick-purchase': ['Compra Rápida', 'Seções, itens e opções do fluxo rápido.'],
  categories: ['Categorias', 'Categorias, subcategorias e padronização em lote.'],
  brands: ['Marcas', 'Marcas usadas pelos produtos e suas variações.'],
  suppliers: ['Fornecedores', 'Fornecedores cadastrados e padronização.'],
  tags: ['Tags', 'Marcadores universais sem duplicações.'],
  integrations: ['Integrações', 'Firebase, GitHub, Make, Bling e canais externos.'],
  maintenance: ['Diagnóstico e backup', 'Saúde do sistema, auditoria, exportações e contingência.'],
});

let currentRoute = 'dashboard';
let dispatching = false;

function routeFromLocation() {
  try {
    const hash = location.hash.replace(/^#/, '');
    if (ROUTES[hash]) return hash;
    const saved = localStorage.getItem(ROUTE_STORAGE_KEY);
    if (ROUTES[saved]) return saved;
  } catch {}
  return 'dashboard';
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
  if (reloadButton) reloadButton.hidden = !['dashboard', 'products', 'stock'].includes(route);
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
  if (emit) {
    dispatching = true;
    window.dispatchEvent(new CustomEvent('admin-v2-route', { detail: { route, source: 'navigation-v12' } }));
    dispatching = false;
  }
}

function start() {
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
  window.addEventListener('admin-v2-route-ready', syncAllPlaceholders);
  window.addEventListener('admin-v2-open-product', () => activate('products'));

  window.adminV2Navigate = activate;
  window.adminV2CurrentRoute = () => currentRoute;
  activate(routeFromLocation(), { persist: false });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();