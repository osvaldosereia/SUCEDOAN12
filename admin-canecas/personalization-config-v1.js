import { FIREBASE_BASE, text, safeKey, nowIso, fbGet, fbWrite, audit } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { getMug, patchMug } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260831-admin-canecas-personalization-config-v1';
const PROMPTS_NODE = 'canecas/personalizacao_prompts';

const FIELD_DEFS = Object.freeze([
  ['nome', 'Nome', 'text'],
  ['foto', 'Foto', 'image'],
  ['logo', 'Logo', 'image'],
  ['endereco', 'Endereço', 'text'],
  ['telefone', 'Telefone', 'text'],
  ['site', 'Site', 'text']
]);

const DEFAULT_PROMPTS = Object.freeze({
  nome: {
    nome: 'Trocar nome',
    prompt: 'Substitua exclusivamente o nome permitido pelo valor informado pelo cliente. Preserve integralmente todos os demais elementos, composição, cores, fundo, ilustração e estilo visual.',
    versao: 1,
    interno: true
  },
  foto: {
    nome: 'Trocar foto',
    prompt: 'Substitua exclusivamente a fotografia autorizada pela foto enviada pelo cliente. Preserve moldura, fundo, textos, cores, composição e todos os demais elementos do modelo.',
    versao: 1,
    interno: true
  },
  nome_foto: {
    nome: 'Nome + foto',
    prompt: 'Substitua somente o nome e a fotografia autorizados pelos dados enviados pelo cliente. Preserve integralmente todos os outros elementos do modelo, incluindo composição, molduras, fundo, cores e estilo.',
    versao: 1,
    interno: true
  },
  logo: {
    nome: 'Trocar logo',
    prompt: 'Substitua exclusivamente a logomarca autorizada pela logomarca enviada pelo cliente. Preserve fielmente símbolo, textos e proporções da logo recebida e mantenha inalterados todos os demais elementos do modelo.',
    versao: 1,
    interno: true
  },
  empresa: {
    nome: 'Logo + dados da empresa',
    prompt: 'Substitua exclusivamente a logomarca e os dados empresariais autorizados neste modelo. Preserve a estrutura, distribuição visual, fundo, cores e demais elementos. A logomarca enviada deve ser mantida fiel, sem reinterpretar símbolo ou textos.',
    versao: 1,
    interno: true
  }
});

const state = { prompts: null, editingPromptId: '' };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const slug = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, error ? 5200 : 2800);
}

function injectStyles() {
  if ($('#cfPersonalizationConfigStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfPersonalizationConfigStyles';
  style.textContent = `
    .cf-personal-config{border:1px solid #e4e6df;border-radius:12px;padding:12px;background:#fbfcf9}
    .cf-personal-config-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
    .cf-personal-config-head h3{margin:0}.cf-personal-config-head p{margin:3px 0 0;color:#6e756d;font-size:12px}
    .cf-personal-fields{display:grid;gap:7px;margin:10px 0}
    .cf-personal-field{display:grid;grid-template-columns:minmax(115px,.8fr) minmax(150px,1.3fr) auto;gap:8px;align-items:center;padding:8px;border:1px solid #e8e9e4;border-radius:9px;background:#fff}
    .cf-personal-field>label{display:flex;gap:7px;align-items:center;margin:0;font-weight:700}
    .cf-personal-field input[type="text"]{width:100%;box-sizing:border-box}
    .cf-personal-required{display:flex!important;align-items:center;gap:5px!important;white-space:nowrap;font-weight:500!important;font-size:12px}
    .cf-personal-help{font-size:12px;color:#6e756d;margin:7px 0 0}
    .cf-prompt-list{display:grid;gap:7px;margin-top:10px}
    .cf-prompt-row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:9px;border:1px solid #e5e6e1;border-radius:9px}
    .cf-prompt-row small{display:block;color:#6e756d;margin-top:3px;max-width:760px}
    .cf-prompt-actions{display:flex;gap:5px;flex:0 0 auto}
    .cf-prompt-editor textarea{width:100%;box-sizing:border-box;min-height:100px}
    @media(max-width:720px){.cf-personal-field{grid-template-columns:1fr}.cf-prompt-row{display:block}.cf-prompt-actions{margin-top:8px}}
  `;
  document.head.appendChild(style);
}

async function loadPrompts(force = false) {
  if (state.prompts && !force) return state.prompts;
  const remote = (await fbGet(PROMPTS_NODE).catch(() => ({}))) || {};
  const merged = {};
  for (const [id, value] of Object.entries(DEFAULT_PROMPTS)) merged[id] = { id, ...value };
  for (const [id, value] of Object.entries(remote)) {
    if (!value || value.ativo === false) continue;
    merged[id] = { ...(merged[id] || {}), id, ...(value || {}), interno: Boolean(DEFAULT_PROMPTS[id]) };
  }
  state.prompts = merged;
  return merged;
}

function legacyFields(p = {}) {
  const raw = p.personalizacao?.campos || p.personalizacao_campos || p.campos_personalizacao || {};
  const out = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = text(item?.id || item?.key || item?.nome).toLowerCase();
      if (id) out[id] = item || {};
    }
  } else if (raw && typeof raw === 'object') {
    for (const [id, value] of Object.entries(raw)) out[id] = value && typeof value === 'object' ? value : { ativo: Boolean(value) };
  }
  return out;
}

