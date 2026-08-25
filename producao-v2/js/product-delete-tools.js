import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { archiveProduct, loadProduct } from './services/firebase.js';
import { productName, text } from './core/utils.js';

let deleting = false;
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
  if (!region) {
    alert(message);
    return;
  }
  const normalized = text(message);
  if (!normalized) return;
  const duplicate = [...region.querySelectorAll('.toast')].some(node => node.textContent === normalized);
  if (duplicate) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = normalized;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 8500 : 4200);
}

function hasPendingChanges() {
  return document.getElementById('dirtyIndicator')?.classList.contains('active');
}

function productInfoFromRow(key) {
  const row = [...document.querySelectorAll('#productsTableBody tr')]
    .find(item => text(item.dataset.bulkProductKey) === text(key)
      || text(item.querySelector('[data-product-key]')?.dataset.productKey) === text(key));
  return {
    row,
    name: text(row?.querySelector('.product-cell strong')?.textContent) || 'Produto',
    code: text(row?.querySelector('.cell-stack strong')?.textContent) || text(key),
  };
}

function collectStrings(value, result = []) {
  if (typeof value === 'string') {
    if (text(value)) result.push(text(value));
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectStrings(item, result));
    return result;
  }
  if (value && typeof value === 'object') {
    ['path', 'url', 'src', 'imagem', 'imagem_url', 'url_imagem', 'foto', 'image'].forEach(field => {
      if (Object.prototype.hasOwnProperty.call(value, field)) collectStrings(value[field], result);
    });
  }
  return result;
}

function normalizeRepoPath(value) {
  return text(value).replace(/^\/+/, '').replace(/[?#].*$/, '');
}

function productImageRoots(cfg) {
  return [...new Set([
    normalizeRepoPath(cfg.githubImagesPath || 'site/img/produtos_3'),
    'site/img/produtos',
    'site/img/produtos_2',
    'site/img/produtos_3',
    'canecas/imagens',
  ].filter(Boolean))];
}

function pathAllowedForProductImage(path, cfg) {
  const clean = normalizeRepoPath(path);
  if (!clean || clean.includes('..')) return false;
  return productImageRoots(cfg).some(root => clean === root || clean.startsWith(`${root}/`));
}

function pathFromGithubUrl(value, cfg) {
  const raw = text(value);
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const parsed = new URL(raw);
    const segments = parsed.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
    const owner = text(cfg.githubOwner);
    const repo = text(cfg.githubRepo);
    const branch = text(cfg.githubBranch || 'main');

    if (parsed.hostname === 'raw.githubusercontent.com' && segments[0] === owner && segments[1] === repo && segments[2] === branch) {
      return segments.slice(3).join('/');
    }
    if (parsed.hostname === 'github.com' && segments[0] === owner && segments[1] === repo && segments[2] === 'blob' && segments[3] === branch) {
      return segments.slice(4).join('/');
    }

    const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
    if (pathAllowedForProductImage(pathname, cfg)) return pathname;
    if (pathAllowedForProductImage(`site/${pathname}`, cfg)) return `site/${pathname}`;
    const siteMarker = pathname.indexOf('site/img/produtos');
    if (siteMarker >= 0) return pathname.slice(siteMarker);
    const mugMarker = pathname.indexOf('canecas/imagens/');
    if (mugMarker >= 0) return pathname.slice(mugMarker);
  } catch {}
  return '';
}

function imagePaths(product, cfg) {
  const explicitPaths = collectStrings([
    product?.imagem_path,
    product?.image_path,
    product?.foto_path,
    product?.capa_path,
  ]);
  const references = collectStrings([
    product?.url_imagem,
    product?.imagem_url,
    product?.imagem,
    product?.image,
    product?.foto,
    product?.foto_url,
    product?.capa,
    product?.capa_url,
    product?.imagens,
    product?.imagens_site,
    product?.images,
    product?.fotos,
    product?.galeria,
    product?.gallery,
    product?.imagens_historico,
    product?.mockup_1,
    product?.mockup_2,
    product?.mockup_3,
    product?.arte_horizontal,
    product?.arte_url,
    product?.arte,
  ]);

  const paths = [];
  explicitPaths.forEach(value => {
    const direct = normalizeRepoPath(value);
    const fromUrl = pathFromGithubUrl(value, cfg);
    const candidate = fromUrl || direct;
    if (pathAllowedForProductImage(candidate, cfg)) paths.push(candidate);
  });
  references.forEach(value => {
    const fromUrl = pathFromGithubUrl(value, cfg);
    if (pathAllowedForProductImage(fromUrl, cfg)) paths.push(fromUrl);
  });
  return [...new Set(paths)];
}

function githubApiBase(cfg) {
  return `https://api.github.com/repos/${encodeURIComponent(cfg.githubOwner)}/${encodeURIComponent(cfg.githubRepo)}`;
}

function githubHeaders(cfg) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${text(cfg.githubToken)}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function githubRequest(cfg, path, options = {}) {
  const response = await fetch(`${githubApiBase(cfg)}${path}`, {
    ...options,
    cache: 'no-store',
    headers: { ...githubHeaders(cfg), ...(options.headers || {}) },
  });
  if (response.status === 404 && options.allowNotFound) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`GitHub retornou ${response.status}${detail ? `: ${detail.slice(0, 220)}` : ''}`);
  }
  return response.status === 204 ? null : response.json().catch(() => null);
}

