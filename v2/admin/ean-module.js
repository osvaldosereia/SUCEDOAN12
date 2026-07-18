import { lookupProductByEan, createNewProductSeed, normalizeEan } from '../services/ean-service.js';

const content = document.getElementById('admin-content');
const status = document.getElementById('admin-status');
const title = document.getElementById('module-title');
const subtitle = document.getElementById('module-subtitle');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
const state = { loading: false, lastEan: '', lastResult: null };

function renderStart() {
  title.textContent = 'Consulta por EAN';
  subtitle.textContent = 'Use câmera, leitor USB ou digitação manual para localizar um produto.';
  content.innerHTML = `<section class="module-hero"><div><span class="eyebrow">EAN · SOMENTE LEITURA</span><h2>Localizar produto rapidamente</h2><p>Leitores USB funcionam como teclado: clique no campo, leia o código e pressione Enter.</p></div></section><section class="panel"><form id="ean-search-form"><label class="editor-field editor-field-wide"><span>EAN / código de barras</span><input id="ean-search-input" name="ean" inputmode="numeric" autocomplete="off" autofocus placeholder="Leia ou digite entre 8 e 14 números"></label><div class="editor-actions"><button class="primary-action" type="submit">Buscar produto</button></div></form><div class="notice">A consulta não altera Firebase, estoque, produtos ou pedidos.</div></section>`;
  queueMicrotask(() => document.getElementById('ean-search-input')?.focus());
}

function renderFound(result) {
  const product = result.product;
  content.innerHTML = `<section class="panel"><button class="back-button" type="button" data-ean-back>← Nova leitura</button><div class="panel-head"><div><span class="eyebrow">PRODUTO ENCONTRADO</span><h2>${escapeHtml(product.nome || 'Produto')}</h2></div><span class="score ok">EAN ${escapeHtml(result.ean)}</span></div><div class="editor-summary-grid"><article><span>Código</span><strong>${escapeHtml(product.codigo || '—')}</strong></article><article><span>Categoria</span><strong>${escapeHtml(product.categoria || '—')}</strong></article><article><span>Estoque</span><strong>${Number(product.estoque || 0)}</strong></article><article><span>Preço</span><strong>${Number(product.preco || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></article></div><div class="editor-actions"><button class="primary-action" type="button" data-ean-open-editor="${escapeHtml(product.firebaseKey || product.id || product.codigo || product.gtin)}">Abrir editor</button><button class="secondary-action" type="button" data-ean-back>Realizar outra leitura</button></div></section>`;
}

function renderNotFound(result) {
  const seed = createNewProductSeed(result.ean);
  state.lastResult = { ...result, seed };
  content.innerHTML = `<section class="panel"><button class="back-button" type="button" data-ean-back>← Nova leitura</button><div class="panel-head"><div><span class="eyebrow">EAN NÃO CADASTRADO</span><h2>${escapeHtml(result.ean)}</h2></div><span class="score warn">Novo rascunho</span></div><div class="notice">Nenhum produto foi encontrado. Você pode abrir um rascunho inicial com o EAN preenchido. Nada será salvo externamente.</div><div class="editor-actions"><button class="primary-action" type="button" data-ean-new-draft>Criar rascunho do produto</button><button class="secondary-action" type="button" data-ean-back>Realizar outra leitura</button></div></section>`;
}

async function searchEan(value) {
  if (state.loading) return;
  state.loading = true;
  state.lastEan = normalizeEan(value);
  status.textContent = 'Consultando EAN…';
  status.dataset.type = '';
  try {
    const result = await lookupProductByEan(state.lastEan);
    state.lastResult = result;
    status.textContent = result.found ? 'Produto encontrado' : 'EAN não cadastrado';
    status.dataset.type = result.found ? 'success' : 'error';
    result.found ? renderFound(result) : renderNotFound(result);
  } catch (error) {
    status.textContent = 'Falha na consulta';
    status.dataset.type = 'error';
    content.innerHTML = `<section class="panel"><div class="notice error">${escapeHtml(error.message || error)}</div><div class="editor-actions"><button class="secondary-action" type="button" data-ean-back>Tentar novamente</button></div></section>`;
  } finally {
    state.loading = false;
  }
}

document.addEventListener('submit', event => {
  if (event.target.id !== 'ean-search-form') return;
  event.preventDefault();
  searchEan(new FormData(event.target).get('ean'));
});

document.addEventListener('click', event => {
  const moduleButton = event.target.closest('[data-module="ean"]');
  if (moduleButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelectorAll('[data-module]').forEach(button => button.classList.toggle('active', button === moduleButton));
    renderStart();
    return;
  }
  if (event.target.closest('[data-ean-back]')) { renderStart(); return; }
  const editorButton = event.target.closest('[data-ean-open-editor]');
  if (editorButton) {
    document.dispatchEvent(new CustomEvent('v2:open-product-editor', { detail: { productKey: editorButton.dataset.eanOpenEditor } }));
    return;
  }
  if (event.target.closest('[data-ean-new-draft]') && state.lastResult?.seed) {
    document.dispatchEvent(new CustomEvent('v2:open-new-product-draft', { detail: { product: state.lastResult.seed } }));
  }
}, true);