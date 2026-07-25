const ROUTE_STORAGE_KEY = 'da_admin_v2_professional_route';

const groups = [
  {
    label: 'Início',
    items: [
      { id: 'dashboard', legacy: 'dashboard', view: 'dashboard', icon: '⌂', title: 'Visão geral', subtitle: 'Indicadores, prioridades e estado do sistema.' },
    ],
  },
  {
    label: 'Catálogo e estoque',
    items: [
      { id: 'products', legacy: 'products', view: 'products', icon: '▦', title: 'Produtos', subtitle: 'Consulta, cadastro e edição do catálogo.' },
      { id: 'stock', legacy: 'operations', host: 'stock', icon: '◫', title: 'Estoque e validade', subtitle: 'Estoque baixo, vencimentos, lotes e localização.' },
      { id: 'quick-read', legacy: 'operations', host: 'quick-read', icon: '⌁', title: 'Leitura rápida', subtitle: 'Consulta por leitor, EAN, código ou nome.' },
      { id: 'nfe', legacy: 'operations', host: 'nfe', icon: 'NF', title: 'Entrada de NF-e', subtitle: 'Leitura, simulação e importação protegida de XML.' },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { id: 'orders', legacy: 'operations', host: 'orders', icon: 'PD', title: 'Pedidos', subtitle: 'Separação, conferência, entrega, etiquetas e reenvios.' },
      { id: 'baskets', legacy: 'promotions', host: 'collections', icon: 'CB', title: 'Cestas básicas', subtitle: 'Composição, estoque, substituições e publicação.' },
      { id: 'kits', legacy: 'promotions', host: 'collections', icon: 'KT', title: 'Kits promocionais', subtitle: 'Preço, desconto, composição, IA e Instagram.' },
      { id: 'offers', legacy: 'promotions', host: 'offers', icon: '%', title: 'Ofertas automáticas', subtitle: 'Regras por validade, simulação e aplicação segura.' },
      { id: 'coupons', legacy: 'promotions', host: 'coupons', icon: 'CP', title: 'Cupons', subtitle: 'Criação, edição, validade e publicação no checkout.' },
      { id: 'quick-purchase', legacy: 'promotions', host: 'quick-purchase', icon: 'CR', title: 'Compra Rápida', subtitle: 'Seções, itens e opções de produtos do fluxo rápido.' },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { id: 'categories', legacy: 'registries', host: 'registries', registry: 'categories', icon: 'CT', title: 'Categorias', subtitle: 'Categorias, subcategorias e padronização em lote.' },
      { id: 'brands', legacy: 'registries', host: 'registries', registry: 'brands', icon: 'MC', title: 'Marcas', subtitle: 'Marcas usadas pelos produtos e suas variações.' },
      { id: 'suppliers', legacy: 'registries', host: 'registries', registry: 'suppliers', icon: 'FR', title: 'Fornecedores', subtitle: 'Fornecedores cadastrados e padronização.' },
      { id: 'tags', legacy: 'registries', host: 'registries', registry: 'tags', icon: 'TG', title: 'Tags', subtitle: 'Marcadores universais sem duplicações.' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'integrations', legacy: 'settings', host: 'integrations', icon: 'IN', title: 'Integrações', subtitle: 'Firebase, GitHub, Make, Bling e canais externos.' },
      { id: 'maintenance', legacy: 'settings', host: 'maintenance', icon: 'DG', title: 'Diagnóstico e backup', subtitle: 'Saúde do sistema, auditoria, exportações e contingência.' },
    ],
  },
];

const routes = new Map(groups.flatMap(group => group.items).map(item => [item.id, item]));
let activeRoute = 'dashboard';
let syncing = false;

