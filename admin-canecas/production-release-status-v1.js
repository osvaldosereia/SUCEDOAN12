(() => {
  'use strict';

  const BUILD = '20260902-production-release-status-v1';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const ORDERS = 'canecas/pedidos';
  const ALERTS = 'canecas/alertas_producao';
  const SEEN_KEY = 'cf_admin_alertas_producao_v1';

  if (window.__CF_PRODUCTION_RELEASE_STATUS__ === BUILD) return;
  window.__CF_PRODUCTION_RELEASE_STATUS__ = BUILD;

  const text = value => String(value ?? '').trim();
  const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  let orders = [];
  let alerts = [];
  let loading = false;

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
      paymentCell.appendChild(document.createElement('br'));
      paymentCell.appendChild(badge);
    }
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

  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const [ordersRaw, alertsRaw] = await Promise.all([get(ORDERS), get(ALERTS).catch(() => ({}))]);
      orders = Object.entries(ordersRaw || {}).map(([__key,value]) => ({ __key, ...(value || {}) }));
      alerts = Object.entries(alertsRaw || {}).map(([id,value]) => ({ id, ...(value || {}) })).sort((a,b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0));
      ensureBar();
      decorateOrders();
      notifyNewAlerts();
    } catch (error) {
      console.debug('[Admin Canecas] liberação de produção:', error?.message || error);
    } finally { loading = false; }
  }

  const observer = new MutationObserver(() => { ensureBar(); decorateOrders(); });
  const start = () => {
    installStyle();
    observer.observe(document.body, { childList:true, subtree:true });
    refresh();
    setInterval(refresh, 30000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  console.info(`Admin Canecas · liberação produção ${BUILD}`);
})();
