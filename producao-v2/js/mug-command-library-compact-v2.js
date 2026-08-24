import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { text } from './core/utils.js';

const BUILD = '20260824-canecas-command-compact-perf-v4';
const NODE = 'canecas/comandos_criacao';
const SELECTED_KEY = 'da_admin_v2_mug_saved_commands_selected';
const CACHE_KEY = 'da_admin_v2_mug_commands_cache_v2';
let defaults = new Set();
let decorateFrame = 0;

function config() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function baseUrl() {
  const base = text(config().firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
  return base ? `${base}/${NODE}` : '';
}

function persist(ids) {
  localStorage.setItem(SELECTED_KEY, JSON.stringify([...ids]));
}

function cachedCommands() {
  if (Array.isArray(window.__daMugCommandsSnapshot)) return window.__daMugCommandsSnapshot;
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return Array.isArray(parsed.commands) ? parsed.commands : [];
  } catch {
    return [];
  }
}

function saveCachedCommands(commands) {
  const list = Array.isArray(commands) ? commands : [];
  window.__daMugCommandsSnapshot = list;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), commands: list })); } catch {}
}

function defaultsFrom(commands) {
  return new Set((Array.isArray(commands) ? commands : [])
    .filter(value => value && value.iniciar_ativo === true)
    .map(value => text(value.id))
    .filter(Boolean));
}

async function setDefault(id, active) {
  const base = baseUrl();
  if (!base) throw new Error('Firebase não está configurado.');
  const response = await fetch(`${base}/${encodeURIComponent(id)}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ iniciar_ativo: active, atualizado_em: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status}.`);
}

