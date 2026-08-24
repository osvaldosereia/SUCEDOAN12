import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { text } from './core/utils.js';

const BUILD = '20260823-canecas-command-library-v1';
const COMMANDS_NODE = 'canecas/comandos_criacao';
const SELECTED_KEY = 'da_admin_v2_mug_saved_commands_selected';

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function commandBaseUrl() {
  const config = loadConfig();
  const base = text(config.firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
  if (!base) throw new Error('Firebase não está configurado.');
  return `${base}/${COMMANDS_NODE}`;
}

function commandId() {
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function selectedIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SELECTED_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function persistSelected(ids) {
  localStorage.setItem(SELECTED_KEY, JSON.stringify([...ids]));
}

function normalizeCollection(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([key, value]) => ({
      id: text(value.id || key),
      nome: text(value.nome),
      texto: text(value.texto),
      criado_em: text(value.criado_em),
      atualizado_em: text(value.atualizado_em),
    }))
    .filter(item => item.id && item.nome && item.texto)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

async function fetchCommands() {
  const response = await fetch(`${commandBaseUrl()}.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao carregar os comandos.`);
  return normalizeCollection(await response.json());
}

async function saveCommand(command) {
  const now = new Date().toISOString();
  const payload = {
    id: command.id || commandId(),
    nome: text(command.nome),
    texto: text(command.texto),
    criado_em: command.criado_em || now,
    atualizado_em: now,
  };
  if (!payload.nome) throw new Error('Dê um nome ao comando.');
  if (!payload.texto) throw new Error('Escreva o comando.');
  const response = await fetch(`${commandBaseUrl()}/${encodeURIComponent(payload.id)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao salvar o comando.`);
  return payload;
}

async function deleteCommand(id) {
  const response = await fetch(`${commandBaseUrl()}/${encodeURIComponent(id)}.json`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao excluir o comando.`);
}

function installStyles() {
  if (document.getElementById('mugCommandLibraryStyles')) return;
  const style = document.createElement('style');
  style.id = 'mugCommandLibraryStyles';
  style.textContent = `
    .mugv7-main.has-command-library{grid-template-columns:minmax(260px,420px) minmax(240px,1fr) minmax(280px,360px);align-items:start}
    .mug-command-library{border:1px solid #e2e4de;border-radius:18px;padding:14px;background:#fff;display:grid;gap:12px;position:sticky;top:12px;max-height:calc(100vh - 120px);overflow:auto}
    .mug-command-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
    .mug-command-head h3{margin:0 0 3px;font-size:16px}.mug-command-head p{margin:0;color:#70746d;font-size:12px}
    .mug-command-form{display:grid;gap:7px;padding:10px;border:1px solid #eceee9;border-radius:13px;background:#fafbf8}
    .mug-command-form input,.mug-command-form textarea{width:100%;box-sizing:border-box;border:1px solid #ccd0c8;border-radius:10px;padding:9px;background:#fff;font:inherit}
    .mug-command-form textarea{min-height:76px;resize:vertical}
    .mug-command-form-actions{display:flex;gap:7px;flex-wrap:wrap}
    .mug-command-status{font-size:11px;min-height:14px;color:#666}
    .mug-command-toolbar{display:flex;align-items:center;justify-content:space-between;gap:7px;border-top:1px solid #eceee9;padding-top:10px}
    .mug-command-selected-count{font-size:11px;font-weight:800;color:#555}
    .mug-command-list{display:grid;gap:7px}
    .mug-command-item{border:1px solid #e2e4de;border-radius:12px;padding:9px;display:grid;grid-template-columns:22px 1fr;gap:7px;background:#fff}
    .mug-command-item:has(input:checked){border-color:#171817;box-shadow:0 0 0 1px #171817 inset;background:#fafafa}
    .mug-command-check{padding-top:2px}.mug-command-check input{width:17px;height:17px;accent-color:#181918}
    .mug-command-body{min-width:0;display:grid;gap:4px}.mug-command-body strong{font-size:12px}.mug-command-body p{margin:0;color:#666;font-size:11px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .mug-command-actions{display:flex;gap:5px;flex-wrap:wrap}.mug-command-actions button{padding:4px 7px!important;font-size:9px!important;min-height:24px!important}
    .mug-command-empty{padding:16px 8px;text-align:center;color:#777;font-size:12px;border:1px dashed #d9dcd5;border-radius:11px}
    .mug-command-effective{padding:8px 9px;border-radius:10px;background:#f4f5f1;font-size:11px;color:#555;line-height:1.35}
    @media(max-width:1180px){.mugv7-main.has-command-library{grid-template-columns:minmax(260px,420px) 1fr}.mug-command-library{grid-column:1/-1;position:static;max-height:none}.mug-command-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:760px){.mugv7-main.has-command-library{grid-template-columns:1fr}.mug-command-list{grid-template-columns:1fr}.mug-command-library{grid-column:auto}}
  `;
  document.head.appendChild(style);
}

function getState(panel) {
  if (!panel.__mugCommandState) {
    panel.__mugCommandState = {
      commands: [],
      selected: selectedIds(),
      editingId: '',
      loading: false,
    };
  }
  return panel.__mugCommandState;
}

function effectiveInstruction(panel) {
  const state = getState(panel);
  const manual = text(panel.querySelector('#mugv7Instruction')?.value);
  const selected = state.commands.filter(item => state.selected.has(item.id));
  const blocks = selected.map((item, index) => `COMANDO SALVO ${index + 1} — ${item.nome}:\n${item.texto}`);
  if (manual) blocks.push(`INSTRUÇÃO COMPLEMENTAR DIGITADA:\n${manual}`);
  return blocks.join('\n\n');
}

function renderList(panel) {
  const state = getState(panel);
  const list = panel.querySelector('#mugCommandList');
  const count = panel.querySelector('#mugCommandSelectedCount');
  const effective = panel.querySelector('#mugCommandEffective');
  if (!list || !count || !effective) return;
  state.selected = new Set([...state.selected].filter(id => state.commands.some(item => item.id === id)));
  persistSelected(state.selected);
  count.textContent = `${state.selected.size} selecionado${state.selected.size === 1 ? '' : 's'}`;
  effective.textContent = state.selected.size
    ? `Os ${state.selected.size} comando${state.selected.size === 1 ? '' : 's'} selecionado${state.selected.size === 1 ? '' : 's'} serão somados à instrução complementar ao gerar.`
    : 'Selecione um ou mais comandos para acrescentá-los automaticamente à próxima criação.';
  list.innerHTML = state.commands.length
    ? state.commands.map(item => `
      <article class="mug-command-item">
        <label class="mug-command-check" title="Usar este comando">
          <input type="checkbox" data-command-select="${escapeHtml(item.id)}" ${state.selected.has(item.id) ? 'checked' : ''}>
        </label>
        <div class="mug-command-body">
          <strong>${escapeHtml(item.nome)}</strong>
          <p title="${escapeHtml(item.texto)}">${escapeHtml(item.texto)}</p>
          <div class="mug-command-actions">
            <button class="button secondary compact" type="button" data-command-edit="${escapeHtml(item.id)}">Editar</button>
            <button class="button secondary compact" type="button" data-command-delete="${escapeHtml(item.id)}">Excluir</button>
          </div>
        </div>
      </article>`).join('')
    : '<div class="mug-command-empty">Nenhum comando salvo ainda.</div>';
}

function resetForm(panel) {
  const state = getState(panel);
  state.editingId = '';
  const name = panel.querySelector('#mugCommandName');
  const body = panel.querySelector('#mugCommandText');
  const save = panel.querySelector('#mugCommandSave');
  const cancel = panel.querySelector('#mugCommandCancel');
  if (name) name.value = '';
  if (body) body.value = '';
  if (save) save.textContent = 'Salvar comando';
  if (cancel) cancel.hidden = true;
}

function editCommand(panel, id) {
  const state = getState(panel);
  const item = state.commands.find(command => command.id === id);
  if (!item) return;
  state.editingId = id;
  panel.querySelector('#mugCommandName').value = item.nome;
  panel.querySelector('#mugCommandText').value = item.texto;
  panel.querySelector('#mugCommandSave').textContent = 'Salvar alteração';
  panel.querySelector('#mugCommandCancel').hidden = false;
  panel.querySelector('#mugCommandName').focus();
}

async function refreshCommands(panel) {
  const state = getState(panel);
  if (state.loading) return;
  const status = panel.querySelector('#mugCommandStatus');
  state.loading = true;
  if (status) status.textContent = 'Carregando comandos…';
  try {
    state.commands = await fetchCommands();
    renderList(panel);
    if (status) status.textContent = '';
  } catch (error) {
    console.error('Falha ao carregar comandos de caneca:', error);
    if (status) status.textContent = error?.message || String(error);
  } finally {
    state.loading = false;
  }
}

async function handleSave(panel) {
  const state = getState(panel);
  const status = panel.querySelector('#mugCommandStatus');
  const name = text(panel.querySelector('#mugCommandName')?.value);
  const body = text(panel.querySelector('#mugCommandText')?.value);
  const current = state.commands.find(item => item.id === state.editingId);
  try {
    if (status) status.textContent = 'Salvando…';
    await saveCommand({
      id: current?.id,
      criado_em: current?.criado_em,
      nome: name,
      texto: body,
    });
    resetForm(panel);
    await refreshCommands(panel);
    if (status) status.textContent = 'Comando salvo.';
    setTimeout(() => { if (status?.textContent === 'Comando salvo.') status.textContent = ''; }, 1800);
  } catch (error) {
    if (status) status.textContent = error?.message || String(error);
  }
}

async function handleDelete(panel, id) {
  const state = getState(panel);
  const item = state.commands.find(command => command.id === id);
  if (!item) return;
  if (!window.confirm(`Excluir o comando "${item.nome}"?`)) return;
  const status = panel.querySelector('#mugCommandStatus');
  try {
    if (status) status.textContent = 'Excluindo…';
    await deleteCommand(id);
    state.selected.delete(id);
    persistSelected(state.selected);
    await refreshCommands(panel);
    if (status) status.textContent = '';
  } catch (error) {
    if (status) status.textContent = error?.message || String(error);
  }
}

function installGenerateMerge(panel) {
  const button = panel.querySelector('#mugv7Generate');
  if (!button || button.dataset.commandMergeBound === BUILD) return;
  button.dataset.commandMergeBound = BUILD;
  button.addEventListener('click', () => {
    const field = panel.querySelector('#mugv7Instruction');
    if (!field) return;
    const manual = field.value;
    const merged = effectiveInstruction(panel);
    if (!merged) return;
    field.value = merged;
    setTimeout(() => { field.value = manual; }, 0);
  }, true);
}

function installLibrary(panel) {
  if (!panel || panel.dataset.commandLibraryBuild === BUILD) return;
  const main = panel.querySelector('.mugv7-main');
  if (!main) return;
  panel.dataset.commandLibraryBuild = BUILD;
  installStyles();
  main.classList.add('has-command-library');
  const library = document.createElement('aside');
  library.className = 'mug-command-library';
  library.id = 'mugCommandLibrary';
  library.innerHTML = `
    <div class="mug-command-head">
      <div><h3>Comandos salvos</h3><p>Selecione um ou mais para reutilizar.</p></div>
      <button class="button secondary compact" id="mugCommandRefresh" type="button">Atualizar</button>
    </div>
    <div class="mug-command-form">
      <input id="mugCommandName" maxlength="60" placeholder="Nome do comando · Ex.: Sem texto">
      <textarea id="mugCommandText" maxlength="800" placeholder="Ex.: Não use palavras, frases ou letras na arte."></textarea>
      <div class="mug-command-form-actions">
        <button class="button primary compact" id="mugCommandSave" type="button">Salvar comando</button>
        <button class="button secondary compact" id="mugCommandCancel" type="button" hidden>Cancelar</button>
      </div>
      <div class="mug-command-status" id="mugCommandStatus"></div>
    </div>
    <div class="mug-command-toolbar">
      <span class="mug-command-selected-count" id="mugCommandSelectedCount">0 selecionados</span>
      <button class="button secondary compact" id="mugCommandClearSelection" type="button">Limpar seleção</button>
    </div>
    <div class="mug-command-effective" id="mugCommandEffective"></div>
    <div class="mug-command-list" id="mugCommandList"></div>`;
  main.appendChild(library);

  library.querySelector('#mugCommandSave').addEventListener('click', () => handleSave(panel));
  library.querySelector('#mugCommandCancel').addEventListener('click', () => resetForm(panel));
  library.querySelector('#mugCommandRefresh').addEventListener('click', () => refreshCommands(panel));
  library.querySelector('#mugCommandClearSelection').addEventListener('click', () => {
    const state = getState(panel);
    state.selected.clear();
    persistSelected(state.selected);
    renderList(panel);
  });
  library.querySelector('#mugCommandList').addEventListener('change', event => {
    const input = event.target.closest('[data-command-select]');
    if (!input) return;
    const state = getState(panel);
    const id = text(input.dataset.commandSelect);
    if (input.checked) state.selected.add(id);
    else state.selected.delete(id);
    persistSelected(state.selected);
    renderList(panel);
  });
  library.querySelector('#mugCommandList').addEventListener('click', event => {
    const edit = event.target.closest('[data-command-edit]');
    const remove = event.target.closest('[data-command-delete]');
    if (edit) editCommand(panel, text(edit.dataset.commandEdit));
    if (remove) handleDelete(panel, text(remove.dataset.commandDelete));
  });

  installGenerateMerge(panel);
  renderList(panel);
  refreshCommands(panel);
}

function activate() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  const panel = document.getElementById('mugAutomationPanel');
  if (!panel) return void setTimeout(activate, 80);
  if (!panel.querySelector('.mugv7-main')) return void setTimeout(activate, 80);
  installLibrary(panel);
}

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(activate, 0);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(activate, 0);
});

const observer = new MutationObserver(() => {
  if (window.adminV2CurrentRoute?.() === 'mug-studio') activate();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(activate, 0), { once: true });
else setTimeout(activate, 0);

export { fetchCommands, saveCommand, deleteCommand, effectiveInstruction };
