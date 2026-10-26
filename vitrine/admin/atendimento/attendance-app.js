import { attendanceJsonApi, ensureAttendanceToken } from './attendance-auth.js?v=simple-chat-v1';

const CHANNELS = ['0975', '1018'];
const QUEUE_PAGE_SIZE = 50;
const MESSAGE_PAGE_SIZE = 30;
const REFRESH_MS = 15000;
const params = new URLSearchParams(location.search);
const embeddedOrder = params.get('embedded') === 'order';
const state = {
  accounts: {},
  activeChannel: 'all',
  search: '',
  queue: [],
  selected: null,
  conversation: null,
  conversationOpen: false,
  loadingOlder: false,
  refreshing: false,
};
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let refreshTimer = null;
let searchTimer = null;
let queueSequence = 0;

async function api(action, values = {}, method = 'GET') {
  return attendanceJsonApi(action, values, method);
}

function digits(value) { return String(value || '').replace(/\D/g, ''); }
function channelByPhone(value) {
  const number = digits(value);
  return CHANNELS.find(channel => number.endsWith(channel)) || '';
}
function selectedId() { return state.selected?.id || ''; }
function displayName(item) { return item.display_name || item.phone_e164 || 'Conversa'; }
function initials(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase() : '•';
}
function formatTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(+date)) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
}
function formatQueueTime(value) {
  const date = new Date(value);
  if (Number.isNaN(+date)) return '';
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? formatTime(value)
    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
}
function dateKey(value) {
  const date = new Date(value);
  return Number.isNaN(+date) ? '' : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
function dateLabel(value) {
  const today = dateKey(new Date());
  const yesterday = dateKey(new Date(Date.now() - 86400000));
  const key = dateKey(value);
  if (key === today) return 'Hoje';
  if (key === yesterday) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}
function setConnection(message, tone = 'neutral') {
  const status = $('#connectionStatus');
  status.textContent = message;
  status.dataset.tone = tone;
}
function queueState(message, error = false) {
  const list = $('#queueList');
  list.replaceChildren();
  const stateNode = document.createElement('div');
  stateNode.className = `queue-state${error ? ' error' : ''}`;
  stateNode.textContent = message;
  if (error) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Tentar novamente';
    retry.onclick = () => loadQueue().catch(() => {});
    stateNode.append(retry);
  }
  list.append(stateNode);
}

async function loadAccounts() {
  const data = await api('accounts');
  state.accounts = {};
  for (const account of data.items || []) {
    const channel = channelByPhone(account.phone_e164);
    if (channel) state.accounts[channel] = account;
  }
  const connected = CHANNELS.filter(channel => state.accounts[channel]?.id).length;
  if (!connected) throw new Error('accounts_unavailable');
  setConnection(connected === 2 ? '0975 e 1018 conectados' : 'Atendimento conectado parcialmente', connected === 2 ? 'success' : 'warning');
  syncChannelSwitcher();
}

function syncChannelSwitcher() {
  for (const button of $$('[data-channel-switch]')) {
    const channel = button.dataset.channelSwitch;
    button.classList.toggle('active', channel === state.activeChannel);
    button.setAttribute('aria-selected', String(channel === state.activeChannel));
    button.disabled = channel !== 'all' && !state.accounts[channel]?.id;
  }
  $('#activeChannelStatus').textContent = state.activeChannel === 'all' ? '0975 e 1018' : `Número ${state.activeChannel}`;
}

async function loadChannelQueue(channel) {
  const account = state.accounts[channel];
  if (!account?.id) return [];
  const data = await api('queue', { account_id: account.id, limit: QUEUE_PAGE_SIZE, search: state.search });
  return (data.items || []).map(item => ({ ...item, __channel: channel }));
}

function messagePreview(item) {
  const type = item.last_message_type;
  if (type === 'image') return 'Imagem';
  if (type === 'audio') return 'Áudio';
  if (type === 'video') return 'Vídeo';
  return item.last_message_text || (type ? 'Mensagem recebida' : 'Sem mensagens');
}

