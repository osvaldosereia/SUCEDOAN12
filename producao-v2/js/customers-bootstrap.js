import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { escapeHtml, money, normalizeSearch, text } from './core/utils.js';
import { invalidateCustomersCache, loadCustomers, syncCustomersFromOrders } from './services/customers.js';
import { invalidateOrdersCache, loadRecentOrders } from './services/orders.js';

const ORDER_LIMIT = 180;

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

function phoneDigits(value) {
  return text(value).replace(/\D/g, '');
}

function whatsappLink(customer) {
  const digits = phoneDigits(customer.whatsapp || customer.telefone);
  if (!digits) return '';
  const full = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
}

function addressLine(customer) {
  const address = customer.endereco || {};
  return [address.logradouro, address.numero, address.complemento, address.bairro, address.cidade, address.uf, address.cep]
    .map(text)
    .filter(Boolean)
    .join(', ');
}

function orderDate(value) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
}

function installStyle() {
  if (document.getElementById('customersAdminStyle')) return;
  const style = document.createElement('style');
  style.id = 'customersAdminStyle';
  style.textContent = `
    .customers-panel{margin-bottom:16px}.customers-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid var(--line)}.customers-toolbar .search-field{min-width:280px;flex:1}.customers-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 16px;border-bottom:1px solid var(--line);background:#fafbf9}.customer-detail-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:12px}.customer-detail-card{border:1px solid var(--line);border-radius:12px;padding:12px;background:#fafbf9}.customer-detail-card h3{margin:0 0 8px;font-size:13px}.customer-detail-card p{margin:5px 0;color:var(--muted);font-size:12px;line-height:1.45}.customer-orders{display:grid;gap:7px}.customer-order-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;border-bottom:1px solid var(--line);padding:8px 0}.customer-order-row:last-child{border-bottom:0}
  `;
  document.head.appendChild(style);
}

function modal(title, subtitle = '') {
  const backdrop = document.createElement('div');
  backdrop.className = 'suite-modal-backdrop';
  const dialog = document.createElement('section');
  dialog.className = 'suite-modal';
  dialog.innerHTML = `<header><div><span class="eyebrow">Clientes</span><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><button class="icon-button" type="button" data-close>×</button></header><div class="suite-modal-body"></div><footer><button class="button secondary" type="button" data-close-foot>Fechar</button></footer>`;
  const close = () => { backdrop.remove(); dialog.remove(); };
  backdrop.addEventListener('click', close);
  dialog.querySelector('[data-close]').addEventListener('click', close);
  dialog.querySelector('[data-close-foot]').addEventListener('click', close);
  document.body.append(backdrop, dialog);
  return { dialog, body: dialog.querySelector('.suite-modal-body'), close };
}

class CustomersPanel {
  constructor(container) {
    this.container = container;
    this.customers = [];
    this.searchTimer = null;
    this.renderShell();
    this.reload();
  }

