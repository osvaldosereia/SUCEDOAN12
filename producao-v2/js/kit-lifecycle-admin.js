import { CollectionsModule } from './modules/collections.js';
import { clone, escapeHtml, text } from './core/utils.js';
import { saveCollectionList } from './services/collections.js';

const BUILD = '20260727-admin-kit-lifecycle-v1';

function installStylesheet() {
  if (document.querySelector('link[data-admin-kit-lifecycle]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `./assets/kit-lifecycle.css?admin_build=${BUILD}`;
  link.dataset.adminKitLifecycle = '1';
  document.head.appendChild(link);
}

function cardFor(module, id) {
  return [...module.elements.collectionCards.querySelectorAll('[data-kit-card-id]')]
    .find(node => node.dataset.kitCardId === String(id)) || null;
}

function quickStatus(audit) {
  if (audit.source.ativo === false) return ['neutral', 'Desativado manualmente'];
  if (audit.errors.length) return ['danger', 'Cadastro com erro'];
  if (audit.stockControlled && audit.available <= 0) return ['danger', 'Fora do ar: item sem estoque'];
  if (audit.stockControlled) return ['success', `Ativo por estoque · ${audit.available} kit(s)`];
  if (audit.periodStatus === 'encerrado') return ['neutral', 'Validade encerrada'];
  if (audit.periodStatus === 'agendado') return ['warning', 'Agendado'];
  return audit.active ? ['success', 'Ativo por data e estoque'] : ['neutral', 'Fora do ar'];
}

if (!CollectionsModule.prototype.__kitLifecycleAdminInstalled) {
  Object.defineProperty(CollectionsModule.prototype, '__kitLifecycleAdminInstalled', { value: true });

  const originalBind = CollectionsModule.prototype.bind;
  const originalCard = CollectionsModule.prototype.card;
  const originalFormHtml = CollectionsModule.prototype.formHtml;

  CollectionsModule.prototype.bind = function bindWithKitLifecycle() {
    originalBind.call(this);
    installStylesheet();
    this.quickKitBusy = new Set();
    this.elements.collectionCards.addEventListener('click', event => {
      const save = event.target.closest('[data-kit-quick-save]');
      if (!save) return;
      event.preventDefault();
      this.saveKitQuick(save.dataset.kitQuickSave).catch(error => {
        console.error(error);
        this.onToast(error?.message || String(error), 'error');
      });
    });
  };

  CollectionsModule.prototype.card = function cardWithKitLifecycle(audit) {
    let html = originalCard.call(this, audit);
    if (this.type !== 'kit') return html;
    const source = audit.source;
    const id = text(source.id);
    const stockMode = source.ativo_ate_estoque_zero === true;
    const [statusKind, statusText] = quickStatus(audit);
    const quick = `<section class="kit-quick-editor" aria-label="Ajustes rápidos do kit">
      <div class="kit-quick-editor-head"><strong>Ajuste rápido</strong><span class="badge ${statusKind}">${escapeHtml(statusText)}</span></div>
      <div class="kit-quick-editor-grid">
        <label>Validade do kit<input type="date" data-kit-quick-expiry value="${escapeHtml(source.data_fim || '')}" ${stockMode ? 'disabled title="Ignorada no modo ativo até zerar estoque"' : ''}></label>
        <label class="kit-quick-switch"><span>Kit ativo</span><input type="checkbox" data-kit-quick-active ${source.ativo !== false ? 'checked' : ''}></label>
        <label class="kit-quick-switch kit-stock-mode"><span><strong>Ativo até zerar estoque</strong><small>Sai do ar se qualquer item principal zerar.</small></span><input type="checkbox" data-kit-quick-stock-mode ${stockMode ? 'checked' : ''}></label>
        <button class="button primary compact" type="button" data-kit-quick-save="${escapeHtml(id)}" ${this.quickKitBusy?.has(id) ? 'disabled' : ''}>${this.quickKitBusy?.has(id) ? 'Salvando…' : 'Salvar validade e status'}</button>
      </div>
    </section>`;
    html = html.replace('<article class="collection-card">', `<article class="collection-card" data-kit-card-id="${escapeHtml(id)}">`);
    return html.replace('<div class="collection-card-actions">', `${quick}<div class="collection-card-actions">`);
  };

  CollectionsModule.prototype.formHtml = function formHtmlWithStockMode() {
    const html = originalFormHtml.call(this);
    if (this.type !== 'kit' || !this.draft) return html;
    const checked = this.draft.ativo_ate_estoque_zero === true ? 'checked' : '';
    const field = `<label class="switch-row span-2 kit-stock-mode-editor"><span><strong>Ativo até um item ficar sem estoque</strong><small>Ignora a data final, usa somente os produtos principais e tira o kit do ar quando qualquer item não atender a quantidade configurada. Ao repor o estoque, o kit volta automaticamente se continuar ativo.</small></span><input type="checkbox" data-collection-field="ativo_ate_estoque_zero" ${checked}></label>`;
    return html.replace('<label class="span-2">Descrição', `${field}<label class="span-2">Descrição`);
  };

  CollectionsModule.prototype.saveKitQuick = async function saveKitQuick(id) {
    const key = String(id || '');
    if (!key || this.type !== 'kit' || this.quickKitBusy?.has(key)) return;
    const card = cardFor(this, key);
    const current = this.currentList().find(collection => text(collection.id) === key);
    if (!card || !current) throw new Error('Kit não encontrado para o ajuste rápido.');

    const expiry = card.querySelector('[data-kit-quick-expiry]')?.value || '';
    const active = Boolean(card.querySelector('[data-kit-quick-active]')?.checked);
    const stockMode = Boolean(card.querySelector('[data-kit-quick-stock-mode]')?.checked);
    const list = clone(this.currentList());
    const target = list.find(collection => text(collection.id) === key);
    if (!target) throw new Error('Kit não encontrado na lista carregada.');

    target.ativo = stockMode ? true : active;
    target.ativo_ate_estoque_zero = stockMode;
    target.data_fim = stockMode ? '' : expiry;
    target.atualizado_em = new Date().toISOString();

    const config = this.reloadConfig();
    this.quickKitBusy.add(key);
    this.render();
    try {
      const saved = await saveCollectionList(
        config,
        'kit',
        list,
        this.store.state.products,
        this.store.state.queue,
        { preserveInvalidExisting: true, changedId: key },
      );
      this.setCurrentList(saved.list);
      this.onToast(stockMode
        ? 'Kit ativado por estoque. Ele ficará fora do ar enquanto qualquer item principal estiver zerado.'
        : 'Validade e status do kit atualizados.', 'success');
      this.render();
      await this.onReload();
    } finally {
      this.quickKitBusy.delete(key);
      this.render();
    }
  };

  CollectionsModule.prototype.deleteCollection = async function deleteCollectionFixed(id) {
    const key = String(id || '');
    const target = this.currentList().find(collection => text(collection.id) === key);
    if (!target || this.quickKitBusy?.has(`delete:${key}`)) return;
    const label = this.type === 'kit' ? 'kit' : 'cesta';
    if (!confirm(`Excluir definitivamente o ${label} “${target.nome || target.codigo}”?`)) return;

    const config = this.reloadConfig();
    const list = this.currentList().filter(collection => text(collection.id) !== key);
    this.quickKitBusy.add(`delete:${key}`);
    try {
      const saved = await saveCollectionList(
        config,
        this.type,
        list,
        this.store.state.products,
        this.store.state.queue,
        { preserveInvalidExisting: true },
      );
      this.setCurrentList(saved.list);
      this.render();
      this.onToast(`${this.type === 'kit' ? 'Kit' : 'Cesta'} excluído(a) e removido(a) do arquivo público.`, 'success');
      await this.onReload();
    } finally {
      this.quickKitBusy.delete(`delete:${key}`);
    }
  };
}

export const KIT_LIFECYCLE_ADMIN_BUILD = BUILD;
