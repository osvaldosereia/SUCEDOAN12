import {
  auditCollection, auditCollections, collectionSearch, normalizeCollectionForPublish, resolveCollectionItem,
} from '../core/collections.js';
import { clone, debounce, escapeHtml, money, number, productCode, productKey, productName, text } from '../core/utils.js';
import { saveCollectionList } from '../services/collections.js';
import { upsertBase64File } from '../services/github-binary.js';
import { callMake, compactKitForMake, extractMakeImage, unwrapMakeResult } from '../services/make.js';

const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="12">sem imagem</text></svg>')}`;
const LOW_STOCK_LIMIT = 30;

function activeLabel(audit) {
  if (audit.errors.length) return ['danger', 'Bloqueada'];
  if (audit.active) return ['success', 'Ativa'];
  return ['neutral', audit.periodStatus === 'encerrado' ? 'Encerrada' : 'Inativa'];
}

function queueLabel(entry) {
  if (!entry) return ['neutral', 'Sem carrossel'];
  const status = text(entry.fila_status || entry.status || 'registrado');
  const kind = status === 'postado' ? 'success' : ['erro', 'falhou'].includes(status) ? 'danger' : 'warning';
  return [kind, status];
}

function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'kit';
}

function productMatchesCode(product, code) {
  const wanted = text(code);
  return [productKey(product), productCode(product), product?.gtin, product?.ean, product?.sku].map(text).includes(wanted);
}

export class CollectionsModule {
  constructor({ store, elements, onToast, onReload, reloadConfig }) {
    this.store = store;
    this.elements = elements;
    this.onToast = onToast;
    this.onReload = onReload;
    this.reloadConfig = reloadConfig;
    this.type = 'basket';
    this.draft = null;
    this.originalId = '';
    this.replaceTarget = null;
    this.makeBusy = false;
    this.searchTimer = debounce(() => this.renderSearchResults(), 160);
    this.bind();
    this.render();
  }

  bind() {
    this.elements.collectionTabs.addEventListener('click', event => {
      const button = event.target.closest('[data-collection-type]');
      if (!button) return;
      this.type = button.dataset.collectionType;
      this.replaceTarget = null;
      this.elements.collectionTabs.querySelectorAll('[data-collection-type]').forEach(tab => tab.classList.toggle('active', tab === button));
      this.render();
    });
    this.elements.collectionCreate.addEventListener('click', () => this.openEditor(null));
    this.elements.collectionCards.addEventListener('click', event => {
      const edit = event.target.closest('[data-collection-edit]');
      const remove = event.target.closest('[data-collection-delete]');
      if (edit) this.openEditor(edit.dataset.collectionEdit);
      if (remove) this.deleteCollection(remove.dataset.collectionDelete);
    });
    this.elements.collectionClose.addEventListener('click', () => this.closeEditor());
    this.elements.collectionCancel.addEventListener('click', () => this.closeEditor());
    this.elements.collectionSave.addEventListener('click', () => this.saveDraft());
    this.elements.collectionForm.addEventListener('input', event => this.handleField(event));
    this.elements.collectionForm.addEventListener('change', event => this.handleField(event));
    this.elements.collectionForm.addEventListener('click', event => {
      const button = event.target.closest('[data-collection-make]');
      if (button) this.runKitAutomation(button.dataset.collectionMake).catch(error => this.onToast(error?.message || String(error), 'error'));
    });
    this.elements.collectionItems.addEventListener('input', event => this.handleItemInput(event));
    this.elements.collectionItems.addEventListener('click', event => this.handleItemClick(event));
    this.elements.collectionProductSearch.addEventListener('input', () => this.searchTimer());
    this.elements.collectionSearchResults.addEventListener('click', event => {
      const button = event.target.closest('[data-collection-add-product]');
      if (button) this.addProduct(button.dataset.collectionAddProduct);
    });
  }

  currentList() {
    return this.type === 'kit' ? this.store.state.kits : this.store.state.baskets;
  }

  setCurrentList(list) {
    if (this.type === 'kit') this.store.state.kits = list;
    else this.store.state.baskets = list;
  }

