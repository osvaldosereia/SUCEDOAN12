import { text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, patchMug } from './mug-store-v2.js?v=20260829-1';
import { ensureCrops, cropSetReady } from './storefront-crops-v1.js?v=20260830-3';

const BUILD = '20260830-admin-canecas-archive-audit-v1';
const $ = (selector, root = document) => root.querySelector(selector);
const isHttp = value => /^https?:\/\//i.test(text(value));
const num = value => Number(String(value ?? '').replace(',', '.')) || 0;
const digits = value => String(value ?? '').replace(/\D+/g, '');

let lastRows = [];
let busy = false;

function keyOf(p = {}) { return text(p.__key || p.firebaseKey || p.id); }
function liOf(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function artOf(p = {}) { return text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url || p.arte_final_url); }
function categoryType(p = {}) { return text(p.loja_integrada_categoria_tipo || liOf(p).categoria_tipo || p.canecafacil_categoria_tipo); }
function categoryName(p = {}) { return text(p.loja_integrada_categoria_nome || liOf(p).categoria_nome || p.canecafacil_categoria_nome); }
function brandOk(p = {}) { const li = liOf(p); return norm(li.marca_nome || p.marca) === norm('Caneca Fácil') || Boolean(text(li.marca_uri || p.loja_integrada_marca_uri)); }
function seoOk(p = {}) { return Boolean(text(p.seo_title || p.seo_tag_title || p.nome) && text(p.seo_description || p.seo_tag_description || p.meta_description) && text(p.loja_integrada_alias || liOf(p).alias)); }
function fiscalOk(p = {}) {
  const ncm = digits(p.ncm);
  const weight = num(p.peso_embalado_kg || p.peso);
  const h = num(p.altura_embalada_cm || p.altura), w = num(p.largura_embalada_cm || p.largura), d = num(p.comprimento_embalado_cm || p.comprimento);
  return ncm.length === 8 && weight > 0 && h > 0 && w > 0 && d > 0;
}
function sourceAssetsOk(p = {}) { return isHttp(p.mockup_1) && isHttp(p.mockup_2) && isHttp(artOf(p)); }
function personalizable(p = {}) { return p.personalizavel === true || p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true; }
function suggestedCategory(p = {}) {
  if (categoryType(p)) return '';
  if (personalizable(p)) return 'personalizaveis';
  const hay = norm(`${p.nome || ''} ${p.categoria || ''} ${p.subcategoria || ''} ${p.tema_caneca || ''} ${p.canecafacil_tema || ''}`);
  if (/empresa|corporativ|brinde|logomarca|logo da empresa/.test(hay)) return 'empresas';
  return 'padronizadas';
}
function auditOne(p = {}) {
  const li = liOf(p);
  const sources = sourceAssetsOk(p);
  const crops = cropSetReady(p);
  const cat = Boolean(categoryType(p) && categoryName(p));
  const brand = brandOk(p);
  const seo = seoOk(p);
  const fiscal = fiscalOk(p);
  const linked = Boolean(text(li.produto_id));
  const activeLi = p.loja_integrada_ativo === true || p.canecafacil_ativo === true || li.ativo === true;
  const missing = [];
  if (!isHttp(p.mockup_1)) missing.push('mockup esquerdo');
  if (!isHttp(p.mockup_2)) missing.push('mockup direito');
  if (!isHttp(artOf(p))) missing.push('arte horizontal');
  if (sources && !crops) missing.push('3 recortes da vitrine');
  if (!cat) missing.push('categoria CanecaFácil');
  if (!brand) missing.push('marca Caneca Fácil');
  if (!seo) missing.push('SEO');
  if (!fiscal) missing.push('fiscal/frete');
  if (activeLi && !linked) missing.push('vínculo Loja Integrada');
  return {
    key: keyOf(p), product: p, sources, crops, category: cat, brand, seo, fiscal, linked, activeLi,
    missing, suggestedCategory: suggestedCategory(p),
    readyToCrop: sources && !crops,
    reusable: sources,
    complete: sources && crops && cat && brand && seo && fiscal && (!activeLi || linked),
  };
}

function stats(rows = []) {
  return {
    total: rows.length,
    reusable: rows.filter(r => r.reusable).length,
    readyToCrop: rows.filter(r => r.readyToCrop).length,
    complete: rows.filter(r => r.complete).length,
    missingBase: rows.filter(r => !r.sources).length,
    category: rows.filter(r => !r.category).length,
    brand: rows.filter(r => !r.brand).length,
    seo: rows.filter(r => !r.seo).length,
    fiscal: rows.filter(r => !r.fiscal).length,
    link: rows.filter(r => r.activeLi && !r.linked).length,
  };
}

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 7000 : 4000);
}

