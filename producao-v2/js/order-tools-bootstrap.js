import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { escapeHtml, normalizeSearch, number, text } from './core/utils.js';
import { patchOrder } from './services/firebase.js';
import { invalidateOrdersCache, loadRecentOrders } from './services/orders.js';

const CONTINGENCY_LIMIT = 60;
const VISIBLE_LIMIT = 30;

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function persistConfig(patch = {}) {
  const next = { ...loadConfig(), ...patch };
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(next));
  return next;
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

function installOrderWebhookSetting() {
  const input = document.getElementById('makeOrderWebhookSetting');
  if (!input || input.dataset.adminOrderSetting === '1') return;
  input.dataset.adminOrderSetting = '1';
  input.value = loadConfig().makeOrderWebhookUrl || '';
  input.addEventListener('change', () => {
    persistConfig({ makeOrderWebhookUrl: text(input.value) });
    toast('Webhook de pedidos salvo neste navegador.', 'success');
  });
}

function orderNumber(order) {
  return text(order.numero_pedido || order.numero || order.id || order.firebaseKey);
}

function customer(order) {
  return order.cliente && typeof order.cliente === 'object' ? order.cliente : {};
}

function delivery(order) {
  return order.entrega || order.endereco || customer(order).endereco || {};
}

function addressLine(address = {}) {
  if (typeof address === 'string') return text(address);
  return [
    address.endereco_completo || address.enderecoCompleto || address.logradouro || address.rua || address.endereco,
    address.numero || address.casa,
    address.complemento,
    address.bairro,
    address.cidade,
    address.uf || address.estado,
    address.cepFormatado || address.cep,
  ].map(text).filter(Boolean).join(', ');
}

function items(order) {
  return Array.isArray(order.itens) ? order.itens : Array.isArray(order.produtos) ? order.produtos : [];
}

function itemName(item) {
  return text(item.nome || item.produto || item.descricao || item.codigo || 'Produto');
}

function itemQty(item) {
  return Math.max(1, number(item.qtd || item.quantidade || 1));
}

function orderIntegrationStatus(order) {
  return text(order.make_status || order.bling_status || order.status_make || 'pendente');
}

function isProblem(order) {
  const status = normalizeSearch(orderIntegrationStatus(order));
  return !status || status.includes('erro') || status.includes('pendent') || status.includes('fila') || status === 'nao_enviado';
}

function isSent(order) {
  const status = normalizeSearch(orderIntegrationStatus(order));
  return status.includes('enviado') || status.includes('sucesso') || status.includes('criado');
}

function orderTotal(order) {
  const payment = order.pagamento && typeof order.pagamento === 'object' ? order.pagamento : {};
  return number(order.total ?? order.valor_total ?? order.valorTotal ?? order.total_pedido ?? payment.total ?? payment.valor);
}

