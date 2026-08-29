import {
  FIREBASE_BASE, MUG_NODES, ORDER_STAGES, PAYMENT_STATES, text, norm, dateTime, isMug, mugArt,
  normalizeOrder, fbGet, fbWrite, audit, buildPrintJob, sourceLabel, sourceCode, nowIso, safeKey
} from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, invalidateMugs, storeDiagnostics } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260829-admin-canecas-core-v2';
const SETTINGS_KEY = 'da_admin_canecas_settings_v1';
const ROUTES = {
  dashboard: ['Início', 'Prioridades e estado da operação de canecas.'],
  orders: ['Pedidos', 'Venda, pagamento, produção, Bling e expedição.'],
  creations: ['Criações', 'Artes dos clientes e o gerador oficial compartilhado.'],
  mugs: ['Canecas', 'Cadastro mestre e integração com Loja Integrada.'],
  banners: ['Banners IA', 'Criação inteligente nos formatos da Loja Integrada.'],
  print: ['Impressão', 'Fila única de Dona Antônia e CanecaFácil.'],
  settings: ['Configurações', 'Integrações e parâmetros da operação.']
};
const state = {
  route: 'dashboard', mugs: [], orders: [], creations: [], printJobs: [], legacyOrders: [],
  loading: new Set(), loaded: new Set(), creationMode: 'list', search: { orders: '', creations: '' }, legacyLoadedAt: 0
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const productKey = p => text(p?.firebaseKey || p?.id || p?.__key);
const settings = () => { try { return { ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return {}; } };
const saveSettings = v => localStorage.setItem(SETTINGS_KEY, JSON.stringify(v));

function toast(message, error = false) {
  const el = $('#toast'); if (!el) return alert(message);
  el.textContent = message; el.className = `toast${error ? ' error' : ''}`; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, error ? 5200 : 2800);
}
function setFirebase(message, good = false, bad = false) {
  if ($('#firebaseStatus')) $('#firebaseStatus').textContent = message;
  if ($('#firebaseDot')) $('#firebaseDot').className = good ? 'good' : bad ? 'bad' : '';
}
function sourceBadge(origin) { const cf = sourceCode(origin) === 'canecafacil'; return `<span class="badge ${cf ? 'cf' : 'da'}">${cf ? 'CANECAFÁCIL' : 'DONA ANTÔNIA'}</span>`; }
function stageLabel(v) { return ORDER_STAGES.find(([k]) => k === v)?.[1] || v || 'Novo'; }
function payLabel(v) { return PAYMENT_STATES.find(([k]) => k === v)?.[1] || v || 'Pendente'; }
function creationById(id) { return state.creations.find(c => text(c.id || c.__key) === text(id)); }
function productByAny(item = {}) {
  const key = text(item.firebaseKey || item.product_key || item.produto_key), code = norm(item.codigo || item.sku), name = norm(item.nome);
  return state.mugs.find(p => (key && productKey(p) === key) || (code && norm(p.codigo || p.sku) === code) || (name && norm(p.nome) === name));
}
function orderArt(order, item = {}) {
  const creation = creationById(order.criacao_id || item.criacao_id || item.codigo_criacao);
  return mugArt(item) || mugArt(creation) || mugArt(order) || mugArt(productByAny(item) || {});
}
function mugItems(order) {
  const raw = Array.isArray(order.itens) ? order.itens : [];
  const items = raw.filter(i => isMug(i) || isMug(productByAny(i) || {}) || Boolean(orderArt(order, i)));
  if (items.length) return items;
  const creation = creationById(order.criacao_id);
  return creation ? [{ id: creation.id, nome: creation.modelo_nome || 'Caneca personalizada', quantidade: order.quantidade || 1, arte_horizontal: mugArt(creation), criacao_id: creation.id }] : [];
}
function legacyMugItems(order) { return (Array.isArray(order.itens) ? order.itens : []).filter(i => isMug(i) || isMug(productByAny(i) || {})); }

async function loadMugData(force = false) {
  if (!force && state.loaded.has('mugs')) return;
  state.mugs = await loadMugs({ force }); state.loaded.add('mugs');
}
async function loadOrders(force = false) {
  if (!force && state.loaded.has('orders')) return;
  const data = await fbGet(MUG_NODES.orders); state.orders = Object.entries(data || {}).map(([id, v]) => normalizeOrder(id, v || {})).sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)); state.loaded.add('orders');
}
async function loadCreations(force = false) {
  if (!force && state.loaded.has('creations')) return;
  const data = await fbGet(MUG_NODES.creations); state.creations = Object.entries(data || {}).map(([__key, v]) => ({ __key, id: v?.id || __key, ...(v || {}) })).sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0)); state.loaded.add('creations');
}
async function loadPrintJobs(force = false) {
  if (!force && state.loaded.has('print')) return;
  const data = await fbGet(MUG_NODES.printJobs); state.printJobs = Object.entries(data || {}).map(([__key, v]) => ({ __key, id: v?.id || __key, ...(v || {}) })).sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0)); state.loaded.add('print');
}
async function loadLegacy(force = false) {
  if (!force && state.legacyLoadedAt && Date.now() - state.legacyLoadedAt < 120000) return;
  try {
    const u = new URL(`${FIREBASE_BASE}/pedidos.json`); u.searchParams.set('orderBy', JSON.stringify('$key')); u.searchParams.set('limitToLast', '180'); u.searchParams.set('_', Date.now());
    const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(`Firebase ${r.status}`);
    const data = await r.json();
    state.legacyOrders = Object.entries(data || {}).map(([id, v]) => normalizeOrder(id, { ...(v || {}), origem: v?.origem || 'dona_antonia', __legacy: true })).filter(o => legacyMugItems(o).length).sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
    state.legacyLoadedAt = Date.now();
  } catch (e) { console.warn('[Admin Canecas] pedidos legados não carregados:', e); state.legacyOrders = []; }
}
async function ensureRouteData(route, force = false) {
  if (state.loading.has(route)) return;
  state.loading.add(route); setFirebase('Carregando…');
  try {
    if (route === 'dashboard') await Promise.all([loadMugData(force), loadOrders(force), loadCreations(force), loadPrintJobs(force)]);
    else if (route === 'orders') { await Promise.all([loadMugData(force), loadOrders(force), loadCreations(force)]); await loadLegacy(force); }
    else if (route === 'creations') await Promise.all([loadMugData(force), loadCreations(force)]);
    else if (route === 'print') await loadPrintJobs(force);
    setFirebase('Conectado', true); renderRoute(route);
  } catch (e) { console.error(e); setFirebase(`Erro ${e.message || e}`, false, true); toast(`Falha ao carregar: ${e.message || e}`, true); }
  finally { state.loading.delete(route); }
}