function installStyle() {
  if (document.getElementById('professionalShellStyle')) return;
  const style = document.createElement('style');
  style.id = 'professionalShellStyle';
  style.textContent = `
    :root{--sidebar:272px}
    .sidebar{padding:16px 12px}.brand{padding:3px 8px 15px}.main-nav{min-height:0;overflow:auto;padding:12px 2px 18px;gap:2px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.22) transparent}
    .nav-group{display:grid;gap:3px;margin-bottom:13px}.nav-group:last-child{margin-bottom:2px}.nav-group-label{padding:7px 10px 4px;color:#7f897f;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.11em}
    .nav-item{min-height:37px;padding:8px 10px;border-radius:9px;gap:9px;font-size:12px}.nav-item .nav-icon{flex:0 0 27px;width:27px;height:27px;border-radius:8px;background:rgba(255,255,255,.07);font-size:10px;font-weight:950;letter-spacing:-.02em}.nav-item.active .nav-icon{background:#eceeea}.nav-item span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sidebar-status{flex:0 0 auto;margin-top:8px}.professional-view{max-width:1480px;margin:0 auto}.professional-view>.panel,.professional-view>div>.panel{margin-bottom:16px}.professional-view>.span-all-settings{grid-column:auto}.professional-view .collection-tabs,.professional-view .registry-tabs{display:none!important}
    .professional-loading{min-height:190px;display:grid;place-items:center;padding:28px;border:1px dashed var(--line-strong);border-radius:var(--radius);background:rgba(255,255,255,.58);color:var(--muted);text-align:center}.professional-loading strong,.professional-loading span{display:block}.professional-loading strong{font-size:15px;color:var(--text)}.professional-loading span{max-width:460px;margin-top:6px;font-size:11px;line-height:1.5}
    .professional-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;align-items:start}.professional-settings-grid>.span-all-settings,.professional-settings-grid>#diagnosticsWorkspace,.professional-settings-grid>#adminBackupPanel{grid-column:1/-1}
    .professional-view #ordersAdminRoot:empty{display:none}.professional-view #orderToolsPanel{margin-top:0}.professional-view #collectionsWorkspace,.professional-view #registriesWorkspace{margin-bottom:16px}
    .environment-banner[hidden]{display:none!important}
    @media(max-width:980px){:root{--sidebar:250px}.professional-settings-grid{grid-template-columns:1fr}.professional-settings-grid>*{grid-column:auto!important}}
    @media(max-width:760px){.main-nav{padding-bottom:28px}.nav-item{min-height:42px}.professional-view{max-width:none}.main-content{padding-left:14px;padding-right:14px}}
  `;
  document.head.appendChild(style);
}

function buildNavigation() {
  const nav = document.getElementById('mainNav');
  if (!nav || nav.dataset.professional === '1') return;
  nav.dataset.professional = '1';
  nav.innerHTML = groups.map(group => `<section class="nav-group"><div class="nav-group-label">${group.label}</div>${group.items.map(item => `<button class="nav-item" data-route="${item.legacy}" data-admin-route="${item.id}" type="button" title="${item.title}"><span class="nav-icon" aria-hidden="true">${item.icon}</span><span>${item.title}</span></button>`).join('')}</section>`).join('');
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-admin-route]');
    if (!button) return;
    const route = button.dataset.adminRoute;
    setTimeout(() => activate(route), 0);
  });
}

function ensureView(host) {
  const main = document.getElementById('mainContent');
  if (!main) return null;
  let view = main.querySelector(`[data-professional-view="${host}"]`);
  if (view) return view;
  view = document.createElement('section');
  view.className = 'view professional-view';
  view.dataset.view = `professional-${host}`;
  view.dataset.professionalView = host;
  view.innerHTML = `<div class="professional-loading" data-professional-loading><div><strong>Preparando esta função</strong><span>O módulo será exibido aqui sem misturar ferramentas de outras áreas.</span></div></div>`;
  main.appendChild(view);
  return view;
}

function ensureViews() {
  [...new Set([...routes.values()].map(item => item.host).filter(Boolean))].forEach(ensureView);
  ['integrations', 'maintenance'].forEach(host => {
    const view = ensureView(host);
    if (view && !view.querySelector('.professional-settings-grid')) {
      const grid = document.createElement('div');
      grid.className = 'professional-settings-grid';
      grid.dataset.professionalSettings = host;
      view.appendChild(grid);
    }
  });
}

function hostElement(host) {
  const view = document.querySelector(`[data-professional-view="${host}"]`);
  if (!view) return null;
  return view.querySelector(`[data-professional-settings="${host}"]`) || view;
}

function move(selector, host) {
  const node = document.querySelector(selector);
  const target = hostElement(host);
  if (!node || !target || node.parentElement === target) return false;
  target.appendChild(node);
  return true;
}

function classifySettings() {
  const grid = document.querySelector('[data-view="settings"] .settings-grid');
  if (!grid) return;
  [...grid.children].forEach(panel => {
    const title = String(panel.querySelector('h2,h3')?.textContent || '').trim();
    const id = panel.id || '';
    if (id === 'nfeSafetySettings') return void move('#nfeSafetySettings', 'nfe');
    if (id === 'stockSafetySettings') return void move('#stockSafetySettings', 'stock');
    if (id === 'collectionsSafetySettings') return void move('#collectionsSafetySettings', 'collections');
    if (id === 'offerSafetySettings') return void move('#offerSafetySettings', 'offers');
    if (id === 'registrySafetySettings') return void move('#registrySafetySettings', 'registries');
    if (id === 'diagnosticsWorkspace' || id === 'adminBackupPanel' || /diagnóstico|backup|ferramentas avançadas|auditoria/i.test(title)) {
      hostElement('maintenance')?.appendChild(panel);
      return;
    }
    if (id === 'externalIntegrationSettings' || /fontes de dados|publicação no github|automações do make|referências de make|bling|integraç/i.test(title)) {
      hostElement('integrations')?.appendChild(panel);
    }
  });
}

