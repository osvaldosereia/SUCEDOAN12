import {
  escapeHtml, money, normalizeSearch, number, productCode, productImage, productKey, productName, text,
} from './core/utils.js';
import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { readJsonFile, upsertText } from './services/github.js';

const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="11">sem foto</text></svg>')}`;
const AUTOMATIC_ORIGINS = new Set(['campanha_automatica', 'reativacao_historico', 'validade']);
const state = {
  loading: false,
  loaded: false,
  rulesFile: null,
  statusFile: null,
  historyFile: null,
  draftRuleId: '',
  simulation: new Map(),
};

function config() {
  try {
    const next = { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}'), githubBranch: 'main' };
    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(next));
    return next;
  } catch {
    return { ...DEFAULT_CONFIG, githubBranch: 'main' };
  }
}

function saveConfig(patch) {
  const next = { ...config(), ...(patch || {}), githubBranch: 'main' };
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(next));
  return next;
}

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  const normalized = text(message);
  if (!region || !normalized) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = normalized;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 7000 : 3800);
}

function products() {
  return window.__adminV2OffersStore?.state?.products
    || window.__adminV2CollectionsModule?.store?.state?.products
    || [];
}

function normalizeRule(rule = {}) {
  return {
    id: text(rule.id) || `regra-${Date.now()}`,
    categoria: text(rule.categoria),
    desconto_percentual: Math.max(1, Math.min(50, number(rule.desconto_percentual) || 1)),
    duracao_dias: Math.max(1, Math.min(365, Math.floor(number(rule.duracao_dias) || 7))),
    quantidade_por_execucao: Math.max(1, Math.min(100, Math.floor(number(rule.quantidade_por_execucao) || 1))),
    status: ['ativa', 'pausada', 'cancelada'].includes(text(rule.status)) ? text(rule.status) : 'ativa',
    encerrar_ofertas_ativas: Boolean(rule.encerrar_ofertas_ativas),
    criado_em: text(rule.criado_em) || new Date().toISOString(),
    atualizado_em: text(rule.atualizado_em) || new Date().toISOString(),
  };
}

function rulesDocument() {
  const raw = state.rulesFile?.data || {};
  return {
    versao: 1,
    ativo: raw.ativo !== false,
    exigir_quantidade_completa: raw.exigir_quantidade_completa !== false,
    timezone: text(raw.timezone) || 'America/Cuiaba',
    atualizado_em: text(raw.atualizado_em),
    regras: (Array.isArray(raw.regras) ? raw.regras : []).map(normalizeRule),
  };
}

function executionState() {
  const raw = state.statusFile?.data || {};
  return {
    ultima_execucao: text(raw.ultima_execucao),
    ultima_execucao_status: text(raw.ultima_execucao_status || 'nunca_executada'),
    ofertas_ativas: Array.isArray(raw.ofertas_ativas) ? raw.ofertas_ativas : [],
    historico_produtos: raw.historico_produtos && typeof raw.historico_produtos === 'object' ? raw.historico_produtos : {},
    execucoes: Array.isArray(raw.execucoes) ? raw.execucoes : [],
  };
}

function historyDocument() {
  const raw = state.historyFile?.data || {};
  return {
    ofertas: Array.isArray(raw.ofertas) ? raw.ofertas : [],
    eventos: Array.isArray(raw.eventos) ? raw.eventos : [],
  };
}

