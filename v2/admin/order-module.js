import { loadOrders } from '../shared/orders.js';
import { auditOrders, filterOrderAudits } from './order-audit.js';
import { readDispatchSessions, DISPATCH_STATUS } from '../services/order-dispatch-service.js';
import { BLING_STATUS } from '../services/bling-make-result-contract.js';

const content = document.getElementById('admin-content');
const status = document.getElementById('admin-status');
const title = document.getElementById('module-title');
const subtitle = document.getElementById('module-subtitle');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
const money = value => Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const metric = (value, label) => `<article class="metric"><strong>${value}</strong><span>${label}</span></article>`;

const state = {
  loaded:false,
  loading:false,
  orders:[],
  localSessions:[],
  query:'',
  filter:'',
  selectedId:'',
  selectedLocalId:'',
  view:'firebase'
};

const stageLabel = value => ({
  new:'Novo',
  separating:'Em separação',
  separated:'Separado',
  checked:'Conferido',
  delivered:'Entregue'
})[value] || value;

function dispatchStatusLabel(value) {
  if (value === DISPATCH_STATUS.WHATSAPP_OPENED) return 'WhatsApp aberto';
  if (value === DISPATCH_STATUS.SUCCESS) return 'Concluído';
  if (value === DISPATCH_STATUS.ERROR) return 'Com erro';
  if (value === DISPATCH_STATUS.PENDING) return 'Processando';
  if (value === DISPATCH_STATUS.BLOCKED) return 'Bloqueado';
  if (value === DISPATCH_STATUS.PREPARED) return 'Preparado';
  if (value === DISPATCH_STATUS.WAITING_WHATSAPP) return 'Aguardando WhatsApp';
  return 'Pendente';
}

function dispatchStatusClass(value) {
  if ([DISPATCH_STATUS.SUCCESS, DISPATCH_STATUS.WHATSAPP_OPENED].includes(value)) return 'ok';
  if (value === DISPATCH_STATUS.ERROR) return 'error';
  return 'warn';
}

function blingStatusLabel(value) {
  return ({
    [BLING_STATUS.NOT_PROCESSED]:'Não processado',
    [BLING_STATUS.CREATED]:'Venda criada',
    [BLING_STATUS.DUPLICATE_CONFIRMED]:'Venda já existente',
    [BLING_STATUS.RATE_LIMITED]:'Limite de requisições',
    [BLING_STATUS.ERROR]:'Falha no Bling',
    [BLING_STATUS.UNKNOWN]:'Sem confirmação'
  })[value] || 'Sem confirmação';
}

function blingStatusClass(bling = {}) {
  if (bling.completed === true || [BLING_STATUS.CREATED, BLING_STATUS.DUPLICATE_CONFIRMED].includes(bling.status)) return 'ok';
  if (bling.status === BLING_STATUS.ERROR) return 'error';
  return 'warn';
}

function renderViewTabs() {
  return `<div class="order-view-tabs"><button type="button" data-order-view="firebase" class="${state.view === 'firebase' ? 'active' : ''}">Pedidos do Firebase <span>${state.orders.length}</span></button><button type="button" data-order-view="local" class="${state.view === 'local' ? 'active' : ''}">Homologação local <span>${state.localSessions.length}</span></button></div>`;
}

function firebaseRow(audit) {
  const order = audit.order;
  return `<button class="order-row" type="button" data-order-detail="${esc(order.id)}"><span><strong>Pedido ${esc(order.numero)}</strong><small>${esc(order.cliente.nome || 'Cliente não informado')} · ${esc(order.entrega.bairro || order.entrega.cidade || 'Endereço pendente')}</small></span><span class="score ${audit.valid ? 'ok' : 'warn'}">${stageLabel(audit.stage)}</span><span>${audit.separated}/${audit.totalItems}</span><span>${money(order.total)}</span><span class="${audit.integrationIssues.length ? 'text-error' : ''}">${audit.integrationIssues.length} alerta(s)</span></button>`;
}

