const BUILD = '20260901-loja-integrada-personalizador-v15-art-only';
const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const STOREFRONT = 'https://www.canecafacil.com.br/';
const RESULT_NODE = 'canecas/geracoes';
const CREATIONS_NODE = 'canecas/personalizadas';
const WAIT_MS = 240000;
const POLL_MS = 1800;
const CREATION_DAYS = 30;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const text = value => String(value ?? '').trim();
const params = new URLSearchParams(location.search);
let modelId = text(params.get('model'));
const creationParam = text(params.get('creation'));
const explicitReturn = text(params.get('return'));
const embedded = params.get('embed') === '1';
let product = null;
let config = null;
let currentCreationCode = '';
let currentSource = '';
let currentCrops = null;
let currentPreviewIndex = 0;

function safeKey(value) { return text(value).replace(/[.#$\[\]/]/g, '_'); }
function esc(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function isoAfterDays(days) { return new Date(Date.now() + days * 86400000).toISOString(); }

function productImage(p = {}) {
  const values = [
    p.mockup_1,
    p.mockup_2,
    p.url_imagem,
    p.imagem_url,
    p.imagem,
    ...(Array.isArray(p.imagens_site) ? p.imagens_site : []),
    ...(Array.isArray(p.imagens) ? p.imagens : []),
  ];
  return values
    .map(value => typeof value === 'object' ? (value?.url || value?.src || '') : value)
    .map(text)
    .find(value => /^https?:\/\//i.test(value)) || '';
}

function modelArt(p = {}) {
  return text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url || p.arte_final_url);
}

function safeStoreUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw, STOREFRONT);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'canecafacil.com.br' ? url.href : '';
  } catch { return ''; }
}

function productStoreUrl(p = {}) {
  const direct = safeStoreUrl(p?.loja_integrada?.url) || safeStoreUrl(p?.canecafacil_url);
  if (direct) return direct;
  const alias = text(p?.loja_integrada_alias || p?.loja_integrada?.alias);
  return alias ? new URL(alias.replace(/^\/+/, ''), STOREFRONT).href : STOREFRONT;
}

function returnUrl() {
  return safeStoreUrl(explicitReturn) || productStoreUrl(product || {}) || STOREFRONT;
}

function hideTransient() {
  $('#progressBox').hidden = true;
  $('#successBox').hidden = true;
  $('#pendingBox').hidden = true;
}

function showError(message, { keepPreview = false } = {}) {
  hideTransient();
  if (!keepPreview) $('#previewBox').hidden = true;
  $('#errorText').textContent = message;
  $('#errorBox').hidden = false;
}

function setProgress(title, message) {
  $('#errorBox').hidden = true;
  $('#successBox').hidden = true;
  $('#pendingBox').hidden = true;
  $('#previewBox').hidden = true;
  $('#progressTitle').textContent = title;
  $('#progressText').textContent = message;
  $('#progressBox').hidden = false;
}

async function fetchJson(path) {
  const response = await fetch(`${FIREBASE}/${path}.json?_=${Date.now()}`, {
    cache:'no-store', headers:{ Accept:'application/json' }
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}

async function writeJson(path, data, method = 'PUT') {
  const response = await fetch(`${FIREBASE}/${path}.json`, {
    method,
    headers:{ 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify(data)
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json().catch(() => null);
}

function normalizeConfig(p = {}) {
  const raw = p.personalizacao && typeof p.personalizacao === 'object' ? p.personalizacao : {};
  const fieldsRaw = raw.campos || p.personalizacao_campos || p.campos_personalizacao || p.campos_publicos || p.canecafacil_campos || {};
  const fromPrivateConfig = Boolean(raw.campos && typeof raw.campos === 'object');
  let entries = [];
  if (Array.isArray(fieldsRaw)) {
    entries = fieldsRaw.map((value, index) => [text(value?.id || value?.key || value?.nome || `campo_${index + 1}`), value]);
  } else if (fieldsRaw && typeof fieldsRaw === 'object') {
    entries = Object.entries(fieldsRaw);
  }

  const fields = entries.map(([key, value], index) => {
    const item = value && typeof value === 'object' ? value : { rotulo:value };
    if (fromPrivateConfig && item.ativo !== true) return null;
    if (!fromPrivateConfig && item.ativo === false) return null;
    const id = text(item.id || item.key || key || `campo_${index + 1}`);
    const rawType = text(item.tipo || item.type).toLowerCase();
    const isImage = ['foto','logo'].includes(id.toLowerCase()) || ['image','imagem','foto','file'].includes(rawType);
    const type = isImage ? 'image' : (rawType || 'text');
    const options = Array.isArray(item.opcoes || item.options)
      ? (item.opcoes || item.options).map(text).filter(Boolean)
      : text(item.opcoes || item.options).split('|').map(text).filter(Boolean);
    return {
      id,
      label:text(item.rotulo || item.label || item.nome || id),
      type,
      required:item.obrigatorio === true || item.required === true,
      placeholder:text(item.placeholder || item.exemplo),
      help:text(item.ajuda || item.help || item.descricao),
      options,
      max:Number(item.maxlength || item.max || 0) || ({ nome:80, endereco:180, telefone:40, site:120 }[id] || 180),
    };
  }).filter(Boolean);

  return {
    active:raw.ativa !== false,
    required:raw.ativa === true && raw.obrigatoria === true,
    fields,
    version:Number(raw.config_version || 0) || 0,
    promptBaseId:text(raw.prompt_base_id || p.personalizacao_prompt_base),
    promptBaseText:text(raw.prompt_base_texto),
    promptSpecific:text(raw.prompt_especifico || p.personalizacao_prompt_especifico),
  };
}

function fieldHtml(field) {
  const required = field.required ? 'required' : '';
  const star = field.required ? ' *' : '';
  const help = field.help ? `<small>${esc(field.help)}</small>` : '';
  if (field.type === 'image') {
    return `<label class="cf-field cf-file">${esc(field.label)}${star}<input data-field-id="${esc(field.id)}" data-kind="image" type="file" accept="image/png,image/jpeg,image/webp" ${required}><small>${esc(field.help || 'JPG, PNG ou WebP')}</small></label>`;
  }
  if (['select','opcao','option'].includes(field.type)) {
    return `<label class="cf-field">${esc(field.label)}${star}<select data-field-id="${esc(field.id)}" ${required}><option value="">Selecione…</option>${field.options.map(option => `<option value="${esc(option)}">${esc(option)}</option>`).join('')}</select>${help}</label>`;
  }
  if (['textarea','frase_longa'].includes(field.type)) {
    return `<label class="cf-field cf-wide">${esc(field.label)}${star}<textarea data-field-id="${esc(field.id)}" rows="2" maxlength="${field.max}" placeholder="${esc(field.placeholder)}" ${required}></textarea>${help}</label>`;
  }
  const inputType = field.id === 'telefone' ? 'tel' : field.id === 'site' ? 'url' : 'text';
  return `<label class="cf-field">${esc(field.label)}${star}<input data-field-id="${esc(field.id)}" type="${inputType}" maxlength="${field.max}" placeholder="${esc(field.placeholder)}" ${required}>${help}</label>`;
}

function render() {
  const image = productImage(product || {});
  const label = config.fields.map(field => field.label).join(', ');
  $('#productBox').innerHTML = `${image ? `<img src="${esc(image)}" alt="${esc(product?.nome || 'Caneca')}">` : ''}<div class="product-copy"><h2>${esc(product?.nome || 'Caneca personalizada')}</h2><strong>${money(product?.preco)}</strong>${label ? `<p>Personalize: ${esc(label)}.</p>` : ''}</div>`;
  const root = $('#dynamicFields');
  root.innerHTML = config.fields.length
    ? config.fields.map(fieldHtml).join('')
    : '<div class="empty-fields">Este modelo ainda não possui campos de personalização liberados.</div>';
  $('#generateButton').disabled = !config.fields.length;
  $('#personalizerForm').hidden = false;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(text(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });
}

async function urlToDataUrl(url) {
  if (/^data:image\//i.test(url)) return url;
  if (!/^https?:\/\//i.test(url)) return '';
  const response = await fetch(url, { cache:'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar a arte-base do modelo.');
  return fileToDataUrl(await response.blob());
}

function loadPreviewImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível preparar a prévia da arte personalizada.'));
    image.src = source;
  });
}

function cropCanvasDataUrl(image, sx, sw, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('O navegador não conseguiu preparar os recortes da arte.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, 0, sw, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.9);
}

async function createTwoCrops(source) {
  const image = await loadPreviewImage(source);
  const width = Number(image.naturalWidth || image.width || 0);
  const height = Number(image.naturalHeight || image.height || 0);
  if (!width || !height) throw new Error('A arte personalizada não possui dimensões válidas.');
  const half = Math.floor(width / 2);
  return {
    left:cropCanvasDataUrl(image, 0, half, height),
    right:cropCanvasDataUrl(image, half, width - half, height),
  };
}

function maskEmail(value) {
  const email = text(value);
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  return `${local.slice(0,1)}${'*'.repeat(Math.min(5, Math.max(2, local.length - 1)))}@${domain}`;
}

function buildResumeUrl(code) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('creation', code);
  const ret = returnUrl();
  if (ret) url.searchParams.set('return', ret);
  return url.href;
}

function setPreviewImage() {
  if (!currentCrops) return;
  const images = [currentCrops.left, currentCrops.right];
  currentPreviewIndex = (currentPreviewIndex + images.length) % images.length;
  $('#previewImage').src = images[currentPreviewIndex];
  $('#previewCounter').textContent = `${currentPreviewIndex + 1} de ${images.length}`;
}

async function showPreview(code, source) {
  currentCreationCode = code;
  currentSource = source;
  currentCrops = await createTwoCrops(source);
  currentPreviewIndex = 0;
  setPreviewImage();
  hideTransient();
  $('#errorBox').hidden = true;
  $('#previewCode').textContent = code;
  $('#previewBox').hidden = false;
  $('#approveButton').disabled = false;
}

function showPending(code, email = '') {
  currentCreationCode = code;
  hideTransient();
  $('#errorBox').hidden = true;
  $('#previewBox').hidden = true;
  $('#pendingText').textContent = email
    ? `A criação continua em segundo plano. Avisaremos ${maskEmail(email)} quando a arte estiver pronta.`
    : 'A criação continua em segundo plano. Use o link desta criação para acompanhar.';
  $('#resumeLink').href = buildResumeUrl(code);
  $('#pendingBox').hidden = false;
}

async function markArtReady(code, source) {
  const at = new Date().toISOString();
  await writeJson(`${CREATIONS_NODE}/${safeKey(code)}`, {
    status:'arte_pronta',
    arte_horizontal:source,
    arte_personalizacao:source,
    arte_versao:'v1',
    aprovada:false,
    atualizado_em:at,
  }, 'PATCH');
}

async function persistPendingCreation(code, requestId, fields, images, email) {
  const at = new Date().toISOString();
  const record = {
    id:code,
    origem:'loja_integrada',
    loja_dominio:'canecafacil.com.br',
    return_url:returnUrl(),
    resume_url:buildResumeUrl(code),
    request_id:requestId,
    modelo_key:modelId,
    modelo_nome:text(product?.nome),
    produto_key:modelId,
    campos:fields,
    imagens_cliente_campos:images.map(item => item.field_id),
    contato_email_capturado:Boolean(email),
    email_status:email ? 'aguardando_arte' : 'sem_email',
    personalizacao_snapshot:{
      config_version:config.version,
      prompt_base_id:config.promptBaseId,
      prompt_base_texto:config.promptBaseText,
      prompt_especifico:config.promptSpecific,
      campos_liberados:config.fields.map(field => ({
        id:field.id, rotulo:field.label, tipo:field.type, obrigatorio:field.required
      }))
    },
    status:'gerando',
    atendimento_status:'novo',
    expira_em:isoAfterDays(CREATION_DAYS),
    criado_em:at,
    atualizado_em:at,
  };
  await writeJson(`${CREATIONS_NODE}/${safeKey(code)}`, record, 'PUT');
}

async function loadExistingCreation(code) {
  currentCreationCode = code;
  const creation = await fetchJson(`${CREATIONS_NODE}/${safeKey(code)}`);
  if (!creation) throw new Error('Esta personalização não foi encontrada ou expirou.');
  modelId = text(creation.modelo_key || creation.produto_key || creation.model_id);
  if (!modelId) throw new Error('A personalização não está vinculada a um modelo.');
  product = await fetchJson(`produtos/${safeKey(modelId)}`);
  if (!product) throw new Error('O modelo desta personalização não foi encontrado.');
  config = normalizeConfig(product);
  render();
  $('#personalizerForm').hidden = true;

  let source = imageSource(creation) || text(creation.arte_horizontal || creation.arte_personalizacao || creation?.arte_aprovada?.url);
  if (source) {
    await showPreview(code, source);
    return;
  }
  const requestId = text(creation.request_id);
  if (!requestId) {
    showPending(code);
    return;
  }
  setProgress('Sua arte está sendo criada', 'Pode deixar esta página aberta ou voltar pelo link recebido por e-mail.');
  try {
    source = await waitResult(requestId);
    await markArtReady(code, source);
    await showPreview(code, source);
  } catch {
    showPending(code);
  }
}

async function collectCustomerValues() {
  const fields = {};
  const images = [];
  for (const input of $$('[data-field-id]')) {
    const id = text(input.dataset.fieldId);
    if (input.dataset.kind === 'image') {
      const file = input.files?.[0];
      if (file) images.push({ field_id:id, role:id, image_base64:await fileToDataUrl(file) });
    } else {
      const value = text(input.value);
      if (value) fields[id] = value;
    }
  }
  return { fields, images };
}

function imageSource(record) {
  if (!record || typeof record !== 'object') return '';
  const nested = record.result && typeof record.result === 'object' ? record.result : {};
  const value = text(
    record.art_source_url || record.art_url || record.result_url || record.arte_horizontal_url ||
    record.arte_horizontal || record.art_source_base64 || record.image_base64 ||
    nested.art_source_url || nested.art_source_base64
  );
  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 1000) {
    return `data:image/webp;base64,${value.replace(/\s+/g,'')}`;
  }
  return '';
}

async function waitResult(requestId) {
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
    $('#progressText').textContent = `Gerando sua arte · ${elapsed}s`;
    try {
      const record = await fetchJson(`${RESULT_NODE}/${safeKey(requestId)}`);
      if (record?.ok === false || record?.error || record?.erro) {
        throw new Error(record.error || record.erro || 'A automação não conseguiu gerar a arte.');
      }
      const source = imageSource(record);
      if (source) return source;
    } catch (error) {
      if (!/Firebase 404/i.test(error?.message || '')) console.debug('Aguardando personalização:', error?.message || error);
    }
    await sleep(POLL_MS);
  }
  throw new Error('A geração continua em segundo plano.');
}

function creationCode() {
  const date = new Date();
  const prefix = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const random = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`)
    .replace(/[^a-z0-9]/gi,'').toUpperCase().slice(-12);
  return `CF-${prefix}-${random}`;
}

async function generateForPreview(event) {
  event.preventDefault();
  if (!config?.fields?.length) return;
  const form = $('#personalizerForm');
  if (!form.reportValidity()) return;
  const email = text($('#customerEmail')?.value).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $('#customerEmail')?.focus();
    return;
  }

  const button = $('#generateButton');
  button.disabled = true;
  setProgress('Gerando sua arte', 'Você pode aguardar aqui. Se sair, avisaremos por e-mail quando ficar pronta.');
  let code = '';
  try {
    const { fields, images } = await collectCustomerValues();
    const officialArt = await urlToDataUrl(modelArt(product || {}));
    if (!officialArt) throw new Error('Este modelo não possui arte-base disponível para personalização.');
    const customerImage = text(images[0]?.image_base64) || officialArt;
    const requestId = `LI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
    code = creationCode();
    await persistPendingCreation(code, requestId, fields, images, email);

    const personalizationPayload = {
      action:'personalize_mug_model',
      request_id:requestId,
      creation_code:code,
      resume_url:buildResumeUrl(code),
      model_id:modelId,
      mode:'loja_integrada',
      origin:'loja_integrada',
      store_domain:'canecafacil.com.br',
      return_url:returnUrl(),
      customer_name:text(fields.nome || fields.name || ''),
      customer_whatsapp:'',
      customer_email:email,
      fields_json:JSON.stringify(fields),
      images_json:JSON.stringify(images),
      image_base64:customerImage,
      instruction:config.promptSpecific,
      prompt_art:[config.promptBaseText, config.promptSpecific].filter(Boolean).join('\n\n') ||
        'Personalize fielmente a arte oficial do modelo usando somente os campos liberados no cadastro privado. Preserve integralmente o restante da composição.',
      firebase_url:FIREBASE,
      products_node:'produtos',
      quality:'low',
      client_contract:BUILD,
    };

    const response = await fetch(MAKE_WEBHOOK, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify({ payload:JSON.stringify(personalizationPayload) })
    });
    const raw = await response.text();
    let source = '';
    if (raw && !/^accepted\.?$/i.test(text(raw))) {
      try {
        const data = JSON.parse(raw);
        if (data.ok === false) throw new Error(data.error || 'A automação recusou a personalização.');
        source = imageSource(data);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    if (!response.ok) throw new Error(`Automação respondeu HTTP ${response.status}.`);
    if (!source) source = await waitResult(requestId);
    await markArtReady(code, source);
    await showPreview(code, source);
  } catch (error) {
    if (code && /segundo plano/i.test(error?.message || '')) showPending(code, email);
    else showError(error?.message || String(error));
  } finally {
    button.disabled = false;
  }
}

async function init() {
  document.documentElement.dataset.cfLiPersonalizer = BUILD;
  document.body.classList.toggle('is-embed', embedded);

  $('#prevPreview').addEventListener('click', () => { currentPreviewIndex -= 1; setPreviewImage(); });
  $('#nextPreview').addEventListener('click', () => { currentPreviewIndex += 1; setPreviewImage(); });
  // O botão #approveButton pertence exclusivamente ao native-cart-v2.js.
  $('#editCreation').addEventListener('click', () => {
    $('#previewBox').hidden = true;
    $('#errorBox').hidden = true;
    $('#personalizerForm').hidden = false;
  });
  $('#backButton').addEventListener('click', () => { location.href = returnUrl(); });
  $('#tryAgain').addEventListener('click', () => {
    $('#errorBox').hidden = true;
    if (currentSource) $('#previewBox').hidden = false;
    else $('#personalizerForm').hidden = false;
  });

  if (creationParam) {
    try { await loadExistingCreation(creationParam); }
    catch (error) { showError(error?.message || String(error)); }
    return;
  }

  if (!modelId) return showError('Não foi informado qual modelo deve ser personalizado.');
  try {
    product = await fetchJson(`produtos/${safeKey(modelId)}`);
    if (!product) throw new Error('A caneca escolhida não foi encontrada.');
    if (product.loja_integrada_personalizavel === false || product.canecafacil_personalizavel === false) {
      throw new Error('Este modelo não está disponível para personalização.');
    }
    config = normalizeConfig(product);
    if (!config.active) throw new Error('A personalização deste modelo está desativada.');
    render();
  } catch (error) {
    return showError(error?.message || String(error));
  }

  $('#personalizerForm').addEventListener('submit', generateForPreview);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
else init();