function encodedGithubPath(path) {
  return normalizeRepoPath(path).split('/').map(encodeURIComponent).join('/');
}

async function deleteGithubImage(cfg, path, productLabel = '') {
  if (!pathAllowedForProductImage(path, cfg)) return { path, skipped: true };
  if (!text(cfg.githubToken)) {
    throw new Error('Token do GitHub não configurado. A exclusão foi interrompida para não deixar imagens órfãs.');
  }

  const clean = normalizeRepoPath(path);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const file = await githubRequest(
      cfg,
      `/contents/${encodedGithubPath(clean)}?ref=${encodeURIComponent(cfg.githubBranch || 'main')}&_=${Date.now()}`,
      { allowNotFound: true },
    );
    if (!file) return { path: clean, skipped: true, missing: true };
    if (!file.sha) throw new Error(`O GitHub não informou o SHA da imagem ${clean}.`);

    try {
      await githubRequest(cfg, `/contents/${encodedGithubPath(clean)}`, {
        method: 'DELETE',
        body: JSON.stringify({
          message: `Remove imagem de produto excluído${productLabel ? `: ${productLabel}` : ''}`,
          sha: file.sha,
          branch: cfg.githubBranch || 'main',
        }),
      });
      return { path: clean, deleted: true };
    } catch (error) {
      const retryable = /GitHub retornou (409|422)/.test(String(error?.message || error));
      if (!retryable || attempt === 5) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 450));
    }
  }
  throw new Error(`Não foi possível apagar a imagem ${clean}.`);
}

async function preloadTargets(keys, cfg) {
  const targets = [];
  for (const key of keys) {
    const normalizedKey = text(key);
    if (!normalizedKey) continue;
    const remote = await loadProduct(cfg, normalizedKey);
    if (!remote) throw new Error(`O produto ${normalizedKey} não foi encontrado no Firebase. Atualize a lista e tente novamente.`);
    const info = productInfoFromRow(normalizedKey);
    targets.push({
      key: normalizedKey,
      remote,
      name: productName(remote) || info.name || 'Produto',
      code: text(remote.codigo || remote.sku || remote.id || info.code || normalizedKey),
      images: imagePaths(remote, cfg),
    });
  }
  return targets;
}

function validateDeletion(cfg, keys) {
  if (deleting) return false;
  if (!cfg.writeMode) {
    toast('Ative o modo de gravação nas configurações antes de excluir produtos.', 'error');
    return false;
  }
  if (hasPendingChanges()) {
    toast('Salve ou descarte todas as alterações pendentes antes de excluir produtos.', 'error');
    return false;
  }
  if (!keys.length) {
    toast('Marque pelo menos um produto para excluir.', 'error');
    return false;
  }
  return true;
}

