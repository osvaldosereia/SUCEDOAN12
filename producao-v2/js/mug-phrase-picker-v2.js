const BUILD = '20260824-mug-phrases-curated-v5';
const PAGE_SIZE = 20;
const INDEX_URL = new URL('../data/canecas/catalogos-curados/index-v2.json', import.meta.url).href;
const LEGACY_URL = new URL('../data/canecas/frases-canecas-v1.json', import.meta.url).href;

let indexPromise = null;
let legacyPromise = null;
const catalogCache = new Map();

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'force-cache',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Frases indisponíveis (HTTP ${response.status}).`);
  return response.json();
}

async function getIndex() {
  if (!indexPromise) {
    indexPromise = fetchJson(INDEX_URL).then(data => {
      if (!data || data.v !== 2 || !Array.isArray(data.catalogos) || data.catalogos.length !== 24) {
        throw new Error('Índice dos catálogos curados inválido.');
      }
      return data;
    }).catch(error => {
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
}

async function getLegacy() {
  if (!legacyPromise) {
    legacyPromise = fetchJson(LEGACY_URL).catch(error => {
      legacyPromise = null;
      throw error;
    });
  }
  return legacyPromise;
}

function catalogMetas(index) {
  return [
    { id: 'religiosas', nome: 'Religiosas', grupo: 'Fé e inspiração', legacy: true },
    { id: 'motivacionais', nome: 'Motivacionais', grupo: 'Fé e inspiração', legacy: true },
    ...index.catalogos.map(item => ({ ...item, curated: true })),
  ];
}

function validateCurated(data, meta) {
  if (!data || data.v !== 2 || data.id !== meta.id || !Array.isArray(data.frases) || !data.frases.length) {
    throw new Error(`Catálogo ${meta.nome} inválido.`);
  }
  if (!Array.isArray(data.categorias) || !data.categorias.length) {
    throw new Error(`Catálogo ${meta.nome} sem categorias.`);
  }
  const categories = new Set(data.categorias.map(item => item.id));
  const frases = data.frases.map((item, index) => {
    const phrase = Array.isArray(item) ? item[0] : '';
    const categoryId = Array.isArray(item) ? item[1] : '';
    if (!phrase || !categories.has(categoryId)) {
      throw new Error(`Frase ${index + 1} inválida em ${meta.nome}.`);
    }
    return { phrase, categoryId, index };
  });
  return {
    id: data.id,
    nome: data.nome || meta.nome,
    grupo: data.grupo || meta.grupo,
    categorias: data.categorias,
    frases,
  };
}

function validateLegacy(data, meta) {
  const list = data?.listas?.find(item => item?.id === meta.id);
  if (!list || !Array.isArray(list.frases) || list.frases.length !== 200) {
    throw new Error(`Catálogo ${meta.nome} inválido.`);
  }
  const categories = Array.isArray(list.categorias) ? list.categorias : [];
  const frases = list.frases.map((phrase, index) => {
    const number = index + 1;
    const categoryId = categories.find(category => number >= Number(category.inicio) && number <= Number(category.fim))?.id || 'all';
    return { phrase, categoryId, index };
  });
  return {
    id: meta.id,
    nome: meta.nome,
    grupo: meta.grupo,
    categorias: categories.map(item => ({ id: item.id, nome: item.nome })),
    frases,
  };
}

async function getCatalog(meta) {
  if (catalogCache.has(meta.id)) return catalogCache.get(meta.id);
  let catalog;
  if (meta.legacy) {
    catalog = validateLegacy(await getLegacy(), meta);
  } else {
    const url = new URL(`../data/canecas/catalogos-curados/${meta.arquivo}`, import.meta.url).href;
    catalog = validateCurated(await fetchJson(url), meta);
  }
  catalogCache.set(meta.id, catalog);
  return catalog;
}

function installStyles() {
  if (document.getElementById('mugPhraseLazyStyles')) return;
  const style = document.createElement('style');
  style.id = 'mugPhraseLazyStyles';
  style.textContent = `
    .mug-phrase-open{width:100%;margin-top:7px!important}
    #mugPhraseDialog{width:min(860px,calc(100vw - 28px));max-height:min(790px,calc(100vh - 28px));padding:0;border:0;border-radius:18px;box-shadow:0 22px 70px rgba(0,0,0,.28);overflow:hidden;background:#fff;color:#20231f}
    #mugPhraseDialog::backdrop{background:rgba(16,18,16,.48)}
    .mug-phrase-shell{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;max-height:min(790px,calc(100vh - 28px))}
    .mug-phrase-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px 12px;border-bottom:1px solid #e7e9e4}
    .mug-phrase-head h3{margin:0;font-size:20px}.mug-phrase-head p{margin:4px 0 0;color:#6b7068;font-size:12px}
    .mug-phrase-close{border:0;background:#f0f2ed;border-radius:10px;min-width:34px;height:34px;font-size:20px;cursor:pointer}
    .mug-phrase-controls{display:grid;grid-template-columns:1.2fr 1fr 1.4fr;gap:8px;padding:12px 18px;border-bottom:1px solid #eef0eb}
    .mug-phrase-controls select,.mug-phrase-controls input{width:100%;box-sizing:border-box;border:1px solid #ccd1c8;border-radius:10px;background:#fff;padding:9px 10px;font:inherit;font-size:12px;color:#242724}
    .mug-phrase-body{min-height:260px;overflow:auto;padding:12px 18px}
    .mug-phrase-status{font-size:11px;color:#6c7169;margin-bottom:8px}
    .mug-phrase-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
    .mug-phrase-item{border:1px solid #e0e3dc;background:#fafbf8;border-radius:11px;padding:9px 10px;text-align:left;cursor:pointer;font:inherit;font-size:12px;line-height:1.35;color:#20231f;min-height:48px}
    .mug-phrase-item:hover{border-color:#aeb5aa;background:#f4f6f1}
    .mug-phrase-empty{grid-column:1/-1;padding:30px 10px;text-align:center;color:#747a71;border:1px dashed #d7dbd2;border-radius:12px}
    .mug-phrase-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px 14px;border-top:1px solid #eef0eb}
    .mug-phrase-page{display:flex;align-items:center;gap:7px}.mug-phrase-page button,.mug-phrase-retry{border:1px solid #d3d7cf;background:#fff;border-radius:8px;padding:6px 9px;cursor:pointer}.mug-phrase-page button:disabled{opacity:.4;cursor:default}
    .mug-phrase-page-label,.mug-phrase-applied{font-size:10.5px;color:#666c64}
    @media(max-width:620px){.mug-phrase-controls,.mug-phrase-results{grid-template-columns:1fr}.mug-phrase-head,.mug-phrase-controls,.mug-phrase-foot{padding-left:12px;padding-right:12px}.mug-phrase-head h3{font-size:17px}}
  `;
  document.head.appendChild(style);
}

function ensureDialog() {
  let dialog = document.getElementById('mugPhraseDialog');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'mugPhraseDialog';
  dialog.innerHTML = `
    <div class="mug-phrase-shell">
      <header class="mug-phrase-head">
        <div><h3>Frases para a arte</h3><p>26 catálogos: 2 clássicos e 24 curados manualmente. Só 20 resultados aparecem por página.</p></div>
        <button class="mug-phrase-close" type="button" aria-label="Fechar">×</button>
      </header>
      <div class="mug-phrase-controls" hidden>
        <select id="mugPhraseCatalog" aria-label="Catálogo"></select>
        <select id="mugPhraseCategory" aria-label="Categoria"></select>
        <input id="mugPhraseSearch" type="search" placeholder="Buscar neste catálogo..." autocomplete="off">
      </div>
      <div class="mug-phrase-body">
        <div class="mug-phrase-status">Preparando biblioteca curada…</div>
        <div class="mug-phrase-results"><div class="mug-phrase-empty">Carregando índice…</div></div>
      </div>
      <footer class="mug-phrase-foot">
        <span class="mug-phrase-applied">Clique em uma frase para usar na instrução complementar.</span>
        <div class="mug-phrase-page" hidden><button type="button" data-prev>←</button><span class="mug-phrase-page-label">1/1</span><button type="button" data-next>→</button></div>
      </footer>
    </div>`;

  dialog.__mugPhraseState = {
    metas: [],
    catalogId: 'religiosas',
    catalog: null,
    categoryId: 'all',
    query: '',
    page: 0,
    filtered: [],
    panel: null,
    token: 0,
    searchTimer: null,
  };

  dialog.querySelector('.mug-phrase-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
  dialog.querySelector('#mugPhraseCatalog').addEventListener('change', event => {
    const state = dialog.__mugPhraseState;
    state.catalogId = event.target.value;
    state.categoryId = 'all';
    state.query = '';
    state.page = 0;
    dialog.querySelector('#mugPhraseSearch').value = '';
    loadSelectedCatalog(dialog);
  });
  dialog.querySelector('#mugPhraseCategory').addEventListener('change', event => {
    const state = dialog.__mugPhraseState;
    state.categoryId = event.target.value;
    state.page = 0;
    renderResults(dialog);
  });
  dialog.querySelector('#mugPhraseSearch').addEventListener('input', event => {
    const state = dialog.__mugPhraseState;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.query = event.target.value;
      state.page = 0;
      renderResults(dialog);
    }, 120);
  });
  dialog.querySelector('[data-prev]').addEventListener('click', () => {
    const state = dialog.__mugPhraseState;
    state.page = Math.max(0, state.page - 1);
    renderResults(dialog);
  });
  dialog.querySelector('[data-next]').addEventListener('click', () => {
    dialog.__mugPhraseState.page += 1;
    renderResults(dialog);
  });
  dialog.querySelector('.mug-phrase-results').addEventListener('click', event => {
    const button = event.target.closest('[data-result]');
    if (!button) return;
    const state = dialog.__mugPhraseState;
    const item = state.filtered[Number(button.dataset.result)];
    const field = state.panel?.querySelector('#mugv7Instruction');
    if (!item || !field) return;
    field.value = item.phrase;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    dialog.querySelector('.mug-phrase-applied').textContent = `Aplicada: ${item.phrase}`;
    dialog.close();
  });

  document.body.appendChild(dialog);
  return dialog;
}

function renderCatalogSelector(dialog) {
  const state = dialog.__mugPhraseState;
  const select = dialog.querySelector('#mugPhraseCatalog');
  const groups = new Map();
  for (const meta of state.metas) {
    if (!groups.has(meta.grupo)) groups.set(meta.grupo, []);
    groups.get(meta.grupo).push(meta);
  }
  select.innerHTML = [...groups.entries()].map(([group, items]) =>
    `<optgroup label="${escapeHtml(group)}">${items.map(meta => `<option value="${escapeHtml(meta.id)}">${escapeHtml(meta.nome)}</option>`).join('')}</optgroup>`
  ).join('');
  select.value = state.catalogId;
}

function renderCategories(dialog) {
  const state = dialog.__mugPhraseState;
  const select = dialog.querySelector('#mugPhraseCategory');
  const categories = state.catalog?.categorias || [];
  select.innerHTML = '<option value="all">Todas as categorias</option>' + categories.map(category =>
    `<option value="${escapeHtml(category.id)}">${escapeHtml(category.nome)}</option>`
  ).join('');
  select.value = state.categoryId;
}

function renderResults(dialog) {
  const state = dialog.__mugPhraseState;
  if (!state.catalog) return;
  const query = normalize(state.query);
  const filtered = state.catalog.frases
    .filter(item => state.categoryId === 'all' || item.categoryId === state.categoryId)
    .filter(item => !query || normalize(item.phrase).includes(query));
  state.filtered = filtered;

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.max(0, Math.min(state.page, pages - 1));
  const start = state.page * PAGE_SIZE;
  const current = filtered.slice(start, start + PAGE_SIZE);

  dialog.querySelector('.mug-phrase-status').textContent = `${state.catalog.nome} · ${filtered.length} frase${filtered.length === 1 ? '' : 's'} · máximo ${PAGE_SIZE} por página.`;
  dialog.querySelector('.mug-phrase-results').innerHTML = current.length
    ? current.map((item, offset) => `<button class="mug-phrase-item" type="button" data-result="${start + offset}"><strong>${String(item.index + 1).padStart(3, '0')} ·</strong> ${escapeHtml(item.phrase)}</button>`).join('')
    : '<div class="mug-phrase-empty">Nenhuma frase encontrada.</div>';

  const pager = dialog.querySelector('.mug-phrase-page');
  pager.hidden = filtered.length <= PAGE_SIZE;
  pager.querySelector('.mug-phrase-page-label').textContent = `${state.page + 1}/${pages}`;
  pager.querySelector('[data-prev]').disabled = state.page <= 0;
  pager.querySelector('[data-next]').disabled = state.page >= pages - 1;
}

async function loadSelectedCatalog(dialog) {
  const state = dialog.__mugPhraseState;
  const meta = state.metas.find(item => item.id === state.catalogId) || state.metas[0];
  if (!meta) return;
  const token = ++state.token;
  state.catalog = null;
  dialog.querySelector('.mug-phrase-results').innerHTML = `<div class="mug-phrase-empty">Carregando ${escapeHtml(meta.nome)}…</div>`;
  dialog.querySelector('.mug-phrase-status').textContent = 'Carregando somente o catálogo selecionado…';
  try {
    const catalog = await getCatalog(meta);
    if (token !== state.token) return;
    state.catalog = catalog;
    state.categoryId = 'all';
    state.page = 0;
    renderCategories(dialog);
    renderResults(dialog);
  } catch (error) {
    if (token !== state.token) return;
    const results = dialog.querySelector('.mug-phrase-results');
    results.innerHTML = `<div class="mug-phrase-empty">${escapeHtml(error?.message || error)}<br><br><button class="mug-phrase-retry" type="button">Tentar novamente</button></div>`;
    results.querySelector('.mug-phrase-retry')?.addEventListener('click', () => loadSelectedCatalog(dialog), { once: true });
  }
}

async function loadLibrary(dialog) {
  const state = dialog.__mugPhraseState;
  if (!state.metas.length) {
    try {
      state.metas = catalogMetas(await getIndex());
      renderCatalogSelector(dialog);
      dialog.querySelector('.mug-phrase-controls').hidden = false;
    } catch (error) {
      dialog.querySelector('.mug-phrase-status').textContent = 'A biblioteca curada não pôde ser carregada. O Criador continua funcionando normalmente.';
      dialog.querySelector('.mug-phrase-results').innerHTML = `<div class="mug-phrase-empty">${escapeHtml(error?.message || error)}</div>`;
      return;
    }
  }
  await loadSelectedCatalog(dialog);
}

function openLibrary(panel) {
  const dialog = ensureDialog();
  dialog.__mugPhraseState.panel = panel;
  if (!dialog.open) dialog.showModal();
  loadLibrary(dialog);
}

function install(panel) {
  if (!panel?.classList.contains('mugv7') || panel.dataset.phraseLazyBuild === BUILD) return false;
  const instruction = panel.querySelector('.mugv7-instruction');
  if (!instruction) return false;
  installStyles();
  panel.dataset.phraseLazyBuild = BUILD;
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'button secondary compact mug-phrase-open';
  openButton.textContent = 'Frases para a arte · curadas';
  openButton.title = 'Abrir biblioteca com frases clássicas e catálogos curados para canecas';
  openButton.addEventListener('click', () => openLibrary(panel));
  instruction.appendChild(openButton);
  return true;
}

function activate(attempt = 0) {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  const panel = document.getElementById('mugAutomationPanel');
  if (install(panel)) return;
  if (attempt < 20) setTimeout(() => activate(attempt + 1), 100);
}

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(() => activate(), 0);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(() => activate(), 0);
});
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => activate(), 0), { once: true });
} else {
  setTimeout(() => activate(), 0);
}

export { install, openLibrary, getCatalog };