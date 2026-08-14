import { normalizeCollectionForPublish } from './core/collections.js?admin_build=20260814-cestas-limites-v1';
import { clone, text } from './core/utils.js';
import { CollectionsModule } from './modules/collections.js?admin_build=20260814-cestas-limites-v1';
import { saveCollectionList } from './services/collections.js?admin_build=20260814-cestas-limites-v1';

if (!CollectionsModule.prototype.__productiveCollectionSaveInstalled) {
  Object.defineProperty(CollectionsModule.prototype, '__productiveCollectionSaveInstalled', { value: true });

  const originalOpenEditor = CollectionsModule.prototype.openEditor;
  const originalCloseEditor = CollectionsModule.prototype.closeEditor;

  CollectionsModule.prototype.openEditor = function openEditorWithSnapshot(id) {
    originalOpenEditor.call(this, id);
    this.originalCollectionSnapshot = this.draft ? clone(this.draft) : null;
  };

  CollectionsModule.prototype.closeEditor = function closeEditorWithSnapshot() {
    this.originalCollectionSnapshot = null;
    originalCloseEditor.call(this);
  };

  CollectionsModule.prototype.saveDraft = async function saveDraftProductive() {
    if (!this.draft) return;
    const config = this.reloadConfig();
    const result = normalizeCollectionForPublish(this.draft, this.type, this.store.state.products, this.store.state.queue);
    if (result.audit.errors.length) {
      this.onToast(result.audit.errors.join(' · '), 'error');
      return;
    }

    const changedId = text(result.normalized.id);
    const previousId = text(this.originalId || changedId);
    const list = clone(this.currentList());
    const index = this.originalId ? list.findIndex(collection => text(collection.id) === this.originalId) : -1;
    if (index >= 0) list[index] = result.normalized;
    else list.push(result.normalized);

    this.elements.collectionSave.disabled = true;
    this.elements.collectionSave.textContent = 'Salvando…';
    try {
      const saved = await saveCollectionList(
        config,
        this.type,
        list,
        this.store.state.products,
        this.store.state.queue,
        {
          changedId,
          previousId,
          originalCollection: this.originalCollectionSnapshot,
          preserveInvalidExisting: true,
        },
      );
      this.setCurrentList(saved.list);
      this.onToast(`${this.type === 'kit' ? 'Kit' : 'Cesta'} salvo(a) sem sobrescrever outras alterações.`, 'success');
      this.closeEditor();
      await this.onReload();
    } catch (error) {
      console.error(error);
      this.onToast(error?.message || String(error), 'error');
    } finally {
      this.elements.collectionSave.textContent = 'Salvar e publicar';
      this.render();
    }
  };
}

export const COLLECTION_CONCURRENCY_BUILD = '20260729-save-merge-v1';
