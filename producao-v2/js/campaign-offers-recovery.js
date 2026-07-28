import {
  escapeHtml, money, normalizeSearch, number, productCode, productImage, productKey, productName, text,
} from './core/utils.js';
import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { readJsonFile, upsertText } from './services/github.js';

const MAIN_CONFIRM_KEY = 'da_admin_v2_campaign_main_confirm';
const AUTOMATIC_ORIGINS = new Set(['campanha_automatica', 'reativacao_historico']);
const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="11">sem foto</text></svg>')}`;

const state = {
  loading: false,
  loadedBranch: '',
  rulesFile: null,
  rulesSourceBranch: '',
  statusFile: null,
  statusSourceBranch: '',
  historyFile: null,
  historySourceBranch: '',
  historyLoaded: false,
  rulesDirty: false,
  draftRuleId: '',
  simulation: new Map(),
  warnings: [],
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
  if ([...region.querySelectorAll('.toast')].some(node => node.textContent === normalized)) return;
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

function withTimeout(promise, timeout, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} excedeu ${Math.round(timeout / 1000)} segundos.`)), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function readWithMainFallback(cfg, path, label) {
  const primary = await withTimeout(readJsonFile(cfg, path), 12000, label).catch(error => ({ __error: error }));
  if (primary && !primary.__error) return { file: primary, sourceBranch: cfg.githubBranch, warning: '' };
  if (cfg.githubBranch !== 'main') {
    const fallbackConfig = { ...cfg, githubBranch: 'main' };
    const fallback = await withTimeout(readJsonFile(fallbackConfig, path), 12000, `${label} na main`).catch(error => ({ __error: error }));
    if (fallback && !fallback.__error) {
      return {
        file: fallback,
        sourceBranch: 'main',
        warning: `${label} não foi encontrado em ${cfg.githubBranch}; recuperado da main.`,
      };
    }
  }
  const error = primary?.__error;
  return { file: null, sourceBranch: cfg.githubBranch, warning: error?.message || `${label} não encontrado.` };
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
  const sourceRules = (Array.isArray(raw.regras) ? raw.regras : []).map(normalizeRule);
  const visibleRules = sourceRules.filter(rule => rule.status !== 'cancelada' && rule.encerrar_ofertas_ativas !== true);
  const cancelledFromRules = sourceRules
    .filter(rule => rule.status === 'cancelada' || rule.encerrar_ofertas_ativas === true)
    .map(rule => ({ id: rule.id, categoria: rule.categoria, cancelado_em: rule.atualizado_em || new Date().toISOString() }));
  return {
    versao: 1,
    ativo: raw.ativo !== false,
    exigir_quantidade_completa: raw.exigir_quantidade_completa !== false,
    timezone: text(raw.timezone) || 'America/Cuiaba',
    atualizado_em: text(raw.atualizado_em),
    regras: visibleRules,
    cancelamentos_regras: [
      ...(Array.isArray(raw.cancelamentos_regras) ? raw.cancelamentos_regras : []),
      ...cancelledFromRules,
    ].filter(item => text(item?.id || item?.regra_id)),
  };
}

function executionState() {
  const raw = state.statusFile?.data || {};
  return {
    versao: Math.max(2, number(raw.versao) || 2),
    ultima_execucao: text(raw.ultima_execucao),
    ultima_execucao_status: text(raw.ultima_execucao_status || 'nunca_executada'),
    ofertas_ativas: Array.isArray(raw.ofertas_ativas) ? raw.ofertas_ativas : [],
    historico_produtos: raw.historico_produtos && typeof raw.historico_produtos === 'object' ? raw.historico_produtos : {},
    solicitacoes_reativacao: Array.isArray(raw.solicitacoes_reativacao) ? raw.solicitacoes_reativacao : [],
    reativacoes: Array.isArray(raw.reativacoes) ? raw.reativacoes : [],
    execucoes: Array.isArray(raw.execucoes) ? raw.execucoes : [],
  };
}

function historyDocument() {
  const raw = state.historyFile?.data || {};
  return {
    versao: 1,
    atualizado_em: text(raw.atualizado_em),
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
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T23:59:59-04:00`) : new Date(raw);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now();
}

function isActiveProduct(product) {
  const status = text(product?.situacao || product?.status || 'A').toUpperCase();
  return !['I', 'INATIVO', 'INACTIVE', '0', 'FALSE', 'EXCLUIDO', 'EXCLUÍDO'].includes(status)
    && product?.ativo !== false && product?.visivel !== false;
}

function currentOffer(product) {
  return number(product?.preco_oferta) > 0
    && number(product?.preco) > number(product?.preco_oferta)
    && !ended(product?.validade_oferta);
}

function isCampaignOffer(product) {
  return AUTOMATIC_ORIGINS.has(text(product?.oferta_origem));
}

function protectedOffer(product) {
  return currentOffer(product) && !isCampaignOffer(product);
}

