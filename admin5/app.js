import { attendanceApi, adminProductsApi, prepareAdminSession } from './api.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const viewRoot = $('#viewRoot');
const CATEGORY_KEY = 'da_admin5_meta_category_overrides_v1';
const CHANNELS = ['0975', '1018'];
const META_CATEGORIES = [
  'CESTAS BÁSICAS', 'MERCEARIA', 'LIMPEZA', 'LAVANDERIA',
  'HIGIENE', 'BELEZA', 'CASA', 'PET'
];

const state = {
  view: 'chat',
  accounts: {},
  chatChannel: 'all',
  chatSearch: '',
  queue: [],
  selectedConversationId: '',
  conversation: null,
  chatTimer: null,
  productQuery: '',
  productActive: 'true',
  products: [],
  productNext: null,
  productOffset: 0,
  productReloadQueued: false,
  catalogProducts: [],
  catalogBaskets: [],
  catalogLoaded: false,
  catalogCategory: 'TODAS',
  catalogPage: 0,
  catalogChannel: '1018',
  catalogOverrides: loadOverrides(),
  productLoading: false
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function safeImage(value) {
  const url = String(value || '').trim();
  return /^https:\/\//i.test(url) ? url : '';
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function priceCents(product) {
  const rawCents = product?.sale_price_cents;
  if (rawCents !== null && rawCents !== undefined && rawCents !== '') {
    const cents = Number(rawCents);
    if (Number.isFinite(cents) && cents > 0) return Math.round(cents);
  }
  const price = Number(product?.price);
  return Number.isFinite(price) && price > 0 ? Math.round(price * 100) : 0;
}

function productActive(product) {
  if (product?.active !== undefined) return product.active === true;
  return product?.is_active === true;
}

function productImage(product) {
  return safeImage(product?.image_ai_url || product?.image_url || product?.image_original_url);
}

function productStock(product) {
  const value = product?.sellable_stock ?? product?.effective_stock ?? product?.available_stock ?? product?.stock ?? product?.stock_quantity;
  return value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '—' : Number(value);
}

function channelFromPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return CHANNELS.find(channel => digits.endsWith(channel)) || '';
}

function operatorName() {
  return String($('#operatorName')?.value || '').trim() || 'Operação';
}

function setStatus(message, tone = 'neutral') {
  const node = $('#connectionState');
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
}

function showToast(message, tone = 'neutral') {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
  node.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { node.hidden = true; }, 3600);
}

function friendlyError(error) {
  const code = String(error?.message || '');
  const messages = {
    admin_auth_required: 'Sessão administrativa indisponível. Recarregue o Admin5.',
    admin_not_authorized: 'Seu usuário não tem permissão para esta ação.',
    service_window_closed: 'A janela de atendimento está fechada. Use um template aprovado na Central atual.',
    human_send_not_homologated: 'O envio direto ainda não está habilitado para este canal.',
    bling_stock_authority_not_active: 'O estoque é controlado pelo Bling e não pode ser alterado por este atalho.'
  };
  return messages[code] || error?.payload?.message || code || 'Não foi possível concluir a ação.';
}

function setView(name) {
  if (!['chat', 'products', 'baskets', 'orders', 'catalog'].includes(name)) return;
  state.view = name;
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  const titles = { chat: 'Atendimento', products: 'Produtos', baskets: 'Cestas', orders: 'Pedidos', catalog: 'Catálogo Meta' };
  $('#viewTitle').textContent = titles[name];
  clearInterval(state.chatTimer);
  state.chatTimer = null;
  if (name === 'chat') renderChat();
  if (name === 'products') renderProducts();
  if (name === 'baskets') renderEmbeddedAdmin('baskets');
  if (name === 'orders') renderEmbeddedAdmin('orders');
  if (name === 'catalog') renderCatalog();
}

function renderEmbeddedAdmin(tab) {
  const labels = { baskets: 'Gestão de cestas do Vitrine Admin', orders: 'Pedidos do Vitrine Admin' };
  const href = `/vitrine/admin/?tab=${encodeURIComponent(tab)}&admin5_embed=1`;
  viewRoot.innerHTML = `
    <section class="legacy-view-card">
      <div class="view-heading"><div><h2>${labels[tab]}</h2><p>Este módulo usa as regras e os serviços já em operação.</p></div>
        <a class="button secondary" href="${href}" target="_blank" rel="noopener">Abrir em nova aba ↗</a></div>
      <iframe class="legacy-frame" title="${labels[tab]}" src="${href}" loading="lazy"></iframe>
    </section>`;
}

