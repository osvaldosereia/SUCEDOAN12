import { FIREBASE_BASE, MUG_NODES, text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, patchMug, invalidateMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260830-admin-canecas-li-recovery-v2';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const $ = (selector, root = document) => root.querySelector(selector);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let running = false;

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 7000 : 3500);
}
function liMeta(product = {}) {
  const nested = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  return {
    ...nested,
    produto_id: text(nested.produto_id || product.loja_integrada_product_id || product.canecafacil_product_id || product.li_product_id),
    seo_id: text(nested.seo_id || product.loja_integrada_seo_id || product.canecafacil_seo_id || product.li_seo_id),
  };
}
function keyOf(product = {}) { return text(product.firebaseKey || product.__key || product.id); }
function skuOf(product = {}) { return text(product.codigo || product.sku).trim(); }
function liActive(product = {}) {
  if (product.loja_integrada_ativo === true) return true;
  if (product.loja_integrada_ativo === false) return false;
  return product.canecafacil_ativo === true;
}
function duplicateMessage(product = {}) {
  const li = liMeta(product);
  return norm(`${li.sync_error || ''} ${product.loja_integrada_sync_error || ''}`);
}
function needsRecovery(product = {}) {
  const li = liMeta(product);
  if (li.produto_id || !skuOf(product)) return false;
  const status = norm(li.sync_status);
  return liActive(product)
    || ['erro', 'pendente', 'enviando', 'vinculado'].includes(status)
    || duplicateMessage(product).includes('duplic');
}
function parseSeoId(value) {
  const match = text(value).match(/\/seo\/(\d+)/i);
  return match ? match[1] : '';
}
function decodeB64Json(value) {
  try {
    if (!value) return null;
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return null;
  }
}
async function makeLookup(sku) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const payload = {
      action: 'loja_integrada_find_product_by_sku',
      request_id: `LI-REC-${Date.now().toString(36).toUpperCase()}`,
      sku,
      source: BUILD,
    };
    const response = await fetch(MAKE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok || data.ok === false) throw new Error(data.error || data.error_message || `Make HTTP ${response.status}`);
    const catalog = decodeB64Json(data.produto_b64) || data.catalog || data;
    const objects = Array.isArray(catalog?.objects) ? catalog.objects : [];
    return objects.filter(item => norm(item?.sku) === norm(sku));
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('O Make não respondeu à consulta de SKU em 30 segundos. Importe/ative o blueprint V11.1 corrigido.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function duplicateSkuGroups(products) {
  const groups = new Map();
  for (const product of products) {
    const sku = norm(skuOf(product));
    if (!sku) continue;
    if (!groups.has(sku)) groups.set(sku, []);
    groups.get(sku).push(product);
  }
  return new Map([...groups].filter(([, items]) => items.length > 1));
}
async function recoverOne(product) {
  const key = keyOf(product);
  const sku = skuOf(product);
  const matches = await makeLookup(sku);
  if (!matches.length) return { key, sku, status: 'not_found' };
  if (matches.length > 1) return { key, sku, status: 'ambiguous', count: matches.length };
  const found = matches[0];
  const li = liMeta(product);
  const productId = text(found.id);
  if (!productId) return { key, sku, status: 'invalid' };
  const seoId = parseSeoId(found.seo);
  const next = {
    ...li,
    produto_id: productId,
    seo_id: seoId || li.seo_id || '',
    resource_uri: text(found.resource_uri || li.resource_uri),
    url: text(found.url || li.url),
    sync_status: 'vinculado',
    sync_error: '',
    recovered_by: 'sku',
    recovered_at: nowIso(),
  };
  await patchMug(key, {
    loja_integrada: next,
    loja_integrada_product_id: productId,
    loja_integrada_seo_id: next.seo_id,
    updated_at: nowIso(),
    last_update: Date.now(),
  });
  return { key, sku, status: 'recovered', productId };
}
function setStatus(message, tone = '') {
  const el = $('#cfLiRecoveryStatus');
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
}
async function repairAll() {
  if (running) return;
  running = true;
  const button = $('#cfLiRepair');
  if (button) { button.disabled = true; button.textContent = 'Reparando…'; }
  try {
    const products = await loadMugs({ force: true });
    const duplicates = duplicateSkuGroups(products);
    const blockedKeys = new Set([...duplicates.values()].flat().map(keyOf));
    const targets = products.filter(product => needsRecovery(product) && !blockedKeys.has(keyOf(product)));
    if (!targets.length && !duplicates.size) {
      setStatus('Nenhum vínculo quebrado ou SKU duplicado encontrado no Firebase.', 'good');
      toast('Loja Integrada: cadastros locais sem vínculos quebrados.');
      return;
    }
    let recovered = 0, notFound = 0, failed = 0, ambiguous = 0;
    for (let index = 0; index < targets.length; index += 1) {
      const product = targets[index];
      setStatus(`Consultando SKU ${index + 1}/${targets.length}: ${skuOf(product)}…`);
      try {
        const result = await recoverOne(product);
        if (result.status === 'recovered') recovered += 1;
        else if (result.status === 'not_found') notFound += 1;
        else if (result.status === 'ambiguous') ambiguous += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        console.warn('[Admin Canecas] falha ao recuperar vínculo LI', keyOf(product), error);
      }
      await sleep(250);
    }
    invalidateMugs('reconciliação Loja Integrada');
    const duplicateCount = [...duplicates.values()].reduce((sum, items) => sum + items.length, 0);
    const parts = [`${recovered} vínculo(s) recuperado(s)`];
    if (notFound) parts.push(`${notFound} ainda não existe(m) na Loja Integrada`);
    if (duplicateCount) parts.push(`${duplicateCount} cadastro(s) com SKU repetido no Firebase bloqueado(s) para revisão`);
    if (ambiguous) parts.push(`${ambiguous} SKU(s) ambíguo(s) na Loja Integrada`);
    if (failed) parts.push(`${failed} falha(s)`);
    const hasProblems = duplicateCount || ambiguous || failed;
    setStatus(parts.join(' · ') + '.', hasProblems ? 'error' : 'good');
    toast(parts.join(' · ') + '.', hasProblems && recovered === 0);
    $('#cfMugReload')?.click();
  } catch (error) {
    setStatus(error?.message || String(error), 'error');
    toast(`Reparo Loja Integrada: ${error?.message || error}`, true);
  } finally {
    running = false;
    if (button) { button.disabled = false; button.textContent = 'Reparar vínculos LI'; }
  }
}
function install() {
  if (!location.hash.includes('mugs')) return;
  const root = $('#mugs');
  const toolbar = $('#cfCatalogToolbar', root);
  if (!root || !toolbar || $('#cfLiRepair', root)) return;
  const button = document.createElement('button');
  button.id = 'cfLiRepair';
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = 'Reparar vínculos LI';
  button.title = 'Consulta a Loja Integrada pelo SKU e recupera IDs perdidos no Firebase.';
  button.onclick = repairAll;
  toolbar.appendChild(button);
  const status = document.createElement('div');
  status.id = 'cfLiRecoveryStatus';
  status.style.cssText = 'grid-column:1/-1;font-size:11px;color:#687068;min-height:14px';
  toolbar.appendChild(status);
}

const observer = new MutationObserver(() => install());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', () => setTimeout(install, 80));
document.addEventListener('DOMContentLoaded', () => setTimeout(install, 150));
setTimeout(install, 300);

document.documentElement.dataset.cfLiRecovery = BUILD;
export { BUILD, repairAll, recoverOne, duplicateSkuGroups };