function automaticActiveProducts() {
  return products().filter(product => isCampaignOffer(product) && currentOffer(product));
}

function automaticExpiredProducts() {
  return products().filter(product => isCampaignOffer(product)
    && number(product.preco_oferta) > 0
    && ended(product.validade_oferta));
}

function cancelledRuleIds() {
  return new Set(rulesDocument().cancelamentos_regras
    .map(item => text(item.id || item.regra_id))
    .filter(Boolean));
}

function isPendingCancellationOffer(offer, product) {
  const ruleId = text(offer?.regra_id || product?.oferta_regra_id);
  return Boolean(ruleId && cancelledRuleIds().has(ruleId));
}

function offerSnapshot(product) {
  const regular = number(product.preco);
  const offer = number(product.preco_oferta);
  return {
    produto_key: productKey(product),
    codigo: productCode(product),
    nome: productName(product),
    categoria: text(product.categoria),
    origem: text(product.oferta_origem || 'campanha_automatica'),
    regra_id: text(product.oferta_regra_id),
    desconto_percentual: regular > 0 && offer > 0 ? Math.round((1 - offer / regular) * 10000) / 100 : 0,
    preco_normal: regular,
    preco_oferta: offer,
    inicio: text(product.data_inicio_oferta),
    fim: text(product.validade_oferta),
  };
}

function stateOnlyOffers() {
  const activeRefs = new Set(automaticActiveProducts().flatMap(product => [productKey(product), productCode(product)].map(text).filter(Boolean)));
  return executionState().ofertas_ativas.filter(offer => {
    const refs = [offer.produto_key, offer.codigo].map(text).filter(Boolean);
    return refs.length && !refs.some(ref => activeRefs.has(ref));
  });
}

function productByRef(ref) {
  const wanted = text(ref);
  return products().find(product => [productKey(product), productCode(product), product.gtin, product.ean].map(text).includes(wanted)) || null;
}