function dateOnly(value) {
  return text(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function dateTime(value) {
  if (!text(value)) return 'Nunca';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' });
}

function ended(value) {
  const raw = text(value);
  if (!raw) return false;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T23:59:59-04:00`) : new Date(raw);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function isActiveProduct(product) {
  const situation = text(product?.situacao || product?.status || 'A').toUpperCase();
  return !['I', 'INATIVO', 'INACTIVE', '0', 'FALSE', 'EXCLUIDO', 'EXCLUÍDO'].includes(situation)
    && product?.ativo !== false && product?.visivel !== false;
}

function productHasCurrentOffer(product) {
  const offer = number(product?.preco_oferta);
  const regular = number(product?.preco);
  return offer > 0 && regular > offer && !ended(product?.validade_oferta);
}

function protectedOffer(product) {
  const origin = text(product?.oferta_origem);
  return productHasCurrentOffer(product) && !AUTOMATIC_ORIGINS.has(origin);
}

function expiredAutomaticProducts() {
  return products().filter(product => AUTOMATIC_ORIGINS.has(text(product.oferta_origem))
    && number(product.preco_oferta) > 0
    && ended(product.validade_oferta));
}

function categoryOptions(selected = '') {
  const categories = [...new Set(products().map(product => text(product.categoria)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return ['<option value="">Selecione…</option>', ...categories.map(category => `<option value="${escapeHtml(category)}" ${category === selected ? 'selected' : ''}>${escapeHtml(category)}</option>`)].join('');
}

function productByRef(ref) {
  const wanted = text(ref);
  return products().find(product => [productKey(product), productCode(product), product.gtin, product.ean].map(text).includes(wanted)) || null;
}

function eligibleForRule(rule) {
  const wanted = normalizeSearch(rule.categoria);
  const execution = executionState();
  return products().filter(product => normalizeSearch(product.categoria) === wanted
    && isActiveProduct(product)
    && number(product.estoque) > 0
    && number(product.preco) > 0
    && !productHasCurrentOffer(product)
    && !protectedOffer(product))
    .sort((a, b) => {
      const aDate = Date.parse(execution.historico_produtos[productKey(a)]?.ultima_oferta_em || 0) || 0;
      const bDate = Date.parse(execution.historico_produtos[productKey(b)]?.ultima_oferta_em || 0) || 0;
      return aDate - bDate || productName(a).localeCompare(productName(b), 'pt-BR');
    });
}

function simulateRules() {
  state.simulation.clear();
  rulesDocument().regras.forEach(rule => state.simulation.set(rule.id, eligibleForRule(rule)));
  render();
  toast('Simulação atualizada sem alterar produtos.', 'success');
}

function activeOfferRows() {
  return executionState().ofertas_ativas
    .map(offer => ({ offer, product: productByRef(offer.produto_key || offer.codigo) }))
    .sort((a, b) => String(a.offer.fim || '').localeCompare(String(b.offer.fim || '')));
}

function ruleCard(rule) {
  const simulated = state.simulation.get(rule.id) || [];
  const statusKind = rule.status === 'ativa' ? 'success' : rule.status === 'cancelada' ? 'danger' : 'warning';
  const examples = simulated.slice(0, 4).map(product => productName(product)).join(' · ');
  return `<article class="campaign-rule-card ${rule.status}">
    <div class="campaign-rule-head"><div><span class="eyebrow">${escapeHtml(rule.categoria || 'Sem categoria')}</span><h4>${rule.desconto_percentual}% por ${rule.duracao_dias} dia(s)</h4><small>${rule.quantidade_por_execucao} produto(s) por execução</small></div><span class="badge ${statusKind}">${escapeHtml(rule.status)}</span></div>
    <div class="campaign-rule-estimate"><strong>${simulated.length}</strong><span>elegíveis agora</span></div>
    <p>${escapeHtml(examples || 'Execute a simulação para ver os próximos produtos.')}</p>
    <div class="campaign-rule-actions"><button class="button secondary compact" type="button" data-campaign-edit="${escapeHtml(rule.id)}">Editar</button><button class="button secondary compact" type="button" data-campaign-toggle="${escapeHtml(rule.id)}">${rule.status === 'ativa' ? 'Pausar' : 'Ativar'}</button><button class="button ghost compact" type="button" data-campaign-cancel="${escapeHtml(rule.id)}">Cancelar regra</button></div>
  </article>`;
}

function offerCard(row, expired = false) {
  const offer = row.offer || row;
  const product = row.product || productByRef(offer.produto_key || offer.codigo);
  const image = productImage(product || {}) || PLACEHOLDER;
  return `<article class="campaign-offer-card ${expired ? 'expired' : ''}"><img src="${escapeHtml(image)}" onerror="this.src='${PLACEHOLDER}'" alt=""><div><strong>${escapeHtml(product ? productName(product) : offer.nome || offer.codigo || offer.produto_key)}</strong><small>${escapeHtml(offer.categoria || product?.categoria || 'Sem categoria')} · ${money(offer.preco_normal || product?.preco)} → ${money(offer.preco_oferta || product?.preco_oferta)}</small><small>${expired ? 'Vencida; aguardando processamento' : `Até ${escapeHtml(dateOnly(offer.fim || product?.validade_oferta) || 'sem data')}`}</small></div><span class="badge ${expired ? 'danger' : 'success'}">${expired ? 'Limpar' : 'Ativa'}</span></article>`;
}

function editorRule() {
  const rules = rulesDocument().regras;
  return rules.find(rule => rule.id === state.draftRuleId) || null;
}

function ruleEditorHtml() {
  const rule = editorRule() || normalizeRule({ id: '', desconto_percentual: 10, duracao_dias: 3, quantidade_por_execucao: 2, status: 'ativa' });
  return `<div class="campaign-editor-head"><div><h3>${state.draftRuleId ? 'Editar regra' : 'Nova regra'}</h3><p>Escolha a categoria, desconto, duração e quantidade da rotação.</p></div>${state.draftRuleId ? '<button class="button ghost compact" type="button" data-campaign-new>Nova regra</button>' : ''}</div>
    <div class="campaign-rule-form">
      <label>Categoria<select id="campaignRuleCategory">${categoryOptions(rule.categoria)}</select></label>
      <label>Desconto (%)<input id="campaignRuleDiscount" type="number" min="1" max="50" step="0.01" value="${escapeHtml(rule.desconto_percentual)}"></label>
      <label>Duração (dias)<input id="campaignRuleDuration" type="number" min="1" max="365" step="1" value="${escapeHtml(rule.duracao_dias)}"></label>
      <label>Produtos por execução<input id="campaignRuleQuantity" type="number" min="1" max="100" step="1" value="${escapeHtml(rule.quantidade_por_execucao)}"></label>
      <label>Status<select id="campaignRuleStatus"><option value="ativa" ${rule.status === 'ativa' ? 'selected' : ''}>Ativa</option><option value="pausada" ${rule.status === 'pausada' ? 'selected' : ''}>Pausada</option><option value="cancelada" ${rule.status === 'cancelada' ? 'selected' : ''}>Cancelada</option></select></label>
      <label class="campaign-check"><input id="campaignRuleCloseActive" type="checkbox" ${rule.encerrar_ofertas_ativas ? 'checked' : ''}><span><strong>Encerrar ofertas ativas desta regra</strong><small>Use ao cancelar ou substituir uma campanha.</small></span></label>
      <div class="campaign-editor-actions"><button class="button primary" type="button" data-campaign-save-rule>${state.draftRuleId ? 'Atualizar regra' : 'Adicionar regra'}</button></div>
    </div>`;
}

function canWriteRules() {
  const cfg = config();
  const mainConfirmed = Boolean(document.getElementById('campaignMainConfirm')?.checked);
  return cfg.writeMode && cfg.campaignOfferWriteMode && text(cfg.githubToken)
    && (text(cfg.githubBranch) !== 'main' || mainConfirmed);
}

function safetyText() {
  const cfg = config();
  if (!cfg.writeMode || !cfg.campaignOfferWriteMode) return 'Ative a gravação geral e a trava de campanhas nas Configurações.';
  if (!text(cfg.githubToken)) return 'Configure o token do GitHub.';
  if (text(cfg.githubBranch) === 'main' && !document.getElementById('campaignMainConfirm')?.checked) return 'A branch main está protegida. Confirme explicitamente ou use a branch de homologação.';
  return `Alterações serão feitas somente na branch ${cfg.githubBranch}.`;
}

function render() {
  const panel = document.getElementById('campaignOffersPanel');
  if (!panel) return;
  const rules = rulesDocument();
  const execution = executionState();
  const expired = expiredAutomaticProducts();
  const active = activeOfferRows();
  const history = historyDocument();
  const cfg = config();
  panel.innerHTML = `<div class="campaign-toolbar">
      <div><span class="eyebrow">Automação restaurada</span><h3>Campanhas automáticas por regras</h3><p>Seleciona produtos por categoria, aplica desconto por alguns dias, alterna os produtos e restaura o preço normal no encerramento.</p></div>
      <div class="campaign-toolbar-actions"><button class="button secondary" type="button" data-campaign-reload>Atualizar dados</button><button class="button secondary" type="button" data-campaign-simulate>Simular</button><button class="button primary" type="button" data-campaign-run>Processar agora</button></div>
    </div>
    <div class="attention-grid campaign-metrics">
      <article class="metric-card info"><strong>${rules.regras.length}</strong><span>Regras</span><small>${rules.regras.filter(rule => rule.status === 'ativa').length} ativas</small></article>
      <article class="metric-card success"><strong>${active.length}</strong><span>Ofertas ativas</span><small>Origem campanha automática</small></article>
      <article class="metric-card ${expired.length ? 'danger' : 'success'}"><strong>${expired.length}</strong><span>Vencidas aguardando limpeza</span><small>Serão removidas no próximo processamento</small></article>
      <article class="metric-card ${execution.ultima_execucao_status === 'sucesso' ? 'success' : 'warning'}"><strong>${escapeHtml(execution.ultima_execucao_status)}</strong><span>Última execução</span><small>${escapeHtml(dateTime(execution.ultima_execucao))}</small></article>
    </div>
    <section class="campaign-control-card"><div class="campaign-control-grid"><label class="switch-row"><span><strong>Automação ativa</strong><small>Permite criar novas ofertas nas execuções.</small></span><input id="campaignEnabled" type="checkbox" ${rules.ativo ? 'checked' : ''}></label><label class="switch-row"><span><strong>Exigir quantidade completa</strong><small>Se faltar produto elegível, a regra aguarda a próxima execução.</small></span><input id="campaignRequireComplete" type="checkbox" ${rules.exigir_quantidade_completa ? 'checked' : ''}></label><label>Fuso horário<input id="campaignTimezone" value="${escapeHtml(rules.timezone)}"></label><label>Branch da execução<input value="${escapeHtml(cfg.githubBranch)}" disabled></label></div><div class="campaign-main-warning ${cfg.githubBranch === 'main' ? '' : 'safe'}"><label><input id="campaignMainConfirm" type="checkbox" ${cfg.githubBranch === 'main' ? '' : 'checked disabled'}><span><strong>${cfg.githubBranch === 'main' ? 'Confirmo alterações na main' : 'Branch de homologação'}</strong><small>${cfg.githubBranch === 'main' ? 'Sem esta confirmação, salvar e executar ficam bloqueados.' : `Ambiente seguro: ${escapeHtml(cfg.githubBranch)}`}</small></span></label></div><div class="campaign-control-actions"><span id="campaignSafety">${escapeHtml(safetyText())}</span><button class="button secondary" type="button" data-campaign-save-settings>Salvar configuração geral</button></div></section>
    <div class="campaign-layout"><section class="campaign-column"><div id="campaignRuleEditor" class="campaign-rule-editor">${ruleEditorHtml()}</div><div class="campaign-section-head"><div><h3>Regras cadastradas</h3><p>As regras antigas foram recuperadas de ${escapeHtml(cfg.offersRulesPath)}.</p></div></div><div class="campaign-rules">${rules.regras.length ? rules.regras.map(ruleCard).join('') : '<div class="empty-state">Nenhuma regra cadastrada.</div>'}</div></section><section class="campaign-column"><div class="campaign-section-head"><div><h3>Ofertas automáticas ativas</h3><p>A automação preserva ofertas manuais e alterna os produtos pelo histórico.</p></div><span class="badge info">${active.length}</span></div><div class="campaign-offers-list">${active.length ? active.slice(0, 60).map(row => offerCard(row)).join('') : '<div class="empty-state">Nenhuma oferta automática ativa registrada.</div>'}</div>${expired.length ? `<div class="campaign-section-head danger-head"><div><h3>Vencidas aguardando limpeza</h3><p>Estas ofertas ainda estão no Firebase porque o processamento ficou sem execução.</p></div><span class="badge danger">${expired.length}</span></div><div class="campaign-offers-list">${expired.slice(0, 60).map(product => offerCard({ ...product, produto_key: productKey(product), fim: product.validade_oferta }, true)).join('')}</div>` : ''}</section></div>
    <section class="campaign-history"><div class="campaign-section-head"><div><h3>Histórico e execuções</h3><p>${history.ofertas.length} registros históricos · ${execution.execucoes.length} execuções registradas.</p></div></div><div class="campaign-executions">${execution.execucoes.slice(-12).reverse().map(item => `<div><strong>${escapeHtml(dateTime(item.executado_em))}</strong><span>${escapeHtml(item.origem || 'github')} · ${escapeHtml(item.modo || 'completo')}</span><small>${escapeHtml(JSON.stringify(item.resumo || {}))}</small></div>`).join('') || '<div class="empty-state">Nenhuma execução registrada.</div>'}</div></section>`;
  panel.querySelectorAll('[data-campaign-run], [data-campaign-save-settings]').forEach(button => { button.disabled = !canWriteRules(); });
}

async function loadData() {
  if (state.loading) return;
  state.loading = true;
  const cfg = config();
  try {
    const [rulesFile, statusFile, historyFile] = await Promise.all([
      readJsonFile(cfg, cfg.offersRulesPath).catch(() => null),
      readJsonFile(cfg, cfg.offersStatePath).catch(() => null),
      readJsonFile(cfg, cfg.offersHistoryPath).catch(() => null),
    ]);
    state.rulesFile = rulesFile || { data: { versao: 1, ativo: true, exigir_quantidade_completa: true, timezone: 'America/Cuiaba', regras: [] } };
    state.statusFile = statusFile || { data: {} };
    state.historyFile = historyFile || { data: {} };
    state.loaded = true;
    simulateRules();
  } catch (error) {
    toast(error?.message || String(error), 'error');
    render();
  } finally {
    state.loading = false;
  }
}

function formRule() {
  const existing = editorRule();
  return normalizeRule({
    ...(existing || {}),
    id: existing?.id || `regra-${Date.now()}`,
    categoria: document.getElementById('campaignRuleCategory')?.value,
    desconto_percentual: document.getElementById('campaignRuleDiscount')?.value,
    duracao_dias: document.getElementById('campaignRuleDuration')?.value,
    quantidade_por_execucao: document.getElementById('campaignRuleQuantity')?.value,
    status: document.getElementById('campaignRuleStatus')?.value,
    encerrar_ofertas_ativas: document.getElementById('campaignRuleCloseActive')?.checked,
    atualizado_em: new Date().toISOString(),
  });
}

function saveRuleLocal() {
  const rule = formRule();
  if (!rule.categoria) return toast('Selecione a categoria da regra.', 'error');
  const doc = rulesDocument();
  const index = doc.regras.findIndex(row => row.id === rule.id);
  if (index >= 0) doc.regras[index] = rule;
  else doc.regras.push(rule);
  state.rulesFile = { ...(state.rulesFile || {}), data: doc };
  state.draftRuleId = '';
  simulateRules();
  toast('Regra preparada. Salve a configuração geral para publicar no GitHub.', 'success');
}

function mutateRule(id, mutation) {
  const doc = rulesDocument();
  const rule = doc.regras.find(row => row.id === id);
  if (!rule) return;
  mutation(rule);
  rule.atualizado_em = new Date().toISOString();
  state.rulesFile = { ...(state.rulesFile || {}), data: doc };
  simulateRules();
}

async function saveRulesFile() {
  if (!canWriteRules()) return toast(safetyText(), 'error');
  const cfg = config();
  const doc = rulesDocument();
  doc.ativo = Boolean(document.getElementById('campaignEnabled')?.checked);
  doc.exigir_quantidade_completa = Boolean(document.getElementById('campaignRequireComplete')?.checked);
  doc.timezone = text(document.getElementById('campaignTimezone')?.value) || 'America/Cuiaba';
  doc.atualizado_em = new Date().toISOString();
  const result = await upsertText(cfg, cfg.offersRulesPath, JSON.stringify(doc, null, 2), 'Atualiza regras de ofertas automáticas pelo Admin V2');
  state.rulesFile = { ...state.rulesFile, data: doc, sha: result.sha || state.rulesFile?.sha };
  toast(result.skipped ? 'As regras já estavam atualizadas.' : 'Regras publicadas na branch configurada.', 'success');
  render();
}

async function dispatchWorkflow() {
  if (!canWriteRules()) return toast(safetyText(), 'error');
  const cfg = config();
  const workflow = text(cfg.offersWorkflowFile || '.github/workflows/processar-ofertas.yml').split('/').pop();
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.githubOwner)}/${encodeURIComponent(cfg.githubRepo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${text(cfg.githubToken)}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: cfg.githubBranch }),
  });
  if (!response.ok) throw new Error(`GitHub não iniciou o workflow (${response.status}): ${(await response.text().catch(() => '')).slice(0, 220)}`);
  toast(`Processamento iniciado na branch ${cfg.githubBranch}. Atualize o status após a execução.`, 'success');
}

function installSettings() {
  const grid = document.querySelector('[data-view="settings"] .settings-grid');
  if (!grid || document.getElementById('campaignOfferSafetySettings')) return;
  const cfg = config();
  const html = `<section class="panel span-all-settings" id="campaignOfferSafetySettings"><div class="panel-header"><div><h2>Segurança das campanhas automáticas</h2><p>Trava independente para editar regras e disparar o workflow de rotação.</p></div><span class="badge ${cfg.campaignOfferWriteMode ? 'warning' : 'success'}" id="campaignOfferSettingsStatus">${cfg.campaignOfferWriteMode ? 'Habilitada' : 'Bloqueada'}</span></div><div class="form-stack"><label class="switch-row"><span><strong>Permitir campanhas automáticas</strong><small>Também exige a gravação geral, token GitHub e confirmação da branch main.</small></span><input id="campaignOfferWriteModeSetting" type="checkbox" ${cfg.campaignOfferWriteMode ? 'checked' : ''}></label></div></section>`;
  const danger = grid.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentHTML('beforebegin', html);
  else grid.insertAdjacentHTML('beforeend', html);
  document.getElementById('campaignOfferWriteModeSetting')?.addEventListener('change', event => {
    const next = saveConfig({ campaignOfferWriteMode: event.target.checked });
    const badge = document.getElementById('campaignOfferSettingsStatus');
    if (badge) {
      badge.className = `badge ${next.campaignOfferWriteMode ? 'warning' : 'success'}`;
      badge.textContent = next.campaignOfferWriteMode ? 'Habilitada' : 'Bloqueada';
    }
    render();
  });
}

function installStyles() {
  if (document.getElementById('campaignOffersStyles')) return;
  const style = document.createElement('style');
  style.id = 'campaignOffersStyles';
  style.textContent = `
    .campaign-offers-panel[hidden]{display:none!important}.campaign-offers-panel{padding:15px 16px 18px}.campaign-toolbar{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:2px 0 13px}.campaign-toolbar h3{margin:3px 0 0;font-size:17px}.campaign-toolbar p{margin:5px 0 0;color:var(--muted);font-size:10px;line-height:1.45}.campaign-toolbar-actions{display:flex;gap:6px;flex-wrap:wrap}.campaign-metrics{margin-bottom:12px}.campaign-control-card{padding:12px;border:1px solid var(--line);border-radius:12px;background:#fafbf9}.campaign-control-grid{display:grid;grid-template-columns:1fr 1fr minmax(170px,.7fr) minmax(180px,.8fr);gap:9px}.campaign-control-grid>label:not(.switch-row){display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:9px;font-weight:850}.campaign-control-grid input{width:100%;min-height:40px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:9px;background:#fff}.campaign-main-warning{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;padding:10px;border:1px solid #e4bc67;border-radius:10px;background:#fffaf0}.campaign-main-warning.safe{border-color:#bcdcc9;background:var(--success-soft)}.campaign-main-warning label{display:flex;align-items:flex-start;gap:8px}.campaign-main-warning strong,.campaign-main-warning small{display:block}.campaign-main-warning strong{font-size:10px}.campaign-main-warning small{margin-top:3px;color:var(--muted);font-size:8px}.campaign-control-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:9px}.campaign-control-actions span{margin-right:auto;color:var(--muted);font-size:9px}.campaign-layout{display:grid;grid-template-columns:minmax(420px,1fr) minmax(420px,1fr);gap:12px;margin-top:12px}.campaign-column{min-width:0;border:1px solid var(--line);border-radius:12px;background:#fafbf9;overflow:hidden}.campaign-section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:12px 13px;border-bottom:1px solid var(--line);background:#fff}.campaign-section-head h3{margin:0;font-size:13px}.campaign-section-head p{margin:4px 0 0;color:var(--muted);font-size:9px}.campaign-section-head.danger-head{border-top:1px solid #efc9c5;background:var(--danger-soft)}.campaign-rule-editor{padding:12px;border-bottom:1px solid var(--line);background:#fffdf7}.campaign-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.campaign-editor-head h3{margin:0;font-size:13px}.campaign-editor-head p{margin:4px 0 0;color:var(--muted);font-size:9px}.campaign-rule-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.campaign-rule-form>label:not(.campaign-check){display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:9px;font-weight:850}.campaign-rule-form input,.campaign-rule-form select{width:100%;min-height:39px;padding:8px 9px;border:1px solid var(--line-strong);border-radius:9px;background:#fff;font-size:10px}.campaign-check{grid-column:1/-1;display:flex;align-items:flex-start;gap:8px;padding:9px;border:1px solid var(--line);border-radius:9px;background:#fff}.campaign-check input{width:17px;min-height:17px}.campaign-check strong,.campaign-check small{display:block}.campaign-check strong{font-size:9px}.campaign-check small{margin-top:3px;color:var(--muted);font-size:8px}.campaign-editor-actions{grid-column:1/-1;display:flex;justify-content:flex-end}.campaign-rules{display:grid;gap:7px;max-height:650px;overflow:auto;padding:10px}.campaign-rule-card{padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}.campaign-rule-card.cancelada{opacity:.7}.campaign-rule-head{display:flex;justify-content:space-between;gap:8px}.campaign-rule-head h4{margin:3px 0 0;font-size:12px}.campaign-rule-head small{display:block;margin-top:3px;color:var(--muted);font-size:8px}.campaign-rule-estimate{display:flex;align-items:end;gap:5px;margin-top:8px}.campaign-rule-estimate strong{font-size:20px}.campaign-rule-estimate span{padding-bottom:2px;color:var(--muted);font-size:8px}.campaign-rule-card p{margin:5px 0 0;color:var(--muted);font-size:8px;line-height:1.4}.campaign-rule-actions{display:flex;justify-content:flex-end;gap:5px;margin-top:8px;flex-wrap:wrap}.campaign-offers-list{display:grid;gap:6px;max-height:430px;overflow:auto;padding:10px}.campaign-offer-card{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px;border:1px solid var(--line);border-radius:9px;background:#fff}.campaign-offer-card.expired{border-color:#efc9c5;background:var(--danger-soft)}.campaign-offer-card img{width:52px;height:52px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff;padding:3px}.campaign-offer-card strong,.campaign-offer-card small{display:block}.campaign-offer-card strong{font-size:10px}.campaign-offer-card small{margin-top:3px;color:var(--muted);font-size:8px}.campaign-history{margin-top:12px;border:1px solid var(--line);border-radius:12px;background:#fafbf9;overflow:hidden}.campaign-executions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:10px}.campaign-executions>div{padding:9px;border:1px solid var(--line);border-radius:9px;background:#fff}.campaign-executions strong,.campaign-executions span,.campaign-executions small{display:block}.campaign-executions strong{font-size:9px}.campaign-executions span{margin-top:3px;color:var(--info);font-size:8px}.campaign-executions small{margin-top:4px;color:var(--muted);font-size:7px;overflow-wrap:anywhere}@media(max-width:1050px){.campaign-layout{grid-template-columns:1fr}.campaign-control-grid{grid-template-columns:1fr 1fr}.campaign-executions{grid-template-columns:1fr 1fr}}@media(max-width:760px){.campaign-offers-panel{padding:10px}.campaign-toolbar{flex-direction:column}.campaign-toolbar-actions{width:100%}.campaign-toolbar-actions .button{flex:1}.campaign-control-grid,.campaign-rule-form,.campaign-executions{grid-template-columns:1fr}.campaign-main-warning,.campaign-control-actions{align-items:flex-start;flex-direction:column}.campaign-layout{grid-template-columns:1fr}.campaign-check,.campaign-editor-actions{grid-column:auto}}
  `;
  document.head.appendChild(style);
}

function installPanel() {
  const workspace = document.getElementById('offersWorkspace');
  const tabs = document.getElementById('offerManagerTabs');
  if (!workspace || !tabs) return false;
  if (!tabs.querySelector('[data-offer-tab="campaign"]')) tabs.insertAdjacentHTML('beforeend', '<button type="button" data-offer-tab="campaign">Campanhas por regras</button>');
  if (!document.getElementById('campaignOffersPanel')) workspace.insertAdjacentHTML('beforeend', '<section class="campaign-offers-panel" id="campaignOffersPanel" hidden></section>');
  return true;
}

function bind() {
  if (document.documentElement.dataset.campaignOffersBound === '1') return;
  document.documentElement.dataset.campaignOffersBound = '1';
  document.addEventListener('click', event => {
    const tab = event.target.closest('#offerManagerTabs [data-offer-tab]');
    if (tab) {
      const campaign = tab.dataset.offerTab === 'campaign';
      const panel = document.getElementById('campaignOffersPanel');
      if (!campaign) {
        if (panel) panel.hidden = true;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelectorAll('#offerManagerTabs button').forEach(button => button.classList.toggle('active', button === tab));
      document.querySelectorAll('#offersWorkspace .offer-auto-panel').forEach(node => { node.hidden = true; });
      const manual = document.getElementById('manualOffersPanel');
      if (manual) manual.hidden = true;
      if (panel) panel.hidden = false;
      if (!state.loaded) loadData(); else render();
      return;
    }
    const action = event.target.closest('[data-campaign-reload], [data-campaign-simulate], [data-campaign-run], [data-campaign-save-settings], [data-campaign-save-rule], [data-campaign-new], [data-campaign-edit], [data-campaign-toggle], [data-campaign-cancel], [data-campaign-use-test-branch]');
    if (!action) return;
    if (action.matches('[data-campaign-reload]')) loadData();
    if (action.matches('[data-campaign-simulate]')) simulateRules();
    if (action.matches('[data-campaign-run]')) dispatchWorkflow().catch(error => toast(error?.message || String(error), 'error'));
    if (action.matches('[data-campaign-save-settings]')) saveRulesFile().catch(error => toast(error?.message || String(error), 'error'));
    if (action.matches('[data-campaign-save-rule]')) saveRuleLocal();
    if (action.matches('[data-campaign-new]')) { state.draftRuleId = ''; render(); }
    if (action.matches('[data-campaign-edit]')) { state.draftRuleId = action.dataset.campaignEdit; render(); }
    if (action.matches('[data-campaign-toggle]')) mutateRule(action.dataset.campaignToggle, rule => { rule.status = rule.status === 'ativa' ? 'pausada' : 'ativa'; rule.encerrar_ofertas_ativas = false; });
    if (action.matches('[data-campaign-cancel]')) mutateRule(action.dataset.campaignCancel, rule => { rule.status = 'cancelada'; rule.encerrar_ofertas_ativas = true; });
    if (action.matches('[data-campaign-use-test-branch]')) { saveConfig({ githubBranch: 'main' }); toast('Admin oficial fixado na main.', 'success'); render(); }
  }, true);
  document.addEventListener('change', event => {
    if (event.target.id === 'campaignMainConfirm') render();
  });
}

function start() {
  installStyles();
  installSettings();
  bind();
  if (!installPanel()) return setTimeout(start, 120);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
