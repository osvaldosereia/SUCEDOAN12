(() => {
  'use strict';

  const BUILD = '20260903-production-release-status-v2-shared-snapshot';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const ORDERS = 'canecas/pedidos';
  const ALERTS = 'canecas/alertas_producao';
  const SEEN_KEY = 'cf_admin_alertas_producao_v1';
  const SNAPSHOT_MAX_AGE = 2 * 60 * 1000;

  if (window.__CF_PRODUCTION_RELEASE_STATUS__ === BUILD) return;
  window.__CF_PRODUCTION_RELEASE_STATUS__ = BUILD;

  const text = value => String(value ?? '').trim();
  const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let orders = [];
  let alerts = [];
  let snapshotAt = 0;
  let alertsLoading = false;
  let fallbackLoading = false;
  let ordersObserver = null;

  async function get(path) {
    const response = await fetch(`${FIREBASE}/${path}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json();
  }
  function isReleased(order = {}) {
    const payment = norm(order?.pagamento?.status || order.pagamento_status);
    return payment === 'pago' && order.liberado_producao === true;
  }
  function activeReleased() {
    return orders.filter(order => isReleased(order) && !['cancelado','entregue'].includes(norm(order.status || order.status_comercial)));
  }
  function seen() {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
  }
  function saveSeen(values) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...values].slice(-150))); } catch {}
  }

  function installStyle() {
    if (document.getElementById('cfProductionReleaseStyle')) return;
    const style = document.createElement('style');
    style.id = 'cfProductionReleaseStyle';
    style.textContent = `
      #cfProductionReleaseBar{margin:12px 18px 0;padding:12px 14px;border:1px solid #b9dfc5;background:#eef9f1;border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#173d24;font-size:12px}
      #cfProductionReleaseBar[hidden]{display:none!important}#cfProductionReleaseBar strong{font-size:13px}#cfProductionReleaseBar button{border:0;background:#183f27;color:#fff;border-radius:9px;padding:9px 12px;font-weight:800;cursor:pointer}
      .cf-production-release-badge{display:inline-block;margin-top:5px;padding:4px 7px;border-radius:999px;background:#e8f7ec;color:#176430;border:1px solid #b8e0c3;font-size:9px;font-weight:950;letter-spacing:.025em;white-space:nowrap}
      .cf-production-blocked-badge{display:inline-block;margin-top:5px;padding:4px 7px;border-radius:999px;background:#fff4e6;color:#96510a;border:1px solid #f0d0a7;font-size:9px;font-weight:900;white-space:nowrap}
      tr.cf-order-released{box-shadow:inset 4px 0 0 #2d9a4c}
    `;
    document.head.appendChild(style);
  }
  function ensureBar() {
    installStyle();
    let bar = document.getElementById('cfProductionReleaseBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cfProductionReleaseBar';
      bar.hidden = true;
      const topbar = document.querySelector('.workspace .topbar');
      if (topbar?.parentNode) topbar.parentNode.insertBefore(bar, topbar.nextSibling);
    }
    const released = activeReleased();
    if (!released.length) { bar.hidden = true; return; }
    const units = released.reduce((sum,order) => sum + Math.max(1, Number(order.quantidade_personalizada_total || 1) || 1), 0);
    bar.innerHTML = `<div><strong>${released.length} pedido(s) PAGO(S) · LIBERADO(S) PARA PRODUÇÃO</strong><br>${units} caneca(s) personalizada(s) com pagamento confirmado.</div><button type="button" data-cf-view-paid>VER PEDIDOS</button>`;
    bar.hidden = false;
    bar.querySelector('[data-cf-view-paid]').onclick = () => document.querySelector('#nav [data-route="orders"]')?.click();
  }
  function decorateOrders() {
    const table = document.querySelector('#orders table');
    if (!table) return;
    for (const row of table.querySelectorAll('tbody tr[data-order]')) {
      const order = orders.find(item => text(item.id || item.__key) === text(row.dataset.order));
      if (!order) continue;
      const cells = row.querySelectorAll('td');
      const paymentCell = cells[4];
      if (!paymentCell) continue;
      paymentCell.querySelectorAll('[data-cf-release]').forEach(node => node.remove());
      const oldBreak = paymentCell.querySelector('br[data-cf-release-break]');
      if (oldBreak) oldBreak.remove();
      const badge = document.createElement('span');
      badge.dataset.cfRelease = BUILD;
      if (isReleased(order)) {
        row.classList.add('cf-order-released');
        badge.className = 'cf-production-release-badge';
        badge.textContent = 'PAGO · LIBERADO PRODUÇÃO';
      } else {
        row.classList.remove('cf-order-released');
        badge.className = 'cf-production-blocked-badge';
        badge.textContent = 'PRODUÇÃO BLOQUEADA';
      }
      const br = document.createElement('br');
      br.dataset.cfReleaseBreak = BUILD;
      paymentCell.appendChild(br);
      paymentCell.appendChild(badge);
    }
  }
  function applyOrders(nextOrders, source = 'snapshot') {
    if (!Array.isArray(nextOrders)) return;
    orders = nextOrders;
    snapshotAt = Date.now();
    ensureBar();
    decorateOrders();
    document.documentElement.dataset.cfProductionOrdersSource = source;
  }
  function notifyNewAlerts() {
    const known = seen();
    const fresh = alerts.filter(alert => alert?.liberado_producao === true && alert?.id && !known.has(alert.id));
    if (!fresh.length) return;
    fresh.forEach(alert => known.add(alert.id));
    saveSeen(known);
    const latest = fresh[0];
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = `PAGO · LIBERADO PARA PRODUÇÃO — Pedido ${text(latest.pedido_id)}${latest.cliente_nome ? ` · ${text(latest.cliente_nome)}` : ''}`;
      toast.className = 'toast';
      toast.hidden = false;
      setTimeout(() => { toast.hidden = true; }, 8000);
    }
    if (document.visibilityState === 'visible') {
      try { document.title = `✓ ${fresh.length} pago(s) · Admin Canecas`; setTimeout(() => { document.title = 'Admin Canecas — Dona Antônia'; }, 9000); } catch {}
    }
  }
  async function refreshAlerts() {
    if (alertsLoading) return;
    alertsLoading = true;
    try {
      const raw = await get(ALERTS).catch(() => ({}));
      alerts = Object.entries(raw || {}).map(([id,value]) => ({ id, ...(value || {}) })).sort((a,b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0));
      notifyNewAlerts();
    } catch (error) {
      console.debug('[Admin Canecas] alertas de produção:', error?.message || error);
    } finally { alertsLoading = false; }
  }
  async function fallbackOrders() {
    if (fallbackLoading || (snapshotAt && Date.now() - snapshotAt < SNAPSHOT_MAX_AGE)) return;
    fallbackLoading = true;
    try {
      const raw = await get(ORDERS);
      applyOrders(Object.entries(raw || {}).map(([__key,value]) => ({ __key, id: value?.id || __key, ...(value || {}) })), 'fallback_firebase');
    } catch (error) {
      console.debug('[Admin Canecas] fallback de pedidos da produção:', error?.message || error);
    } finally { fallbackLoading = false; }
  }
  function installOrdersObserver() {
    const root = document.getElementById('orders');
    if (!root || ordersObserver) return;
    ordersObserver = new MutationObserver(() => decorateOrders());
    ordersObserver.observe(root, { childList:true });
  }
  function consumeExistingSnapshot() {
    const snapshot = window.__CF_ADMIN_OPS_SNAPSHOT__;
    if (snapshot?.orders) applyOrders(snapshot.orders, 'dashboard_snapshot');
  }
  function start() {
    installStyle();
    installOrdersObserver();
    consumeExistingSnapshot();
    refreshAlerts();
    setTimeout(() => { if (!snapshotAt) fallbackOrders(); }, 3000);
    setInterval(refreshAlerts, 30_000);
    setInterval(() => {
      if (document.visibilityState === 'visible' && (!snapshotAt || Date.now() - snapshotAt >= SNAPSHOT_MAX_AGE)) void fallbackOrders();
    }, 120_000);
  }

  window.addEventListener('admin-canecas:ops-snapshot', event => applyOrders(event.detail?.orders || [], 'dashboard_snapshot'));
  window.addEventListener('admin-canecas:route', event => {
    if (event.detail?.route === 'orders') setTimeout(decorateOrders, 180);
    if (event.detail?.route === 'dashboard') setTimeout(consumeExistingSnapshot, 180);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  document.documentElement.dataset.cfProductionReleaseStatus = BUILD;
  console.info(`Admin Canecas · liberação produção ${BUILD}`);
})();