function confirmDeletion(targets) {
  const count = targets.length;
  const imageCount = new Set(targets.flatMap(target => target.images)).size;
  const sample = targets.slice(0, 5).map(target => `• ${target.name} (${target.code})`).join('\n');
  const more = count > 5 ? `\n• e mais ${count - 5} produto(s)` : '';
  const question = count === 1
    ? `Excluir o produto "${targets[0].name}"?\n\nCódigo: ${targets[0].code}\n\nO produto será enviado para a Lixeira e ${imageCount ? `${imageCount} imagem(ns) vinculada(s) será(ão) apagada(s) permanentemente do GitHub.` : 'não há imagem do GitHub vinculada para apagar.'}`
    : `Excluir ${count} produtos de uma só vez?\n\n${sample}${more}\n\nOs produtos serão enviados para a Lixeira e ${imageCount ? `${imageCount} imagem(ns) vinculada(s) será(ão) apagada(s) permanentemente do GitHub.` : 'não há imagens do GitHub vinculadas para apagar.'}`;
  if (!confirm(question)) return false;
  const typed = prompt(`Confirmação final: digite EXCLUIR para apagar ${count} produto${count > 1 ? 's' : ''}.`);
  if (text(typed).toUpperCase() !== 'EXCLUIR') {
    toast('Exclusão cancelada. Era necessário digitar EXCLUIR.', 'error');
    return false;
  }
  return true;
}

function setDeletingState(active, label = '') {
  deleting = active;
  document.querySelectorAll('[data-safe-delete-product],[data-bulk-delete-selected],[data-product-select],[data-select-visible-products]').forEach(button => {
    button.disabled = active || (!config().writeMode && button.matches('[data-safe-delete-product],[data-bulk-delete-selected]'));
  });
  const status = document.querySelector('[data-bulk-delete-status]');
  if (status) status.textContent = label;
}

async function executeDeletion(keys, button = null) {
  const cfg = config();
  const normalizedKeys = [...new Set(keys.map(text).filter(Boolean))];
  if (!validateDeletion(cfg, normalizedKeys)) return;

  let targets;
  try {
    setDeletingState(true, 'Conferindo produtos e imagens…');
    targets = await preloadTargets(normalizedKeys, cfg);
  } catch (error) {
    setDeletingState(false, '');
    toast(error?.message || String(error), 'error');
    return;
  }

  if (!targets.length) {
    setDeletingState(false, '');
    return;
  }
  if (!confirmDeletion(targets)) {
    setDeletingState(false, '');
    return;
  }

  const imageCount = new Set(targets.flatMap(target => target.images)).size;
  if (imageCount && !text(cfg.githubToken)) {
    setDeletingState(false, '');
    toast('Há imagens do GitHub vinculadas, mas o token do GitHub não está configurado. Nenhum produto foi apagado.', 'error');
    return;
  }

  const original = button?.textContent || '';
  let archivedCount = 0;
  let deletedImages = 0;
  const imageErrors = [];

  try {
    if (button) button.textContent = `Excluindo 0/${targets.length}…`;
    for (const target of targets) {
      setDeletingState(true, `Excluindo produto ${archivedCount + 1} de ${targets.length}…`);
      const archived = await archiveProduct(cfg, target.key, {
        reason: targets.length > 1 ? 'Excluído em lote pela lista do Admin oficial' : 'Excluído pela lista do Admin oficial',
        source: targets.length > 1 ? 'admin-oficial-lista-lote' : 'admin-oficial-lista',
      });
      window.AdminV2DeletedProducts?.remember?.(target.key);
      archivedCount += 1;
      selectedKeys.delete(target.key);
      if (button) button.textContent = `Excluindo ${archivedCount}/${targets.length}…`;

      for (const path of target.images) {
        try {
          const result = await deleteGithubImage(cfg, path, target.code || target.key);
          if (result.deleted) deletedImages += 1;
        } catch (error) {
          console.error(`Falha ao apagar imagem ${path}:`, error);
          imageErrors.push({ path, error: error?.message || String(error) });
        }
      }

      if (!archived) throw new Error(`Não foi possível arquivar ${target.name}.`);
    }

    document.getElementById('closeEditorButton')?.click();
    if (imageErrors.length) {
      toast(`${archivedCount} produto(s) excluído(s), mas ${imageErrors.length} imagem(ns) não puderam ser apagadas do GitHub. Caminho(s): ${imageErrors.slice(0, 3).map(item => item.path).join(', ')}.`, 'error');
    } else {
      toast(`${archivedCount} produto(s) excluído(s) e ${deletedImages} imagem(ns) removida(s) do GitHub.`, 'success');
    }
    document.getElementById('reloadButton')?.click();
  } catch (error) {
    console.error(error);
    toast(`A exclusão parou após ${archivedCount} de ${targets.length} produto(s): ${error?.message || error}`, 'error');
    document.getElementById('reloadButton')?.click();
  } finally {
    setDeletingState(false, '');
    if (button?.isConnected) button.textContent = original || 'Excluir selecionados';
    updateBulkToolbar();
  }
}