function styles() {
  if (document.getElementById('mugCommandCompactV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'mugCommandCompactV2Styles';
  style.textContent = `
    .mugv7-main.has-command-library{grid-template-columns:minmax(300px,1fr) minmax(440px,540px)!important;align-items:start!important}.mugv7-main.has-command-library>.mugv7-info{display:none!important}
    .mug-command-library{display:grid!important;gap:7px!important;padding:9px!important;position:sticky!important;top:10px!important;max-height:calc(100vh - 90px)!important;overflow:auto!important}.mug-command-head{position:sticky;top:-9px;background:#fff;z-index:5;padding:2px 0 5px!important}.mug-command-head h3{font-size:13px!important}.mug-command-head p{font-size:9px!important}
    .mug-command-form{padding:6px!important;gap:5px!important}.mug-command-form input,.mug-command-form textarea{padding:6px!important;font-size:9px!important;border-radius:7px!important}.mug-command-form textarea{min-height:46px!important;max-height:76px!important}.mug-command-form-actions button,.mug-command-toolbar button,.mug-command-head button{padding:3px 5px!important;min-height:21px!important;font-size:7.5px!important}
    .mug-command-status,.mug-command-selected-count,.mug-command-effective{font-size:8.5px!important}.mug-command-effective{padding:5px 6px!important}.mug-command-list{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:4px!important}.mug-command-item{padding:4px 5px!important;border-radius:7px!important;grid-template-columns:15px minmax(0,1fr)!important;gap:4px!important;min-height:52px!important}.mug-command-check input{width:12px!important;height:12px!important;margin:0!important}.mug-command-body{gap:2px!important}.mug-command-body strong{font-size:9px!important;line-height:1.1!important}.mug-command-body p{font-size:8px!important;line-height:1.15!important;-webkit-line-clamp:2!important}
    .mug-command-actions{gap:2px!important;align-items:center!important}.mug-command-actions button{padding:2px 4px!important;min-height:17px!important;font-size:6.8px!important;border-radius:4px!important}.mug-command-default-toggle{border:0;background:#f0f1ed;color:#aaa;border-radius:4px;padding:1px 4px!important;min-height:17px!important;font-size:9px!important;cursor:pointer}.mug-command-default-toggle.active{background:#171817;color:#fff}
    @media(max-width:1050px){.mugv7-main.has-command-library{grid-template-columns:minmax(260px,1fr) minmax(380px,460px)!important}}@media(max-width:780px){.mugv7-main.has-command-library{grid-template-columns:1fr!important}.mug-command-library{position:static!important;max-height:none!important}.mug-command-list{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
  `;
  document.head.appendChild(style);
}

function decorate(panel) {
  const main = panel.querySelector('.mugv7-main');
  if (!main) return;
  main.querySelector(':scope > .mugv7-info')?.remove();
  main.classList.add('has-command-library');
  panel.querySelectorAll('.mug-command-item').forEach(card => {
    const checkbox = card.querySelector('[data-command-select]');
    const actions = card.querySelector('.mug-command-actions');
    if (!checkbox || !actions) return;
    const id = text(checkbox.dataset.commandSelect);
    let button = actions.querySelector('[data-command-default-toggle]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'mug-command-default-toggle';
      button.dataset.commandDefaultToggle = id;
      actions.prepend(button);
    }

    const active = defaults.has(id);
    if (button.classList.contains('active') !== active) button.classList.toggle('active', active);
    const nextTitle = active ? 'Inicia ativado. Clique para desativar o padrão.' : 'Clique para sempre iniciar ativado.';
    if (button.title !== nextTitle) button.title = nextTitle;
    const nextText = active ? '★' : '☆';
    if (button.textContent !== nextText) button.textContent = defaults.has(id) ? '★' : '☆';
  });
}

function scheduleDecorate(panel) {
  if (decorateFrame) return;
  decorateFrame = requestAnimationFrame(() => {
    decorateFrame = 0;
    decorate(panel);
  });
}

function applyDefaults(panel) {
  const state = panel.__mugCommandState;
  if (!state || !Array.isArray(state.commands) || !state.commands.length) return;
  const marker = [...defaults].sort().join('|');
  if (panel.dataset.commandDefaultsApplied === marker) return;
  panel.dataset.commandDefaultsApplied = marker;
  defaults.forEach(id => state.selected.add(id));
  persist(state.selected);
  const inputs = panel.querySelectorAll('[data-command-select]');
  inputs.forEach(input => { input.checked = state.selected.has(text(input.dataset.commandSelect)); });
}

function refreshFromSnapshot(panel, commands = cachedCommands()) {
  defaults = defaultsFrom(commands);
  applyDefaults(panel);
  scheduleDecorate(panel);
}

async function toggle(panel, id) {
  const active = !defaults.has(id);
  const status = panel.querySelector('#mugCommandStatus');
  try {
    if (status) status.textContent = active ? 'Ativando padrão…' : 'Removendo padrão…';
    await setDefault(id, active);

    const state = panel.__mugCommandState;
    if (state?.commands) {
      const item = state.commands.find(command => text(command.id) === id);
      if (item) item.iniciar_ativo = active;
      saveCachedCommands(state.commands);
    }

    if (active) {
      defaults.add(id);
      if (state) { state.selected.add(id); persist(state.selected); }
    } else {
      defaults.delete(id);
    }
    panel.dataset.commandDefaultsApplied = '';
    applyDefaults(panel);
    scheduleDecorate(panel);
    if (status) status.textContent = active ? 'Iniciará ativado.' : 'Padrão removido.';
    setTimeout(() => { if (status) status.textContent = ''; }, 1000);
  } catch (error) {
    if (status) status.textContent = error?.message || String(error);
  }
}

function install(panel) {
  if (!panel) return;
  const library = panel.querySelector('#mugCommandLibrary');
  if (!library) return void setTimeout(() => activate(), 80);
  if (panel.dataset.commandCompactBuild === BUILD && library.dataset.compactBound === BUILD) {
    refreshFromSnapshot(panel);
    return;
  }
  panel.dataset.commandCompactBuild = BUILD;
  library.dataset.compactBound = BUILD;
  styles();
  scheduleDecorate(panel);
  library.addEventListener('click', event => {
    const button = event.target.closest('[data-command-default-toggle]');
    if (button) { event.preventDefault(); event.stopPropagation(); toggle(panel, text(button.dataset.commandDefaultToggle)); }
  }, true);
  const observer = new MutationObserver(() => scheduleDecorate(panel));
  observer.observe(library, { childList: true, subtree: true });
  refreshFromSnapshot(panel);
}

function activate() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  const panel = document.getElementById('mugAutomationPanel');
  if (!panel) return void setTimeout(activate, 80);
  install(panel);
}

window.addEventListener('mug-commands-updated', event => {
  const panel = document.getElementById('mugAutomationPanel');
  if (!panel) return;
  refreshFromSnapshot(panel, event.detail?.commands || cachedCommands());
});
window.addEventListener('admin-v2-route-ready', event => { if (event.detail?.route === 'mug-studio') setTimeout(activate, 0); });
window.addEventListener('admin-v2-route', event => { if (event.detail?.route === 'mug-studio') setTimeout(activate, 0); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(activate, 0), { once: true }); else setTimeout(activate, 0);
