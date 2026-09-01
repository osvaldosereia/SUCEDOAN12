const BUILD = '20260901-loja-integrada-personalizador-v3-commerce';
const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const STOREFRONT = 'https://canecafacil.com.br/';
const RESULT_NODE = 'canecas/geracoes';
const CREATIONS_NODE = 'canecas/personalizadas';
const WAIT_MS = 180000;
const POLL_MS = 1800;

const $ = s => document.querySelector(s);
const text = v => String(v ?? '').trim();
const params = new URLSearchParams(location.search);
const modelId = text(params.get('model'));
const explicitReturn = text(params.get('return'));
let product = null;
let photoDataUrl = '';
let currentCode = '';
let currentSource = '';

function safeKey(v) { return text(v).replace(/[.#$\[\]/]/g, '_'); }
function esc(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function money(v) { return Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
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
    if (host !== 'canecafacil.com.br') return '';
    return url.href;
  } catch {
    return '';
  }
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
  $('#errorText').textContent = message;
  $('#errorBox').hidden = false;
}
async function fetchJson(path) {
  const r = await fetch(`${FIREBASE}/${path}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json();
}
async function writeJson(path, data, method = 'PUT') {
  const r = await fetch(`${FIREBASE}/${path}.json`, { method, headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify(data) });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json().catch(() => null);
}
function normalizeFields(p = {}) {
  const raw = p.personalizacao_campos || p.campos_personalizacao || p.campos_publicos || p.canecafacil_campos || p.personalizacao?.campos || [];
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') list = Object.entries(raw).map(([id, v]) => ({ id, ...(typeof v === 'object' ? v : { label:v }) }));
  return list.map((field, index) => {
    const id = text(field.id || field.key || field.nome || `campo_${index + 1}`);
    const type = text(field.tipo || field.type || 'text').toLowerCase();
    const options = Array.isArray(field.opcoes || field.options) ? (field.opcoes || field.options) : text(field.opcoes || field.options).split('|').map(text).filter(Boolean);
    return {
      id,
      label: text(field.rotulo || field.label || field.nome || id),
      type,
      required: field.obrigatorio === true || field.required === true,
      placeholder: text(field.placeholder || field.exemplo),
      help: text(field.ajuda || field.help || field.descricao),
      options,
    };
  }).filter(f => f.id && f.type !== 'foto' && f.type !== 'image');
}
function renderFields() {
  const fields = normalizeFields(product || {});
  const root = $('#dynamicFields');
  if (!fields.length) {
    root.innerHTML = '<div class="wide-block" style="grid-column:1/-1;color:#71766f;font-size:12px">Este modelo não possui campos públicos específicos. Use a instrução complementar abaixo para dizer o que deseja alterar.</div>';
    return;
  }
  root.innerHTML = fields.map(field => {
    const req = field.required ? 'required' : '';
    const help = field.help ? `<small style="font-weight:500;color:#777">${esc(field.help)}</small>` : '';
    if (field.type === 'select' || field.type === 'opcao' || field.type === 'option') {
      return `<label data-dynamic-field="${esc(field.id)}">${esc(field.label)}<select data-field-id="${esc(field.id)}" ${req}><option value="">Selecione…</option>${field.options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>${help}</label>`;
    }
    if (field.type === 'textarea' || field.type === 'frase_longa') {
      return `<label class="wide" data-dynamic-field="${esc(field.id)}">${esc(field.label)}<textarea data-field-id="${esc(field.id)}" rows="3" placeholder="${esc(field.placeholder)}" ${req}></textarea>${help}</label>`;
    }
    return `<label data-dynamic-field="${esc(field.id)}">${esc(field.label)}<input data-field-id="${esc(field.id)}" placeholder="${esc(field.placeholder)}" ${req}>${help}</label>`;
  }).join('');
}
function renderProduct() {
  const image = productImage(product || {});
  $('#productBox').innerHTML = `${image ? `<img src="${esc(image)}" alt="${esc(product?.nome || 'Caneca')}">` : '<div class="skeleton media"></div>'}<div class="product-copy"><h2>${esc(product?.nome || 'Caneca personalizada')}</h2><p>${esc(product?.tema_caneca || product?.subcategoria || 'Personalize este modelo')}</p><strong>${money(product?.preco)}</strong></div>`;
  renderFields();
  $('#personalizerForm').hidden = false;
}
function collectFields() {
  const out = {};
  $$('[data-field-id]').forEach(input => { const value = text(input.value); if (value) out[input.dataset.fieldId] = value; });
  return out;
}
function $$(s) { return [...document.querySelectorAll(s)]; }
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(text(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler a foto selecionada.'));
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
    $('#progressText').textContent = `Gerando a personalização · ${elapsed}s`;
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
  const d = new Date();
  const date = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `CF-${date}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}
async function persistCreation(source, fields, instruction) {
  const code = creationCode();
  const now = new Date().toISOString();
  const record = {
    id: code,
    origem: 'loja_integrada',
    loja_dominio: 'canecafacil.com.br',
    return_url: returnUrl(),
    modelo_key: modelId,
    modelo_nome: text(product?.nome),
    produto_key: modelId,
    cliente_nome: text($('#customerName').value),
    cliente_whatsapp: text($('#customerWhatsapp').value),
    cliente_email: text($('#customerEmail').value),
    campos: fields,
    instrucao: instruction,
    arte_horizontal: source,
    arte_personalizacao: source,
    arte_aprovada: null,
    arte_versao: 'v1',
    arte_versao_aprovada: '',
    aprovada: false,
    versoes: [{ versao:'v1', url:source, criado_em:now }],
    status: 'arte_pronta',
    atendimento_status: 'novo',
    criado_em: now,
    atualizado_em: now,
  };
  await writeJson(`${CREATIONS_NODE}/${safeKey(code)}`, record, 'PUT');
  return code;
}
async function generate(event) {
  event.preventDefault();
  $('#errorBox').hidden = true;
  $('#resultBox').hidden = true;
  const button = $('#generateButton');
  button.disabled = true;
  $('#progressBox').hidden = false;
  try {
    const fields = collectFields();
    const instruction = text($('#freeInstruction').value);
    let reference = photoDataUrl;
    if (!reference) reference = await urlToDataUrl(modelArt(product || {}));
    if (!reference) throw new Error('Este modelo não possui arte-base disponível para personalização.');
    const requestId = `LI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const payload = {
      action: 'personalize_mug_model',
      request_id: requestId,
      model_id: modelId,
      mode: 'loja_integrada',
      origin: 'loja_integrada',
      store_domain: 'canecafacil.com.br',
      return_url: returnUrl(),
      customer_name: text($('#customerName').value),
      customer_whatsapp: text($('#customerWhatsapp').value),
      customer_email: text($('#customerEmail').value),
      fields_json: JSON.stringify(fields),
      images_json: JSON.stringify(photoDataUrl ? [{ image_base64:photoDataUrl }] : []),
      image_base64: reference,
      instruction,
      prompt_art: 'Personalize fielmente a arte oficial do modelo conforme os campos e a instrução do cliente. Preserve todo o restante da composição.',
      firebase_url: FIREBASE,
      products_node: 'produtos',
      quality: 'low',
      client_contract: BUILD,
    };
    const response = await fetch(MAKE_WEBHOOK, { method:'POST', headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify({ payload:JSON.stringify(payload) }) });
    const raw = await response.text();
    let source = '';
    if (raw && !/^accepted\.?$/i.test(text(raw))) {
      try {
        const data = JSON.parse(raw);
        if (data.ok === false) throw new Error(data.error || 'A automação recusou a personalização.');
        source = imageSource(data);
      } catch (error) {
        if (error instanceof SyntaxError) console.debug('Resposta síncrona não JSON; seguindo pelo Firebase.'); else throw error;
      }
    }
    if (!response.ok) throw new Error(`Automação respondeu HTTP ${response.status}.`);
    if (!source) source = await waitResult(requestId);
    const code = await persistCreation(source, fields, instruction);
    currentCode = code;
    currentSource = source;
    $('#progressBox').hidden = true;
    $('#resultImage').src = source;
    $('#resultCode').textContent = code;
    $('#resultBox').hidden = false;
    $('#resultBox').scrollIntoView({ behavior:'smooth', block:'start' });
  } catch (error) {
    showError(error?.message || String(error));
  } finally {
    button.disabled = false;
  }
}
async function approveAndBuy() {
  if (!currentCode || !currentSource) return;
  const button = $('#returnButton');
  if (button.disabled) return;
  button.disabled = true;
  $('#errorBox').hidden = true;
  $('#progressBox').hidden = false;
  $('#progressText').textContent = 'Aprovando sua arte e preparando o item personalizado…';
  try {
    const at = new Date().toISOString();
    await writeJson(`${CREATIONS_NODE}/${safeKey(currentCode)}`, {
      aprovada: true,
      arte_aprovada: { url: currentSource, versao:'v1', aprovado_em:at },
      arte_versao_aprovada: 'v1',
      status: 'pronta_para_compra',
      atualizado_em: at,
      loja_integrada_temporario: {
        status: 'solicitado',
        solicitado_em: at,
        atualizado_em: at,
        origem: 'personalizador_web'
      }
    }, 'PATCH');

    const started = Date.now();
    const timeout = 6 * 60 * 1000;
    while (Date.now() - started < timeout) {
      const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
      $('#progressText').textContent = `Preparando seu item personalizado para o carrinho · ${elapsed}s`;
      const creation = await fetchJson(`${CREATIONS_NODE}/${safeKey(currentCode)}`);
      const temp = creation?.loja_integrada_temporario || {};
      if (temp.status === 'ativo' && temp.produto_id) {
        const cart = new URL(`/carrinho/produto/${encodeURIComponent(temp.produto_id)}/adicionar`, STOREFRONT);
        cart.searchParams.set('utm_source', 'canecafacil');
        cart.searchParams.set('utm_medium', 'personalizador');
        cart.searchParams.set('utm_content', currentCode);
        location.href = cart.href;
        return;
      }
      if (temp.status === 'revisar') throw new Error(temp.erro || 'A criação precisa de revisão antes da compra.');
      if (temp.status === 'pendente_retry' && temp.erro) $('#progressText').textContent = 'Ainda preparando seu item. Nova tentativa automática em instantes…';
      await sleep(2500);
    }
    throw new Error('Sua arte foi aprovada, mas o item ainda está sendo preparado. Tente novamente em alguns minutos.');
  } catch (error) {
    $('#progressBox').hidden = true;
    showError(error?.message || String(error));
    button.disabled = false;
  }
}

async function init() {
  document.documentElement.dataset.cfLiPersonalizer = BUILD;
  if (!modelId) return showError('O link de personalização não informou qual modelo de caneca deve ser usado.');
  try {
    product = await fetchJson(`produtos/${safeKey(modelId)}`);
    if (!product) throw new Error('A caneca escolhida não foi encontrada.');
    if (product.loja_integrada_personalizavel === false || product.canecafacil_personalizavel === false) throw new Error('Este modelo não está disponível para personalização.');
    renderProduct();
  } catch (error) {
    showError(error?.message || String(error));
  }
  $('#personalizerForm').addEventListener('submit', generate);
  $('#customerPhoto').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    photoDataUrl = file ? await fileToDataUrl(file) : '';
    const box = $('#photoPreview');
    box.hidden = !photoDataUrl;
    box.innerHTML = photoDataUrl ? `<img src="${esc(photoDataUrl)}" alt="Prévia da foto">` : '';
  });
  $('#backButton').addEventListener('click', () => { location.href = returnUrl(); });
  $('#returnButton').addEventListener('click', approveAndBuy);
  $('#redoButton').addEventListener('click', () => { $('#resultBox').hidden = true; $('#personalizerForm').hidden = false; $('#personalizerForm').scrollIntoView({ behavior:'smooth' }); });
  $('#copyCode').addEventListener('click', async () => { if (currentCode) { await navigator.clipboard?.writeText(currentCode).catch(() => null); $('#copyCode').textContent = 'Copiado'; setTimeout(() => $('#copyCode').textContent = 'Copiar', 1500); } });
  $('#tryAgain').addEventListener('click', () => { $('#errorBox').hidden = true; $('#personalizerForm').hidden = false; });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
else init();