function queueCard(item) {
  const name = displayName(item);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `queue-card${selectedId() === item.conversation_id ? ' selected' : ''}`;
  card.dataset.conversationId = item.conversation_id;
  card.dataset.channel = item.__channel;

  const avatar = document.createElement('span');
  avatar.className = 'queue-avatar';
  avatar.textContent = initials(name);
  const main = document.createElement('span');
  main.className = 'queue-card-main';
  const title = document.createElement('span');
  title.className = 'queue-title';
  const person = document.createElement('strong');
  person.textContent = name;
  const time = document.createElement('span');
  time.className = 'queue-time';
  time.textContent = formatQueueTime(item.canonical_last_message_at || item.last_message_at);
  title.append(person, time);

  const preview = document.createElement('span');
  preview.className = 'queue-preview';
  const previewText = document.createElement('span');
  previewText.className = 'preview-text';
  previewText.textContent = messagePreview(item);
  preview.append(previewText);
  const unreadCount = Number(item.unread_count || 0);
  if (unreadCount > 0) {
    const unread = document.createElement('span');
    unread.className = 'unread-badge';
    unread.textContent = String(Math.min(99, unreadCount));
    preview.append(unread);
  }
  const channel = document.createElement('span');
  channel.className = 'chip';
  channel.textContent = item.__channel;
  main.append(title, preview, channel);
  card.append(avatar, main);
  card.onclick = () => selectConversation(item.conversation_id, item.__channel).catch(() => {});
  return card;
}

async function loadQueue({ silent = false } = {}) {
  const request = ++queueSequence;
  if (!silent && !state.queue.length) queueState('Carregando conversas…');
  const channels = state.activeChannel === 'all' ? CHANNELS : [state.activeChannel];
  const results = await Promise.allSettled(channels.map(loadChannelQueue));
  if (request !== queueSequence) return;
  const items = [];
  let failed = false;
  for (const result of results) {
    if (result.status === 'fulfilled') items.push(...result.value);
    else failed = true;
  }
  if (failed && !items.length) {
    $('#activeChannelStatus').textContent = 'Reconectando…';
    if (!state.queue.length) queueState('Não foi possível carregar as conversas.', true);
    return;
  }
  state.queue = items.sort((left, right) => new Date(right.canonical_last_message_at || right.last_message_at || 0) - new Date(left.canonical_last_message_at || left.last_message_at || 0));
  const list = $('#queueList');
  list.replaceChildren();
  for (const item of state.queue) list.append(queueCard(item));
  if (!state.queue.length) queueState('Nenhuma conversa encontrada.');
  $('#activeChannelCount').textContent = String(state.queue.length);
  $('#activeChannelStatus').textContent = failed ? 'Conexão instável' : (state.activeChannel === 'all' ? '0975 e 1018' : `Número ${state.activeChannel}`);
}

function setConversationEmpty(title, message) {
  const empty = $('#conversationEmpty');
  empty.replaceChildren();
  const heading = document.createElement('strong');
  heading.textContent = title;
  const hint = document.createElement('span');
  hint.textContent = message;
  empty.append(heading, hint);
  empty.hidden = false;
  $('#messages').hidden = true;
}

function syncMobile() {
  $('#conversationPane').classList.toggle('mobile-open', Boolean(state.conversationOpen && selectedId()));
}

function resetConversation() {
  state.selected = null;
  state.conversation = null;
  state.conversationOpen = false;
  syncMobile();
  $('#messages').replaceChildren();
  $('#conversationAvatar').textContent = '…';
  $('#conversationHead strong').textContent = 'Selecione uma conversa';
  $('#conversationSubhead').textContent = state.activeChannel === 'all' ? '0975 e 1018' : `Número ${state.activeChannel}`;
  $('#serviceWindow').className = 'service-window neutral';
  $('#serviceWindow').textContent = 'Nenhuma conversa selecionada';
  setConversationEmpty('Escolha uma conversa', 'As mensagens aparecerão aqui.');
}

function switchChannel(channel) {
  if (!['all', ...CHANNELS].includes(channel)) return;
  if (channel !== 'all' && !state.accounts[channel]?.id) return;
  state.activeChannel = channel;
  syncChannelSwitcher();
  resetConversation();
  loadQueue().catch(() => {});
}

async function resolveMedia(messageId) {
  return api('media', { message_id: messageId });
}

function mediaPlaceholder(message) {
  const labels = { image: ['🖼️', 'Ver imagem'], audio: ['▶', 'Ouvir áudio'], video: ['▶', 'Ver vídeo'] };
  const [icon, label] = labels[message.message_type] || ['↧', 'Carregar mídia'];
  const host = document.createElement('div');
  host.className = 'media-content';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'media-load';
  const symbol = document.createElement('span');
  symbol.className = 'media-load-icon';
  symbol.textContent = icon;
  const copy = document.createElement('span');
  copy.className = 'media-load-copy';
  const title = document.createElement('strong');
  title.textContent = label;
  const hint = document.createElement('small');
  hint.textContent = 'Toque para carregar';
  copy.append(title, hint);
  button.append(symbol, copy);
  button.onclick = async () => {
    const conversationId = selectedId();
    button.disabled = true;
    title.textContent = 'Carregando…';
    try {
      const data = await resolveMedia(message.id);
      if (host.isConnected && selectedId() === conversationId) renderResolvedMedia(host, message, data);
    } catch {
      button.disabled = false;
      title.textContent = 'Tentar novamente';
      hint.textContent = 'Não foi possível carregar agora';
    }
  };
  host.append(button);
  if (message.text_body && message.message_type !== 'audio') {
    const caption = document.createElement('div');
    caption.className = 'media-caption';
    caption.textContent = message.text_body;
    host.append(caption);
  }
  return host;
}