async function loadAccounts() {
  const data = await attendanceApi('accounts');
  state.accounts = {};
  for (const account of data.items || []) {
    const channel = channelFromPhone(account.phone_e164);
    if (channel) state.accounts[channel] = account;
  }
}

function renderChat() {
  viewRoot.innerHTML = `
    <section class="chat-layout">
      <aside class="chat-queue-panel">
        <div class="channel-tabs" role="tablist" aria-label="Canal de atendimento">
          <button type="button" data-chat-channel="all" class="selected">Todos</button>
          <button type="button" data-chat-channel="0975">0975</button>
          <button type="button" data-chat-channel="1018">1018</button>
        </div>
        <label class="search-box"><span aria-hidden="true">⌕</span><input id="chatSearch" type="search" placeholder="Buscar nome ou telefone" autocomplete="off"></label>
        <div class="queue-heading"><div><strong>Conversas</strong><small id="queueStatus">Carregando canais…</small></div><button type="button" id="queueRefresh" class="icon-button" aria-label="Atualizar conversas">↻</button></div>
        <div id="chatQueue" class="chat-queue"><div class="empty-state">Carregando conversas…</div></div>
      </aside>
      <section class="chat-conversation-panel">
        <header id="conversationHeader" class="conversation-header"><div><strong>Selecione uma conversa</strong><small>ANA · canais 0975 e 1018</small></div></header>
        <div id="conversationMessages" class="conversation-messages"><div class="conversation-empty"><span>☏</span><strong>Atendimento pelo WhatsApp</strong><p>Escolha uma conversa para ver as mensagens.</p></div></div>
        <form id="messageForm" class="message-composer">
          <textarea id="messageText" rows="2" maxlength="4096" placeholder="Escreva uma mensagem…" disabled></textarea>
          <div class="composer-footer"><small id="composerHint">Selecione uma conversa.</small><button id="sendMessage" class="button primary" type="submit" disabled>Enviar</button></div>
        </form>
      </section>
    </section>`;

  $$('.channel-tabs button').forEach(button => button.addEventListener('click', () => {
    state.chatChannel = button.dataset.chatChannel;
    state.selectedConversationId = '';
    state.conversation = null;
    $$('.channel-tabs button').forEach(item => item.classList.toggle('selected', item === button));
    loadQueue();
    renderConversation();
  }));
  $('#chatSearch').addEventListener('input', debounce(event => {
    state.chatSearch = event.target.value.trim();
    loadQueue();
  }, 250));
  $('#queueRefresh').addEventListener('click', () => loadQueue());
  $('#chatQueue').addEventListener('click', event => {
    const card = event.target.closest('[data-conversation-id]');
    if (card) selectConversation(card.dataset.conversationId);
  });
  $('#messageForm').addEventListener('submit', sendMessage);

  loadAccounts()
    .then(loadQueue)
    .then(() => {
      if (state.view === 'chat') state.chatTimer = setInterval(() => {
        if (state.view === 'chat' && document.visibilityState === 'visible') loadQueue({ silent: true });
      }, 30000);
      setStatus('Supabase conectado', 'success');
    })
    .catch(error => {
      setStatus('Falha ao conectar', 'error');
      if (state.view === 'chat' && $('#queueStatus')) $('#queueStatus').textContent = friendlyError(error);
      if (state.view === 'chat' && $('#chatQueue')) $('#chatQueue').innerHTML = '<div class="empty-state">Não foi possível carregar as conversas.</div>';
    });
}

