import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { escapeHtml, money, normalizeSearch, number, text } from './core/utils.js';
import { patchOrder } from './services/firebase.js';
import { invalidateOrdersCache, loadOlderOrders, loadRecentOrders } from './services/orders.js';

const AUDIT_KEY = 'da_admin_v2_audit_log';
const INITIAL_LIMIT = 120;
const HISTORY_LIMIT = 100;
const PAGE_SIZE = 30;

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 7000 : 4000);
}

function audit(action, details = {}) {
  try {
    const current = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    current.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, action, at: new Date().toISOString(), details });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(current.slice(-1000)));
  } catch {}
}

function installStyle() {
  if (document.getElementById('ordersAdminStyle')) return;
  const style = document.createElement('style');
  style.id = 'ordersAdminStyle';
  style.textContent = `
    .orders-panel{margin-bottom:16px}.orders-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}.orders-toolbar .search-field{min-width:240px;flex:1}.orders-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:13px 16px;border-top:1px solid var(--line)}.orders-footer-info{color:var(--muted);font-size:11px}.orders-page-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.orders-page-actions strong{font-size:11px}.orders-loading{opacity:.68;pointer-events:none}.suite-actions{display:flex;gap:6px;flex-wrap:wrap}.suite-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:1300}.suite-modal{position:fixed;z-index:1301;inset:5vh max(18px,calc((100vw - 900px)/2));background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 28px 90px rgba(0,0,0,.3)}.suite-modal header,.suite-modal footer{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid #e4e5e1}.suite-modal footer{border-top:1px solid #e4e5e1;border-bottom:0;justify-content:flex-end}.suite-modal-body{padding:20px 22px;overflow:auto}.order-items{display:grid;gap:8px}.order-item{display:grid;grid-template-columns:1fr auto;gap:10px;border-bottom:1px solid #eee;padding:8px 0}.order-status-actions{display:flex;gap:8px;flex-wrap:wrap}.suite-summary{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px}.suite-summary span{padding:8px 10px;background:#f1f2ef;border-radius:10px}.suite-danger{color:#9b1c1c}
    @media(max-width:800px){.suite-modal{inset:0;border-radius:0}.orders-toolbar{padding:11px}.orders-toolbar .search-field{min-width:100%}.orders-footer{align-items:stretch}.orders-page-actions{width:100%;justify-content:space-between}}
  `;
  document.head.appendChild(style);
}

function modal(title, subtitle = '') {
  const backdrop = document.createElement('div');
  backdrop.className = 'suite-modal-backdrop';
  const dialog = document.createElement('section');
  dialog.className = 'suite-modal';
  dialog.innerHTML = `<header><div><span class="eyebrow">Admin oficial</span><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><button class="icon-button" type="button" data-close>×</button></header><div class="suite-modal-body"></div><footer></footer>`;
  const close = () => { backdrop.remove(); dialog.remove(); };
  backdrop.addEventListener('click', close);
  dialog.querySelector('[data-close]').addEventListener('click', close);
  document.body.append(backdrop, dialog);
  return { dialog, body: dialog.querySelector('.suite-modal-body'), foot: dialog.querySelector('footer'), close };
}