function configFromProduct(p = {}) {
  const cfg = p.personalizacao && typeof p.personalizacao === 'object' ? p.personalizacao : {};
  const legacy = legacyFields(p);
  const active = cfg.ativa === true || p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true || p.personalizavel === true;
  const fields = {};
  for (const [id, defaultLabel, type] of FIELD_DEFS) {
    const item = legacy[id] || cfg.campos?.[id] || {};
    fields[id] = {
      ativo: item.ativo === true || item.enabled === true,
      obrigatorio: item.obrigatorio === true || item.required === true,
      rotulo: text(item.rotulo || item.label) || defaultLabel,
      tipo: type
    };
  }
  return {
    ativa: active,
    obrigatoria: cfg.obrigatoria === true,
    prompt_base_id: text(cfg.prompt_base_id || p.personalizacao_prompt_base),
    prompt_especifico: text(cfg.prompt_especifico || p.personalizacao_prompt_especifico),
    config_version: Number(cfg.config_version || 0) || 0,
    campos: fields
  };
}

function fieldRow(id, def, current) {
  return `<div class="cf-personal-field" data-cf-personal-field="${esc(id)}">
    <label><input type="checkbox" data-enabled ${current.ativo ? 'checked' : ''}> ${esc(def[1])}</label>
    <input type="text" data-label value="${esc(current.rotulo || def[1])}" aria-label="Rótulo mostrado para ${esc(def[1])}">
    <label class="cf-personal-required"><input type="checkbox" data-required ${current.obrigatorio ? 'checked' : ''} ${current.ativo ? '' : 'disabled'}> obrigatório</label>
  </div>`;
}

