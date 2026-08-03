const DEFAULT_FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const CONFIG_KEY = 'da_admin_v2_config';
const originalFetch = globalThis.fetch.bind(globalThis);

function readConfig() {
  try {
    return {
      firebaseUrl: DEFAULT_FIREBASE_URL,
      productsNode: 'produtos',
      writeMode: true,
      ...JSON.parse(globalThis.localStorage?.getItem(CONFIG_KEY) || '{}'),
    };
  } catch {
    return { firebaseUrl: DEFAULT_FIREBASE_URL, productsNode: 'produtos', writeMode: true };
  }
}

function text(value = '') {
  return String(value ?? '').trim();
}

function firebaseBase() {
  return text(readConfig().firebaseUrl || DEFAULT_FIREBASE_URL).replace(/\/+$/, '');
}

function productsNode() {
  return text(readConfig().productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
}

function productUrl(key = '') {
  const suffix = key ? `/${encodeURIComponent(key)}` : '';
  return `${firebaseBase()}/${productsNode()}${suffix}.json`;
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url || '';
}

function isAdminIndexRequest(input, init = {}) {
  const method = text(init?.method || input?.method || 'GET').toUpperCase();
  if (method !== 'GET') return false;
  try {
    return new URL(requestUrl(input), globalThis.location?.href).pathname.endsWith('/site/produtos-admin.json');
  } catch {
    return false;
  }
}

// A lista administrativa passa a ler a fonte oficial. O JSON estático fica apenas
// como fallback interno do módulo original quando o Firebase estiver indisponível.
globalThis.fetch = function adminV2FirebaseFirst(input, init = {}) {
  if (isAdminIndexRequest(input, init)) {
    const url = `${productUrl()}?_admin_v2_direct=${Date.now()}`;
    return originalFetch(url, { ...init, cache: 'no-store' });
  }
  return originalFetch(input, init);
};

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 6500 : 3500);
}