  audits() {
    return auditCollections(this.store.state.baskets, this.store.state.kits, this.store.state.products, this.store.state.queue);
  }

  render() {
    const audit = this.audits();
    const rows = this.type === 'kit' ? audit.kits : audit.baskets;
    this.elements.collectionSummary.innerHTML = [
      ['info', rows.length, this.type === 'kit' ? 'Kits' : 'Cestas', 'Total cadastrado'],
      ['success', rows.filter(row => row.active).length, 'Ativos', 'Disponíveis no catálogo'],
      ['danger', rows.filter(row => row.errors.length).length, 'Com erros', 'Bloqueiam publicação'],
      ['warning', rows.filter(row => row.warnings.length).length, 'Com avisos', 'Revisar qualidade'],
    ].map(([kind, value, label, help]) => `<article class="metric-card ${kind}"><strong>${value}</strong><span>${label}</span><small>${help}</small></article>`).join('');
    this.elements.collectionCreate.textContent = this.type === 'kit' ? 'Novo kit' : 'Nova cesta';
    this.elements.collectionCards.innerHTML = rows.length ? rows.map(row => this.card(row)).join('') : '<div class="empty-state collection-empty">Nenhum cadastro encontrado.</div>';
  }

  card(audit) {
    const source = audit.source;
    const [kind, label] = activeLabel(audit);
    const [queueKind, queueStatus] = queueLabel(audit.queueEntry || (source.instagram_status ? { status: source.instagram_status } : null));
    const image = text(source.imagem) || PLACEHOLDER;
    return `<article class="collection-card">
      <img src="${escapeHtml(image)}" onerror="this.src='${PLACEHOLDER}'" alt="">
      <div class="collection-card-body"><div class="collection-card-title"><div><span class="eyebrow">${this.type === 'kit' ? 'Kit promocional' : 'Cesta básica'}</span><h3>${escapeHtml(source.nome || 'Sem nome')}</h3><small>${escapeHtml(source.codigo || source.id || 'sem código')}</small></div><span class="badge ${kind}">${escapeHtml(label)}</span></div>
      <div class="collection-card-metrics"><span><strong>${money(source.preco)}</strong>Preço definido</span><span><strong>${audit.items.length}</strong>Itens</span><span><strong>${audit.available}</strong>Disponíveis</span><span><strong>${money(audit.regularTotal)}</strong>Compra avulsa</span></div>
      ${this.type === 'kit' ? `<div class="collection-kit-row"><span>Economia <strong>${money(audit.economy)} · ${audit.discount}%</strong></span><span class="badge ${queueKind}">Instagram: ${escapeHtml(queueStatus)}</span></div>` : '<p class="collection-price-note">O valor da cesta permanece predefinido; a soma dos itens aparece apenas para conferência.</p>'}
      ${audit.errors.length ? `<div class="collection-errors">${audit.errors.slice(0, 3).map(error => `<div>${escapeHtml(error)}</div>`).join('')}</div>` : ''}
      <div class="collection-card-actions"><button class="button secondary" type="button" data-collection-edit="${escapeHtml(source.id)}">Editar</button><button class="button ghost" type="button" data-collection-delete="${escapeHtml(source.id)}">Excluir</button></div></div>
    </article>`;
  }

  openEditor(id) {
    const existing = id ? this.currentList().find(collection => text(collection.id) === String(id)) : null;
    this.originalId = existing ? text(existing.id) : '';
    this.replaceTarget = null;
    this.draft = existing ? clone(existing) : {
      id: `${this.type === 'kit' ? 'kit' : 'cesta'}${Date.now()}`,
      nome: '', codigo: '', preco: 0, imagem: '', produtos: [], descricao: '', ativo: true,
      ...(this.type === 'kit' ? { data_inicio: '', data_fim: '', limite_kits: 0 } : {}),
    };
    this.elements.collectionEditorType.textContent = this.type === 'kit' ? 'Kit promocional' : 'Cesta básica';
    this.elements.collectionEditorTitle.textContent = existing ? this.draft.nome : (this.type === 'kit' ? 'Novo kit' : 'Nova cesta');
    this.elements.collectionForm.innerHTML = this.formHtml();
    this.elements.collectionProductSearch.value = '';
    this.elements.collectionSearchResults.innerHTML = '';
    this.elements.collectionEditor.classList.add('open');
    this.elements.collectionEditor.setAttribute('aria-hidden', 'false');
    this.elements.collectionBackdrop.hidden = false;
    this.renderItems();
    this.renderAudit();
  }

