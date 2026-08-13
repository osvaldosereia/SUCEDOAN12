if (typeof window !== 'undefined' && /\/kit-mobile\//.test(window.location.pathname)) {
  window.setTimeout(() => {
    const nav = document.querySelector('.ops-app-nav');
    if (!nav) return;
    nav.style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';
    nav.innerHTML = '<a href="../contagem/"><span class="ops-app-nav-icon">📦</span><span>Contagem</span></a><a href="../cadastro/"><span class="ops-app-nav-icon">➕</span><span>Cadastro</span></a><a href="../validades/"><span class="ops-app-nav-icon">📅</span><span>Validades</span></a><a class="active" aria-current="page" href="../kit-mobile/"><span class="ops-app-nav-icon">🎁</span><span>Kits</span></a>';
  }, 0);
}

const GENERATING_STATUSES = new Set([
  'novo', 'pendente', 'processando', 'aguardando', 'enviando', 'enviando_manual',
  'registrado', 'gerando', 'enviado_aguardando_fila',
]);

const WAITING_STATUSES = new Set([
  'pronto', 'agendado', 'aguardando_postagem', 'aguardando postagem',
]);

const POSTED_STATUSES = new Set([
  'postado', 'publicado', 'posted', 'published',
]);

const ERROR_STATUSES = new Set([
  'erro', 'falhou', 'failed', 'erro_envio', 'erro_geracao', 'erro_geracao_automatica',
]);

function clean(value) {
  return String(value ?? '').trim();
}

export function normalizeInstagramStatus(value) {
  return clean(value).toLocaleLowerCase('pt-BR');
}

export function latestKitQueueEntry(queue = [], code = '') {
  const wanted = clean(code);
  if (!wanted) return null;
  return [...(Array.isArray(queue) ? queue : [])]
    .filter(entry => clean(entry?.kit_codigo) === wanted)
    .sort((a, b) => String(b?.atualizado_em || b?.criado_em || '')
      .localeCompare(String(a?.atualizado_em || a?.criado_em || '')))[0] || null;
}

export function kitInstagramOperationalState(entry = null, kit = null) {
  const queueRaw = clean(entry?.fila_status || entry?.status);
  const kitRaw = clean(kit?.instagram_status || kit?.fila_status);
  const raw = normalizeInstagramStatus(queueRaw || kitRaw);
  const hasError = Boolean(clean(kit?.instagram_erro));

  if (POSTED_STATUSES.has(raw)) {
    return { key: 'postado', label: 'Postado', kind: 'success', raw: queueRaw || kitRaw || 'postado' };
  }
  if (ERROR_STATUSES.has(raw) || (!entry && hasError)) {
    return { key: 'erro', label: 'Erro', kind: 'danger', raw: queueRaw || kitRaw || 'erro' };
  }
  if (WAITING_STATUSES.has(raw)) {
    return { key: 'aguardando', label: 'Aguardando postagem', kind: 'warning', raw: queueRaw || kitRaw };
  }
  if (entry && GENERATING_STATUSES.has(raw)) {
    return { key: 'gerando', label: 'Gerando', kind: 'info', raw: queueRaw || kitRaw };
  }
  if (entry) {
    return { key: 'aguardando', label: 'Aguardando postagem', kind: 'warning', raw: queueRaw || kitRaw || 'registrado' };
  }
  if (GENERATING_STATUSES.has(raw)) {
    return { key: 'gerando', label: 'Gerando', kind: 'info', raw: kitRaw };
  }
  return { key: 'nao_gerado', label: 'Ainda não gerado', kind: 'neutral', raw: kitRaw || '' };
}

export function shouldAutoGenerateKitCarousel({ hadPrevious = false, existingQueue = null } = {}) {
  return !hadPrevious && !existingQueue;
}

export function kitHasCarousel(entry) {
  return Boolean(entry);
}

export function isPostedKitCarousel(entry, kit = null) {
  return kitInstagramOperationalState(entry, kit).key === 'postado';
}