async function loadQueue({ silent = false } = {}) {
  if (!Object.keys(state.accounts).length) return;
  const queueStatus = $('#queueStatus');
  if (!silent && queueStatus) queueStatus.textContent = 'Atualizando…';
  const channels = state.chatChannel === 'all' ? CHANNELS : [state.chatChannel];
  const settled = await Promise.allSettled(channels.map(async channel => {
    const account = state.accounts[channel];
    if (!account?.id) return [];
    const data = await attendanceApi('queue', {
      account_id: account.id,
      limit: 50,
      search: state.chatSearch
    });
    return (data.items || []).map(item => ({ ...item, __channel: channel }));
  }));
  const failed = settled.filter(result => result.status === 'rejected');
  const results = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
  state.queue = results.flat().sort((a, b) =>
    new Date(b.canonical_last_message_at || b.last_message_at || 0) - new Date(a.canonical_last_message_at || a.last_message_at || 0)
  );
  if (state.view !== 'chat' || !$('#queueStatus')) return;
  $('#queueStatus').textContent = failed.length
    ? `${state.queue.length} conversas · falha em ${failed.length} canal(is)`
    : `${state.queue.length} conversas · atualizado agora`;
  renderQueue();
  if (state.selectedConversationId && !silent && !failed.length) await selectConversation(state.selectedConversationId, { keepScroll: true });
}

function renderQueue() {
  const host = $('#chatQueue');
  if (!host) return;
  if (!state.queue.length) {
    host.innerHTML = '<div class="empty-state">Nenhuma conversa neste canal.</div>';
    return;
  }
  host.innerHTML = state.queue.map(item => {
    const id = item.conversation_id || item.id;
    const title = item.display_name || item.phone_e164 || 'Contato';
    const preview = item.last_message_text || item.last_message_type || 'Sem mensagem';
    const when = item.canonical_last_message_at || item.last_message_at;
    const unread = Number(item.unread_count || 0);
    return `<button type="button" class="queue-card ${state.selectedConversationId === id ? 'active' : ''}" data-conversation-id="${esc(id)}">
      <span class="queue-avatar">${esc(String(title).trim().slice(0, 1).toUpperCase() || 'C')}</span>
      <span class="queue-copy"><span class="queue-title"><strong>${esc(title)}</strong><time>${esc(formatWhen(when))}</time></span>
      <span class="queue-preview">${esc(preview)}</span><span class="queue-channel">${esc(item.__channel)}</span></span>
      ${unread ? `<span class="unread-count">${Math.min(unread, 99)}</span>` : ''}
    </button>`;
  }).join('');
}

async function selectConversation(id, { keepScroll = false } = {}) {
  state.selectedConversationId = id;
  renderQueue();
  const host = $('#conversationMessages');
  if (host) host.innerHTML = '<div class="empty-state">Carregando mensagens…</div>';
  try {
    state.conversation = await attendanceApi('conversation', { conversation_id: id, limit: 40 });
    if (state.view !== 'chat' || state.selectedConversationId !== id) return;
    renderConversation({ keepScroll });
    const inbound = [...(state.conversation.messages || [])].reverse().find(message => message.direction === 'inbound');
    if (inbound?.id) attendanceApi('mark_read', { conversation_id: id, message_id: inbound.id }, 'POST').catch(() => {});
  } catch (error) {
    if (host && state.view === 'chat') host.innerHTML = `<div class="empty-state">${esc(friendlyError(error))}</div>`;
  }
}

function renderConversation({ keepScroll = false } = {}) {
  if (state.view !== 'chat') return;
  const envelope = state.conversation;
  const conversation = envelope?.conversation || envelope;
  const queueItem = state.queue.find(item => (item.conversation_id || item.id) === state.selectedConversationId) || {};
  const title = queueItem.display_name || conversation?.display_name || conversation?.wa_contact_e164 || 'Conversa';
  const phone = queueItem.phone_e164 || conversation?.wa_contact_e164 || '';
  const channel = queueItem.__channel || channelFromPhone(phone) || 'WhatsApp';
  $('#conversationHeader').innerHTML = `<div class="conversation-person"><span class="queue-avatar">${esc(String(title).trim().slice(0, 1).toUpperCase() || 'C')}</span><span><strong>${esc(title)}</strong><small>${esc(phone)} · ${esc(channel)} · ANA</small></span></div>`;
  const host = $('#conversationMessages');
  const messages = Array.isArray(envelope?.messages) ? envelope.messages : [];
  if (!messages.length) {
    host.innerHTML = '<div class="conversation-empty"><span>☏</span><strong>Conversa iniciada</strong><p>As mensagens aparecerão aqui.</p></div>';
  } else {
    host.innerHTML = messages.map(message => {
      const inbound = message.direction === 'inbound';
      const body = message.text_body || message.text || message.caption || ({ image: 'Imagem recebida', audio: 'Áudio recebido', document: 'Documento recebido', location: 'Localização recebida' }[message.message_type] || 'Mensagem');
      const date = message.message_at || message.sent_at || message.received_at || message.created_at;
      return `<article class="message-bubble ${inbound ? 'incoming' : 'outgoing'}"><p>${esc(body)}</p><time>${esc(formatWhen(date))}</time></article>`;
    }).join('');
  }
  const capability = envelope?.send_capability || {};
  const canSend = capability.enabled === true;
  $('#messageText').disabled = !canSend;
  $('#sendMessage').disabled = !canSend;
  $('#composerHint').textContent = canSend
    ? 'Envio pelo canal configurado. A janela e os bloqueios do backend continuam valendo.'
    : sendReason(capability.reason, envelope?.service_window?.open);
  if (!keepScroll) host.scrollTop = host.scrollHeight;
}