function firebaseDetail(audit) {
  const order = audit.order;
  const allIssues = [...audit.issues, ...audit.integrationIssues];
  content.innerHTML = `<section class="product-detail-panel"><button class="back-button" type="button" data-close-order-detail>← Voltar aos pedidos</button><div class="panel-head"><div><span class="eyebrow">OPERAÇÃO · SOMENTE LEITURA</span><h2>Pedido ${esc(order.numero)}</h2></div><span class="score ${audit.valid ? 'ok' : 'warn'}">${stageLabel(audit.stage)}</span></div><section class="metrics">${metric(audit.totalItems,'ITENS')}${metric(audit.separated,'SEPARADOS')}${metric(audit.checked,'CONFERIDOS')}${metric(audit.missing.length,'FALTANTES')}</section><div class="order-info-grid"><article><span>Cliente</span><strong>${esc(order.cliente.nome || '—')}</strong></article><article><span>Telefone</span><strong>${esc(order.cliente.telefone || '—')}</strong></article><article><span>Endereço</span><strong>${esc([order.entrega.logradouro,order.entrega.numero,order.entrega.bairro,order.entrega.cidade].filter(Boolean).join(', ') || '—')}</strong></article><article><span>Agendamento</span><strong>${esc(order.entrega.agendamento || '—')}</strong></article><article><span>Total</span><strong>${money(order.total)}</strong></article><article><span>Origem</span><strong>${esc(order.origem || '—')}</strong></article></div><div class="order-items"><div class="order-items-head"><span>Produto</span><span>Qtd.</span><span>Separado</span><span>Conferido</span><span>Faltante</span></div>${order.itens.map(item => `<div><span><strong>${esc(item.nome)}</strong><small>${esc(item.codigo || item.ref || '—')}</small></span><span>${item.quantidade}</span><span>${item.separado ? 'Sim' : 'Não'}</span><span>${item.conferido ? 'Sim' : 'Não'}</span><span class="${item.faltante ? 'text-error' : ''}">${item.faltante ? 'Sim' : 'Não'}</span></div>`).join('') || '<div class="empty">Pedido sem itens.</div>'}</div><div class="integration-grid"><article><span>WhatsApp</span><strong>${order.integracoes.whatsapp ? 'Confirmado' : 'Sem confirmação'}</strong></article><article><span>Make</span><strong>${order.integracoes.make ? 'Confirmado' : 'Sem confirmação'}</strong></article><article><span>Bling</span><strong>${order.integracoes.bling ? 'Confirmado' : 'Sem confirmação'}</strong></article></div>${allIssues.length ? `<div class="notice error"><strong>Alertas encontrados</strong><br>${allIssues.map(esc).join('<br>')}</div>` : '<div class="notice success">Pedido sem pendência estrutural detectada.</div>'}<div class="notice">Separar, conferir, marcar entrega, imprimir etiqueta e reenviar integrações continuam bloqueados nesta fase.</div></section>`;
}

function renderFirebaseOrders() {
  const audit = auditOrders(state.orders);
  if (state.selectedId) {
    const selected = audit.rows.find(row => row.order.id === state.selectedId);
    if (selected) { firebaseDetail(selected); return; }
    state.selectedId = '';
  }
  const filtered = filterOrderAudits(audit.rows, state.query, state.filter);
  content.innerHTML = `<section class="module-hero"><span class="eyebrow">PEDIDOS · SOMENTE LEITURA</span><h2>Operação e integridade dos pedidos</h2><p>Pedidos reais do Firebase permanecem separados dos testes locais de checkout.</p></section>${renderViewTabs()}<section class="metrics">${metric(audit.total,'PEDIDOS')}${metric(audit.separating,'EM SEPARAÇÃO')}${metric(audit.ready,'PRONTOS')}${metric(audit.withIssues,'COM ALERTAS')}</section><section class="panel"><div class="product-filters order-filters"><label><span>Buscar</span><input id="order-query" value="${esc(state.query)}" placeholder="Número, cliente, telefone ou bairro"></label><label><span>Situação</span><select id="order-filter"><option value="">Todos</option><option value="new"${state.filter === 'new' ? ' selected' : ''}>Novos</option><option value="separating"${state.filter === 'separating' ? ' selected' : ''}>Em separação</option><option value="separated"${state.filter === 'separated' ? ' selected' : ''}>Separados</option><option value="checked"${state.filter === 'checked' ? ' selected' : ''}>Conferidos</option><option value="delivered"${state.filter === 'delivered' ? ' selected' : ''}>Entregues</option><option value="issues"${state.filter === 'issues' ? ' selected' : ''}>Com alertas</option></select></label></div><div class="order-head"><span>Pedido</span><span>Status</span><span>Separação</span><span>Total</span><span>Integrações</span></div><div class="order-list">${filtered.map(firebaseRow).join('') || '<div class="empty">Nenhum pedido encontrado.</div>'}</div></section>`;
  document.getElementById('order-query')?.addEventListener('input', event => { state.query = event.target.value; render(); document.getElementById('order-query')?.focus(); });
  document.getElementById('order-filter')?.addEventListener('change', event => { state.filter = event.target.value; render(); });
}

