const BUILD = '20260824-mug-phrases-lazy-json-v2';
const PAGE_SIZE = 20;
const PHRASES_URL = new URL('../data/canecas/frases-canecas-v1.json', import.meta.url).href;

let libraryPromise = null;

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

function validateLibrary(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.listas)) {
    throw new Error('Biblioteca de frases inválida.');
  }
  const lists = data.listas.filter(list => list && typeof list === 'object');
  if (lists.length !== 2) throw new Error('Biblioteca de frases incompleta.');
  for (const list of lists) {
    if (!list.id || !Array.isArray(list.frases) || list.frases.length !== 200) {
      throw new Error(`Lista ${list?.id || 'sem nome'} inválida.`);
    }
    if (!Array.isArray(list.categorias)) list.categorias = [];
  }
  return { ...data, listas: lists };
}

async function getLibrary() {
  if (libraryPromise) return libraryPromise;
  libraryPromise = fetch(PHRASES_URL, {
    cache: 'force-cache',
    headers: { Accept: 'application/json' },
  })
    .then(response => {
      if (!response.ok) throw new Error(`Frases indisponíveis (HTTP ${response.status}).`);
      return response.json();
    })
    .then(validateLibrary)
    .catch(error => {
      libraryPromise = null;
      throw error;
    });
  return libraryPromise;
}

function listById(data, id) {
  return data?.listas?.find(list => list.id === id) || data?.listas?.[0] || null;
}

function categoryForIndex(list, index) {
  const number = index + 1;
  return list.categorias.find(category => number >= Number(category.inicio) && number <= Number(category.fim))?.id || '';
}

function installStyles() {
  if (document.getElementById('mugPhraseLazyStyles')) return;
  const style = document.createElement('style');
  style.id = 'mugPhraseLazyStyles';
  style.textContent = `
    .mug-phrase-open{width:100%;margin-top:7px!important}
    #mugPhraseDialog{width:min(760px,calc(100vw - 28px));max-height:min(760px,calc(100vh - 28px));padding:0;border:0;border-radius:18px;box-shadow:0 22px 70px rgba(0,0,0,.28);overflow:hidden;background:#fff;color:#20231f}
    #mugPhraseDialog::backdrop{background:rgba(16,18,16,.48)}
    .mug-phrase-dialog-shell{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;max-height:min(760px,calc(100vh - 28px))}
    .mug-phrase-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px 12px;border-bottom:1px solid #e7e9e4}
    .mug-phrase-head h3{margin:0;font-size:20px}.mug-phrase-head p{margin:4px 0 0;color:#6b7068;font-size:12px}
    .mug-phrase-close{border:0;background:#f0f2ed;border-radius:10px;min-width:34px;height:34px;font-size:20px;cursor:pointer}
    .mug-phrase-controls{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px;padding:12px 18px;border-bottom:1px solid #eef0eb}
    .mug-phrase-controls select,.mug-phrase-controls input{width:100%;box-sizing:border-box;border:1px solid #ccd1c8;border-radius:10px;background:#fff;padding:9px 10px;font:inherit;font-size:12px;color:#242724}
    .mug-phrase-body{min-height:240px;overflow:auto;padding:12px 18px}
    .mug-phrase-status{font-size:11px;color:#6c7169;margin-bottom:8px}
    .mug-phrase-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
    .mug-phrase-item{border:1px solid #e0e3dc;background:#fafbf8;border-radius:11px;padding:9px 10px;text-align:left;cursor:pointer;font:inherit;font-size:12px;line-height:1.3;color:#20231f;min-height:48px}
    .mug-phrase-item:hover{border-color:#aeb5aa;background:#f4f6f1}
    .mug-phrase-empty{padding:30px 10px;text-align:center;color:#747a71;border:1px dashed #d7dbd2;border-radius:12px}
    .mug-phrase-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px 14px;border-top:1px solid #eef0eb}
    .mug-phrase-page{display:flex;align-items:center;gap:7px}.mug-phrase-page button{border:1px solid #d3d7cf;background:#fff;border-radius:8px;padding:6px 9px;cursor:pointer}.mug-phrase-page button:disabled{opacity:.4;cursor:default}
    .mug-phrase-page-label,.mug-phrase-applied{font-size:10.5px;color:#666c64}
    .mug-phrase-retry{border:1px solid #cdd2c9;background:#fff;border-radius:9px;padding:7px 10px;cursor:pointer}
    @media(max-width:620px){.mug-phrase-controls{grid-template-columns:1fr}.mug-phrase-results{grid-template-columns:1fr}.mug-phrase-head h3{font-size:17px}.mug-phrase-body{padding:10px 12px}.mug-phrase-head,.mug-phrase-controls,.mug-phrase-footer{padding-left:12px;padding-right:12px}}
  `;
  document.head.appendChild(style);
}

