import { FIREBASE_BASE, text, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, getMug } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260903-admin-canecas-generator-workflow-v2';
const MODELS_NODE = 'canecas/modelos_criacao';
const RECENT_LIMIT = 8;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = { selectedModel: '', recentBusy: false, settingsTimer: 0 };

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 5200 : 2800);
}

async function fbGet(path) {
  const response = await fetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, {
    cache: 'no-store', headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}

function keyOf(product = {}) {
  return text(product.firebaseKey || product.__key || product.id);
}

function artOf(product = {}, model = {}) {
  return [
    model.arte_horizontal,
    model.imagem,
    product.arte_horizontal,
    product.arte_personalizacao,
    product.arte_impressao?.url,
    product.art_source_public_url,
    product.url_arte,
    product.mockup_1,
    product.url_imagem,
  ].map(text).find(value => /^https?:\/\//i.test(value)) || '';
}

function generatedAt(product = {}) {
  const parsed = [product.criado_em, product.created_at, product.gerado_em, product.modelo_marcado_em]
    .map(value => Date.parse(text(value)))
    .find(Number.isFinite);
  return parsed || Number(product.last_update || 0) || Date.parse(text(product.updated_at)) || 0;
}

function generatedByStudio(product = {}) {
  const origin = [
    product.origem_cadastro,
    product.geracao_versao,
    product.configuracao_arte?.gerador,
    product.modelo_marcado_origem,
  ].map(text).join(' ').toLowerCase();
  return product.geracao_status === 'concluido'
    || origin.includes('generator')
    || origin.includes('gerador')
    || /^mug-/i.test(keyOf(product));
}

function installStyles() {
  if ($('#cfGeneratorWorkflowV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'cfGeneratorWorkflowV2Styles';
  style.textContent = `
    #mugExistingLibrary .mug-existing-card.is-model{cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}
    #mugExistingLibrary .mug-existing-card.is-model:hover{border-color:#767c74;box-shadow:0 5px 18px rgba(0,0,0,.07);transform:translateY(-1px)}
    #mugExistingLibrary .mug-existing-card.is-model.cf-model-selected{border-color:#171918;box-shadow:0 0 0 2px #171918 inset}
    .cf-use-model{width:100%;margin-top:7px;min-height:34px}
    .cf-recent-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}
    .cf-recent-actions button{min-height:34px;font-size:11px}
    .cf-generator-fast-note{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:10px 0;padding:10px 12px;border:1px solid #d9ded6;border-radius:10px;background:#f7f9f5}
    .cf-generator-fast-note small{display:block;color:#6e756d;margin-top:2px}
    #cfSettingsPromptShortcut{margin-bottom:12px}
    #cfSettingsPromptShortcut .panel-body{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    @media(max-width:700px){.cf-recent-actions{grid-template-columns:1fr}.cf-generator-fast-note{align-items:stretch;flex-direction:column}}
  `;
  document.head.appendChild(style);
}

async function openMugRegistration(key) {
  key = text(key);
  if (!key) return;
  const nav = $('#nav [data-route="mugs"]');
  if (nav) nav.click();
  else location.hash = '#mugs';

  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const selector = `[data-grid-edit="${CSS.escape(key)}"]`;
    const edit = $(selector, $('#mugs'));
    if (edit) {
      edit.click();
      return;
    }
    const row = $(`#mugs tr[data-cf-mug="${CSS.escape(key)}"]`);
    if (row) {
      row.click();
      return;
    }
    await sleep(120);
  }
  toast('A caneca foi criada, mas o cadastro não ficou pronto para abrir. Entre em Canecas e clique em Editar.', true);
}

function modelManualInstruction(model = {}, product = {}, commands = []) {
  const explicit = text(model.instrucao_manual || product.modelo_instrucao_manual || product.configuracao_arte?.instrucao_manual);
  if (explicit) return explicit;
  const effective = text(model.instrucao_efetiva || product.modelo_instrucao_efetiva || product.configuracao_arte?.instrucao_complementar);
  if (!effective) return '';
  const match = effective.match(/INSTRUÇÃO COMPLEMENTAR DIGITADA:\s*([\s\S]*)$/i);
  if (match) return text(match[1]);
  return commands.length ? '' : effective;
}

async function referenceFileFromUrl(url, name) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Imagem do modelo HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('A arte do modelo não foi reconhecida como imagem.');
  const ext = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webp';
  return new File([blob], `${safeKey(name || 'modelo-caneca')}.${ext}`, { type: blob.type });
}

async function setGeneratorReference(url, name) {
  const input = $('#mugArtImage');
  if (!input) throw new Error('Abra o Gerador antes de escolher um modelo.');
  const file = await referenceFileFromUrl(url, name);
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function selectCommands(ids = []) {
  $('#mugCommandClearSelection')?.click();
  await sleep(0);
  for (const id of ids) {
    const input = $(`#mugCommandList input[data-command-select="${CSS.escape(id)}"]`);
    if (!input || input.checked) continue;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(0);
  }
}

async function useModel(key, trigger = null) {
  key = text(key);
  if (!key) return;
  if (trigger) {
    trigger.disabled = true;
    trigger.dataset.oldLabel = trigger.textContent;
    trigger.textContent = 'Carregando…';
  }
  try {
    const [product, model] = await Promise.all([
      getMug(key),
      fbGet(`${MODELS_NODE}/${safeKey(key)}`).catch(() => null),
    ]);
    if (!product && !model) throw new Error('Modelo não encontrado.');
    const base = product || {};
    const record = model || {};
    const art = artOf(base, record);
    if (!art) throw new Error('Este modelo não possui arte horizontal para reutilizar.');
    const commands = [...new Set((record.comandos_ids || base.modelo_comandos_ids || base.configuracao_arte?.comandos || []).map(text).filter(Boolean))];
    const manual = modelManualInstruction(record, base, commands);

    await setGeneratorReference(art, text(base.nome || record.nome || 'modelo'));
    await selectCommands(commands);
    const instruction = $('#mugArtInstruction');
    if (instruction) {
      instruction.value = manual;
      instruction.dispatchEvent(new Event('input', { bubbles: true }));
    }
    state.selectedModel = key;
    $$('[data-existing-mug].is-model').forEach(card => card.classList.toggle('cf-model-selected', card.dataset.existingMug === key));
    const status = $('#mugAutomationStatus');
    if (status) status.textContent = `Modelo “${text(base.nome || record.nome || key)}” carregado. Ajuste a instrução se quiser e clique em Gerar caneca.`;
    $('#mugArtInstruction')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Modelo carregado no Gerador.');
  } catch (error) {
    console.error('[Admin Canecas] usar modelo:', error);
    toast(`Não foi possível carregar o modelo: ${error.message || error}`, true);
  } finally {
    if (trigger) {
      trigger.disabled = false;
      trigger.textContent = trigger.dataset.oldLabel || 'Usar modelo';
    }
  }
}

function enhanceModelCards() {
  const library = $('#mugExistingLibrary');
  if (!library) return;
  $$('.mug-existing-card.is-model[data-existing-mug]', library).forEach(card => {
    const key = text(card.dataset.existingMug);
    if (!key) return;
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.title = 'Clique para carregar este modelo no Gerador';
    card.classList.toggle('cf-model-selected', state.selectedModel === key);
    const body = $('.mug-existing-card-body', card);
    if (body && !body.querySelector('[data-use-generator-model]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'primary cf-use-model';
      button.dataset.useGeneratorModel = key;
      button.textContent = 'Usar este modelo';
      body.appendChild(button);
    }
  });
}

function recentCard(product = {}) {
  const key = keyOf(product);
  const art = artOf(product);
  const when = generatedAt(product);
  const date = when ? new Date(when).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return `<article class="mug-existing-card" data-recent-mug="${esc(key)}">
    <div class="mug-existing-art">${art ? `<img src="${esc(art)}" alt="${esc(product.nome || 'Caneca')}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<div class="mug-existing-empty">Sem arte horizontal</div>'}<span class="mug-existing-model-badge">RECENTE</span></div>
    <div class="mug-existing-card-body">
      <strong title="${esc(product.nome || 'Caneca')}">${esc(product.nome || 'Caneca')}</strong>
      <small>${esc(product.codigo || product.sku || key)}${date ? ` · ${esc(date)}` : ''}</small>
      <div class="cf-recent-actions">
        <button class="primary" type="button" data-recent-config="${esc(key)}">Configurar</button>
        <button class="secondary" type="button" data-recent-use="${esc(key)}">Usar no gerador</button>
      </div>
    </div>
  </article>`;
}

async function renderRecent(force = false) {
  if (state.recentBusy) return;
  const grid = $('#mugOthersGrid');
  if (!grid) return;
  state.recentBusy = true;
  try {
    const mugs = await loadMugs({ force });
    const recent = mugs.filter(generatedByStudio).sort((a, b) => generatedAt(b) - generatedAt(a)).slice(0, RECENT_LIMIT);
    const group = grid.closest('.mug-existing-group');
    const heading = group?.querySelector('.mug-existing-group-head h3');
    const count = $('#mugOthersCount');
    if (heading) heading.textContent = 'Últimas canecas geradas';
    if (count) count.textContent = `${recent.length} mais recente${recent.length === 1 ? '' : 's'}`;
    grid.innerHTML = recent.length ? recent.map(recentCard).join('') : '<div class="notice mug-existing-empty-row">Nenhuma caneca gerada ainda.</div>';
    grid.dataset.recentBuild = BUILD;
    const more = $('#mugOthersMore');
    if (more) more.hidden = true;
    const status = $('#mugExistingStatus');
    if (status) status.textContent = `Modelos reutilizáveis acima · últimas ${RECENT_LIMIT} canecas geradas abaixo.`;
  } catch (error) {
    console.error('[Admin Canecas] últimas geradas:', error);
  } finally {
    state.recentBusy = false;
  }
}

function enhanceGenerationResult(key = '') {
  const button = $('#mugOpenCatalog');
  if (!button) return;
  const resolved = text(key || button.dataset.productKey);
  if (resolved) button.dataset.productKey = resolved;
  button.textContent = 'Configurar agora';
  button.classList.remove('secondary');
  button.classList.add('primary');
  button.onclick = () => openMugRegistration(text(button.dataset.productKey || resolved));

  const head = button.closest('.mug-result-head');
  if (head && !head.parentElement?.querySelector('.cf-generator-fast-note')) {
    const note = document.createElement('div');
    note.className = 'cf-generator-fast-note';
    note.innerHTML = '<div><b>Próximo passo: revisar o cadastro</b><small>Confira categoria, preço, personalização e publicação antes de colocar a caneca à venda.</small></div>';
    head.insertAdjacentElement('afterend', note);
  }
}

function ensurePromptShortcut() {
  if (!location.hash.includes('settings')) return;
  const root = $('#settings');
  if (!root) return;
  let shortcut = $('#cfSettingsPromptShortcut', root);
  if (!shortcut) {
    shortcut = document.createElement('section');
    shortcut.className = 'panel';
    shortcut.id = 'cfSettingsPromptShortcut';
    shortcut.innerHTML = `<div class="panel-body"><div><b>Prompts de personalização</b><small style="display:block;color:#6e756d;margin-top:2px">Edite aqui as instruções reutilizáveis enviadas à IA para nome, foto, logo e outros campos.</small></div><button class="primary" id="cfOpenPromptSettings" type="button">Abrir prompts</button></div>`;
    root.prepend(shortcut);
    $('#cfOpenPromptSettings', shortcut).onclick = async () => {
      window.dispatchEvent(new CustomEvent('admin-canecas:settings-rendered', { detail: { source: BUILD } }));
      for (let i = 0; i < 20; i += 1) {
        const panel = $('#cfPersonalizationPromptSettings');
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          panel.animate?.([{ boxShadow: '0 0 0 0 rgba(0,0,0,0)' }, { boxShadow: '0 0 0 3px rgba(23,25,24,.18)' }, { boxShadow: '0 0 0 0 rgba(0,0,0,0)' }], { duration: 900 });
          return;
        }
        await sleep(100);
      }
      toast('Não foi possível abrir os prompts. Atualize a página e tente novamente.', true);
    };
  }
  const prompts = $('#cfPersonalizationPromptSettings', root);
  if (prompts && prompts.previousElementSibling !== shortcut) shortcut.insertAdjacentElement('afterend', prompts);
}

function recoverSettingsPanels() {
  if (!location.hash.includes('settings')) return;
  clearTimeout(state.settingsTimer);
  state.settingsTimer = setTimeout(() => {
    window.dispatchEvent(new CustomEvent('admin-canecas:settings-rendered', { detail: { source: BUILD } }));
    setTimeout(ensurePromptShortcut, 120);
    setTimeout(ensurePromptShortcut, 420);
  }, 40);
}

function bindGlobalEvents() {
  document.addEventListener('click', event => {
    const use = event.target.closest?.('[data-use-generator-model]');
    if (use) {
      event.preventDefault();
      event.stopPropagation();
      void useModel(use.dataset.useGeneratorModel, use);
      return;
    }
    const recentUse = event.target.closest?.('[data-recent-use]');
    if (recentUse) {
      event.preventDefault();
      void useModel(recentUse.dataset.recentUse, recentUse);
      return;
    }
    const recentConfig = event.target.closest?.('[data-recent-config]');
    if (recentConfig) {
      event.preventDefault();
      void openMugRegistration(recentConfig.dataset.recentConfig);
      return;
    }
    const modelCard = event.target.closest?.('.mug-existing-card.is-model[data-existing-mug]');
    if (modelCard && !event.target.closest('button,input,label,a')) {
      void useModel(modelCard.dataset.existingMug);
    }
  });

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const card = event.target.closest?.('.mug-existing-card.is-model[data-existing-mug]');
    if (!card) return;
    event.preventDefault();
    void useModel(card.dataset.existingMug);
  });

  window.addEventListener('admin-canecas:mug-created', event => {
    const key = text(event.detail?.key);
    setTimeout(() => enhanceGenerationResult(key), 0);
    setTimeout(() => renderRecent(true), 450);
  });

  window.addEventListener('admin-canecas:route', event => {
    if (event.detail?.route === 'settings') recoverSettingsPanels();
  });
  window.addEventListener('admin-canecas:settings-rendered', () => setTimeout(ensurePromptShortcut, 100));
  window.addEventListener('hashchange', () => {
    if (location.hash.includes('settings')) recoverSettingsPanels();
  });
}

function installLibraryObserver(attempt = 0) {
  const library = $('#mugExistingLibrary');
  if (!library) {
    if (attempt < 50) setTimeout(() => installLibraryObserver(attempt + 1), 120);
    return;
  }
  if (library.dataset.workflowV2 === BUILD) return;
  library.dataset.workflowV2 = BUILD;
  const observer = new MutationObserver(() => {
    enhanceModelCards();
    const grid = $('#mugOthersGrid');
    if (grid && !grid.querySelector('[data-recent-mug]')) void renderRecent(false);
  });
  observer.observe(library, { childList: true, subtree: true });
  enhanceModelCards();
  void renderRecent(false);
}

function install() {
  installStyles();
  bindGlobalEvents();
  installLibraryObserver();
  if (location.hash.includes('settings')) recoverSettingsPanels();
  setTimeout(() => enhanceGenerationResult(''), 250);
  document.documentElement.dataset.adminCanecasGeneratorWorkflowV2 = BUILD;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();

export { BUILD, openMugRegistration, useModel, renderRecent };