function sendReason(reason, open) {
  if (open === false || reason === 'service_window_closed') return 'Janela de 24 horas encerrada. Use um template na Central atual.';
  if (!state.selectedConversationId) return 'Selecione uma conversa.';
  return 'Envio indisponível neste canal no momento.';
}

async function sendMessage(event) {
  event.preventDefault();
  const text = String($('#messageText').value || '').trim();
  if (!text || !state.selectedConversationId) return;
  const button = $('#sendMessage');
  const input = $('#messageText');
  if (!button || !input) return;
  button.disabled = true;
  const conversationId = state.selectedConversationId;
  try {
    await attendanceApi('send_text', {
      conversation_id: conversationId,
      text,
      idempotency_key: `admin5-${crypto.randomUUID()}`
    }, 'POST');
    if (state.view === 'chat' && $('#messageText')) {
      $('#messageText').value = '';
      await selectConversation(conversationId, { keepScroll: true });
      await loadQueue({ silent: true });
    }
    showToast('Mensagem enviada pelo canal configurado.', 'success');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    if ($('#messageText')) $('#sendMessage').disabled = !(state.conversation?.send_capability?.enabled === true);
  }
}

function renderProducts() {
  viewRoot.innerHTML = `
    <section class="panel">
      <div class="view-heading"><div><h2>Produtos</h2><p>Busca, preço e status ativo. Estoque aparece como leitura; a alteração continua na autoridade atual.</p></div>
        <a class="button secondary" href="/vitrine/admin/?tab=products" target="_blank" rel="noopener">Abrir cadastro completo ↗</a></div>
      <div class="filter-row"><label class="search-box"><span aria-hidden="true">⌕</span><input id="productSearch" type="search" placeholder="Buscar produto ou EAN" value="${esc(state.productQuery)}"></label>
        <select id="productActiveFilter" aria-label="Status do produto"><option value="true">Ativos</option><option value="false">Inativos</option><option value="">Todos</option></select>
        <button id="productRefresh" class="button secondary" type="button">Atualizar</button></div>
      <p class="inline-note">O preço e o status usam o serviço administrativo existente. O estoque é somente leitura neste atalho.</p>
      <div id="productRows" class="product-list"><div class="empty-state">Carregando produtos…</div></div>
      <div class="list-footer"><span id="productCount"></span><button id="productMore" class="button secondary" type="button" hidden>Carregar mais</button></div>
    </section>`;
  $('#productActiveFilter').value = state.productActive;
  $('#productSearch').addEventListener('input', debounce(event => {
    state.productQuery = event.target.value.trim();
    state.productOffset = 0;
    state.products = [];
    loadProducts();
  }, 300));
  $('#productActiveFilter').addEventListener('change', event => {
    state.productActive = event.target.value;
    state.productOffset = 0;
    state.products = [];
    loadProducts();
  });
  $('#productRefresh').addEventListener('click', () => {
    state.productOffset = 0;
    state.products = [];
    loadProducts();
  });
  $('#productMore').addEventListener('click', loadProducts);
  $('#productRows').addEventListener('click', handleProductAction);
  loadProducts();
}

