import { CONFIG } from './config.js?v=20260826-mug-public-v2';

const BUILD = '20260826-site-mug-public-v3-base64-stable';
const FB = String(CONFIG.ENDPOINTS?.FIREBASE_ORDERS || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/pedidos').replace(/\/pedidos\/?$/, '');
const MAKE = String(CONFIG.ENDPOINTS?.MUG_PERSONALIZATION || '').trim();
const N = { products:'produtos', public:'canecas/personalizadas_publicas', private:'canecas/personalizadas', models:'canecas/modelos_criacao' };
const PH = { art:'__MUG_ART__', m1:'__MUG_MOCKUP_1__', m2:'__MUG_MOCKUP_2__', m3:'__MUG_MOCKUP_3__' };
const DAILY_LIMIT = 3;
const LIMIT_KEY = `${CONFIG.STORAGE.PREFIX}mug_creation_limits_v2`;
const CUSTOMER_KEY = `${CONFIG.STORAGE.PREFIX}mug_customer_v2`;
const CART_KEY = `${CONFIG.STORAGE.PREFIX}${CONFIG.STORAGE.CART}`;
const CHECKOUT_KEY = `${CONFIG.STORAGE.PREFIX}${CONFIG.STORAGE.CHECKOUT_CLIENT}`;
const STATE = { key:'', product:null, config:null, id:'', busy:false, mounted:false };

const text = value => String(value ?? '').trim();
const escapeHtml = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const isHttpUrl = value => /^https?:\/\//i.test(text(value));
const isImageSource = value => isHttpUrl(value) || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(text(value));
const digits = value => text(value).replace(/\D+/g, '');
const readLocal = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const writeLocal = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

function routeKey() {
  const match = String(location.hash || '').match(/^#\/produto\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function get(path) {
  const response = await fetch(`${FB}/${path}.json`, { cache:'no-store', headers:{ Accept:'application/json' } });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}

async function put(path, payload, method='PUT') {
  const response = await fetch(`${FB}/${path}.json`, {
    method,
    headers:{ 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json().catch(() => null);
}

function normalizeFields(config={}) {
  return (Array.isArray(config.campos) ? config.campos : [])
    .filter(field => field && field.publico !== false)
    .map((field, index) => ({
      id:text(field.id || `campo_${index + 1}`),
      tipo:text(field.tipo || 'texto'),
      label:text(field.label || `Campo ${index + 1}`),
      obrigatorio:field.obrigatorio === true,
      placeholder:text(field.placeholder),
      valor_padrao:text(field.valor_padrao),
      ajuda:text(field.ajuda),
      opcoes:Array.isArray(field.opcoes) ? field.opcoes.map(text).filter(Boolean) : [],
      ordem:Number(field.ordem ?? index)
    }))
    .sort((a,b) => a.ordem - b.ordem);
}

function canonicalWhatsapp(value) {
  let number = digits(value);
  if ((number.length === 12 || number.length === 13) && number.startsWith('55')) number = number.slice(2);
  if (number.length !== 10 && number.length !== 11) return '';
  return `55${number}`;
}

function localWhatsapp(value) {
  const canonical = canonicalWhatsapp(value);
  return canonical ? canonical.slice(2) : '';
}

function displayWhatsapp(value) {
  const number = localWhatsapp(value);
  if (number.length === 11) return `(${number.slice(0,2)}) ${number.slice(2,7)}-${number.slice(7)}`;
  if (number.length === 10) return `(${number.slice(0,2)}) ${number.slice(2,6)}-${number.slice(6)}`;
  return text(value);
}

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function limitData() {
  const current = readLocal(LIMIT_KEY, {});
  return current && typeof current === 'object' ? current : {};
}

function creationsToday(whatsapp) {
  const phone = canonicalWhatsapp(whatsapp);
  if (!phone) return 0;
  const entries = limitData()?.[dayKey()]?.[phone];
  return Array.isArray(entries) ? entries.length : 0;
}

function registerCreation(whatsapp, id) {
  const phone = canonicalWhatsapp(whatsapp);
  if (!phone) return;
  const data = limitData();
  const today = dayKey();
  data[today] ||= {};
  data[today][phone] ||= [];
  if (!data[today][phone].some(item => item?.id === id)) data[today][phone].push({ id, at:new Date().toISOString() });
  for (const key of Object.keys(data)) if (key !== today) delete data[key];
  writeLocal(LIMIT_KEY, data);
}

function remainingToday(whatsapp) {
  return Math.max(0, DAILY_LIMIT - creationsToday(whatsapp));
}

function installStyles() {
  if (document.getElementById('mugPublicTemplateStylesV2')) return;
  const style = document.createElement('style');
  style.id = 'mugPublicTemplateStylesV2';
  style.textContent = `
  .mug-public-personalizer{margin:18px 0 28px;border:1px solid #e1e3de;border-radius:22px;background:#fff;overflow:hidden;box-shadow:0 12px 38px rgba(30,34,28,.07)}
  .mug-public-head{padding:20px;background:linear-gradient(135deg,#f7f7f3,#fff)}
  .mug-public-head span{display:inline-block;padding:5px 9px;border-radius:999px;background:#20221f;color:#fff;font-size:10px;font-weight:800}
  .mug-public-head h2{font-size:25px;line-height:1.12;margin:10px 0 6px}.mug-public-head p{margin:0;color:#666b63;font-size:13px;line-height:1.5}
  .mug-public-form{padding:18px;display:grid;gap:14px}.mug-public-field{display:grid;gap:6px}.mug-public-field>span{font-size:12px;font-weight:800;color:#31352f}
  .mug-public-field small{font-size:11px;color:#737970;line-height:1.35}.mug-public-field input,.mug-public-field textarea,.mug-public-field select{width:100%;box-sizing:border-box;border:1px solid #d9ddd5;border-radius:12px;background:#fff;padding:12px 13px;font:inherit;font-size:16px;color:#20231f;outline:none}
  .mug-public-field textarea{min-height:92px;resize:vertical}.mug-public-field input:focus,.mug-public-field textarea:focus,.mug-public-field select:focus{border-color:#858d7e;box-shadow:0 0 0 3px rgba(110,124,100,.11)}
  .mug-public-photo{border:1px dashed #bfc5ba;border-radius:14px;padding:14px;background:#fafbf8}.mug-public-photo input{border:0;padding:0;background:transparent}
  .mug-public-identification{display:grid;gap:12px;padding:14px;border:1px solid #dbe5d8;border-radius:15px;background:#f7fbf5}.mug-public-identification>strong{font-size:13px}.mug-public-identification>p{margin:0;color:#657064;font-size:11px;line-height:1.45}
  .mug-public-limit{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border-radius:10px;background:#edf3e9;font-size:11px}.mug-public-limit b{font-size:12px}.mug-public-limit.blocked{background:#fff1ef;color:#8c302b}
  .mug-public-generate,.mug-public-result button,.mug-public-result a{min-height:48px;border:0;border-radius:12px;padding:11px 14px;font-weight:800;font-size:14px;cursor:pointer;text-decoration:none;display:flex;align-items:center;justify-content:center}
  .mug-public-generate{background:#252822;color:#fff}.mug-public-generate:disabled{opacity:.45;cursor:not-allowed}
  .mug-public-progress{display:grid;gap:8px;padding:13px;border-radius:13px;background:#f5f6f3}.mug-public-progress-head{display:flex;justify-content:space-between;gap:10px;font-size:12px}.mug-public-progress-track{height:8px;border-radius:999px;background:#e0e4dc;overflow:hidden}.mug-public-progress-track>i{display:block;width:0;height:100%;background:#252822;transition:width .3s ease}
  .mug-public-error{padding:11px 12px;border-radius:12px;background:#fff1f1;color:#852a2a;border:1px solid #efd0d0;font-size:12px}
  .mug-public-result{display:grid;gap:14px;padding:15px;border:1px solid #dfe5dc;border-radius:16px;background:#fbfdf9}.mug-public-result h3{margin:0;font-size:20px}.mug-public-result>p{margin:0;color:#596057;font-size:12px;line-height:1.5}
  .mug-result-art{display:grid;gap:6px}.mug-result-art span,.mug-result-mockups>span{font-size:11px;font-weight:800;color:#626a60}.mug-result-art img{width:100%;aspect-ratio:2.5/1;object-fit:contain;border-radius:12px;background:#f1f3ef;border:1px solid #e0e4dd}
  .mug-result-mockups{display:grid;gap:8px}.mug-result-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.mug-result-grid img{width:100%;aspect-ratio:1/1;object-fit:contain;border-radius:12px;background:#f1f3ef;border:1px solid #e0e4dd}
  .mug-public-saved{padding:11px;border-radius:11px;background:#edf8ef;color:#24552e;font-size:12px;line-height:1.45}.mug-public-result-actions{display:grid;gap:8px}.mug-public-result-actions button{background:#1d5f38;color:#fff}.mug-public-result-actions a{background:#252822;color:#fff}.mug-public-result-actions .secondary{background:#eef1ec;color:#2d312b}
  @media(min-width:760px){.mug-public-personalizer{max-width:760px}.mug-public-form{grid-template-columns:repeat(2,minmax(0,1fr))}.mug-public-field,.mug-public-identification,.mug-public-progress,.mug-public-result,.mug-public-generate,.mug-public-error{grid-column:1/-1}}
  @media(max-width:600px){.mug-public-personalizer{border-radius:16px;margin-inline:-2px}.mug-public-head{padding:18px 16px}.mug-public-head h2{font-size:22px}.mug-public-form{padding:14px}.mug-result-grid{gap:5px}.mug-public-generate{min-height:52px}}
  `;
  document.head.appendChild(style);
}

function fieldHtml(field) {
  const required = field.obrigatorio ? 'required' : '';
  const mark = field.obrigatorio ? ' *' : '';
  const help = field.ajuda ? `<small>${escapeHtml(field.ajuda)}</small>` : '';
  const common = `data-mug-public-field="${escapeHtml(field.id)}" data-field-type="${escapeHtml(field.tipo)}" ${required}`;
  let input = '';
  if (field.tipo === 'foto') input = `<div class="mug-public-photo"><input ${common} type="file" accept="image/*"></div>`;
  else if (field.tipo === 'texto_longo') input = `<textarea ${common} maxlength="220" placeholder="${escapeHtml(field.placeholder)}">${escapeHtml(field.valor_padrao)}</textarea>`;
  else if (field.tipo === 'select') input = `<select ${common}><option value="">Selecione…</option>${field.opcoes.map(option => `<option value="${escapeHtml(option)}" ${option === field.valor_padrao ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`;
  else if (field.tipo === 'data') input = `<input ${common} type="date" value="${escapeHtml(field.valor_padrao)}">`;
  else if (field.tipo === 'numero') input = `<input ${common} type="number" value="${escapeHtml(field.valor_padrao)}" placeholder="${escapeHtml(field.placeholder)}">`;
  else if (field.tipo === 'cor') input = `<input ${common} type="color" value="${escapeHtml(field.valor_padrao || '#000000')}">`;
  else input = `<input ${common} type="text" maxlength="120" value="${escapeHtml(field.valor_padrao)}" placeholder="${escapeHtml(field.placeholder)}">`;
  return `<label class="mug-public-field"><span>${escapeHtml(field.label)}${mark}</span>${input}${help}</label>`;
}

function customerDefaults() {
  const saved = readLocal(CUSTOMER_KEY, {});
  return saved && typeof saved === 'object' ? saved : {};
}

function renderPanel(product, config) {
  installStyles();
  document.querySelector('#mug-public-personalizer')?.remove();
  const detail = document.querySelector('.product-detail');
  if (!detail) return false;
  const saved = customerDefaults();
  const section = document.createElement('section');
  section.id = 'mug-public-personalizer';
  section.className = 'mug-public-personalizer';
  section.innerHTML = `<div class="mug-public-head"><span>PERSONALIZE ESTE MODELO</span><h2>Crie a sua caneca</h2><p>Envie os dados pedidos neste modelo. Você verá a arte e as três prévias antes de finalizar a compra.</p></div><div class="mug-public-form">${normalizeFields(config).map(fieldHtml).join('')}<div class="mug-public-identification"><strong>Identificação da sua criação</strong><p>Informe seu nome e WhatsApp. Não é necessário enviar mensagem. Sua caneca será salva e identificada por esse número.</p><label class="mug-public-field"><span>Seu nome *</span><input id="mugPublicCustomerName" type="text" maxlength="80" autocomplete="name" required value="${escapeHtml(saved.name || '')}" placeholder="Seu nome"></label><label class="mug-public-field"><span>Seu WhatsApp *</span><input id="mugPublicCustomerWhatsapp" type="tel" inputmode="tel" autocomplete="tel" required value="${escapeHtml(saved.whatsapp || '')}" placeholder="(65) 99999-9999"><small>Até 3 criações por dia neste aparelho para cada número informado.</small></label><div class="mug-public-limit" id="mugPublicLimit"><span>Limite diário</span><b>Informe seu WhatsApp</b></div></div><div class="mug-public-progress" id="mugPublicProgress" hidden><div class="mug-public-progress-head"><strong>Preparando…</strong><b>0%</b></div><div class="mug-public-progress-track"><i></i></div></div><div class="mug-public-error" id="mugPublicError" hidden></div><button class="mug-public-generate" id="mugPublicGenerate" type="button">Criar minha caneca</button><div class="mug-public-result" id="mugPublicResult" hidden></div></div>`;
  detail.insertAdjacentElement('afterend', section);
  section.querySelector('#mugPublicGenerate')?.addEventListener('click', generate);
  section.querySelector('#mugPublicCustomerWhatsapp')?.addEventListener('input', updateLimitUi);
  section.querySelector('#mugPublicCustomerName')?.addEventListener('change', saveCustomerDraft);
  section.querySelector('#mugPublicCustomerWhatsapp')?.addEventListener('change', saveCustomerDraft);
  section.addEventListener('click', event => {
    if (event.target.closest('#mugPublicOpenCart')) document.getElementById('open-cart')?.click();
    if (event.target.closest('#mugPublicAnother')) resetAfterResult();
  });
  STATE.mounted = true;
  updateLimitUi();
  return true;
}

function saveCustomerDraft() {
  const name = text(document.querySelector('#mugPublicCustomerName')?.value);
  const whatsapp = text(document.querySelector('#mugPublicCustomerWhatsapp')?.value);
  writeLocal(CUSTOMER_KEY, { name, whatsapp });
}

function updateLimitUi() {
  const input = document.querySelector('#mugPublicCustomerWhatsapp');
  const box = document.querySelector('#mugPublicLimit');
  const button = document.querySelector('#mugPublicGenerate');
  if (!box || !button) return;
  const canonical = canonicalWhatsapp(input?.value);
  if (!canonical) {
    box.classList.remove('blocked');
    box.innerHTML = '<span>Limite diário</span><b>Informe um WhatsApp válido</b>';
    button.disabled = STATE.busy;
    return;
  }
  const remaining = remainingToday(canonical);
  box.classList.toggle('blocked', remaining <= 0);
  box.innerHTML = `<span>Criações disponíveis hoje</span><b>${remaining} de ${DAILY_LIMIT}</b>`;
  button.disabled = STATE.busy || remaining <= 0;
}

function setError(message='') {
  const node = document.querySelector('#mugPublicError');
  if (!node) return;
  node.hidden = !message;
  node.textContent = message;
}

function progress(percent, title) {
  const box = document.querySelector('#mugPublicProgress');
  if (!box) return;
  box.hidden = false;
  box.querySelector('strong').textContent = title;
  box.querySelector('b').textContent = `${percent}%`;
  box.querySelector('i').style.width = `${percent}%`;
}

function requestId() {
  return `cp-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}

function resultUrl(id) {
  const url = new URL('/ceneca10/resultado.html', location.origin);
  url.searchParams.set('id', id);
  return url.href;
}

function collect({ validate=true }={}) {
  const customerName = text(document.querySelector('#mugPublicCustomerName')?.value);
  const whatsappInput = text(document.querySelector('#mugPublicCustomerWhatsapp')?.value);
  const whatsapp = canonicalWhatsapp(whatsappInput);
  if (validate && !customerName) throw new Error('Informe seu nome.');
  if (validate && !whatsapp) throw new Error('Informe um número de WhatsApp válido com DDD.');
  if (validate && remainingToday(whatsapp) <= 0) throw new Error('Este número já atingiu o limite de 3 criações de hoje neste aparelho. Tente novamente amanhã.');
  const values = [];
  const files = [];
  for (const field of normalizeFields(STATE.config || {})) {
    const input = [...document.querySelectorAll('[data-mug-public-field]')].find(node => node.dataset.mugPublicField === field.id);
    if (!input) continue;
    if (field.tipo === 'foto') {
      const file = input.files?.[0] || null;
      if (validate && field.obrigatorio && !file) throw new Error(`Envie: ${field.label}.`);
      if (file) {
        if (!file.type.startsWith('image/')) throw new Error(`${field.label}: selecione uma imagem.`);
        files.push({ id:field.id, label:field.label, file });
      }
      values.push({ id:field.id, label:field.label, type:field.tipo, value:file ? file.name : '' });
    } else {
      const value = text(input.value);
      if (validate && field.obrigatorio && !value) throw new Error(`Preencha: ${field.label}.`);
      values.push({ id:field.id, label:field.label, type:field.tipo, value });
    }
  }
  return { customerName, whatsapp, whatsappLocal:localWhatsapp(whatsapp), values, files };
}

function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler uma das fotos.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir uma imagem gerada.'));
    image.src = src;
  });
}

async function normalizePhoto(file) {
  const image = await loadImage(await fileData(file));
  const scale = Math.min(1, 1500 / image.naturalWidth, 1500 / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { alpha:false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/webp', .94);
}

async function cropMaster(src) {
  const image = await loadImage(src);
  const target = 2.5;
  const ratio = image.naturalWidth / image.naturalHeight;
  let sx=0, sy=0, sw=image.naturalWidth, sh=image.naturalHeight;
  if (ratio > target) { sw = image.naturalHeight * target; sx = (image.naturalWidth - sw) / 2; }
  else { sh = image.naturalWidth / target; sy = (image.naturalHeight - sh) / 2; }
  const canvas = document.createElement('canvas'); canvas.width=2400; canvas.height=960;
  const ctx = canvas.getContext('2d', { alpha:false }); ctx.fillStyle='#fff'; ctx.fillRect(0,0,2400,960); ctx.drawImage(image,sx,sy,sw,sh,0,0,2400,960);
  return canvas.toDataURL('image/webp', .96);
}

async function cropReference(master, mode) {
  const image = await loadImage(master);
  const width = 1344;
  const sx = mode === 1 ? 0 : mode === 2 ? 2400 - width : Math.round((2400 - width) / 2);
  const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=960;
  const ctx = canvas.getContext('2d', { alpha:false }); ctx.fillStyle='#fff'; ctx.fillRect(0,0,width,960); ctx.drawImage(image,sx,0,width,960,0,0,width,960);
  return canvas.toDataURL('image/webp', .96);
}

async function callMake(payload, timeout=180000) {
  if (!isHttpUrl(MAKE)) throw new Error('A automação de personalização não está configurada.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(MAKE, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ payload:JSON.stringify(payload) }), signal:controller.signal
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`Automação respondeu conteúdo inválido (${response.status}).`); }
    if (!response.ok || data.ok === false) throw new Error(data.error || data.message || `Automação HTTP ${response.status}.`);
    return data;
  } finally { clearTimeout(timer); }
}

function primaryText(result, ids=[]) {
  for (const id of ids) {
    const item = result.values.find(value => value.id === id && value.value);
    if (item) return item.value;
  }
  return '';
}

function salePrice() {
  const raw = Number(STATE.product?.preco ?? STATE.product?.price ?? 29.9);
  return Number.isFinite(raw) && raw > 0 ? raw : 29.9;
}

function productTemplate(id, result, publicUrl) {
  const now = new Date().toISOString();
  const displayName = primaryText(result, ['nome','nome_1','nome_na_caneca','nome_destaque']);
  const phrase = primaryText(result, ['frase','mensagem','texto']);
  const price = salePrice();
  const name = `Caneca de Porcelana Personalizada${displayName ? ` ${displayName}` : ''} - 350ml`;
  return {
    id, firebaseKey:id, codigo:`CANP-${id.slice(-8).toUpperCase()}`, nome:name,
    categoria:'Caneca de Porcelana', subcategoria:'Personalizadas', ncm:'69111090',
    preco_custo:10, preco:price, estoque:0, situacao:'I', status:'I', ativo:false, visivel:false,
    modelo_caneca:true, modelo_publico:false, personalizacao_publica:false,
    material:'Porcelana', capacidade:'350ml', unidade:'UN',
    descricao:`${name}. Criação personalizada identificada pelo WhatsApp ${displayWhatsapp(result.whatsapp)}.`,
    tags:['caneca personalizada','caneca com foto','presente personalizado'],
    url_imagem:PH.m1, imagem:PH.m1, imagem_url:PH.m1, imagens:[PH.m1,PH.m2,PH.m3], imagens_site:[PH.m1,PH.m2,PH.m3],
    mockup_1:PH.m1, mockup_2:PH.m2, mockup_3:PH.m3, arte_personalizacao:PH.art, arte_horizontal:PH.art,
    arte_impressao:{ url:PH.art, width:2400, height:960, dimensao_real:'24 × 9,5 cm', formato:'webp' },
    origem_cadastro:'site_publico_personalizador_v2', tipo_produto:'caneca_personalizada', geracao_status:'concluido', geracao_versao:BUILD,
    cliente_nome:result.customerName, cliente_whatsapp:result.whatsapp,
    personalizacao_cliente:{ nome:result.customerName, whatsapp:result.whatsapp, whatsapp_local:result.whatsappLocal, nome_destaque:displayName, frase, modelo_key:STATE.key, modelo_nome:STATE.product?.nome || '', campos:Object.fromEntries(result.values.map(item => [item.id,item.value])), resultado_url:publicUrl, codigo_criacao:id },
    configuracao_arte:{ modo:'template_dinamico_site_v2', modelo_key:STATE.key, width:2400, height:960 },
    criado_em:now, updated_at:now, last_update:Date.now()
  };
}

function materializeProduct(product, urls) {
  const replace = value => value === PH.art ? urls.art : value === PH.m1 ? urls.m1 : value === PH.m2 ? urls.m2 : value === PH.m3 ? urls.m3 : value;
  product.imagens = product.imagens.map(replace); product.imagens_site = product.imagens_site.map(replace);
  product.url_imagem = product.imagem = product.imagem_url = product.mockup_1 = urls.m1;
  product.mockup_2 = urls.m2; product.mockup_3 = urls.m3; product.arte_personalizacao = product.arte_horizontal = urls.art; product.arte_impressao.url = urls.art;
  return product;
}

function mockPrompt(mode) {
  const side = mode === 1 ? 'primeira metade / lado esquerdo' : mode === 2 ? 'segunda metade / lado direito' : 'centro';
  return `Use a arte como arte-mestre imutável. Mostre o ${side} aplicado em uma caneca branca de porcelana 350ml, foto quadrada ultra realista, fundo claro. Não redesenhe, não reescreva nem altere os textos.`;
}

async function saveCreation(id, result, urls, publicUrl, makeSaved) {
  const base = productTemplate(id, result, publicUrl);
  const product = materializeProduct(base, urls);
  if (!makeSaved) await put(`${N.products}/${encodeURIComponent(id)}`, product);
  else await put(`${N.products}/${encodeURIComponent(id)}`, {
    situacao:'I', status:'I', ativo:false, visivel:false, modelo_caneca:true, modelo_publico:false, personalizacao_publica:false,
    cliente_nome:result.customerName, cliente_whatsapp:result.whatsapp, personalizacao_cliente:product.personalizacao_cliente,
    mockup_1:urls.m1, mockup_2:urls.m2, mockup_3:urls.m3, url_imagem:urls.m1, imagem:urls.m1, imagem_url:urls.m1,
    imagens:[urls.m1,urls.m2,urls.m3], imagens_site:[urls.m1,urls.m2,urls.m3], arte_horizontal:urls.art, arte_personalizacao:urls.art,
    origem_cadastro:'site_publico_personalizador_v2', updated_at:new Date().toISOString(), last_update:Date.now()
  }, 'PATCH');
  const displayName = primaryText(result, ['nome','nome_1','nome_na_caneca','nome_destaque']);
  const phrase = primaryText(result, ['frase','mensagem','texto']);
  const now = new Date().toISOString();
  const publicRecord = { id, nome_publico:displayName ? `Caneca personalizada ${displayName}` : 'Caneca personalizada', nome_destaque:displayName, frase, modelo_nome:STATE.product?.nome || '', modelo_key:STATE.key, arte_horizontal:urls.art, mockup_1:urls.m1, mockup_2:urls.m2, mockup_3:urls.m3, produto_key:id, criado_em:now, expira_em:new Date(Date.now()+7*86400000).toISOString() };
  const privateRecord = { ...publicRecord, cliente_nome:result.customerName, cliente_whatsapp:result.whatsapp, campos:Object.fromEntries(result.values.map(item => [item.id,item.value])), status:'criacao_gerada_adicionada_ao_carrinho', resultado_url:publicUrl, origem:BUILD };
  const model = { id, product_key:id, nome:product.nome, imagem:urls.m1, mockup_1:urls.m1, mockup_2:urls.m2, mockup_3:urls.m3, arte_horizontal:urls.art, frase, nome_destaque:displayName, modelo_publico:false, personalizacao_publica:false, origem:BUILD, atualizado_em:now };
  await Promise.all([
    put(`${N.public}/${encodeURIComponent(id)}`, publicRecord),
    put(`${N.private}/${encodeURIComponent(id)}`, privateRecord),
    put(`${N.models}/${encodeURIComponent(id)}`, model)
  ]);
  return product;
}

function normalizedCartProduct(product, urls) {
  return {
    id:String(product.id), firebaseKey:String(product.id), codigo:String(product.codigo || product.id), name:String(product.nome || 'Caneca personalizada'),
    slug:String(product.id), price:Number(product.preco || salePrice()), oldPrice:Number(product.preco || salePrice()), stock:1, situacao:'A',
    categoria:String(product.categoria || 'Caneca de Porcelana'), subcategoria:String(product.subcategoria || 'Personalizadas'), subsubcategoria:'', marca:'Dona Antônia', embalagem:'350ml',
    descricao:String(product.descricao || ''), gtin:'', ean:'', gondola:'', prateleira:'', localizacao:'', preco_oferta:0, validade_oferta:'', validade:'',
    images:[urls.m1,urls.m2,urls.m3], img:urls.m1, url_imagem:urls.m1,
    raw:{ ...product, situacao:'I', ativo:false, checkout_personalizado:true }
  };
}

function addToCart(product, urls, result) {
  const localProduct = normalizedCartProduct(product, urls);
  const state = window.__DA_CATALOG_STATE__;
  if (state?.productMap instanceof Map) {
    state.productMap.set(localProduct.id, localProduct);
    if (!Array.isArray(state.products)) state.products = [];
    if (!state.products.some(item => String(item.id) === localProduct.id)) state.products.push(localProduct);
    state.cart ||= {}; state.cart[localProduct.id] = 1;
    state.cartOrder ||= []; if (!state.cartOrder.includes(localProduct.id)) state.cartOrder.push(localProduct.id);
  }
  const saved = readLocal(CART_KEY, {}) || {};
  const cartMap = state?.cart ? { ...state.cart } : { ...(saved.cart || {}), [localProduct.id]:1 };
  const cartOrder = state?.cartOrder ? [...state.cartOrder] : [...new Set([...(saved.cartOrder || []), localProduct.id])];
  writeLocal(CART_KEY, { savedAt:Date.now(), appVersion:CONFIG.APP_VERSION, cart:cartMap, cartOrder, basketCustomizations:state?.basketCustomizations || saved.basketCustomizations || {}, basketDrafts:state?.basketDrafts || saved.basketDrafts || {} });
  const client = readLocal(CHECKOUT_KEY, {}) || {};
  writeLocal(CHECKOUT_KEY, { ...client, name:result.customerName, phone:result.whatsappLocal || result.whatsapp });
  return Boolean(state?.productMap instanceof Map);
}

function renderResult(id, urls, result, cartAdded) {
  const box = document.querySelector('#mugPublicResult');
  if (!box) return;
  const publicUrl = resultUrl(id);
  const phone = displayWhatsapp(result.whatsapp);
  box.hidden = false;
  box.innerHTML = `<h3>Sua caneca ficou pronta ✨</h3><p>Confira abaixo a arte horizontal e os três mockups gerados.</p><div class="mug-result-art"><span>Arte horizontal para impressão</span><img src="${escapeHtml(urls.art)}" alt="Arte horizontal da caneca personalizada"></div><div class="mug-result-mockups"><span>3 prévias da sua caneca</span><div class="mug-result-grid"><img src="${escapeHtml(urls.m1)}" alt="Mockup 1"><img src="${escapeHtml(urls.m2)}" alt="Mockup 2"><img src="${escapeHtml(urls.m3)}" alt="Mockup 3"></div></div><div class="mug-public-saved">Sua criação foi salva e será identificada pelo WhatsApp <strong>${escapeHtml(phone)}</strong>.${cartAdded ? ' Ela já foi adicionada à sua compra.' : ''}</div><div class="mug-public-result-actions"><button type="button" id="mugPublicOpenCart">Ver minha compra / checkout</button><a href="${escapeHtml(publicUrl)}">Abrir página com as 4 imagens</a><button type="button" class="secondary" id="mugPublicAnother">Criar outra</button></div>`;
  box.scrollIntoView({ behavior:'smooth', block:'center' });
}

function resetAfterResult() {
  STATE.id = '';
  const result = document.querySelector('#mugPublicResult'); if (result) { result.hidden = true; result.innerHTML = ''; }
  const progressBox = document.querySelector('#mugPublicProgress'); if (progressBox) progressBox.hidden = true;
  const button = document.querySelector('#mugPublicGenerate'); if (button) { button.hidden = false; button.disabled = false; }
  setError(''); updateLimitUi();
}

async function generate() {
  if (STATE.busy) return;
  setError('');
  let result;
  try { result = collect({ validate:true }); } catch (error) { setError(error?.message || String(error)); return; }
  saveCustomerDraft();
  STATE.id ||= requestId();
  const id = STATE.id;
  const publicUrl = resultUrl(id);
  STATE.busy = true;
  updateLimitUi();
  const button = document.querySelector('#mugPublicGenerate'); if (button) button.disabled = true;
  try {
    progress(5, 'Preparando sua personalização…');
    const photos = [];
    for (const photo of result.files.slice(0,4)) photos.push({ id:photo.id, image_base64:await normalizePhoto(photo.file) });
    progress(16, 'Enviando modelo e dados…');
    const generated = await callMake({
      action:'personalize_mug_model', mode:'personalize_model', request_id:id, model_id:STATE.key,
      customer_name:result.customerName, customer_whatsapp:result.whatsapp,
      fields_json:JSON.stringify(Object.fromEntries(result.values.map(item => [item.id,item.value]))),
      images_json:JSON.stringify(photos), quality:'high', origin:'site_publico'
    });
    const generatedUrl = text(generated.art_source_url || generated.art_url || generated.result_url);
    if (!isImageSource(generatedUrl)) throw new Error('A automação não devolveu a nova arte.');
    progress(40, 'Preparando a arte final…');
    const master = await cropMaster(generatedUrl);
    const [left,right,center] = await Promise.all([cropReference(master,1),cropReference(master,2),cropReference(master,3)]);
    const template = JSON.stringify(productTemplate(id, result, publicUrl));
    progress(56, 'Criando os três mockups…');
    const final = await callMake({
      action:'finalize_mug_product', request_id:id, image_base64:master,
      mockup_left_base64:left, mockup_right_base64:right, mockup_center_base64:center,
      product_name:'Caneca de Porcelana Personalizada - 350ml',
      prompt_mockup_1:mockPrompt(1), prompt_mockup_2:mockPrompt(2), prompt_mockup_3:mockPrompt(3), quality:'high',
      firebase_url:FB, products_node:N.products, firebase_template_json:template
    });
    const urls = {
      art:text(final.art_url || final.arte_horizontal_url || final.arte_url),
      m1:text(final.mockup_1_url), m2:text(final.mockup_2_url), m3:text(final.mockup_3_url)
    };
    if (!isHttpUrl(urls.art) || !isHttpUrl(urls.m1) || !isHttpUrl(urls.m2) || !isHttpUrl(urls.m3)) throw new Error('A automação ainda não publicou as quatro imagens finais.');
    progress(84, 'Salvando sua criação…');
    const product = await saveCreation(id, result, urls, publicUrl, final.product_saved === true);
    const cartAdded = addToCart(product, urls, result);
    registerCreation(result.whatsapp, id);
    progress(100, 'Pronta!');
    if (button) button.hidden = true;
    renderResult(id, urls, result, cartAdded);
    updateLimitUi();
  } catch (error) {
    console.error('[Canecas públicas V3]', error);
    setError(error?.name === 'AbortError' ? 'A geração demorou mais do que o esperado. Tente novamente.' : (error?.message || String(error)));
    const progressBox = document.querySelector('#mugPublicProgress'); if (progressBox) progressBox.hidden = true;
  } finally {
    STATE.busy = false;
    updateLimitUi();
  }
}

async function syncRoute() {
  const key = routeKey();
  if (!key) { document.querySelector('#mug-public-personalizer')?.remove(); STATE.key=''; STATE.product=null; STATE.config=null; return; }
  if (STATE.key === key && STATE.product) {
    if (!document.querySelector('#mug-public-personalizer')) renderPanel(STATE.product, STATE.config || {});
    return;
  }
  STATE.key = key; STATE.product = null; STATE.config = null; STATE.id = '';
  try {
    const product = await get(`${N.products}/${encodeURIComponent(key)}`);
    if (!product || typeof product !== 'object') return;
    const config = product.personalizacao_config_publica || {};
    const enabled = product.modelo_publico === true && product.personalizacao_publica === true && config.ativo !== false;
    if (!enabled) { document.querySelector('#mug-public-personalizer')?.remove(); return; }
    STATE.product = product; STATE.config = config;
    let attempts = 0;
    const mount = () => {
      if (routeKey() !== key) return;
      if (renderPanel(product, config)) return;
      if (++attempts < 30) setTimeout(mount, 100);
    };
    mount();
  } catch (error) { console.error('[Canecas públicas V3] Falha ao carregar modelo:', error); }
}

let syncTimer;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(syncRoute, 60); }
window.addEventListener('hashchange', scheduleSync);
window.addEventListener('da:catalog-ready', scheduleSync);
new MutationObserver(() => {
  if (routeKey() && STATE.product && !document.querySelector('#mug-public-personalizer') && document.querySelector('.product-detail')) scheduleSync();
}).observe(document.documentElement, { childList:true, subtree:true });

scheduleSync();
console.info(`Canecas públicas · ${BUILD}`);