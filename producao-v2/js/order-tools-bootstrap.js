import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { escapeHtml, normalizeSearch, number, text } from './core/utils.js';
import { loadOrders, patchOrder } from './services/firebase.js';

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
    updateOfficialLabels();
  });
}

function updateOfficialLabels() {
  const config = loadConfig();
  document.querySelectorAll('#systemList .system-row').forEach(row => {
    const label = row.querySelector('strong');
    const help = row.querySelector('small');
    if (!label || !help) return;
    if (label.textContent === 'Gravações da V2') {
      label.textContent = 'Gravações do Admin';
      help.textContent = config.writeMode ? 'Ativadas para operação oficial' : 'Bloqueadas neste navegador';
    }
    if (label.textContent === 'Última publicação V2') label.textContent = 'Última publicação';
    if (label.textContent === 'Admin atual') help.textContent = 'producao/ abre o Admin oficial';
  });
  document.querySelectorAll('#diagnosticList .system-row').forEach(row => {
    const label = row.querySelector('strong');
    const help = row.querySelector('small');
    const badge = row.querySelector('.badge');
    if (!label || !help) return;
    if (label.textContent === 'Automações Make') {
      const channels = [
        config.makeTextWebhookUrl || config.makeAiWebhookUrl,
        config.makeImageWebhookUrl || config.makeAiWebhookUrl,
        config.makeInstagramKitWebhookUrl,
        config.makeOrderWebhookUrl,
      ].filter(Boolean).length;
      help.textContent = channels ? `${channels} de 4 canais configurados` : 'Nenhum webhook configurado';
      if (badge) {
        badge.className = `badge ${channels === 4 ? 'success' : 'warning'}`;
        badge.textContent = channels === 4 ? 'OK' : 'Atenção';
      }
    }
    if (label.textContent === 'Modo de gravação') {
      help.textContent = config.writeMode ? 'Ativado para operação oficial' : 'Bloqueado';
      if (badge) {
        badge.className = `badge ${config.writeMode ? 'success' : 'warning'}`;
        badge.textContent = config.writeMode ? 'OK' : 'Atenção';
      }
    }
  });
}

function installLabelObserver() {
  if (window.__adminOfficialLabelObserver) return;
  window.__adminOfficialLabelObserver = true;
  const observer = new MutationObserver(() => updateOfficialLabels());
  ['systemList', 'diagnosticList'].forEach(id => {
    const node = document.getElementById(id);
    if (node) observer.observe(node, { childList: true, subtree: true });
  });
  updateOfficialLabels();
}

function orderNumber(order) { return text(order.numero_pedido || order.numero || order.id || order.firebaseKey); }
function customer(order) { return order.cliente || {}; }
function delivery(order) { return order.entrega || order.endereco || customer(order).endereco || {}; }
function items(order) { return Array.isArray(order.itens) ? order.itens : Array.isArray(order.produtos) ? order.produtos : []; }
function itemName(item) { return text(item.nome || item.produto || item.descricao || item.codigo || 'Produto'); }
function itemQty(item) { return Math.max(1, number(item.qtd || item.quantidade || 1)); }

function labelHtml(order) {
  const client = customer(order);
  const address = delivery(order);
  const phone = text(client.telefone || order.telefone || order.whatsapp);
  const missing = items(order).filter(item => item.faltante === true || item.status === 'faltante' || item.separado === false);
  const regular = items(order).filter(item => !missing.includes(item));
  const rows = list => list.map(item => `<li><strong>${itemQty(item)}×</strong> ${escapeHtml(itemName(item))}</li>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta ${escapeHtml(orderNumber(order))}</title><style>@page{size:100mm 150mm;margin:4mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#000;width:92mm;min-height:142mm}.head{border:2px solid #000;padding:4mm;margin-bottom:3mm}.number{font-size:23pt;font-weight:900}.client{font-size:18pt;font-weight:900;margin-top:2mm}.phone{font-size:16pt;font-weight:800}.address{font-size:13pt;font-weight:700;line-height:1.25;margin-top:2mm}.meta{display:flex;gap:4mm;font-size:10pt;margin-top:2mm}.items{columns:2;column-gap:5mm;padding-left:5mm;margin:2mm 0;font-size:10.5pt}.items li{break-inside:avoid;margin:0 0 1.5mm}.missing{border-top:2px solid #000;margin-top:3mm;padding-top:2mm}.missing h2{font-size:12pt;margin:0 0 1mm}.missing ul{padding-left:5mm;font-size:10pt;margin:0}.footer{position:fixed;bottom:2mm;left:0;right:0;text-align:center;font-size:8pt}</style></head><body><section class="head"><div class="number">PEDIDO #${escapeHtml(orderNumber(order))}</div><div class="client">${escapeHtml(client.nome || order.nome_cliente || order.nome || 'CLIENTE')}</div><div class="phone">${escapeHtml(phone)}</div><div class="address">${escapeHtml([address.logradouro || address.rua, address.numero, address.complemento, address.bairro, address.cidade].filter(Boolean).join(', '))}</div><div class="meta"><span>${escapeHtml(order.agendamento || address.agendamento || '')}</span><span>${escapeHtml(order.forma_pagamento || order.pagamento?.forma || order.pagamento || '')}</span></div></section><h2 style="font-size:12pt;margin:0">PRODUTOS</h2><ol class="items">${rows(regular)}</ol>${missing.length ? `<section class="missing"><h2>FALTANTES</h2><ul>${rows(missing)}</ul></section>` : ''}<div class="footer">Dona Antônia · Conferir antes da saída</div><script>addEventListener('load',()=>setTimeout(()=>print(),180));</script></body></html>`;
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
  if (!url) throw new Error('Informe o webhook de pedidos do Make nas configurações.');
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
    order.make_status = 'reenviado';
    order.make_ultimo_reenvio = startedAt;
    toast(`Pedido #${orderNumber(order)} reenviado ao Make.`, 'success');
  } catch (error) {
    await patchOrder(config, order.firebaseKey, {
      make_status: 'erro_reenvio',
      make_ultimo_reenvio: startedAt,
      make_ultimo_erro: text(error?.message || error).slice(0, 1000),
    }).catch(() => {});
    throw error;
  } finally {
    button.disabled = false;
    button.textContent = 'Reenviar Make/Bling';
  }
}