async function loadProducts() {
  const host = $('#productRows');
  if (!host || state.view !== 'products') return;
  if (state.productLoading) {
    state.productReloadQueued = true;
    return;
  }
  state.productLoading = true;
  const query = state.productQuery;
  const active = state.productActive;
  const offset = state.productOffset;
  if (!state.products.length) host.innerHTML = '<div class="empty-state">Carregando produtos…</div>';
  try {
    const data = await adminProductsApi('products', {
      q: query,
      active,
      offset,
      limit: 40
    });
    const items = data.products || [];
    const staleFilter = query !== state.productQuery || active !== state.productActive;
    if (!staleFilter) {
      state.products = offset ? [...state.products, ...items] : items;
      state.productNext = data.next_offset;
      state.productOffset = Number(state.productNext || 0);
      renderProductRows();
    }
  } catch (error) {
    host.innerHTML = `<div class="empty-state">${esc(friendlyError(error))}</div>`;
  } finally {
    state.productLoading = false;
    if (state.productReloadQueued) {
      state.productReloadQueued = false;
      if (state.view === 'products') loadProducts();
    }
  }
}

function renderProductRows() {
  const host = $('#productRows');
  if (!host) return;
  $('#productCount').textContent = `${state.products.length} produtos carregados`;
  $('#productMore').hidden = state.productNext === null || state.productNext === undefined;
  if (!state.products.length) {
    host.innerHTML = '<div class="empty-state">Nenhum produto encontrado.</div>';
    return;
  }
  host.innerHTML = state.products.map(product => {
    const id = product.id || product.product_id;
    const image = productImage(product);
    const cents = priceCents(product);
    const active = productActive(product);
    const stock = productStock(product);
    return `<article class="product-row" data-product-id="${esc(id)}">
      ${image ? `<img class="product-thumb" src="${esc(image)}" alt="" loading="lazy">` : '<span class="product-thumb image-placeholder">□</span>'}
      <div class="product-main"><strong>${esc(product.name || 'Produto sem nome')}</strong><small>${esc(product.sku || product.gtin || id || '')}</small>
        <span class="product-stock">Saldo (leitura): ${esc(stock)}</span></div>
      <label class="price-editor">Preço<input data-price value="${esc((cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))}" inputmode="decimal"></label>
      <button type="button" class="status-toggle ${active ? 'is-active' : 'is-inactive'}" data-action="toggle" data-active="${active}" aria-label="${active ? 'Desativar' : 'Ativar'} ${esc(product.name || 'produto')}">${active ? 'Ativo' : 'Inativo'}</button>
      <button type="button" class="button secondary save-price" data-action="price">Salvar preço</button>
    </article>`;
  }).join('');
}

async function handleProductAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('[data-product-id]');
  const product = state.products.find(item => String(item.id || item.product_id) === row?.dataset.productId);
  if (!product) return;
  button.disabled = true;
  try {
    if (button.dataset.action === 'toggle') {
      await adminProductsApi('product_quick_save', {
        product_id: product.id || product.product_id,
        active: !productActive(product),
        operator: operatorName()
      }, 'POST');
      showToast('Status atualizado.', 'success');
    } else {
      const raw = String($('[data-price]', row)?.value || '').trim().replace(/\./g, '').replace(',', '.');
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) throw new Error('Informe um preço válido.');
      await adminProductsApi('product_quick_save', {
        product_id: product.id || product.product_id,
        sale_price_cents: Math.round(value * 100),
        operator: operatorName()
      }, 'POST');
      showToast('Preço atualizado.', 'success');
    }
    state.productOffset = 0;
    state.products = [];
    await loadProducts();
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    button.disabled = false;
  }
}

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(CATEGORY_KEY) || '{}') || {}; }
  catch { return {}; }
}

function categoryGuess(product) {
  const name = normalize(product?.name);
  const sub = normalize(product?.customer_subcategory || product?.subcategory);
  const subsub = normalize(product?.customer_subsubcategory || product?.subsubcategory);
  const tags = normalize(Array.isArray(product?.tags) ? product.tags.join(' ') : product?.tags);
  const text = `${name} ${sub} ${subsub} ${tags}`;
  if (/\b(racao|pet|cachorro|cachorros|gato|gatos|areia higienica|coleira)\b/.test(text)) return 'PET';
  if (/\b(shampoo|xampu|condicionador|creme de pentear|tinta de cabelo|esmalte|maquiagem|batom|perfume|mascara capilar|tratamento capilar)\b/.test(text) || /beleza|cosmet/.test(subsub)) return 'BELEZA';
  if (/lavanderia|amaciante|sabao em po|sabao liquido|alvejante/.test(sub) || /amaciante|sabao em po|sabao liquido|alvejante/.test(text)) return 'LAVANDERIA';
  if (/limpeza/.test(sub) || /detergente|desinfetante|agua sanitaria|esponja|bucha|pano de limpeza|limpa/.test(text)) return 'LIMPEZA';
  if (/higiene pessoal/.test(sub) || /higiene bucal|sabonete|creme dental|pasta de dente|papel higienico|absorvente|fralda/.test(text)) return 'HIGIENE';
  if (/casa e utilidades|cozinha/.test(sub) || /utilidades|cozinha|panela|prato|talher|copo/.test(text)) return 'CASA';
  if (/mercearia|alimentos|bebidas/.test(sub) || /mercearia|alimentos|bebidas/.test(normalize(product?.customer_category || product?.category))) return 'MERCEARIA';
  return '';
}