  makeTools() {
    if (this.type !== 'kit') return '';
    const status = text(this.draft.instagram_status || this.draft.fila_status || 'ainda não enviado');
    return `<section class="collection-make-tools span-2"><div><strong>Automações do Make</strong><small>As alterações de texto e capa ficam para revisão. A fila do Instagram é criada pelo cenário.</small></div><div><button class="button secondary compact" type="button" data-collection-make="description" ${this.makeBusy ? 'disabled' : ''}>IA descrição</button><button class="button secondary compact" type="button" data-collection-make="cover" ${this.makeBusy ? 'disabled' : ''}>IA capa do kit</button><button class="button primary compact" type="button" data-collection-make="instagram" ${this.makeBusy ? 'disabled' : ''}>Gerar fila Instagram</button></div><span class="badge ${status === 'ainda não enviado' ? 'neutral' : 'warning'}">Fila: ${escapeHtml(status)}</span></section>`;
  }

  formHtml() {
    const draft = this.draft;
    return `<div class="form-grid">${this.makeTools()}
      <label>Nome<input data-collection-field="nome" value="${escapeHtml(draft.nome || '')}"></label>
      <label>Código<input data-collection-field="codigo" value="${escapeHtml(draft.codigo || '')}"></label>
      <label>Preço predefinido<input type="number" min="0" step="0.01" data-collection-field="preco" value="${escapeHtml(draft.preco || 0)}"></label>
      <label>ID<input data-collection-field="id" value="${escapeHtml(draft.id || '')}"></label>
      <label class="span-2">URL/caminho da imagem<input data-collection-field="imagem" value="${escapeHtml(draft.imagem || '')}"></label>
      ${this.type === 'kit' ? `<label>Início<input type="date" data-collection-field="data_inicio" value="${escapeHtml(draft.data_inicio || '')}"></label><label>Fim<input type="date" data-collection-field="data_fim" value="${escapeHtml(draft.data_fim || '')}"></label><label>Limite de kits<input type="number" min="0" step="1" data-collection-field="limite_kits" value="${escapeHtml(draft.limite_kits || 0)}"></label><label class="switch-row"><span><strong>Kit ativo</strong><small>Período e estoque também são validados.</small></span><input type="checkbox" data-collection-field="ativo" ${draft.ativo !== false ? 'checked' : ''}></label>` : ''}
      <label class="span-2">Descrição<textarea data-collection-field="descricao">${escapeHtml(draft.descricao || '')}</textarea></label>
    </div>`;
  }

  closeEditor() {
    this.draft = null;
    this.originalId = '';
    this.replaceTarget = null;
    this.elements.collectionEditor.classList.remove('open');
    this.elements.collectionEditor.setAttribute('aria-hidden', 'true');
    this.elements.collectionBackdrop.hidden = true;
  }

  handleField(event) {
    const field = event.target.dataset.collectionField;
    if (!field || !this.draft) return;
    let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    if (['preco', 'limite_kits'].includes(field)) value = number(value);
    this.draft[field] = value;
    if (field === 'nome' && !text(this.draft.codigo)) this.draft.codigo = slug(value);
    this.elements.collectionEditorTitle.textContent = this.draft.nome || (this.type === 'kit' ? 'Novo kit' : 'Nova cesta');
    this.renderAudit();
  }

  findProduct(code) {
    return this.store.state.products.find(product => productMatchesCode(product, code)) || null;
  }

