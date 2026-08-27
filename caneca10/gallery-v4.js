(() => {
  'use strict';

  const BUILD = '20260826-ceneca10-gallery-v4-light-fast';
  const FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const PRODUCTS_NODE = 'produtos';
  const ARCHIVE_NODE = 'produtos_excluidos';
  const MODELS_NODE = 'canecas/modelos_criacao';
  const PRIVATE_MODELS_NODE = 'canecas/modelos_privados';
  const COMMANDS_NODE = 'canecas/comandos_criacao';
  const SELECTED_KEY = 'da_admin_v2_mug_saved_commands_selected';
  const CATEGORY_NAMES = ['Caneca de Porcelana', 'Canecas de Porcelana', 'Canecas'];
  const PLACEHOLDER = '../site/img/logoantonia5.png';
  const PAGE_SIZE = 4;
  const MODEL_LIMIT = 8;

  const state = {
    created: [],
    models: [],
    commands: [],
    loading: false,
    loadingMore: false,
    deleting: false,
    queryLimit: PAGE_SIZE,
    hasMore: true,
  };

  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').trim();
  const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isHttpUrl(value) { return /^https?:\/\//i.test(text(value)); }

  function uniqueUrls(values = []) {
    const result = [];
    for (const value of values.flat(Infinity)) {
      const url = text(value);
      if (!isHttpUrl(url) || result.includes(url)) continue;
      result.push(url);
    }
    return result;
  }

  function productKey(product = {}, fallback = '') {
    return text(product.firebaseKey || product.id || product.codigo || fallback);
  }

  function isMug(product = {}) {
    return normalize(product.categoria).includes('caneca')
      || normalize(product.tipo_produto).includes('caneca')
      || normalize(product.origem_cadastro).includes('caneca');
  }

  function timestamp(product = {}) {
    const numeric = Number(product.last_update || product.timestamp || 0);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(product.updated_at || product.criado_em || product.created_at || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isInactive(product = {}) {
    return text(product.situacao || product.status).toUpperCase() === 'I'
      || product.ativo === false
      || product.visivel === false;
  }

  function productImages(product = {}) {
    return uniqueUrls([
      product.mockup_1,
      product.mockup_2,
      product.mockup_3,
      Array.isArray(product.imagens_site) ? product.imagens_site : [],
      Array.isArray(product.imagens) ? product.imagens : [],
      Array.isArray(product.midias_admin) ? product.midias_admin.slice(0, 3) : [],
      product.url_imagem,
      product.imagem_url,
      product.imagem,
    ]).slice(0, 3);
  }

  function normalizeProducts(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    return Object.entries(data)
      .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
      .map(([key, value]) => ({ firebaseKey: productKey(value, key), ...value }))
      .filter(isMug)
      .sort((a, b) => timestamp(b) - timestamp(a) || text(a.nome).localeCompare(text(b.nome), 'pt-BR'));
  }

  function normalizeModels(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    return Object.entries(data)
      .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
      .map(([key, value]) => ({
        id: text(value.id || key),
        product_key: text(value.product_key || value.firebaseKey || value.id || key),
        nome: text(value.nome || 'Modelo de caneca'),
        mockups: uniqueUrls([
          value.mockup_1,
          value.mockup_2,
          value.mockup_3,
          Array.isArray(value.mockups) ? value.mockups : [],
          value.imagem,
        ]).slice(0, 3),
        comandos_ids: Array.isArray(value.comandos_ids) ? value.comandos_ids.map(text).filter(Boolean) : [],
        instrucao_manual: text(value.instrucao_manual),
        instrucao_efetiva: text(value.instrucao_efetiva),
        atualizado_em: text(value.atualizado_em),
      }))
      .filter(model => model.product_key)
      .sort((a, b) => Date.parse(b.atualizado_em || '') - Date.parse(a.atualizado_em || '') || a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, MODEL_LIMIT);
  }

  async function fetchJson(path, query = '') {
    const suffix = query ? `${query}&_=${Date.now()}` : `?_=${Date.now()}`;
    const response = await fetch(`${FIREBASE_URL}/${path}.json${suffix}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Firebase retornou ${response.status}.`);
    return response.status === 204 ? null : response.json().catch(() => null);
  }

  async function fetchCategory(category, limit) {
    const params = new URLSearchParams();
    params.set('orderBy', JSON.stringify('categoria'));
    params.set('equalTo', JSON.stringify(category));
    params.set('limitToLast', String(limit));
    return normalizeProducts(await fetchJson(PRODUCTS_NODE, `?${params.toString()}`));
  }

  async function fetchCreated(limit = PAGE_SIZE) {
    const results = await Promise.allSettled(CATEGORY_NAMES.map(category => fetchCategory(category, limit)));
    const merged = new Map();
    let categoryAtLimit = false;
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      if (result.value.length >= limit) categoryAtLimit = true;
      for (const product of result.value) merged.set(productKey(product), product);
    }
    const sorted = [...merged.values()]
      .sort((a, b) => timestamp(b) - timestamp(a) || text(a.nome).localeCompare(text(b.nome), 'pt-BR'));
    return {
      items: sorted.slice(0, limit),
      hasMore: categoryAtLimit || sorted.length > limit,
    };
  }

  async function fetchModels() {
    const params = new URLSearchParams();
    params.set('orderBy', JSON.stringify('$key'));
    params.set('limitToLast', String(MODEL_LIMIT));
    return normalizeModels(await fetchJson(MODELS_NODE, `?${params.toString()}`));
  }

  async function fetchCommands() {
    const data = await fetchJson(COMMANDS_NODE);
    state.commands = Object.entries(data || {})
      .filter(([, value]) => value && typeof value === 'object')
      .map(([key, value]) => ({ id: text(value.id || key), nome: text(value.nome), texto: text(value.texto) }))
      .filter(item => item.id && item.texto);
    return state.commands;
  }

  async function fetchProduct(key) {
    const product = await fetchJson(`${PRODUCTS_NODE}/${encodeURIComponent(key)}`);
    return product && typeof product === 'object' ? { firebaseKey: key, ...product } : null;
  }

  function showToast(message, duration = 3600) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, duration);
  }

  function fallbackImg() {
    return `onerror="this.onerror=null;this.src='${PLACEHOLDER}'"`;
  }

  function modelImages(model = {}) {
    if (model.mockups?.length) return model.mockups;
    const product = state.created.find(item => productKey(item) === model.product_key);
    return productImages(product || {});
  }

  function formatDate(product = {}) {
    const value = timestamp(product);
    if (!value) return 'sem data';
    try {
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(value));
    } catch {
      return 'sem data';
    }
  }

  function renderModels() {
    const track = $('#modelsTrack');
    const count = $('#modelsCount');
    const status = $('#modelsStatus');
    if (!track || !count || !status) return;
    count.textContent = String(state.models.length);
    status.textContent = state.models.length
      ? `${state.models.length} modelo${state.models.length === 1 ? '' : 's'} recente${state.models.length === 1 ? '' : 's'}.`
      : 'Nenhum modelo salvo ainda.';
    track.innerHTML = state.models.length ? state.models.map(model => {
      const image = modelImages(model)[0] || PLACEHOLDER;
      const product = state.created.find(item => productKey(item) === model.product_key);
      const modelStatus = product ? (isInactive(product) ? 'Inativa' : 'Ativa') : 'Modelo salvo';
      return `<article class="model-mobile-card" data-model-key="${escapeHtml(model.product_key)}">
        <img loading="lazy" decoding="async" fetchpriority="low" src="${escapeHtml(image)}" alt="${escapeHtml(model.nome)}" ${fallbackImg()}>
        <div class="model-mobile-info">
          <strong>${escapeHtml(model.nome)}</strong>
          <small>${modelStatus} · ${(model.comandos_ids || []).length} comando${(model.comandos_ids || []).length === 1 ? '' : 's'}</small>
        </div>
        <button class="model-use-button" type="button" data-use-model="${escapeHtml(model.product_key)}">Usar modelo</button>
      </article>`;
    }).join('') : '<div class="history-empty">As canecas marcadas como modelo no Produção aparecerão aqui.</div>';
  }

  function filteredCreated() {
    const query = normalize($('#createdSearch')?.value || '');
    const filter = text($('#createdFilter')?.value || 'all');
    return state.created.filter(product => {
      if (filter === 'active' && isInactive(product)) return false;
      if (filter === 'inactive' && !isInactive(product)) return false;
      if (!query) return true;
      return normalize(`${product.nome || ''} ${product.codigo || ''} ${product.tema || ''} ${product.subcategoria || ''}`).includes(query);
    });
  }

  function renderCreated() {
    const list = $('#createdList');
    const count = $('#createdCount');
    const status = $('#createdStatus');
    const more = $('#createdLoadMore');
    if (!list || !count || !status) return;
    const visible = filteredCreated();
    count.textContent = String(state.created.length);
    const inactiveCount = state.created.filter(isInactive).length;
    status.textContent = `${state.created.length} carregada${state.created.length === 1 ? '' : 's'} · ${inactiveCount} inativa${inactiveCount === 1 ? '' : 's'}.`;
    list.innerHTML = visible.length ? visible.map(product => {
      const key = productKey(product);
      const image = productImages(product)[0] || PLACEHOLDER;
      const inactive = isInactive(product);
      return `<article class="created-mobile-card" data-created-key="${escapeHtml(key)}">
        <div class="created-mobile-media"><img loading="lazy" decoding="async" fetchpriority="low" src="${escapeHtml(image)}" alt="${escapeHtml(product.nome || 'Caneca criada')}" ${fallbackImg()}></div>
        <div class="created-mobile-body">
          <div class="created-mobile-top"><span class="created-status ${inactive ? 'inactive' : 'active'}">${inactive ? 'Inativa' : 'Ativa'}</span><small>${escapeHtml(formatDate(product))}</small></div>
          <strong>${escapeHtml(product.nome || key)}</strong>
          <small class="created-code">${escapeHtml(product.codigo || key)}</small>
          <div class="created-mobile-actions">
            <button type="button" class="history-use" data-use-created="${escapeHtml(key)}">Usar modelo</button>
            <button type="button" class="history-delete" data-delete-created="${escapeHtml(key)}">Apagar</button>
          </div>
        </div>
      </article>`;
    }).join('') : '<div class="history-empty">Nenhuma caneca corresponde a este filtro.</div>';
    if (more) {
      more.hidden = !state.hasMore;
      more.disabled = state.loadingMore;
      more.textContent = state.loadingMore ? 'Carregando…' : 'Carregar mais 4';
    }
  }

  function extractManualInstruction(effective = '') {
    const raw = text(effective);
    if (!raw) return '';
    const marker = 'INSTRUÇÃO COMPLEMENTAR DIGITADA:';
    const index = raw.lastIndexOf(marker);
    if (index >= 0) return text(raw.slice(index + marker.length));
    return /COMANDO SALVO \d+/i.test(raw) ? '' : raw;
  }

  async function recipeFromProduct(product = {}, model = null) {
    const effective = text(product.configuracao_arte?.instrucao_complementar || product.modelo_instrucao_efetiva || model?.instrucao_efetiva);
    let ids = product.modelo_comandos_ids
      || product.configuracao_arte?.comandos_salvos_ids
      || product.configuracao_arte?.comandos_ids
      || model?.comandos_ids
      || [];
    ids = Array.isArray(ids) ? [...new Set(ids.map(text).filter(Boolean))] : [];
    if (!state.commands.length) await fetchCommands().catch(() => []);
    if (!ids.length && effective) ids = state.commands.filter(command => effective.includes(command.texto)).map(command => command.id);
    const manual = text(product.configuracao_arte?.instrucao_manual || product.modelo_instrucao_manual || model?.instrucao_manual)
      || extractManualInstruction(effective);
    return { ids: [...new Set(ids)], manual, effective };
  }

  async function applyRecipe(key, model = null) {
    const product = state.created.find(item => productKey(item) === key) || await fetchProduct(key).catch(() => null) || {};
    const recipe = await recipeFromProduct(product, model);
    try { localStorage.setItem(SELECTED_KEY, JSON.stringify(recipe.ids)); } catch {}
    $('#clearCommandsButton')?.click();
    for (const id of recipe.ids) {
      const button = [...document.querySelectorAll('[data-command-id]')]
        .find(item => text(item.dataset.commandId) === id);
      button?.click();
    }
    const instruction = $('#instructionInput');
    if (instruction) instruction.value = recipe.manual || (!recipe.ids.length ? recipe.effective : '');
    showToast(`Modelo aplicado · ${recipe.ids.length} comando${recipe.ids.length === 1 ? '' : 's'} restaurado${recipe.ids.length === 1 ? '' : 's'}.`);
    $('#uploadCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function archiveMug(key, button) {
    if (state.deleting) return;
    const product = state.created.find(item => productKey(item) === key) || await fetchProduct(key).catch(() => null);
    if (!product) return showToast('Caneca não encontrada no Firebase.');
    const label = text(product.nome || key);
    if (!window.confirm(`Apagar a caneca “${label}”?\n\nEla será removida de Produtos e dos Modelos, mas ficará arquivada em produtos_excluidos para segurança.`)) return;

    state.deleting = true;
    if (button) button.disabled = true;
    try {
      const now = new Date().toISOString();
      const archived = {
        ...product,
        firebaseKey: key,
        id: text(product.id || key),
        situacao_anterior: product.situacao || product.status || 'A',
        arquivado_em: now,
        arquivado_motivo: 'Apagada pelo Caneca10 mobile',
        arquivado_origem: BUILD,
      };
      const archiveResponse = await fetch(`${FIREBASE_URL}/${ARCHIVE_NODE}/${encodeURIComponent(key)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(archived),
      });
      if (!archiveResponse.ok) throw new Error(`Firebase ${archiveResponse.status} ao arquivar.`);

      const deleteResponse = await fetch(`${FIREBASE_URL}/${PRODUCTS_NODE}/${encodeURIComponent(key)}.json`, { method: 'DELETE' });
      if (!deleteResponse.ok) throw new Error(`Firebase ${deleteResponse.status} ao apagar o produto.`);

      await Promise.allSettled([
        fetch(`${FIREBASE_URL}/${MODELS_NODE}/${encodeURIComponent(key)}.json`, { method: 'DELETE' }),
        fetch(`${FIREBASE_URL}/${PRIVATE_MODELS_NODE}/${encodeURIComponent(key)}.json`, { method: 'DELETE' }),
        fetch(`${FIREBASE_URL}/canecas/personalizadas/${encodeURIComponent(key)}.json`, { method: 'DELETE' }),
        fetch(`${FIREBASE_URL}/canecas/personalizadas_publicas/${encodeURIComponent(key)}.json`, { method: 'DELETE' }),
      ]);

      state.created = state.created.filter(item => productKey(item) !== key);
      state.models = state.models.filter(item => item.product_key !== key);
      renderModels();
      renderCreated();
      showToast('Caneca apagada do cadastro e removida dos modelos.');
    } catch (error) {
      console.error('Falha ao apagar caneca:', error);
      showToast(error?.message || String(error), 5200);
    } finally {
      state.deleting = false;
      if (button?.isConnected) button.disabled = false;
    }
  }

  async function refresh(reset = false, toast = false) {
    if (state.loading) return;
    if (reset) state.queryLimit = PAGE_SIZE;
    state.loading = true;
    $('#modelsStatus').textContent = 'Carregando modelos…';
    $('#createdStatus').textContent = 'Carregando 4 canecas…';
    try {
      const [createdResult, models] = await Promise.all([
        fetchCreated(state.queryLimit),
        fetchModels(),
      ]);
      state.created = createdResult.items;
      state.hasMore = createdResult.hasMore;
      state.models = models;
      renderModels();
      renderCreated();
      if (toast) showToast('Canecas e modelos atualizados.');
    } catch (error) {
      console.error('Falha ao carregar galeria do Caneca10:', error);
      $('#createdStatus').textContent = error?.message || String(error);
      $('#modelsStatus').textContent = 'Não foi possível atualizar os modelos.';
    } finally {
      state.loading = false;
    }
  }

  async function loadMore() {
    if (state.loadingMore || !state.hasMore) return;
    state.loadingMore = true;
    renderCreated();
    const previousCount = state.created.length;
    const nextLimit = state.queryLimit + PAGE_SIZE;
    try {
      const result = await fetchCreated(nextLimit);
      state.queryLimit = nextLimit;
      state.created = result.items;
      state.hasMore = result.hasMore && state.created.length > previousCount;
      renderCreated();
      if (state.created.length === previousCount) showToast('Não há mais canecas para carregar.');
    } catch (error) {
      console.error('Falha ao carregar mais canecas:', error);
      showToast(error?.message || String(error), 5000);
    } finally {
      state.loadingMore = false;
      renderCreated();
    }
  }

  function bindEvents() {
    $('#modelsRefresh')?.addEventListener('click', () => refresh(false, true));
    $('#createdRefresh')?.addEventListener('click', () => refresh(true, true));
    $('#createdLoadMore')?.addEventListener('click', loadMore);
    $('#createdSearch')?.addEventListener('input', renderCreated);
    $('#createdFilter')?.addEventListener('change', renderCreated);

    $('#modelsTrack')?.addEventListener('click', event => {
      const use = event.target.closest('[data-use-model]');
      if (!use) return;
      const key = text(use.dataset.useModel);
      const model = state.models.find(item => item.product_key === key) || null;
      if (key) applyRecipe(key, model);
    });

    $('#createdList')?.addEventListener('click', event => {
      const use = event.target.closest('[data-use-created]');
      if (use) {
        const key = text(use.dataset.useCreated);
        if (key) applyRecipe(key, state.models.find(item => item.product_key === key) || null);
        return;
      }
      const del = event.target.closest('[data-delete-created]');
      if (del) {
        const key = text(del.dataset.deleteCreated);
        if (key) archiveMug(key, del);
      }
    });

    const result = $('#resultSection');
    if (result) {
      new MutationObserver(() => {
        if (!result.hidden) setTimeout(() => refresh(true, false), 700);
      }).observe(result, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  async function init() {
    bindEvents();
    fetchCommands().catch(() => []);
    await refresh(true, false);
    console.info(`Galeria Caneca10 carregada · ${BUILD}`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