function promptOptions(selected = '') {
  const entries = Object.values(state.prompts || {}).sort((a, b) => text(a.nome).localeCompare(text(b.nome), 'pt-BR'));
  return `<option value="">Sem prompt-base</option>${entries.map(p => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.nome || p.id)}</option>`).join('')}`;
}

async function injectProductConfig(productKey) {
  const root = $('#drawerContent');
  if (!root || root.dataset.cfPersonalizationInjected === productKey) return;
  const p = await getMug(productKey);
  if (!p || !$('#drawerContent') || $('#drawerContent').dataset.productKey !== productKey) return;
  await loadPrompts();

  const cfg = configFromProduct(p);
  const section = document.createElement('div');
  section.className = 'form-section cf-personal-config';
  section.id = 'cfPersonalizationConfig';
  section.innerHTML = `
    <div class="cf-personal-config-head">
      <div><h3>Personalização deste modelo</h3><p>Libere somente o que o cliente pode alterar nesta caneca.</p></div>
      <span class="badge ${cfg.ativa ? 'good' : ''}" id="cfPersonalizationBadge">${cfg.ativa ? 'ATIVA' : 'DESATIVADA'}</span>
    </div>
    <div class="form">
      <label>Permitir personalização
        <select id="cfPersonalizationActive"><option value="1" ${cfg.ativa ? 'selected' : ''}>Sim</option><option value="0" ${!cfg.ativa ? 'selected' : ''}>Não</option></select>
      </label>
      <label>Obrigatória para comprar
        <select id="cfPersonalizationRequired"><option value="0" ${!cfg.obrigatoria ? 'selected' : ''}>Não</option><option value="1" ${cfg.obrigatoria ? 'selected' : ''}>Sim</option></select>
      </label>
      <label>Prompt padrão
        <select id="cfPersonalizationPrompt">${promptOptions(cfg.prompt_base_id)}</select>
      </label>
    </div>
    <div class="cf-personal-fields">${FIELD_DEFS.map(def => fieldRow(def[0], def, cfg.campos[def[0]])).join('')}</div>
    <label class="span2">Instrução específica deste modelo
      <textarea id="cfPersonalizationSpecific" rows="4" placeholder="Ex.: o nome fica abaixo da ilustração. Não alterar flores, fundo ou frase.">${esc(cfg.prompt_especifico)}</textarea>
    </label>
    <p class="cf-personal-help">O cliente verá somente os campos marcados. Não haverá campo de instrução livre no personalizador público.</p>
    <div class="notice" id="cfPersonalizationSummary"></div>
  `;

  const contentSection = [...root.querySelectorAll('.form-section')].find(s => text($('h3', s)?.textContent) === 'CanecaFácil · conteúdo');
  if (contentSection) root.insertBefore(section, contentSection);
  else root.appendChild(section);

  const legacySelect = $('#cfPersonalizable', root);
  if (legacySelect?.closest('label')) legacySelect.closest('label').style.display = 'none';

  root.dataset.cfPersonalizationInjected = productKey;
  bindProductConfig(p, cfg);
  wrapExistingSaveButtons(productKey);
  updateSummary();
}

function updateFieldState(row) {
  const on = $('[data-enabled]', row)?.checked;
  const req = $('[data-required]', row);
  if (req) {
    req.disabled = !on;
    if (!on) req.checked = false;
  }
}

function updateSummary() {
  const box = $('#cfPersonalizationSummary');
  if (!box) return;
  const active = $('#cfPersonalizationActive')?.value === '1';
  const names = $$('[data-cf-personal-field]').filter(row => $('[data-enabled]', row)?.checked)
    .map(row => text($('[data-label]', row)?.value) || row.dataset.cfPersonalField);
  const promptId = text($('#cfPersonalizationPrompt')?.value);
  const promptName = state.prompts?.[promptId]?.nome || 'sem prompt-base';
  box.innerHTML = active
    ? `<b>Cliente poderá alterar:</b> ${names.length ? esc(names.join(', ')) : 'nenhum campo selecionado'}<br><small>Prompt: ${esc(promptName)} · ${$('#cfPersonalizationRequired')?.value === '1' ? 'personalização obrigatória' : 'personalização opcional'}</small>`
    : '<b>Personalização desativada neste modelo.</b>';
  const badge = $('#cfPersonalizationBadge');
  if (badge) {
    badge.textContent = active ? 'ATIVA' : 'DESATIVADA';
    badge.className = `badge ${active ? 'good' : ''}`;
  }
}

function bindProductConfig() {
  $('#cfPersonalizationActive').onchange = e => {
    if ($('#cfPersonalizable')) $('#cfPersonalizable').value = e.target.value;
    updateSummary();
  };
  $('#cfPersonalizationRequired').onchange = updateSummary;
  $('#cfPersonalizationPrompt').onchange = updateSummary;
  $$('[data-cf-personal-field]').forEach(row => {
    $('[data-enabled]', row).onchange = () => { updateFieldState(row); updateSummary(); };
    $('[data-required]', row).onchange = updateSummary;
    $('[data-label]', row).oninput = updateSummary;
    updateFieldState(row);
  });
  updateSummary();
}

function currentConfig(product = {}) {
  const active = $('#cfPersonalizationActive')?.value === '1';
  const fields = {};
  const legacyList = [];
  for (const [id, defaultLabel, type] of FIELD_DEFS) {
    const row = $(`[data-cf-personal-field="${id}"]`);
    if (!row) continue;
    const enabled = $('[data-enabled]', row)?.checked === true;
    const required = enabled && $('[data-required]', row)?.checked === true;
    const label = text($('[data-label]', row)?.value) || defaultLabel;
    fields[id] = { ativo: enabled, obrigatorio: required, rotulo: label, tipo: type };
    if (enabled) legacyList.push({ id, tipo: type, rotulo: label, obrigatorio: required });
  }
  const promptId = text($('#cfPersonalizationPrompt')?.value);
  const preset = state.prompts?.[promptId] || null;
  const previous = product.personalizacao && typeof product.personalizacao === 'object' ? product.personalizacao : {};
  return {
    ativa: active,
    obrigatoria: active && $('#cfPersonalizationRequired')?.value === '1',
    campos: fields,
    prompt_base_id: promptId,
    prompt_base_nome: text(preset?.nome),
    prompt_base_texto: text(preset?.prompt),
    prompt_base_versao: Number(preset?.versao || 0) || 0,
    prompt_especifico: text($('#cfPersonalizationSpecific')?.value),
    permitir_observacao: false,
    config_version: (Number(previous.config_version || 0) || 0) + 1,
    atualizado_em: nowIso(),
    legacyList
  };
}

async function saveProductConfig(productKey) {
  const product = await getMug(productKey);
  if (!product) throw new Error('Caneca não encontrada.');
  const cfg = currentConfig(product);
  const patch = {
    personalizacao: {
      ativa: cfg.ativa,
      obrigatoria: cfg.obrigatoria,
      campos: cfg.campos,
      prompt_base_id: cfg.prompt_base_id,
      prompt_base_nome: cfg.prompt_base_nome,
      prompt_base_texto: cfg.prompt_base_texto,
      prompt_base_versao: cfg.prompt_base_versao,
      prompt_especifico: cfg.prompt_especifico,
      permitir_observacao: false,
      config_version: cfg.config_version,
      atualizado_em: cfg.atualizado_em
    },
    personalizacao_campos: cfg.legacyList,
    personalizacao_prompt_base: cfg.prompt_base_id,
    personalizacao_prompt_especifico: cfg.prompt_especifico,
    loja_integrada_personalizavel: cfg.ativa,
    canecafacil_personalizavel: cfg.ativa,
    personalizavel: cfg.ativa,
    personalizacao_publica: cfg.ativa
  };
  if ($('#cfPersonalizable')) $('#cfPersonalizable').value = cfg.ativa ? '1' : '0';
  await patchMug(productKey, patch);
  await audit('caneca_personalizacao_config_salva_v1', {
    produto_key: productKey,
    ativa: cfg.ativa,
    obrigatoria: cfg.obrigatoria,
    campos: cfg.legacyList.map(x => x.id),
    prompt_base_id: cfg.prompt_base_id,
    config_version: cfg.config_version
  }).catch(() => {});
}

function wrapExistingSaveButtons(productKey) {
  for (const id of ['cfSaveOnly', 'cfSaveSync', 'cfSyncNow']) {
    const button = $(`#${id}`);
    if (!button || button.dataset.cfPersonalizationWrapped === '1') continue;
    const original = button.onclick;
    if (typeof original !== 'function') continue;
    button.dataset.cfPersonalizationWrapped = '1';
    button.onclick = async function(event) {
      if (button.dataset.cfPersonalizationSaving === '1') return;
      button.dataset.cfPersonalizationSaving = '1';
      const wasDisabled = button.disabled;
      button.disabled = true;
      try {
        await saveProductConfig(productKey);
        await original.call(button, event);
      } catch (error) {
        console.error('[Admin Canecas] personalização:', error);
        toast(`Personalização: ${error.message || error}`, true);
      } finally {
        button.dataset.cfPersonalizationSaving = '';
        if (button.isConnected) button.disabled = wasDisabled;
      }
    };
  }
}