function emitRoute(route, force = false) { window.dispatchEvent(new CustomEvent('admin-canecas:route', { detail: { route, force, build: BUILD } })); }
function navigate(route, { replace = false, force = false } = {}) {
  if (!ROUTES[route]) route = 'dashboard'; state.route = route;
  $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === route));
  $$('#nav [data-route]').forEach(b => b.classList.toggle('active', b.dataset.route === route));
  if ($('#pageTitle')) $('#pageTitle').textContent = ROUTES[route][0]; if ($('#pageSubtitle')) $('#pageSubtitle').textContent = ROUTES[route][1];
  const hash = `#${route}`; if (location.hash !== hash) { if (replace) history.replaceState(null, '', hash); else history.pushState(null, '', hash); }
  $('#sidebar')?.classList.remove('open'); renderRoute(route); emitRoute(route, force); ensureRouteData(route, force);
}
function renderRoute(route) {
  if (route === 'dashboard') renderDashboard();
  else if (route === 'orders') renderOrders();
  else if (route === 'creations') renderCreations();
  else if (route === 'mugs') { if (!$('#mugs')?.children.length) $('#mugs').innerHTML = '<div class="notice">Carregando catálogo de canecas…</div>'; }
  else if (route === 'banners') { if (!$('#banners')?.children.length) $('#banners').innerHTML = '<div class="notice">Carregando Banners IA…</div>'; }
  else if (route === 'print') renderPrint();
  else if (route === 'settings') renderSettings();
}
function priorityButton(label, count, route) { return `<button data-go="${route}"><div><b>${esc(label)}</b><span>${count ? `${count} item(ns)` : 'Nenhuma pendência'}</span></div><strong>${count}</strong></button>`; }
function renderDashboard() {
  const pending = state.orders.filter(o => !['entregue', 'cancelado'].includes(o.status));
  const paid = state.orders.filter(o => o.pagamento?.status === 'pago' && !['entregue', 'cancelado'].includes(o.status));
  const waitingPrint = state.printJobs.filter(j => ['aguardando', 'reimpressao'].includes(text(j.status)));
  const errors = state.orders.filter(o => o.bling?.status === 'erro' || o.nfe?.status === 'erro' || o.melhor_envio?.status === 'erro');
  const newCreations = state.creations.filter(c => !['encomendou', 'arquivado'].includes(norm(c.atendimento_status || c.status)));
  $('#dashboard').innerHTML = `<div class="metrics"><div class="metric"><strong>${pending.length}</strong><span>Pedidos em andamento</span></div><div class="metric"><strong>${paid.length}</strong><span>Pagos</span></div><div class="metric"><strong>${waitingPrint.length}</strong><span>Aguardando impressão</span></div><div class="metric ${errors.length ? 'attn' : ''}"><strong>${errors.length}</strong><span>Integrações com erro</span></div></div><div class="grid2"><section class="panel"><div class="panel-head"><div><h2>Prioridades</h2><p>O que precisa de ação.</p></div></div><div class="panel-body priority">${priorityButton('Novas criações', newCreations.length, 'creations')}${priorityButton('Aguardando pagamento', state.orders.filter(o => o.pagamento?.status !== 'pago' && !['cancelado', 'entregue'].includes(o.status)).length, 'orders')}${priorityButton('Pagos sem fila', paid.filter(o => !state.printJobs.some(j => j.pedido_id === o.id)).length, 'orders')}${priorityButton('Fila de impressão', waitingPrint.length, 'print')}${priorityButton('Erros de integração', errors.length, 'orders')}</div></section><section class="panel"><div class="panel-head"><div><h2>Base de canecas</h2><p>Consulta indexada, sem ler /produtos inteiro.</p></div></div><div class="panel-body"><div class="notice"><b>${state.mugs.length} caneca(s)</b> carregadas em uma única consulta por categoria.<br><br>O catálogo da Loja Integrada e os Banners IA reutilizam este mesmo escopo.</div><div class="mini-actions" style="margin-top:10px"><button class="secondary" data-go="mugs">Ver canecas</button><a class="secondary" href="../producao-v2/admin-produtivo.html#products" target="_blank">Abrir Produção</a></div></div></section></div>`;
  $$('[data-go]', $('#dashboard')).forEach(b => b.onclick = () => navigate(b.dataset.go));
}