async function firebaseRequest(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await originalFetch(url, { cache: 'no-store', ...options, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Firebase retornou ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
    }
    if (response.status === 204) return null;
    return response.json().catch(() => null);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao salvar no Firebase.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function brDateToIso(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 8) throw new Error('Use a data no formato DD/MM/AAAA.');
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('A data informada é inválida.');
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseField(field, input) {
  const value = input?.value ?? '';
  if (field === 'situacao') return value === 'I' ? 'I' : 'A';
  if (field === 'validade') return brDateToIso(value);
  if (field === 'tags') return String(value).split(/[,;|]/).map(item => item.trim()).filter(Boolean);
  if (['preco', 'preco_custo', 'preco_oferta', 'preco_atacado', 'peso', 'largura', 'altura', 'comprimento'].includes(field)) {
    return Math.max(0, Number(String(value).replace(',', '.')) || 0);
  }
  if (['estoque', 'estoque_minimo', 'quantidade_caixa', 'ordem'].includes(field)) {
    return Math.max(0, Math.floor(Number(value) || 0));
  }
  if (field === 'multiplo_venda') return Math.max(1, Math.floor(Number(value) || 1));
  if (['gtin', 'ean', 'ncm', 'cest'].includes(field)) return String(value).replace(/\D/g, '');
  return String(value);
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function savePatch(key, desiredPatch) {
  const config = readConfig();
  if (config.writeMode === false) throw new Error('As gravações estão bloqueadas nas configurações.');
  if (!key) throw new Error('Produto sem chave do Firebase.');

  const remote = await firebaseRequest(`${productUrl(key)}?_=${Date.now()}`);
  if (!remote || typeof remote !== 'object') throw new Error('Produto não encontrado no Firebase.');

  const patch = {};
  Object.entries(desiredPatch || {}).forEach(([field, value]) => {
    if (!sameValue(remote[field], value)) patch[field] = value;
  });
  if (!Object.keys(patch).length) return { remote, patch: {}, verified: remote };

  patch.updated_at = new Date().toISOString();
  patch.last_update = Date.now();
  if (Object.prototype.hasOwnProperty.call(patch, 'estoque')) patch.stock_updated_at = new Date().toISOString();

  await firebaseRequest(productUrl(key), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

  const verified = await firebaseRequest(`${productUrl(key)}?_verify=${Date.now()}`);
  const failed = Object.entries(patch)
    .filter(([field]) => !['updated_at', 'last_update', 'stock_updated_at'].includes(field))
    .filter(([field, value]) => !sameValue(verified?.[field], value))
    .map(([field]) => field);
  if (failed.length) throw new Error(`O Firebase não confirmou os campos: ${failed.join(', ')}.`);
  return { remote, patch, verified };
}

function currentRouteProducts() {
  document.querySelector('[data-route="products"]')?.click();
}

function refreshProducts() {
  const reload = document.getElementById('reloadButton');
  if (reload && !reload.disabled) reload.click();
}

function statusSelect(key, active) {
  return `<select class="inline-product-input direct-status-select" data-direct-status-key="${String(key).replace(/"/g, '&quot;')}"><option value="A"${active ? ' selected' : ''}>Ativo</option><option value="I"${active ? '' : ' selected'}>Inativo</option></select>`;
}

function enhanceProductRows() {
  document.querySelectorAll('#productsTableBody tr').forEach(row => {
    const save = row.querySelector('[data-inline-save]');
    if (!save) return;
    const key = save.dataset.inlineSave;
    const statusCell = row.children[5];
    if (!statusCell || statusCell.querySelector('[data-direct-status-key]')) return;
    const active = /\bAtivo\b/i.test(statusCell.textContent || '') && !/\bInativo\b/i.test(statusCell.textContent || '');
    statusCell.innerHTML = statusSelect(key, active);
    save.textContent = 'Salvar';
    save.title = 'Salva esta linha diretamente no Firebase';
  });
}

function makeEditorSaveAvailable() {
  const button = document.getElementById('saveProductButton');
  if (!button) return;
  const writable = readConfig().writeMode !== false;
  if (writable && button.disabled) button.disabled = false;
  button.title = writable
    ? 'Salva as alterações deste produto diretamente no Firebase'
    : 'As gravações estão bloqueadas nas configurações';

  const strong = document.querySelector('#editorValidation .validation-box strong');
  if (strong && /impedem o salvamento/i.test(strong.textContent || '')) {
    strong.textContent = 'Pendências impedem apenas a publicação do catálogo';
  }
}

function markInlineDirty(input) {
  const row = input.closest('tr');
  if (!row) return;
  row.classList.add('dirty-row');
  const save = row.querySelector('[data-inline-save]');
  if (save) save.disabled = false;
}

let selectedProductKey = '';
let saving = false;

async function saveInline(button) {
  if (saving) return;
  const key = button.dataset.inlineSave;
  const row = button.closest('tr');
  if (!key || !row) return;
  const desired = {};
  row.querySelectorAll('[data-inline-field]').forEach(input => {
    desired[input.dataset.inlineField] = parseField(input.dataset.inlineField, input);
  });
  const status = row.querySelector('[data-direct-status-key]');
  if (status) desired.situacao = parseField('situacao', status);

  const original = button.textContent;
  saving = true;
  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    const result = await savePatch(key, desired);
    row.classList.remove('dirty-row');
    button.textContent = Object.keys(result.patch).length ? 'Salvo' : 'Sem mudanças';
    toast(Object.keys(result.patch).length ? 'Produto salvo diretamente no Firebase.' : 'Nenhuma mudança para salvar.', 'success');
    setTimeout(refreshProducts, 120);
  } catch (error) {
    button.disabled = false;
    button.textContent = original || 'Salvar';
    toast(error?.message || String(error), 'error');
  } finally {
    saving = false;
  }
}

function editorPatch() {
  const form = document.getElementById('productForm');
  if (!form) return {};
  const patch = {};
  form.querySelectorAll('[data-field]').forEach(input => {
    const field = input.dataset.field;
    if (field) patch[field] = parseField(field, input);
  });
  return patch;
}

async function saveEditor(button) {
  if (saving) return;
  if (!selectedProductKey) throw new Error('Não foi possível identificar a chave do produto. Feche e abra o produto novamente.');
  const original = button.textContent;
  saving = true;
  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    const result = await savePatch(selectedProductKey, editorPatch());
    toast(Object.keys(result.patch).length ? 'Produto salvo diretamente no Firebase.' : 'Nenhuma mudança para salvar.', 'success');
    document.getElementById('closeEditorButton')?.click();
    currentRouteProducts();
    setTimeout(refreshProducts, 120);
  } catch (error) {
    button.disabled = false;
    button.textContent = original || 'Salvar produto';
    toast(error?.message || String(error), 'error');
  } finally {
    saving = false;
  }
}

function interceptProductInput(event) {
  const inline = event.target.closest?.('#productsTableBody [data-inline-field], #productsTableBody [data-direct-status-key]');
  if (inline) {
    event.stopImmediatePropagation();
    markInlineDirty(inline);
    return;
  }
  const editorField = event.target.closest?.('#productForm [data-field]');
  if (editorField) {
    event.stopImmediatePropagation();
    const subtitle = document.getElementById('editorSubtitle');
    if (subtitle && !/alteração pronta para salvar/i.test(subtitle.textContent || '')) subtitle.textContent += ' · alteração pronta para salvar';
    makeEditorSaveAvailable();
  }
}

document.addEventListener('input', interceptProductInput, true);
document.addEventListener('change', interceptProductInput, true);
document.addEventListener('click', event => {
  const open = event.target.closest?.('[data-product-key]');
  if (open) selectedProductKey = text(open.dataset.productKey);
  const review = event.target.closest?.('[data-review-product]');
  if (review) selectedProductKey = text(review.dataset.reviewProduct);

  const inlineSave = event.target.closest?.('[data-inline-save]');
  if (inlineSave) {
    event.preventDefault();
    event.stopImmediatePropagation();
    saveInline(inlineSave);
    return;
  }

  const editorSave = event.target.closest?.('#saveProductButton');
  if (editorSave) {
    event.preventDefault();
    event.stopImmediatePropagation();
    saveEditor(editorSave).catch(error => toast(error?.message || String(error), 'error'));
  }
}, true);

window.addEventListener('admin-v2-open-product', event => {
  selectedProductKey = text(event.detail?.key);
});

function start() {
  enhanceProductRows();
  makeEditorSaveAvailable();
  const table = document.getElementById('productsTableBody');
  if (table) new MutationObserver(enhanceProductRows).observe(table, { childList: true, subtree: true });
  const editor = document.getElementById('productEditor');
  if (editor) new MutationObserver(makeEditorSaveAvailable).observe(editor, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