  substituteBadges(item) {
    return (Array.isArray(item.substitutos) ? item.substitutos : []).map((code, slot) => {
      const product = this.findProduct(code);
      const stock = number(product?.estoque);
      return `<span class="badge ${product && stock > 0 ? stock < LOW_STOCK_LIMIT ? 'warning' : 'success' : 'danger'}">Subst. ${slot + 1}: ${escapeHtml(product ? productName(product) : code)} · ${stock}</span>`;
    }).join('');
  }

  renderItems() {
    const items = Array.isArray(this.draft?.produtos) ? this.draft.produtos : [];
    this.elements.collectionItems.innerHTML = items.length ? items.map((item, index) => {
      const main = this.findProduct(item.codigo);
      const resolved = resolveCollectionItem(item, this.store.state.products);
      const active = resolved.product || main;
      const stock = number(active?.estoque);
      const lowStock = !active || stock < LOW_STOCK_LIMIT;
      const activeText = resolved.usedSubstitute ? `Usando substituto: ${productName(active)}` : 'Produto principal ativo';
      return `<div class="collection-item ${lowStock ? 'low-stock' : ''}" data-collection-item="${index}">
        <div class="collection-item-product"><span>Produto da composição</span><strong>${escapeHtml(main ? productName(main) : item.codigo || 'Não encontrado')}</strong><small>${escapeHtml(item.codigo || 'sem código')} · ${escapeHtml(activeText)}</small><div class="collection-item-badges"><span class="badge ${stock >= LOW_STOCK_LIMIT ? 'success' : stock > 0 ? 'warning' : 'danger'}">Estoque ativo: ${stock}</span>${this.substituteBadges(item)}</div></div>
        <label>Qtd.<input type="number" min="1" step="1" value="${escapeHtml(item.qtd || 1)}" data-collection-item-qty="${index}"></label>
        <div class="collection-item-actions"><button class="button secondary compact" type="button" data-collection-open-product="${index}" ${active ? '' : 'disabled'}>Abrir produto</button><button class="button secondary compact" type="button" data-collection-replace-main="${index}">Trocar principal</button><button class="button secondary compact" type="button" data-collection-set-substitute="${index}" data-slot="0">Subst. 1</button><button class="button secondary compact" type="button" data-collection-set-substitute="${index}" data-slot="1">Subst. 2</button><button class="button ghost compact" type="button" data-collection-clear-substitute="${index}" data-slot="0" ${(item.substitutos || [])[0] ? '' : 'disabled'}>Limpar 1</button><button class="button ghost compact" type="button" data-collection-clear-substitute="${index}" data-slot="1" ${(item.substitutos || [])[1] ? '' : 'disabled'}>Limpar 2</button><button class="button ghost compact danger-text" type="button" data-collection-remove-item="${index}">Remover</button></div>
      </div>`;
    }).join('') : '<div class="empty-state collection-items-empty">Adicione produtos à composição.</div>';
    this.renderSearchMode();
  }

  handleItemInput(event) {
    if (!this.draft) return;
    const quantityIndex = event.target.dataset.collectionItemQty;
    if (quantityIndex !== undefined) this.draft.produtos[Number(quantityIndex)].qtd = Math.max(1, Math.floor(number(event.target.value) || 1));
    this.renderAudit();
  }

  startReplacement(index, mode, slot = 0) {
    this.replaceTarget = { index: Number(index), mode, slot: Number(slot) || 0 };
    this.elements.collectionProductSearch.value = '';
    this.renderSearchMode();
    this.elements.collectionProductSearch.focus();
  }

  renderSearchMode() {
    const host = this.elements.collectionProductSearch.closest('.collection-product-search');
    if (!host) return;
    let mode = host.querySelector('.collection-replace-mode');
    if (!this.replaceTarget) {
      mode?.remove();
      return;
    }
    if (!mode) {
      mode = document.createElement('div');
      mode.className = 'collection-replace-mode';
      host.insertBefore(mode, this.elements.collectionSearchResults);
    }
    mode.innerHTML = `<strong>Modo substituição ativo</strong><span>${this.replaceTarget.mode === 'main' ? 'Escolha o novo produto principal.' : `Escolha o substituto ${this.replaceTarget.slot + 1}.`}</span><button class="button ghost compact" type="button" data-collection-cancel-replace>Cancelar</button>`;
  }