function promptRow(p) {
  return `<div class="cf-prompt-row" data-prompt-id="${esc(p.id)}">
    <div><b>${esc(p.nome || p.id)}</b><small>${esc(p.prompt || '')}</small></div>
    <div class="cf-prompt-actions">
      <button class="secondary" type="button" data-edit-prompt="${esc(p.id)}">Editar</button>
      ${p.interno ? '<span class="badge">PADRÃO</span>' : `<button class="danger" type="button" data-delete-prompt="${esc(p.id)}">Excluir</button>`}
    </div>
  </div>`;
}

async function enhanceSettings() {
  if (!location.hash.includes('settings')) return;
  const root = $('#settings');
  if (!root || $('#cfPersonalizationPromptSettings')) return;
  await loadPrompts();

  const section = document.createElement('section');
  section.className = 'panel';
  section.id = 'cfPersonalizationPromptSettings';
  section.innerHTML = `
    <div class="panel-head"><div><h2>Prompts de personalização</h2><p>Modelos simples para reutilizar em centenas de canecas.</p></div></div>
    <div class="panel-body">
      <div class="cf-prompt-editor">
        <div class="form">
          <label>Nome do prompt<input id="cfPromptName" placeholder="Ex.: Nome + foto"></label>
          <label class="span2">Instrução para a IA<textarea id="cfPromptText" rows="5" placeholder="Defina somente o que a IA está autorizada a alterar."></textarea></label>
        </div>
        <div class="mini-actions" style="margin-top:8px">
          <button class="primary" type="button" id="cfPromptSave">Salvar prompt</button>
          <button class="secondary" type="button" id="cfPromptNew">Novo</button>
        </div>
      </div>
      <div class="cf-prompt-list" id="cfPromptList"></div>
    </div>`;
  root.appendChild(section);
  $('#cfPromptSave').onclick = savePrompt;
  $('#cfPromptNew').onclick = resetPromptEditor;
  renderPromptList();
}