function visibleRows() {
  return [...document.querySelectorAll('#productsTableBody tr[data-bulk-product-key]')];
}

function updateBulkToolbar() {
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

  const visible = visibleRows();
  const checkedVisible = visible.filter(row => selectedKeys.has(text(row.dataset.bulkProductKey))).length;
  const selectAll = document.querySelector('[data-select-visible-products]');
  if (selectAll) {
    selectAll.checked = visible.length > 0 && checkedVisible === visible.length;
    selectAll.indeterminate = checkedVisible > 0 && checkedVisible < visible.length;
  }
}

function installToolbar() {
  if (document.querySelector('[data-bulk-delete-toolbar]')) return;
  const summary = document.querySelector('[data-view="products"] .table-summary');
  if (!summary) return;
  const toolbar = document.createElement('div');
  toolbar.className = 'bulk-delete-toolbar';
  toolbar.dataset.bulkDeleteToolbar = '1';
  toolbar.innerHTML = `
    <div class="bulk-delete-selection-info"><strong data-selected-product-count>0 selecionados</strong><span>Marque produtos nesta ou em outras páginas da lista.</span></div>
    <div class="bulk-delete-actions">
      <span data-bulk-delete-status aria-live="polite"></span>
      <button class="button ghost compact" type="button" data-clear-product-selection disabled>Limpar seleção</button>
      <button class="button danger compact" type="button" data-bulk-delete-selected disabled>Excluir selecionados</button>
    </div>`;
  summary.insertAdjacentElement('afterend', toolbar);
}

function installHeaderCheckbox() {
  const row = document.querySelector('[data-view="products"] .data-table thead tr');
  if (!row || row.querySelector('[data-product-select-header]')) return;
  const cell = document.createElement('th');
  cell.className = 'product-select-column';
  cell.dataset.productSelectHeader = '1';
  cell.innerHTML = '<input type="checkbox" data-select-visible-products aria-label="Selecionar todos os produtos desta página" title="Selecionar todos desta página">';
  row.insertBefore(cell, row.firstElementChild);
}

function enhanceRows() {
  installToolbar();
  installHeaderCheckbox();
  const enabled = config().writeMode !== false;
  document.querySelectorAll('#productsTableBody tr').forEach(row => {
    const editButton = row.querySelector('[data-product-key]');
    const actions = row.querySelector('.row-actions');
    if (!editButton || !actions) return;

    const key = text(editButton.dataset.productKey);
    row.dataset.bulkProductKey = key;

    let selectCell = row.querySelector('[data-product-select-cell]');
    if (!selectCell) {
      selectCell = document.createElement('td');
      selectCell.className = 'product-select-column';
      selectCell.dataset.productSelectCell = '1';
      row.insertBefore(selectCell, row.firstElementChild);
    }
    selectCell.innerHTML = `<input type="checkbox" data-product-select="${key.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" aria-label="Selecionar produto" ${selectedKeys.has(key) ? 'checked' : ''}>`;
    row.classList.toggle('bulk-selected-row', selectedKeys.has(key));

    let button = actions.querySelector('[data-safe-delete-product]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'row-action safe-delete-action';
      button.type = 'button';
      button.dataset.safeDeleteProduct = key;
      button.textContent = 'Excluir';
      button.title = 'Enviar o produto para a Lixeira e apagar as imagens vinculadas no GitHub';
      actions.appendChild(button);
    }
    if (!deleting) button.disabled = !enabled;
  });

  const empty = document.querySelector('#productsTableBody .empty-state');
  if (empty) empty.colSpan = 9;
  updateBulkToolbar();
}

