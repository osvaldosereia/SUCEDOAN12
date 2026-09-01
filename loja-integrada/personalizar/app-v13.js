const BUILD = '20260901-loja-integrada-personalizador-v5.1-horizontal-2-crops';
const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const STOREFRONT = 'https://canecafacil.com.br/';
const RESULT_NODE = 'canecas/geracoes';
const CREATIONS_NODE = 'canecas/personalizadas';
const WAIT_MS = 180000;
const POLL_MS = 1800;
const TEMP_DAYS = 8;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const text = value => String(value ?? '').trim();
const params = new URLSearchParams(location.search);
const modelId = text(params.get('model'));
const explicitReturn = text(params.get('return'));
const embedded = params.get('embed') === '1';
let product = null;
let config = null;

function safeKey(value) { return text(value).replace(/[.#$\[\]/]/g, '_'); }
function esc(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function num(value) { const n = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function digits(value) { return text(value).replace(/\D+/g, ''); }
function slug(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,130) || `cf-${Date.now()}`; }
function isoAfterDays(days) { return new Date(Date.now() + days * 86400000).toISOString(); }
function productImage(p = {}) {
  const values = [p.mockup_1, p.mockup_2, p.url_imagem, p.imagem_url, p.imagem, ...(Array.isArray(p.imagens_site) ? p.imagens_site : []), ...(Array.isArray(p.imagens) ? p.imagens : [])];
  return values.map(v => typeof v === 'object' ? (v?.url || v?.src || '') : v).map(text).find(v => /^https?:\/\//i.test(v)) || '';
}
function modelArt(p = {}) { return text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url || p.arte_final_url); }
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
function returnUrl() { return safeStoreUrl(explicitReturn) || productStoreUrl(product || {}) || STOREFRONT; }
function showError(message) {
  $('#progressBox').hidden = true;
  $('#successBox').hidden = true;
  $('#errorText').textContent = message;
  $('#errorBox').hidden = false;
}
function setProgress(title, message) {
  $('#errorBox').hidden = true;
  $('#successBox').hidden = true;
  $('#progressTitle').textContent = title;
  $('#progressText').textContent = message;
  $('#progressBox').hidden = false;
}
async function fetchJson(path) {
  const response = await fetch(`${FIREBASE}/${path}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}
async function writeJson(path, data, method = 'PUT') {
  const response = await fetch(`${FIREBASE}/${path}.json`, { method, headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify(data) });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json().catch(() => null);
}
function normalizeConfig(p = {}) {
  const raw = p.personalizacao && typeof p.personalizacao === 'object' ? p.personalizacao : {};
  let fieldsRaw = raw.campos || p.personalizacao_campos || p.campos_personalizacao || p.campos_publicos || p.canecafacil_campos || {};
  const fromPrivateConfig = Boolean(raw.campos && typeof raw.campos === 'object');
  let entries = [];
  if (Array.isArray(fieldsRaw)) entries = fieldsRaw.map((value, index) => [text(value?.id || value?.key || value?.nome || `campo_${index + 1}`), value]);
  else if (fieldsRaw && typeof fieldsRaw === 'object') entries = Object.entries(fieldsRaw);

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
      label: text(item.rotulo || item.label || item.nome || id),
      type,
      required: item.obrigatorio === true || item.required === true,
      placeholder: text(item.placeholder || item.exemplo),
      help: text(item.ajuda || item.help || item.descricao),
      options,
      max: Number(item.maxlength || item.max || 0) || ({ nome:80, endereco:180, telefone:40, site:120 }[id] || 180),
    };
  }).filter(Boolean);

  return {
    active: raw.ativa !== false,
    required: raw.ativa === true && raw.obrigatoria === true,
    fields,
    version: Number(raw.config_version || 0) || 0,
    promptBaseId: text(raw.prompt_base_id || p.personalizacao_prompt_base),
    promptBaseText: text(raw.prompt_base_texto),
    promptSpecific: text(raw.prompt_especifico || p.personalizacao_prompt_especifico),
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
    left: cropCanvasDataUrl(image, 0, half, height),
    right: cropCanvasDataUrl(image, half, width - half, height),
  };
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
  const value = text(record.art_source_url || record.art_url || record.result_url || record.arte_horizontal_url || record.arte_horizontal || record.art_source_base64 || record.image_base64 || nested.art_source_url || nested.art_source_base64);
  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 1000) return `data:image/webp;base64,${value.replace(/\s+/g,'')}`;
  return '';
}
async function waitResult(requestId) {
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
    $('#progressText').textContent = `Gerando sua arte · ${elapsed}s`;
    try {
      const record = await fetchJson(`${RESULT_NODE}/${safeKey(requestId)}`);
      if (record?.ok === false || record?.error || record?.erro) throw new Error(record.error || record.erro || 'A automação não conseguiu gerar a arte.');
      const source = imageSource(record);
      if (source) return source;
    } catch (error) {
      if (!/Firebase 404/i.test(error?.message || '')) console.debug('Aguardando personalização:', error?.message || error);
    }
    await sleep(POLL_MS);
  }
  throw new Error('A personalização demorou mais de 3 minutos. Tente novamente.');
}
function creationCode() {
  const date = new Date();
  const prefix = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  return `CF-${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}
function tempSku(code) {
  const clean = text(code).toUpperCase().replace(/[^A-Z0-9]+/g,'').slice(-20);
  return `CFP-${clean}`.slice(0,30);
}
async function persistCreation(code, source, fields, images) {
  const at = new Date().toISOString();
  const record = {
    id: code,
    origem: 'loja_integrada',
    loja_dominio: 'canecafacil.com.br',
    return_url: returnUrl(),
    modelo_key: modelId,
    modelo_nome: text(product?.nome),
    produto_key: modelId,
    campos: fields,
    imagens_cliente_campos: images.map(item => item.field_id),
    arte_horizontal: source,
    arte_personalizacao: source,
    arte_aprovada: { url:source, versao:'v1', aprovado_em:at },
    arte_versao: 'v1',
    arte_versao_aprovada: 'v1',
    aprovada: true,
    versoes: [{ versao:'v1', url:source, criado_em:at, status:'aprovada_automaticamente' }],
    personalizacao_snapshot: {
      config_version: config.version,
      prompt_base_id: config.promptBaseId,
      prompt_base_texto: config.promptBaseText,
      prompt_especifico: config.promptSpecific,
      campos_liberados: config.fields.map(field => ({ id:field.id, rotulo:field.label, tipo:field.type, obrigatorio:field.required }))
    },
    status: 'pronta_para_compra',
    atendimento_status: 'novo',
    criado_em: at,
    atualizado_em: at,
  };
  await writeJson(`${CREATIONS_NODE}/${safeKey(code)}`, record, 'PUT');
}
function temporaryProductPayload(code, crops) {
  const sku = tempSku(code);
  const alias = slug(`caneca-personalizada-${code}`);
  const li = product?.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  if (!text(crops?.left) || !text(crops?.right)) throw new Error('Os dois recortes da arte personalizada não ficaram prontos.');

  const productBody = {
    id_externo: null,
    sku,
    mpn: null,
    ncm: digits(product?.ncm || '69111090') || '69111090',
    gtin: null,
    nome: `Caneca personalizada · ${text(product?.nome || 'Caneca Fácil')}`.slice(0,140),
    apelido: alias,
    descricao_completa: `Caneca personalizada reservada. Código técnico: ${code}. A arte permanece protegida no sistema CanecaFácil.`,
    ativo: true,
    bloqueado: false,
    destaque: false,
    peso: num(product?.peso_embalado_kg || product?.peso) || 0.45,
    altura: Math.ceil(num(product?.altura_embalada_cm || product?.altura)) || 14,
    largura: Math.ceil(num(product?.largura_embalada_cm || product?.largura)) || 14,
    profundidade: Math.ceil(num(product?.comprimento_embalado_cm || product?.comprimento)) || 14,
    tipo: 'normal',
    usado: false,
    categorias: [],
    marca: null,
    removido: false,
    url_video_youtube: null,
  };
  const priceBody = {
    cheio: num(product?.preco) || 19.9,
    custo: num(product?.preco_custo || product?.custo) || 0,
    sob_consulta: false,
    promocional: num(product?.preco_oferta || product?.preco_promocional) || 0,
  };
  const stockBody = { gerenciado:false, quantidade:0, situacao_em_estoque:0, situacao_sem_estoque:0 };
  const seoBody = {
    title: 'Caneca personalizada | Caneca Fácil',
    keyword: '',
    description: 'Item personalizado reservado para conclusão da compra na Caneca Fácil.'
  };
  return {
    action: 'loja_integrada_create_personalized_product',
    request_id: `LI-TEMP-${Date.now().toString(36).toUpperCase()}`,
    product_key: safeKey(code),
    model_id: modelId,
    firebase_url: FIREBASE,
    products_node: CREATIONS_NODE,
    produto_json: JSON.stringify(productBody),
    preco_json: JSON.stringify(priceBody),
    estoque_json: JSON.stringify(stockBody),
    seo_json: JSON.stringify(seoBody),
    alias_json: JSON.stringify({ absolute_path:`/${alias}` }),
    crop_left_base64: crops.left,
    crop_right_base64: crops.right,
    personalizavel: false,
    ativo_loja: true,
    sku,
    source: BUILD,
  };
}
async function createTemporaryProduct(code, crops) {
  setProgress('Arte pronta', 'Preparando sua caneca no carrinho…');
  const payload = temporaryProductPayload(code, crops);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100000);
  try {
    const response = await fetch(MAKE_WEBHOOK, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify({ payload:JSON.stringify(payload) }),
      signal:controller.signal,
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok || data.ok === false) throw new Error(data.error || data.error_message || `Loja Integrada respondeu ${response.status}.`);
    const productId = text(data.produto_id || data.product_id);
    if (!productId) throw new Error('A Loja Integrada não retornou o item reservado.');
    const at = new Date().toISOString();
    await writeJson(`${CREATIONS_NODE}/${safeKey(code)}`, {
      loja_integrada_temporario: {
        status:'ativo',
        sku:payload.sku,
        produto_id:productId,
        alias:JSON.parse(payload.alias_json).absolute_path.replace(/^\//,''),
        url:text(data.url),
        produto_base_key:modelId,
        criado_em:at,
        ativado_em:at,
        atualizado_em:at,
        expira_em:isoAfterDays(TEMP_DAYS),
        dias_sem_compra:TEMP_DAYS,
        dias_pos_compra:30,
        privacidade:'sem_arte_ou_dados_pessoais_na_loja_integrada',
        origem:'personalizador_web_sincrono',
        erro:''
      }
    }, 'PATCH');
    return productId;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A preparação do carrinho demorou mais que o esperado. Tente novamente.');
    throw error;
  } finally { clearTimeout(timer); }
}
function cartUrl(productId, code) {
  const url = new URL(`/carrinho/produto/${encodeURIComponent(productId)}/adicionar`, STOREFRONT);
  url.searchParams.set('utm_source', 'canecafacil');
  url.searchParams.set('utm_medium', 'personalizador');
  url.searchParams.set('utm_content', code);
  return url.href;
}
function goToCart(productId, code) {
  const url = cartUrl(productId, code);
  $('#progressBox').hidden = true;
  $('#successText').textContent = 'Sua arte foi criada e sua caneca está pronta para continuar a compra.';
  $('#cartFallback').href = url;
  $('#successBox').hidden = false;
  try {
    if (window.top && window.top !== window) window.top.location.href = url;
    else location.href = url;
  } catch {
    try { window.open(url, '_top'); } catch { /* fallback visível */ }
  }
}
async function generateAndCart(event) {
  event.preventDefault();
  if (!config?.fields?.length) return;
  const form = $('#personalizerForm');
  if (!form.reportValidity()) return;
  const button = $('#generateButton');
  button.disabled = true;
  setProgress('Gerando sua arte', 'Aguarde alguns instantes. Você irá direto para o carrinho.');
  try {
    const { fields, images } = await collectCustomerValues();
    const officialArt = await urlToDataUrl(modelArt(product || {}));
    if (!officialArt) throw new Error('Este modelo não possui arte-base disponível para personalização.');
    const customerImage = text(images[0]?.image_base64) || officialArt;
    const requestId = `LI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const personalizationPayload = {
      action:'personalize_mug_model',
      request_id:requestId,
      model_id:modelId,
      mode:'loja_integrada',
      origin:'loja_integrada',
      store_domain:'canecafacil.com.br',
      return_url:returnUrl(),
      customer_name:'',
      customer_whatsapp:'',
      customer_email:'',
      fields_json:JSON.stringify(fields),
      images_json:JSON.stringify(images),
      image_base64:customerImage,
      instruction:config.promptSpecific,
      prompt_art:[config.promptBaseText, config.promptSpecific].filter(Boolean).join('\n\n') || 'Personalize fielmente a arte oficial do modelo usando somente os campos liberados no cadastro privado. Preserve integralmente o restante da composição.',
      firebase_url:FIREBASE,
      products_node:'produtos',
      quality:'low',
      client_contract:BUILD,
    };
    const response = await fetch(MAKE_WEBHOOK, { method:'POST', headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify({ payload:JSON.stringify(personalizationPayload) }) });
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

    setProgress('Arte pronta', 'Preparando as duas imagens da sua personalização…');
    const crops = await createTwoCrops(source);
    const code = creationCode();
    await persistCreation(code, source, fields, images);
    const tempProductId = await createTemporaryProduct(code, crops);
    goToCart(tempProductId, code);
  } catch (error) {
    showError(error?.message || String(error));
    button.disabled = false;
  }
}
async function init() {
  document.documentElement.dataset.cfLiPersonalizer = BUILD;
  document.body.classList.toggle('is-embed', embedded);
  if (!modelId) return showError('Não foi informado qual modelo deve ser personalizado.');
  try {
    product = await fetchJson(`produtos/${safeKey(modelId)}`);
    if (!product) throw new Error('A caneca escolhida não foi encontrada.');
    if (product.loja_integrada_personalizavel === false || product.canecafacil_personalizavel === false) throw new Error('Este modelo não está disponível para personalização.');
    config = normalizeConfig(product);
    if (!config.active) throw new Error('A personalização deste modelo está desativada.');
    render();
  } catch (error) { return showError(error?.message || String(error)); }

  $('#personalizerForm').addEventListener('submit', generateAndCart);
  $('#backButton').addEventListener('click', () => { location.href = returnUrl(); });
  $('#tryAgain').addEventListener('click', () => { $('#errorBox').hidden = true; $('#personalizerForm').hidden = false; });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
else init();