function labelHtml(order) {
  const client = customer(order);
  const address = delivery(order);
  const phone = text(client.telefoneFormatado || client.telefone_formatado || client.telefone || order.telefoneFormatado || order.telefone || order.whatsapp);
  const payment = text(order.forma_pagamento || order.pagamento?.forma || order.pagamento || 'Nao informado');
  const total = orderTotal(order);
  const reference = text(address.referencia || address.ponto_referencia || order.referencia);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta ${escapeHtml(orderNumber(order))}</title><style>@page{size:100mm 150mm;margin:5mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#000;width:90mm;min-height:140mm}.label{border:2px solid #000;padding:5mm;min-height:132mm}.brand{font-size:12pt;font-weight:900;text-align:center;border-bottom:2px solid #000;padding-bottom:3mm;margin-bottom:5mm}.number{font-size:24pt;font-weight:900}.client{font-size:18pt;font-weight:900;margin-top:5mm}.phone{font-size:16pt;font-weight:800;margin-top:2mm}.address{font-size:14pt;font-weight:800;line-height:1.25;margin-top:5mm}.ref{font-size:11pt;font-weight:700;margin-top:3mm}.meta{display:grid;gap:2mm;margin-top:6mm;font-size:13pt;font-weight:800}.footer{position:fixed;bottom:4mm;left:0;right:0;text-align:center;font-size:9pt;font-weight:700}</style></head><body><section class="label"><div class="brand">DONA ANTONIA - ENTREGA</div><div class="number">PEDIDO #${escapeHtml(orderNumber(order))}</div><div class="client">${escapeHtml(client.nome || order.nome_cliente || order.nome || 'CLIENTE')}</div><div class="phone">${escapeHtml(phone || 'Telefone nao informado')}</div><div class="address">${escapeHtml(addressLine(address) || 'Endereco nao informado')}</div>${reference ? `<div class="ref">Ref.: ${escapeHtml(reference)}</div>` : ''}<div class="meta"><span>Total: ${escapeHtml(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total))}</span><span>Pagamento: ${escapeHtml(payment)}</span></div></section><div class="footer">Sem CPF na etiqueta</div><script>addEventListener('load',()=>setTimeout(()=>print(),180));</script></body></html>`;
}

function printLabel(order) {
  const win = window.open('', '_blank', 'width=500,height=760');
  if (!win) throw new Error('O navegador bloqueou a janela de impressão.');
  win.document.open();
  win.document.write(labelHtml(order));
  win.document.close();
}

async function resendOrder(order, button) {
  const config = loadConfig();
  const url = text(config.makeOrderWebhookUrl);
  if (!url) throw new Error('Informe o webhook de pedidos do Make em Integrações.');
  if (!confirm(`Reenviar o pedido #${orderNumber(order)} ao Make/Bling?`)) return;

  button.disabled = true;
  button.textContent = 'Enviando…';
  const startedAt = new Date().toISOString();
  try {
    const payload = {
      ...order,
      firebaseKey: order.firebaseKey,
      reenvio_admin: true,
      reenvio_id: `admin-${order.firebaseKey}-${Date.now()}`,
      reenvio_em: startedAt,
      origem_reenvio: 'admin-v2',
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json,text/plain,*/*' },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text().catch(() => '');
    if (!response.ok) throw new Error(`Make retornou ${response.status}${responseText ? `: ${responseText.slice(0, 220)}` : ''}`);
    await patchOrder(config, order.firebaseKey, {
      make_status: 'reenviado',
      make_ultimo_reenvio: startedAt,
      make_ultima_resposta: responseText.slice(0, 1000),
      make_reenvio_id: payload.reenvio_id,
    });
    invalidateOrdersCache();
    order.make_status = 'reenviado';
    order.make_ultimo_reenvio = startedAt;
    toast(`Pedido #${orderNumber(order)} reenviado ao Make.`, 'success');
  } catch (error) {
    await patchOrder(config, order.firebaseKey, {
      make_status: 'erro_reenvio',
      make_ultimo_reenvio: startedAt,
      make_ultimo_erro: text(error?.message || error).slice(0, 1000),
    }).catch(() => {});
    invalidateOrdersCache();
    throw error;
  } finally {
    button.disabled = false;
    button.textContent = 'Reenviar Make/Bling';
  }
}

function start() {
  installOrderWebhookSetting();
  const view = document.querySelector('[data-view="order-tools"]');
  if (!view || document.getElementById('orderToolsPanel')) return;

  const panel = document.createElement('section');
  panel.className = 'panel suite-panel';
  panel.id = 'orderToolsPanel';
  panel.innerHTML = `<div class="panel-header"><div><span class="eyebrow">Contingência leve</span><h2>Make, Bling e etiquetas</h2><p>Consulta limitada aos pedidos mais recentes. Reenvio e impressão são processados apenas quando solicitados.</p></div><div class="suite-actions"><span class="badge info" data-order-tools-status>Preparando…</span><button class="button secondary" type="button" data-order-tools-reload>Atualizar</button></div></div><div class="suite-toolbar"><div class="search-field"><span>⌕</span><input type="search" placeholder="Pedido, cliente, telefone ou erro" autocomplete="off" data-order-tools-search></div><select data-order-tools-filter><option value="problem">Com erro ou pendentes</option><option value="all">Todos os recentes</option><option value="sent">Enviados</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Make/Bling</th><th>Atualização</th><th></th></tr></thead><tbody data-order-tools-rows><tr><td colspan="5">Preparando lista…</td></tr></tbody></table></div><div class="table-summary"><span data-order-tools-summary>Carregamento limitado a ${CONTINGENCY_LIMIT} pedidos.</span></div>`;
  view.appendChild(panel);

  let orders = [];
  let searchTimer = null;
  let loading = false;

  const render = () => {
    const query = normalizeSearch(panel.querySelector('[data-order-tools-search]').value);
    const filter = panel.querySelector('[data-order-tools-filter]').value;
    const filtered = orders.filter(order => {
      const matchesFilter = filter === 'all' || (filter === 'problem' && isProblem(order)) || (filter === 'sent' && isSent(order));
      const client = customer(order);
      const matchesQuery = !query || normalizeSearch([
        orderNumber(order), client.nome, client.telefone, order.make_ultimo_erro, order.bling_erro,
      ].join(' ')).includes(query);
      return matchesFilter && matchesQuery;
    });
    const visible = filtered.slice(0, VISIBLE_LIMIT);
    panel.querySelector('[data-order-tools-summary]').textContent = `${filtered.length} resultado(s) · mostrando até ${VISIBLE_LIMIT} · ${orders.length} pedido(s) carregado(s)`;
    panel.querySelector('[data-order-tools-rows]').innerHTML = visible.length ? visible.map(order => {
      const client = customer(order);
      const status = orderIntegrationStatus(order);
      const failed = isProblem(order);
      return `<tr><td><strong>#${escapeHtml(orderNumber(order))}</strong><small>${items(order).length} item(ns)</small></td><td><strong>${escapeHtml(client.nome || order.nome_cliente || 'Cliente')}</strong><small>${escapeHtml(client.telefone || order.telefone || '')}</small></td><td><span class="badge ${failed ? 'warning' : 'success'}">${escapeHtml(status)}</span><small>${escapeHtml(order.make_ultimo_erro || order.bling_erro || '')}</small></td><td>${escapeHtml(order.make_ultimo_reenvio || order.atualizado_em || order.criado_em || '')}</td><td><div class="suite-actions"><button class="row-action" type="button" data-order-resend="${escapeHtml(order.firebaseKey)}">Reenviar Make/Bling</button><button class="row-action" type="button" data-order-label="${escapeHtml(order.firebaseKey)}">Etiqueta</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty-state">Nenhum pedido corresponde ao filtro.</td></tr>';
  };

  const reload = async ({ force = false } = {}) => {
    if (loading) return;
    loading = true;
    panel.setAttribute('aria-busy', 'true');
    const rows = panel.querySelector('[data-order-tools-rows]');
    const status = panel.querySelector('[data-order-tools-status]');
    rows.innerHTML = '<tr><td colspan="5">Carregando uma lista reduzida de pedidos…</td></tr>';
    status.className = 'badge warning';
    status.textContent = 'Carregando…';
    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (force) invalidateOrdersCache();
      const result = await loadRecentOrders(loadConfig(), { limit: CONTINGENCY_LIMIT, force });
      orders = result.orders.slice(0, CONTINGENCY_LIMIT);
      status.className = 'badge success';
      status.textContent = `${orders.length} recentes`;
      render();
    } catch (error) {
      status.className = 'badge danger';
      status.textContent = 'Falha';
      rows.innerHTML = `<tr><td colspan="5">${escapeHtml(error?.message || String(error))}</td></tr>`;
    } finally {
      loading = false;
      panel.removeAttribute('aria-busy');
    }
  };

  panel.querySelector('[data-order-tools-reload]').addEventListener('click', () => reload({ force: true }));
  panel.querySelector('[data-order-tools-search]').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 180);
  });
  panel.querySelector('[data-order-tools-filter]').addEventListener('change', render);
  panel.querySelector('[data-order-tools-rows]').addEventListener('click', async event => {
    const resend = event.target.closest('[data-order-resend]');
    const label = event.target.closest('[data-order-label]');
    const key = resend?.dataset.orderResend || label?.dataset.orderLabel;
    const order = orders.find(row => String(row.firebaseKey) === String(key));
    if (!order) return;
    try {
      if (resend) {
        await resendOrder(order, resend);
        render();
      }
      if (label) printLabel(order);
    } catch (error) {
      toast(error?.message || String(error), 'error');
    }
  });

  window.dispatchEvent(new CustomEvent('admin-v2-route-ready', { detail: { route: 'order-tools' } }));
  setTimeout(() => reload(), 40);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