  handleItemClick(event) {
    if (!this.draft) return;
    const remove = event.target.closest('[data-collection-remove-item]');
    const replace = event.target.closest('[data-collection-replace-main]');
    const substitute = event.target.closest('[data-collection-set-substitute]');
    const clear = event.target.closest('[data-collection-clear-substitute]');
    const open = event.target.closest('[data-collection-open-product]');
    const cancel = event.target.closest('[data-collection-cancel-replace]');
    if (remove) {
      this.draft.produtos.splice(Number(remove.dataset.collectionRemoveItem), 1);
      this.replaceTarget = null;
      this.renderItems();
      this.renderAudit();
    }
    if (replace) this.startReplacement(replace.dataset.collectionReplaceMain, 'main');
    if (substitute) this.startReplacement(substitute.dataset.collectionSetSubstitute, 'substitute', substitute.dataset.slot);
    if (clear) {
      const item = this.draft.produtos[Number(clear.dataset.collectionClearSubstitute)];
      if (item) {
        item.substitutos = Array.isArray(item.substitutos) ? item.substitutos : [];
        item.substitutos.splice(Number(clear.dataset.slot) || 0, 1);
        this.renderItems();
        this.renderAudit();
      }
    }
    if (open) {
      const item = this.draft.produtos[Number(open.dataset.collectionOpenProduct)];
      const resolved = resolveCollectionItem(item, this.store.state.products);
      const product = resolved.product || this.findProduct(item?.codigo);
      if (product) {
        const key = productKey(product);
        this.closeEditor();
        window.dispatchEvent(new CustomEvent('admin-v2-open-product', { detail: { key } }));
      }
    }
    if (cancel) {
      this.replaceTarget = null;
      this.elements.collectionProductSearch.value = '';
      this.elements.collectionSearchResults.innerHTML = '';
      this.renderSearchMode();
    }
  }

  renderSearchResults() {
    const query = this.elements.collectionProductSearch.value;
    const results = collectionSearch(this.store.state.products, query, 20);
    const label = this.replaceTarget ? (this.replaceTarget.mode === 'main' ? 'Usar como principal' : `Usar como subst. ${this.replaceTarget.slot + 1}`) : 'Adicionar';
    this.elements.collectionSearchResults.innerHTML = results.length ? results.map(product => {
      const stock = number(product.estoque);
      return `<button class="${stock < LOW_STOCK_LIMIT ? 'low-stock' : ''}" type="button" data-collection-add-product="${escapeHtml(productKey(product))}"><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(productCode(product) || productKey(product))} · estoque ${stock} · ${money(product.preco)}</small><span>${label}</span></button>`;
    }).join('') : (query.trim().length > 1 ? '<small>Nenhum produto encontrado.</small>' : '');
  }

  addProduct(key) {
    if (!this.draft) return;
    const product = this.store.state.products.find(candidate => productKey(candidate) === String(key));
    if (!product) return;
    const code = productCode(product) || productKey(product);
    if (this.replaceTarget) {
      const item = this.draft.produtos[this.replaceTarget.index];
      if (!item) return;
      if (this.replaceTarget.mode === 'main') {
        item.codigo = code;
        item.substitutos = (Array.isArray(item.substitutos) ? item.substitutos : []).filter(value => text(value) !== code);
      } else {
        item.substitutos = Array.isArray(item.substitutos) ? item.substitutos : [];
        item.substitutos[this.replaceTarget.slot] = code;
        item.substitutos = item.substitutos.filter((value, index, list) => text(value) && text(value) !== text(item.codigo) && list.indexOf(value) === index);
      }
      this.replaceTarget = null;
    } else {
      const existing = this.draft.produtos.find(item => text(item.codigo) === code);
      if (existing) existing.qtd = Math.max(1, number(existing.qtd) + 1);
      else this.draft.produtos.push({ qtd: 1, codigo: code, substitutos: [] });
    }
    this.elements.collectionProductSearch.value = '';
    this.elements.collectionSearchResults.innerHTML = '';
    this.renderItems();
    this.renderAudit();
  }