function orderDate(order) {
  const value = order.criado_em || order.created_at || order.data || order.timestamp;
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function orderNumber(order) { return text(order.numero_pedido || order.numero || order.id || order.firebaseKey); }
function orderCustomer(order) { return text(order.cliente?.nome || order.nome_cliente || order.nome || 'Cliente'); }
function orderPhone(order) { return text(order.cliente?.telefone || order.telefone || order.whatsapp); }
function orderStatus(order) { return text(order.status_entrega || order.status_separacao || order.status || 'novo'); }
function orderItems(order) { return Array.isArray(order.itens) ? order.itens : Array.isArray(order.produtos) ? order.produtos : []; }

class OrdersPanel {
  constructor(container) {
    this.container = container;
    this.orders = [];
    this.page = 1;
    this.hasMore = false;
    this.oldestKey = '';
    this.loading = false;
    this.searchTimer = null;
    this.renderShell();
    this.reload();
  }

  renderShell() {
    this.container.innerHTML = `<section class="panel orders-panel"><div class="panel-header"><div><span class="eyebrow">Operação leve</span><h2>Pedidos</h2><p>Lista paginada dos pedidos recentes. Histórico antigo é carregado somente quando solicitado.</p></div><div class="suite-actions"><span class="badge info" data-orders-load-status>Preparando…</span><button class="button secondary" type="button" data-orders-reload>Atualizar</button></div></div><div class="orders-toolbar"><div class="search-field"><span>⌕</span><input type="search" placeholder="Pedido, cliente ou telefone" autocomplete="off" data-orders-search></div><select data-orders-status><option value="">Todos os status</option><option value="novo">Novos</option><option value="separacao">Em separação</option><option value="conferido">Conferidos</option><option value="entregue">Entregues</option><option value="cancelado">Cancelados</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody data-orders-rows><tr><td colspan="6">Preparando lista…</td></tr></tbody></table></div><div class="orders-footer"><div class="orders-footer-info" data-orders-summary></div><div class="orders-page-actions"><button class="button secondary compact" type="button" data-orders-previous>Anterior</button><strong data-orders-page>Página 1</strong><button class="button secondary compact" type="button" data-orders-next>Próxima</button><button class="button secondary compact" type="button" data-orders-more>Carregar mais antigos</button></div></div></section>`;
    this.container.querySelector('[data-orders-reload]').addEventListener('click', () => this.reload({ force: true }));
    this.container.querySelector('[data-orders-search]').addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => { this.page = 1; this.renderRows(); }, 140);
    });
    this.container.querySelector('[data-orders-status]').addEventListener('change', () => { this.page = 1; this.renderRows(); });
    this.container.querySelector('[data-orders-previous]').addEventListener('click', () => { this.page = Math.max(1, this.page - 1); this.renderRows(); });
    this.container.querySelector('[data-orders-next]').addEventListener('click', () => { this.page += 1; this.renderRows(); });
    this.container.querySelector('[data-orders-more]').addEventListener('click', event => this.loadMore(event.currentTarget));
    this.container.querySelector('[data-orders-rows]').addEventListener('click', event => {
      const button = event.target.closest('[data-order-open]');
      if (!button) return;
      const order = this.orders.find(row => String(row.firebaseKey) === String(button.dataset.orderOpen));
      if (order) this.open(order);
    });
  }

  setLoading(active, label = '') {
    this.loading = active;
    this.container.querySelector('.orders-panel')?.classList.toggle('orders-loading', active);
    const status = this.container.querySelector('[data-orders-load-status]');
    if (status) {
      status.className = `badge ${active ? 'warning' : 'success'}`;
      status.textContent = label || (active ? 'Carregando…' : `${this.orders.length} carregados`);
    }
  }

  async reload({ force = false } = {}) {
    if (this.loading) return;
    const rows = this.container.querySelector('[data-orders-rows]');
    rows.innerHTML = '<tr><td colspan="6">Carregando somente os pedidos mais recentes…</td></tr>';
    this.setLoading(true, 'Últimos pedidos…');
    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (force) invalidateOrdersCache();
      const result = await loadRecentOrders(loadConfig(), { limit: INITIAL_LIMIT, force });
      this.orders = result.orders;
      this.hasMore = result.hasMore;
      this.oldestKey = result.oldestKey;
      this.page = 1;
      this.setLoading(false, `${this.orders.length} pedidos recentes`);
      this.renderRows();
    } catch (error) {
      this.setLoading(false, 'Falha ao carregar');
      rows.innerHTML = `<tr><td colspan="6">${escapeHtml(error?.message || String(error))}</td></tr>`;
    }
  }

  filteredOrders() {
    const query = normalizeSearch(this.container.querySelector('[data-orders-search]').value);
    const status = normalizeSearch(this.container.querySelector('[data-orders-status]').value);
    return this.orders.filter(order => {
      const matchesQuery = !query || normalizeSearch([orderNumber(order), orderCustomer(order), orderPhone(order), orderStatus(order)].join(' ')).includes(query);
      const currentStatus = normalizeSearch(orderStatus(order));
      const matchesStatus = !status || currentStatus.includes(status) || (status === 'separacao' && currentStatus.includes('separ'));
      return matchesQuery && matchesStatus;
    });
  }

  renderRows() {
    const visible = this.filteredOrders();
    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    this.page = Math.min(Math.max(1, this.page), pageCount);
    const start = (this.page - 1) * PAGE_SIZE;
    const pageRows = visible.slice(start, start + PAGE_SIZE);
    this.container.querySelector('[data-orders-rows]').innerHTML = pageRows.length ? pageRows.map(order => `<tr><td><strong>#${escapeHtml(orderNumber(order))}</strong><small>${orderItems(order).length} item(ns)</small></td><td><strong>${escapeHtml(orderCustomer(order))}</strong><small>${escapeHtml(orderPhone(order))}</small></td><td>${escapeHtml(orderDate(order).toLocaleString('pt-BR'))}</td><td>${money(order.total || order.valor_total || 0)}</td><td><span class="badge info">${escapeHtml(orderStatus(order))}</span></td><td><button class="row-action" type="button" data-order-open="${escapeHtml(order.firebaseKey)}">Abrir</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">Nenhum pedido encontrado.</td></tr>';

    this.container.querySelector('[data-orders-summary]').textContent = visible.length
      ? `Mostrando ${start + 1}–${Math.min(start + PAGE_SIZE, visible.length)} de ${visible.length} resultado(s) · ${this.orders.length} pedido(s) em memória`
      : `${this.orders.length} pedido(s) carregado(s)`;
    this.container.querySelector('[data-orders-page]').textContent = `Página ${this.page} de ${pageCount}`;
    this.container.querySelector('[data-orders-previous]').disabled = this.page <= 1;
    this.container.querySelector('[data-orders-next]').disabled = this.page >= pageCount;
    const more = this.container.querySelector('[data-orders-more]');
    more.hidden = !this.hasMore;
    more.disabled = this.loading;
  }

  async loadMore(button) {
    if (this.loading || !this.hasMore || !this.oldestKey) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Carregando…';
    try {
      const result = await loadOlderOrders(loadConfig(), this.oldestKey, { limit: HISTORY_LIMIT });
      const merged = new Map(this.orders.map(order => [String(order.firebaseKey), order]));
      result.orders.forEach(order => merged.set(String(order.firebaseKey), order));
      this.orders = [...merged.values()].sort((a, b) => orderDate(b) - orderDate(a));
      this.hasMore = result.hasMore;
      this.oldestKey = result.oldestKey || this.oldestKey;
      this.renderRows();
      toast(`${result.orders.length} pedido(s) antigo(s) adicionados.`, 'success');
    } catch (error) {
      toast(error?.message || String(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  open(order) {
    const view = modal(`Pedido #${orderNumber(order)}`, `${orderCustomer(order)} · ${orderPhone(order)}`);
    const delivery = order.entrega || order.endereco || order.cliente?.endereco || {};
    const items = orderItems(order);
    view.body.innerHTML = `<div class="suite-summary"><span>Status: ${escapeHtml(orderStatus(order))}</span><span>Total: ${money(order.total || order.valor_total || 0)}</span><span>${items.length} item(ns)</span></div><p><strong>Entrega:</strong> ${escapeHtml([delivery.logradouro || delivery.rua, delivery.numero, delivery.bairro, delivery.cidade].filter(Boolean).join(', ') || 'Não informada')}</p><p><strong>Pagamento:</strong> ${escapeHtml(order.pagamento?.forma || order.forma_pagamento || order.pagamento || 'Não informado')}</p><p><strong>Observações:</strong> ${escapeHtml(order.observacoes || order.obs || 'Nenhuma')}</p><h3>Itens</h3><div class="order-items">${items.map(item => `<div class="order-item"><span><strong>${escapeHtml(item.nome || item.produto || item.descricao || item.codigo)}</strong><small>${escapeHtml(item.codigo || item.sku || item.ean || '')}</small></span><strong>${number(item.qtd || item.quantidade || 1)} × ${money(item.price || item.preco || item.valor || 0)}</strong></div>`).join('') || '<p>Nenhum item.</p>'}</div><hr><h3>Atualizar status</h3><div class="order-status-actions"><button class="button secondary" data-order-status="separacao">Em separação</button><button class="button secondary" data-order-status="conferido">Conferido</button><button class="button primary" data-order-status="entregue">Entregue</button><button class="button ghost suite-danger" data-order-status="cancelado">Cancelado</button></div>`;
    view.foot.innerHTML = '<button class="button secondary" type="button" data-print>Imprimir</button><button class="button secondary" type="button" data-close-foot>Fechar</button>';
    view.foot.querySelector('[data-close-foot]').addEventListener('click', view.close);
    view.foot.querySelector('[data-print]').addEventListener('click', () => window.print());
    view.body.querySelector('.order-status-actions').addEventListener('click', async event => {
      const button = event.target.closest('[data-order-status]');
      if (!button) return;
      const status = button.dataset.orderStatus;
      if (status === 'cancelado' && !confirm('Cancelar este pedido?')) return;
      button.disabled = true;
      try {
        await patchOrder(loadConfig(), order.firebaseKey, {
          status,
          status_separacao: status === 'separacao' ? 'em_separacao' : status === 'conferido' ? 'conferido' : order.status_separacao,
          status_entrega: status === 'entregue' ? 'entregue' : order.status_entrega,
        });
        invalidateOrdersCache();
        order.status = status;
        if (status === 'conferido') order.status_separacao = 'conferido';
        if (status === 'entregue') order.status_entrega = 'entregue';
        audit('pedido_status', { pedido: orderNumber(order), status });
        toast(`Pedido atualizado para ${status}.`, 'success');
        view.close();
        this.renderRows();
      } catch (error) {
        button.disabled = false;
        toast(error?.message || String(error), 'error');
      }
    });
  }
}

function start() {
  const view = document.querySelector('[data-view="orders"]');
  if (!view || document.getElementById('ordersAdminRoot')) return;
  installStyle();
  const root = document.createElement('div');
  root.id = 'ordersAdminRoot';
  view.appendChild(root);
  new OrdersPanel(root);
  window.dispatchEvent(new CustomEvent('admin-v2-route-ready', { detail: { route: 'orders' } }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();