import { matchNfeAnalysis } from './core/nfe.js';
import { prepareNfeAnalysis } from './core/nfe-simulation.js?admin_build=20260726-admin-v13-nfe-real';
import { NfeAdvancedModule } from './modules/nfe-advanced.js?admin_build=20260726-admin-v13-xml-editor-parity';
import { number, text } from './core/utils.js';
import { inspectNfeImport } from './services/github.js';
import { executeNfeImport } from './services/nfe-transaction.js?admin_build=20260803-nfe-save-v2';

const PATCH_FLAG = '__nfeImportSaveFixV3';

function productsUrl(config) {
  const base = text(config?.firebaseUrl || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/+$/, '');
  const node = text(config?.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
  return `${base}/${node}.json?_nfe_confirm=${Date.now()}`;
}

function normalizeProduct(key, value) {
  const product = value && typeof value === 'object' ? { ...value } : {};
  product.firebaseKey = text(product.firebaseKey || key);
  product.id = text(product.id || product.firebaseKey);
  product.codigo = text(product.codigo || product.sku || product.id || product.firebaseKey);
  product.nome = text(product.nome || product.titulo);
  product.preco = number(product.preco);
  product.preco_custo = number(product.preco_custo);
  product.estoque = Math.max(0, Math.floor(number(product.estoque)));
  product.situacao = text(product.situacao || product.status || 'A').toUpperCase();
  return product;
}

async function loadProductsDirectlyFromFirebase(config) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(productsUrl(config), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Firebase retornou ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
    return Object.entries(data)
      .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
      .map(([key, value]) => normalizeProduct(key, value));
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('O Firebase demorou para confirmar o catálogo após a NF-e.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function appliedCount(record) {
  return Array.isArray(record?.itens_aplicados) ? record.itens_aplicados.length : 0;
}

function install() {
  const prototype = NfeAdvancedModule.prototype;
  if (prototype[PATCH_FLAG]) return;
  Object.defineProperty(prototype, PATCH_FLAG, { value: true });

  const originalAnalyze = prototype.analyze;
  prototype.analyze = async function analyzeWithCompletedNotice(raw, sourceLabel = 'XML') {
    await originalAnalyze.call(this, raw, sourceLabel);
    if (!this.analysis?.globalDuplicate) return;
    const count = appliedCount(this.analysis.importRecord);
    const suffix = count ? ` ${count} item(ns) constam como aplicados.` : '';
    this.setMessage(`Esta NF-e já foi importada e concluída.${suffix} A repetição foi bloqueada para não somar o estoque novamente.`, 'success');
    this.onToast('NF-e já importada. Os produtos serão conferidos diretamente no Firebase; não importe a mesma nota novamente.', 'success');
  };

  prototype.executeImport = async function executeImportConfirmed() {
    if (this.analysis?.globalDuplicate) {
      const count = appliedCount(this.analysis.importRecord);
      this.setMessage(`Esta NF-e já está concluída${count ? ` com ${count} item(ns) aplicado(s)` : ''}. Nenhuma nova gravação foi feita para evitar estoque duplicado.`, 'success');
      this.onToast('A nota já foi salva anteriormente. Use a listagem de produtos para conferir os cadastros.', 'success');
      return;
    }
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

      this.setMessage(`NF-e ${result.record.chave_nfe} importada. Confirmando o catálogo diretamente no Firebase…`, 'info');
      const firebaseProducts = await loadProductsDirectlyFromFirebase(this.store.state.config);
      this.store.state.products = firebaseProducts;

      const savedKeys = new Set(result.savedProducts.map(product => text(product?.firebaseKey || product?.id || product?.codigo)).filter(Boolean));
      const confirmedCount = firebaseProducts.filter(product => savedKeys.has(text(product.firebaseKey)) || savedKeys.has(text(product.id)) || savedKeys.has(text(product.codigo))).length;
      if (confirmedCount < result.savedProducts.length) {
        throw new Error(`A NF-e foi processada, mas a atualização da tela confirmou apenas ${confirmedCount} de ${result.savedProducts.length} produto(s). Atualize os dados para conferir.`);
      }

      this.setMessage(`NF-e ${result.record.chave_nfe} importada. ${confirmedCount} produto(s) visíveis e confirmados diretamente no Firebase.`, 'success');
      this.onToast(`${confirmedCount} produto(s) cadastrados ou atualizados e confirmados no Firebase.`, 'success');
      if (this.elements.nfeConfirmImport) this.elements.nfeConfirmImport.checked = false;

      window.dispatchEvent(new CustomEvent('admin-v2-products-invalidated'));
      const record = await inspectNfeImport(this.store.state.config, this.analysis.note.key);
      this.analysis = prepareNfeAnalysis(matchNfeAnalysis({
        note: this.analysis.note,
        items: this.analysis.items,
        rawXml: this.rawXml,
      }, this.store.state.products, record, this.margin), this.margin);
      this.refreshSimulation();
      this.renderAnalysis();
      this.setMessage(`NF-e concluída. ${confirmedCount} produto(s) estão no Firebase. A nota permanece bloqueada contra nova importação.`, 'success');
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