  renderShell() {
    this.container.innerHTML = `<section class="panel customers-panel"><div class="panel-header"><div><span class="eyebrow">Cadastro operacional</span><h2>Clientes</h2><p>Clientes gerados a partir dos pedidos, com telefone, endereco e historico resumido.</p></div><div class="suite-actions"><span class="badge info" data-customers-status>Preparando...</span><button class="button secondary" type="button" data-customers-sync>Atualizar pelos pedidos</button><button class="button secondary" type="button" data-customers-reload>Recarregar</button></div></div><div class="customers-metrics" data-customers-metrics></div><div class="customers-toolbar"><div class="search-field"><span>⌕</span><input type="search" placeholder="Buscar por nome, telefone, bairro ou cidade" data-customers-search></div><select data-customers-sort><option value="recent">Ultimo pedido</option><option value="orders">Mais pedidos</option><option value="value">Maior valor</option><option value="name">Nome</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Cliente</th><th>Endereco</th><th>Pedidos</th><th>Ultimo pedido</th><th>Total</th><th></th></tr></thead><tbody data-customers-rows><tr><td colspan="6">Carregando clientes...</td></tr></tbody></table></div></section>`;
    this.container.querySelector('[data-customers-search]').addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.renderRows(), 140);
    });
    this.container.querySelector('[data-customers-sort]').addEventListener('change', () => this.renderRows());
    this.container.querySelector('[data-customers-reload]').addEventListener('click', () => this.reload({ force: true }));
    this.container.querySelector('[data-customers-sync]').addEventListener('click', event => this.syncFromOrders(event.currentTarget));
    this.container.querySelector('[data-customers-rows]').addEventListener('click', event => {
      const details = event.target.closest('[data-customer-open]');
      const whatsapp = event.target.closest('[data-customer-whatsapp]');
      const key = details?.dataset.customerOpen || whatsapp?.dataset.customerWhatsapp;
      const customer = this.customers.find(item => String(item.firebaseKey) === String(key));
      if (!customer) return;
      if (whatsapp) {
        const link = whatsappLink(customer);
        if (link) window.open(link, '_blank', 'noopener,noreferrer');
        else toast('Cliente sem telefone para WhatsApp.', 'error');
      } else {
        this.openCustomer(customer);
      }
    });
  }

  setStatus(label, kind = 'info') {
    const status = this.container.querySelector('[data-customers-status]');
    if (!status) return;
    status.className = `badge ${kind}`;
    status.textContent = label;
  }

  async reload({ force = false } = {}) {
    this.setStatus('Carregando...', 'warning');
    try {
      this.customers = await loadCustomers(loadConfig(), { force });
      this.setStatus(`${this.customers.length} cliente(s)`, 'success');
      this.renderRows();
    } catch (error) {
      this.setStatus('Falha', 'danger');
      this.container.querySelector('[data-customers-rows]').innerHTML = `<tr><td colspan="6">${escapeHtml(error?.message || String(error))}</td></tr>`;
    }
  }

  filteredCustomers() {
    const query = normalizeSearch(this.container.querySelector('[data-customers-search]').value);
    const sort = this.container.querySelector('[data-customers-sort]').value;
    const rows = this.customers.filter(customer => !query || normalizeSearch([
      customer.nome, customer.telefone, customer.whatsapp, customer.email, addressLine(customer),
    ].join(' ')).includes(query));
    const sorters = {
      orders: (a, b) => (b.total_pedidos || 0) - (a.total_pedidos || 0),
      value: (a, b) => (b.valor_total_pedidos || 0) - (a.valor_total_pedidos || 0),
      name: (a, b) => text(a.nome).localeCompare(text(b.nome), 'pt-BR'),
      recent: (a, b) => new Date(b.ultimo_pedido_em || 0) - new Date(a.ultimo_pedido_em || 0),
    };
    return rows.sort(sorters[sort] || sorters.recent);
  }

  renderRows() {
    const rows = this.filteredCustomers();
    const totalOrders = this.customers.reduce((sum, customer) => sum + (customer.total_pedidos || 0), 0);
    const totalValue = this.customers.reduce((sum, customer) => sum + (customer.valor_total_pedidos || 0), 0);
    this.container.querySelector('[data-customers-metrics]').innerHTML = `<article class="metric-card info"><strong>${this.customers.length}</strong><span>Clientes</span><small>Cadastro no Firebase</small></article><article class="metric-card success"><strong>${totalOrders}</strong><span>Pedidos vinculados</span><small>Historico por cliente</small></article><article class="metric-card warning"><strong>${money(totalValue)}</strong><span>Valor acumulado</span><small>Somente pedidos importados</small></article><article class="metric-card info"><strong>${rows.length}</strong><span>Resultado atual</span><small>Depois dos filtros</small></article>`;
    this.container.querySelector('[data-customers-rows]').innerHTML = rows.length ? rows.slice(0, 160).map(customer => {
      const address = addressLine(customer);
      return `<tr><td><strong>${escapeHtml(customer.nome || 'Cliente')}</strong><small>${escapeHtml(customer.telefone || customer.whatsapp || 'Sem telefone')}</small></td><td><span>${escapeHtml(address || 'Sem endereco')}</span><small>${escapeHtml(customer.email || '')}</small></td><td><strong>${customer.total_pedidos || 0}</strong></td><td>${escapeHtml(orderDate(customer.ultimo_pedido_em) || 'Sem data')}</td><td>${money(customer.valor_total_pedidos || 0)}</td><td><div class="suite-actions"><button class="row-action" type="button" data-customer-open="${escapeHtml(customer.firebaseKey)}">Abrir</button><button class="row-action" type="button" data-customer-whatsapp="${escapeHtml(customer.firebaseKey)}">WhatsApp</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-state">Nenhum cliente encontrado.</td></tr>';
  }

  async syncFromOrders(button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Atualizando...';
    this.setStatus('Lendo pedidos...', 'warning');
    try {
      invalidateOrdersCache();
      const result = await loadRecentOrders(loadConfig(), { limit: ORDER_LIMIT, force: true });
      const saved = await syncCustomersFromOrders(loadConfig(), result.orders);
      invalidateCustomersCache();
      toast(`${saved} cadastro(s) de cliente atualizados.`, 'success');
      await this.reload({ force: true });
    } catch (error) {
      this.setStatus('Falha', 'danger');
      toast(error?.message || String(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  openCustomer(customer) {
    const view = modal(customer.nome || 'Cliente', customer.telefone || customer.whatsapp || '');
    const orders = Array.isArray(customer.pedidos_lista) ? customer.pedidos_lista : [];
    view.body.innerHTML = `<div class="customer-detail-grid"><section class="customer-detail-card"><h3>Contato</h3><p><strong>${escapeHtml(customer.nome || 'Cliente')}</strong></p><p>${escapeHtml(customer.telefone || customer.whatsapp || 'Sem telefone')}</p><p>${escapeHtml(customer.email || 'Sem e-mail')}</p></section><section class="customer-detail-card"><h3>Endereco</h3><p>${escapeHtml(addressLine(customer) || 'Sem endereco')}</p><p>${escapeHtml(customer.endereco?.referencia || '')}</p></section></div><h3>Pedidos recentes</h3><div class="customer-orders">${orders.length ? orders.slice(0, 25).map(order => `<div class="customer-order-row"><span><strong>#${escapeHtml(order.numero || order.firebaseKey)}</strong><small>${escapeHtml(orderDate(order.criado_em))}</small></span><span>${escapeHtml(order.forma_pagamento || '')}</span><strong>${money(order.total || 0)}</strong></div>`).join('') : '<p>Nenhum pedido vinculado.</p>'}</div>`;
  }
}

function start() {
  const view = document.querySelector('[data-view="customers"]');
  if (!view || document.getElementById('customersAdminRoot')) return;
  installStyle();
  const root = document.createElement('div');
  root.id = 'customersAdminRoot';
  view.appendChild(root);
  new CustomersPanel(root);
  window.dispatchEvent(new CustomEvent('admin-v2-route-ready', { detail: { route: 'customers' } }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
