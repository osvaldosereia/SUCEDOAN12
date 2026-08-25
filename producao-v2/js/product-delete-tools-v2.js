import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { archiveProduct, loadProduct } from './services/firebase.js';
import { productName, text } from './core/utils.js';

let deleting = false;
let enhancing = false;
let scheduled = false;
const selectedKeys = new Set();

function config() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  if (!region) return void alert(message);
  const normalized = text(message);
  if (!normalized) return;
  if ([...region.querySelectorAll('.toast')].some(node => node.textContent === normalized)) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = normalized;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 8500 : 4200);
}

function hasPendingChanges() {
  return document.getElementById('dirtyIndicator')?.classList.contains('active');
}

function normalizeRepoPath(value) {
  return text(value).replace(/^\/+/, '').replace(/[?#].*$/, '');
}

function imageRoots(cfg) {
  return [...new Set([
    normalizeRepoPath(cfg.githubImagesPath || 'site/img/produtos_3'),
    'site/img/produtos', 'site/img/produtos_2', 'site/img/produtos_3', 'canecas/imagens',
  ].filter(Boolean))];
}

function allowedImagePath(path, cfg) {
  const clean = normalizeRepoPath(path);
  return !!clean && !clean.includes('..') && imageRoots(cfg).some(root => clean === root || clean.startsWith(`${root}/`));
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    if (text(value)) out.push(text(value));
  } else if (Array.isArray(value)) {
    value.forEach(item => collectStrings(item, out));
  } else if (value && typeof value === 'object') {
    ['path','url','src','imagem','imagem_url','url_imagem','foto','image'].forEach(field => {
      if (Object.prototype.hasOwnProperty.call(value, field)) collectStrings(value[field], out);
    });
  }
  return out;
}

function pathFromGithubUrl(value, cfg) {
  const raw = text(value);
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const parsed = new URL(raw);
    const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const owner = text(cfg.githubOwner);
    const repo = text(cfg.githubRepo);
    const branch = text(cfg.githubBranch || 'main');
    if (parsed.hostname === 'raw.githubusercontent.com' && segments[0] === owner && segments[1] === repo && segments[2] === branch) return segments.slice(3).join('/');
    if (parsed.hostname === 'github.com' && segments[0] === owner && segments[1] === repo && segments[2] === 'blob' && segments[3] === branch) return segments.slice(4).join('/');
    const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
    if (allowedImagePath(pathname, cfg)) return pathname;
    if (allowedImagePath(`site/${pathname}`, cfg)) return `site/${pathname}`;
    const siteMarker = pathname.indexOf('site/img/produtos');
    if (siteMarker >= 0) return pathname.slice(siteMarker);
    const mugMarker = pathname.indexOf('canecas/imagens/');
    if (mugMarker >= 0) return pathname.slice(mugMarker);
  } catch {}
  return '';
}

function imagePaths(product, cfg) {
  const explicit = collectStrings([product?.imagem_path, product?.image_path, product?.foto_path, product?.capa_path]);
  const references = collectStrings([
    product?.url_imagem, product?.imagem_url, product?.imagem, product?.image, product?.foto, product?.foto_url,
    product?.capa, product?.capa_url, product?.imagens, product?.imagens_site, product?.images, product?.fotos,
    product?.galeria, product?.gallery, product?.imagens_historico, product?.mockup_1, product?.mockup_2,
    product?.mockup_3, product?.arte_horizontal, product?.arte_url, product?.arte,
  ]);
  const paths = [];
  explicit.forEach(value => {
    const candidate = pathFromGithubUrl(value, cfg) || normalizeRepoPath(value);
    if (allowedImagePath(candidate, cfg)) paths.push(candidate);
  });
  references.forEach(value => {
    const candidate = pathFromGithubUrl(value, cfg);
    if (allowedImagePath(candidate, cfg)) paths.push(candidate);
  });
  return [...new Set(paths)];
}

function githubHeaders(cfg) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${text(cfg.githubToken)}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function encodedPath(path) {
  return normalizeRepoPath(path).split('/').map(encodeURIComponent).join('/');
}