function localSessionRow(session) {
  const order = session.envelope?.order || {};
  const itemCount = Array.isArray(order.itens) ? order.itens.reduce((sum,item) => sum + Number(item.quantidade || 0), 0) : 0;
  const bling = session.channels?.make?.bling || {};
  return `<button class="order-row local-dispatch-row" type="button" data-local-order-detail="${esc(session.id)}"><span><strong>${esc(session.envelopeId)}</strong><small>${esc(order.cliente?.nome || 'Cliente não informado')} · ${esc(order.cliente?.telefone || 'Sem telefone')}</small></span><span class="score ${dispatchStatusClass(session.status)}">${esc(dispatchStatusLabel(session.status))}</span><span>${itemCount} un.</span><span>${money(order.total)}</span><span class="${blingStatusClass(bling) === 'error' ? 'text-error' : ''}">${esc(blingStatusLabel(bling.status))}</span></button>`;
}

function blingCard(session) {
  const bling = session.channels?.make?.bling || {};
  const details = [];
  if (bling.saleNumber) details.push(`Venda ${bling.saleNumber}`);
  if (bling.saleId) details.push(`ID ${bling.saleId}`);
  if (bling.contactId) details.push(`Contato ${bling.contactId}`);
  if (bling.duplicate) details.push('Duplicidade confirmada');
  if (bling.rateLimited) details.push(`Limite ${bling.rateLimitPeriod || ''} ${bling.rateLimitValue || ''}`.trim());
  return `<article class="local-channel-card ${blingStatusClass(bling)}"><span>Bling via Make</span><strong>${esc(blingStatusLabel(bling.status))}</strong><small>${esc(bling.detail || details.join(' · ') || 'Aguardando confirmação estruturada do cenário.')}</small><em>${esc(details.join(' · ') || 'Sem referência de venda')}</em></article>`;
}

function localSessionDetail(session) {
  const order = session.envelope?.order || {};
  const history = (session.history || []).slice(0,20).map(item => {
    const blingMeta = [item.blingStatus, item.blingSaleNumber ? `Venda ${item.blingSaleNumber}` : '', item.blingSaleId ? `ID ${item.blingSaleId}` : ''].filter(Boolean).join(' · ');
    return `<article><strong>${esc(item.action || 'evento')}</strong><span>${esc(item.at ? new Date(item.at).toLocaleString('pt-BR') : '')}</span>${item.detail ? `<small>${esc(item.detail)}</small>` : ''}${blingMeta ? `<small>${esc(blingMeta)}</small>` : ''}</article>`;
  }).join('');
  const channels = ['whatsapp','firebase','make'].map(name => {
    const channel = session.channels?.[name] || {};
    return `<article class="local-channel-card ${dispatchStatusClass(channel.status)}"><span>${name === 'whatsapp' ? 'WhatsApp' : name === 'firebase' ? 'Firebase' : 'Make'}</span><strong>${esc(dispatchStatusLabel(channel.status))}</strong><small>${esc(channel.detail || 'Sem detalhe')}</small><em>${Number(channel.attempts || 0)} tentativa(s)</em></article>`;
  }).join('') + blingCard(session);
  content.innerHTML = `<section class="product-detail-panel"><button class="back-button" type="button" data-close-local-order-detail>← Voltar à homologação local</button><div class="panel-head"><div><span class="eyebrow">CHECKOUT V2 · FILA LOCAL</span><h2>${esc(session.envelopeId)}</h2></div><span class="score ${dispatchStatusClass(session.status)}">${esc(dispatchStatusLabel(session.status))}</span></div><div class="order-info-grid"><article><span>Cliente</span><strong>${esc(order.cliente?.nome || '—')}</strong></article><article><span>Telefone</span><strong>${esc(order.cliente?.telefone || '—')}</strong></article><article><span>Endereço</span><strong>${esc([order.entrega?.logradouro,order.entrega?.numero,order.entrega?.bairro,order.entrega?.cidade].filter(Boolean).join(', ') || '—')}</strong></article><article><span>Total</span><strong>${money(order.total)}</strong></article><article><span>Criado</span><strong>${esc(session.createdAt ? new Date(session.createdAt).toLocaleString('pt-BR') : '—')}</strong></article><article><span>Fingerprint</span><strong>${esc(session.fingerprint || '—')}</strong></article></div><div class="local-channel-grid">${channels}</div><section class="panel"><div class="panel-head"><h3>Histórico local</h3><span class="pill">${(session.history || []).length} eventos</span></div><div class="local-dispatch-history">${history || '<div class="empty">Sem eventos registrados.</div>'}</div></section><div class="notice">Bling é executado somente dentro do cenário do Make. Nenhum token ou chamada direta ao ERP é exposto no navegador.</div></section>`;
}

