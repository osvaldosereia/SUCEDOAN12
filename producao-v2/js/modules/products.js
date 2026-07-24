import {
  debounce, escapeHtml, formatDate, isActive, money, normalizeSearch, number,
  productCode, productImage, productKey, productMissing, productName, text,
} from '../core/utils.js';

const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="12">sem foto</text></svg>')}`;

export class ProductsModule {
  constructor({ store, elements, onSave, onToast }) {
    this.store = store;
    this.elements = elements;
    this.onSave = onSave;
    this.onToast = onToast;
    this.pageSize = store.state.config.pageSize || 50;
    this.editorTab = 'essential';
    this.bind();
  }

  bind() {
    const { productSearch, categoryFilter, statusFilter, qualityFilter, sortFilter } = this.elements;
    productSearch.addEventListener('input', debounce(() => {
      this.store.state.filters.query = productSearch.value;
      this.store.state.filters.page = 1;
      this.renderTable();
    }));
    [categoryFilter, statusFilter, qualityFilter, sortFilter].forEach(element => element.addEventListener('change', () => {
      this.store.state.filters.category = categoryFilter.value;
      this.store.state.filters.status = statusFilter.value;
      this.store.state.filters.quality = qualityFilter.value;
      this.store.state.filters.sort = sortFilter.value;
      this.store.state.filters.page = 1;
      this.renderTable();
    }));

    this.elements.openFiltersButton.addEventListener('click', () => {
      this.elements.filterBar.hidden = !this.elements.filterBar.hidden;
    });
    this.elements.clearFiltersButton.addEventListener('click', () => this.clearFilters());
    this.elements.productsTableBody.addEventListener('click', event => {
      const button = event.target.closest('[data-product-key]');
      if (button) this.openEditor(button.dataset.productKey);
    });
    this.elements.productsPagination.addEventListener('click', event => {
      const button = event.target.closest('[data-page]');
      if (!button) return;
      this.store.state.filters.page = Number(button.dataset.page) || 1;
      this.renderTable();
      document.querySelector('[data-view="products"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    this.elements.editorTabs.addEventListener('click', event => {
      const button = event.target.closest('[data-editor-tab]');
      if (!button) return;
      this.editorTab = button.dataset.editorTab;
      this.renderEditorTabs();
    });
    this.elements.productForm.addEventListener('input', event => this.handleEditorInput(event));
    this.elements.productForm.addEventListener('change', event => this.handleEditorInput(event));
    this.elements.closeEditorButton.addEventListener('click', () => this.closeEditor());
    this.elements.discardProductButton.addEventListener('click', () => this.discardCurrent());
    this.elements.saveProductButton.addEventListener('click', () => this.saveCurrent());
    this.elements.newProductButton.addEventListener('click', () => this.createDraft());
  }

  clearFilters() {
    Object.assign(this.store.state.filters, { query: '', category: '', status: '', quality: '', sort: 'name', page: 1 });
    this.elements.productSearch.value = '';
    this.elements.categoryFilter.value = '';
    this.elements.statusFilter.value = '';
    this.elements.qualityFilter.value = '';
    this.elements.sortFilter.value = 'name';
    this.renderTable();
  }

  populateFilters() {
    const current = this.elements.categoryFilter.value;
    const categories = [...new Set(this.store.state.products.map(product => text(product.categoria)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    this.elements.categoryFilter.innerHTML = '<option value="">Todas</option>'
      + categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    this.elements.categoryFilter.value = categories.includes(current) ? current : '';
  }

  filteredProducts() {
    const filters = this.store.state.filters;
    const query = normalizeSearch(filters.query);
    let products = [...this.store.state.products];
    if (query) {
      products = products.filter(product => normalizeSearch([
        productName(product), productCode(product), product.gtin, product.ean, product.marca,
        product.categoria, product.subcategoria, product.ncm, product.fornecedor,
      ].join(' ')).includes(query));
    }
    if (filters.category) products = products.filter(product => text(product.categoria) === filters.category);
    if (filters.status === 'active') products = products.filter(isActive);
    if (filters.status === 'inactive') products = products.filter(product => !isActive(product));
    if (filters.status === 'no-stock') products = products.filter(product => number(product.estoque) <= 0);
    if (filters.quality === 'missing-image') products = products.filter(product => !productImage(product));
    if (filters.quality === 'missing-ncm') products = products.filter(product => !text(product.ncm));
    if (filters.quality === 'missing-ean') products = products.filter(product => !text(product.gtin || product.ean));
    if (filters.quality === 'incomplete') products = products.filter(product => productMissing(product).length > 0);

    const sorters = {
      name: (a, b) => productName(a).localeCompare(productName(b), 'pt-BR'),
      'stock-asc': (a, b) => number(a.estoque) - number(b.estoque) || productName(a).localeCompare(productName(b), 'pt-BR'),
      'updated-desc': (a, b) => number(b.last_update) - number(a.last_update),
    };
    return products.sort(sorters[filters.sort] || sorters.name);
  }

  renderTable() {
    const products = this.filteredProducts();
    const pages = Math.max(1, Math.ceil(products.length / this.pageSize));
    this.store.state.filters.page = Math.min(this.store.state.filters.page, pages);
    const start = (this.store.state.filters.page - 1) * this.pageSize;
    const visible = products.slice(start, start + this.pageSize);
    this.elements.productResultCount.textContent = String(products.length);

    this.elements.productsTableBody.innerHTML = visible.length ? visible.map(product => {
      const missing = productMissing(product);
      const dirty = this.store.state.dirtyProducts.has(productKey(product));
      const image = productImage(product) || PLACEHOLDER;
      return `<tr${dirty ? ' class="dirty-row"' : ''}>
        <td><div class="product-cell"><img class="product-thumb" src="${escapeHtml(image)}" onerror="this.src='${PLACEHOLDER}'" alt=""><div><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(product.marca || product.categoria || 'Sem classificação')}${dirty ? ' · alteração pendente' : ''}</small></div></div></td>
        <td><div class="cell-stack"><strong>${escapeHtml(productCode(product) || '—')}</strong><span>${escapeHtml(product.gtin || product.ean || 'Sem EAN')}</span></div></td>
        <td><div class="cell-stack"><strong>${money(product.preco)}</strong><span>Custo ${money(product.preco_custo)}</span></div></td>
        <td><span class="badge ${number(product.estoque) > 5 ? 'success' : number(product.estoque) > 0 ? 'warning' : 'danger'}">${number(product.estoque)}</span></td>
        <td>${escapeHtml(formatDate(product.validade))}</td>
        <td><span class="badge ${isActive(product) ? 'success' : 'neutral'}">${isActive(product) ? 'Ativo' : 'Inativo'}</span></td>
        <td>${missing.length ? `<span class="badge warning">${missing.length} pendência${missing.length > 1 ? 's' : ''}</span>` : '<span class="badge success">Completo</span>'}</td>
        <td><button class="row-action" type="button" data-product-key="${escapeHtml(productKey(product))}">Editar</button></td>
      </tr>`;
    }).join('') : '<tr><td class="empty-state" colspan="8">Nenhum produto corresponde aos filtros.</td></tr>';

    this.elements.productsPagination.innerHTML = `<span class="pagination-info">Página ${this.store.state.filters.page} de ${pages}</span><div class="pagination-buttons"><button class="button secondary" data-page="${Math.max(1, this.store.state.filters.page - 1)}" ${this.store.state.filters.page <= 1 ? 'disabled' : ''}>Anterior</button><button class="button secondary" data-page="${Math.min(pages, this.store.state.filters.page + 1)}" ${this.store.state.filters.page >= pages ? 'disabled' : ''}>Próxima</button></div>`;
  }

  openEditor(key) {
    const product = this.store.getProduct(key);
    if (!product) return;
    this.store.state.selectedProductKey = key;
    this.editorTab = 'essential';
    this.renderEditor(product);
    this.elements.productEditor.classList.add('open');
    this.elements.productEditor.setAttribute('aria-hidden', 'false');
    this.elements.mobileOverlay.hidden = false;
  }

  closeEditor() {
    this.elements.productEditor.classList.remove('open');
    this.elements.productEditor.setAttribute('aria-hidden', 'true');
    this.elements.mobileOverlay.hidden = true;
    this.store.state.selectedProductKey = '';
  }

  renderEditorTabs() {
    this.elements.editorTabs.querySelectorAll('[data-editor-tab]').forEach(button => button.classList.toggle('active', button.dataset.editorTab === this.editorTab));
    this.elements.productForm.querySelectorAll('[data-editor-section]').forEach(section => section.classList.toggle('active', section.dataset.editorSection === this.editorTab));
  }

  renderEditor(product) {
    const key = productKey(product);
    this.elements.editorTitle.textContent = productName(product);
    this.elements.editorSubtitle.textContent = `${productCode(product) || key} · ${this.store.state.dirtyProducts.has(key) ? 'alteração pendente' : 'sem alteração local'}`;
    const sections = Object.fromEntries([...this.elements.productForm.querySelectorAll('[data-editor-section]')].map(section => [section.dataset.editorSection, section]));
    sections.essential.innerHTML = `<div class="form-grid">
      ${this.field('nome', 'Nome do produto', product.nome, 'text', true)}
      ${this.field('codigo', 'Código comercial', product.codigo)}
      ${this.field('gtin', 'EAN / GTIN', product.gtin || product.ean)}
      <label>Situação<select data-field="situacao"><option value="A" ${isActive(product) ? 'selected' : ''}>Ativo</option><option value="I" ${!isActive(product) ? 'selected' : ''}>Inativo</option></select></label>
    </div>`;
    sections.commercial.innerHTML = `<div class="form-grid">
      ${this.field('preco_custo', 'Preço de custo', product.preco_custo, 'number')}
      ${this.field('preco', 'Preço de venda', product.preco, 'number')}
      ${this.field('preco_oferta', 'Preço de oferta', product.preco_oferta, 'number')}
      ${this.field('estoque', 'Estoque', product.estoque, 'number')}
      ${this.field('validade', 'Validade', product.validade)}
      ${this.field('validade_oferta', 'Fim da oferta', text(product.validade_oferta).slice(0, 10), 'date')}
    </div>`;
    sections.classification.innerHTML = `<div class="form-grid">
      ${this.field('categoria', 'Categoria', product.categoria)}
      ${this.field('subcategoria', 'Subcategoria', product.subcategoria)}
      ${this.field('subsubcategoria', 'Subsubcategoria', product.subsubcategoria)}
      ${this.field('marca', 'Marca', product.marca)}
      ${this.field('fornecedor', 'Fornecedor', product.fornecedor)}
      ${this.field('tags', 'Tags', Array.isArray(product.tags) ? product.tags.join(', ') : product.tags, 'text', true)}
    </div>`;
    sections.content.innerHTML = `<img class="image-preview-editor" src="${escapeHtml(productImage(product) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt="Prévia do produto"><div class="form-grid">
      ${this.field('url_imagem', 'URL da imagem', productImage(product), 'url', true)}
      <label class="span-2">Descrição<textarea data-field="descricao">${escapeHtml(product.descricao || '')}</textarea></label>
      ${this.field('video_youtube', 'Vídeo do YouTube', product.video_youtube || product.video_url, 'url', true)}
    </div>`;
    sections.logistics.innerHTML = `<div class="form-grid">
      ${this.field('ncm', 'NCM', product.ncm)}
      ${this.field('embalagem', 'Embalagem', product.embalagem)}
      ${this.field('unidade', 'Unidade', product.unidade)}
      ${this.field('gondola', 'Gôndola', product.gondola)}
      ${this.field('prateleira', 'Prateleira', product.prateleira)}
      ${this.field('localizacao', 'Localização', product.localizacao)}
    </div>`;
    this.renderEditorTabs();
  }

  field(name, label, value = '', type = 'text', full = false) {
    return `<label${full ? ' class="span-2"' : ''}>${escapeHtml(label)}<input data-field="${escapeHtml(name)}" type="${escapeHtml(type)}" ${type === 'number' ? 'step="0.01"' : ''} value="${escapeHtml(value ?? '')}"></label>`;
  }

  handleEditorInput(event) {
    const field = event.target.dataset.field;
    const key = this.store.state.selectedProductKey;
    if (!field || !key) return;
    let value = event.target.value;
    if (['preco', 'preco_custo', 'preco_oferta', 'estoque'].includes(field)) value = number(value);
    if (field === 'tags') value = value.split(/[,;|]/).map(item => item.trim()).filter(Boolean);
    if (field === 'situacao') value = value === 'I' ? 'I' : 'A';
    this.store.updateProduct(key, { [field]: value });
    const product = this.store.getProduct(key);
    this.elements.editorTitle.textContent = productName(product);
    this.elements.editorSubtitle.textContent = `${productCode(product) || key} · alteração pendente`;
    this.renderDirty();
  }

  discardCurrent() {
    const key = this.store.state.selectedProductKey;
    if (!key) return;
    this.store.discardProduct(key);
    const product = this.store.getProduct(key);
    if (product) this.renderEditor(product);
    this.renderTable();
    this.renderDirty();
    this.onToast('Alterações deste produto foram descartadas.', 'success');
  }

  async saveCurrent() {
    const key = this.store.state.selectedProductKey;
    if (!key) return;
    const product = this.store.getProduct(key);
    if (!this.store.state.dirtyProducts.has(key)) {
      this.onToast('Este produto não possui alterações pendentes.', 'success');
      return;
    }
    await this.onSave(product);
    const updated = this.store.getProduct(key);
    if (updated) this.renderEditor(updated);
    this.renderTable();
  }

  createDraft() {
    this.onToast('A criação de novos produtos será ativada após a validação do salvamento seguro.', 'error');
  }

  renderDirty() {
    const count = this.store.state.dirtyProducts.size;
    this.elements.dirtyIndicator.textContent = count ? `${count} produto${count > 1 ? 's' : ''} com alterações` : 'Nenhuma alteração';
    this.elements.dirtyIndicator.classList.toggle('active', count > 0);
  }

  render() {
    this.populateFilters();
    this.renderTable();
    this.renderDirty();
  }
}