  renderAudit() {
    if (!this.draft) return;
    const audit = auditCollection(this.draft, this.type, this.store.state.products, this.store.state.queue);
    const issues = [...audit.errors.map(message => ['danger', message]), ...audit.warnings.map(message => ['warning', message])];
    const belowThirty = audit.items.filter(item => number(item.resolved?.product?.estoque) < LOW_STOCK_LIMIT).length;
    this.elements.collectionAudit.innerHTML = `<div class="collection-audit-metrics"><div><strong>${money(audit.configuredPrice)}</strong><span>Preço definido</span></div><div><strong>${money(audit.regularTotal)}</strong><span>Soma dos itens</span></div><div><strong>${audit.available}</strong><span>Disponíveis</span></div><div><strong>${belowThirty}</strong><span>Itens abaixo de 30</span></div></div>${issues.length ? `<div class="collection-audit-issues">${issues.map(([kind, message]) => `<div class="${kind}">${escapeHtml(message)}</div>`).join('')}</div>` : '<div class="collection-audit-ready">Cadastro válido para publicação.</div>'}`;
    const config = this.reloadConfig();
    this.elements.collectionSave.disabled = !(audit.errors.length === 0 && config.writeMode && config.collectionsWriteMode);
    this.elements.collectionSafety.textContent = config.writeMode && config.collectionsWriteMode
      ? 'Gravação liberada para teste controlado.'
      : 'Gravação bloqueada nas configurações.';
  }

  async runKitAutomation(action) {
    if (!this.draft || this.type !== 'kit' || this.makeBusy) return;
    const config = this.reloadConfig();
    const kit = compactKitForMake(this.draft, this.store.state.products);
    if (!kit.produtos.length) throw new Error('Adicione produtos ao kit antes de executar a automação.');
    if (action === 'instagram') {
      const audit = auditCollection(this.draft, 'kit', this.store.state.products, this.store.state.queue);
      if (audit.errors.length) throw new Error(`Revise o kit antes de gerar a fila: ${audit.errors.join(' · ')}.`);
      if (!confirm(`Gerar o carrossel do kit “${this.draft.nome}” e enviar para a fila do Instagram?`)) return;
    }
    this.makeBusy = true;
    this.elements.collectionForm.innerHTML = this.formHtml();
    try {
      if (action === 'description') {
        this.onToast('Make: gerando nome e descrição do kit…');
        const result = unwrapMakeResult(await callMake(config, 'text', { acao: 'gerar_descricao_kit', kit }));
        const description = result.descricao || result.description || result.texto;
        const name = result.nome_sugerido || result.nome_curto || result.nome || result.name;
        if (!text(description) && !text(name)) throw new Error('O Make não retornou nome ou descrição para o kit.');
        if (text(description)) this.draft.descricao = text(description);
        if (text(name)) this.draft.nome = text(name).slice(0, 80);
        this.onToast('Descrição do kit aplicada. Revise e salve.', 'success');
      }
      if (action === 'cover') {
        if (!kit.referencias_imagens.length) throw new Error('Os produtos do kit precisam ter imagens públicas para gerar a capa.');
        this.onToast('Make: gerando a capa do kit…');
        const result = await callMake(config, 'image', {
          acao: 'gerar_capa_kit',
          quantidade_imagens: 1,
          kit,
          imagem_path: `${text(config.githubKitImagesPath || 'site/img/kits').replace(/\/+$/, '')}/${slug(this.draft.codigo || this.draft.nome)}.webp`,
          storage_destino: 'github',
          instrucoes: 'Criar uma única capa quadrada de e-commerce com as fotos reais dos produtos, nome do kit, preço anterior, preço promocional e economia. Não inventar embalagens.',
        });
        let image = extractMakeImage(result);
        if (!image) throw new Error('O Make não retornou a capa do kit.');
        if (/^data:image\//i.test(image)) {
          const path = `${text(config.githubKitImagesPath || 'site/img/kits').replace(/^\/+|\/+$/g, '')}/${slug(this.draft.codigo || this.draft.nome)}-${Date.now()}.webp`;
          const uploaded = await upsertBase64File(config, path, image, `Atualiza capa IA do kit ${this.draft.nome} pelo Admin V2`);
          image = uploaded.url;
          this.draft.imagem_path = path;
        }
        this.draft.imagem = image;
        this.draft.imagem_url = image;
        this.draft.imagem_origem = 'ia_make';
        this.draft.imagem_gerada_em = new Date().toISOString();
        this.onToast('Capa do kit aplicada. Revise e salve.', 'success');
      }
      if (action === 'instagram') {
        this.onToast('Make: gerando carrossel e fila do Instagram…');
        const result = unwrapMakeResult(await callMake(config, 'instagram-kit', {
          acao: 'gerar_kit_instagram_fila',
          modo_publicacao: 'fila_github',
          origem: 'admin_v2_dona_antonia',
          criado_em: new Date().toISOString(),
          formato: 'instagram_carrossel_4_5',
          total_paginas: 2 + kit.produtos.length,
          regra_paginas: 'capa + uma página por produto + CTA final',
          kit,
          produtos: kit.produtos,
        }));
        this.draft.instagram_status = text(result.status || result.fila_status || 'novo');
        this.draft.instagram_enviado_em = new Date().toISOString();
        this.draft.instagram_post_id = text(result.instagram_id || result.instagram_post_id || result.id);
        this.draft.instagram_carrossel_id = text(result.id_carrossel || result.carrossel_id);
        this.draft.instagram_imagens = result.imagens || result.urls_imagens || [];
        this.draft.instagram_dados_json = text(result.dados_json);
        this.draft.instagram_fila_json = text(result.fila_json);
        this.onToast('Carrossel criado e enviado para a fila. Salve o kit para registrar o status.', 'success');
      }
    } finally {
      this.makeBusy = false;
      if (this.draft) {
        this.elements.collectionEditorTitle.textContent = this.draft.nome || 'Kit promocional';
        this.elements.collectionForm.innerHTML = this.formHtml();
        this.renderItems();
        this.renderAudit();
      }
    }
  }

