import { FIREBASE_BASE, MUG_NODES, text, norm, audit, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { getMug, patchMug, invalidateMugs } from './mug-store-v2.js?v=20260829-1';
import { POLICY } from './product-policy-v1.js?v=20260829-2';

const BUILD = '20260829-admin-canecas-bulk-actions-v1';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const REF_PATH = 'canecas/integracoes/loja_integrada/catalog_refs';
const PERSONALIZER_BASE = 'https://donaantonia.com.br/loja-integrada/personalizar/';
const CATEGORY_NAMES = Object.freeze({
  padronizadas: 'Canecas Padronizadas',
  personalizaveis: 'Canecas Personalizáveis',
  empresas: 'Canecas para Empresas',
});

const state = { running: false, refs: null };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const numberValue = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = text(value).replace(/\s/g, '');
  if (!raw) return 0;
  const parsed = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(parsed) ? parsed : 0;
};
const digits = value => text(value).replace(/\D/g, '');
const productKey = product => text(product?.firebaseKey || product?.id || product?.__key);
const slug = value => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140) || `caneca-${Date.now()}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 6500 : 3500);
}
function liMeta(product = {}) { return product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {}; }
function liActive(product = {}) {
  if (product.loja_integrada_ativo === true) return true;
  if (product.loja_integrada_ativo === false) return false;
  return product.canecafacil_ativo === true;
}
function isPersonalizable(product = {}) {
  return product.loja_integrada_personalizavel === true
    || product.canecafacil_personalizavel === true
    || product.personalizavel === true
    || product.personalizacao_publica === true;
}
function categoryTypeOf(product = {}) {
  return text(product.loja_integrada_categoria_tipo || liMeta(product).categoria_tipo)
    || (isPersonalizable(product) ? 'personalizaveis' : 'padronizadas');
}
function categoryNameFor(type) { return CATEGORY_NAMES[type] || CATEGORY_NAMES.padronizadas; }
function images(product = {}) {
  const arrays = [product.imagens_site, product.imagens, product.fotos, product.images].filter(Array.isArray).flat();
  const values = [product.mockup_1, product.mockup_2, product.mockup_3, ...arrays, product.url_imagem, product.imagem_url, product.imagem]
    .map(value => typeof value === 'object' ? (value?.url || value?.src || '') : value)
    .map(text).filter(value => /^https?:\/\//i.test(value));
  return [...new Set(values)].slice(0, 5);
}
function refByName(kind, name) {
  const bucket = state.refs?.[kind];
  if (!bucket || typeof bucket !== 'object') return '';
  if (text(bucket[name])) return text(bucket[name]);
  const target = norm(name);
  for (const [key, value] of Object.entries(bucket)) if (norm(key) === target) return text(value);
  return '';
}
async function loadRefs() {
  if (state.refs) return state.refs;
  const response = await fetch(`${FIREBASE_BASE}/${REF_PATH}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  state.refs = response.ok ? ((await response.json()) || {}) : {};
  return state.refs;
}

function selectedKeys() {
  return $$('input[data-select-mug]:checked', $('#mugs')).map(box => text(box.dataset.selectMug)).filter(Boolean);
}
function updateSelectionUi() {
  const bar = $('#cfBulkActions');
  if (!bar) return;
  const keys = selectedKeys();
  const count = $('#cfBulkCount');
  if (count) count.textContent = `${keys.length} selecionada${keys.length === 1 ? '' : 's'}`;
  $$('.cf-bulk-action', bar).forEach(button => { button.disabled = state.running || keys.length === 0; });
  const clear = $('#cfBulkClear');
  if (clear) clear.disabled = state.running || keys.length === 0;
}
function setBulkStatus(message, tone = '') {
  const el = $('#cfBulkStatus');
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
}
function setRunning(value) {
  state.running = value;
  updateSelectionUi();
  if ($('#cfBulkProgress')) $('#cfBulkProgress').hidden = !value;
}
function setProgress(done, total, label) {
  const pct = total ? Math.round(done / total * 100) : 0;
  const bar = $('#cfBulkProgressBar');
  const textEl = $('#cfBulkProgressText');
  if (bar) bar.style.width = `${pct}%`;
  if (textEl) textEl.textContent = `${label} · ${done}/${total}`;
}