function installStyle() {
  if (document.getElementById('safeDeleteProductStyles')) return;
  const style = document.createElement('style');
  style.id = 'safeDeleteProductStyles';
  style.textContent = `
    .button.danger{border-color:#d89b96;background:#fff0ee;color:#a6322c}
    .button.danger:hover:not(:disabled){border-color:#a6322c;background:#ffe3e0}
    .row-action.safe-delete-action{border-color:#e2b7b3;background:#fff0ee;color:#a6322c}
    .row-action.safe-delete-action:hover:not(:disabled){border-color:#a6322c;background:#ffe3e0}
    .product-select-column{width:42px;min-width:42px;text-align:center!important;padding-left:10px!important;padding-right:6px!important}
    .product-select-column input{width:18px;height:18px;cursor:pointer;accent-color:#a6322c}
    .bulk-selected-row{background:#fff8f7!important}
    .bulk-delete-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px;border-bottom:1px solid var(--line,#dfe3de);background:#fffaf9}
    .bulk-delete-selection-info{display:flex;align-items:baseline;gap:9px;min-width:0}
    .bulk-delete-selection-info strong{color:#8f2e28;white-space:nowrap}
    .bulk-delete-selection-info span{font-size:12px;color:var(--muted,#687069)}
    .bulk-delete-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
    .bulk-delete-actions [data-bulk-delete-status]{font-size:12px;color:var(--muted,#687069)}
    @media(max-width:760px){
      .bulk-delete-toolbar{align-items:stretch;flex-direction:column}
      .bulk-delete-selection-info{align-items:flex-start;flex-direction:column;gap:2px}
      .bulk-delete-actions{justify-content:stretch}
      .bulk-delete-actions .button{flex:1}
    }
  `;
  document.head.appendChild(style);
}

document.addEventListener('change', event => {
  const checkbox = event.target.closest?.('[data-product-select]');
  if (checkbox) {
    event.stopPropagation();
    const key = text(checkbox.dataset.productSelect);
    if (checkbox.checked) selectedKeys.add(key);
    else selectedKeys.delete(key);
    checkbox.closest('tr')?.classList.toggle('bulk-selected-row', checkbox.checked);
    updateBulkToolbar();
    return;
  }

  const selectVisible = event.target.closest?.('[data-select-visible-products]');
  if (selectVisible) {
    const checked = selectVisible.checked;
    visibleRows().forEach(row => {
      const key = text(row.dataset.bulkProductKey);
      if (checked) selectedKeys.add(key);
      else selectedKeys.delete(key);
    });
    enhanceRows();
  }
});

document.addEventListener('click', event => {
  const selectionControl = event.target.closest?.('[data-product-select],[data-select-visible-products]');
  if (selectionControl) {
    event.stopPropagation();
    return;
  }

  const rowDelete = event.target.closest?.('[data-safe-delete-product]');
  if (rowDelete) {
    event.preventDefault();
    event.stopPropagation();
    const key = text(rowDelete.dataset.safeDeleteProduct);
    executeDeletion([key], rowDelete);
    return;
  }

  const bulkDelete = event.target.closest?.('[data-bulk-delete-selected]');
  if (bulkDelete) {
    event.preventDefault();
    executeDeletion([...selectedKeys], bulkDelete);
    return;
  }

  const clear = event.target.closest?.('[data-clear-product-selection]');
  if (clear) {
    event.preventDefault();
    selectedKeys.clear();
    enhanceRows();
  }
});

document.getElementById('writeModeSetting')?.addEventListener('change', enhanceRows);
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'products') queueMicrotask(enhanceRows);
});

function start() {
  installStyle();
  installToolbar();
  installHeaderCheckbox();
  enhanceRows();
  const table = document.getElementById('productsTableBody');
  if (table) new MutationObserver(enhanceRows).observe(table, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();