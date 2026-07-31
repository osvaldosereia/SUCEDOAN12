(() => {
  'use strict';

  const VERSION = '20260730-17';
  const STYLE_ID = 'canecasLayoutV17Styles';
  const RAIL_ID = 'canecasPreviewRailV17';
  const DELETE_BAR_ID = 'generatedDeleteBarV17';
  const SELECTED_CLASS = 'selected-for-delete-v17';
  const selected = new Map();
  let previewRoot = null;
  let previewPlaceholder = null;
  let layoutTimer = 0;
  let catalogTimer = 0;
  let deleting = false;

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  function toast(message, type = 'ok') {
    const area = $('#toastArea');
    if (!area) {
      alert(message);
      return;
    }
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.textContent = message;
    area.appendChild(element);
    setTimeout(() => element.remove(), 4800);
  }

  function injectStyles() {
    if ($('#' + STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root{--canecas-v17-rail-width:clamp(390px,42vw,650px);--canecas-v17-gap:22px}
      body.canecas-fixed-preview-v17 main{padding-right:calc(var(--canecas-v17-rail-width) + var(--canecas-v17-gap))!important}
      body.canecas-fixed-preview-v17 main>*:not(#${RAIL_ID}):not(#printRoot):not(dialog){max-width:100%!important}
      #${RAIL_ID}{position:fixed;z-index:35;top:14px;right:14px;bottom:14px;width:var(--canecas-v17-rail-width);display:flex;flex-direction:column;overflow:auto;overscroll-behavior:contain;background:var(--surface,#fff);border:1px solid var(--line,#e6dbd1);border-radius:18px;box-shadow:0 18px 50px rgba(50,32,22,.16)}
      #${RAIL_ID} .preview-rail-head-v17{position:sticky;top:0;z-index:4;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);border-bottom:1px solid var(--line,#e6dbd1)}
      #${RAIL_ID} .preview-rail-head-v17 strong{font-size:13px}#${RAIL_ID} .preview-rail-head-v17 span{font-size:10px;color:var(--muted,#746b65);text-align:right}
      #${RAIL_ID} .preview-rail-body-v17{min-height:0;padding:10px;display:flex;flex-direction:column}
      #${RAIL_ID} .preview-rail-body-v17>*{width:100%!important;max-width:none!important;margin:0!important;box-shadow:none!important;border:0!important}
      #${RAIL_ID} canvas,#${RAIL_ID} img{max-width:100%!important;height:auto!important}
      #${RAIL_ID} .card-head{position:relative!important;top:auto!important}
      .preview-placeholder-v17{display:none!important}

      #${DELETE_BAR_ID}{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0 4px;padding:10px 12px;border:1px solid var(--line,#e6dbd1);border-radius:13px;background:#fcfaf8}
      #${DELETE_BAR_ID} .delete-select-all-v17{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;cursor:pointer}
      #${DELETE_BAR_ID} input{width:auto!important;margin:0}
      #${DELETE_BAR_ID} .delete-actions-v17{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      #generatedSelectedCountV17{font-size:11px;color:var(--muted,#746b65);font-weight:800}
      .generated-select-v17{position:absolute;z-index:5;top:8px;left:8px;display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid rgba(112,66,47,.25);border-radius:999px;background:rgba(255,255,255,.96);box-shadow:0 4px 14px rgba(40,25,18,.12);font-size:10px;font-weight:900;cursor:pointer}
      .generated-select-v17 input{width:auto!important;margin:0;accent-color:var(--brand,#70422f)}
      .archive-item.enhanced-delete-v17{position:relative;transition:box-shadow .18s ease,transform .18s ease,border-color .18s ease}
      .archive-item.${SELECTED_CLASS}{border-color:var(--brand,#70422f)!important;box-shadow:0 0 0 3px rgba(112,66,47,.16)!important;transform:translateY(-1px)}
      .archive-item.${SELECTED_CLASS} img{opacity:.82}

      @media(max-width:1120px){
        :root{--canecas-v17-rail-width:390px}
      }
      @media(max-width:900px){
        body.canecas-fixed-preview-v17 main{padding-right:inherit!important}
        #${RAIL_ID}{position:sticky;top:0;right:auto;bottom:auto;width:auto;max-height:70vh;margin:0 10px 14px;z-index:35}
        #${RAIL_ID} .preview-rail-head-v17 span{display:none}
      }
      @media print{
        #${RAIL_ID},#${DELETE_BAR_ID},.generated-select-v17{display:none!important}
        body.canecas-fixed-preview-v17 main{padding-right:0!important}
      }
    `;
    document.head.appendChild(style);
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findPreviewCanvas() {
    const preferred = [
      '#sheetPreview',
      '#previewCanvas',
      '.sheet-preview canvas',
      '.preview canvas',
      '.preview-area canvas',
      '.workspace canvas'
    ];
    for (const selector of preferred) {
      const candidate = $(selector);
      if (candidate && isVisible(candidate) && !candidate.closest('#printRoot,dialog')) return candidate;
    }
    return $$('canvas').find(canvas => {
      if (!isVisible(canvas) || canvas.closest('#printRoot,dialog')) return false;
      const width = Number(canvas.width || canvas.clientWidth);
      const height = Number(canvas.height || canvas.clientHeight);
      if (!width || !height) return false;
      const ratio = width / height;
      return ratio > 2.15 && ratio < 2.95;
    }) || null;
  }

  function directChildInside(element, ancestor) {
    let node = element;
    while (node && node.parentElement && node.parentElement !== ancestor) node = node.parentElement;
    return node && node.parentElement === ancestor ? node : null;
  }

  function scorePreviewRoot(element) {
    if (!element) return -1;
    const text = String(element.textContent || '').toLowerCase();
    let score = 0;
    if (/visualiza|prévia|preview|folha/.test(text)) score += 4;
    if (/pdf|imprimir|baixar|download/.test(text)) score += 5;
    if (element.querySelector('canvas')) score += 3;
    if (element.querySelector('button')) score += 1;
    if (element.matches('.card,aside,section')) score += 1;
    return score;
  }

  function findPreviewRoot(canvas) {
    if (!canvas) return null;
    const workspace = canvas.closest('.workspace');
    if (workspace) {
      const branch = directChildInside(canvas, workspace);
      if (branch && branch !== workspace) return branch;
    }

    const candidates = [];
    let node = canvas;
    const main = canvas.closest('main');
    while (node && node !== main && candidates.length < 8) {
      if (node.matches?.('.card,aside,section,.preview-panel,.sheet-panel,.workspace-side')) candidates.push(node);
      node = node.parentElement;
    }
    candidates.sort((a, b) => scorePreviewRoot(b) - scorePreviewRoot(a));
    return candidates[0] || canvas.parentElement;
  }

  function ensureRail() {
    let rail = $('#' + RAIL_ID);
    if (rail) return rail;
    rail = document.createElement('aside');
    rail.id = RAIL_ID;
    rail.setAttribute('aria-label', 'Visualizador fixo das artes da caneca');
    rail.innerHTML = `<div class="preview-rail-head-v17"><strong>Visualizador das artes</strong><span>Sempre visível · impressão e PDF</span></div><div class="preview-rail-body-v17"></div>`;
    document.body.appendChild(rail);
    document.body.classList.add('canecas-fixed-preview-v17');
    return rail;
  }

  function mountFixedPreview() {
    injectStyles();
    const canvas = findPreviewCanvas();
    if (!canvas) return;
    const root = findPreviewRoot(canvas);
    if (!root || root.id === RAIL_ID || root.closest('#' + RAIL_ID)) return;

    if (previewRoot && previewRoot !== root && previewRoot.isConnected && previewRoot.closest('#' + RAIL_ID)) return;

    const rail = ensureRail();
    const body = $('.preview-rail-body-v17', rail);
    if (!body) return;

    if (!previewPlaceholder) {
      previewPlaceholder = document.createElement('div');
      previewPlaceholder.className = 'preview-placeholder-v17';
      previewPlaceholder.dataset.version = VERSION;
      root.insertAdjacentElement('beforebegin', previewPlaceholder);
    }

    previewRoot = root;
    previewRoot.dataset.fixedPreviewV17 = '1';
    body.appendChild(previewRoot);
  }

  function readSettings() {
    let settings = {};
    try { settings = JSON.parse(localStorage.getItem('canecasStudioSettings') || '{}'); } catch {}
    return {
      owner: settings.owner || 'osvaldosereia',
      repo: settings.repo || 'SUCEDOAN12',
      branch: settings.branch || 'main',
      folder: String(settings.folder || 'canecas/imagens').replace(/^\/+|\/+$/g, ''),
      token: sessionStorage.getItem('canecasGithubToken') || ''
    };
  }

  function pathFromImageUrl(source) {
    if (!source) return '';
    const settings = readSettings();
    let decoded = '';
    try { decoded = decodeURIComponent(new URL(source, location.href).pathname); }
    catch { decoded = decodeURIComponent(String(source)); }

    const marker = `/${settings.folder}/artes-geradas/`;
    const markerIndex = decoded.indexOf(marker);
    if (markerIndex >= 0) return decoded.slice(markerIndex + 1).replace(/^\/+/, '');

    const rawPrefix = `/${settings.owner}/${settings.repo}/${settings.branch}/`;
    const rawIndex = decoded.indexOf(rawPrefix);
    if (rawIndex >= 0) return decoded.slice(rawIndex + rawPrefix.length).replace(/^\/+/, '');

    const contentMarker = '/contents/';
    const contentIndex = decoded.indexOf(contentMarker);
    if (contentIndex >= 0) return decoded.slice(contentIndex + contentMarker.length).replace(/^\/+/, '');

    return '';
  }

  function updateSelectionUi() {
    const count = selected.size;
    const countElement = $('#generatedSelectedCountV17');
    const deleteButton = $('#deleteGeneratedSelectedV17');
    const selectAll = $('#selectAllGeneratedV17');
    const cards = $$('.archive #archiveGrid .archive-item.enhanced-delete-v17');
    const selectedOnPage = cards.filter(card => card.classList.contains(SELECTED_CLASS)).length;

    if (countElement) countElement.textContent = count ? `${count} arte(s) selecionada(s)` : 'Nenhuma arte selecionada';
    if (deleteButton) {
      deleteButton.disabled = count === 0 || deleting;
      deleteButton.textContent = deleting ? 'Apagando...' : `🗑 Apagar selecionada${count === 1 ? '' : 's'}`;
    }
    if (selectAll) {
      selectAll.checked = cards.length > 0 && selectedOnPage === cards.length;
      selectAll.indeterminate = selectedOnPage > 0 && selectedOnPage < cards.length;
    }
  }

  function setCardSelected(card, checked) {
    const path = card.dataset.generatedPathV17 || '';
    const image = $('img', card);
    const checkbox = $('.generated-select-v17 input', card);
    if (!path || !image) return;

    card.classList.toggle(SELECTED_CLASS, checked);
    if (checkbox) checkbox.checked = checked;
    if (checked) selected.set(path, {path, card, source:image.currentSrc || image.src});
    else selected.delete(path);
    updateSelectionUi();
  }

  function enhanceGeneratedCards() {
    const cards = $$('.archive #archiveGrid .archive-item');
    cards.forEach(card => {
      const image = $('img', card);
      if (!image) return;
      const path = pathFromImageUrl(image.currentSrc || image.src);
      if (!path) return;

      card.dataset.generatedPathV17 = path;
      card.classList.add('enhanced-delete-v17');
      if (!$('.generated-select-v17', card)) {
        const label = document.createElement('label');
        label.className = 'generated-select-v17';
        label.title = 'Selecionar esta arte para apagar';
        label.innerHTML = '<input type="checkbox" aria-label="Selecionar arte para apagar"><span>Selecionar</span>';
        const input = $('input', label);
        input.addEventListener('change', event => {
          event.stopPropagation();
          setCardSelected(card, input.checked);
        });
        label.addEventListener('click', event => event.stopPropagation());
        card.appendChild(label);
      }

      const shouldRemainSelected = selected.has(path);
      card.classList.toggle(SELECTED_CLASS, shouldRemainSelected);
      const checkbox = $('.generated-select-v17 input', card);
      if (checkbox) checkbox.checked = shouldRemainSelected;
    });

    for (const [path, record] of selected) {
      if (record.card && !record.card.isConnected) selected.delete(path);
    }
    updateSelectionUi();
  }

  function ensureDeleteBar() {
    const archive = $('.archive');
    const grid = $('#archiveGrid', archive || document);
    if (!archive || !grid || $('#' + DELETE_BAR_ID)) return;

    const bar = document.createElement('div');
    bar.id = DELETE_BAR_ID;
    bar.innerHTML = `<label class="delete-select-all-v17"><input id="selectAllGeneratedV17" type="checkbox"><span>Selecionar todas desta página</span></label><div class="delete-actions-v17"><span id="generatedSelectedCountV17">Nenhuma arte selecionada</span><button id="deleteGeneratedSelectedV17" class="btn small danger" type="button" disabled>🗑 Apagar selecionadas</button></div>`;
    grid.insertAdjacentElement('beforebegin', bar);

    $('#selectAllGeneratedV17', bar).addEventListener('change', event => {
      $$('.archive #archiveGrid .archive-item.enhanced-delete-v17').forEach(card => setCardSelected(card, event.target.checked));
    });
    $('#deleteGeneratedSelectedV17', bar).addEventListener('click', deleteSelectedGenerated);
  }

  function apiEndpoint(path) {
    const settings = readSettings();
    return `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  async function githubRequest(url, options = {}) {
    const settings = readSettings();
    if (!settings.token) throw new Error('Informe o token do GitHub em Integrações para apagar artes do catálogo.');
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${settings.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).message || ''; } catch {}
      throw new Error(`GitHub respondeu HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function fetchSha(path) {
    const settings = readSettings();
    const data = await githubRequest(`${apiEndpoint(path)}?ref=${encodeURIComponent(settings.branch)}`);
    if (!data?.sha) throw new Error(`Não foi possível localizar ${path.split('/').pop()} no GitHub.`);
    return data.sha;
  }

  async function deleteGithubFile(path) {
    const settings = readSettings();
    const sha = await fetchSha(path);
    await githubRequest(apiEndpoint(path), {
      method: 'DELETE',
      body: JSON.stringify({
        message: `canecas: apagar arte ${path.split('/').pop()}`,
        sha,
        branch: settings.branch
      })
    });
  }

  async function deleteSelectedGenerated() {
    if (deleting || !selected.size) return;
    const settings = readSettings();
    if (!settings.token) {
      toast('Informe o token do GitHub em Integrações para apagar artes do catálogo.', 'error');
      return;
    }

    const records = [...selected.values()];
    const confirmation = records.length === 1
      ? 'Apagar definitivamente esta arte do catálogo e do GitHub?'
      : `Apagar definitivamente ${records.length} artes do catálogo e do GitHub?`;
    if (!confirm(confirmation)) return;

    deleting = true;
    updateSelectionUi();
    const failures = [];
    let deleted = 0;

    for (const record of records) {
      try {
        await deleteGithubFile(record.path);
        selected.delete(record.path);
        record.card?.remove();
        deleted++;
      } catch (error) {
        failures.push(`${record.path.split('/').pop()}: ${error.message}`);
      }
    }

    deleting = false;
    updateSelectionUi();

    if (deleted) toast(`${deleted} arte(s) apagada(s) do catálogo.`, 'ok');
    if (failures.length) toast(`${failures.length} arte(s) não foram apagadas. ${failures[0]}`, 'error');

    const refresh = $('#refreshArchiveBtn');
    if (deleted && refresh && !refresh.disabled) refresh.click();
  }

  function initializeCatalogDeletion() {
    ensureDeleteBar();
    enhanceGeneratedCards();
  }

  function initialize() {
    injectStyles();
    mountFixedPreview();
    initializeCatalogDeletion();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(layoutTimer);
    clearTimeout(catalogTimer);
    layoutTimer = setTimeout(mountFixedPreview, 80);
    catalogTimer = setTimeout(initializeCatalogDeletion, 100);
  });

  observer.observe(document.documentElement, {childList:true, subtree:true, attributes:true, attributeFilter:['src','class']});
  window.addEventListener('resize', () => {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(mountFixedPreview, 120);
  });

  const timer = setInterval(initialize, 350);
  setTimeout(() => clearInterval(timer), 20000);
  initialize();
})();