function start() {
  installOrderWebhookSetting();
  installLabelObserver();
  const operations = document.querySelector('[data-view="operations"]');
  if (!operations || document.getElementById('orderToolsPanel')) return;
  const panel = document.createElement('section');
  panel.className = 'panel suite-panel';
  panel.id = 'orderToolsPanel';
  panel.innerHTML = `<div class="panel-header"><div><span class="eyebrow">Contingência</span><h2>Make, Bling e etiquetas</h2><p>Reenvie pedidos com erro e imprima etiquetas de separação 100 × 150 mm.</p></div><button class="button secondary" type="button" data-order-tools-reload>Atualizar</button></div><div class="suite-toolbar"><div class="search-field"><span>⌕</span><input type="search" placeholder="Pedido, cliente, telefone ou erro" data-order-tools-search></div><select data-order-tools-filter><option value="problem">Com erro ou pendentes</option><option value="all">Todos</option><option value="sent">Enviados</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Make/Bling</th><th>Atualização</th><th></th></tr></thead><tbody data-order-tools-rows></tbody></table></div>`;
  operations.appendChild(panel);
  let orders = [];

  const render = () => {
    const query = normalizeSearch(panel.querySelector('[data-order-tools-search]').value);
    const filter = panel.querySelector('[data-order-tools-filter]').value;
    const visible = orders.map((order, index) => ({ order, index })).filter(({ order }) => {
      const status = normalizeSearch(order.make_status || order.bling_status || order.status_make || 'pendente');
      const problem = !status || status.includes('erro') || status.includes('pendent') || status.includes('fila') || status === 'nao_enviado';
      const sent = status.includes('enviado') || status.includes('sucesso') || status.includes('criado');
      const matchesFilter = filter === 'all' || (filter === 'problem' && problem) || (filter === 'sent' && sent);
      const client = customer(order);
      const matchesQuery = !query || normalizeSearch([orderNumber(order), client.nome, client.telefone, order.make_ultimo_erro, order.bling_erro].join(' ')).includes(query);
      return matchesFilter && matchesQuery;
    }).slice(0, 200);
    panel.querySelector('[data-order-tools-rows]').innerHTML = visible.length ? visible.map(({ order, index }) => {
      const client = customer(order);
      const status = text(order.make_status || order.bling_status || order.status_make || 'Pendente');
      const failed = normalizeSearch(status).includes('erro') || normalizeSearch(status).includes('pendent');
      return `<tr><td><strong>#${escapeHtml(orderNumber(order))}</strong><small>${items(order).length} item(ns)</small></td><td><strong>${escapeHtml(client.nome || order.nome_cliente || 'Cliente')}</strong><small>${escapeHtml(client.telefone || order.telefone || '')}</small></td><td><span class="badge ${failed ? 'warning' : 'success'}">${escapeHtml(status)}</span><small>${escapeHtml(order.make_ultimo_erro || order.bling_erro || '')}</small></td><td>${escapeHtml(order.make_ultimo_reenvio || order.atualizado_em || order.criado_em || '')}</td><td><div class="suite-actions"><button class="row-action" type="button" data-order-resend="${index}">Reenviar Make/Bling</button><button class="row-action" type="button" data-order-label="${index}">Etiqueta</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty-state">Nenhum pedido corresponde ao filtro.</td></tr>';
  };

  const reload = async () => {
    const rows = panel.querySelector('[data-order-tools-rows]');
    rows.innerHTML = '<tr><td colspan="5">Carregando…</td></tr>';
    try { orders = await loadOrders(loadConfig(), 500); render(); }
    catch (error) { rows.innerHTML = `<tr><td colspan="5">${escapeHtml(error?.message || String(error))}</td></tr>`; }
  };

  panel.querySelector('[data-order-tools-reload]').addEventListener('click', reload);
  panel.querySelector('[data-order-tools-search]').addEventListener('input', render);
  panel.querySelector('[data-order-tools-filter]').addEventListener('change', render);
  panel.querySelector('[data-order-tools-rows]').addEventListener('click', async event => {
    const resend = event.target.closest('[data-order-resend]');
    const label = event.target.closest('[data-order-label]');
    try {
      if (resend) { await resendOrder(orders[Number(resend.dataset.orderResend)], resend); render(); }
      if (label) printLabel(orders[Number(label.dataset.orderLabel)]);
    } catch (error) { toast(error?.message || String(error), 'error'); }
  });
  reload();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
