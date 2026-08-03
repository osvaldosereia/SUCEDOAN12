import { matchNfeAnalysis } from './core/nfe.js';
import { prepareNfeAnalysis } from './core/nfe-simulation.js?admin_build=20260726-admin-v13-nfe-real';
import { NfeAdvancedModule } from './modules/nfe-advanced.js?admin_build=20260726-admin-v13-xml-editor-parity';
import { inspectNfeImport } from './services/github.js';
import { executeNfeImport } from './services/nfe-transaction.js?admin_build=20260803-nfe-save-v2';

const PATCH_FLAG = '__nfeImportSaveFixV2';

function install() {
  const prototype = NfeAdvancedModule.prototype;
  if (prototype[PATCH_FLAG]) return;
  Object.defineProperty(prototype, PATCH_FLAG, { value: true });

  prototype.executeImport = async function executeImportConfirmed() {
    if (this.busy || !this.analysis || !this.simulation?.canImport) return;
    if (typeof this.reloadConfig === 'function') this.store.state.config = this.reloadConfig();
    if (!confirm(`Importar a NF-e ${this.analysis.note.key} no Firebase, cadastrar produtos novos e somar o estoque dos itens confirmados?`)) return;

    this.busy = true;
    this.setControlsDisabled(true);
    this.renderImportControls();
    if (this.elements.nfeProgress) this.elements.nfeProgress.textContent = 'Iniciando importação…';

    try {
      const result = await executeNfeImport({
        config: this.store.state.config,
        analysis: this.analysis,
        simulation: this.simulation,
        rawXml: this.rawXml,
        onProgress: progress => {
          if (this.elements.nfeProgress) this.elements.nfeProgress.textContent = progress.message;
          this.setMessage(progress.message, progress.step === 'done' ? 'success' : 'info');
        },
      });

      this.setMessage(`NF-e ${result.record.chave_nfe} importada. ${result.savedProducts.length} produto(s) confirmado(s) no Firebase.`, 'success');
      this.onToast(`${result.savedProducts.length} produto(s) cadastrados ou atualizados e confirmados no Firebase.`, 'success');
      if (this.elements.nfeConfirmImport) this.elements.nfeConfirmImport.checked = false;

      if (typeof this.onAfterImport === 'function') await this.onAfterImport(result);
      const record = await inspectNfeImport(this.store.state.config, this.analysis.note.key);
      this.analysis = prepareNfeAnalysis(matchNfeAnalysis({
        note: this.analysis.note,
        items: this.analysis.items,
        rawXml: this.rawXml,
      }, this.store.state.products, record, this.margin), this.margin);
      this.refreshSimulation();
      this.renderAnalysis();
    } catch (error) {
      console.error('Falha ao importar NF-e:', error);
      this.fail(error);
    } finally {
      this.busy = false;
      this.setControlsDisabled(false);
      this.renderImportControls();
    }
  };
}

install();