function ensureDialog() {
  let dialog = document.getElementById('mugPhraseDialog');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'mugPhraseDialog';
  dialog.innerHTML = `
    <div class="mug-phrase-dialog-shell">
      <header class="mug-phrase-head">
        <div>
          <h3>Frases para a arte</h3>
          <p>400 frases organizadas em duas listas. Apenas 20 resultados são exibidos por vez.</p>
        </div>
        <button class="mug-phrase-close" type="button" aria-label="Fechar">×</button>
      </header>
      <div class="mug-phrase-controls" hidden>
        <select id="mugPhraseList" aria-label="Lista de frases"></select>
        <select id="mugPhraseCategory" aria-label="Categoria"></select>
        <input id="mugPhraseSearch" type="search" placeholder="Buscar frase..." autocomplete="off">
      </div>
      <div class="mug-phrase-body">
        <div class="mug-phrase-status">As frases serão carregadas somente agora.</div>
        <div class="mug-phrase-results"><div class="mug-phrase-empty">Carregando frases…</div></div>
      </div>
      <footer class="mug-phrase-footer">
        <span class="mug-phrase-applied">Clique em uma frase para usar na instrução complementar.</span>
        <div class="mug-phrase-page" hidden>
          <button type="button" data-phrase-prev>←</button>
          <span class="mug-phrase-page-label">1/1</span>
          <button type="button" data-phrase-next>→</button>
        </div>
      </footer>
    </div>`;

  const state = {
    data: null,
    listId: 'religiosas',
    categoryId: 'all',
    query: '',
    page: 0,
    filtered: [],
    searchTimer: null,
    panel: null,
  };
  dialog.__mugPhraseState = state;

  dialog.querySelector('.mug-phrase-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dialog.close();
  });

  dialog.querySelector('#mugPhraseList')?.addEventListener('change', event => {
    state.listId = event.target.value;
    state.categoryId = 'all';
    state.page = 0;
    renderCategories(dialog);
    renderResults(dialog);
  });

  dialog.querySelector('#mugPhraseCategory')?.addEventListener('change', event => {
    state.categoryId = event.target.value;
    state.page = 0;
    renderResults(dialog);
  });

  dialog.querySelector('#mugPhraseSearch')?.addEventListener('input', event => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.query = event.target.value;
      state.page = 0;
      renderResults(dialog);
    }, 120);
  });

  dialog.querySelector('[data-phrase-prev]')?.addEventListener('click', () => {
    state.page = Math.max(0, state.page - 1);
    renderResults(dialog);
  });
  dialog.querySelector('[data-phrase-next]')?.addEventListener('click', () => {
    state.page += 1;
    renderResults(dialog);
  });

  dialog.querySelector('.mug-phrase-results')?.addEventListener('click', event => {
    const button = event.target.closest('[data-phrase-result]');
    if (!button) return;
    const item = state.filtered[Number(button.dataset.phraseResult)];
    const field = state.panel?.querySelector('#mugv7Instruction');
    if (!item || !field) return;
    field.value = item.phrase;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    const applied = dialog.querySelector('.mug-phrase-applied');
    if (applied) applied.textContent = `Aplicada: ${item.phrase}`;
    dialog.close();
  });

  document.body.appendChild(dialog);
  return dialog;
}