function categoryFor(product) {
  const id = String(product.id || product.product_id || '');
  return Object.prototype.hasOwnProperty.call(state.catalogOverrides, id)
    ? state.catalogOverrides[id]
    : categoryGuess(product);
}

function saveCategoryOverride(id, category) {
  state.catalogOverrides[id] = category;
  try { localStorage.setItem(CATEGORY_KEY, JSON.stringify(state.catalogOverrides)); }
  catch { showToast('Não foi possível salvar a classificação neste navegador.', 'error'); }
}

function renderCatalog() {
  viewRoot.innerHTML = `
    <section class="panel catalog-panel">
      <div class="view-heading"><div><h2>Catálogo para WhatsApp</h2><p>Prévia dos produtos ativos, classificação em oito seções e bloqueios de cadastro.</p></div>
        <button id="loadCatalog" class="button primary" type="button">Carregar ativos</button></div>
      <div class="catalog-toolbar"><label>Canal de atendimento
        <select id="catalogChannel"><option value="1018">1018</option><option value="0975">0975</option></select></label>
        <button id="previewCatalog" class="button secondary" type="button" disabled>Ver prévia</button>
        <button id="syncCatalog" class="button primary" type="button" disabled title="A sincronização direta será habilitada após homologar os catálogos das duas WABAs.">Atualizar na Meta</button>
      </div>
      <div class="readiness-note"><strong>Sincronização Meta ainda não ligada.</strong><span>Esta rodada não publica produtos. Primeiro confira categorias, preços, imagens e as variantes das cestas.</span></div>
      <div id="catalogSummary" class="catalog-summary"><div class="empty-state">Carregue os ativos para ver as pendências.</div></div>
      <div class="catalog-category-bar" id="catalogCategoryBar"></div>
      <div id="catalogRows" class="catalog-product-list"></div>
      <div class="list-footer"><span id="catalogCount"></span><button id="catalogMore" class="button secondary" type="button" hidden>Carregar mais</button></div>
      <div id="catalogPreviewResult" class="preview-result" hidden></div>
      <p class="inline-note">A classificação salva nesta versão fica neste navegador. O compartilhamento entre operadores entra na rodada de persistência do catálogo.</p>
    </section>`;
  $('#catalogChannel').value = state.catalogChannel;
  $('#catalogChannel').addEventListener('change', event => { state.catalogChannel = event.target.value; });
  $('#loadCatalog').addEventListener('click', loadCatalogData);
  $('#catalogMore').addEventListener('click', () => { state.catalogPage += 1; renderCatalogRows(); });
  $('#catalogCategoryBar').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    state.catalogCategory = button.dataset.category;
    state.catalogPage = 0;
    renderCatalogCategoryBar();
    renderCatalogRows();
  });
  $('#catalogRows').addEventListener('change', event => {
    const select = event.target.closest('[data-product-category]');
    if (!select) return;
    saveCategoryOverride(select.dataset.productCategory, select.value);
    renderCatalogSummary();
    renderCatalogCategoryBar();
    renderCatalogRows();
  });
  $('#previewCatalog').addEventListener('click', showCatalogPreview);
  if (state.catalogLoaded) paintCatalog();
}