function categoryOptions(selected = '') {
  const categories = [...new Set(products().map(product => text(product.categoria)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return ['<option value="">Selecione…</option>', ...categories.map(category => `<option value="${escapeHtml(category)}" ${category === selected ? 'selected' : ''}>${escapeHtml(category)}</option>`)].join('');
}

function eligibleForRule(rule) {
  const wanted = normalizeSearch(rule.categoria);
  const execution = executionState();
  return products().filter(product => normalizeSearch(product.categoria) === wanted
    && isActiveProduct(product)
    && number(product.estoque) > 0
    && number(product.preco) > 0
    && !ended(product.validade)
    && !currentOffer(product)
    && !protectedOffer(product))
    .sort((a, b) => {
      const aDate = Date.parse(execution.historico_produtos[productKey(a)]?.ultima_oferta_em || 0) || 0;
      const bDate = Date.parse(execution.historico_produtos[productKey(b)]?.ultima_oferta_em || 0) || 0;
      return aDate - bDate || productName(a).localeCompare(productName(b), 'pt-BR');
    });
}

function simulateRules({ notify = true } = {}) {
  state.simulation.clear();
  rulesDocument().regras.forEach(rule => state.simulation.set(rule.id, eligibleForRule(rule)));
  render();
  if (notify) toast('Simulação atualizada sem alterar produtos.', 'success');
}

function mainConfirmed() {
  return sessionStorage.getItem(MAIN_CONFIRM_KEY) === '1';
}

function canWriteRules() {
  const cfg = config();
  return cfg.writeMode && cfg.campaignOfferWriteMode && text(cfg.githubToken)
    && (text(cfg.githubBranch) !== 'main' || mainConfirmed());
}

function safetyText() {
  const cfg = config();
  if (!cfg.writeMode || !cfg.campaignOfferWriteMode) return 'Ative a gravação geral e a trava de campanhas nas Configurações.';
  if (!text(cfg.githubToken)) return 'Configure o token do GitHub.';
  if (cfg.githubBranch === 'main' && !mainConfirmed()) return 'A main está protegida. Confirme explicitamente antes de salvar ou processar.';
  return `Gravações permitidas somente em ${cfg.githubBranch}.`;
}

function ruleCard(rule) {
  const simulated = state.simulation.get(rule.id) || [];
  const kind = rule.status === 'ativa' ? 'success' : rule.status === 'cancelada' ? 'danger' : 'warning';
  const examples = simulated.slice(0, 4).map(productName).join(' · ');
  return `<article class="campaign-rule-card ${rule.status}"><div class="campaign-rule-head"><div><span class="eyebrow">${escapeHtml(rule.categoria || 'Sem categoria')}</span><h4>${rule.desconto_percentual}% por ${rule.duracao_dias} dia(s)</h4><small>${rule.quantidade_por_execucao} produto(s) por execução</small></div><span class="badge ${kind}">${escapeHtml(rule.status)}</span></div><div class="campaign-rule-estimate"><strong>${simulated.length}</strong><span>elegíveis agora</span></div><p>${escapeHtml(examples || 'Nenhum produto elegível no momento.')}</p><div class="campaign-rule-actions"><button class="button secondary compact" type="button" data-campaign-edit="${escapeHtml(rule.id)}">Editar</button><button class="button secondary compact" type="button" data-campaign-toggle="${escapeHtml(rule.id)}">${rule.status === 'ativa' ? 'Pausar' : 'Ativar'}</button><button class="button ghost compact" type="button" data-campaign-cancel="${escapeHtml(rule.id)}">Cancelar regra</button></div></article>`;
}

function offerCard(source, kind = 'active') {
  const offer = source.offer || source;
  const product = source.product || productByRef(offer.produto_key || offer.codigo);
  const expired = kind === 'expired';
  const stale = kind === 'stale';
  const pendingCancel = !expired && !stale && isPendingCancellationOffer(offer, product);
  const image = productImage(product || {}) || PLACEHOLDER;
  const name = product ? productName(product) : offer.nome || offer.codigo || offer.produto_key;
  const date = dateOnly(offer.fim || product?.validade_oferta);
  const label = expired ? 'Aguardando limpeza'
    : stale ? 'Registro técnico antigo'
      : pendingCancel ? 'Aguardando processamento do cancelamento'
        : 'Ativa no Firebase';
  const badgeText = expired ? 'Limpar' : stale ? 'Antigo' : pendingCancel ? 'Aguardando cancelar' : 'Ativa';
  const badgeKind = expired || stale ? 'danger' : pendingCancel ? 'warning' : 'success';
  const cardKind = expired || stale ? 'expired' : pendingCancel ? 'pending-cancel' : '';
  return `<article class="campaign-offer-card ${cardKind}"><img src="${escapeHtml(image)}" onerror="this.src='${PLACEHOLDER}'" alt=""><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(offer.categoria || product?.categoria || 'Sem categoria')} · ${money(offer.preco_normal || product?.preco)} → ${money(offer.preco_oferta || product?.preco_oferta)}</small><small>${label}${date ? ` · até ${escapeHtml(date)}` : ''}</small></div><span class="badge ${badgeKind}">${badgeText}</span></article>`;
}

function ruleEditorHtml() {
  const existing = rulesDocument().regras.find(rule => rule.id === state.draftRuleId);
  const rule = existing || normalizeRule({ id: '', desconto_percentual: 10, duracao_dias: 3, quantidade_por_execucao: 2, status: 'ativa' });
  return `<div class="campaign-editor-head"><div><h3>${existing ? 'Editar regra' : 'Nova regra'}</h3><p>Categoria, desconto, duração e quantidade da rotação.</p></div>${existing ? '<button class="button ghost compact" type="button" data-campaign-new>Nova regra</button>' : ''}</div><div class="campaign-rule-form"><label>Categoria<select id="campaignRuleCategory">${categoryOptions(rule.categoria)}</select></label><label>Desconto (%)<input id="campaignRuleDiscount" type="number" min="1" max="50" step="0.01" value="${escapeHtml(rule.desconto_percentual)}"></label><label>Duração (dias)<input id="campaignRuleDuration" type="number" min="1" max="365" step="1" value="${escapeHtml(rule.duracao_dias)}"></label><label>Produtos por execução<input id="campaignRuleQuantity" type="number" min="1" max="100" step="1" value="${escapeHtml(rule.quantidade_por_execucao)}"></label><label>Status<select id="campaignRuleStatus"><option value="ativa" ${rule.status === 'ativa' ? 'selected' : ''}>Ativa</option><option value="pausada" ${rule.status === 'pausada' ? 'selected' : ''}>Pausada</option><option value="cancelada" ${rule.status === 'cancelada' ? 'selected' : ''}>Cancelada</option></select></label><label class="campaign-check"><input id="campaignRuleCloseActive" type="checkbox" ${rule.encerrar_ofertas_ativas ? 'checked' : ''}><span><strong>Encerrar ofertas ativas desta regra</strong><small>Use ao cancelar uma campanha.</small></span></label><div class="campaign-editor-actions"><button class="button primary" type="button" data-campaign-save-rule>${existing ? 'Atualizar regra' : 'Adicionar regra'}</button></div></div>`;
}

function sourceCard(label, path, sourceBranch, detail, kind = 'success') {
  return `<article class="system-row"><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(path)} · ${escapeHtml(sourceBranch || 'não carregado')}</small><small>${escapeHtml(detail)}</small></div><span class="badge ${kind}">${kind === 'success' ? 'OK' : 'Atenção'}</span></article>`;
}

function renderLoading() {
  const panel = document.getElementById('campaignOffersPanel');
  if (panel) panel.innerHTML = '<div class="empty-state"><strong>Carregando regras e estado das ofertas…</strong><span>O histórico pesado não é carregado nesta etapa.</span></div>';
}

function render() {
  const panel = document.getElementById('campaignOffersPanel');
  if (!panel || state.loading) return;
  const cfg = config();
  const rules = rulesDocument();
  const active = automaticActiveProducts().map(product => ({ offer: offerSnapshot(product), product }));
  const expired = automaticExpiredProducts();
  panel.innerHTML = `<div class="campaign-toolbar"><div><span class="eyebrow">Campanhas por categoria</span><h3>Ofertas por regra</h3><p>Crie regras, simule produtos elegíveis e aplique. Cancelar uma regra remove a regra da lista e encerra as ofertas criadas por ela.</p></div><div class="campaign-toolbar-actions"><button class="button secondary" type="button" data-campaign-reload>Atualizar</button><button class="button secondary" type="button" data-campaign-simulate>Simular</button><button class="button primary" type="button" data-campaign-run>Processar agora</button></div></div>
    <div class="attention-grid campaign-metrics"><article class="metric-card info"><strong>${rules.regras.length}</strong><span>Regras recuperadas</span><small>${rules.regras.filter(rule => rule.status === 'ativa').length} ativas</small></article><article class="metric-card success"><strong>${active.length}</strong><span>Ativas no Firebase</span><small>Fonte real dos preços</small></article><article class="metric-card ${expired.length ? 'danger' : 'success'}"><strong>${expired.length}</strong><span>Vencidas no Firebase</span><small>Serão limpas no processamento</small></article></div>
    ${state.warnings.length ? `<div class="notice warning">${state.warnings.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
    <section class="campaign-control-card"><div class="campaign-control-grid"><label class="switch-row"><span><strong>Automação ativa</strong><small>Permite criar novas ofertas.</small></span><input id="campaignEnabled" type="checkbox" ${rules.ativo ? 'checked' : ''}></label><label class="switch-row"><span><strong>Exigir quantidade completa</strong><small>A regra aguarda quando faltam elegíveis.</small></span><input id="campaignRequireComplete" type="checkbox" ${rules.exigir_quantidade_completa ? 'checked' : ''}></label><label>Fuso horário<input id="campaignTimezone" value="${escapeHtml(rules.timezone)}"></label><label>Branch configurada<input value="${escapeHtml(cfg.githubBranch)}" disabled></label></div><div class="campaign-main-warning ${cfg.githubBranch === 'main' ? '' : 'safe'}"><label><input id="campaignMainConfirm" type="checkbox" ${cfg.githubBranch === 'main' ? (mainConfirmed() ? 'checked' : '') : 'checked disabled'}><span><strong>${cfg.githubBranch === 'main' ? 'Confirmo alterações na main' : 'Produção oficial'}</strong><small>${cfg.githubBranch === 'main' ? 'Sem confirmação, salvar e executar permanecem bloqueados.' : escapeHtml(cfg.githubBranch)}</small></span></label></div><div class="campaign-control-actions"><span id="campaignSafety">${escapeHtml(safetyText())}${state.rulesDirty ? ' · Existem regras ainda não publicadas.' : ''}</span><button class="button secondary" type="button" data-campaign-save-settings>Salvar regras e configuração</button></div></section>
    <div class="campaign-layout"><section class="campaign-column"><div class="campaign-rule-editor">${ruleEditorHtml()}</div><div class="campaign-section-head"><div><h3>Regras cadastradas</h3><p>Somente regras ativas ou pausadas aparecem aqui.</p></div></div><div class="campaign-rules">${rules.regras.length ? rules.regras.map(ruleCard).join('') : '<div class="empty-state">Nenhuma regra cadastrada.</div>'}</div></section><section class="campaign-column"><div class="campaign-section-head"><div><h3>Ofertas ativas no Firebase</h3><p>Mostra apenas ofertas que ainda estão aplicadas nos produtos.</p></div><span class="badge success">${active.length}</span></div><div class="campaign-offers-list">${active.length ? active.slice(0, 50).map(row => offerCard(row)).join('') : '<div class="empty-state">Nenhuma campanha automática ativa.</div>'}</div>${expired.length ? `<div class="campaign-section-head danger-head"><div><h3>Vencidas aguardando limpeza</h3><p>Serão removidas no próximo processamento.</p></div><span class="badge danger">${expired.length}</span></div><div class="campaign-offers-list">${expired.slice(0, 50).map(product => offerCard({ ...offerSnapshot(product), product }, 'expired')).join('')}</div>` : ''}</section></div>`;
  panel.querySelectorAll('[data-campaign-run], [data-campaign-save-settings]').forEach(button => { button.disabled = !canWriteRules(); });
  const run = panel.querySelector('[data-campaign-run]');
  if (run && state.rulesDirty) run.disabled = true;
}

async function loadHistory({ notify = true } = {}) {
  const cfg = config();
  const result = await readWithMainFallback(cfg, cfg.offersHistoryPath, 'Histórico de ofertas');
  state.historyFile = result.file || { data: { versao: 1, atualizado_em: null, ofertas: [], eventos: [] } };
  state.historySourceBranch = result.sourceBranch;
  state.historyLoaded = true;
  if (result.warning && !/não encontrado/i.test(result.warning)) state.warnings.push(result.warning);
  render();
  if (notify) toast(result.file ? 'Histórico carregado.' : 'Nenhum histórico existente; será criado na reconciliação.', result.file ? 'success' : '');
}

async function loadData({ force = false } = {}) {
  const cfg = config();
  if (state.loading) return;
  if (!force && state.loadedBranch === cfg.githubBranch && state.rulesFile && state.statusFile) return render();
  state.loading = true;
  state.warnings = [];
  renderLoading();
  try {
    const [rulesResult, statusResult] = await Promise.all([
      readWithMainFallback(cfg, cfg.offersRulesPath, 'Regras de ofertas'),
      readWithMainFallback(cfg, cfg.offersStatePath, 'Estado das ofertas'),
    ]);
    state.rulesFile = rulesResult.file || { data: { versao: 1, ativo: true, exigir_quantidade_completa: true, timezone: 'America/Cuiaba', regras: [] } };
    state.rulesSourceBranch = rulesResult.sourceBranch;
    state.statusFile = statusResult.file || { data: {} };
    state.statusSourceBranch = statusResult.sourceBranch;
    state.loadedBranch = cfg.githubBranch;
    state.rulesDirty = false;
    [rulesResult.warning, statusResult.warning].filter(Boolean).forEach(message => state.warnings.push(message));
  } catch (error) {
    state.warnings.push(error?.message || String(error));
    toast(error?.message || String(error), 'error');
  } finally {
    state.loading = false;
    simulateRules({ notify: false });
  }
}

function formRule() {
  const existing = rulesDocument().regras.find(rule => rule.id === state.draftRuleId);
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
  const index = doc.regras.findIndex(item => item.id === rule.id);
  if (index >= 0) doc.regras[index] = rule;
  else doc.regras.push(rule);
  state.rulesFile = { ...(state.rulesFile || {}), data: doc };
  state.rulesDirty = true;
  state.draftRuleId = '';
  simulateRules({ notify: false });
  toast('Regra preparada. Salve para publicar no GitHub.', 'success');
}

function mutateRule(id, mutation) {
  const doc = rulesDocument();
  const rule = doc.regras.find(item => item.id === id);
  if (!rule) return;
  mutation(rule);
  rule.atualizado_em = new Date().toISOString();
  state.rulesFile = { ...(state.rulesFile || {}), data: doc };
  state.rulesDirty = true;
  simulateRules({ notify: false });
}

function removeRuleForCancellation(id) {
  const doc = rulesDocument();
  const rule = doc.regras.find(item => text(item.id) === text(id));
  if (!rule) return null;
  const now = new Date().toISOString();
  doc.regras = doc.regras.filter(item => text(item.id) !== text(id));
  doc.cancelamentos_regras = [
    ...(Array.isArray(doc.cancelamentos_regras) ? doc.cancelamentos_regras : []),
    { id: rule.id, categoria: rule.categoria, cancelado_em: now },
  ];
  doc.atualizado_em = now;
  state.rulesFile = { ...(state.rulesFile || {}), data: doc };
  state.rulesDirty = true;
  state.draftRuleId = '';
  simulateRules({ notify: false });
  return rule;
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
  state.rulesSourceBranch = cfg.githubBranch;
  state.rulesDirty = false;
  toast(result.skipped ? 'As regras já estavam atualizadas.' : 'Regras salvas corretamente no GitHub.', 'success');
  render();
}

function recoveredState() {
  const previous = executionState();
  const now = new Date().toISOString();
  const active = automaticActiveProducts().map(offerSnapshot);
  const historyMap = { ...previous.historico_produtos };
  active.forEach(offer => {
    const key = text(offer.produto_key);
    if (key && !historyMap[key]) historyMap[key] = { ultima_oferta_em: offer.inicio || now, regra_id: offer.regra_id };
  });
  const log = {
    id: `reconciliacao-admin-v2-${Date.now()}`,
    executado_em: now,
    origem: 'admin_v2',
    modo: 'reconciliacao_estado',
    resumo: {
      ofertas_ativas_firebase: active.length,
      vencidas_aguardando_limpeza: automaticExpiredProducts().length,
      registros_antigos_removidos_do_estado: stateOnlyOffers().length,
    },
  };
  return {
    versao: 2,
    ultima_execucao: previous.ultima_execucao || now,
    ultima_execucao_status: previous.ultima_execucao_status || 'reconciliado_admin_v2',
    ofertas_ativas: active,
    historico_produtos: historyMap,
    solicitacoes_reativacao: previous.solicitacoes_reativacao,
    reativacoes: previous.reativacoes.slice(-500),
    execucoes: [...previous.execucoes, log].slice(-200),
    reconciliado_em: now,
    reconciliado_de: 'firebase_produtos',
  };
}

function recoveredHistory(nextState) {
  const previous = historyDocument();
  const now = new Date().toISOString();
  const rows = [...previous.ofertas];
  const activeKeys = new Set(rows.filter(row => row.status === 'ativa').map(row => text(row.produto_key)).filter(Boolean));
  nextState.ofertas_ativas.forEach(offer => {
    if (activeKeys.has(text(offer.produto_key))) return;
    rows.push({
      id: `oferta-recuperada-${text(offer.produto_key).replace(/[^a-z0-9]/gi, '').toLowerCase()}-${Date.now()}`,
      ...offer,
      status: 'ativa',
      criada_em: offer.inicio || now,
      encerrada_em: null,
      motivo_encerramento: null,
      recuperada_em: now,
      recuperada_de: 'firebase_produtos',
      banner_ids: [],
    });
  });
  return {
    versao: 1,
    atualizado_em: now,
    ofertas: rows.slice(-10000),
    eventos: [...previous.eventos, {
      tipo: 'estado_reconciliado',
      executado_em: now,
      origem: 'admin_v2',
      ofertas_ativas: nextState.ofertas_ativas.length,
    }].slice(-2000),
  };
}

async function reconcileState() {
  if (!canWriteRules()) return toast(safetyText(), 'error');
  if (!confirm('Recuperar o estado usando as ofertas atuais do Firebase? Ofertas vencidas não serão reativadas.')) return;
  const cfg = config();
  if (!state.historyLoaded) await loadHistory({ notify: false });
  const nextState = recoveredState();
  const nextHistory = recoveredHistory(nextState);
  const stateResult = await upsertText(cfg, cfg.offersStatePath, JSON.stringify(nextState, null, 2), 'Reconcilia estado das ofertas pelo Admin V2');
  const historyResult = await upsertText(cfg, cfg.offersHistoryPath, JSON.stringify(nextHistory, null, 2), 'Recupera histórico das ofertas pelo Admin V2');
  state.statusFile = { data: nextState, sha: stateResult.sha || state.statusFile?.sha };
  state.statusSourceBranch = cfg.githubBranch;
  state.historyFile = { data: nextHistory, sha: historyResult.sha || state.historyFile?.sha };
  state.historySourceBranch = cfg.githubBranch;
  state.historyLoaded = true;
  toast('Estado e histórico reconciliados com as ofertas atuais do Firebase.', 'success');
  render();
}

async function dispatchWorkflow() {
  if (!canWriteRules()) return toast(safetyText(), 'error');
  if (state.rulesDirty) return toast('Salve as regras antes de iniciar o processamento.', 'error');
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
  toast(`Processamento iniciado em ${cfg.githubBranch}.`, 'success');
}

async function cancelRuleAndProcess(id, button) {
  if (!canWriteRules()) return toast(safetyText(), 'error');
  const rule = rulesDocument().regras.find(item => text(item.id) === text(id));
  if (!rule) return toast('Regra não encontrada.', 'error');
  const activeCount = automaticActiveProducts()
    .filter(product => text(product.oferta_regra_id) === text(id))
    .length;
  const suffix = activeCount
    ? ` Isso vai iniciar o encerramento de ${activeCount} oferta(s) ativa(s) criada(s) por ela.`
    : ' Não encontrei ofertas ativas desta regra no Firebase agora.';
  if (!confirm(`Cancelar esta regra?${suffix}`)) return;
  if (button) button.disabled = true;
  removeRuleForCancellation(id);
  await saveRulesFile();
  await dispatchWorkflow();
  toast('Regra removida e processamento iniciado para limpar as ofertas dos produtos.', 'success');
  loadData({ force: true });
}

function installSettings() {
  const grid = document.querySelector('[data-view="settings"] .settings-grid');
  if (!grid || document.getElementById('campaignOfferSafetySettings')) return;
  const cfg = config();
  const html = `<section class="panel span-all-settings" id="campaignOfferSafetySettings"><div class="panel-header"><div><h2>Segurança das campanhas automáticas</h2><p>Trava independente para editar regras, reconciliar estado e executar a rotação.</p></div><span class="badge ${cfg.campaignOfferWriteMode ? 'warning' : 'success'}" id="campaignOfferSettingsStatus">${cfg.campaignOfferWriteMode ? 'Habilitada' : 'Bloqueada'}</span></div><div class="form-stack"><label class="switch-row"><span><strong>Permitir campanhas automáticas</strong><small>Também exige gravação geral, token GitHub e confirmação da main.</small></span><input id="campaignOfferWriteModeSetting" type="checkbox" ${cfg.campaignOfferWriteMode ? 'checked' : ''}></label></div></section>`;
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
  if (document.getElementById('campaignOffersRecoveryStyles')) return;
  const style = document.createElement('style');
  style.id = 'campaignOffersRecoveryStyles';
  style.textContent = `.campaign-offers-panel[hidden]{display:none!important}.campaign-offers-panel{padding:15px 16px 18px}.campaign-toolbar{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:2px 0 13px}.campaign-toolbar h3{margin:3px 0 0;font-size:17px}.campaign-toolbar p{margin:5px 0 0;color:var(--muted);font-size:10px;line-height:1.45}.campaign-toolbar-actions{display:flex;gap:6px;flex-wrap:wrap}.campaign-metrics{margin-bottom:12px}.campaign-sources,.campaign-control-card,.campaign-history{margin-top:12px;border:1px solid var(--line);border-radius:12px;background:#fafbf9;overflow:hidden}.campaign-sources .system-list{padding:10px}.campaign-sources .notice{margin:0 10px 10px;display:grid;gap:4px}.campaign-control-card{padding:12px}.campaign-control-grid{display:grid;grid-template-columns:1fr 1fr minmax(170px,.7fr) minmax(180px,.8fr);gap:9px}.campaign-control-grid>label:not(.switch-row){display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:9px;font-weight:850}.campaign-control-grid input{width:100%;min-height:40px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:9px;background:#fff}.campaign-main-warning{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;padding:10px;border:1px solid #e4bc67;border-radius:10px;background:#fffaf0}.campaign-main-warning.safe{border-color:#bcdcc9;background:var(--success-soft)}.campaign-main-warning label{display:flex;align-items:flex-start;gap:8px}.campaign-main-warning strong,.campaign-main-warning small{display:block}.campaign-main-warning strong{font-size:10px}.campaign-main-warning small{margin-top:3px;color:var(--muted);font-size:8px}.campaign-control-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:9px}.campaign-control-actions span{margin-right:auto;color:var(--muted);font-size:9px}.campaign-layout{display:grid;grid-template-columns:minmax(420px,1fr) minmax(420px,1fr);gap:12px;margin-top:12px}.campaign-column{min-width:0;border:1px solid var(--line);border-radius:12px;background:#fafbf9;overflow:hidden}.campaign-section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:12px 13px;border-bottom:1px solid var(--line);background:#fff}.campaign-section-head h3{margin:0;font-size:13px}.campaign-section-head p{margin:4px 0 0;color:var(--muted);font-size:9px}.campaign-section-head.danger-head{border-top:1px solid #efc9c5;background:var(--danger-soft)}.campaign-rule-editor{padding:12px;border-bottom:1px solid var(--line);background:#fffdf7}.campaign-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.campaign-editor-head h3{margin:0;font-size:13px}.campaign-editor-head p{margin:4px 0 0;color:var(--muted);font-size:9px}.campaign-rule-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.campaign-rule-form>label:not(.campaign-check){display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:9px;font-weight:850}.campaign-rule-form input,.campaign-rule-form select{width:100%;min-height:39px;padding:8px 9px;border:1px solid var(--line-strong);border-radius:9px;background:#fff;font-size:10px}.campaign-check{grid-column:1/-1;display:flex;align-items:flex-start;gap:8px;padding:9px;border:1px solid var(--line);border-radius:9px;background:#fff}.campaign-check input{width:17px;min-height:17px}.campaign-check strong,.campaign-check small{display:block}.campaign-check strong{font-size:9px}.campaign-check small{margin-top:3px;color:var(--muted);font-size:8px}.campaign-editor-actions{grid-column:1/-1;display:flex;justify-content:flex-end}.campaign-rules{display:grid;gap:7px;max-height:650px;overflow:auto;padding:10px}.campaign-rule-card{padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}.campaign-rule-card.cancelada{opacity:.7}.campaign-rule-head{display:flex;justify-content:space-between;gap:8px}.campaign-rule-head h4{margin:3px 0 0;font-size:12px}.campaign-rule-head small{display:block;margin-top:3px;color:var(--muted);font-size:8px}.campaign-rule-estimate{display:flex;align-items:end;gap:5px;margin-top:8px}.campaign-rule-estimate strong{font-size:20px}.campaign-rule-estimate span{padding-bottom:2px;color:var(--muted);font-size:8px}.campaign-rule-card p{margin:5px 0 0;color:var(--muted);font-size:8px}.campaign-rule-actions{display:flex;justify-content:flex-end;gap:5px;margin-top:8px;flex-wrap:wrap}.campaign-offers-list{display:grid;gap:6px;max-height:430px;overflow:auto;padding:10px}.campaign-offer-card{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px;border:1px solid var(--line);border-radius:9px;background:#fff}.campaign-offer-card.expired{border-color:#efc9c5;background:var(--danger-soft)}.campaign-offer-card img{width:52px;height:52px;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff;padding:3px}.campaign-offer-card strong,.campaign-offer-card small{display:block}.campaign-offer-card strong{font-size:10px}.campaign-offer-card small{margin-top:3px;color:var(--muted);font-size:8px}.campaign-executions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:10px}.campaign-executions>div{padding:9px;border:1px solid var(--line);border-radius:9px;background:#fff}.campaign-executions strong,.campaign-executions span,.campaign-executions small{display:block}.campaign-executions strong{font-size:9px}.campaign-executions span{margin-top:3px;color:var(--info);font-size:8px}.campaign-executions small{margin-top:4px;color:var(--muted);font-size:7px;overflow-wrap:anywhere}@media(max-width:1050px){.campaign-layout{grid-template-columns:1fr}.campaign-control-grid{grid-template-columns:1fr 1fr}.campaign-executions{grid-template-columns:1fr 1fr}}@media(max-width:760px){.campaign-offers-panel{padding:10px}.campaign-toolbar{flex-direction:column}.campaign-toolbar-actions{width:100%}.campaign-toolbar-actions .button{flex:1}.campaign-control-grid,.campaign-rule-form,.campaign-executions{grid-template-columns:1fr}.campaign-main-warning,.campaign-control-actions{align-items:flex-start;flex-direction:column}.campaign-check,.campaign-editor-actions{grid-column:auto}}`;
  document.head.appendChild(style);
}

function installPanel() {
  const workspace = document.getElementById('offersWorkspace');
  const routeHost = document.querySelector('.view[data-view="offers-rules"]');
  if (!workspace && !routeHost) return false;
  const tabs = document.getElementById('offerManagerTabs');
  tabs?.querySelector('[data-offer-tab="campaign"]')?.remove();
  if (!document.getElementById('campaignOffersPanel')) (routeHost || workspace).insertAdjacentHTML('beforeend', '<section class="campaign-offers-panel" id="campaignOffersPanel" hidden></section>');
  return true;
}

function openRulesPage({ force = false } = {}) {
  if (!installPanel()) return false;
  const panel = document.getElementById('campaignOffersPanel');
  const routeHost = document.querySelector('.view[data-view="offers-rules"]');
  if (panel && routeHost && panel.parentElement !== routeHost) routeHost.appendChild(panel);
  if (panel) panel.hidden = false;
  loadData({ force });
  return true;
}

function bind() {
  if (document.documentElement.dataset.campaignRecoveryBound === '1') return;
  document.documentElement.dataset.campaignRecoveryBound = '1';
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
      loadData();
      return;
    }
    const action = event.target.closest('[data-campaign-reload], [data-campaign-simulate], [data-campaign-run], [data-campaign-reconcile], [data-campaign-load-history], [data-campaign-save-settings], [data-campaign-save-rule], [data-campaign-new], [data-campaign-edit], [data-campaign-toggle], [data-campaign-cancel], [data-campaign-use-test-branch]');
    if (!action) return;
    if (action.matches('[data-campaign-reload]')) loadData({ force: true });
    if (action.matches('[data-campaign-simulate]')) simulateRules();
    if (action.matches('[data-campaign-run]')) dispatchWorkflow().catch(error => toast(error?.message || String(error), 'error'));
    if (action.matches('[data-campaign-reconcile]')) reconcileState().catch(error => toast(error?.message || String(error), 'error'));
    if (action.matches('[data-campaign-load-history]')) loadHistory().catch(error => toast(error?.message || String(error), 'error'));
    if (action.matches('[data-campaign-save-settings]')) saveRulesFile().catch(error => toast(error?.message || String(error), 'error'));
    if (action.matches('[data-campaign-save-rule]')) saveRuleLocal();
    if (action.matches('[data-campaign-new]')) { state.draftRuleId = ''; render(); }
    if (action.matches('[data-campaign-edit]')) { state.draftRuleId = action.dataset.campaignEdit; render(); }
    if (action.matches('[data-campaign-toggle]')) mutateRule(action.dataset.campaignToggle, rule => { rule.status = rule.status === 'ativa' ? 'pausada' : 'ativa'; rule.encerrar_ofertas_ativas = false; });
    if (action.matches('[data-campaign-cancel]')) cancelRuleAndProcess(action.dataset.campaignCancel, action).catch(error => toast(error?.message || String(error), 'error'));
    if (action.matches('[data-campaign-use-test-branch]')) {
      saveConfig({ githubBranch: 'main' });
      sessionStorage.removeItem(MAIN_CONFIRM_KEY);
      state.loadedBranch = '';
      state.historyLoaded = false;
      toast('Admin oficial fixado na main.', 'success');
      loadData({ force: true });
    }
  }, true);
  window.addEventListener('admin-v2-route-ready', event => {
    if (event.detail?.route !== 'offers-rules') return;
    openRulesPage();
  });
  window.__adminV2CampaignOffersLoad = options => openRulesPage(options);
  document.addEventListener('change', event => {
    if (event.target.id !== 'campaignMainConfirm') return;
    sessionStorage.setItem(MAIN_CONFIRM_KEY, event.target.checked ? '1' : '0');
    render();
  }, true);
}

function start() {
  installStyles();
  installSettings();
  bind();
  if (!installPanel()) setTimeout(start, 120);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