function renderListSelector(dialog) {
  const state = dialog.__mugPhraseState;
  const select = dialog.querySelector('#mugPhraseList');
  if (!state?.data || !select) return;
  select.innerHTML = state.data.listas
    .map(list => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.nome)} (${list.frases.length})</option>`)
    .join('');
  select.value = state.listId;
}

function renderCategories(dialog) {
  const state = dialog.__mugPhraseState;
  const select = dialog.querySelector('#mugPhraseCategory');
  const list = listById(state?.data, state?.listId);
  if (!list || !select) return;
  select.innerHTML = `<option value="all">Todas as categorias</option>`
    + list.categorias.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.nome)}</option>`).join('');
  select.value = state.categoryId;
}

function renderResults(dialog) {
  const state = dialog.__mugPhraseState;
  const list = listById(state?.data, state?.listId);
  const results = dialog.querySelector('.mug-phrase-results');
  const status = dialog.querySelector('.mug-phrase-status');
  const pager = dialog.querySelector('.mug-phrase-page');
  if (!list || !results || !status || !pager) return;

  const query = normalize(state.query);
  const filtered = list.frases
    .map((phrase, index) => ({ phrase, index }))
    .filter(item => state.categoryId === 'all' || categoryForIndex(list, item.index) === state.categoryId)
    .filter(item => !query || normalize(item.phrase).includes(query));

  state.filtered = filtered;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.max(0, Math.min(state.page, pages - 1));
  const start = state.page * PAGE_SIZE;
  const current = filtered.slice(start, start + PAGE_SIZE);

  status.textContent = `${filtered.length} frase${filtered.length === 1 ? '' : 's'} encontrada${filtered.length === 1 ? '' : 's'} · mostrando no máximo ${PAGE_SIZE} por página.`;
  results.innerHTML = current.length
    ? current.map((item, offset) => {
        const resultIndex = start + offset;
        return `<button class="mug-phrase-item" type="button" data-phrase-result="${resultIndex}"><strong>${String(item.index + 1).padStart(3, '0')} ·</strong> ${escapeHtml(item.phrase)}</button>`;
      }).join('')
    : '<div class="mug-phrase-empty">Nenhuma frase encontrada.</div>';

  pager.hidden = filtered.length <= PAGE_SIZE;
  const label = pager.querySelector('.mug-phrase-page-label');
  const prev = pager.querySelector('[data-phrase-prev]');
  const next = pager.querySelector('[data-phrase-next]');
  if (label) label.textContent = `${state.page + 1}/${pages}`;
  if (prev) prev.disabled = state.page <= 0;
  if (next) next.disabled = state.page >= pages - 1;
}

async function loadLibrary(dialog) {
  const state = dialog.__mugPhraseState;
  const controls = dialog.querySelector('.mug-phrase-controls');
  const results = dialog.querySelector('.mug-phrase-results');
  const status = dialog.querySelector('.mug-phrase-status');
  const pager = dialog.querySelector('.mug-phrase-page');
  if (state.data) {
    renderListSelector(dialog);
    renderCategories(dialog);
    renderResults(dialog);
    return;
  }

  if (controls) controls.hidden = true;
  if (pager) pager.hidden = true;
  if (status) status.textContent = 'Carregando biblioteca do GitHub…';
  if (results) results.innerHTML = '<div class="mug-phrase-empty">Carregando frases…</div>';

  try {
    state.data = await getLibrary();
    state.listId = state.data.listas[0]?.id || 'religiosas';
    state.categoryId = 'all';
    state.query = '';
    state.page = 0;
    const search = dialog.querySelector('#mugPhraseSearch');
    if (search) search.value = '';
    if (controls) controls.hidden = false;
    renderListSelector(dialog);
    renderCategories(dialog);
    renderResults(dialog);
  } catch (error) {
    if (status) status.textContent = 'A biblioteca de frases não pôde ser carregada. O Criador continua disponível normalmente.';
    if (results) results.innerHTML = `<div class="mug-phrase-empty">${escapeHtml(error?.message || error)}<br><br><button class="mug-phrase-retry" type="button">Tentar novamente</button></div>`;
    results?.querySelector('.mug-phrase-retry')?.addEventListener('click', () => loadLibrary(dialog), { once: true });
  }
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
  openButton.textContent = 'Frases para a arte · 400';
  openButton.title = 'Abrir biblioteca de 200 frases religiosas e 200 motivacionais';
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

export { install, openLibrary, getLibrary };