async function loadCatalogData() {
  const button = $('#loadCatalog');
  if (!button) return;
  button.disabled = true;
  button.textContent = 'Carregando…';
  try {
    const products = [];
    let offset = 0;
    for (let page = 0; page < 20; page += 1) {
      const data = await adminProductsApi('products', { active: 'true', offset, limit: 100 });
      products.push(...(data.products || []).filter(productActive));
      if (data.next_offset === null || data.next_offset === undefined) break;
      offset = Number(data.next_offset);
    }
    const basketsData = await adminProductsApi('baskets_admin');
    state.catalogProducts = products;
    state.catalogBaskets = (basketsData.baskets || []).filter(item => item.is_active === true && item.is_whatsapp_active === true);
    state.catalogLoaded = true;
    state.catalogCategory = 'TODAS';
    state.catalogPage = 0;
    paintCatalog();
    setStatus(`${products.length} produtos ativos carregados`, 'success');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    if ($('#loadCatalog')) {
      $('#loadCatalog').disabled = false;
      $('#loadCatalog').textContent = 'Atualizar dados';
    }
  }
}

function paintCatalog() {
  if (state.view !== 'catalog') return;
  renderCatalogSummary();
  renderCatalogCategoryBar();
  renderCatalogRows();
  $('#previewCatalog').disabled = !state.catalogProducts.length;
}

function catalogMetrics() {
  const rows = state.catalogProducts.map(product => {
    const category = categoryFor(product);
    const description = product.short_description || product.description_short || product.description || product.long_description || product.description_long;
    return {
      product,
      category,
      missingPrice: priceCents(product) <= 0,
      missingImage: !productImage(product),
      missingName: !String(product.name || '').trim(),
      missingDescription: !String(description || '').trim(),
      missingBrand: !String(product.brand || '').trim(),
      missingCategory: !category
    };
  });
  return {
    rows,
    missingPrice: rows.filter(row => row.missingPrice).length,
    missingImage: rows.filter(row => row.missingImage).length,
    missingName: rows.filter(row => row.missingName).length,
    missingDescription: rows.filter(row => row.missingDescription).length,
    missingBrand: rows.filter(row => row.missingBrand).length,
    missingCategory: rows.filter(row => row.missingCategory).length,
    ready: rows.filter(row => !row.missingPrice && !row.missingImage && !row.missingName && !row.missingDescription && !row.missingBrand && !row.missingCategory).length
  };
}

function renderCatalogSummary() {
  const host = $('#catalogSummary');
  if (!host) return;
  const metrics = catalogMetrics();
  host.innerHTML = `
    <div class="metric-card"><small>Produtos ativos</small><strong>${state.catalogProducts.length}</strong></div>
    <div class="metric-card"><small>Prontos para prévia</small><strong>${metrics.ready}</strong></div>
    <div class="metric-card warning"><small>Sem preço</small><strong>${metrics.missingPrice}</strong></div>
    <div class="metric-card warning"><small>Sem imagem</small><strong>${metrics.missingImage}</strong></div>
    <div class="metric-card warning"><small>Sem descrição</small><strong>${metrics.missingDescription}</strong></div>
    <div class="metric-card warning"><small>Sem marca</small><strong>${metrics.missingBrand}</strong></div>
    <div class="metric-card warning"><small>Categoria para revisar</small><strong>${metrics.missingCategory}</strong></div>
    <div class="metric-card warning"><small>Cestas ativas para WhatsApp</small><strong>${state.catalogBaskets.length}</strong></div>`;
  const sync = $('#syncCatalog');
  if (sync) sync.disabled = true;
}

function renderCatalogCategoryBar() {
  const host = $('#catalogCategoryBar');
  if (!host) return;
  const counts = Object.fromEntries(META_CATEGORIES.map(category => [category, 0]));
  for (const product of state.catalogProducts) {
    const category = categoryFor(product);
    if (category && counts[category] !== undefined) counts[category] += 1;
  }
  counts['CESTAS BÁSICAS'] = state.catalogBaskets.length;
  const options = ['TODAS', ...META_CATEGORIES];
  host.innerHTML = options.map(category => {
    const count = category === 'TODAS' ? state.catalogProducts.length + state.catalogBaskets.length : counts[category];
    return `<button type="button" data-category="${esc(category)}" class="category-chip ${state.catalogCategory === category ? 'selected' : ''}">${esc(category)} <span>${count}</span></button>`;
  }).join('');
}

