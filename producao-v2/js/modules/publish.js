import { auditCatalog, buildProductsHomePayload } from '../core/catalog.js';
import { escapeHtml } from '../core/utils.js';
import { githubConfigProblems, publishCatalog } from '../services/github.js';

export class PublishModule {
  constructor({ store, elements, onSaveProduct, onToast, onPublished }) {
    this.store = store;
    this.elements = elements;
    this.onSaveProduct = onSaveProduct;
    this.onToast = onToast;
    this.onPublished = onPublished;
    this.busy = false;
    this.bind();
  }

  bind() {
    this.elements.publishButton.addEventListener('click', () => this.open());
    this.elements.openPublishReviewButton?.addEventListener('click', () => this.open());
    this.elements.openPublishReviewSettingsButton?.addEventListener('click', () => this.open());
    this.elements.closePublishReviewButton.addEventListener('click', () => this.close());
    this.elements.publishBackdrop.addEventListener('click', () => this.close());
    this.elements.confirmPublishCheckbox.addEventListener('change', () => this.render());
    this.elements.executePublishButton.addEventListener('click', () => this.execute());
  }

  audit() {
    return auditCatalog(this.store.state.products, this.store.state.config);
  }

  blockers(audit) {
    const blockers = [];
    if (!this.store.state.firebaseVerified) blockers.push('O catálogo ainda não foi confirmado pelo Firebase nesta sessão.');
    if (!this.store.state.config.writeMode) blockers.push('O modo de gravação da V2 está bloqueado.');
    const githubProblems = githubConfigProblems(this.store.state.config);
    if (githubProblems.length) blockers.push(`GitHub incompleto: ${githubProblems.join(', ')}.`);
    if (audit.errors.length) blockers.push(`${audit.errors.length} produto(s) possuem erros obrigatórios.`);
    return blockers;
  }

  open() {
    if (!this.store.state.products.length) {
      this.onToast('Carregue os produtos antes de revisar a publicação.', 'error');
      return;
    }
    this.elements.confirmPublishCheckbox.checked = false;
    this.elements.publishDialog.hidden = false;
    this.elements.publishBackdrop.hidden = false;
    this.elements.publishDialog.setAttribute('aria-hidden', 'false');
    this.render();
  }

  close() {
    if (this.busy) return;
    this.elements.publishDialog.hidden = true;
    this.elements.publishBackdrop.hidden = true;
    this.elements.publishDialog.setAttribute('aria-hidden', 'true');
  }

  render() {
    const audit = this.audit();
    const blockers = this.blockers(audit);
    const dirtyCount = this.store.state.dirtyProducts.size;
    this.elements.publishReviewMetrics.innerHTML = [
      ['Produtos carregados', this.store.state.products.length, 'info'],
      ['Alterações locais', dirtyCount, dirtyCount ? 'warning' : 'success'],
      ['Erros obrigatórios', audit.errors.length, audit.errors.length ? 'danger' : 'success'],
      ['Produtos com avisos', audit.warnings.length, audit.warnings.length ? 'warning' : 'success'],
    ].map(([label, value, kind]) => `<div class="review-metric ${kind}"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('');

    this.elements.publishBlockers.innerHTML = blockers.length
      ? `<div class="notice danger"><strong>Publicação bloqueada</strong>${blockers.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
      : '<div class="notice success"><strong>Catálogo pronto para publicação</strong><span>As alterações serão salvas no Firebase antes da atualização dos arquivos públicos.</span></div>';

    const problemRows = [...audit.errors, ...audit.warnings.filter(row => !row.errors.length)].slice(0, 40);
    this.elements.publishIssues.innerHTML = problemRows.length ? problemRows.map(row => {
      const kind = row.errors.length ? 'danger' : 'warning';
      const messages = row.errors.length ? row.errors : row.warnings;
      return `<button class="issue-row" type="button" data-review-product="${escapeHtml(row.key)}"><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(messages.join(' · '))}</small></span><span class="badge ${kind}">${row.errors.length ? 'Erro' : 'Aviso'}</span></button>`;
    }).join('') : '<div class="empty-review">Nenhum erro ou aviso encontrado.</div>';

    this.elements.executePublishButton.disabled = this.busy || blockers.length > 0 || !this.elements.confirmPublishCheckbox.checked;
    this.elements.executePublishButton.textContent = this.busy ? 'Publicando…' : 'Salvar no Firebase e publicar catálogo';
    this.elements.confirmPublishCheckbox.disabled = blockers.length > 0 || this.busy;
  }

  async execute() {
    if (this.busy) return;
    const initialAudit = this.audit();
    const blockers = this.blockers(initialAudit);
    if (blockers.length || !this.elements.confirmPublishCheckbox.checked) {
      this.render();
      return;
    }

    this.busy = true;
    this.render();
    let saved = 0;
    try {
      const pendingKeys = [...this.store.state.dirtyProducts.keys()];
      for (const key of pendingKeys) {
        const product = this.store.getProduct(key);
        if (!product) continue;
        this.elements.publishProgress.textContent = `Salvando produto ${saved + 1} de ${pendingKeys.length}: ${product.nome || product.codigo || key}`;
        await this.onSaveProduct(product, { silent: true });
        saved += 1;
      }

      this.elements.publishProgress.textContent = 'Validando o catálogo completo após os salvamentos…';
      const finalAudit = this.audit();
      if (finalAudit.errors.length) throw new Error(`A publicação foi interrompida: ${finalAudit.errors.length} produto(s) ainda possuem erro.`);

      this.elements.publishProgress.textContent = 'Atualizando produtos-home.json e catalog-version.json…';
      const payload = buildProductsHomePayload(this.store.state.products, this.store.state.config);
      const result = await publishCatalog(this.store.state.config, payload);
      const publication = {
        ...result,
        savedProducts: saved,
        productCount: Object.keys(payload).length,
      };
      this.store.setLastPublication(publication);
      this.onPublished?.(publication);
      this.elements.publishProgress.textContent = `Concluído: ${saved} produto(s) salvo(s), ${result.written} arquivo(s) atualizado(s) e ${result.skipped} sem mudança.`;
      this.onToast('Catálogo publicado com segurança pela V2.', 'success');
      this.elements.confirmPublishCheckbox.checked = false;
    } catch (error) {
      console.error(error);
      this.elements.publishProgress.textContent = `Processo interrompido após ${saved} produto(s) salvo(s).`;
      this.onToast(error?.message || String(error), 'error');
    } finally {
      this.busy = false;
      this.render();
    }
  }

  bindIssueNavigation(onOpenProduct) {
    this.elements.publishIssues.addEventListener('click', event => {
      const button = event.target.closest('[data-review-product]');
      if (!button) return;
      this.close();
      onOpenProduct(button.dataset.reviewProduct);
    });
  }
}