function renderLocalSessions() {
  state.localSessions = [...readDispatchSessions()];
  if (state.selectedLocalId) {
    const selected = state.localSessions.find(item => item.id === state.selectedLocalId);
    if (selected) { localSessionDetail(selected); return; }
    state.selectedLocalId = '';
  }
  const waiting = state.localSessions.filter(item => item.status === DISPATCH_STATUS.WAITING_WHATSAPP).length;
  const opened = state.localSessions.filter(item => item.status === DISPATCH_STATUS.WHATSAPP_OPENED).length;
  const errors = state.localSessions.filter(item => item.status === DISPATCH_STATUS.ERROR).length;
  const blingConfirmed = state.localSessions.filter(item => item.channels?.make?.bling?.completed === true).length;
  content.innerHTML = `<section class="module-hero"><span class="eyebrow">HOMOLOGAÇÃO LOCAL</span><h2>Pedidos preparados pelo checkout V2</h2><p>Sessões protegidas por fingerprint, com rastreamento separado de WhatsApp, Firebase, Make e Bling.</p></section>${renderViewTabs()}<section class="metrics">${metric(state.localSessions.length,'SESSÕES')}${metric(waiting,'AGUARDANDO WHATSAPP')}${metric(opened,'WHATSAPP ABERTO')}${metric(blingConfirmed,'BLING CONFIRMADO')}${metric(errors,'COM ERRO')}</section><section class="panel"><div class="order-head"><span>Pedido</span><span>Status</span><span>Itens</span><span>Total</span><span>Bling</span></div><div class="order-list">${state.localSessions.map(localSessionRow).join('') || '<div class="empty">Nenhum pedido de homologação preparado neste navegador.</div>'}</div><div class="notice">Os registros são locais deste navegador. O fluxo externo continua desabilitado até a homologação completa.</div></section>`;
}

function render() {
  title.textContent = 'Pedidos e operação';
  subtitle.textContent = state.view === 'firebase' ? 'Pedidos reais em modo somente leitura.' : 'Fila local do checkout de homologação.';
  state.view === 'local' ? renderLocalSessions() : renderFirebaseOrders();
}

async function open() {
  document.querySelectorAll('[data-module]').forEach(button => button.classList.toggle('active', button.dataset.module === 'orders'));
  state.localSessions = [...readDispatchSessions()];
  if (state.loaded) return render();
  if (state.loading) return;
  state.loading = true;
  title.textContent = 'Pedidos e operação';
  subtitle.textContent = 'Carregando pedidos em modo seguro…';
  content.innerHTML = '<div class="panel"><div class="empty">Carregando pedidos do Firebase sem gravar alterações…</div></div>';
  try {
    state.orders = await loadOrders();
    state.loaded = true;
    status.textContent = `${state.orders.length} pedidos reais · ${state.localSessions.length} testes locais`;
    status.dataset.type = 'success';
    render();
  } catch (error) {
    state.loaded = true;
    state.orders = [];
    status.textContent = 'Firebase indisponível; fila local disponível';
    status.dataset.type = 'error';
    state.view = 'local';
    render();
    content.insertAdjacentHTML('afterbegin', `<div class="notice error">Pedidos reais não foram carregados: ${esc(error.message || error)}</div>`);
  } finally {
    state.loading = false;
  }
}

document.addEventListener('click', event => {
  const module = event.target.closest('[data-module="orders"]');
  if (module) { event.preventDefault(); event.stopImmediatePropagation(); open(); return; }
  const viewButton = event.target.closest('[data-order-view]');
  if (viewButton) { state.view = viewButton.dataset.orderView; state.selectedId = ''; state.selectedLocalId = ''; render(); return; }
  const firebaseItem = event.target.closest('[data-order-detail]');
  if (firebaseItem) { state.selectedId = firebaseItem.dataset.orderDetail; render(); return; }
  if (event.target.closest('[data-close-order-detail]')) { state.selectedId = ''; render(); return; }
  const localItem = event.target.closest('[data-local-order-detail]');
  if (localItem) { state.selectedLocalId = localItem.dataset.localOrderDetail; render(); return; }
  if (event.target.closest('[data-close-local-order-detail]')) { state.selectedLocalId = ''; render(); }
}, true);