async function githubRequest(cfg, path, options = {}) {
  const base = `https://api.github.com/repos/${encodeURIComponent(cfg.githubOwner)}/${encodeURIComponent(cfg.githubRepo)}`;
  const response = await fetch(`${base}${path}`, {
    ...options,
    cache: 'no-store',
    headers: { ...githubHeaders(cfg), ...(options.headers || {}) },
  });
  if (response.status === 404 && options.allowNotFound) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`GitHub retornou ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  return response.status === 204 ? null : response.json().catch(() => null);
}

async function deleteGithubImage(cfg, path, label = '') {
  if (!allowedImagePath(path, cfg)) return { skipped: true };
  if (!text(cfg.githubToken)) throw new Error('Token do GitHub não configurado.');
  const clean = normalizeRepoPath(path);
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const file = await githubRequest(cfg, `/contents/${encodedPath(clean)}?ref=${encodeURIComponent(cfg.githubBranch || 'main')}`, { allowNotFound: true });
    if (!file) return { missing: true };
    try {
      await githubRequest(cfg, `/contents/${encodedPath(clean)}`, {
        method: 'DELETE',
        body: JSON.stringify({ message: `Remove imagem de produto excluído${label ? `: ${label}` : ''}`, sha: file.sha, branch: cfg.githubBranch || 'main' }),
      });
      return { deleted: true };
    } catch (error) {
      if (!/GitHub retornou (409|422)/.test(String(error?.message || error)) || attempt === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 350));
    }
  }
  return { skipped: true };
}

function rowInfo(key) {
  const row = document.querySelector(`#productsTableBody tr[data-bulk-product-key="${CSS.escape(text(key))}"]`);
  return {
    row,
    name: text(row?.querySelector('.product-cell strong')?.textContent) || 'Produto',
    code: text(row?.querySelector('.cell-stack strong')?.textContent) || text(key),
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function preloadTargets(keys, cfg) {
  return mapLimit(keys, 4, async key => {
    const normalizedKey = text(key);
    const remote = await loadProduct(cfg, normalizedKey);
    if (!remote) throw new Error(`Produto ${normalizedKey} não encontrado no Firebase.`);
    const info = rowInfo(normalizedKey);
    return {
      key: normalizedKey,
      remote,
      name: productName(remote) || info.name,
      code: text(remote.codigo || remote.sku || remote.id || info.code || normalizedKey),
      images: imagePaths(remote, cfg),
    };
  });
}

function setDeletingState(active, label = '') {
  deleting = active;
  const cfg = config();
  document.querySelectorAll('[data-safe-delete-product],[data-bulk-delete-selected],[data-product-select],[data-select-visible-products]').forEach(control => {
    control.disabled = active || (!cfg.writeMode && control.matches('[data-safe-delete-product],[data-bulk-delete-selected]'));
  });
  const status = document.querySelector('[data-bulk-delete-status]');
  if (status) status.textContent = label;
}

function visibleRows() {
  return [...document.querySelectorAll('#productsTableBody tr[data-bulk-product-key]')];
}

function updateToolbar() {
  const toolbar = document.querySelector('[data-bulk-delete-toolbar]');
  if (!toolbar) return;
  const count = selectedKeys.size;
  const button = toolbar.querySelector('[data-bulk-delete-selected]');
  const clear = toolbar.querySelector('[data-clear-product-selection]');
  const label = toolbar.querySelector('[data-selected-product-count]');
  if (label) label.textContent = `${count} selecionado${count === 1 ? '' : 's'}`;
  if (button) {
    button.disabled = deleting || !count || !config().writeMode;
    button.textContent = count ? `Excluir selecionados (${count})` : 'Excluir selecionados';
  }
  if (clear) clear.disabled = deleting || !count;
  const rows = visibleRows();
  const checked = rows.reduce((sum, row) => sum + (selectedKeys.has(text(row.dataset.bulkProductKey)) ? 1 : 0), 0);
  const all = document.querySelector('[data-select-visible-products]');
  if (all) {
    all.checked = rows.length > 0 && checked === rows.length;
    all.indeterminate = checked > 0 && checked < rows.length;
  }
}

function installChrome() {
  if (!document.querySelector('[data-bulk-delete-toolbar]')) {
    const summary = document.querySelector('[data-view="products"] .table-summary');
    if (summary) {
      const toolbar = document.createElement('div');
      toolbar.className = 'bulk-delete-toolbar';
      toolbar.dataset.bulkDeleteToolbar = '1';
      toolbar.innerHTML = '<div class="bulk-delete-selection-info"><strong data-selected-product-count>0 selecionados</strong><span>Marque quantos produtos quiser.</span></div><div class="bulk-delete-actions"><span data-bulk-delete-status aria-live="polite"></span><button class="button ghost compact" type="button" data-clear-product-selection disabled>Limpar seleção</button><button class="button danger compact" type="button" data-bulk-delete-selected disabled>Excluir selecionados</button></div>';
      summary.insertAdjacentElement('afterend', toolbar);
    }
  }
  const header = document.querySelector('[data-view="products"] .data-table thead tr');
  if (header && !header.querySelector('[data-product-select-header]')) {
    const cell = document.createElement('th');
    cell.className = 'product-select-column';
    cell.dataset.productSelectHeader = '1';
    cell.innerHTML = '<input type="checkbox" data-select-visible-products aria-label="Selecionar todos os produtos desta página">';
    header.insertBefore(cell, header.firstElementChild);
  }
}

function enhanceRows() {
  if (enhancing) return;
  enhancing = true;
  try {
    installChrome();
    const enabled = config().writeMode !== false;
    for (const row of document.querySelectorAll('#productsTableBody tr')) {
      const editButton = row.querySelector('[data-product-key]');
      const actions = row.querySelector('.row-actions');
      if (!editButton || !actions) continue;
      const key = text(editButton.dataset.productKey);
      if (!key) continue;
      if (row.dataset.bulkProductKey !== key) row.dataset.bulkProductKey = key;

      let selectCell = row.querySelector('[data-product-select-cell]');
      if (!selectCell) {
        selectCell = document.createElement('td');
        selectCell.className = 'product-select-column';
        selectCell.dataset.productSelectCell = '1';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.productSelect = key;
        checkbox.setAttribute('aria-label', 'Selecionar produto');
        selectCell.appendChild(checkbox);
        row.insertBefore(selectCell, row.firstElementChild);
      }
      const checkbox = selectCell.querySelector('[data-product-select]');
      if (checkbox) {
        if (checkbox.dataset.productSelect !== key) checkbox.dataset.productSelect = key;
        checkbox.checked = selectedKeys.has(key);
      }
      row.classList.toggle('bulk-selected-row', selectedKeys.has(key));

      let button = actions.querySelector('[data-safe-delete-product]');
      if (!button) {
        button = document.createElement('button');
        button.className = 'row-action safe-delete-action';
        button.type = 'button';
        button.textContent = 'Excluir';
        button.title = 'Enviar o produto para a Lixeira e apagar imagens vinculadas no GitHub';
        actions.appendChild(button);
      }
      button.dataset.safeDeleteProduct = key;
      if (!deleting) button.disabled = !enabled;
    }
    const empty = document.querySelector('#productsTableBody .empty-state');
    if (empty && empty.colSpan !== 9) empty.colSpan = 9;
    updateToolbar();
  } finally {
    enhancing = false;
  }
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceRows();
  });
}

