import {
  debounce, escapeHtml, money, normalizeSearch, number, productCode, productImage, productKey, productName, text,
} from './core/utils.js';
import { loadProduct, saveProduct } from './services/firebase.js';
import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';

const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="11">sem foto</text></svg>')}`;
let selectedKey = '';

function config() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function products() {
  return window.__adminV2OffersStore?.state?.products || [];
}

function product(key) {
  return products().find(row => productKey(row) === String(key)) || null;
}

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 6500 : 3500);
}

function installStyles() {
  if (document.getElementById('offerManagerStyles')) return;
  const style = document.createElement('style');
  style.id = 'offerManagerStyles';
  style.textContent = `
    .offer-manager-tabs{display:flex;gap:5px;padding:12px 16px 0;border-bottom:1px solid var(--line);background:#fafbf9}.offer-manager-tabs button{min-height:38px;padding:0 14px;border:1px solid var(--line);border-bottom:0;border-radius:9px 9px 0 0;background:#fff;color:var(--muted);font-size:10px;font-weight:900}.offer-manager-tabs button.active{background:var(--primary);border-color:var(--primary);color:#fff}
    .offer-auto-panel[hidden],.manual-offers-panel[hidden]{display:none!important}.manual-offers-panel{padding:14px 16px 17px}.manual-offer-layout{display:grid;grid-template-columns:minmax(340px,.9fr) minmax(380px,1.1fr);gap:12px;align-items:start}.manual-offer-column{border:1px solid var(--line);border-radius:12px;background:#fafbf9;overflow:hidden}.manual-offer-column-head{padding:12px 13px;border-bottom:1px solid var(--line);background:#fff}.manual-offer-column-head h3{margin:0;font-size:13px}.manual-offer-column-head p{margin:4px 0 0;color:var(--muted);font-size:9px}.manual-offer-search{padding:10px}.manual-offer-search input{width:100%;min-height:42px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:9px;background:#fff;font-size:11px}.manual-offer-results,.manual-current-offers{display:grid;gap:6px;max-height:480px;overflow:auto;padding:0 10px 10px}.manual-offer-result{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:10px;background:#fff;text-align:left}.manual-offer-result img{width:58px;height:58px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff;padding:3px}.manual-offer-result strong,.manual-offer-result small{display:block}.manual-offer-result strong{font-size:10px}.manual-offer-result small{margin-top:3px;color:var(--muted);font-size:8px}.manual-offer-result b{font-size:9px;color:var(--info)}.manual-offer-result.has-offer{border-color:#d8c891;background:#fffdf7}
    .manual-offer-editor{padding:13px}.manual-offer-empty{padding:45px 20px;text-align:center;color:var(--muted);font-size:11px}.manual-product-hero{display:grid;grid-template-columns:100px minmax(0,1fr);gap:12px;align-items:center;margin-bottom:12px;padding:10px;border:1px solid var(--line);border-radius:11px;background:#fff}.manual-product-hero img{width:100px;height:100px;object-fit:contain;border-radius:9px;background:#fff}.manual-product-hero h3{margin:4px 0 0;font-size:15px}.manual-product-hero small{display:block;margin-top:4px;color:var(--muted);font-size:9px}.manual-offer-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.manual-offer-form label{display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:9px;font-weight:850}.manual-offer-form input,.manual-offer-form textarea{width:100%;min-height:40px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:9px;background:#fff;font-size:11px}.manual-offer-form textarea{grid-column:1/-1;min-height:82px;resize:vertical}.manual-offer-preview{grid-column:1/-1;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}.manual-offer-preview strong,.manual-offer-preview small{display:block}.manual-offer-preview strong{font-size:13px}.manual-offer-preview small{margin-top:4px;color:var(--muted);font-size:9px}.manual-offer-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:7px;margin-top:2px}.manual-offer-safety{grid-column:1/-1;margin:0;color:var(--muted);font-size:9px;line-height:1.45}.manual-current-title{padding:10px 10px 6px;color:var(--muted);font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
    @media(max-width:980px){.manual-offer-layout{grid-template-columns:1fr}}@media(max-width:760px){.manual-offers-panel{padding:10px}.manual-offer-form{grid-template-columns:1fr}.manual-offer-form textarea,.manual-offer-preview,.manual-offer-actions,.manual-offer-safety{grid-column:auto}.manual-offer-actions .button{flex:1}}
  `;
  document.head.appendChild(style);
}