function renderResolvedMedia(host, message, data) {
  host.replaceChildren();
  if (message.message_type === 'image') {
    const image = document.createElement('img');
    image.className = 'message-media-image';
    image.src = data.url;
    image.alt = message.text_body || 'Imagem';
    image.loading = 'lazy';
    host.append(image);
  } else if (message.message_type === 'audio') {
    const audio = document.createElement('audio');
    audio.className = 'message-audio';
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = data.url;
    host.append(audio);
  } else if (message.message_type === 'video') {
    const video = document.createElement('video');
    video.className = 'message-video';
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.src = data.url;
    host.append(video);
  }
  if (message.text_body && message.message_type !== 'audio') {
    const caption = document.createElement('div');
    caption.className = 'media-caption';
    caption.textContent = message.text_body;
    host.append(caption);
  }
}

function messageNode(message) {
  const row = document.createElement('div');
  row.className = `message-row ${message.direction === 'outbound' ? 'outbound' : 'inbound'}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (['text', 'template'].includes(message.message_type) && message.text_body) {
    bubble.textContent = message.text_body;
  } else if (['image', 'audio', 'video'].includes(message.message_type)) {
    bubble.append(mediaPlaceholder(message));
  } else {
    const text = document.createElement('span');
    text.className = 'media-placeholder';
    text.textContent = message.text_body || 'Conteúdo indisponível';
    bubble.append(text);
  }
  const meta = document.createElement('span');
  meta.className = 'message-meta';
  meta.textContent = formatTime(message.message_at);
  bubble.append(meta);
  row.append(bubble);
  return row;
}

function renderServiceWindow() {
  const status = $('#serviceWindow');
  const windowState = state.conversation?.service_window;
  if (!windowState) {
    status.className = 'service-window neutral';
    status.textContent = 'Janela de atendimento indisponível';
  } else if (windowState.open) {
    const minutes = Math.floor(Number(windowState.remaining_seconds || 0) / 60);
    status.className = 'service-window open';
    status.textContent = `Janela de atendimento aberta · ${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  } else {
    status.className = 'service-window closed';
    status.textContent = 'Janela de 24h encerrada';
  }
}

function renderMessages({ keepPosition = false, previousHeight = 0, previousTop = 0 } = {}) {
  const list = $('#messages');
  list.replaceChildren();
  let lastDate = '';
  for (const message of state.conversation?.messages || []) {
    const key = dateKey(message.message_at);
    if (key && key !== lastDate) {
      const separator = document.createElement('div');
      separator.className = 'message-date-separator';
      separator.textContent = dateLabel(message.message_at);
      list.append(separator);
      lastDate = key;
    }
    list.append(messageNode(message));
  }
  list.hidden = false;
  $('#conversationEmpty').hidden = true;
  if (keepPosition) {
    requestAnimationFrame(() => { list.scrollTop = Math.max(0, previousTop + (list.scrollHeight - previousHeight)); });
  } else list.scrollTop = list.scrollHeight;
  renderServiceWindow();
}

function renderConversationHeader() {
  const conversation = state.conversation?.conversation;
  if (!conversation || !state.selected) return;
  const name = state.selected.display_name || conversation.phone_e164 || 'Conversa';
  $('#conversationHead strong').textContent = name;
  $('#conversationSubhead').textContent = `${state.selected.channel} · ${conversation.phone_e164 || ''}`;
  $('#conversationAvatar').textContent = initials(name);
}

async function selectConversation(id, channel) {
  const item = state.queue.find(row => row.conversation_id === id && row.__channel === channel);
  state.selected = { id, channel, display_name: item ? displayName(item) : '' };
  state.conversationOpen = true;
  $$('.queue-card').forEach(card => card.classList.toggle('selected', card.dataset.conversationId === id && card.dataset.channel === channel));
  syncMobile();
  setConversationEmpty('Carregando conversa…', 'Buscando mensagens.');
  try {
    const conversation = await api('conversation', { conversation_id: id, limit: MESSAGE_PAGE_SIZE });
    if (selectedId() !== id) return;
    state.conversation = conversation;
    renderConversationHeader();
    renderMessages();
    const inbound = [...(conversation.messages || [])].reverse().find(message => message.direction === 'inbound');
    if (inbound) api('mark_read', { conversation_id: id, message_id: inbound.id }, 'POST').catch(() => {});
    loadQueue({ silent: true }).catch(() => {});
  } catch {
    if (selectedId() === id) setConversationEmpty('Não foi possível abrir esta conversa', 'Tente selecionar a conversa novamente.');
  }
}