function moveModules() {
  if (syncing) return;
  syncing = true;
  try {
    move('#stockWorkspace', 'stock');
    move('#stockSafetySettings', 'stock');
    move('#quickReadWorkspace', 'quick-read');
    move('#nfeWorkspace', 'nfe');
    move('#nfeSafetySettings', 'nfe');
    move('#ordersAdminRoot', 'orders');
    move('#orderToolsPanel', 'orders');
    move('#collectionsWorkspace', 'collections');
    move('#collectionsSafetySettings', 'collections');
    move('#offersWorkspace', 'offers');
    move('#offerSafetySettings', 'offers');
    move('#couponsAdminRoot', 'coupons');
    move('#quickPurchaseAdminRoot', 'quick-purchase');
    move('#registriesWorkspace', 'registries');
    move('#registrySafetySettings', 'registries');
    classifySettings();
    document.querySelectorAll('[data-professional-view]').forEach(view => {
      const loading = view.querySelector('[data-professional-loading]');
      if (!loading) return;
      const content = [...view.children].some(child => child !== loading && (child.matches('.panel,#ordersAdminRoot,.professional-settings-grid') || child.querySelector?.('.panel')));
      loading.hidden = content;
    });
  } finally {
    syncing = false;
  }
}

function applySubsection(routeId) {
  const route = routes.get(routeId);
  if (!route) return;
  if (route.id === 'baskets' || route.id === 'kits') {
    const type = route.id === 'baskets' ? 'basket' : 'kit';
    const button = document.querySelector(`#collectionTabs [data-collection-type="${type}"]`);
    if (button && !button.classList.contains('active')) button.click();
  }
  if (route.registry) {
    const button = document.querySelector(`#registryTabs [data-registry-tab="${route.registry}"]`);
    if (button && !button.classList.contains('active')) button.click();
  }
}

function activate(routeId, { persist = true } = {}) {
  const route = routes.get(routeId) || routes.get('dashboard');
  activeRoute = route.id;
  moveModules();
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  const view = route.view
    ? document.querySelector(`[data-view="${route.view}"]`)
    : document.querySelector(`[data-professional-view="${route.host}"]`);
  view?.classList.add('active');
  document.querySelectorAll('#mainNav [data-admin-route]').forEach(button => button.classList.toggle('active', button.dataset.adminRoute === route.id));
  const title = document.getElementById('pageTitle');
  const subtitle = document.getElementById('pageSubtitle');
  if (title) title.textContent = route.title;
  if (subtitle) subtitle.textContent = route.subtitle;
  const publish = document.getElementById('publishButton');
  const reload = document.getElementById('reloadButton');
  const coreRoute = route.id === 'dashboard' || route.id === 'products';
  if (publish) publish.hidden = !coreRoute;
  if (reload) reload.hidden = !coreRoute;
  const banner = document.querySelector('.environment-banner');
  if (banner) banner.hidden = route.id !== 'dashboard';
  document.getElementById('sidebar')?.classList.remove('open');
  const overlay = document.getElementById('mobileOverlay');
  if (overlay && !document.getElementById('productEditor')?.classList.contains('open')) overlay.hidden = true;
  applySubsection(route.id);
  document.getElementById('mainContent')?.focus({ preventScroll: true });
  if (persist) {
    try { localStorage.setItem(ROUTE_STORAGE_KEY, route.id); } catch {}
    try { history.replaceState(null, '', `#${route.id}`); } catch {}
  }
}

function installObservers() {
  const targets = ['operations', 'promotions', 'registries', 'settings']
    .map(name => document.querySelector(`[data-view="${name}"]`))
    .filter(Boolean);
  const observer = new MutationObserver(() => {
    queueMicrotask(() => {
      moveModules();
      applySubsection(activeRoute);
    });
  });
  targets.forEach(target => observer.observe(target, { childList: true, subtree: true }));
}

function installDirectNavigationBridges() {
  ['dashboardMetrics', 'priorityList'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => setTimeout(() => activate('products'), 0));
  });
  window.addEventListener('admin-v2-open-product', () => setTimeout(() => activate('products'), 0));
}

function start() {
  installStyle();
  buildNavigation();
  ensureViews();
  moveModules();
  installObservers();
  installDirectNavigationBridges();
  let requested = 'dashboard';
  try {
    const hash = location.hash.replace(/^#/, '');
    const stored = localStorage.getItem(ROUTE_STORAGE_KEY);
    requested = routes.has(hash) ? hash : routes.has(stored) ? stored : 'dashboard';
  } catch {}
  if (requested === 'dashboard' || requested === 'products') activate(requested, { persist: false });
  else {
    const button = document.querySelector(`#mainNav [data-admin-route="${requested}"]`);
    if (button) setTimeout(() => button.click(), 0);
    else activate('dashboard', { persist: false });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

export { activate, moveModules };