function dateOnly(value) {
  return text(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function offerOrigin(row) {
  return text(row?.oferta_origem || (number(row?.preco_oferta) > 0 ? 'manual' : ''));
}

function discount(row, offerValue = null) {
  const price = number(row?.preco);
  const offer = offerValue === null ? number(row?.preco_oferta) : number(offerValue);
  return price > 0 && offer > 0 ? Math.round((1 - offer / price) * 10000) / 100 : 0;
}

function resultCard(row, action = 'Editar') {
  const hasOffer = number(row.preco_oferta) > 0;
  const origin = offerOrigin(row);
  return `<button class="manual-offer-result ${hasOffer ? 'has-offer' : ''}" type="button" data-manual-offer-product="${escapeHtml(productKey(row))}"><img src="${escapeHtml(productImage(row) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt=""><span><strong>${escapeHtml(productName(row))}</strong><small>${escapeHtml(productCode(row) || productKey(row))} · normal ${money(row.preco)}${hasOffer ? ` · oferta ${money(row.preco_oferta)} (${discount(row)}%)` : ''}</small><small>${hasOffer ? `Origem: ${escapeHtml(origin || 'manual')} · até ${escapeHtml(dateOnly(row.validade_oferta) || 'sem fim')}` : `Estoque ${number(row.estoque)}`}</small></span><b>${action}</b></button>`;
}

function filteredProducts(query) {
  const normalized = normalizeSearch(query);
  if (!normalized) return products().slice(0, 20);
  return products().filter(row => normalizeSearch([
    productName(row), productCode(row), row.gtin, row.ean, row.marca, row.categoria,
  ].join(' ')).includes(normalized)).slice(0, 30);
}

function renderSearch() {
  const input = document.getElementById('manualOfferSearch');
  const results = document.getElementById('manualOfferResults');
  if (!input || !results) return;
  const rows = filteredProducts(input.value);
  results.innerHTML = rows.length ? rows.map(row => resultCard(row, number(row.preco_oferta) > 0 ? 'Editar' : 'Criar')).join('') : '<div class="manual-offer-empty">Nenhum produto encontrado.</div>';
}

function renderCurrentOffers() {
  const current = document.getElementById('manualCurrentOffers');
  if (!current) return;
  const rows = products().filter(row => number(row.preco_oferta) > 0)
    .sort((a, b) => productName(a).localeCompare(productName(b), 'pt-BR'));
  current.innerHTML = rows.length ? rows.map(row => resultCard(row, offerOrigin(row) === 'validade' ? 'Ver' : 'Editar')).join('') : '<div class="manual-offer-empty">Nenhuma oferta cadastrada.</div>';
}

function editorProduct() {
  return product(selectedKey);
}

function renderEditor() {
  const editor = document.getElementById('manualOfferEditor');
  const row = editorProduct();
  if (!editor) return;
  if (!row) {
    editor.innerHTML = '<div class="manual-offer-empty">Pesquise e selecione um produto para criar ou editar a oferta.</div>';
    return;
  }
  const origin = offerOrigin(row);
  const start = dateOnly(row.data_inicio_oferta) || new Date().toISOString().slice(0, 10);
  const end = dateOnly(row.validade_oferta);
  editor.innerHTML = `<div class="manual-product-hero"><img src="${escapeHtml(productImage(row) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt=""><div><span class="eyebrow">Oferta ${escapeHtml(origin || 'nova')}</span><h3>${escapeHtml(productName(row))}</h3><small>${escapeHtml(productCode(row) || productKey(row))} · estoque ${number(row.estoque)}</small><small>Preço normal: ${money(row.preco)}</small></div></div><div class="manual-offer-form"><label>Preço normal<input id="manualRegularPrice" type="text" value="${escapeHtml(money(row.preco))}" disabled></label><label>Preço de oferta<input id="manualOfferPrice" type="number" min="0.01" step="0.01" value="${number(row.preco_oferta) || ''}"></label><label>Início<input id="manualOfferStart" type="date" value="${escapeHtml(start)}"></label><label>Fim<input id="manualOfferEnd" type="date" value="${escapeHtml(end)}"></label><textarea id="manualOfferNote" placeholder="Observação interna da oferta">${escapeHtml(row.oferta_observacao || '')}</textarea><div class="manual-offer-preview" id="manualOfferPreview"></div><p class="manual-offer-safety" id="manualOfferSafety"></p><div class="manual-offer-actions"><button class="button ghost" id="manualOfferClear" type="button" ${number(row.preco_oferta) > 0 && origin !== 'validade' ? '' : 'disabled'}>Remover oferta manual</button><button class="button primary" id="manualOfferSave" type="button">Salvar oferta</button></div></div>`;
  ['manualOfferPrice', 'manualOfferStart', 'manualOfferEnd'].forEach(id => document.getElementById(id)?.addEventListener('input', renderPreview));
  document.getElementById('manualOfferSave')?.addEventListener('click', saveManualOffer);
  document.getElementById('manualOfferClear')?.addEventListener('click', clearManualOffer);
  renderPreview();
}

function formValues() {
  return {
    price: number(document.getElementById('manualOfferPrice')?.value),
    start: text(document.getElementById('manualOfferStart')?.value),
    end: text(document.getElementById('manualOfferEnd')?.value),
    note: text(document.getElementById('manualOfferNote')?.value),
  };
}

function validateManual(row, values) {
  const errors = [];
  if (number(row?.preco) <= 0) errors.push('Preço normal inválido');
  if (values.price <= 0) errors.push('Informe o preço de oferta');
  if (values.price >= number(row?.preco)) errors.push('A oferta deve ser menor que o preço normal');
  if (!values.start) errors.push('Informe o início');
  if (!values.end) errors.push('Informe o fim');
  if (values.start && values.end && values.start > values.end) errors.push('O início não pode ser posterior ao fim');
  return errors;
}

function renderPreview() {
  const row = editorProduct();
  const preview = document.getElementById('manualOfferPreview');
  const safety = document.getElementById('manualOfferSafety');
  const save = document.getElementById('manualOfferSave');
  if (!row || !preview || !safety || !save) return;
  const values = formValues();
  const errors = validateManual(row, values);
  const percent = discount(row, values.price);
  preview.innerHTML = `<strong>${money(row.preco)} → ${values.price > 0 ? money(values.price) : '—'}${percent > 0 ? ` · ${percent}% de desconto` : ''}</strong><small>${values.start || 'sem início'} até ${values.end || 'sem fim'} · oferta manual protegida contra a automação de validade</small>`;
  const cfg = config();
  save.disabled = Boolean(errors.length || !cfg.writeMode || !cfg.offerWriteMode);
  safety.textContent = errors.length ? errors.join(' · ') : !cfg.writeMode || !cfg.offerWriteMode ? 'Ative a gravação geral e a trava de ofertas para salvar.' : 'Oferta pronta para gravação protegida no Firebase.';
}

function collectionStore() {
  return window.__adminV2CollectionsModule?.store || null;
}

function updateLocal(saved) {
  const key = productKey(saved);
  const stores = [window.__adminV2OffersStore, collectionStore()].filter(Boolean);
  stores.forEach(store => {
    const index = store.state.products.findIndex(row => productKey(row) === key);
    if (index >= 0) store.state.products[index] = saved;
  });
  window.__adminV2OffersModule?.recalculate?.();
  window.__adminV2CollectionsModule?.renderItems?.();
  window.__adminV2CollectionsModule?.renderAudit?.();
  renderSearch();
  renderCurrentOffers();
}

async function saveManualOffer() {
  const local = editorProduct();
  if (!local) return;
  const values = formValues();
  const errors = validateManual(local, values);
  if (errors.length) return toast(errors.join(' · '), 'error');
  const cfg = config();
  if (!cfg.writeMode || !cfg.offerWriteMode) return toast('As gravações de ofertas estão bloqueadas.', 'error');
  const button = document.getElementById('manualOfferSave');
  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    const remote = await loadProduct(cfg, productKey(local));
    if (!remote) throw new Error('Produto não encontrado no Firebase.');
    const next = {
      ...remote,
      preco_oferta: values.price,
      data_inicio_oferta: values.start,
      validade_oferta: `${values.end}T23:59:59-04:00`,
      oferta_origem: 'manual',
      desconto_manual: discount(remote, values.price),
      oferta_observacao: values.note,
      oferta_manual_atualizada_em: new Date().toISOString(),
    };
    delete next.desconto_validade;
    const saved = await saveProduct(cfg, next, remote);
    updateLocal(saved);
    selectedKey = productKey(saved);
    renderEditor();
    toast('Oferta manual salva. A automação por validade não irá sobrescrevê-la.', 'success');
  } catch (error) {
    toast(error?.message || String(error), 'error');
  } finally {
    const current = document.getElementById('manualOfferSave');
    if (current) current.textContent = 'Salvar oferta';
    renderPreview();
  }
}

async function clearManualOffer() {
  const local = editorProduct();
  if (!local || offerOrigin(local) === 'validade') return;
  if (!confirm(`Remover a oferta manual de “${productName(local)}”?`)) return;
  const cfg = config();
  if (!cfg.writeMode || !cfg.offerWriteMode) return toast('As gravações de ofertas estão bloqueadas.', 'error');
  try {
    const remote = await loadProduct(cfg, productKey(local));
    if (!remote) throw new Error('Produto não encontrado no Firebase.');
    const next = { ...remote };
    ['preco_oferta', 'data_inicio_oferta', 'validade_oferta', 'oferta_origem', 'desconto_manual', 'oferta_observacao', 'oferta_manual_atualizada_em'].forEach(field => delete next[field]);
    const saved = await saveProduct(cfg, next, remote);
    updateLocal(saved);
    selectedKey = productKey(saved);
    renderEditor();
    toast('Oferta manual removida.', 'success');
  } catch (error) {
    toast(error?.message || String(error), 'error');
  }
}

function installPanel() {
  const workspace = document.getElementById('offersWorkspace');
  if (!workspace || document.getElementById('offerManagerTabs')) return false;
  const header = workspace.querySelector('.panel-header');
  const tabs = document.createElement('div');
  tabs.className = 'offer-manager-tabs';
  tabs.id = 'offerManagerTabs';
  tabs.innerHTML = '<button class="active" type="button" data-offer-tab="automatic">Automáticas por validade</button><button type="button" data-offer-tab="manual">Criar e editar ofertas</button>';
  header.insertAdjacentElement('afterend', tabs);
  [...workspace.children].forEach(child => {
    if (child === header || child === tabs) return;
    child.classList.add('offer-auto-panel');
  });
  workspace.insertAdjacentHTML('beforeend', `<section class="manual-offers-panel" id="manualOffersPanel" hidden><div class="manual-offer-layout"><section class="manual-offer-column"><div class="manual-offer-column-head"><h3>Produtos e ofertas atuais</h3><p>Pesquise com foto e abra o produto sem sair desta aba.</p></div><div class="manual-offer-search"><input id="manualOfferSearch" type="search" placeholder="Nome, código, EAN ou marca"></div><div id="manualOfferResults" class="manual-offer-results"></div><div class="manual-current-title">Ofertas cadastradas</div><div id="manualCurrentOffers" class="manual-current-offers"></div></section><section class="manual-offer-column"><div class="manual-offer-column-head"><h3>Editor da oferta</h3><p>Cria uma oferta manual, protegida contra a automação por validade.</p></div><div id="manualOfferEditor" class="manual-offer-editor"></div></section></div></section>`);
  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-offer-tab]');
    if (!button) return;
    const manual = button.dataset.offerTab === 'manual';
    tabs.querySelectorAll('button').forEach(tab => tab.classList.toggle('active', tab === button));
    workspace.querySelectorAll('.offer-auto-panel').forEach(node => { node.hidden = manual; });
    document.getElementById('manualOffersPanel').hidden = !manual;
    if (manual) {
      renderSearch();
      renderCurrentOffers();
      renderEditor();
      document.getElementById('manualOfferSearch')?.focus({ preventScroll: true });
    }
  });
  document.getElementById('manualOfferSearch').addEventListener('input', debounce(renderSearch, 120));
  document.getElementById('manualOffersPanel').addEventListener('click', event => {
    const button = event.target.closest('[data-manual-offer-product]');
    if (!button) return;
    selectedKey = button.dataset.manualOfferProduct;
    renderEditor();
  });
  renderSearch();
  renderCurrentOffers();
  renderEditor();
  return true;
}

function start() {
  installStyles();
  if (installPanel()) return;
  setTimeout(start, 120);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