async function loadOlder() {
  if (state.loadingOlder || !state.conversation?.next_before || !selectedId()) return;
  state.loadingOlder = true;
  const list = $('#messages');
  const previousHeight = list.scrollHeight;
  const previousTop = list.scrollTop;
  try {
    const older = await api('conversation', { conversation_id: selectedId(), before: state.conversation.next_before, limit: MESSAGE_PAGE_SIZE });
    state.conversation.messages = [...(older.messages || []), ...(state.conversation.messages || [])];
    state.conversation.next_before = older.next_before;
    renderMessages({ keepPosition: true, previousHeight, previousTop });
  } finally {
    state.loadingOlder = false;
  }
}

async function refreshSelected() {
  if (document.hidden || state.refreshing || !selectedId()) return;
  state.refreshing = true;
  const id = selectedId();
  try {
    const latest = await api('conversation', { conversation_id: id, limit: MESSAGE_PAGE_SIZE });
    if (selectedId() !== id) return;
    const before = state.conversation?.messages?.at(-1)?.id;
    const after = latest.messages?.at(-1)?.id;
    state.conversation = latest;
    document.dispatchEvent(new CustomEvent('attendance:conversation-refreshed', { detail: { conversation_id: id, messages: latest.messages || [] } }));
    if (before !== after) {
      renderConversationHeader();
      renderMessages();
    } else renderServiceWindow();
  } catch {
    // Keep the last successful messages visible during a temporary connection failure.
  } finally {
    state.refreshing = false;
  }
}

async function backgroundRefresh() {
  if (document.hidden) return;
  await loadQueue({ silent: true });
  await refreshSelected();
}

function canonicalOrderPhone(value) {
  let phone = digits(value);
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  return phone.startsWith('55') && [12, 13].includes(phone.length) ? phone : '';
}

async function openOrderConversation() {
  const phone = canonicalOrderPhone(params.get('phone'));
  const customerId = String(params.get('customer_id') || '').trim();
  if (!phone) {
    setConversationEmpty('Telefone indisponível', 'Não foi possível identificar o telefone deste pedido.');
    return;
  }
  state.activeChannel = 'all';
  state.search = phone.slice(-9);
  $('#globalSearch').value = state.search;
  await loadQueue();
  const exact = state.queue.filter(item => canonicalOrderPhone(item.phone_e164) === phone);
  const linked = customerId ? exact.filter(item => String(item.customer_id || '') === customerId) : [];
  const matches = linked.length ? linked : exact;
  if (matches.length === 1) {
    await selectConversation(matches[0].conversation_id, matches[0].__channel);
  } else if (matches.length > 1) {
    const empty = $('#conversationEmpty');
    setConversationEmpty('Escolha a conversa', 'Há mais de uma conversa para este telefone.');
    for (const item of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${displayName(item)} · ${item.__channel}`;
      button.onclick = () => selectConversation(item.conversation_id, item.__channel).catch(() => {});
      empty.append(button);
    }
  } else setConversationEmpty('Conversa não localizada', 'Não há conversa com este telefone nos canais 0975 ou 1018.');
}

function bind() {
  $('#globalSearch').addEventListener('input', event => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = event.target.value.trim();
      loadQueue().catch(() => {});
    }, 250);
  });
  $$('[data-channel-switch]').forEach(button => button.addEventListener('click', () => switchChannel(button.dataset.channelSwitch)));
  $('#messages').addEventListener('scroll', event => { if (event.currentTarget.scrollTop < 36) loadOlder().catch(() => {}); });
  $('#mobileChatBackBtn').addEventListener('click', () => {
    state.conversationOpen = false;
    syncMobile();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.conversationOpen) {
      state.conversationOpen = false;
      syncMobile();
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) backgroundRefresh().catch(() => {}); });
  document.addEventListener('attendance:sent', event => {
    if (event.detail?.conversationId === selectedId()) setTimeout(() => refreshSelected(), 500);
  });
  window.addEventListener('beforeunload', () => clearInterval(refreshTimer));
}

async function boot() {
  bind();
  try {
    await ensureAttendanceToken();
    await loadAccounts();
    if (embeddedOrder) await openOrderConversation();
    else await loadQueue();
    refreshTimer = setInterval(() => backgroundRefresh().catch(() => {}), REFRESH_MS);
  } catch {
    setConnection('Não foi possível iniciar o atendimento', 'error');
    queueState('Não foi possível conectar. Verifique a sessão do Admin.', true);
  }
}

boot();
