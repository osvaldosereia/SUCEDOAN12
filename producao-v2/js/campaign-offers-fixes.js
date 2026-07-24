import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { normalizeSearch, number, text } from './core/utils.js';

const MAIN_CONFIRM_KEY = 'da_admin_v2_campaign_main_confirm';
const AUTOMATIC_ORIGINS = new Set(['campanha_automatica', 'reativacao_historico', 'validade']);

function config() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function products() {
  return window.__adminV2OffersStore?.state?.products || [];
}

function ended(value) {
  const raw = text(value);
  if (!raw) return false;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T23:59:59-04:00`) : new Date(raw);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now();
}

function activeProduct(product) {
  const status = text(product?.situacao || product?.status || 'A').toUpperCase();
  return !['I', 'INATIVO', 'INACTIVE', '0', 'FALSE', 'EXCLUIDO', 'EXCLUÍDO'].includes(status)
    && product?.ativo !== false && product?.visivel !== false;
}

function currentOffer(product) {
  return number(product?.preco_oferta) > 0 && number(product?.preco) > number(product?.preco_oferta) && !ended(product?.validade_oferta);
}

function automaticExpired() {
  return products().filter(product => AUTOMATIC_ORIGINS.has(text(product.oferta_origem))
    && number(product.preco_oferta) > 0 && ended(product.validade_oferta));
}

function automaticActive() {
  return products().filter(product => AUTOMATIC_ORIGINS.has(text(product.oferta_origem)) && currentOffer(product));
}

function eligibleCount(category) {
  const wanted = normalizeSearch(category);
  return products().filter(product => normalizeSearch(product.categoria) === wanted
    && activeProduct(product)
    && number(product.estoque) > 0
    && number(product.preco) > 0
    && !ended(product.validade)
    && !currentOffer(product)).length;
}

function mainConfirmed() {
  return sessionStorage.getItem(MAIN_CONFIRM_KEY) === '1';
}

function canWrite() {
  const cfg = config();
  return cfg.writeMode && cfg.campaignOfferWriteMode && text(cfg.githubToken)
    && (text(cfg.githubBranch) !== 'main' || mainConfirmed());
}

function correctPanel() {
  const panel = document.getElementById('campaignOffersPanel');
  if (!panel || panel.hidden) return;
  const cfg = config();
  const checkbox = document.getElementById('campaignMainConfirm');
  if (checkbox && cfg.githubBranch === 'main') checkbox.checked = mainConfirmed();
  panel.querySelectorAll('[data-campaign-run], [data-campaign-save-settings]').forEach(button => { button.disabled = !canWrite(); });
  const safety = document.getElementById('campaignSafety');
  if (safety) {
    safety.textContent = !cfg.writeMode || !cfg.campaignOfferWriteMode
      ? 'Ative a gravação geral e a trava de campanhas nas Configurações.'
      : !text(cfg.githubToken)
        ? 'Configure o token do GitHub.'
        : cfg.githubBranch === 'main' && !mainConfirmed()
          ? 'A branch main está protegida. Confirme explicitamente ou use a branch de homologação.'
          : `Alterações serão feitas somente na branch ${cfg.githubBranch}.`;
  }
  const metrics = panel.querySelectorAll('.campaign-metrics .metric-card strong');
  if (metrics[1]) metrics[1].textContent = String(automaticActive().length);
  if (metrics[2]) metrics[2].textContent = String(automaticExpired().length);
  panel.querySelectorAll('.campaign-rule-card').forEach(card => {
    const category = card.querySelector('.eyebrow')?.textContent || '';
    const count = card.querySelector('.campaign-rule-estimate strong');
    if (count) count.textContent = String(eligibleCount(category));
  });
}

function bind() {
  if (document.documentElement.dataset.campaignFixesBound === '1') return;
  document.documentElement.dataset.campaignFixesBound = '1';
  document.addEventListener('change', event => {
    if (event.target.id !== 'campaignMainConfirm') return;
    sessionStorage.setItem(MAIN_CONFIRM_KEY, event.target.checked ? '1' : '0');
    setTimeout(correctPanel, 0);
  }, true);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-campaign-use-test-branch]')) sessionStorage.removeItem(MAIN_CONFIRM_KEY);
  }, true);
  new MutationObserver(correctPanel).observe(document.documentElement, { childList: true, subtree: true });
  correctPanel();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();
