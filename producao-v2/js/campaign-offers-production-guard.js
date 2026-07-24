import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';

const MAIN_CONFIRM_KEY = 'da_admin_v2_campaign_main_confirm';

function config() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function toast(message, type = 'error') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), 7000);
}

window.addEventListener('click', event => {
  const button = event.target.closest?.('[data-campaign-run]');
  if (!button) return;
  const cfg = config();
  if (cfg.githubBranch !== 'main') {
    event.preventDefault();
    event.stopImmediatePropagation();
    toast('Processamento bloqueado na branch de homologação: o workflow usa o Firebase real. Use Simular ou Recuperar estado.');
    return;
  }
  if (sessionStorage.getItem(MAIN_CONFIRM_KEY) !== '1') {
    event.preventDefault();
    event.stopImmediatePropagation();
    toast('Confirme explicitamente as alterações na main antes de processar ofertas reais.');
  }
}, true);
