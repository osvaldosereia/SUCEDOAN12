const BUILD = '20260828-mug-art-command-compat-v2';
const SELECTED_KEY = 'da_admin_v2_mug_saved_commands_selected';

function text(value) {
  return String(value ?? '').trim();
}

function prepareShell(panel) {
  if (!panel) return false;
  const main = panel.querySelector('.mug-art-main');
  const upload = panel.querySelector('.mug-art-upload');
  const info = panel.querySelector('.mug-art-info');
  if (!main || !upload) return false;

  panel.classList.add('mugv7');
  main.classList.add('mugv7-main');
  upload.classList.add('mugv7-upload');
  info?.classList.add('mugv7-info');
  panel.querySelector('.mug-art-instruction')?.classList.add('mugv7-instruction');
  panel.querySelector('.mug-art-actions')?.classList.add('mugv7-actions');
  panel.querySelector('#mugAutomationStatus')?.classList.add('mugv7-status');
  panel.dataset.commandCompatBuild = BUILD;
  return true;
}

function selectedCommands(panel) {
  const state = panel?.__mugCommandState;
  if (!state || !Array.isArray(state.commands) || !(state.selected instanceof Set)) return [];
  return state.commands.filter(command => state.selected.has(command.id));
}

function mergedInstruction(panel) {
  const field = panel.querySelector('#mugArtInstruction');
  const manual = text(field?.value);
  const selected = selectedCommands(panel);
  const blocks = selected.map((item, index) => `COMANDO SALVO ${index + 1} — ${text(item.nome)}:\n${text(item.texto)}`);
  if (manual) blocks.push(`INSTRUÇÃO COMPLEMENTAR DIGITADA:\n${manual}`);
  return { manual, merged: blocks.join('\n\n') };
}

function bindGenerate(panel) {
  const button = panel.querySelector('#mugArtGenerate');
  const field = panel.querySelector('#mugArtInstruction');
  if (!button || !field || button.dataset.commandCompatBuild === BUILD) return;
  button.dataset.commandCompatBuild = BUILD;

  button.addEventListener('click', () => {
    const { manual, merged } = mergedInstruction(panel);
    if (!merged) return;
    field.value = merged;
    setTimeout(() => {
      if (field.value === merged) field.value = manual;
    }, 0);
  }, true);
}

function keepSelectionVisible(panel) {
  const update = () => {
    const state = panel.__mugCommandState;
    if (!state?.selected) return;
    try { localStorage.setItem(SELECTED_KEY, JSON.stringify([...state.selected])); } catch {}
  };
  panel.addEventListener('change', event => {
    if (event.target?.matches?.('[data-command-select]')) setTimeout(update, 0);
  });
}

function install(attempt = 0) {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return false;
  const panel = document.getElementById('mugAutomationPanel');
  if (!panel || !panel.querySelector('#mugArtGenerate')) {
    if (attempt < 50) setTimeout(() => install(attempt + 1), 80);
    return false;
  }
  if (!prepareShell(panel)) {
    if (attempt < 50) setTimeout(() => install(attempt + 1), 80);
    return false;
  }
  bindGenerate(panel);
  if (panel.dataset.commandCompatSelection !== BUILD) {
    panel.dataset.commandCompatSelection = BUILD;
    keepSelectionVisible(panel);
  }
  window.__daMugArtCommandCompat = BUILD;
  return true;
}

function activate() { setTimeout(() => install(), 0); }
window.addEventListener('admin-v2-route-ready', event => { if (event.detail?.route === 'mug-studio') activate(); });
window.addEventListener('admin-v2-route', event => { if (event.detail?.route === 'mug-studio') activate(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate, { once: true });
else activate();

export { BUILD, install, mergedInstruction };