function renderPromptList() {
  const list = $('#cfPromptList');
  if (!list) return;
  list.innerHTML = Object.values(state.prompts || {})
    .sort((a, b) => text(a.nome).localeCompare(text(b.nome), 'pt-BR'))
    .map(promptRow).join('') || '<div class="notice">Nenhum prompt.</div>';
  $$('[data-edit-prompt]', list).forEach(button => button.onclick = () => editPrompt(button.dataset.editPrompt));
  $$('[data-delete-prompt]', list).forEach(button => button.onclick = () => deletePrompt(button.dataset.deletePrompt));
}

function editPrompt(id) {
  const p = state.prompts?.[id];
  if (!p) return;
  state.editingPromptId = id;
  $('#cfPromptName').value = text(p.nome);
  $('#cfPromptText').value = text(p.prompt);
  $('#cfPromptName').focus();
}

function resetPromptEditor() {
  state.editingPromptId = '';
  if ($('#cfPromptName')) $('#cfPromptName').value = '';
  if ($('#cfPromptText')) $('#cfPromptText').value = '';
}

async function savePrompt() {
  const name = text($('#cfPromptName')?.value);
  const prompt = text($('#cfPromptText')?.value);
  if (!name || !prompt) return toast('Informe o nome e a instrução do prompt.', true);
  const id = state.editingPromptId || slug(name);
  if (!id) return toast('Nome de prompt inválido.', true);
  const old = state.prompts?.[id] || {};
  const obj = {
    nome: name,
    prompt,
    ativo: true,
    versao: (Number(old.versao || 0) || 0) + 1,
    atualizado_em: nowIso()
  };
  await fbWrite(`${PROMPTS_NODE}/${safeKey(id)}`, obj, 'PUT');
  state.prompts = null;
  await loadPrompts(true);
  state.editingPromptId = id;
  renderPromptList();
  toast('Prompt salvo.');
}

async function deletePrompt(id) {
  if (!id || DEFAULT_PROMPTS[id]) return;
  if (!confirm('Excluir este prompt? As canecas já salvas manterão uma cópia do texto que usavam.')) return;
  const response = await fetch(`${FIREBASE_BASE}/${PROMPTS_NODE}/${safeKey(id)}.json`, { method: 'DELETE' });
  if (!response.ok) return toast(`Firebase ${response.status}`, true);
  state.prompts = null;
  await loadPrompts(true);
  resetPromptEditor();
  renderPromptList();
  toast('Prompt excluído.');
}

window.addEventListener('admin-canecas:drawer', event => {
  const detail = event.detail || {};
  if (detail.kind !== 'mug' || !detail.id) return;
  injectProductConfig(text(detail.id)).catch(error => {
    console.error('[Admin Canecas] falha ao abrir personalização:', error);
    toast(`Personalização: ${error.message || error}`, true);
  });
});

window.addEventListener('admin-canecas:route', event => {
  if (event.detail?.route === 'settings') setTimeout(() => enhanceSettings().catch(console.error), 0);
});
window.addEventListener('admin-canecas:settings-rendered', () => setTimeout(() => enhanceSettings().catch(console.error), 0));

injectStyles();
document.documentElement.dataset.cfPersonalizationConfig = BUILD;
