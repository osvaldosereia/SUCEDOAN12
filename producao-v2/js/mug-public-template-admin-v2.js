(() => {
'use strict';

const BUILD = '20260826-mug-template-admin-v2-visible';
const TAB = 'mug-personalizacao';
const FALLBACK_FB = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const PRODUCTS_NODE = 'produtos';
const PRIVATE_NODE = 'canecas/modelos_privados';
const MODELS_NODE = 'canecas/modelos_criacao';
const PUBLIC_CONFIG_NODE = 'canecas/config_publica';
const TYPES = {
  foto: 'Foto',
  texto: 'Texto curto',
  texto_longo: 'Texto / frase',
  data: 'Data',
  numero: 'Número',
  select: 'Lista de opções',
  cor: 'Cor'
};

const state = {
  key: '',
  product: null,
  fields: [],
  privateCfg: {},
  busy: false,
  saving: false,
  lastLoadedKey: ''
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const text = value => String(value ?? '').trim();
const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

function localConfig() {
  try {
    return JSON.parse(localStorage.getItem('da_admin_v2_config') || '{}') || {};
  } catch {
    return {};
  }
}

function firebaseBase() {
  return text(localConfig().firebaseUrl || FALLBACK_FB).replace(/\/+$/, '');
}

function productsNode() {
  return text(localConfig().productsNode || PRODUCTS_NODE).replace(/^\/+|\/+$/g, '') || PRODUCTS_NODE;
}

function slug(value, fallback = 'campo') {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || fallback;
}

function normalize(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isMug(product = {}) {
  const haystack = normalize([
    product.categoria,
    product.subcategoria,
    product.subsubcategoria,
    product.tipo_produto,
    product.origem_cadastro,
    product.nome
  ].join(' '));
  return haystack.includes('caneca');
}

function art(product = {}) {
  return text(
    product.arte_horizontal ||
    product.arte_personalizacao ||
    product.arte_impressao?.url ||
    product.arte_final_url ||
    product.configuracao_arte?.arte_horizontal
  );
}

function phrase(product = {}) {
  return text(
    product.personalizacao_cliente?.frase ||
    product.configuracao_arte?.frase_cliente ||
    product.frase ||
    product.modelo_frase ||
    product.texto_identificado_arte
  );
}

function highlightName(product = {}) {
  return text(
    product.personalizacao_cliente?.nome_destaque ||
    product.configuracao_arte?.nome_destaque ||
    product.nome_destaque
  );
}

function images(product = {}) {
  const raw = [
    product.mockup_1,
    product.mockup_2,
    product.mockup_3,
    ...(Array.isArray(product.imagens_site) ? product.imagens_site : []),
    ...(Array.isArray(product.imagens) ? product.imagens : []),
    product.url_imagem,
    product.imagem_url,
    product.imagem
  ];
  return [...new Set(raw.map(text).filter(value => /^https?:\/\//i.test(value)))].slice(0, 3);
}

async function firebase(path, options = {}) {
  const response = await fetch(`${firebaseBase()}/${path}.json`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  if (!response.ok) throw new Error(`Firebase respondeu ${response.status}`);
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

function field(value = {}, index = 0) {
  const type = TYPES[value.tipo] ? value.tipo : 'texto';
  const options = Array.isArray(value.opcoes)
    ? value.opcoes.map(text).filter(Boolean)
    : text(value.opcoes).split(/\r?\n|[,;|]/).map(text).filter(Boolean);

  return {
    id: slug(value.id || value.label || `campo_${index + 1}`, `campo_${index + 1}`),
    tipo: type,
    label: text(value.label || `Campo ${index + 1}`),
    obrigatorio: value.obrigatorio === true,
    publico: value.publico !== false,
    placeholder: text(value.placeholder),
    valor_padrao: text(value.valor_padrao),
    ajuda: text(value.ajuda),
    opcoes: options,
    instrucao_ia: text(value.instrucao_ia),
    ordem: index
  };
}

function defaultFields(product = {}) {
  const result = [
    field({
      id: 'foto_principal',
      tipo: 'foto',
      label: 'Envie sua foto',
      obrigatorio: true,
      publico: true,
      ajuda: 'Escolha uma foto nítida e bem iluminada.',
      instrucao_ia: 'Use a foto enviada como referência principal. Preserve identidade, rosto e características reconhecíveis.'
    }, 0)
  ];

  const name = highlightName(product);
  const modelPhrase = phrase(product);

  result.push(field({
    id: 'nome',
    tipo: 'texto',
    label: 'Nome na caneca',
    obrigatorio: false,
    publico: true,
    valor_padrao: name,
    placeholder: 'Digite o nome',
    instrucao_ia: 'Se houver nome informado, escreva-o exatamente como recebido e posicione de forma harmoniosa sem cobrir o rosto.'
  }, result.length));

  result.push(field({
    id: 'frase',
    tipo: 'texto_longo',
    label: 'Frase',
    obrigatorio: false,
    publico: true,
    valor_padrao: modelPhrase,
    placeholder: 'Digite a frase',
    instrucao_ia: 'Se houver frase informada, escreva-a exatamente como recebida, preservando acentos, palavras e pontuação.'
  }, result.length));

  return result;
}

function publicField(item) {
  return {
    id: item.id,
    tipo: item.tipo,
    label: item.label,
    obrigatorio: item.obrigatorio,
    publico: item.publico,
    placeholder: item.placeholder,
    valor_padrao: item.valor_padrao,
    ajuda: item.ajuda,
    opcoes: item.opcoes,
    ordem: item.ordem
  };
}

function toast(message, error = false) {
  let node = $('#mugTemplateToastV2');
  if (!node) {
    node = document.createElement('div');
    node.id = 'mugTemplateToastV2';
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.className = `mug-template-toast-v2${error ? ' error' : ''}`;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, error ? 5500 : 3200);
}

function installStyles() {
  if ($('#mugTemplateStylesV2')) return;
  const style = document.createElement('style');
  style.id = 'mugTemplateStylesV2';
  style.textContent = `
    [data-editor-tab="${TAB}"]{white-space:nowrap}
    [data-editor-section="${TAB}"]{padding:4px 0 28px}
    .mug-v2{display:grid;gap:14px}
    .mug-v2-box{padding:15px;border:1px solid #dde1d9;border-radius:14px;background:#fff;display:grid;gap:12px}
    .mug-v2-box.private{background:#fbf8ff;border-color:#d9cee9}
    .mug-v2-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
    .mug-v2-head strong{display:block;font-size:14px}
    .mug-v2-head small{display:block;color:#71776d;font-size:11px;margin-top:3px}
    .mug-v2-badge{font-size:10px;font-weight:800;padding:5px 7px;border-radius:999px;background:#edf3e9;color:#31512d}
    .mug-v2-switches,.mug-v2-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
    .mug-v2-switch{display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid #e4e6e0;border-radius:11px;background:#fafbf9}
    .mug-v2-switch input{margin-top:2px}
    .mug-v2-switch strong{display:block;font-size:11px}
    .mug-v2-switch small{display:block;color:#73786f;font-size:10px;margin-top:2px}
    .mug-v2-fields{display:grid;gap:10px}
    .mug-v2-field{padding:11px;border:1px solid #e3e5df;border-radius:12px;background:#fafbf8;display:grid;gap:8px}
    .mug-v2-field-head{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .mug-v2-actions{display:flex;gap:4px}
    .mug-v2-actions button{width:30px;height:30px;border:1px solid #d4d8d0;border-radius:8px;background:#fff;cursor:pointer}
    .mug-v2-grid label,.mug-v2-field label{display:grid;gap:4px;font-size:10px;font-weight:700}
    .mug-v2-grid input,.mug-v2-grid textarea,.mug-v2-grid select,.mug-v2-field input,.mug-v2-field textarea,.mug-v2-field select{box-sizing:border-box;width:100%;border:1px solid #d7dbd3;border-radius:9px;padding:9px;font:inherit;background:#fff}
    .mug-v2-grid textarea,.mug-v2-field textarea{min-height:80px;resize:vertical}
    .mug-v2-span{grid-column:1/-1}
    .mug-v2-add{display:flex;flex-wrap:wrap;gap:6px}
    .mug-v2-add button{padding:8px 10px;border:1px dashed #aeb7aa;border-radius:9px;background:#f7f9f5;font-size:10px;cursor:pointer}
    .mug-v2-save{min-height:44px;border:0;border-radius:11px;background:#252822;color:#fff;font-weight:800;cursor:pointer}
    .mug-v2-save:disabled{opacity:.55;cursor:wait}
    .mug-v2-art{font-size:10px;color:#6c7168;overflow-wrap:anywhere}
    .mug-v2-status{padding:12px;border-radius:11px;background:#f4f6f1;font-size:11px}
    .mug-v2-status.error{background:#fff0ef;color:#8b2b2b}
    .mug-template-toast-v2{position:fixed;z-index:99999;bottom:22px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:10px 13px;border-radius:10px;font-size:12px;max-width:88vw}
    .mug-template-toast-v2.error{background:#8b2b2b}
    @media(max-width:700px){.mug-v2-switches,.mug-v2-grid{grid-template-columns:1fr}.mug-v2-head{display:grid}}
  `;
  document.head.appendChild(style);
}

function ensureUi() {
  installStyles();
  const tabs = $('#editorTabs');
  const form = $('#productForm');
  if (!tabs || !form) return false;

  let button = tabs.querySelector(`[data-editor-tab="${TAB}"]`);
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.editorTab = TAB;
    button.textContent = 'Personalização';
    button.title = 'Campos personalizáveis da caneca';
    tabs.appendChild(button);
  }

  let section = form.querySelector(`[data-editor-section="${TAB}"]`);
  if (!section) {
    section = document.createElement('section');
    section.className = 'editor-section';
    section.dataset.editorSection = TAB;
    form.appendChild(section);
  } else if (!section.classList.contains('editor-section')) {
    section.classList.add('editor-section');
  }

  return true;
}

function setTabVisible(visible) {
  const button = $(`[data-editor-tab="${TAB}"]`);
  if (button) button.hidden = !visible;
  if (!visible && button?.classList.contains('active')) {
    $('#editorTabs [data-editor-tab="essential"]')?.click();
  }
}

function readFields() {
  return $$('.mug-v2-field').map((card, index) => field({
    id: $('[data-x="id"]', card)?.value,
    tipo: $('[data-x="tipo"]', card)?.value,
    label: $('[data-x="label"]', card)?.value,
    placeholder: $('[data-x="placeholder"]', card)?.value,
    valor_padrao: $('[data-x="padrao"]', card)?.value,
    ajuda: $('[data-x="ajuda"]', card)?.value,
    opcoes: $('[data-x="opcoes"]', card)?.value,
    instrucao_ia: $('[data-x="ia"]', card)?.value,
    obrigatorio: $('[data-x="obrigatorio"]', card)?.checked,
    publico: $('[data-x="publico"]', card)?.checked
  }, index));
}

function fieldCard(item, index) {
  return `
    <article class="mug-v2-field" data-mug-field data-index="${index}">
      <div class="mug-v2-field-head">
        <strong>${esc(item.label || `Campo ${index + 1}`)}</strong>
        <div class="mug-v2-actions">
          <button type="button" data-up title="Subir">↑</button>
          <button type="button" data-down title="Descer">↓</button>
          <button type="button" data-remove title="Excluir">×</button>
        </div>
      </div>
      <div class="mug-v2-grid">
        <label>ID<input data-x="id" value="${esc(item.id)}"></label>
        <label>Tipo<select data-x="tipo">${Object.entries(TYPES).map(([value, label]) => `<option value="${value}" ${value === item.tipo ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Texto exibido no site<input data-x="label" value="${esc(item.label)}"></label>
        <label>Valor que vem do modelo<input data-x="padrao" value="${esc(item.valor_padrao)}"></label>
        <label class="mug-v2-span">Placeholder<input data-x="placeholder" value="${esc(item.placeholder)}"></label>
        <label class="mug-v2-span">Ajuda para o cliente<input data-x="ajuda" value="${esc(item.ajuda)}"></label>
        <label class="mug-v2-span" ${item.tipo === 'select' ? '' : 'hidden'} data-options>Opções (uma por linha)<textarea data-x="opcoes">${esc((item.opcoes || []).join('\n'))}</textarea></label>
        <label class="mug-v2-span">Instrução PRIVADA para a IA<textarea data-x="ia">${esc(item.instrucao_ia)}</textarea></label>
        <label><span><input data-x="obrigatorio" type="checkbox" ${item.obrigatorio ? 'checked' : ''}> Obrigatório</span></label>
        <label><span><input data-x="publico" type="checkbox" ${item.publico ? 'checked' : ''}> Mostrar no site</span></label>
      </div>
    </article>`;
}

function render() {
  ensureUi();
  const section = $(`[data-editor-section="${TAB}"]`);
  if (!section) return;

  if (state.busy) {
    section.innerHTML = '<div class="mug-v2-status">Carregando os campos personalizáveis desta caneca…</div>';
    return;
  }

  if (!state.key) {
    section.innerHTML = '<div class="mug-v2-status">Abra uma caneca na lista de produtos para configurar a personalização.</div>';
    return;
  }

  if (!state.product) {
    section.innerHTML = '<div class="mug-v2-status error">Não foi possível carregar o cadastro desta caneca.</div>';
    return;
  }

  const publicCfg = state.product.personalizacao_config_publica || {};
  const mug = isMug(state.product);
  setTabVisible(mug);

  if (!mug) {
    section.innerHTML = '<div class="mug-v2-status">Este cadastro não foi identificado como caneca.</div>';
    return;
  }

  section.innerHTML = `
    <div class="mug-v2">
      <section class="mug-v2-box">
        <div class="mug-v2-head">
          <div>
            <strong>Personalização desta caneca</strong>
            <small>Defina o que o cliente poderá alterar quando esta caneca aparecer no site.</small>
          </div>
          <span class="mug-v2-badge">CANECAS V2</span>
        </div>
        <div class="mug-v2-switches">
          <label class="mug-v2-switch">
            <input id="mugTplEnabledV2" type="checkbox" ${state.product.modelo_caneca === true ? 'checked' : ''}>
            <span><strong>Usar como modelo</strong><small>Permite reutilizar esta arte internamente.</small></span>
          </label>
          <label class="mug-v2-switch">
            <input id="mugTplPublicV2" type="checkbox" ${state.product.modelo_publico === true ? 'checked' : ''}>
            <span><strong>Modelo público</strong><small>Permite oferecer este modelo aos clientes.</small></span>
          </label>
          <label class="mug-v2-switch">
            <input id="mugTplCustomizationV2" type="checkbox" ${state.product.personalizacao_publica === true ? 'checked' : ''}>
            <span><strong>Campos personalizáveis no site</strong><small>Ativa o formulário na página desta caneca.</small></span>
          </label>
          <label class="mug-v2-switch">
            <input id="mugTplWhatsappV2" type="checkbox" ${publicCfg.whatsapp_obrigatorio !== false ? 'checked' : ''}>
            <span><strong>WhatsApp obrigatório</strong><small>Exige contato antes da geração.</small></span>
          </label>
          <label class="mug-v2-switch">
            <input id="mugTplEngineV9V2" type="checkbox" ${publicCfg.motor_v9 === true ? 'checked' : ''}>
            <span><strong>Motor V9</strong><small>Ligue somente depois de importar o cenário V9 no Make.</small></span>
          </label>
        </div>
        <div class="mug-v2-art"><strong>Arte de referência:</strong> ${esc(art(state.product) || 'não encontrada no cadastro')}</div>
      </section>

      <section class="mug-v2-box">
        <div class="mug-v2-head">
          <div>
            <strong>Campos personalizáveis</strong>
            <small>Estes são os campos que você estava procurando. Você pode adicionar quantos precisar.</small>
          </div>
          <span class="mug-v2-badge">${state.fields.length} campo${state.fields.length === 1 ? '' : 's'}</span>
        </div>
        <div class="mug-v2-fields">
          ${state.fields.map(fieldCard).join('') || '<div class="mug-v2-status">Nenhum campo criado ainda.</div>'}
        </div>
        <div class="mug-v2-add">
          ${Object.entries(TYPES).map(([value, label]) => `<button type="button" data-add="${value}">+ ${label}</button>`).join('')}
        </div>
      </section>

      <section class="mug-v2-box private">
        <div class="mug-v2-head">
          <div>
            <strong>Regras privadas da IA</strong>
            <small>O cliente não vê estas instruções.</small>
          </div>
        </div>
        <div class="mug-v2-grid">
          <label class="mug-v2-span">Regra geral deste modelo
            <textarea id="mugTplPrivatePromptV2" placeholder="Ex.: mantenha o fundo, substitua apenas a foto, preserve a frase no lado direito…">${esc(state.privateCfg.prompt_privado || '')}</textarea>
          </label>
          <label class="mug-v2-span">Observação interna
            <input id="mugTplPrivateNoteV2" value="${esc(state.privateCfg.observacao || '')}">
          </label>
        </div>
      </section>

      <button class="mug-v2-save" id="mugTplSaveV2" type="button">Salvar campos personalizáveis desta caneca</button>
    </div>`;
}

function makeNew(type) {
  const number = state.fields.length + 1;
  const defaults = {
    foto: ['foto', 'Envie uma foto'],
    texto: ['texto', 'Nome / texto'],
    texto_longo: ['frase', 'Frase'],
    data: ['data', 'Data'],
    numero: ['numero', 'Número'],
    select: ['opcao', 'Escolha uma opção'],
    cor: ['cor', 'Escolha uma cor']
  };
  const [id, label] = defaults[type] || ['campo', 'Campo'];
  return field({ id: `${id}_${number}`, tipo: type, label, publico: true }, state.fields.length);
}

async function loadProduct(key, force = false) {
  const normalizedKey = text(key);
  if (!normalizedKey || state.busy) return;
  if (!force && state.lastLoadedKey === normalizedKey && state.product) return;

  state.key = normalizedKey;
  state.busy = true;
  state.product = null;
  state.fields = [];
  state.privateCfg = {};
  ensureUi();
  render();

  try {
    const [product, privateCfg] = await Promise.all([
      firebase(`${productsNode()}/${encodeURIComponent(normalizedKey)}`),
      firebase(`${PRIVATE_NODE}/${encodeURIComponent(normalizedKey)}`).catch(() => null)
    ]);

    state.product = product && typeof product === 'object' ? product : null;
    state.privateCfg = privateCfg && typeof privateCfg === 'object' ? privateCfg : {};
    state.lastLoadedKey = normalizedKey;

    if (!state.product) throw new Error('Produto não encontrado no Firebase.');

    const publicCfg = state.product.personalizacao_config_publica || {};
    const privateFields = Array.isArray(state.privateCfg.campos) ? state.privateCfg.campos : [];

    state.fields = Array.isArray(publicCfg.campos) && publicCfg.campos.length
      ? publicCfg.campos.map((item, index) => field({
          ...item,
          instrucao_ia: privateFields.find(candidate => text(candidate.id) === text(item.id))?.instrucao_ia || ''
        }, index))
      : defaultFields(state.product);

    setTabVisible(isMug(state.product));
  } catch (error) {
    console.error('[Canecas V2] Falha ao carregar personalização:', error);
    toast(error?.message || String(error), true);
  } finally {
    state.busy = false;
    render();
  }
}

async function save() {
  if (state.saving || !state.product || !state.key) return;

  state.fields = readFields();
  const ids = new Set();

  for (const item of state.fields) {
    if (!item.label) throw new Error('Todo campo precisa de um texto para aparecer no site.');
    if (ids.has(item.id)) throw new Error(`Há dois campos com o mesmo ID: ${item.id}`);
    ids.add(item.id);
  }

  const now = new Date().toISOString();
  const enabled = $('#mugTplEnabledV2')?.checked === true;
  const publicModel = $('#mugTplPublicV2')?.checked === true;
  const publicCustomization = $('#mugTplCustomizationV2')?.checked === true;
  const whatsapp = $('#mugTplWhatsappV2')?.checked !== false;
  const engineV9 = $('#mugTplEngineV9V2')?.checked === true;

  const publicCfg = {
    versao: 3,
    ativo: publicCustomization,
    whatsapp_obrigatorio: whatsapp,
    motor_v9: engineV9,
    arte_referencia: art(state.product),
    campos: state.fields.filter(item => item.publico).map(publicField),
    atualizado_em: now
  };

  const privatePayload = {
    versao: 3,
    product_key: state.key,
    prompt_privado: text($('#mugTplPrivatePromptV2')?.value),
    observacao: text($('#mugTplPrivateNoteV2')?.value),
    campos: state.fields.map(item => ({ id: item.id, instrucao_ia: item.instrucao_ia })),
    atualizado_em: now
  };

  const patch = {
    modelo_caneca: enabled,
    modelo_publico: publicModel,
    personalizacao_publica: publicCustomization,
    personalizacao_template_versao: 3,
    personalizacao_config_publica: publicCfg,
    updated_at: now,
    last_update: Date.now()
  };

  const media = images(state.product);
  const model = {
    product_key: state.key,
    id: state.product.id || state.key,
    nome: state.product.nome || 'Modelo de caneca',
    imagem: media[0] || art(state.product),
    mockup_1: media[0] || '',
    mockup_2: media[1] || '',
    mockup_3: media[2] || '',
    arte_horizontal: art(state.product),
    modelo_publico: publicModel,
    personalizacao_publica: publicCustomization,
    personalizacao_config_publica: publicCfg,
    atualizado_em: now
  };

  const button = $('#mugTplSaveV2');
  state.saving = true;
  if (button) {
    button.disabled = true;
    button.textContent = 'Salvando…';
  }

  try {
    const tasks = [
      firebase(`${productsNode()}/${encodeURIComponent(state.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      }),
      firebase(`${PRIVATE_NODE}/${encodeURIComponent(state.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(privatePayload)
      })
    ];

    if (enabled) {
      tasks.push(firebase(`${MODELS_NODE}/${encodeURIComponent(state.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(model)
      }));
    }

    if (engineV9) {
      tasks.push(firebase(`${PUBLIC_CONFIG_NODE}/motor_v9`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(true)
      }));
    }

    await Promise.all(tasks);
    state.product = { ...state.product, ...patch };
    state.privateCfg = privatePayload;
    toast('Campos personalizáveis salvos no Firebase.');
  } finally {
    state.saving = false;
    if (button) {
      button.disabled = false;
      button.textContent = 'Salvar campos personalizáveis desta caneca';
    }
    render();
  }
}

function activateOwnTab() {
  ensureUi();
  $$('#editorTabs [data-editor-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.editorTab === TAB);
  });
  $$('#productForm [data-editor-section]').forEach(section => {
    section.classList.toggle('active', section.dataset.editorSection === TAB);
  });
  if (state.key && state.lastLoadedKey !== state.key) loadProduct(state.key);
}

function bind() {
  ensureUi();

  document.addEventListener('pointerdown', event => {
    const target = event.target.closest('[data-product-key]');
    if (!target?.dataset.productKey) return;
    state.key = text(target.dataset.productKey);
  }, true);

  document.addEventListener('click', event => {
    const productTarget = event.target.closest('[data-product-key]');
    if (productTarget?.dataset.productKey) {
      state.key = text(productTarget.dataset.productKey);
      setTimeout(() => {
        ensureUi();
        loadProduct(state.key, true);
      }, 0);
    }

    if (event.target.closest(`[data-editor-tab="${TAB}"]`)) {
      event.preventDefault();
      activateOwnTab();
      if (state.key) loadProduct(state.key);
      return;
    }

    const add = event.target.closest('[data-add]');
    if (add && $(`[data-editor-section="${TAB}"]`)?.contains(add)) {
      state.fields = readFields();
      state.fields.push(makeNew(add.dataset.add));
      render();
      return;
    }

    const card = event.target.closest('[data-mug-field]');
    if (card) {
      const index = Number(card.dataset.index);
      if (event.target.closest('[data-remove]')) {
        state.fields = readFields();
        state.fields.splice(index, 1);
        render();
        return;
      }
      if (event.target.closest('[data-up]') && index > 0) {
        state.fields = readFields();
        [state.fields[index - 1], state.fields[index]] = [state.fields[index], state.fields[index - 1]];
        render();
        return;
      }
      if (event.target.closest('[data-down]') && index < state.fields.length - 1) {
        state.fields = readFields();
        [state.fields[index + 1], state.fields[index]] = [state.fields[index], state.fields[index + 1]];
        render();
        return;
      }
    }

    if (event.target.closest('#mugTplSaveV2')) {
      save().catch(error => {
        console.error('[Canecas V2] Falha ao salvar:', error);
        toast(error?.message || String(error), true);
      });
    }
  }, true);

  document.addEventListener('change', event => {
    const select = event.target.closest('[data-x="tipo"]');
    if (!select) return;
    const card = select.closest('[data-mug-field]');
    const options = $('[data-options]', card);
    if (options) options.hidden = select.value !== 'select';
  });

  const editor = $('#productEditor');
  if (editor) {
    new MutationObserver(() => {
      ensureUi();
      if (editor.classList.contains('open') && state.key && state.lastLoadedKey !== state.key) {
        loadProduct(state.key);
      }
    }).observe(editor, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
  }

  const domObserver = new MutationObserver(() => {
    if (!$('#editorTabs') || !$('#productForm')) return;
    ensureUi();
  });
  domObserver.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureUi, { once: true });
  } else {
    ensureUi();
  }
}

bind();
console.info(`Canecas · ${BUILD}`);
})();