function installStyles() {
  if ($('#cfArchiveAuditStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfArchiveAuditStyles';
  style.textContent = `
    .cf-audit{margin:14px 0;padding:16px;border:1px solid #dedfd9;border-radius:14px;background:#fff}.cf-audit-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.cf-audit-head h3{margin:0 0 4px}.cf-audit-head p{margin:0;color:#6d726c;font-size:12px}.cf-audit-actions{display:flex;gap:8px;flex-wrap:wrap}.cf-audit-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;margin-top:12px}.cf-audit-stat{padding:10px;border:1px solid #ecece8;border-radius:10px;background:#fafaf8}.cf-audit-stat b{display:block;font-size:20px}.cf-audit-stat span{font-size:11px;color:#6f746e}.cf-audit-table{margin-top:12px;max-height:360px;overflow:auto;border:1px solid #ecece8;border-radius:10px}.cf-audit-row{display:grid;grid-template-columns:minmax(220px,1.4fr) minmax(210px,1fr) minmax(160px,.8fr);gap:8px;padding:9px 10px;border-bottom:1px solid #eee;font-size:12px}.cf-audit-row:last-child{border-bottom:0}.cf-audit-row strong{display:block}.cf-audit-missing{color:#9a3412}.cf-audit-ok{color:#166534}.cf-audit-progress{margin-top:10px;font-size:12px;color:#545a55}
  `;
  document.head.appendChild(style);
}

function ensurePanel() {
  const root = $('#mugs');
  if (!root || $('#cfArchiveAudit', root)) return;
  installStyles();
  const panel = document.createElement('section');
  panel.id = 'cfArchiveAudit';
  panel.className = 'cf-audit';
  panel.innerHTML = `<div class="cf-audit-head"><div><h3>Auditoria do acervo CanecaFácil</h3><p>Reaproveita os cadastros existentes. Não regenera mockups nem a arte horizontal.</p></div><div class="cf-audit-actions"><button class="secondary" id="cfAuditRun" type="button">Auditar todas</button><button class="primary" id="cfAuditGenerateCrops" type="button" disabled>Gerar somente recortes faltantes</button><button class="secondary" id="cfAuditSafeDefaults" type="button" disabled>Completar dados seguros</button></div></div><div id="cfAuditStats"></div><div id="cfAuditProgress" class="cf-audit-progress"></div><div id="cfAuditRows"></div>`;
  root.prepend(panel);
  $('#cfAuditRun', panel).onclick = runAudit;
  $('#cfAuditGenerateCrops', panel).onclick = generateMissingCrops;
  $('#cfAuditSafeDefaults', panel).onclick = applySafeDefaults;
}

function render(rows) {
  lastRows = rows;
  const s = stats(rows);
  const statsRoot = $('#cfAuditStats');
  if (statsRoot) statsRoot.innerHTML = `<div class="cf-audit-stats">
    <div class="cf-audit-stat"><b>${s.total}</b><span>canecas encontradas</span></div>
    <div class="cf-audit-stat"><b>${s.reusable}</b><span>reaproveitáveis sem nova IA</span></div>
    <div class="cf-audit-stat"><b>${s.readyToCrop}</b><span>só precisam dos 3 recortes</span></div>
    <div class="cf-audit-stat"><b>${s.complete}</b><span>cadastros completos</span></div>
    <div class="cf-audit-stat"><b>${s.category}</b><span>categoria pendente</span></div>
    <div class="cf-audit-stat"><b>${s.brand}</b><span>marca pendente</span></div>
    <div class="cf-audit-stat"><b>${s.seo}</b><span>SEO pendente</span></div>
    <div class="cf-audit-stat"><b>${s.fiscal}</b><span>fiscal/frete pendente</span></div>
    <div class="cf-audit-stat"><b>${s.link}</b><span>vínculo LI pendente</span></div>
  </div>`;
  const list = rows.filter(r => r.missing.length).slice(0, 200);
  const rowsRoot = $('#cfAuditRows');
  if (rowsRoot) rowsRoot.innerHTML = list.length ? `<div class="cf-audit-table">${list.map(r => `<div class="cf-audit-row"><div><strong>${String(r.product.nome || r.key).replace(/</g,'&lt;')}</strong><span>${r.product.codigo || r.product.sku || r.key}</span></div><div class="cf-audit-missing">${r.missing.join(' · ')}</div><div>${!r.category && r.suggestedCategory ? `Sugestão: ${r.suggestedCategory}` : r.readyToCrop ? '<span class="cf-audit-ok">Pode gerar recortes agora</span>' : ''}</div></div>`).join('')}</div>` : '<div class="notice" style="margin-top:10px">Todos os cadastros auditados estão completos.</div>';
  const cropButton = $('#cfAuditGenerateCrops');
  if (cropButton) { cropButton.disabled = s.readyToCrop === 0 || busy; cropButton.textContent = `Gerar somente recortes faltantes${s.readyToCrop ? ` (${s.readyToCrop})` : ''}`; }
  const defaultsButton = $('#cfAuditSafeDefaults');
  if (defaultsButton) defaultsButton.disabled = !rows.length || busy;
}

async function runAudit() {
  if (busy) return;
  busy = true;
  const progress = $('#cfAuditProgress');
  try {
    if (progress) progress.textContent = 'Lendo todas as canecas do Firebase…';
    const products = await loadMugs({ force: true });
    const rows = products.map(auditOne);
    render(rows);
    const s = stats(rows);
    if (progress) progress.textContent = `Auditoria concluída: ${s.total} canecas · ${s.reusable} podem ser reaproveitadas sem nova geração de IA.`;
    toast(`Auditoria concluída: ${s.total} canecas.`);
  } catch (error) {
    if (progress) progress.textContent = `Erro: ${error?.message || error}`;
    toast(error?.message || error, true);
  } finally {
    busy = false;
    if (lastRows.length) render(lastRows);
  }
}

async function generateMissingCrops() {
  if (busy) return;
  const targets = lastRows.filter(r => r.readyToCrop);
  if (!targets.length) return toast('Nenhuma caneca precisa de recortes.');
  if (!confirm(`Gerar somente os 3 recortes faltantes para ${targets.length} caneca(s)? Os mockups e a horizontal existentes serão preservados.`)) return;
  busy = true;
  const progress = $('#cfAuditProgress');
  let ok = 0, errors = 0;
  render(lastRows);
  for (let i = 0; i < targets.length; i += 1) {
    const row = targets[i];
    if (progress) progress.textContent = `Gerando recortes ${i + 1}/${targets.length}: ${row.product.nome || row.key}`;
    try { await ensureCrops(row.key, row.product); ok += 1; }
    catch (error) { errors += 1; console.error('[Auditoria CanecaFácil]', row.key, error); }
  }
  busy = false;
  await runAudit();
  toast(`Recortes concluídos: ${ok} caneca(s)${errors ? ` · ${errors} erro(s)` : ''}.`, errors > 0);
}

async function applySafeDefaults() {
  if (busy) return;
  if (!lastRows.length) return;
  if (!confirm('Aplicar somente dados seguros e determinísticos? Será gravado: marca Caneca Fácil, tipo de produção Revenda e origem 0 (nacional). Categorias sugeridas NÃO serão aplicadas automaticamente.')) return;
  busy = true;
  const progress = $('#cfAuditProgress');
  let changed = 0, errors = 0;
  for (let i = 0; i < lastRows.length; i += 1) {
    const row = lastRows[i], p = row.product, li = liOf(p);
    const need = norm(li.marca_nome) !== norm('Caneca Fácil') || text(li.tipo_producao) !== 'revenda' || text(li.origem_mercadoria) !== '0';
    if (!need) continue;
    if (progress) progress.textContent = `Completando dados seguros ${i + 1}/${lastRows.length}: ${p.nome || row.key}`;
    try {
      await patchMug(row.key, {
        loja_integrada: { ...li, marca_nome: 'Caneca Fácil', tipo_producao: 'revenda', origem_mercadoria: '0' },
        updated_at: nowIso(), last_update: Date.now(),
      });
      changed += 1;
    } catch (error) { errors += 1; console.error('[Auditoria CanecaFácil]', row.key, error); }
  }
  busy = false;
  await runAudit();
  toast(`Dados seguros atualizados em ${changed} caneca(s)${errors ? ` · ${errors} erro(s)` : ''}.`, errors > 0);
}

function scheduleInstall() { setTimeout(ensurePanel, 80); }
const observer = new MutationObserver(scheduleInstall);
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', scheduleInstall);
window.addEventListener('hashchange', scheduleInstall);
scheduleInstall();

document.documentElement.dataset.cfArchiveAudit = BUILD;
export { BUILD, auditOne, stats, runAudit };
