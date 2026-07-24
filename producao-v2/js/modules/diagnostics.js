import { productsCsv, sanitizedConfig } from '../core/diagnostics.js';
import { escapeHtml } from '../core/utils.js';
import { runSystemDiagnostics } from '../services/diagnostics.js';

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export class DiagnosticsModule {
  constructor({ elements, onToast, reloadConfig }) {
    this.elements = elements;
    this.onToast = onToast;
    this.reloadConfig = reloadConfig;
    this.result = null;
    this.busy = false;
    this.bind();
    this.render();
  }

  bind() {
    this.elements.diagnosticRun.addEventListener('click', () => this.run());
    this.elements.diagnosticExport.addEventListener('click', () => this.exportBackup());
    this.elements.diagnosticCsv.addEventListener('click', () => this.exportCsv());
  }

  async run() {
    if (this.busy) return;
    this.busy = true;
    this.elements.diagnosticRun.disabled = true;
    this.elements.diagnosticRun.textContent = 'Verificando…';
    this.elements.diagnosticStatus.textContent = 'Consultando Firebase e arquivos públicos…';
    try {
      this.result = await runSystemDiagnostics(this.reloadConfig());
      this.render();
      const errors = this.result.audit.issues.filter(issue => issue.level === 'error').length;
      this.onToast(errors ? `Diagnóstico concluído com ${errors} erro(s).` : 'Diagnóstico concluído sem erro crítico.', errors ? 'error' : 'success');
    } catch (error) {
      this.elements.diagnosticStatus.textContent = error?.message || String(error);
      this.onToast(error?.message || String(error), 'error');
    } finally {
      this.busy = false;
      this.elements.diagnosticRun.disabled = false;
      this.elements.diagnosticRun.textContent = 'Executar diagnóstico';
    }
  }

  render() {
    const result = this.result;
    this.elements.diagnosticExport.disabled = !result;
    this.elements.diagnosticCsv.disabled = !result;
    if (!result) {
      this.elements.diagnosticMetrics.innerHTML = '';
      this.elements.diagnosticSources.innerHTML = '<div class="empty-state">Execute o diagnóstico para consultar as fontes reais.</div>';
      this.elements.diagnosticIssues.innerHTML = '';
      this.elements.diagnosticStatus.textContent = 'Nenhuma consulta executada nesta sessão.';
      return;
    }
    const metrics = result.audit.metrics;
    this.elements.diagnosticMetrics.innerHTML = [
      ['info', metrics.firebaseProducts, 'Firebase', `${metrics.publicProducts} públicos`],
      [metrics.catalogErrors ? 'danger' : 'success', metrics.catalogErrors, 'Erros de catálogo', `${metrics.catalogWarnings} avisos`],
      [metrics.collectionErrors ? 'danger' : 'success', metrics.collectionErrors, 'Erros em coleções', `${metrics.baskets} cestas · ${metrics.kits} kits`],
      [metrics.expired ? 'danger' : 'success', metrics.expired, 'Vencidos', `${metrics.next30} nos próximos 30 dias`],
    ].map(([kind, value, label, help]) => `<article class="metric-card ${kind}"><strong>${value}</strong><span>${label}</span><small>${help}</small></article>`).join('');
    this.elements.diagnosticSources.innerHTML = result.sources.map(source => `<div class="diagnostic-source"><div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.ok ? `${source.durationMs} ms` : source.error)}</small></div><span class="badge ${source.ok ? 'success' : 'danger'}">${source.ok ? 'OK' : 'Falha'}</span></div>`).join('')
      + Object.entries(result.integrations).map(([key, integration]) => `<div class="diagnostic-source"><div><strong>${escapeHtml(key === 'makeOrders' ? 'Make · Pedidos' : key === 'makeAi' ? 'Make · IA' : 'Bling')}</strong><small>${escapeHtml(integration.message)}</small></div><span class="badge ${integration.configured && integration.validUrl ? 'warning' : 'neutral'}">${integration.configured ? 'Configurada' : 'Não configurada'}</span></div>`).join('');
    this.elements.diagnosticIssues.innerHTML = result.audit.issues.length ? result.audit.issues.map(issue => `<div class="diagnostic-issue ${issue.level}"><strong>${escapeHtml(issue.area)}</strong><span>${escapeHtml(issue.message)}</span></div>`).join('') : '<div class="diagnostic-ready">Nenhuma inconsistência detectada pelas regras atuais.</div>';
    this.elements.diagnosticStatus.textContent = `Última execução: ${new Date(result.generatedAt).toLocaleString('pt-BR')}`;
  }

  exportBackup() {
    if (!this.result) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      purpose: 'Backup de diagnóstico do Admin V2 Dona Antônia',
      config: sanitizedConfig(this.reloadConfig()),
      products: this.result.products,
      baskets: this.result.collections.baskets,
      kits: this.result.collections.kits,
      kitQueue: this.result.collections.queue,
      publicProducts: this.result.publicProducts,
      catalogVersion: this.result.catalogVersion,
      audit: this.result.audit,
      integrations: this.result.integrations,
    };
    download(`backup-admin-v2-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    this.onToast('Backup JSON gerado sem incluir o token GitHub.', 'success');
  }

  exportCsv() {
    if (!this.result) return;
    download(`produtos-admin-v2-${new Date().toISOString().slice(0, 10)}.csv`, productsCsv(this.result.products), 'text/csv;charset=utf-8');
    this.onToast('Planilha CSV dos produtos gerada.', 'success');
  }
}
