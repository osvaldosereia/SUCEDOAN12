import {
  auditCollection, auditCollections, collectionSearch, normalizeCollectionForPublish, resolveCollectionItem,
} from '../core/collections.js';
import { clone, debounce, escapeHtml, money, number, productCode, productKey, productName, text } from '../core/utils.js';
import { saveCollectionList } from '../services/collections.js';

const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="12">sem imagem</text></svg>')}`;

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
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
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
    this.searchTimer = debounce(() => this.renderSearchResults(), 160);
    this.bind();
    this.render();
  }

  bind() {
    this.elements.collectionTabs.addEventListener('click', event => {
      const button = event.target.closest('[data-collection-type]');
      if (!button) return;
      this.type = button.dataset.collectionType;
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
    const [queueKind, queueStatus] = queueLabel(audit.queueEntry);
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

  formHtml() {
    const draft = this.draft;
    return `<div class="form-grid">
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

  renderItems() {
    const items = Array.isArray(this.draft?.produtos) ? this.draft.produtos : [];
    this.elements.collectionItems.innerHTML = items.length ? items.map((item, index) => {
      const resolved = resolveCollectionItem(item, this.store.state.products);
      return `<div class="collection-item" data-collection-item="${index}"><div><span>Produto</span><strong>${escapeHtml(resolved.product ? productName(resolved.product) : item.codigo || 'Não encontrado')}</strong><small>${escapeHtml(item.codigo || 'sem código')}${resolved.usedSubstitute ? ` · substituto ${escapeHtml(resolved.selectedCode)}` : ''}</small></div><label>Qtd.<input type="number" min="1" step="1" value="${escapeHtml(item.qtd || 1)}" data-collection-item-qty="${index}"></label><label>Substitutos<input value="${escapeHtml((item.substitutos || []).join(', '))}" data-collection-item-subs="${index}" placeholder="códigos separados por vírgula"></label><button class="icon-button" type="button" data-collection-remove-item="${index}" aria-label="Remover">×</button></div>`;
    }).join('') : '<div class="empty-state collection-items-empty">Adicione produtos à composição.</div>';
  }

  handleItemInput(event) {
    if (!this.draft) return;
    const quantityIndex = event.target.dataset.collectionItemQty;
    const substituteIndex = event.target.dataset.collectionItemSubs;
    if (quantityIndex !== undefined) this.draft.produtos[Number(quantityIndex)].qtd = Math.max(1, Math.floor(number(event.target.value) || 1));
    if (substituteIndex !== undefined) this.draft.produtos[Number(substituteIndex)].substitutos = event.target.value.split(/[,;|]/).map(text).filter(Boolean);
    this.renderAudit();
  }

  handleItemClick(event) {
    const button = event.target.closest('[data-collection-remove-item]');
    if (!button || !this.draft) return;
    this.draft.produtos.splice(Number(button.dataset.collectionRemoveItem), 1);
    this.renderItems();
    this.renderAudit();
  }

  renderSearchResults() {
    const query = this.elements.collectionProductSearch.value;
    const results = collectionSearch(this.store.state.products, query, 12);
    this.elements.collectionSearchResults.innerHTML = results.length ? results.map(product => `<button type="button" data-collection-add-product="${escapeHtml(productKey(product))}"><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(productCode(product) || productKey(product))} · estoque ${number(product.estoque)} · ${money(product.preco)}</small></button>`).join('') : (query.trim().length > 1 ? '<small>Nenhum produto encontrado.</small>' : '');
  }

  addProduct(key) {
    if (!this.draft) return;
    const product = this.store.state.products.find(candidate => productKey(candidate) === String(key));
    if (!product) return;
    const code = productCode(product) || productKey(product);
    const existing = this.draft.produtos.find(item => text(item.codigo) === code);
    if (existing) existing.qtd = Math.max(1, number(existing.qtd) + 1);
    else this.draft.produtos.push({ qtd: 1, codigo: code, substitutos: [] });
    this.elements.collectionProductSearch.value = '';
    this.elements.collectionSearchResults.innerHTML = '';
    this.renderItems();
    this.renderAudit();
  }

  renderAudit() {
    if (!this.draft) return;
    const audit = auditCollection(this.draft, this.type, this.store.state.products, this.store.state.queue);
    const issues = [...audit.errors.map(message => ['danger', message]), ...audit.warnings.map(message => ['warning', message])];
    this.elements.collectionAudit.innerHTML = `<div class="collection-audit-metrics"><div><strong>${money(audit.configuredPrice)}</strong><span>Preço definido</span></div><div><strong>${money(audit.regularTotal)}</strong><span>Soma dos itens</span></div><div><strong>${audit.available}</strong><span>Disponíveis</span></div><div><strong>${this.type === 'kit' ? `${audit.discount}%` : audit.items.length}</strong><span>${this.type === 'kit' ? 'Desconto' : 'Itens'}</span></div></div>${issues.length ? `<div class="collection-audit-issues">${issues.map(([kind, message]) => `<div class="${kind}">${escapeHtml(message)}</div>`).join('')}</div>` : '<div class="collection-audit-ready">Cadastro válido para publicação.</div>'}`;
    const config = this.reloadConfig();
    this.elements.collectionSave.disabled = !(audit.errors.length === 0 && config.writeMode && config.collectionsWriteMode);
    this.elements.collectionSafety.textContent = config.writeMode && config.collectionsWriteMode
      ? 'Gravação liberada para teste controlado.'
      : 'Gravação bloqueada nas configurações.';
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