function allOrders() { const map = new Map(state.orders.map(o => [o.id, o])); state.legacyOrders.forEach(o => { if (!map.has(o.id)) map.set(o.id, o); }); return [...map.values()].sort((a, b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0)); }
function renderOrders() {
  const q = norm(state.search.orders), rows = allOrders().filter(o => !q || norm(`${o.id} ${o.cliente?.nome} ${o.cliente?.telefone} ${sourceLabel(o.origem)} ${o.status}`).includes(q));
  $('#orders').innerHTML = `<div class="toolbar"><input id="orderSearch" type="search" placeholder="Buscar pedido, cliente, telefone…" value="${esc(state.search.orders)}"><select id="orderFilter"><option value="">Todos os status</option>${ORDER_STAGES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="secondary" id="newOrder">Novo pedido</button></div><section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Origem</th><th>Pedido</th><th>Cliente</th><th>Status</th><th>Pagamento</th><th>Itens</th><th>Data</th></tr></thead><tbody>${rows.map(orderRow).join('') || '<tr><td colspan="7" class="empty">Nenhum pedido de caneca.</td></tr>'}</tbody></table></div></section>`;
  $('#orderSearch').oninput = e => { state.search.orders = e.target.value; renderOrders(); };
  $('#orderFilter').onchange = e => $$('#orders tbody tr[data-order]').forEach(tr => tr.hidden = e.target.value && tr.dataset.status !== e.target.value);
  $('#newOrder').onclick = () => openOrderDrawer(normalizeOrder(`MAN-${Date.now().toString(36).toUpperCase()}`, { origem: 'dona_antonia', status: 'novo', itens: [], cliente: {}, pagamento: { status: 'pendente' }, __new: true }));
  $$('[data-order]', $('#orders')).forEach(tr => tr.onclick = () => openOrderDrawer(allOrders().find(o => o.id === tr.dataset.order)));
}
function orderRow(o) { return `<tr data-order="${esc(o.id)}" data-status="${esc(o.status)}"><td>${sourceBadge(o.origem)}${o.__legacy ? '<div><small>pedido geral</small></div>' : ''}</td><td><strong>${esc(o.id)}</strong></td><td>${esc(o.cliente?.nome || '—')}<br><small>${esc(o.cliente?.telefone || '')}</small></td><td><span class="badge ${o.status === 'cancelado' ? 'bad' : o.status === 'entregue' ? 'good' : ''}">${esc(stageLabel(o.status))}</span></td><td><span class="badge ${o.pagamento?.status === 'pago' ? 'good' : 'warn'}">${esc(payLabel(o.pagamento?.status))}</span></td><td>${mugItems(o).length || legacyMugItems(o).length}</td><td>${esc(dateTime(o.criado_em))}</td></tr>`; }
function openDrawer(html, detail = {}) { $('#drawerContent').innerHTML = html; $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#overlay').hidden = false; window.dispatchEvent(new CustomEvent('admin-canecas:drawer', { detail })); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#overlay').hidden = true; }
function openOrderDrawer(order) {
  if (!order) return; const legacy = order.__legacy === true, items = legacy ? legacyMugItems(order) : mugItems(order), cfg = settings();
  const phone = (order.cliente?.telefone || '').replace(/\D/g, ''), wa = phone ? `https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}` : '';
  openDrawer(`<h2>${esc(order.id)}</h2><div class="subtitle">${sourceBadge(order.origem)} · ${esc(dateTime(order.criado_em))}${legacy ? ' · pedido geral Dona Antônia' : ''}</div><div class="form"><label>Status<select id="odStatus">${ORDER_STAGES.map(([k, l]) => `<option value="${k}" ${k === order.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Pagamento<select id="odPayment">${PAYMENT_STATES.map(([k, l]) => `<option value="${k}" ${k === order.pagamento?.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Nome<input id="odName" value="${esc(order.cliente?.nome)}"></label><label>WhatsApp<input id="odPhone" value="${esc(order.cliente?.telefone)}"></label><label>E-mail<input id="odEmail" value="${esc(order.cliente?.email)}"></label><label>CPF<input id="odCpf" value="${esc(order.cliente?.cpf)}"></label></div><div class="form-section"><h3>Entrega</h3><div class="form"><label>CEP<input id="odCep" value="${esc(order.entrega?.cep)}"></label><label>Cidade<input id="odCity" value="${esc(order.entrega?.cidade)}"></label><label class="span2">Endereço<input id="odStreet" value="${esc(order.entrega?.endereco || order.entrega?.logradouro)}"></label><label>Número<input id="odNumber" value="${esc(order.entrega?.numero)}"></label><label>UF<input id="odUf" value="${esc(order.entrega?.uf)}"></label><label>Frete R$<input id="odFreight" type="number" step="0.01" value="${esc(order.entrega?.valor || order.frete_valor || '')}"></label><label>Serviço<input id="odService" value="${esc(order.entrega?.servico || '')}"></label></div></div><div class="form-section"><h3>Canecas do pedido</h3>${items.length ? items.map(it => `<div class="notice" style="margin-bottom:7px"><b>${Math.max(1, Number(it.quantidade || it.qtd || 1))}× ${esc(it.nome || productByAny(it)?.nome || 'Caneca')}</b><br>${orderArt(order, it) ? `Arte pronta · ${esc(it.arte_versao || order.arte_versao || 'v1')}` : '<span style="color:#9d302d">Arte de impressão não localizada</span>'}</div>`).join('') : '<div class="notice warn">Nenhum item de caneca identificado.</div>'}</div><div class="form-section"><h3>Integrações</h3><div class="notice">Bling: <b>${esc(order.bling?.status || 'não enviado')}</b> · NF-e: <b>${esc(order.nfe?.status || 'não emitida')}</b> · Melhor Envio: <b>${esc(order.melhor_envio?.status || 'não iniciado')}</b></div></div><div class="drawer-actions">${legacy ? '<button class="secondary" id="odImport">Importar para Admin Canecas</button>' : '<button class="primary" id="odSave">Salvar pedido</button>'}<button class="secondary" id="odPaid">Confirmar pagamento + fila</button><button class="secondary" id="odCadastro">Copiar link de cadastro</button>${wa ? `<a class="secondary" target="_blank" href="${wa}">WhatsApp</a>` : ''}${cfg.blingWebhook && !legacy ? '<button class="secondary" id="odBling">Enviar ao Bling</button>' : ''}${cfg.shippingWebhook && !legacy ? '<button class="secondary" id="odShip">Preparar envio</button>' : ''}</div>`, { kind: 'order', id: order.id });
  if (legacy) $('#odImport').onclick = () => importLegacy(order); else $('#odSave').onclick = () => saveOrder(order);
  $('#odPaid').onclick = () => markPaidAndQueue(order); $('#odCadastro').onclick = () => copyRegistrationLink(order);
  if ($('#odBling')) $('#odBling').onclick = () => callIntegration('bling', order, cfg.blingWebhook); if ($('#odShip')) $('#odShip').onclick = () => callIntegration('shipping', order, cfg.shippingWebhook);
}
function orderPatchFromDrawer(order) { return { status: $('#odStatus').value, status_comercial: $('#odStatus').value, cliente: { ...(order.cliente || {}), nome: text($('#odName').value), telefone: text($('#odPhone').value), whatsapp: text($('#odPhone').value), email: text($('#odEmail').value), cpf: text($('#odCpf').value) }, entrega: { ...(order.entrega || {}), cep: text($('#odCep').value), cidade: text($('#odCity').value), endereco: text($('#odStreet').value), numero: text($('#odNumber').value), uf: text($('#odUf').value), valor: Number($('#odFreight').value || 0), servico: text($('#odService').value) }, pagamento: { ...(order.pagamento || {}), status: $('#odPayment').value }, atualizado_em: nowIso(), updated_at: nowIso() }; }
async function refreshOrders() { state.loaded.delete('orders'); state.legacyLoadedAt = 0; await ensureRouteData('orders', true); }
async function saveOrder(order) { try { const path = `${MUG_NODES.orders}/${safeKey(order.id)}`, patch = orderPatchFromDrawer(order); if (order.__new) { patch.id = order.id; patch.origem = sourceCode(order.origem); patch.criado_em = nowIso(); await fbWrite(path, patch, 'PUT'); } else await fbWrite(path, patch); await audit('pedido_salvo', { pedido_id: order.id }); toast('Pedido salvo.'); closeDrawer(); await refreshOrders(); } catch (e) { toast(e.message || e, true); } }
async function importLegacy(order) { try { const copy = { ...order, id: order.id, origem: 'dona_antonia', status: order.status || 'novo', importado_de: 'pedidos', importado_em: nowIso() }; delete copy.__legacy; await fbWrite(`${MUG_NODES.orders}/${safeKey(order.id)}`, copy, 'PUT'); toast('Pedido importado.'); closeDrawer(); await refreshOrders(); } catch (e) { toast(e.message || e, true); } }
async function markPaidAndQueue(order) { try { if (order.__legacy) { await importLegacy(order); order = { ...order, __legacy: false }; } const current = state.orders.find(o => o.id === order.id) || order, items = mugItems(current); if (!items.length) throw new Error('Nenhuma caneca identificada neste pedido.'); const jobs = items.map((it, i) => buildPrintJob({ ...current, pagamento: { ...(current.pagamento || {}), status: 'pago' } }, { ...it, arte_horizontal: orderArt(current, it) }, i)); if (jobs.some(j => !j.arte_aprovada.url)) throw new Error('Existe caneca sem arte horizontal aprovada.'); await fbWrite(`${MUG_NODES.orders}/${safeKey(current.id)}`, { pagamento: { ...(current.pagamento || {}), status: 'pago', confirmado_em: nowIso() }, pagamento_status: 'pago', status: 'pago', status_comercial: 'pago', atualizado_em: nowIso() }); await Promise.all(jobs.map(j => fbWrite(`${MUG_NODES.printJobs}/${safeKey(j.id)}`, j, 'PUT'))); await audit('pagamento_confirmado_fila_criada', { pedido_id: current.id, jobs: jobs.map(j => j.id) }); toast(`${jobs.length} trabalho(s) enviado(s) para impressão.`); closeDrawer(); state.loaded.delete('print'); await refreshOrders(); } catch (e) { toast(e.message || e, true); } }
async function callIntegration(kind, order, url) { try { const payload = { source: BUILD, action: kind, pedido_id: order.id, order }; const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const raw = await r.text(); if (!r.ok) throw new Error(`HTTP ${r.status} ${raw.slice(0, 120)}`); const node = kind === 'bling' ? 'bling' : 'melhor_envio'; await fbWrite(`${MUG_NODES.orders}/${safeKey(order.id)}/${node}`, { status: 'solicitado', solicitado_em: nowIso(), resposta: raw.slice(0, 800) }); toast(kind === 'bling' ? 'Envio ao Bling solicitado.' : 'Preparação de envio solicitada.'); await refreshOrders(); } catch (e) { toast(`Integração falhou: ${e.message || e}`, true); } }
async function copyRegistrationLink(order) { try { const path = `${MUG_NODES.orders}/${safeKey(order.id)}`, remote = order.__new ? order : (await fbGet(path).catch(() => order)) || order; let url = text(remote.cadastro_url); if (!url) { const token = (crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/-/g, ''); const root = location.origin + location.pathname.replace(/\/admin-canecas\/?$/, ''); url = `${root}/canecafacil/cadastro.html?pedido=${encodeURIComponent(order.id)}&token=${encodeURIComponent(token)}`; await fbWrite(path, { cadastro_token: token, cadastro_url: url, cadastro_status: 'pendente', atualizado_em: nowIso() }); } await navigator.clipboard.writeText(url); toast('Link de cadastro copiado.'); } catch (e) { toast(`Não foi possível copiar o link: ${e.message || e}`, true); } }

function renderCreations() { if (state.creationMode === 'generator') return renderGenerator(); const q = norm(state.search.creations), list = state.creations.filter(c => !q || norm(`${c.cliente_nome} ${c.cliente_whatsapp} ${c.modelo_nome} ${c.id}`).includes(q)); $('#creations').innerHTML = `<div class="toolbar"><input id="creationSearch" type="search" placeholder="Buscar cliente, WhatsApp, modelo…" value="${esc(state.search.creations)}"><button class="secondary" id="openGenerator">Gerador oficial</button><button class="secondary" id="creationReload">Atualizar</button></div><div class="cards">${list.map(creationCard).join('') || '<div class="empty">Nenhuma criação encontrada.</div>'}</div>`; $('#creationSearch').oninput = e => { state.search.creations = e.target.value; renderCreations(); }; $('#openGenerator').onclick = () => { state.creationMode = 'generator'; renderCreations(); }; $('#creationReload').onclick = () => { state.loaded.delete('creations'); ensureRouteData('creations', true); }; $$('[data-creation]', $('#creations')).forEach(b => b.onclick = () => openCreationDrawer(creationById(b.dataset.creation))); }
function creationCard(c) { const status = norm(c.atendimento_status || c.status || 'novo'); const image = mugArt(c); return `<article class="card"><div class="card-media">${image ? `<img src="${esc(image)}" loading="lazy" decoding="async">` : ''}</div><div class="card-body"><div>${sourceBadge(c.origem || 'canecafacil')} <span class="badge ${status === 'encomendou' ? 'good' : status === 'arquivado' ? '' : 'warn'}">${esc(status || 'novo')}</span></div><strong>${esc(c.cliente_nome || 'Cliente sem nome')}</strong><small>${esc(c.cliente_whatsapp || '')} · ${esc(dateTime(c.criado_em))}</small><small>${esc(c.modelo_nome || c.modelo_key || 'Caneca personalizada')}</small><div class="card-actions"><button class="secondary" data-creation="${esc(c.id)}">Abrir criação</button></div></div></article>`; }
function renderGenerator() { $('#creations').innerHTML = `<div class="toolbar" style="grid-template-columns:1fr auto"><div class="notice">Mesmo Criador de Canecas do Produção. Biblioteca, comandos, Make e Firebase continuam compartilhados.</div><button class="secondary" id="backCreations">Voltar às criações</button></div><div class="generator-wrap"><iframe id="generatorFrame" src="../producao-v2/admin-produtivo.html?from=admin-canecas&admin_build=${BUILD}#mug-studio" title="Criador de canecas oficial"></iframe></div>`; $('#backCreations').onclick = () => { state.creationMode = 'list'; renderCreations(); }; const frame = $('#generatorFrame'); frame.addEventListener('load', () => { try { const d = frame.contentDocument, style = d.createElement('style'); style.textContent = '.sidebar,.topbar,.environment-banner{display:none!important}.app-shell{display:block!important}.workspace{margin:0!important}.main-content{padding:12px!important}.view:not([data-view="mug-studio"]){display:none!important}.view[data-view="mug-studio"]{display:block!important}.route-placeholder{display:none!important}'; d.head.appendChild(style); } catch (e) { console.warn('Gerador sem modo compacto', e); } }); }
function openCreationDrawer(c) { if (!c) return; const versions = Array.isArray(c.versoes) ? c.versoes : []; openDrawer(`<h2>${esc(c.cliente_nome || 'Criação')}</h2><div class="subtitle">${esc(c.id)} · ${esc(dateTime(c.criado_em))}</div>${mugArt(c) ? `<img src="${esc(mugArt(c))}" style="width:100%;aspect-ratio:2.5/1;object-fit:contain;background:#f3f4f0;border-radius:12px">` : ''}<div class="form-section"><h3>Cliente</h3><div class="notice">${esc(c.cliente_whatsapp || 'WhatsApp não informado')}<br>${esc(c.modelo_nome || c.modelo_key || '')}</div></div><div class="form-section"><h3>Arte</h3><div class="notice">Versão aprovada: <b>${esc(c.arte_versao_aprovada || c.arte_versao || 'v1')}</b> · versões: <b>${versions.length || 1}</b></div></div><div class="drawer-actions"><button class="primary" id="crOrder">Criar pedido desta arte</button><button class="secondary" id="crContact">Marcar contatado</button><button class="secondary" id="crArchive">Arquivar</button>${mugArt(c) ? `<a class="secondary" target="_blank" href="${esc(mugArt(c))}">Abrir arte</a>` : ''}</div>`, { kind: 'creation', id: c.id }); $('#crOrder').onclick = () => createOrderFromCreation(c); $('#crContact').onclick = () => setCreationStatus(c, 'contatado'); $('#crArchive').onclick = () => setCreationStatus(c, 'arquivado'); }
async function setCreationStatus(c, status) { try { await fbWrite(`${MUG_NODES.creations}/${safeKey(c.__key || c.id)}`, { atendimento_status: status, atendimento_atualizado_em: nowIso() }); toast('Criação atualizada.'); closeDrawer(); state.loaded.delete('creations'); await ensureRouteData('creations', true); } catch (e) { toast(e.message || e, true); } }
async function createOrderFromCreation(c) { try { await loadMugData(); const id = `CF-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Date.now().toString(36).toUpperCase().slice(-5)}`, p = state.mugs.find(x => productKey(x) === text(c.produto_key || c.product_key || c.modelo_key)); const order = { id, origem: 'canecafacil', status: 'novo', status_comercial: 'novo', criacao_id: c.id, cliente: { nome: text(c.cliente_nome), telefone: text(c.cliente_whatsapp), whatsapp: text(c.cliente_whatsapp), email: text(c.cliente_email) }, pagamento: { status: 'pendente' }, itens: [{ id: c.id, firebaseKey: productKey(p), codigo: text(p?.codigo), nome: text(p?.nome || c.modelo_nome || 'Caneca personalizada'), quantidade: 1, preco: Number(p?.preco || c.preco || 0), arte_horizontal: mugArt(c), arte_versao: text(c.arte_versao_aprovada || c.arte_versao || 'v1'), criacao_id: c.id }], criado_em: nowIso(), atualizado_em: nowIso() }; await fbWrite(`${MUG_NODES.orders}/${safeKey(id)}`, order, 'PUT'); await fbWrite(`${MUG_NODES.creations}/${safeKey(c.__key || c.id)}`, { atendimento_status: 'encomendou', encomendou_em: nowIso(), pedido_id: id }); await audit('pedido_criado_da_criacao', { pedido_id: id, criacao_id: c.id }); toast(`Pedido ${id} criado.`); closeDrawer(); state.loaded.delete('orders'); state.loaded.delete('creations'); navigate('orders', { force: true }); } catch (e) { toast(e.message || e, true); } }

function renderPrint() { const waiting = state.printJobs.filter(j => ['aguardando', 'reimpressao'].includes(text(j.status))).length; $('#print').innerHTML = `<div class="toolbar" style="grid-template-columns:1fr auto"><div class="notice"><b>${waiting}</b> trabalho(s) aguardando. O Caneca Print lê <code>/canecas/print_jobs</code>.</div><a class="primary" href="../caneca-print/" target="_blank">Abrir em nova janela</a></div><div class="print-frame"><iframe src="../caneca-print/?embed=1&mode=queue" title="Caneca Print"></iframe></div>`; }
function renderSettings() { const s = settings(), diag = storeDiagnostics(); $('#settings').innerHTML = `<section class="panel"><div class="panel-head"><div><h2>Integrações operacionais</h2><p>Segredos ficam no Make/servidor, nunca no GitHub.</p></div></div><div class="panel-body"><div class="setting-grid"><label class="setting"><strong>WhatsApp comercial</strong><small>Número com DDD.</small><input data-setting="whatsapp" value="${esc(s.whatsapp || '')}"></label><label class="setting"><strong>Webhook · pedido → Bling</strong><small>Pedido confirmado.</small><input data-setting="blingWebhook" value="${esc(s.blingWebhook || '')}"></label><label class="setting"><strong>Webhook · cotação Melhor Envio</strong><small>Cálculo de frete.</small><input data-setting="quoteWebhook" value="${esc(s.quoteWebhook || '')}"></label><label class="setting"><strong>Webhook · preparar frete</strong><small>Pedido pago e dados completos.</small><input data-setting="shippingWebhook" value="${esc(s.shippingWebhook || '')}"></label></div><div class="mini-actions" style="margin-top:12px"><button class="primary" id="saveSettings">Salvar configurações locais</button><button class="secondary" id="testFirebase">Testar Firebase</button></div></div></section><section class="panel"><div class="panel-head"><div><h2>Diagnóstico</h2><p>Arquitetura enxuta.</p></div></div><div class="panel-body"><div class="notice">Core: <b>${BUILD}</b><br>Mug store: <b>${esc(diag.build)}</b> · cache: <b>${diag.cached}</b> · consulta: <b>${esc(diag.query)}</b><br>Pedidos: <b>${state.orders.length}</b> · Criações: <b>${state.creations.length}</b> · Print jobs: <b>${state.printJobs.length}</b></div></div></section>`; $('#saveSettings').onclick = () => { const n = {}; $$('[data-setting]').forEach(i => n[i.dataset.setting] = text(i.value)); saveSettings(n); toast('Configurações salvas neste navegador.'); }; $('#testFirebase').onclick = async () => { try { await fbGet(MUG_NODES.orders); toast('Firebase respondeu corretamente.'); } catch (e) { toast(e.message || e, true); } }; window.dispatchEvent(new CustomEvent('admin-canecas:settings-rendered')); }
async function refreshCurrent() { if (state.route === 'mugs') invalidateMugs('atualização manual'); if (state.route === 'dashboard') { ['mugs', 'orders', 'creations', 'print'].forEach(k => state.loaded.delete(k)); } else state.loaded.delete(state.route); emitRoute(state.route, true); await ensureRouteData(state.route, true); }

function boot() {
  $('#nav').addEventListener('click', e => { const b = e.target.closest('[data-route]'); if (b) navigate(b.dataset.route); });
  $('#reloadButton').onclick = refreshCurrent; $('#menuButton').onclick = () => $('#sidebar').classList.toggle('open'); $('#drawerClose').onclick = closeDrawer; $('#overlay').onclick = () => { $('#sidebar').classList.remove('open'); closeDrawer(); };
  window.addEventListener('popstate', () => navigate(location.hash.replace('#', '') || 'dashboard', { replace: true }));
  const initial = ROUTES[location.hash.replace('#', '')] ? location.hash.replace('#', '') : 'dashboard'; navigate(initial, { replace: true });
  document.documentElement.dataset.adminCanecasBuild = BUILD;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
