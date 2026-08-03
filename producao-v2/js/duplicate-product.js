const DEFAULT_FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const CONFIG_KEY = 'da_admin_v2_config';

function text(value = '') {
  return String(value ?? '').trim();
}

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

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 7000 : 4200);
}

async function firebaseRequest(url, options = {}, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await globalThis.fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Firebase retornou ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
    }
    if (response.status === 204) return null;
    return response.json().catch(() => null);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao duplicar o produto.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 75);
}

function uniqueKey() {
  return `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
}

function suggestedCode(product) {
  const base = text(product.codigo || product.sku || product.id || 'PRODUTO').replace(/-COPIA-\d+$/i, '');
  return `${base}-COPIA-${String(Date.now()).slice(-5)}`;
}

function buildDuplicate(source, sourceKey, newKey, nome, codigo) {
  const copy = cloneValue(source || {});
  [
    'firebaseKey', 'id', 'key', 'created_at', 'updated_at', 'last_update', 'stock_updated_at',
    'bling_id', 'gtin', 'ean', 'gtin_tributavel', 'validade', 'data_validade', 'lotes',
    'estoque_lotes', 'preco_oferta', 'precoOferta', 'data_inicio_oferta', 'inicio_oferta',
    'validade_oferta', 'validadeOferta', 'oferta_origem', 'oferta_regra_id', 'desconto_validade',
    'campanha_id', 'promocao_id', 'arquivado_em', 'arquivado_motivo', 'arquivado_origem',
    'restaurado_em', 'situacao_anterior',
  ].forEach(field => delete copy[field]);

  const now = new Date().toISOString();
  copy.firebaseKey = newKey;
  copy.id = newKey;
  copy.codigo = codigo;
  copy.sku = codigo;
  copy.nome = nome;
  copy.slug = `${slug(nome) || 'produto'}-${newKey.slice(-6)}`;
  copy.situacao = 'I';
  copy.status = 'I';
  delete copy.ativo;
  delete copy.visivel;
  copy.estoque = 0;
  copy.destaque = false;
  delete copy.ordem;
  copy.gtin = '';
  copy.ean = '';
  copy.gtin_tributavel = '';
  copy.validade = '';
  copy.created_at = now;
  copy.updated_at = now;
  copy.last_update = Date.now();
  copy.stock_updated_at = now;
  copy.origem_cadastro = 'admin-v2-duplicacao';
  copy.duplicado_de = sourceKey;
  copy.duplicado_em = now;
  return copy;
}

async function ensureUniqueCode(code) {
  const collection = await firebaseRequest(`${productUrl()}?_duplicate_check=${Date.now()}`);
  if (!collection || typeof collection !== 'object') return;
  const normalized = text(code).toLocaleLowerCase('pt-BR');
  const exists = Object.values(collection).some(product => text(product?.codigo || product?.sku).toLocaleLowerCase('pt-BR') === normalized);
  if (exists) throw new Error('Já existe um produto com esse código comercial. Informe outro código.');
}

let selectedProductKey = '';
let duplicating = false;

function setBusy(button, busy) {
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent || 'Duplicar';
  button.disabled = busy;
  button.textContent = busy ? 'Duplicando…' : button.dataset.originalText;
}

function hasPendingChanges() {
  const indicator = text(document.getElementById('dirtyIndicator')?.textContent);
  return indicator && !/nenhuma alteração/i.test(indicator);
}

function revealDuplicate(key, code) {
  document.querySelector('[data-route="products"]')?.click();
  if (hasPendingChanges()) {
    toast(`Produto duplicado como ${code}. Salve as alterações pendentes e clique em Atualizar dados.`, 'success');
    return;
  }

  document.getElementById('closeEditorButton')?.click();
  const reload = document.getElementById('reloadButton');
  if (reload && !reload.disabled) reload.click();

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const search = document.getElementById('productSearch');
    if (search) {
      search.value = code;
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const open = document.querySelector(`[data-product-key="${CSS.escape(key)}"]`);
    if (open) {
      clearInterval(timer);
      open.click();
      toast('Cópia criada como inativa. Revise EAN, estoque e validade antes de ativar.', 'success');
    } else if (attempts >= 12) {
      clearInterval(timer);
      toast(`Produto duplicado com o código ${code}. Use a busca para abrir a cópia.`, 'success');
    }
  }, 350);
}

async function duplicateProduct(sourceKey, button = null) {
  if (duplicating) return;
  const config = readConfig();
  if (config.writeMode === false) throw new Error('As gravações estão bloqueadas nas configurações.');
  if (!sourceKey) throw new Error('Não foi possível identificar o produto a duplicar.');

  duplicating = true;
  setBusy(button, true);
  try {
    const source = await firebaseRequest(`${productUrl(sourceKey)}?_duplicate=${Date.now()}`);
    if (!source || typeof source !== 'object') throw new Error('Produto original não encontrado no Firebase.');

    const defaultName = `${text(source.nome || source.titulo || 'Produto')} - Cópia`;
    const nome = prompt('Nome do novo produto:', defaultName);
    if (nome === null) return;
    if (!text(nome)) throw new Error('Informe o nome do novo produto.');

    const codigo = prompt('Código comercial do novo produto:', suggestedCode(source));
    if (codigo === null) return;
    if (!text(codigo)) throw new Error('Informe o código comercial do novo produto.');
    await ensureUniqueCode(codigo);

    const newKey = uniqueKey();
    const copy = buildDuplicate(source, sourceKey, newKey, text(nome), text(codigo));
    await firebaseRequest(productUrl(newKey), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(copy),
    });

    const verified = await firebaseRequest(`${productUrl(newKey)}?_verify_duplicate=${Date.now()}`);
    if (!verified || text(verified.codigo) !== text(codigo) || text(verified.nome) !== text(nome)) {
      throw new Error('O Firebase não confirmou a criação da cópia.');
    }
    revealDuplicate(newKey, text(codigo));
  } finally {
    duplicating = false;
    setBusy(button, false);
  }
}

function enhanceRows() {
  document.querySelectorAll('#productsTableBody tr').forEach(row => {
    const open = row.querySelector('[data-product-key]');
    const actions = row.querySelector('.row-actions');
    const save = row.querySelector('[data-inline-save]');
    const key = text(open?.dataset.productKey || save?.dataset.inlineSave);
    if (!actions || !key || actions.querySelector('[data-duplicate-product-key]')) return;
    const button = document.createElement('button');
    button.className = 'row-action';
    button.type = 'button';
    button.dataset.duplicateProductKey = key;
    button.textContent = 'Duplicar';
    button.title = 'Cria uma cópia inativa deste produto';
    actions.appendChild(button);
  });
}

function installEditorButton() {
  const footer = document.querySelector('#productEditor .editor-footer');
  if (!footer || document.getElementById('duplicateProductButton')) return;
  const button = document.createElement('button');
  button.id = 'duplicateProductButton';
  button.className = 'button secondary';
  button.type = 'button';
  button.textContent = 'Duplicar produto';
  button.title = 'Cria uma cópia inativa preservando os dados comerciais e visuais';
  const discard = document.getElementById('discardProductButton');
  footer.insertBefore(button, discard || footer.firstChild);
}

document.addEventListener('click', event => {
  const open = event.target.closest?.('[data-product-key]');
  if (open) selectedProductKey = text(open.dataset.productKey);

  const duplicateRow = event.target.closest?.('[data-duplicate-product-key]');
  if (duplicateRow) {
    event.preventDefault();
    event.stopImmediatePropagation();
    duplicateProduct(text(duplicateRow.dataset.duplicateProductKey), duplicateRow)
      .catch(error => toast(error?.message || String(error), 'error'));
    return;
  }

  const duplicateEditor = event.target.closest?.('#duplicateProductButton');
  if (duplicateEditor) {
    event.preventDefault();
    event.stopImmediatePropagation();
    duplicateProduct(selectedProductKey, duplicateEditor)
      .catch(error => toast(error?.message || String(error), 'error'));
  }
}, true);

window.addEventListener('admin-v2-open-product', event => {
  selectedProductKey = text(event.detail?.key);
});

function start() {
  installEditorButton();
  enhanceRows();
  const table = document.getElementById('productsTableBody');
  if (table) new MutationObserver(enhanceRows).observe(table, { childList: true, subtree: true });
  const editor = document.getElementById('productEditor');
  if (editor) new MutationObserver(installEditorButton).observe(editor, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();