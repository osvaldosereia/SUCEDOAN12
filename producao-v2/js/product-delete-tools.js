import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { archiveProduct } from './services/firebase.js';
import { productName, text } from './core/utils.js';

let deleting = false;

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
  setTimeout(() => node.remove(), type === 'error' ? 6500 : 4200);
}

function hasPendingChanges() {
  return document.getElementById('dirtyIndicator')?.classList.contains('active');
}

function productInfoFromRow(key) {
  const button = [...document.querySelectorAll('#productsTableBody [data-product-key]')]
    .find(item => text(item.dataset.productKey) === text(key));
  const row = button?.closest('tr');
  return {
    row,
    name: text(row?.querySelector('.product-cell strong')?.textContent) || 'Produto',
    code: text(row?.querySelector('.cell-stack strong')?.textContent) || text(key),
  };
}

async function archiveFromRow(key, info, button) {
  if (deleting) return;
  const cfg = config();
  if (!cfg.writeMode) {
    toast('Ative o modo de gravação nas configurações antes de excluir produtos.', 'error');
    return;
  }
  if (hasPendingChanges()) {
    toast('Salve ou descarte todas as alterações pendentes antes de excluir um produto.', 'error');
    return;
  }

  const normalizedKey = text(key);
  if (!normalizedKey) {
    toast('Não foi possível identificar a chave do produto.', 'error');
    return;
  }

  const name = text(info?.name) || 'Produto';
  const code = text(info?.code) || normalizedKey;
  if (!confirm(`Excluir o produto "${name}"?\n\nCódigo: ${code}\n\nEle será enviado para a Lixeira e poderá ser restaurado depois.`)) return;
  const typed = prompt('Confirmação final: digite EXCLUIR para continuar.');
  if (text(typed).toUpperCase() !== 'EXCLUIR') {
    toast('Exclusão cancelada. Era necessário digitar EXCLUIR.', 'error');
    return;
  }

  const original = button?.textContent || 'Excluir';
  deleting = true;
  if (button) {
    button.disabled = true;
    button.textContent = 'Excluindo...';
  }

  try {
    const archived = await archiveProduct(cfg, normalizedKey, {
      reason: 'Excluído pela lista do Admin oficial',
      source: 'admin-oficial-lista',
    });
    window.AdminV2DeletedProducts?.remember?.(normalizedKey);
    toast(`${productName(archived) || name} foi enviado para a Lixeira.`, 'success');
    document.getElementById('closeEditorButton')?.click();
    document.getElementById('reloadButton')?.click();
  } catch (error) {
    console.error(error);
    toast(error?.message || String(error), 'error');
    if (button?.isConnected) button.disabled = false;
  } finally {
    deleting = false;
    if (button?.isConnected) button.textContent = original;
  }
}

function enhanceRows() {
  const enabled = config().writeMode !== false;
  document.querySelectorAll('#productsTableBody tr').forEach(row => {
    const editButton = row.querySelector('[data-product-key]');
    const actions = row.querySelector('.row-actions');
    if (!editButton || !actions) return;

    let button = actions.querySelector('[data-safe-delete-product]');
    if (!button) {
      const key = text(editButton.dataset.productKey);
      button = document.createElement('button');
      button.className = 'row-action safe-delete-action';
      button.type = 'button';
      button.dataset.safeDeleteProduct = key;
      button.textContent = 'Excluir';
      button.title = 'Enviar o produto para a Lixeira';
      actions.appendChild(button);
    }
    if (!deleting) button.disabled = !enabled;
  });
}

function installStyle() {
  if (document.getElementById('safeDeleteProductStyles')) return;
  const style = document.createElement('style');
  style.id = 'safeDeleteProductStyles';
  style.textContent = `
    .row-action.safe-delete-action{border-color:#e2b7b3;background:#fff0ee;color:#a6322c}
    .row-action.safe-delete-action:hover{border-color:#a6322c;background:#ffe3e0}
  `;
  document.head.appendChild(style);
}

document.addEventListener('click', event => {
  const rowDelete = event.target.closest?.('[data-safe-delete-product]');
  if (!rowDelete) return;
  event.preventDefault();
  event.stopPropagation();
  const key = text(rowDelete.dataset.safeDeleteProduct);
  archiveFromRow(key, productInfoFromRow(key), rowDelete);
});

document.getElementById('writeModeSetting')?.addEventListener('change', enhanceRows);
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'products') queueMicrotask(enhanceRows);
});

function start() {
  installStyle();
  enhanceRows();
  const table = document.getElementById('productsTableBody');
  if (table) new MutationObserver(enhanceRows).observe(table, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
