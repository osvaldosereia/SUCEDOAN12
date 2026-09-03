import { FIREBASE_BASE, text, safeKey, nowIso, audit } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { getMug } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260903-admin-canecas-personalization-settings-v2';
const SETTINGS_NODE = 'canecas/configuracoes/personalizacao_v2';
const HIDDEN_PROMPTS_NODE = 'canecas/personalizacao_prompts_ocultos';
const REMOTE_PROMPTS_NODE = 'canecas/personalizacao_prompts';
const FIELD_DEFS = Object.freeze([
  ['nome', 'Nome', 'text'],
  ['foto', 'Foto', 'image'],
  ['logo', 'Logo', 'image'],
  ['endereco', 'Endereço', 'text'],
  ['telefone', 'Telefone', 'text'],
  ['site', 'Site', 'text']
]);
const BUILTIN_PROMPTS = Object.freeze({
  nome: 'Trocar nome', foto: 'Trocar foto', nome_foto: 'Nome + foto', logo: 'Trocar logo', empresa: 'Logo + dados da empresa'
});
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let settingsCache = null;
let hiddenCache = null;

function toast(message, error = false) {
  const el = $('#toast'); if (!el) return;
  el.textContent = message; el.className = `toast${error ? ' error' : ''}`; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, error ? 5000 : 3000);
}
async function readNode(path) {
  const r = await fetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return (await r.json()) || null;
}
async function putNode(path, value) {
  const r = await fetch(`${FIREBASE_BASE}/${path}.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json().catch(() => null);
}
async function deleteNode(path) {
  const r = await fetch(`${FIREBASE_BASE}/${path}.json`, { method: 'DELETE', headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
}
function defaultSettings() {
  const campos = {};
  for (const [id, rotulo, tipo] of FIELD_DEFS) campos[id] = { disponivel: true, rotulo, marcado: false, obrigatorio: false, tipo };
  return { ativa_padrao: false, obrigatoria_padrao: false, correcao_padrao: false, prompt_padrao_id: '', campos };
}
function normalizeSettings(raw = {}) {
  const base = defaultSettings();
  const out = {
    ativa_padrao: typeof raw.ativa_padrao === 'boolean' ? raw.ativa_padrao : base.ativa_padrao,
    obrigatoria_padrao: typeof raw.obrigatoria_padrao === 'boolean' ? raw.obrigatoria_padrao : base.obrigatoria_padrao,
    correcao_padrao: typeof raw.correcao_padrao === 'boolean' ? raw.correcao_padrao : base.correcao_padrao,
    prompt_padrao_id: text(raw.prompt_padrao_id),
    campos: {}, atualizado_em: text(raw.atualizado_em)
  };
  for (const [id, rotulo, tipo] of FIELD_DEFS) {
    const item = raw?.campos?.[id] && typeof raw.campos[id] === 'object' ? raw.campos[id] : {};
    out.campos[id] = {
      disponivel: typeof item.disponivel === 'boolean' ? item.disponivel : true,
      rotulo: text(item.rotulo) || rotulo,
      marcado: item.marcado === true,
      obrigatorio: item.obrigatorio === true,
      tipo
    };
  }
  return out;
}
async function loadSettings(force = false) {
  if (settingsCache && !force) return settingsCache;
  settingsCache = normalizeSettings((await readNode(SETTINGS_NODE).catch(() => null)) || {});
  return settingsCache;
}
async function loadHidden(force = false) {
  if (hiddenCache && !force) return hiddenCache;
  const raw = (await readNode(HIDDEN_PROMPTS_NODE).catch(() => null)) || {};
  hiddenCache = new Set(Object.entries(raw).filter(([, value]) => value === true || value?.oculto === true).map(([id]) => id));
  return hiddenCache;
}
async function availablePrompts() {
  const [remote, hidden] = await Promise.all([readNode(REMOTE_PROMPTS_NODE).catch(() => ({})), loadHidden()]);
  const map = { ...BUILTIN_PROMPTS };
  for (const [id, value] of Object.entries(remote || {})) {
    if (!value || value.ativo === false) continue;
    map[id] = text(value.nome) || id;
  }
  return Object.entries(map).filter(([id]) => !hidden.has(id)).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
}
function fieldExplicit(product = {}, id) {
  const cfg = product.personalizacao && typeof product.personalizacao === 'object' ? product.personalizacao : {};
  if (cfg.campos && Object.prototype.hasOwnProperty.call(cfg.campos, id)) return cfg.campos[id] || {};
  const legacy = product.personalizacao_campos;
  if (Array.isArray(legacy)) return legacy.find(item => text(item?.id) === id) || null;
  if (legacy && typeof legacy === 'object' && Object.prototype.hasOwnProperty.call(legacy, id)) return legacy[id] || {};
  return null;
}
function hasOwn(obj, key) { return Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key)); }

async function waitPromptPanel() {
  for (let i = 0; i < 30; i += 1) {
    if (!location.hash.includes('settings')) return null;
    const panel = $('#cfPersonalizationPromptSettings');
    if (panel) return panel;
    await sleep(80);
  }
  return null;
}
async function enhancePromptDeletion() {
  const panel = await waitPromptPanel();
  if (!panel) return;
  const hidden = await loadHidden(true);
  for (const row of $$('.cf-prompt-row[data-prompt-id]', panel)) {
    const id = text(row.dataset.promptId);
    if (!id) continue;
    row.hidden = hidden.has(id);
    const actions = $('.cf-prompt-actions', row);
    if (!actions || $('[data-hide-prompt-v2]', actions)) continue;
    if (BUILTIN_PROMPTS[id]) {
      const button = document.createElement('button');
      button.className = 'danger'; button.type = 'button'; button.dataset.hidePromptV2 = id; button.textContent = 'Excluir';
      button.onclick = () => hidePrompt(id);
      actions.appendChild(button);
    }
  }
  let restore = $('#cfRestoreBuiltinPrompts', panel);
  if (!restore) {
    restore = document.createElement('button');
    restore.id = 'cfRestoreBuiltinPrompts'; restore.className = 'secondary'; restore.type = 'button'; restore.textContent = 'Restaurar prompts excluídos';
    restore.onclick = restorePrompts;
    $('.mini-actions', panel)?.appendChild(restore);
  }
  restore.hidden = hidden.size === 0;
}
async function hidePrompt(id) {
  if (!id || !confirm(`Excluir o prompt “${BUILTIN_PROMPTS[id] || id}” da lista? As canecas já salvas mantêm a cópia do texto que usavam.`)) return;
  await putNode(`${HIDDEN_PROMPTS_NODE}/${safeKey(id)}`, { oculto: true, atualizado_em: nowIso() });
  hiddenCache = null;
  await audit('personalizacao_prompt_ocultado_v2', { prompt_id: id }).catch(() => {});
  toast('Prompt excluído da lista.');
  await enhancePromptDeletion();
  await renderSettingsPanel();
}
async function restorePrompts() {
  if (!confirm('Restaurar todos os prompts padrão excluídos?')) return;
  await deleteNode(HIDDEN_PROMPTS_NODE);
  hiddenCache = null;
  await audit('personalizacao_prompts_restaurados_v2', {}).catch(() => {});
  toast('Prompts padrão restaurados.');
  await enhancePromptDeletion();
  await renderSettingsPanel();
}

async function renderSettingsPanel() {
  if (!location.hash.includes('settings')) return;
  const root = $('#settings'); if (!root) return;
  const [cfg, prompts] = await Promise.all([loadSettings(true), availablePrompts()]);
  let section = $('#cfPersonalizationGlobalSettingsV2', root);
  if (!section) {
    section = document.createElement('section'); section.className = 'panel'; section.id = 'cfPersonalizationGlobalSettingsV2'; root.appendChild(section);
  }
  const promptOptions = `<option value="">Sem prompt-base</option>${prompts.map(([id, name]) => `<option value="${esc(id)}" ${cfg.prompt_padrao_id === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}`;
  section.innerHTML = `
    <div class="panel-head"><div><h2>Seletores da personalização</h2><p>Defina o padrão da empresa. Cada caneca continua podendo ter sua própria exceção.</p></div></div>
    <div class="panel-body">
      <div class="form">
        <label>Permitir personalização por padrão<select id="cfGlobalPersonalActive"><option value="0" ${!cfg.ativa_padrao ? 'selected' : ''}>Não</option><option value="1" ${cfg.ativa_padrao ? 'selected' : ''}>Sim</option></select></label>
        <label>Obrigatória por padrão<select id="cfGlobalPersonalRequired"><option value="0" ${!cfg.obrigatoria_padrao ? 'selected' : ''}>Não</option><option value="1" ${cfg.obrigatoria_padrao ? 'selected' : ''}>Sim</option></select></label>
        <label>Corrigir dados após gerar<select id="cfGlobalPersonalCorrection"><option value="0" ${!cfg.correcao_padrao ? 'selected' : ''}>Não</option><option value="1" ${cfg.correcao_padrao ? 'selected' : ''}>Sim</option></select></label>
        <label>Prompt inicial<select id="cfGlobalPromptDefault">${promptOptions}</select></label>
      </div>
      <h3 style="margin:16px 0 8px">Campos disponíveis no cadastro da caneca</h3>
      <p style="margin-top:0;color:#6e756d;font-size:12px">Você pode ocultar um seletor do cadastro, renomeá-lo e escolher como ele nasce em uma caneca ainda não configurada. O tipo Texto/Imagem fica protegido porque define como o personalizador envia o dado para a IA.</p>
      <div id="cfGlobalPersonalFields" style="display:grid;gap:7px">
        ${FIELD_DEFS.map(([id, label, type]) => { const item = cfg.campos[id]; return `<div class="cf-personal-field" data-global-personal-field="${esc(id)}"><label><input type="checkbox" data-global-available ${item.disponivel ? 'checked' : ''}> ${esc(label)}</label><input type="text" data-global-label value="${esc(item.rotulo)}"><label class="cf-personal-required"><input type="checkbox" data-global-checked ${item.marcado ? 'checked' : ''}> marcado</label><label class="cf-personal-required"><input type="checkbox" data-global-required ${item.obrigatorio ? 'checked' : ''}> obrigatório</label><small>${type === 'image' ? 'Imagem' : 'Texto'}</small></div>`; }).join('')}
      </div>
      <div class="mini-actions" style="margin-top:12px"><button class="primary" id="cfSavePersonalizationGlobalV2" type="button">Salvar seletores</button></div>
    </div>`;
  $('#cfSavePersonalizationGlobalV2', section).onclick = saveSettingsPanel;
  await enhancePromptDeletion();
}
async function saveSettingsPanel() {
  const campos = {};
  for (const [id, defaultLabel, type] of FIELD_DEFS) {
    const row = $(`[data-global-personal-field="${id}"]`);
    if (!row) continue;
    const marcado = $('[data-global-checked]', row)?.checked === true;
    campos[id] = {
      disponivel: $('[data-global-available]', row)?.checked === true,
      rotulo: text($('[data-global-label]', row)?.value) || defaultLabel,
      marcado,
      obrigatorio: marcado && $('[data-global-required]', row)?.checked === true,
      tipo
    };
  }
  const value = {
    ativa_padrao: $('#cfGlobalPersonalActive')?.value === '1',
    obrigatoria_padrao: $('#cfGlobalPersonalRequired')?.value === '1',
    correcao_padrao: $('#cfGlobalPersonalCorrection')?.value === '1',
    prompt_padrao_id: text($('#cfGlobalPromptDefault')?.value),
    campos,
    atualizado_em: nowIso(), atualizado_por: 'admin_canecas'
  };
  await putNode(SETTINGS_NODE, value);
  settingsCache = normalizeSettings(value);
  await audit('personalizacao_config_global_v2', { ...value, campos: Object.keys(campos) }).catch(() => {});
  toast('Seletores da personalização salvos.');
}

async function waitDrawer(productKey) {
  for (let i = 0; i < 35; i += 1) {
    const root = $('#drawerContent');
    if (root?.dataset.productKey === productKey && $('#cfPersonalizationConfig', root)) return root;
    await sleep(80);
  }
  return null;
}
async function applyDrawerSettings(productKey) {
  const root = await waitDrawer(productKey); if (!root || root.dataset.cfPersonalizationSettingsV2 === productKey) return;
  const [p, cfg, hidden] = await Promise.all([getMug(productKey), loadSettings(), loadHidden()]);
  if (!p || !root.isConnected || root.dataset.productKey !== productKey) return;
  const personal = p.personalizacao && typeof p.personalizacao === 'object' ? p.personalizacao : {};
  const active = $('#cfPersonalizationActive', root);
  if (active && !hasOwn(personal, 'ativa') && typeof p.personalizavel !== 'boolean' && typeof p.loja_integrada_personalizavel !== 'boolean') active.value = cfg.ativa_padrao ? '1' : '0';
  const required = $('#cfPersonalizationRequired', root);
  if (required && !hasOwn(personal, 'obrigatoria')) required.value = cfg.obrigatoria_padrao ? '1' : '0';
  const prompt = $('#cfPersonalizationPrompt', root);
  if (prompt) {
    for (const option of [...prompt.options]) if (option.value && hidden.has(option.value)) option.remove();
    if (!text(personal.prompt_base_id || p.personalizacao_prompt_base) && cfg.prompt_padrao_id && [...prompt.options].some(o => o.value === cfg.prompt_padrao_id)) prompt.value = cfg.prompt_padrao_id;
  }
  for (const [id, defaultLabel] of FIELD_DEFS) {
    const row = $(`[data-cf-personal-field="${id}"]`, root); if (!row) continue;
    const global = cfg.campos[id], explicit = fieldExplicit(p, id);
    if (!global.disponivel) { row.remove(); continue; }
    const enabled = $('[data-enabled]', row), requiredBox = $('[data-required]', row), labelInput = $('[data-label]', row);
    const titleLabel = $('label', row);
    if (titleLabel) {
      const checkbox = $('input[type="checkbox"]', titleLabel);
      titleLabel.textContent = '';
      if (checkbox) titleLabel.appendChild(checkbox);
      titleLabel.append(` ${global.rotulo || defaultLabel}`);
    }
    if (!explicit) {
      if (enabled) enabled.checked = global.marcado;
      if (requiredBox) { requiredBox.checked = global.marcado && global.obrigatorio; requiredBox.disabled = !global.marcado; }
      if (labelInput) labelInput.value = global.rotulo || defaultLabel;
    } else if (labelInput && !text(explicit.rotulo || explicit.label)) labelInput.value = global.rotulo || defaultLabel;
  }
  const correction = await waitCorrection(root);
  if (correction && !hasOwn(personal, 'permitir_correcao_pos_geracao') && typeof p.personalizacao_permitir_correcao !== 'boolean') correction.value = cfg.correcao_padrao ? '1' : '0';
  root.dataset.cfPersonalizationSettingsV2 = productKey;
  active?.dispatchEvent(new Event('change', { bubbles: true }));
  prompt?.dispatchEvent(new Event('change', { bubbles: true }));
}
async function waitCorrection(root) {
  for (let i = 0; i < 20; i += 1) {
    const el = $('#cfPersonalizationAllowCorrection', root); if (el) return el;
    await sleep(60);
  }
  return null;
}

window.addEventListener('admin-canecas:drawer', event => {
  const detail = event.detail || {};
  if (detail.kind === 'mug' && detail.id) applyDrawerSettings(text(detail.id)).catch(error => console.error('[Admin Canecas] seletores V2:', error));
});
window.addEventListener('admin-canecas:route', event => {
  if (event.detail?.route === 'settings') setTimeout(() => renderSettingsPanel().catch(console.error), 100);
});
window.addEventListener('admin-canecas:settings-rendered', () => setTimeout(() => renderSettingsPanel().catch(console.error), 100));
if (location.hash.includes('settings')) setTimeout(() => renderSettingsPanel().catch(console.error), 350);

document.documentElement.dataset.cfPersonalizationSettingsV2 = BUILD;
window.__CF_PERSONALIZATION_SETTINGS_V2__ = { BUILD, loadSettings, loadHidden, renderSettingsPanel };
