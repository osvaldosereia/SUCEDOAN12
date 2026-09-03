import { FIREBASE_BASE, text } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260903-admin-canecas-github-cutover-readiness-v1';
const STATUS_PATH = 'canecas/integracoes/github_ops/prontidao_corte_make';
const $ = (selector, root = document) => root.querySelector(selector);
let loading = false;
let lastLoad = 0;
let cached = null;

function installStyles() {
  if ($('#cfGithubReadinessStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfGithubReadinessStyles';
  style.textContent = `
    .cf-gh-ready{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:8px;padding:8px 10px;border-radius:10px;background:#f7faf7;border:1px solid #dce7dd;font-size:10px;color:#5e665f}
    .cf-gh-ready b{font-size:11px;color:#176232}.cf-gh-ready[data-state="alert"]{background:#fff9ef;border-color:#efd8ae}.cf-gh-ready[data-state="alert"] b{color:#8a4b00}
    .cf-gh-ready-chip{padding:3px 7px;border-radius:999px;background:#eaf6ee;color:#176232;font-weight:800}.cf-gh-ready-chip.warn{background:#fff0d5;color:#855000}
    .cf-gh-ready small{font-size:9px;color:#7a817a}
  `;
  document.head.appendChild(style);
}

async function loadStatus(force = false) {
  if (!force && cached && Date.now() - lastLoad < 120000) return cached;
  if (loading) return cached;
  loading = true;
  try {
    const r = await fetch(`${FIREBASE_BASE}/${STATUS_PATH}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
    cached = r.ok ? ((await r.json()) || {}) : {};
    lastLoad = Date.now();
    return cached;
  } finally { loading = false; }
}

function ageLabel(iso) {
  const ms = Date.now() - Date.parse(text(iso));
  if (!Number.isFinite(ms)) return 'sem verificação recente';
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 2) return 'verificado agora';
  if (min < 60) return `verificado há ${min} min`;
  const h = Math.round(min / 60);
  return `verificado há ${h} h`;
}

function render(status = {}) {
  const panel = $('#cfDualSyncPanel');
  if (!panel) return;
  installStyles();
  let el = $('#cfGithubCutoverReadiness', panel);
  if (!el) {
    el = document.createElement('div');
    el.id = 'cfGithubCutoverReadiness';
    el.className = 'cf-gh-ready';
    panel.appendChild(el);
  }
  const total = Number(status?.nucleo?.total || 0);
  const ready = Number(status?.nucleo?.prontas || 0);
  const blocked = Number(status?.nucleo?.bloqueadas || 0);
  const stale = Date.now() - Date.parse(text(status.atualizado_em)) > 2 * 60 * 60 * 1000;
  const coreOk = total > 0 && ready === total && blocked === 0 && !stale;
  const emailReady = status?.email_resend?.secret_configurado === true;
  const perf = status?.desempenho_ms || {};
  el.dataset.state = coreOk ? 'ok' : 'alert';
  el.innerHTML = total
    ? `<b>${coreOk ? '✓' : '⚠'} GitHub operacional ${ready}/${total}</b>` +
      `<span class="cf-gh-ready-chip">LI + Firebase</span>` +
      `<span class="cf-gh-ready-chip ${emailReady ? '' : 'warn'}">E-mail: ${emailReady ? 'pronto p/ canário' : 'continua no Make'}</span>` +
      `<span>SKU ${Number(perf.buscar_sku || 0)}ms · produto ${Number(perf.ler_produto || 0)}ms</span>` +
      `<small>${ageLabel(status.atualizado_em)} · OpenAI continua no Make</small>`
    : '<b>⚠ Prontidão GitHub ainda não verificada</b><span>O Make permanece inalterado.</span>';
}

async function apply(force = false) {
  if (!location.hash.includes('mugs')) return;
  render(await loadStatus(force));
}
function schedule() { setTimeout(() => void apply(), 120); }
window.addEventListener('hashchange', schedule);
window.addEventListener('admin-canecas:route', event => { if (event.detail?.route === 'mugs') schedule(); });
window.addEventListener('admin-canecas:mugs-stable-rendered', schedule);
document.addEventListener('DOMContentLoaded', schedule);
setInterval(() => { if (location.hash.includes('mugs')) void apply(true); }, 300000);

document.documentElement.dataset.cfGithubCutoverReadiness = BUILD;
export { BUILD, apply, loadStatus };
