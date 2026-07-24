import { validateProduct } from '../core/catalog.js';
import {
  debounce, escapeHtml, formatDate, isActive, money, normalizeSearch, number,
  productCode, productImage, productKey, productName, text,
} from '../core/utils.js';

const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="12">sem foto</text></svg>')}`;

function unique(values) {
  return [...new Set(values.map(value => text(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function maskBrDate(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
}

function brDateToIso(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir a imagem. Para imagens do Google, copie a imagem e use “Colar imagem”.'));
    image.src = source;
  });
}

export class ProductsModule {
  constructor({ store, elements, onSave, onToast, onMakeAction, onUploadImage }) {
    this.store = store;
    this.elements = elements;
    this.onSave = onSave;
    this.onToast = onToast;
    this.onMakeAction = onMakeAction;
    this.onUploadImage = onUploadImage;
    this.pageSize = store.state.config.pageSize || 50;
    this.editorTab = 'essential';
    this.pendingImages = new Map();
    this.imageZoom = new Map();
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
    this.elements.productForm.addEventListener('change', event => {
      if (event.target.matches('[data-product-image-file]')) this.handleImageFile(event.target.files?.[0]);
      else this.handleEditorInput(event);
    });
    this.elements.productForm.addEventListener('click', event => this.handleEditorClick(event));
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

  applyPreset({ query = '', category = '', status = '', quality = '', sort = 'name' } = {}) {
    Object.assign(this.store.state.filters, { query, category, status, quality, sort, page: 1 });
    this.elements.productSearch.value = query;
    this.elements.categoryFilter.value = category;
    this.elements.statusFilter.value = status;
    this.elements.qualityFilter.value = quality;
    this.elements.sortFilter.value = sort;
    this.elements.filterBar.hidden = false;
    this.renderTable();
  }

  populateFilters() {
    const current = this.elements.categoryFilter.value;
    const categories = unique(this.store.state.products.map(product => product.categoria));
    this.elements.categoryFilter.innerHTML = '<option value="">Todas</option>'
      + categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    this.elements.categoryFilter.value = categories.includes(current) ? current : '';
  }

  productValidation(product) {
    return validateProduct(product, this.store.state.config);
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
    if (filters.status === 'low-stock') products = products.filter(product => number(product.estoque) > 0 && number(product.estoque) <= 5);
    if (filters.quality) {
      products = products.filter(product => {
        const validation = this.productValidation(product);
        if (filters.quality === 'errors') return validation.errors.length > 0;
        if (filters.quality === 'warnings') return validation.warnings.length > 0;
        if (filters.quality === 'missing-image') return validation.warnings.includes('Imagem pública ausente') || validation.errors.includes('Imagem local/base64 não pode ser publicada');
        if (filters.quality === 'missing-ncm') return validation.warnings.includes('NCM ausente');
        if (filters.quality === 'missing-ean') return validation.warnings.includes('EAN ausente');
        if (filters.quality === 'incomplete') return validation.errors.length + validation.warnings.length > 0;
        return true;
      });
    }
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
      const validation = this.productValidation(product);
      const dirty = this.store.state.dirtyProducts.has(productKey(product));
      const image = productImage(product) || PLACEHOLDER;
      const qualityBadge = validation.errors.length
        ? `<span class="badge danger">${validation.errors.length} erro${validation.errors.length > 1 ? 's' : ''}</span>`
        : validation.warnings.length
          ? `<span class="badge warning">${validation.warnings.length} aviso${validation.warnings.length > 1 ? 's' : ''}</span>`
          : '<span class="badge success">Completo</span>';
      const stock = number(product.estoque);
      return `<tr${dirty ? ' class="dirty-row"' : ''}>
        <td><div class="product-cell"><img class="product-thumb" src="${escapeHtml(image)}" onerror="this.src='${PLACEHOLDER}'" alt=""><div><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(product.marca || product.categoria || 'Sem classificação')}${dirty ? ' · alteração pendente' : ''}</small></div></div></td>
        <td><div class="cell-stack"><strong>${escapeHtml(productCode(product) || '—')}</strong><span>${escapeHtml(product.gtin || product.ean || 'Sem EAN')}</span></div></td>
        <td><div class="cell-stack"><strong>${money(product.preco)}</strong><span>Custo ${money(product.preco_custo)}</span></div></td>
        <td><span class="badge ${stock >= 30 ? 'success' : stock > 0 ? 'warning' : 'danger'}">${stock}</span></td>
        <td>${escapeHtml(formatDate(product.validade))}</td>
        <td><span class="badge ${isActive(product) ? 'success' : 'neutral'}">${isActive(product) ? 'Ativo' : 'Inativo'}</span></td>
        <td>${qualityBadge}</td>
        <td><button class="row-action" type="button" data-product-key="${escapeHtml(productKey(product))}">Corrigir</button></td>
      </tr>`;
    }).join('') : '<tr><td class="empty-state" colspan="8">Nenhum produto corresponde aos filtros.</td></tr>';
    this.elements.productsPagination.innerHTML = `<span class="pagination-info">Página ${this.store.state.filters.page} de ${pages}</span><div class="pagination-buttons"><button class="button secondary" data-page="${Math.max(1, this.store.state.filters.page - 1)}" ${this.store.state.filters.page <= 1 ? 'disabled' : ''}>Anterior</button><button class="button secondary" data-page="${Math.min(pages, this.store.state.filters.page + 1)}" ${this.store.state.filters.page >= pages ? 'disabled' : ''}>Próxima</button></div>`;
  }

  openEditor(key) {
    const product = this.store.getProduct(key);
    if (!product) return;
    this.store.state.selectedProductKey = String(key);
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

  renderValidation(product) {
    const validation = this.productValidation(product);
    this.elements.editorValidation.innerHTML = validation.errors.length || validation.warnings.length
      ? `<div class="validation-box ${validation.errors.length ? 'danger' : 'warning'}"><div><strong>${validation.errors.length ? `${validation.errors.length} erro(s) impedem o salvamento` : 'Cadastro pode ser salvo, mas possui avisos'}</strong><small>${escapeHtml([...validation.errors, ...validation.warnings].join(' · '))}</small></div></div>`
      : '<div class="validation-box success"><div><strong>Produto pronto</strong><small>Nenhum erro ou aviso encontrado.</small></div></div>';
    this.elements.saveProductButton.disabled = validation.errors.length > 0 || !this.store.state.config.writeMode;
    this.elements.saveProductButton.title = validation.errors.length
      ? 'Corrija os erros antes de salvar.'
      : !this.store.state.config.writeMode ? 'Ative gravações somente durante testes controlados.' : '';
  }

  values(field, product, predicate = () => true) {
    return unique([product[field], ...this.store.state.products.filter(predicate).map(item => item[field])]);
  }

  selectField(name, label, value, values, full = false) {
    const options = unique([value, ...values]);
    return `<label${full ? ' class="span-2"' : ''}>${escapeHtml(label)}<select data-field="${escapeHtml(name)}"><option value="">Selecione…</option>${options.map(option => `<option value="${escapeHtml(option)}" ${text(value) === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>`;
  }

  field(name, label, value = '', type = 'text', full = false, attrs = '') {
    return `<label${full ? ' class="span-2"' : ''}>${escapeHtml(label)}<input data-field="${escapeHtml(name)}" type="${escapeHtml(type)}" ${type === 'number' ? 'step="0.01"' : ''} ${attrs} value="${escapeHtml(value ?? '')}"></label>`;
  }

  automationPanel(key) {
    const button = (action, label, kind = 'secondary') => `<button class="button ${kind} compact" type="button" data-make-product="${action}" data-key="${escapeHtml(key)}">${label}</button>`;
    return `<section class="make-automation-panel span-2"><div><strong>Automações do Make</strong><small>As respostas entram como alteração pendente para você revisar antes de salvar.</small></div><div class="make-automation-actions">${button('full', 'IA cadastro completo', 'primary')}${button('name', 'Melhorar nome')}${button('description', 'Gerar descrição')}${button('packaging', 'Gerar embalagem')}${button('tags', 'Gerar tags')}${button('chat', 'Perguntar à IA')}</div></section>`;
  }

  renderEditor(product) {
    const key = productKey(product);
    this.elements.editorTitle.textContent = productName(product);
    this.elements.editorSubtitle.textContent = `${productCode(product) || key} · ${this.store.state.dirtyProducts.has(key) ? 'alteração pendente' : 'sem alteração local'}`;
    const sections = Object.fromEntries([...this.elements.productForm.querySelectorAll('[data-editor-section]')].map(section => [section.dataset.editorSection, section]));
    sections.essential.innerHTML = `<div class="form-grid">${this.automationPanel(key)}
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
      ${this.field('validade', 'Validade (DD/MM/AAAA)', formatDate(product.validade) === '—' ? '' : formatDate(product.validade), 'text', false, 'inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-date-mask="1"')}
      ${this.field('validade_oferta', 'Fim da oferta', text(product.validade_oferta).slice(0, 10), 'date')}
    </div>`;
    const category = text(product.categoria);
    const subcategory = text(product.subcategoria);
    sections.classification.innerHTML = `<div class="form-grid">
      ${this.selectField('categoria', 'Categoria', category, this.values('categoria', product))}
      ${this.selectField('subcategoria', 'Subcategoria', subcategory, this.values('subcategoria', product, item => !category || text(item.categoria) === category))}
      ${this.selectField('subsubcategoria', 'Subsubcategoria', product.subsubcategoria, this.values('subsubcategoria', product, item => (!category || text(item.categoria) === category) && (!subcategory || text(item.subcategoria) === subcategory)))}
      ${this.selectField('marca', 'Marca', product.marca, this.values('marca', product))}
      ${this.selectField('fornecedor', 'Fornecedor', product.fornecedor, this.values('fornecedor', product))}
      ${this.field('tags', 'Tags', Array.isArray(product.tags) ? product.tags.join(', ') : product.tags, 'text', true)}
    </div>`;
    const pending = this.pendingImages.get(key);
    const preview = pending || productImage(product) || PLACEHOLDER;
    const zoom = this.imageZoom.get(key) || 100;
    sections.content.innerHTML = `<div class="image-workshop">
      <div class="image-workshop-preview"><img id="editorImagePreview" src="${escapeHtml(preview)}" style="transform:scale(${zoom / 100})" onerror="this.src='${PLACEHOLDER}'" alt="Prévia do produto"></div>
      <div class="image-workshop-controls"><div class="image-toolbar"><button class="button secondary compact" type="button" data-product-tool="google-image">Pesquisar no Google</button><button class="button secondary compact" type="button" data-product-tool="paste-image">Colar imagem</button><label class="button secondary compact file-button">Escolher arquivo<input type="file" accept="image/*" data-product-image-file hidden></label><button class="button primary compact" type="button" data-product-tool="upload-edited-image">Aplicar zoom e enviar</button></div><label class="zoom-control">Zoom <input type="range" min="70" max="220" step="5" value="${zoom}" data-product-image-zoom><span>${zoom}%</span></label><small>Imagens coladas ou escolhidas são centralizadas em fundo branco e enviadas ao GitHub. A gravação geral precisa estar habilitada.</small></div>
    </div><div class="form-grid">
      ${this.field('url_imagem', 'URL da imagem', productImage(product), 'url', true)}
      <div class="make-image-action span-2"><button class="button primary" type="button" data-make-product="image" data-key="${escapeHtml(key)}">IA: melhorar imagem pelo Make</button><small>Usa a imagem atual como referência e aplica apenas uma nova imagem principal.</small></div>
      <label class="span-2">Descrição<textarea data-field="descricao">${escapeHtml(product.descricao || '')}</textarea></label>
      ${this.field('video_youtube', 'Vídeo do YouTube', product.video_youtube || product.video_url, 'url', true)}
    </div>`;
    sections.logistics.innerHTML = `<div class="form-grid">
      ${this.field('ncm', 'NCM', product.ncm)}
      ${this.field('embalagem', 'Embalagem', product.embalagem)}
      ${this.field('unidade', 'Unidade', product.unidade)}
      ${this.selectField('gondola', 'Gôndola', product.gondola, this.values('gondola', product))}
      ${this.selectField('prateleira', 'Prateleira', product.prateleira, this.values('prateleira', product))}
      ${this.field('localizacao', 'Localização', product.localizacao)}
    </div>`;
    this.renderValidation(product);
    this.renderEditorTabs();
  }

  handleEditorInput(event) {
    const field = event.target.dataset.field;
    const key = this.store.state.selectedProductKey;
    if (!field || !key) {
      if (event.target.matches('[data-product-image-zoom]')) this.updateZoom(event.target);
      return;
    }
    let value = event.target.value;
    if (field === 'validade') {
      const masked = maskBrDate(value);
      event.target.value = masked;
      const iso = brDateToIso(masked);
      if (iso === null) {
        if (masked.replace(/\D/g, '').length === 8) this.onToast('Digite uma validade válida no formato DD/MM/AAAA.', 'error');
        return;
      }
      value = iso;
    }
    if (['preco', 'preco_custo', 'preco_oferta', 'estoque'].includes(field)) value = number(value);
    if (field === 'tags') value = value.split(/[,;|]/).map(item => item.trim()).filter(Boolean);
    if (field === 'situacao') value = value === 'I' ? 'I' : 'A';
    const product = this.store.getProduct(key);
    const patch = { [field]: value };
    if (field === 'categoria' && product && text(product.subcategoria) && !this.values('subcategoria', { ...product, categoria: value }, item => text(item.categoria) === value).includes(text(product.subcategoria))) {
      patch.subcategoria = '';
      patch.subsubcategoria = '';
    }
    if (field === 'subcategoria' && product && text(product.subsubcategoria) && !this.values('subsubcategoria', { ...product, subcategoria: value }, item => text(item.categoria) === text(product.categoria) && text(item.subcategoria) === value).includes(text(product.subsubcategoria))) patch.subsubcategoria = '';
    this.store.updateProduct(key, patch);
    const updated = this.store.getProduct(key);
    this.elements.editorTitle.textContent = productName(updated);
    this.elements.editorSubtitle.textContent = `${productCode(updated) || key} · alteração pendente`;
    this.renderValidation(updated);
    this.renderDirty();
    if (['categoria', 'subcategoria'].includes(field)) this.renderEditor(updated);
  }

  async handleEditorClick(event) {
    const makeButton = event.target.closest('[data-make-product]');
    if (makeButton) {
      event.preventDefault();
      await this.onMakeAction?.(makeButton.dataset.makeProduct, makeButton.dataset.key);
      return;
    }
    const tool = event.target.closest('[data-product-tool]');
    if (!tool) return;
    event.preventDefault();
    const action = tool.dataset.productTool;
    if (action === 'google-image') this.searchGoogleImage();
    if (action === 'paste-image') await this.pasteClipboardImage();
    if (action === 'upload-edited-image') await this.uploadEditedImage();
  }

  updateZoom(input) {
    const key = this.store.state.selectedProductKey;
    const zoom = Math.max(70, Math.min(220, Number(input.value) || 100));
    this.imageZoom.set(key, zoom);
    const preview = document.getElementById('editorImagePreview');
    if (preview) preview.style.transform = `scale(${zoom / 100})`;
    const label = input.parentElement?.querySelector('span');
    if (label) label.textContent = `${zoom}%`;
  }

  searchGoogleImage() {
    const product = this.store.getProduct(this.store.state.selectedProductKey);
    if (!product) return;
    const query = [productName(product), product.marca, product.embalagem].filter(Boolean).join(' ');
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  }

  async handleImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return this.onToast('Selecione um arquivo de imagem.', 'error');
    const key = this.store.state.selectedProductKey;
    this.pendingImages.set(key, await fileToDataUrl(file));
    this.imageZoom.set(key, 100);
    const product = this.store.getProduct(key);
    if (product) this.renderEditor(product);
    this.editorTab = 'content';
    this.renderEditorTabs();
    this.onToast('Imagem carregada. Ajuste o zoom e envie ao GitHub.', 'success');
  }

  async pasteClipboardImage() {
    if (!navigator.clipboard?.read) throw new Error('Este navegador não permite ler imagens da área de transferência. Use “Escolher arquivo”.');
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(candidate => candidate.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      await this.handleImageFile(new File([blob], `imagem-colada.${type.split('/')[1] || 'png'}`, { type }));
      return;
    }
    throw new Error('Nenhuma imagem foi encontrada na área de transferência. No Google Imagens, copie a própria imagem e tente novamente.');
  }

  async uploadEditedImage() {
    const key = this.store.state.selectedProductKey;
    const product = this.store.getProduct(key);
    if (!product) return;
    const source = this.pendingImages.get(key) || productImage(product);
    if (!source) throw new Error('Escolha ou cole uma imagem primeiro.');
    const image = await loadImage(source);
    const zoom = (this.imageZoom.get(key) || 100) / 100;
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 800, 800);
    const contain = Math.min(680 / image.naturalWidth, 680 / image.naturalHeight) * zoom;
    const width = image.naturalWidth * contain;
    const height = image.naturalHeight * contain;
    context.drawImage(image, (800 - width) / 2, (800 - height) / 2, width, height);
    const dataUrl = canvas.toDataURL('image/webp', 0.88);
    const uploaded = await this.onUploadImage?.(product, dataUrl);
    if (!uploaded?.url) throw new Error('A imagem não foi enviada ao GitHub.');
    this.store.updateProduct(key, {
      url_imagem: uploaded.url,
      imagem: uploaded.url,
      imagem_url: uploaded.url,
      imagens: [uploaded.url],
      imagem_path: uploaded.path,
      imagem_storage: 'github',
      imagem_origem: 'editor_v2',
      imagem_editada_em: new Date().toISOString(),
    });
    this.pendingImages.delete(key);
    this.imageZoom.set(key, 100);
    this.refreshAfterExternalChange(key);
    this.onToast('Imagem editada e enviada ao GitHub. Revise e salve o produto.', 'success');
  }

  discardCurrent() {
    const key = this.store.state.selectedProductKey;
    if (!key) return;
    this.store.discardProduct(key);
    this.pendingImages.delete(key);
    this.imageZoom.delete(key);
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
    const validation = this.productValidation(product);
    if (validation.errors.length) return this.onToast(`Corrija: ${validation.errors.join(', ')}.`, 'error');
    if (!this.store.state.dirtyProducts.has(key)) return this.onToast('Este produto não possui alterações pendentes.', 'success');
    await this.onSave(product);
    const updated = this.store.getProduct(key);
    if (updated) this.renderEditor(updated);
    this.renderTable();
  }

  createDraft() {
    this.onToast('A criação de novos produtos será ativada após os testes de publicação completa.', 'error');
  }

  refreshAfterExternalChange(key) {
    const product = this.store.getProduct(key);
    if (product && this.store.state.selectedProductKey === String(key)) this.renderEditor(product);
    this.renderTable();
    this.renderDirty();
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