function confirmDeletion(targets) {
  const count = targets.length;
  const imageCount = new Set(targets.flatMap(target => target.images)).size;
  const sample = targets.slice(0, 5).map(target => `• ${target.name} (${target.code})`).join('\n');
  if (!confirm(count === 1 ? `Excluir “${targets[0].name}”?\n\n${imageCount} imagem(ns) vinculada(s) também será(ão) apagada(s).` : `Excluir ${count} produtos?\n\n${sample}${count > 5 ? `\n• e mais ${count - 5}` : ''}\n\n${imageCount} imagem(ns) vinculada(s) também será(ão) apagada(s).`)) return false;
  return text(prompt(`Digite EXCLUIR para confirmar ${count} produto${count > 1 ? 's' : ''}.`)).toUpperCase() === 'EXCLUIR';
}

async function executeDeletion(keys, button = null) {
  const cfg = config();
  const normalized = [...new Set(keys.map(text).filter(Boolean))];
  if (deleting) return;
  if (!cfg.writeMode) return void toast('Ative o modo de gravação antes de excluir produtos.', 'error');
  if (hasPendingChanges()) return void toast('Salve ou descarte alterações pendentes antes de excluir produtos.', 'error');
  if (!normalized.length) return void toast('Marque pelo menos um produto.', 'error');

  let targets;
  try {
    setDeletingState(true, 'Conferindo produtos e imagens…');
    targets = await preloadTargets(normalized, cfg);
  } catch (error) {
    setDeletingState(false, '');
    return void toast(error?.message || String(error), 'error');
  }
  if (!confirmDeletion(targets)) return void setDeletingState(false, '');
  const imageCount = new Set(targets.flatMap(target => target.images)).size;
  if (imageCount && !text(cfg.githubToken)) {
    setDeletingState(false, '');
    return void toast('Há imagens vinculadas, mas o token do GitHub não está configurado. Nenhum produto foi apagado.', 'error');
  }

  const original = button?.textContent || '';
  let archived = 0;
  let deletedImages = 0;
  const imageErrors = [];
  try {
    for (const target of targets) {
      setDeletingState(true, `Excluindo ${archived + 1} de ${targets.length}…`);
      if (button) button.textContent = `Excluindo ${archived}/${targets.length}…`;
      const ok = await archiveProduct(cfg, target.key, { reason: targets.length > 1 ? 'Excluído em lote pela lista do Admin oficial' : 'Excluído pela lista do Admin oficial', source: targets.length > 1 ? 'admin-oficial-lista-lote' : 'admin-oficial-lista' });
      if (!ok) throw new Error(`Não foi possível arquivar ${target.name}.`);
      window.AdminV2DeletedProducts?.remember?.(target.key);
      archived += 1;
      selectedKeys.delete(target.key);
      for (const path of target.images) {
        try {
          const result = await deleteGithubImage(cfg, path, target.code || target.key);
          if (result.deleted) deletedImages += 1;
        } catch (error) {
          console.error(`Falha ao apagar ${path}`, error);
          imageErrors.push(path);
        }
      }
    }
    toast(imageErrors.length ? `${archived} produto(s) excluído(s), porém ${imageErrors.length} imagem(ns) não puderam ser apagadas.` : `${archived} produto(s) excluído(s) e ${deletedImages} imagem(ns) removida(s).`, imageErrors.length ? 'error' : 'success');
    document.getElementById('reloadButton')?.click();
  } catch (error) {
    toast(`A exclusão parou após ${archived} de ${targets.length}: ${error?.message || error}`, 'error');
    document.getElementById('reloadButton')?.click();
  } finally {
    setDeletingState(false, '');
    if (button?.isConnected) button.textContent = original || 'Excluir selecionados';
    updateToolbar();
  }
}