function renderCatalogRows() {
  const host = $('#catalogRows');
  if (!host || !state.catalogLoaded) return;
  const metrics = catalogMetrics();
  const filtered = metrics.rows.filter(row => state.catalogCategory === 'TODAS' || row.category === state.catalogCategory);
  const pageSize = 50;
  const visible = filtered.slice(0, (state.catalogPage + 1) * pageSize);
  const basketCards = state.catalogCategory === 'TODAS' || state.catalogCategory === 'CESTAS BÁSICAS'
    ? state.catalogBaskets.map(basket => `<article class="catalog-item basket-blocked"><span class="product-thumb image-placeholder">◇</span><div class="catalog-item-main"><strong>${esc(basket.name || 'Cesta')}</strong><small>Cesta ativa · ${esc(basket.is_whatsapp_active ? 'visível no WhatsApp' : 'não publicada')}</small><span class="product-stock">Preço atual no cadastro: ${esc(money(Math.round(Number(basket.base_price || 0) * 100)))}</span></div><span class="status-pill warning">Revisar variantes</span></article>`).join('')
    : '';
  if (!visible.length && !basketCards) {
    host.innerHTML = '<div class="empty-state">Nenhum produto nesta seção.</div>';
  } else {
    host.innerHTML = basketCards + visible.map(row => {
      const product = row.product;
      const id = product.id || product.product_id;
      const image = productImage(product);
      const issue = row.missingName ? 'Sem nome' : row.missingPrice ? 'Sem preço' : row.missingImage ? 'Sem imagem' : row.missingDescription ? 'Sem descrição' : row.missingCategory ? 'Classificar' : row.missingBrand ? 'Sem marca' : 'Apto para revisão';
      return `<article class="catalog-item">
        ${image ? `<img class="product-thumb" src="${esc(image)}" alt="" loading="lazy">` : '<span class="product-thumb image-placeholder">□</span>'}
        <div class="catalog-item-main"><strong>${esc(product.name || 'Produto sem nome')}</strong><small>${esc(product.brand || product.sku || product.gtin || id || '')}</small><span class="product-stock">${esc(money(priceCents(product)))} · saldo (leitura) ${esc(productStock(product))}</span></div>
        <label class="category-editor">Seção<select data-product-category="${esc(id)}"><option value="">Revisar</option>${META_CATEGORIES.filter(category => category !== 'CESTAS BÁSICAS').map(category => `<option value="${esc(category)}" ${row.category === category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
        <span class="status-pill ${row.missingPrice || row.missingImage || row.missingName || row.missingDescription || row.missingCategory || row.missingBrand ? 'warning' : 'ready'}">${esc(issue)}</span>
      </article>`;
    }).join('');
  }
  const total = filtered.length + (state.catalogCategory === 'TODAS' || state.catalogCategory === 'CESTAS BÁSICAS' ? state.catalogBaskets.length : 0);
  $('#catalogCount').textContent = `${visible.length + (basketCards ? state.catalogBaskets.length : 0)} de ${total} itens`;
  $('#catalogMore').hidden = visible.length >= filtered.length;
}

function showCatalogPreview() {
  const metrics = catalogMetrics();
  const basketBlockers = state.catalogBaskets.length;
  const preview = $('#catalogPreviewResult');
  preview.hidden = false;
  preview.innerHTML = `<strong>Prévia local pronta · sem envio para a Meta</strong><p>${metrics.ready} de ${state.catalogProducts.length} produtos ativos têm nome, preço, imagem, descrição, marca e seção definidos. ${metrics.missingName + metrics.missingPrice + metrics.missingImage + metrics.missingDescription + metrics.missingBrand + metrics.missingCategory} pendências de dados precisam de revisão; os totais podem se sobrepor. ${basketBlockers} cestas aguardam confirmação das variantes e dos preços.</p><p>Os itens ativos incompletos ficam visíveis no resumo e não são removidos da base.</p>`;
  preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function debounce(callback, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

$('.main-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (button) setView(button.dataset.view);
});

$('#operatorName').value = localStorage.getItem('da_admin5_operator_v1') || '';
$('#operatorName').addEventListener('change', event => {
  localStorage.setItem('da_admin5_operator_v1', String(event.target.value || '').trim());
});

prepareAdminSession()
  .then(() => {
    setStatus('Supabase conectado', 'success');
    setView('chat');
  })
  .catch(error => {
    setStatus('Acesso indisponível', 'error');
    viewRoot.innerHTML = `<div class="panel"><div class="empty-state">${esc(friendlyError(error))}</div></div>`;
  });