function installStyles() {
  if ($('#cfBulkActionsStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfBulkActionsStyles';
  style.textContent = `
    .cf-bulk-actions{display:grid;gap:10px;margin:0 0 12px;padding:12px 14px;border:1px solid #dedfd9;border-radius:14px;background:#fff}
    .cf-bulk-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .cf-bulk-head strong{font-size:14px}.cf-bulk-head small{display:block;color:#6b7169;margin-top:2px}
    .cf-bulk-buttons{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
    .cf-bulk-buttons button{white-space:nowrap}.cf-bulk-buttons .primary{background:#171918;color:#fff}
    .cf-bulk-status{font-size:12px;color:#60675f;min-height:16px}.cf-bulk-status[data-tone="error"]{color:#9d302d}.cf-bulk-status[data-tone="good"]{color:#27623a}
    .cf-bulk-progress{height:6px;background:#eceee9;border-radius:999px;overflow:hidden}.cf-bulk-progress i{display:block;width:0;height:100%;background:currentColor;transition:width .2s ease}
    .cf-bulk-progress-row{display:grid;gap:5px}.cf-bulk-progress-row span{font-size:11px;color:#6b7169}
    @media(max-width:760px){.cf-bulk-actions{padding:10px}.cf-bulk-buttons{display:grid;grid-template-columns:1fr 1fr;width:100%}.cf-bulk-buttons button{width:100%}.cf-bulk-head{align-items:stretch}}
  `;
  document.head.appendChild(style);
}

function installBulkBar() {
  if (!location.hash.includes('mugs')) return false;
  const root = $('#mugs');
  const table = root?.querySelector('table');
  if (!root || !table) return false;
  if ($('#cfBulkActions', root)) { updateSelectionUi(); return true; }
  installStyles();
  const bar = document.createElement('section');
  bar.id = 'cfBulkActions';
  bar.className = 'cf-bulk-actions';
  bar.innerHTML = `
    <div class="cf-bulk-head">
      <div><strong>Ações em lote</strong><small>Marque uma ou mais canecas na lista. Não é necessário abrir o cadastro.</small></div>
      <span class="badge cf" id="cfBulkCount">0 selecionadas</span>
    </div>
    <div class="cf-bulk-buttons">
      <button class="secondary cf-bulk-action" id="cfBulkActivateDa" type="button">Ativar Dona Antônia</button>
      <button class="secondary cf-bulk-action" id="cfBulkActivateCf" type="button">Ativar Caneca Fácil + sincronizar</button>
      <button class="primary cf-bulk-action" id="cfBulkActivateBoth" type="button">Ativar nos dois + sincronizar</button>
      <button class="secondary cf-bulk-action" id="cfBulkSync" type="button">Sincronizar Caneca Fácil</button>
      <button class="secondary" id="cfBulkClear" type="button">Limpar seleção</button>
    </div>
    <div class="cf-bulk-progress-row" id="cfBulkProgress" hidden><span id="cfBulkProgressText">Preparando…</span><div class="cf-bulk-progress"><i id="cfBulkProgressBar"></i></div></div>
    <div class="cf-bulk-status" id="cfBulkStatus">Selecione as canecas e escolha uma ação.</div>`;
  const exportBar = root.querySelector('.li-export-bar');
  if (exportBar) exportBar.insertAdjacentElement('beforebegin', bar);
  else table.closest('.panel')?.insertAdjacentElement('beforebegin', bar);

  $('#cfBulkActivateDa', bar).onclick = () => runBulk('activate_da');
  $('#cfBulkActivateCf', bar).onclick = () => runBulk('activate_cf_sync');
  $('#cfBulkActivateBoth', bar).onclick = () => runBulk('activate_both_sync');
  $('#cfBulkSync', bar).onclick = () => runBulk('sync_cf');
  $('#cfBulkClear', bar).onclick = clearSelection;
  updateSelectionUi();
  return true;
}
function scheduleInstall(attempt = 0) {
  if (installBulkBar()) return;
  if (location.hash.includes('mugs') && attempt < 30) setTimeout(() => scheduleInstall(attempt + 1), 120);
}
function clearSelection() {
  $$('input[data-select-mug]:checked', $('#mugs')).forEach(box => {
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const all = $('#cfSelectAll');
  if (all) all.checked = false;
  updateSelectionUi();
  setBulkStatus('Seleção limpa.');
}
function unselectKeys(keys) {
  for (const key of keys) {
    const box = $(`input[data-select-mug="${CSS.escape(key)}"]`, $('#mugs'));
    if (!box?.checked) continue;
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }
  updateSelectionUi();
}

function basePatch(product, { activateDa = null, activateCf = null, pendingSync = false } = {}) {
  const now = nowIso();
  const img = images(product);
  const catType = categoryTypeOf(product);
  const catName = categoryNameFor(catType);
  const li = liMeta(product);
  const categoryUri = text(li.categoria_uri || product.loja_integrada_categoria_uri) || refByName('categorias', catName);
  const brandUri = text(li.marca_uri || product.loja_integrada_marca_uri) || refByName('marcas', POLICY.brand);
  const patch = {
    marca: POLICY.brand,
    material: text(product.material || product.material_caneca) || 'Porcelana',
    material_caneca: text(product.material_caneca || product.material) || 'Porcelana',
    ncm: digits(product.ncm) || '69111090',
    estoque: POLICY.stock,
    estoque_gerenciado: POLICY.stockManaged,
    estoque_situacao_em_estoque: POLICY.availabilityDays,
    estoque_situacao_sem_estoque: POLICY.outOfStockDays,
    peso_embalado_kg: POLICY.weightKg,
    altura_embalada_cm: POLICY.heightCm,
    largura_embalada_cm: POLICY.widthCm,
    comprimento_embalado_cm: POLICY.lengthCm,
    mockup_1: text(product.mockup_1) || img[0] || '',
    mockup_2: text(product.mockup_2) || img[1] || '',
    mockup_3: text(product.mockup_3) || img[2] || '',
    loja_integrada_categoria_tipo: catType,
    loja_integrada_alias: text(product.loja_integrada_alias || li.alias) || slug(product.nome),
    politica_caneca_facil_versao: '20260829-1',
    updated_at: now,
    last_update: Date.now(),
    loja_integrada: {
      ...li,
      marca_nome: POLICY.brand,
      marca_uri: brandUri,
      categoria_tipo: catType,
      categoria_nome: catName,
      categoria_uri: categoryUri,
      alias: text(product.loja_integrada_alias || li.alias) || slug(product.nome),
      material: text(product.material_caneca || product.material) || 'Porcelana',
      tipo_producao: POLICY.productionType,
      origem_mercadoria: POLICY.originCode,
      estoque_gerenciado: POLICY.stockManaged,
      estoque_quantidade: POLICY.stock,
      situacao_em_estoque: POLICY.availabilityDays,
      situacao_sem_estoque: POLICY.outOfStockDays,
      ...(pendingSync ? { sync_status: 'pendente', sync_error: '', sync_solicitado_em: now } : {}),
    },
  };
  if (activateDa !== null) Object.assign(patch, { ativo: activateDa, situacao: activateDa ? 'A' : 'I', status: activateDa ? 'A' : 'I' });
  if (activateCf !== null) Object.assign(patch, { loja_integrada_ativo: activateCf, canecafacil_ativo: activateCf });
  return patch;
}
function mergedProduct(product, patch) {
  return { ...product, ...patch, loja_integrada: { ...liMeta(product), ...(patch.loja_integrada || {}) } };
}
function validateForLi(product = {}) {
  const issues = [];
  if (!text(product.nome)) issues.push('nome');
  if (!text(product.codigo || product.sku)) issues.push('SKU');
  if (!(numberValue(product.preco) > 0) && product.preco_sob_consulta !== true) issues.push('preço');
  if (!text(product.mockup_1)) issues.push('imagem 1');
  if (digits(product.ncm).length !== 8) issues.push('NCM');
  if (!(numberValue(product.peso_embalado_kg) > 0)) issues.push('peso');
  if (!(numberValue(product.altura_embalada_cm) > 0) || !(numberValue(product.largura_embalada_cm) > 0) || !(numberValue(product.comprimento_embalado_cm) > 0)) issues.push('dimensões');
  return issues;
}
function liDescription(product = {}) {
  const base = text(product.descricao_completa || product.descricao || '');
  if (!isPersonalizable(product)) return base;
  const link = `${PERSONALIZER_BASE}?model=${encodeURIComponent(productKey(product))}`;
  return `${base}\n<div class="cf-personalizer-box" style="margin:18px 0;padding:16px;border:1px solid #e8e8e3;border-radius:12px;text-align:center"><strong style="display:block;margin-bottom:8px">Personalize esta caneca</strong><a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">PERSONALIZAR ESTA CANECA</a></div>`;
}
function liPayload(product = {}) {
  const li = liMeta(product);
  const productBody = {
    id_externo: null,
    sku: text(product.codigo || product.sku),
    mpn: text(product.mpn) || null,
    ncm: digits(product.ncm) || null,
    gtin: digits(product.gtin || product.ean || product.codigo_barras) || null,
    nome: text(product.nome),
    apelido: text(product.loja_integrada_alias || li.alias) || slug(product.nome),
    descricao_completa: liDescription(product),
    ativo: liActive(product),
    destaque: product.destaque === true,
    peso: numberValue(product.peso_embalado_kg || product.peso) || null,
    altura: Math.ceil(numberValue(product.altura_embalada_cm || product.altura)) || null,
    largura: Math.ceil(numberValue(product.largura_embalada_cm || product.largura)) || null,
    profundidade: Math.ceil(numberValue(product.comprimento_embalado_cm || product.comprimento)) || null,
    tipo: 'normal',
    usado: product.usado === true,
    categorias: text(li.categoria_uri) ? [text(li.categoria_uri)] : [],
    marca: text(li.marca_uri) || null,
    removido: false,
    url_video_youtube: text(product.url_video_youtube || product.video_youtube || product.youtube_url) || null,
  };
  const priceBody = {
    cheio: numberValue(product.preco),
    custo: numberValue(product.preco_custo || product.custo) || 0,
    sob_consulta: product.preco_sob_consulta === true,
    promocional: numberValue(product.preco_oferta || product.preco_promocional) || 0,
  };
  const stockBody = {
    gerenciado: product.estoque_gerenciado !== false,
    quantidade: Math.max(0, Math.floor(numberValue(product.estoque))),
    situacao_em_estoque: Math.min(90, Math.max(0, Math.floor(numberValue(product.estoque_situacao_em_estoque)))),
    situacao_sem_estoque: Number(product.estoque_situacao_sem_estoque ?? 0),
  };
  const seoBody = {
    title: text(product.seo_title || product.seo_tag_title || product.nome).slice(0, 70),
    keyword: text(product.seo_keywords || (Array.isArray(product.tags) ? product.tags.join(', ') : product.tags || '')),
    description: text(product.seo_description || product.seo_tag_description || product.meta_description || '').slice(0, 250),
  };
  return {
    action: li.produto_id ? 'loja_integrada_update_product' : 'loja_integrada_create_product',
    request_id: `LI-BULK-${Date.now().toString(36).toUpperCase()}`,
    product_key: productKey(product),
    model_id: productKey(product),
    loja_integrada_product_id: text(li.produto_id),
    loja_integrada_seo_id: text(li.seo_id),
    firebase_url: FIREBASE_BASE,
    products_node: MUG_NODES.products,
    produto_json: JSON.stringify(productBody),
    preco_json: JSON.stringify(priceBody),
    estoque_json: JSON.stringify(stockBody),
    seo_json: JSON.stringify(seoBody),
    alias_json: JSON.stringify({ absolute_path: `/${text(product.loja_integrada_alias || li.alias) || slug(product.nome)}` }),
    mockup_1: text(product.mockup_1),
    mockup_2: text(product.mockup_2),
    mockup_3: text(product.mockup_3),
    personalizavel: isPersonalizable(product),
    ativo_loja: liActive(product),
    sku: text(product.codigo || product.sku),
    marca_nome: POLICY.brand,
    categoria_nome: categoryNameFor(categoryTypeOf(product)),
    source: BUILD,
  };
}

async function syncOne(product) {
  const key = productKey(product);
  const li = liMeta(product);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    await patchMug(key, { loja_integrada: { ...li, sync_status: 'enviando', sync_error: '', sync_solicitado_em: nowIso() } });
    const response = await fetch(MAKE_WEBHOOK, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify(liPayload(product)) }), signal: controller.signal,
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok || data.ok === false) throw new Error(data.error || data.error_message || `Make HTTP ${response.status}: ${raw.slice(0, 180)}`);
    const next = {
      ...li,
      produto_id: data.produto_id || data.product_id || li.produto_id || '',
      seo_id: data.seo_id || li.seo_id || '',
      resource_uri: data.resource_uri || li.resource_uri || '',
      url: data.url || li.url || '',
      sync_status: 'sincronizado',
      sync_error: '',
      sync_at: nowIso(),
      ativo: liActive(product),
      personalizavel: isPersonalizable(product),
      synced_mockup_1: text(product.mockup_1),
      synced_mockup_2: text(product.mockup_2),
      synced_mockup_3: text(product.mockup_3),
    };
    await patchMug(key, { loja_integrada: next });
    return { ok: true, key, productId: next.produto_id };
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Tempo esgotado esperando o Make.' : (error?.message || String(error));
    await patchMug(key, { loja_integrada: { ...li, sync_status: 'erro', sync_error: message, sync_at: nowIso() } }).catch(() => {});
    return { ok: false, key, error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function runBulk(action) {
  if (state.running) return;
  const keys = selectedKeys();
  if (!keys.length) return toast('Selecione ao menos uma caneca.', true);

  const actionConfig = {
    activate_da: { label: 'Ativando na Dona Antônia', activateDa: true, activateCf: null, sync: false },
    activate_cf_sync: { label: 'Ativando e sincronizando no Caneca Fácil', activateDa: null, activateCf: true, sync: true },
    activate_both_sync: { label: 'Ativando nos dois canais', activateDa: true, activateCf: true, sync: true },
    sync_cf: { label: 'Sincronizando no Caneca Fácil', activateDa: null, activateCf: null, sync: true },
  }[action];
  if (!actionConfig) return;

  setRunning(true);
  setBulkStatus(`${actionConfig.label}…`);
  setProgress(0, keys.length, actionConfig.label);
  const success = [];
  const failures = [];
  try {
    await loadRefs();
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      setProgress(index, keys.length, `${actionConfig.label} · ${index + 1}ª caneca`);
      try {
        const remote = await getMug(key);
        if (!remote) throw new Error('Caneca não encontrada.');
        const patch = basePatch(remote, {
          activateDa: actionConfig.activateDa,
          activateCf: actionConfig.activateCf,
          pendingSync: actionConfig.sync,
        });
        await patchMug(key, patch);
        const merged = mergedProduct(remote, patch);
        if (actionConfig.sync) {
          const issues = validateForLi(merged);
          if (issues.length) throw new Error(`Cadastro incompleto: ${issues.join(', ')}`);
          const result = await syncOne(merged);
          if (!result.ok) throw new Error(result.error);
          await sleep(450);
        }
        success.push(key);
      } catch (error) {
        failures.push({ key, error: error?.message || String(error) });
      }
      setProgress(index + 1, keys.length, actionConfig.label);
    }
    await audit('canecas_acao_em_lote_v1', {
      acao: action,
      selecionadas: keys.length,
      sucesso: success.length,
      falhas: failures.length,
      produtos: keys,
      source: BUILD,
    }).catch(() => {});

    unselectKeys(success);
    invalidateMugs('ação em lote concluída');
    const failMessage = failures.length ? ` · ${failures.length} falha(s)` : '';
    setBulkStatus(`${success.length} caneca(s) concluída(s)${failMessage}.`, failures.length ? 'error' : 'good');
    toast(`${success.length} caneca(s) processada(s)${failMessage}.`, failures.length > 0 && success.length === 0);
    if (failures.length) console.warn('[Admin Canecas] falhas na ação em lote:', failures);
    const reload = $('#cfMugReload');
    if (reload) reload.click();
  } finally {
    setRunning(false);
    setTimeout(() => scheduleInstall(), 250);
  }
}

window.addEventListener('admin-canecas:route', event => {
  if (event.detail?.route === 'mugs') setTimeout(() => scheduleInstall(), 0);
});
document.addEventListener('change', event => {
  if (event.target.matches?.('input[data-select-mug],#cfSelectAll')) queueMicrotask(updateSelectionUi);
});
document.addEventListener('click', event => {
  if (event.target.closest?.('#cfMugReload')) setTimeout(() => scheduleInstall(), 250);
}, true);

if (location.hash.includes('mugs')) scheduleInstall();
document.documentElement.dataset.cfBulkActions = BUILD;

export { BUILD, runBulk, installBulkBar, liPayload };
