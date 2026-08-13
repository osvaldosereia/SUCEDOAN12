(() => {
  'use strict';

  const fieldSizes = {
    short: new Set([
      'estoque', 'estoque_minimo', 'multiplo_venda', 'quantidade_caixa', 'ordem',
      'gondola', 'prateleira', 'unidade', 'cfop', 'peso', 'largura', 'altura',
      'comprimento', 'cest', 'ncm', 'situacao', 'destaque',
    ]),
    medium: new Set([
      'codigo', 'gtin', 'ean', 'gtin_tributavel', 'validade', 'validade_oferta',
      'preco', 'preco_custo', 'preco_oferta', 'preco_atacado', 'embalagem',
      'marca', 'fornecedor', 'origem_tributaria', 'bling_id',
    ]),
    long: new Set([
      'nome', 'categoria', 'subcategoria', 'subsubcategoria', 'localizacao',
      'codigo_fornecedor', 'slug', 'seo_titulo', 'descricao_status',
      'seo_status', 'tag_global',
    ]),
    wide: new Set([
      'tags', 'url_imagem', 'imagem', 'imagem_url', 'video_youtube',
      'video_url', 'descricao', 'descricao_curta', 'seo_descricao',
    ]),
  };

  const textSizes = [
    [/estoque|ordem|multiplo|quantidade|gondola|prateleira|ncm|cest|cfop|peso|largura|altura|comprimento|unidade|situacao/i, 'ux-short'],
    [/codigo|ean|gtin|validade|preco|custo|oferta|embalagem|marca|fornecedor|bling/i, 'ux-medium'],
    [/nome|categoria|subcategoria|localizacao|slug|titulo/i, 'ux-long'],
    [/descricao|tags|url|video|observacao/i, 'ux-wide'],
  ];

  const productSectionTitles = {
    essential: ['Identificacao', 'Nome, codigo comercial, EAN e status principal do produto.'],
    commercial: ['Preco e estoque', 'Valores, oferta, quantidade disponivel e validade.'],
    classification: ['Classificacao comercial', 'Categoria, subcategorias, marca, fornecedor e tags.'],
    content: ['Imagem e conteudo', 'Foto principal, descricao, video e informacoes de exibicao.'],
    logistics: ['Fiscal e logistica', 'NCM, embalagem, unidade, localizacao e dados de separacao.'],
    baskets: ['Cestas básicas', 'Marque as cestas em que este produto deve aparecer.'],
  };

  const makeActionsToHide = new Set(['name', 'description', 'packaging', 'tags']);
  let selectedProductContext = null;
  let refreshTimer = null;

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function applyUxIdentity() {
    document.title = 'Dona Antonia - Admin oficial';

    const brandTitle = document.querySelector('.brand strong');
    const brandLabel = document.querySelector('.brand span');
    if (brandTitle) brandTitle.textContent = 'Dona Antonia';
    if (brandLabel) brandLabel.textContent = 'Admin oficial';

    const banner = document.querySelector('.environment-banner');
    if (banner) {
      banner.innerHTML = '<strong>Sistema oficial em uso.</strong> Interface desktop reorganizada para cadastro, ofertas automaticas e operacao do catalogo.';
    }
  }

  function setupTopNavigation() {
    document.querySelectorAll('[data-route="quick-purchase"]').forEach(button => button.remove());
    document.querySelectorAll('[data-view="quick-purchase"]').forEach(section => section.remove());

    document.querySelectorAll('#mainNav .nav-group').forEach(group => {
      const label = group.querySelector('.nav-group-label');
      if (label && /estoque/i.test(label.textContent || '') && group.querySelector('[data-route="products"]')) {
        label.textContent = 'Catalogo';
      }

      if (label && !label.dataset.uxMenuReady) {
        label.dataset.uxMenuReady = 'true';
        label.setAttribute('role', 'button');
        label.setAttribute('tabindex', '0');
        label.setAttribute('aria-haspopup', 'true');
        label.setAttribute('aria-expanded', 'false');
      }

      let menu = group.querySelector(':scope > .ux-nav-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.className = 'ux-nav-menu';
        group.querySelectorAll(':scope > .nav-item').forEach(item => menu.appendChild(item));
        group.appendChild(menu);
      }

      const hasActive = !!group.querySelector('.nav-item.active');
      const isOpen = group.classList.contains('ux-open');
      group.classList.toggle('has-active', hasActive);
      label?.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) positionDropdown(group);
    });
  }

  function positionDropdown(group) {
    const label = group?.querySelector(':scope > .nav-group-label');
    const menu = group?.querySelector(':scope > .ux-nav-menu');
    if (!label || !menu) return;

    const labelRect = label.getBoundingClientRect();
    const menuWidth = Math.min(Math.max(menu.scrollWidth || 260, 260), 340);
    const left = Math.max(16, Math.min(labelRect.left, window.innerWidth - menuWidth - 16));
    const top = Math.max(10, labelRect.bottom + 8);

    menu.style.setProperty('--ux-menu-left', `${Math.round(left)}px`);
    menu.style.setProperty('--ux-menu-top', `${Math.round(top)}px`);
    menu.style.setProperty('--ux-menu-width', `${Math.round(menuWidth)}px`);
  }

  function positionOpenDropdowns() {
    document.querySelectorAll('#mainNav .nav-group.ux-open').forEach(positionDropdown);
  }

  function closestText(label) {
    return Array.from(label.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || '')
      .join(' ')
      .trim();
  }

  function fieldNameFor(label) {
    const control = label.querySelector('input,select,textarea');
    return String(control?.dataset?.field || control?.dataset?.nfeDraftField || control?.dataset?.collectionField || control?.id || '').trim();
  }

  function classForField(label) {
    const name = fieldNameFor(label);
    if (fieldSizes.wide.has(name)) return 'ux-wide';
    if (fieldSizes.long.has(name)) return 'ux-long';
    if (fieldSizes.medium.has(name)) return 'ux-medium';
    if (fieldSizes.short.has(name)) return 'ux-short';

    const labelText = closestText(label);
    return textSizes.find(([pattern]) => pattern.test(labelText))?.[1] || '';
  }

  function classifyFields(root = document) {
    root.querySelectorAll('.form-grid label, .nfe-new-grid label, .suite-form label, #collectionForm label').forEach(label => {
      label.classList.remove('ux-short', 'ux-medium', 'ux-long', 'ux-wide');
      const className = classForField(label);
      if (className) label.classList.add(className);
    });
  }

  function sectionHeading(title, help) {
    const header = document.createElement('div');
    header.className = 'ux-editor-section-head';
    header.innerHTML = `<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(help)}</span></div>`;
    return header;
  }

  function captureProductContext(event) {
    const row = event.target.closest?.('tr');
    if (!row) return;
    const image = row.querySelector('.product-thumb')?.getAttribute('src') || '';
    const name = row.querySelector('.product-cell strong')?.textContent?.trim() || '';
    const meta = row.querySelector('.product-cell small')?.textContent?.trim() || '';
    const code = row.querySelector('.cell-stack strong')?.textContent?.trim() || '';
    const ean = row.querySelector('.cell-stack span')?.textContent?.trim() || '';
    if (!name && !image) return;
    selectedProductContext = { image, name, meta, code, ean };
  }

  function injectProductContext() {
    const section = document.querySelector('[data-editor-section="essential"]');
    const editor = document.getElementById('productEditor');
    if (!section || !editor?.classList.contains('open')) return;
    if (section.querySelector('.ux-product-context')) return;

    const title = document.getElementById('editorTitle')?.textContent?.trim() || selectedProductContext?.name || 'Produto';
    const subtitle = document.getElementById('editorSubtitle')?.textContent?.trim() || '';
    const image = selectedProductContext?.image || '';
    const detail = [selectedProductContext?.meta, selectedProductContext?.code, selectedProductContext?.ean]
      .filter(Boolean)
      .join(' | ');

    const card = document.createElement('div');
    card.className = 'ux-product-context';
    card.innerHTML = `
      <img src="${escapeHtml(image)}" alt="">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail || subtitle)}</span>
        <span>${escapeHtml(subtitle)}</span>
      </div>
    `;
    section.prepend(card);
  }

  function removeProductMakeButtons(root = document) {
    root.querySelectorAll('[data-make-product]').forEach(button => {
      if (makeActionsToHide.has(button.dataset.makeProduct)) button.remove();
    });
  }

  function organizeProductEditor() {
    const editor = document.getElementById('productEditor');
    const form = document.getElementById('productForm');
    if (!editor || !form) return;

    editor.classList.add('ux-single-editor');
    document.getElementById('editorTabs')?.setAttribute('aria-hidden', 'true');

    if (!editor.querySelector(':scope > .ux-product-main-tabs')) {
      const tabs = document.createElement('div');
      tabs.className = 'ux-product-main-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'Áreas do cadastro do produto');
      tabs.innerHTML = '<button class="active" type="button" role="tab" data-ux-product-mode="details">Informações do produto</button><button type="button" role="tab" data-ux-product-mode="baskets">Cestas básicas</button>';
      editor.insertBefore(tabs, editor.querySelector('.editor-validation'));
    }

    const mode = editor.dataset.uxProductMode === 'baskets' ? 'baskets' : 'details';
    editor.classList.toggle('ux-product-mode-details', mode === 'details');
    editor.classList.toggle('ux-product-mode-baskets', mode === 'baskets');
    editor.querySelectorAll('[data-ux-product-mode]').forEach(button => {
      const active = button.dataset.uxProductMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });

    form.querySelectorAll('[data-editor-section]').forEach(section => {
      const meta = productSectionTitles[section.dataset.editorSection] || ['Secao', ''];
      section.classList.add('active', 'ux-editor-block');
      const current = section.querySelector(':scope > .ux-editor-section-head');
      if (current?.querySelector('strong')?.textContent === meta[0]) return;
      section.querySelectorAll(':scope > .ux-editor-section-head').forEach(header => header.remove());
      section.prepend(sectionHeading(meta[0], meta[1]));
    });

    removeProductMakeButtons(editor);
  }

  function collectionImagePlaceholder() {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="52%" text-anchor="middle" fill="#7f877f" font-family="Arial" font-size="18">sem imagem</text></svg>')}`;
  }

  function productImageFrom(product = {}) {
    return product.url_imagem || product.imagem || product.imagem_url || product.image || product.foto || collectionImagePlaceholder();
  }

  function enhanceCollectionEditor() {
    const editor = document.getElementById('collectionEditor');
    const body = editor?.querySelector('.collection-editor-body');
    const form = document.getElementById('collectionForm');
    if (!editor || !body || !form) return;

    editor.classList.add('ux-single-collection');
    body.querySelectorAll('.collection-flow-tabs').forEach(tabs => {
      tabs.hidden = true;
      tabs.setAttribute('aria-hidden', 'true');
    });

    if (!body.querySelector('.ux-collection-form-head')) {
      const title = document.getElementById('collectionEditorType')?.textContent?.trim() || 'Cadastro';
      const header = document.createElement('div');
      header.className = 'ux-editor-section-head ux-collection-form-head';
      header.innerHTML = `<div><strong>Dados principais</strong><span>${escapeHtml(title)}, codigo, preco, periodo, status e imagem.</span></div>`;
      body.insertBefore(header, form);
    }

    const imageInput = form.querySelector('[data-collection-field="imagem"]');
    if (imageInput && !form.querySelector('.ux-collection-cover')) {
      const cover = document.createElement('section');
      cover.className = 'ux-collection-cover';
      cover.innerHTML = `
        <img src="${escapeHtml(imageInput.value || collectionImagePlaceholder())}" alt="">
        <div>
          <strong>Imagem da oferta</strong>
          <span>Previa media para conferir capa antes de salvar.</span>
        </div>
      `;
      form.prepend(cover);
    }

    const coverImage = form.querySelector('.ux-collection-cover img');
    if (coverImage && imageInput) coverImage.src = imageInput.value || collectionImagePlaceholder();

    const composition = editor.querySelector('.collection-composition');
    const compositionHead = editor.querySelector('.collection-section-head');
    const searchBox = editor.querySelector('.collection-product-search');
    if (compositionHead) {
      compositionHead.classList.add('ux-editor-section-head');
      const title = compositionHead.querySelector('h3');
      const help = compositionHead.querySelector('p');
      if (title) title.textContent = 'Composicao';
      if (help) help.textContent = 'Itens, quantidades, substitutos, estoque e troca de produto em uma unica pagina.';
    }

    if (searchBox && composition && searchBox.parentElement !== composition) {
      searchBox.classList.remove('ux-collection-search-compact', 'ux-header-search', 'collection-search-top');
      composition.appendChild(searchBox);
    }
    if (searchBox) searchBox.classList.remove('ux-collection-search-compact', 'ux-header-search', 'collection-search-top');

    const audit = document.getElementById('collectionAudit');
    if (audit && !audit.querySelector('.ux-editor-section-head')) {
      audit.prepend(sectionHeading('Auditoria', 'Erros, avisos e liberacao para publicar.'));
    }

    editor.querySelectorAll('.collection-item[data-collection-item]').forEach(row => {
      if (row.querySelector('.ux-collection-item-image')) return;
      const image = document.createElement('img');
      image.className = 'ux-collection-item-image';
      image.src = productImageFrom();
      image.alt = '';
      row.prepend(image);
    });
  }

  function refreshUx() {
    applyUxIdentity();
    setupTopNavigation();
    classifyFields();
    injectProductContext();
    organizeProductEditor();
    enhanceCollectionEditor();
  }

  function scheduleRefresh(delay = 80) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshUx();
      setTimeout(refreshUx, 420);
    }, delay);
  }

  document.addEventListener('click', captureProductContext, true);
  document.addEventListener('click', event => {
    const productMode = event.target.closest?.('[data-ux-product-mode]');
    if (productMode) {
      const editor = productMode.closest('#productEditor');
      if (editor) editor.dataset.uxProductMode = productMode.dataset.uxProductMode;
    }
    const label = event.target.closest?.('#mainNav .nav-group-label');
    document.querySelectorAll('#mainNav .nav-group.ux-open').forEach(group => {
      if (!label || group !== label.closest('.nav-group')) group.classList.remove('ux-open');
    });
    if (label) {
      const group = label.closest('.nav-group');
      group.classList.toggle('ux-open');
      positionDropdown(group);
      label.setAttribute('aria-expanded', String(group.classList.contains('ux-open')));
    }
    scheduleRefresh(120);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('#mainNav .nav-group.ux-open').forEach(group => group.classList.remove('ux-open'));
    document.querySelectorAll('#mainNav .nav-group-label').forEach(label => label.setAttribute('aria-expanded', 'false'));
  }, true);
  document.addEventListener('input', () => scheduleRefresh(200), true);
  document.addEventListener('change', () => scheduleRefresh(200), true);
  window.addEventListener('admin-v2-route-ready', () => scheduleRefresh(60));
  window.addEventListener('admin-v2-open-product', () => scheduleRefresh(20));
  window.addEventListener('hashchange', () => scheduleRefresh(120));
  window.addEventListener('resize', positionOpenDropdowns);
  window.addEventListener('scroll', positionOpenDropdowns, true);
  scheduleRefresh(0);
})();