function installStyle() {
  if (document.getElementById('safeDeleteProductStyles')) return;
  const style = document.createElement('style');
  style.id = 'safeDeleteProductStyles';
  style.textContent = '.button.danger{border-color:#d89b96;background:#fff0ee;color:#a6322c}.row-action.safe-delete-action{border-color:#e2b7b3;background:#fff0ee;color:#a6322c}.product-select-column{width:42px;min-width:42px;text-align:center!important;padding-left:10px!important;padding-right:6px!important}.product-select-column input{width:18px;height:18px;cursor:pointer;accent-color:#a6322c}.bulk-selected-row{background:#fff8f7!important}.bulk-delete-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px;border-bottom:1px solid var(--line,#dfe3de);background:#fffaf9}.bulk-delete-selection-info{display:flex;align-items:baseline;gap:9px;min-width:0}.bulk-delete-selection-info span,.bulk-delete-actions [data-bulk-delete-status]{font-size:12px;color:var(--muted,#687069)}.bulk-delete-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}@media(max-width:760px){.bulk-delete-toolbar{align-items:stretch;flex-direction:column}.bulk-delete-selection-info{align-items:flex-start;flex-direction:column;gap:2px}.bulk-delete-actions{justify-content:stretch}.bulk-delete-actions .button{flex:1}}';
  document.head.appendChild(style);
}

document.addEventListener('change', event => {
  const checkbox = event.target.closest?.('[data-product-select]');
  if (checkbox) {
    event.stopPropagation();
    const key = text(checkbox.dataset.productSelect);
    checkbox.checked ? selectedKeys.add(key) : selectedKeys.delete(key);
    checkbox.closest('tr')?.classList.toggle('bulk-selected-row', checkbox.checked);
    updateToolbar();
    return;
  }
  const all = event.target.closest?.('[data-select-visible-products]');
  if (all) {
    for (const row of visibleRows()) {
      const key = text(row.dataset.bulkProductKey);
      all.checked ? selectedKeys.add(key) : selectedKeys.delete(key);
      const checkbox = row.querySelector('[data-product-select]');
      if (checkbox) checkbox.checked = all.checked;
      row.classList.toggle('bulk-selected-row', all.checked);
    }
    updateToolbar();
  }
});

document.addEventListener('click', event => {
  if (event.target.closest?.('[data-product-select],[data-select-visible-products]')) return void event.stopPropagation();
  const one = event.target.closest?.('[data-safe-delete-product]');
  if (one) {
    event.preventDefault(); event.stopPropagation();
    return void executeDeletion([text(one.dataset.safeDeleteProduct)], one);
  }
  const bulk = event.target.closest?.('[data-bulk-delete-selected]');
  if (bulk) { event.preventDefault(); return void executeDeletion([...selectedKeys], bulk); }
  const clear = event.target.closest?.('[data-clear-product-selection]');
  if (clear) {
    event.preventDefault();
    selectedKeys.clear();
    for (const row of visibleRows()) {
      const checkbox = row.querySelector('[data-product-select]');
      if (checkbox) checkbox.checked = false;
      row.classList.remove('bulk-selected-row');
    }
    updateToolbar();
  }
});

document.getElementById('writeModeSetting')?.addEventListener('change', scheduleEnhance);
window.addEventListener('admin-v2-route', event => { if (event.detail?.route === 'products') scheduleEnhance(); });

function start() {
  installStyle();
  enhanceRows();
  const table = document.getElementById('productsTableBody');
  if (table) {
    new MutationObserver(mutations => {
      if (enhancing) return;
      if (mutations.some(mutation => mutation.type === 'childList' && mutation.target === table)) scheduleEnhance();
    }).observe(table, { childList: true });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
