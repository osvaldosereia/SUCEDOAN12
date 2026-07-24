import { findScannedProduct, normalizeScan, quickReadSnapshot } from '../core/quick-read.js';
import { escapeHtml, money, productKey, productName } from '../core/utils.js';

const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="13">sem foto</text></svg>')}`;

function statusKind(code) {
  return ['expired', 'critical', 'no-stock'].includes(code) ? 'danger'
    : ['upcoming', 'no-validity', 'low-stock'].includes(code) ? 'warning' : 'success';
}

function daysText(days) {
  if (days === null) return 'sem validade calculada';
  if (days < 0) return `${Math.abs(days)} dia(s) vencido`;
  if (days === 0) return 'vence hoje';
  return `vence em ${days} dia(s)`;
}

export class QuickReadModule {
  constructor({ store, elements, onToast }) {
    this.store = store;
    this.elements = elements;
    this.onToast = onToast;
    this.result = null;
    this.bind();
    this.render();
  }

  bind() {
    this.elements.quickReadInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.lookup();
    });
    this.elements.quickReadButton.addEventListener('click', () => this.lookup());
    this.elements.quickReadClear.addEventListener('click', () => this.clear());
    this.elements.quickReadResult.addEventListener('click', event => {
      const openProduct = event.target.closest('[data-quick-open-product]');
      const openStock = event.target.closest('[data-quick-open-stock]');
      const select = event.target.closest('[data-quick-select]');
      if (select) {
        const product = this.store.state.products.find(row => productKey(row) === select.dataset.quickSelect);
        if (product) {
          this.result = { scan: this.elements.quickReadInput.value, product, matches: [product], exact: false, error: '' };
          this.render();
        }
      }
      if (openProduct) window.dispatchEvent(new CustomEvent('admin-v2-open-product', { detail: { key: openProduct.dataset.quickOpenProduct } }));
      if (openStock) window.dispatchEvent(new CustomEvent('admin-v2-open-stock', { detail: { key: openStock.dataset.quickOpenStock } }));
    });
  }

  focus() {
    this.elements.quickReadInput.focus({ preventScroll: true });
    this.elements.quickReadInput.select();
  }

  lookup() {
    const scan = normalizeScan(this.elements.quickReadInput.value);
    this.elements.quickReadInput.value = scan;
    this.result = findScannedProduct(this.store.state.products, scan);
    if (this.result.product) this.onToast(`${productName(this.result.product)} localizado.`, 'success');
    else if (this.result.error) this.onToast(this.result.error, 'error');
    this.render();
    this.focus();
  }

  clear() {
    this.result = null;
    this.elements.quickReadInput.value = '';
    this.render();
    this.focus();
  }

  render() {
    if (!this.result) {
      this.elements.quickReadResult.innerHTML = '<div class="quick-read-empty">Leia um EAN ou digite nome/código. O campo permanece em foco para uso com pistola.</div>';
      return;
    }
    if (this.result.product) {
      const snapshot = quickReadSnapshot(this.result.product);
      const kind = statusKind(snapshot.status.code);
      const location = [snapshot.location.gondola, snapshot.location.shelf, snapshot.location.location].filter(Boolean).join(' · ') || 'Não cadastrada';
      this.elements.quickReadResult.innerHTML = `<article class="quick-read-product"><img src="${escapeHtml(snapshot.image || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt=""><div class="quick-read-main"><div class="quick-read-title"><div><span class="eyebrow">${escapeHtml(snapshot.code || snapshot.key)}</span><h3>${escapeHtml(snapshot.name)}</h3><p>EAN ${escapeHtml(snapshot.gtin || 'não informado')} · ${escapeHtml(snapshot.brand || snapshot.category || 'sem classificação')}</p></div><span class="badge ${kind}">${escapeHtml(snapshot.status.label)}</span></div><div class="quick-read-metrics"><div><strong>${snapshot.stock}</strong><span>Estoque</span></div><div><strong>${escapeHtml(snapshot.validity || '—')}</strong><span>${escapeHtml(daysText(snapshot.days))}</span></div><div><strong>${money(snapshot.offerPrice > 0 ? snapshot.offerPrice : snapshot.price)}</strong><span>${snapshot.offerPrice > 0 ? `Normal ${money(snapshot.price)}` : 'Preço'}</span></div><div><strong>${escapeHtml(location)}</strong><span>Localização</span></div></div><div class="quick-read-lots"><strong>Lotes</strong>${snapshot.lots.length ? snapshot.lots.slice(0, 8).map(lot => `<span>${escapeHtml(lot.validade || 'sem validade')} · ${escapeHtml(lot.quantidade)} un.</span>`).join('') : '<span>Nenhum lote cadastrado.</span>'}</div><div class="quick-read-actions"><button class="button secondary" type="button" data-quick-open-product="${escapeHtml(snapshot.key)}">Abrir cadastro</button><button class="button primary" type="button" data-quick-open-stock="${escapeHtml(snapshot.key)}">Ajustar estoque</button></div></div></article>`;
      return;
    }
    const matches = this.result.matches || [];
    this.elements.quickReadResult.innerHTML = matches.length
      ? `<div class="quick-read-matches"><strong>Selecione o produto correto</strong>${matches.map(product => `<button type="button" data-quick-select="${escapeHtml(productKey(product))}"><span>${escapeHtml(productName(product))}</span><small>${escapeHtml(product.gtin || product.ean || product.codigo || productKey(product))}</small></button>`).join('')}</div>`
      : `<div class="quick-read-not-found"><strong>${escapeHtml(this.result.error || 'Produto não encontrado.')}</strong><span>Código lido: ${escapeHtml(this.result.scan)}</span></div>`;
  }
}