  async saveDraft() {
    if (!this.draft) return;
    const config = this.reloadConfig();
    const result = normalizeCollectionForPublish(this.draft, this.type, this.store.state.products, this.store.state.queue);
    if (result.audit.errors.length) {
      this.onToast(result.audit.errors.join(' · '), 'error');
      return;
    }
    const list = clone(this.currentList());
    const index = this.originalId ? list.findIndex(collection => text(collection.id) === this.originalId) : -1;
    if (index >= 0) list[index] = result.normalized;
    else list.push(result.normalized);
    this.elements.collectionSave.disabled = true;
    this.elements.collectionSave.textContent = 'Salvando…';
    try {
      const saved = await saveCollectionList(config, this.type, list, this.store.state.products, this.store.state.queue);
      this.setCurrentList(saved.list);
      this.onToast(`${this.type === 'kit' ? 'Kit' : 'Cesta'} salvo(a) no GitHub.`, 'success');
      this.closeEditor();
      await this.onReload();
    } catch (error) {
      console.error(error);
      this.onToast(error?.message || String(error), 'error');
    } finally {
      this.elements.collectionSave.textContent = 'Salvar e publicar';
      this.render();
    }
  }

  async deleteCollection(id) {
    const target = this.currentList().find(collection => text(collection.id) === String(id));
    if (!target || !confirm(`Excluir ${target.nome || target.codigo}?`)) return;
    const config = this.reloadConfig();
    const list = this.currentList().filter(collection => text(collection.id) !== String(id));
    try {
      const saved = await saveCollectionList(config, this.type, list, this.store.state.products, this.store.state.queue);
      this.setCurrentList(saved.list);
      this.onToast('Cadastro removido e arquivo atualizado.', 'success');
      await this.onReload();
    } catch (error) {
      this.onToast(error?.message || String(error), 'error');
    }
  }
}
