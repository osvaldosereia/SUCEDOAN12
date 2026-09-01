import { FIREBASE_BASE, text, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260831-admin-canecas-product-content-manager-v1.1';
const CONFIG_PATH = 'canecas/configuracoes/conteudo_produto/personalizavel_padrao';
const CONTENT_QUEUE = 'canecas/integracoes/conteudo_produto/fila';
const DEFAULT_TEMPLATE = Object.freeze({
  id: 'personalizavel_padrao',
  version: 0,
  mode: 'visual',
  enabled: true,
  title: 'Personalize esta caneca',
  text: 'Deixe este modelo com a sua cara. Personalize antes de comprar.',
  button_text: 'PERSONALIZAR ESTA CANECA',
  benefits: '✓ Prévia antes da compra',
  note: '',
  align: 'center',
  background: '#ffffff',
  border_color: '#e8e8e3',
  text_color: '#252821',
  button_background: '#111111',
  button_color: '#ffffff',
  border_radius: 14,
  button_radius: 10,
  padding: 16,
  button_full_mobile: true,
  personalizer_base: 'https://donaantonia.com.br/loja-integrada/personalizar/',
  return_url: 'https://canecafacil.com.br/',
  open_new_tab: false,
  custom_html: '',
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
const keyOf = product => text(product?.__key || product?.firebaseKey || product?.id);
const liOf = product => product?.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
const isPersonalizable = product => product?.personalizavel === true
  || product?.loja_integrada_personalizavel === true
  || product?.canecafacil_personalizavel === true
  || product?.personalizacao_publica === true;
const isRegistered = product => Boolean(text(liOf(product).produto_id));
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value) : fallback;
const queueKey = key => {
  const bytes = new TextEncoder().encode(text(key));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

function toast(message, error = false) {
  const element = $('#toast');
  if (!element) return;
  element.textContent = message;
  element.className = `toast${error ? ' error' : ''}`;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, error ? 7000 : 3600);
}

async function request(path, { method = 'GET', body } = {}) {
  const url = `${FIREBASE_BASE}/${path}.json${method === 'GET' ? `?_=${Date.now()}` : ''}`;
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json().catch(() => null);
}
const fbGet = path => request(path);
const fbPut = (path, body) => request(path, { method: 'PUT', body });
const fbPatch = (path, body) => request(path, { method: 'PATCH', body });

function normalizeTemplate(raw = {}) {
  const template = { ...DEFAULT_TEMPLATE, ...(raw || {}) };
  return {
    ...template,
    id: 'personalizavel_padrao',
    version: Math.max(0, Number(template.version || 0)),
    mode: template.mode === 'html' ? 'html' : 'visual',
    enabled: template.enabled !== false,
    title: text(template.title).slice(0, 120),
    text: text(template.text).slice(0, 500),
    button_text: text(template.button_text || DEFAULT_TEMPLATE.button_text).slice(0, 100),
    benefits: text(template.benefits).slice(0, 500),
    note: text(template.note).slice(0, 500),
    align: ['left', 'center', 'right'].includes(template.align) ? template.align : 'center',
    background: validColor(template.background, DEFAULT_TEMPLATE.background),
    border_color: validColor(template.border_color, DEFAULT_TEMPLATE.border_color),
    text_color: validColor(template.text_color, DEFAULT_TEMPLATE.text_color),
    button_background: validColor(template.button_background, DEFAULT_TEMPLATE.button_background),
    button_color: validColor(template.button_color, DEFAULT_TEMPLATE.button_color),
    border_radius: clamp(template.border_radius, 0, 32, 14),
    button_radius: clamp(template.button_radius, 0, 32, 10),
    padding: clamp(template.padding, 8, 32, 16),
    button_full_mobile: template.button_full_mobile !== false,
    personalizer_base: /^https:\/\//i.test(text(template.personalizer_base)) ? text(template.personalizer_base) : DEFAULT_TEMPLATE.personalizer_base,
    return_url: /^https:\/\//i.test(text(template.return_url)) ? text(template.return_url) : DEFAULT_TEMPLATE.return_url,
    open_new_tab: template.open_new_tab === true,
    custom_html: String(template.custom_html || '').slice(0, 15000),
  };
}

function sampleVars(product = {}, template = DEFAULT_TEMPLATE) {
  const key = keyOf(product) || 'modelo-exemplo';
  const base = template.personalizer_base || DEFAULT_TEMPLATE.personalizer_base;
  const returnUrl = template.return_url || DEFAULT_TEMPLATE.return_url;
  const personalizerUrl = "javascript:(function(){try{var u=new URL(location.href);u.searchParams.set('cf_personalizador','teste');u.hash='cfInlinePersonalizer';history.replaceState(history.state,'',u.href);var p=document.getElementById('cfInlinePersonalizer');if(p){p.scrollIntoView({behavior:'smooth',block:'center'});return;}if(window.__CF_INLINE_CLICK_LOADING__)return;window.__CF_INLINE_CLICK_LOADING__=1;var s=document.createElement('script');s.src='https://donaantonia.com.br/loja-integrada/personalizador-inline-v2.js?v=20260901-5';s.async=true;s.onload=function(){window.__CF_INLINE_CLICK_LOADING__=0};s.onerror=function(){window.__CF_INLINE_CLICK_LOADING__=0;alert('Não foi possível abrir a personalização. Atualize a página e tente novamente.')};document.head.appendChild(s)}catch(e){console.error(e);alert('Não foi possível abrir a personalização.')}})();";
  return {
    '{{nome}}': text(product.nome || 'Caneca Personalizável'),
    '{{sku}}': text(product.codigo || product.sku || 'CANP-EXEMPLO'),
    '{{modelo_id}}': key,
    '{{preco}}': Number(product.preco || 19.9).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    '{{url_personalizador}}': personalizerUrl,
    '{{titulo}}': template.title,
    '{{texto}}': template.text,
    '{{botao}}': template.button_text,
    '{{beneficios}}': template.benefits,
    '{{aviso}}': template.note,
  };
}

function replaceVars(value, vars, { escapeValues = true } = {}) {
  let output = String(value || '');
  for (const [token, raw] of Object.entries(vars)) {
    output = output.split(token).join(escapeValues ? esc(raw) : String(raw));
  }
  return output;
}

function sanitizePreviewHtml(value) {
  return String(value || '')
    .replace(/<\/?(?:script|iframe|object|embed|form|input|textarea|select|meta|link)[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '');
}

function visualHtml(template, vars) {
  const normalized = normalizeTemplate(template);
  if (!normalized.enabled) return '<div style="padding:14px;color:#777;text-align:center">Bloco desativado</div>';
  const benefits = normalized.benefits
    ? `<div style="margin-top:10px;font-size:12px;line-height:1.45;opacity:.78">${replaceVars(normalized.benefits, vars).replace(/\n/g, '<br>')}</div>`
    : '';
  const note = normalized.note
    ? `<div style="margin-top:9px;font-size:11px;line-height:1.45;opacity:.68">${replaceVars(normalized.note, vars).replace(/\n/g, '<br>')}</div>`
    : '';
  const copy = normalized.text
    ? `<div style="margin:0 0 12px;font-size:13px;line-height:1.45">${replaceVars(normalized.text, vars).replace(/\n/g, '<br>')}</div>`
    : '';
  const target = normalized.open_new_tab ? ' target="_blank" rel="noopener"' : '';
  return `<div class="cf-personalizer-box" data-cf-template-version="${normalized.version || 0}" style="margin:16px 0;padding:${normalized.padding}px;border:1px solid ${normalized.border_color};border-radius:${normalized.border_radius}px;background:${normalized.background};color:${normalized.text_color};text-align:${normalized.align};box-sizing:border-box"><strong style="display:block;margin:0 0 7px;font-size:15px;line-height:1.3">${replaceVars(normalized.title, vars)}</strong>${copy}<a class="cf-personalize-link" href="${esc(vars['{{url_personalizador}}'])}"${target} style="display:inline-flex;align-items:center;justify-content:center;min-height:46px;width:${normalized.button_full_mobile ? '100%' : 'auto'};max-width:340px;box-sizing:border-box;background:${normalized.button_background};color:${normalized.button_color};text-decoration:none;padding:12px 18px;border-radius:${normalized.button_radius}px;font-weight:800;font-size:13px;line-height:1.2;text-align:center">${replaceVars(normalized.button_text, vars)}</a>${benefits}${note}</div>`;
}

function compiledHtml(template, product = {}) {
  const normalized = normalizeTemplate(template);
  const vars = sampleVars(product, normalized);
  if (normalized.mode !== 'html' || !text(normalized.custom_html)) return visualHtml(normalized, vars);
  let custom = sanitizePreviewHtml(replaceVars(normalized.custom_html, vars));
  if (!/cf-personalizer-box/i.test(custom)) {
    custom = `<div class="cf-personalizer-box" data-cf-template-version="${normalized.version || 0}">${custom}</div>`;
  }
  return custom;
}

let model = {
  draft: normalizeTemplate(DEFAULT_TEMPLATE),
  published: null,
  history: {},
  products: [],
  sampleKey: '',
  preview: 'mobile',
};

function installStyles() {
  if ($('#cfContentManagerStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfContentManagerStyles';
  style.textContent = `
    #cfProductContentPanel{margin-top:14px}.cf-content-summary{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.cf-content-chip{padding:7px 9px;border-radius:10px;background:#f4f6f2;font-size:11px;font-weight:800}.cf-content-chip b{font-size:13px}
    #cfContentEditor{display:grid;gap:14px;margin-top:14px}.cf-content-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.9fr);gap:16px}.cf-content-form{display:grid;gap:12px}.cf-content-section{padding:13px;border:1px solid #e2e5de;border-radius:13px;background:#fff}.cf-content-section h3{margin:0 0 10px;font-size:14px}.cf-content-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cf-content-field{display:grid;gap:5px}.cf-content-field.full{grid-column:1/-1}.cf-content-field span{font-size:11px;font-weight:800}.cf-content-field small{font-size:10px;color:#737971}.cf-content-field input,.cf-content-field textarea,.cf-content-field select{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #d9ddd5;border-radius:9px;background:#fff;font:inherit}.cf-content-field textarea{min-height:76px;resize:vertical}.cf-content-field textarea.code{min-height:210px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}
    .cf-content-toggle{display:flex!important;align-items:center;gap:7px;padding:10px 11px;border:1px solid #e2e5de;border-radius:10px;background:#fafbf9}.cf-content-toggle input{width:auto!important;margin:0}
    .cf-preview-wrap{position:sticky;top:84px;align-self:start;display:grid;gap:9px}.cf-preview-toolbar{display:flex;gap:7px;justify-content:space-between;align-items:center;flex-wrap:wrap}.cf-preview-device{display:flex;gap:5px}.cf-preview-device button.active{background:#171918;color:#fff}.cf-preview-stage{padding:16px;border-radius:16px;background:#eef0eb;overflow:auto}.cf-preview-phone{margin:0 auto;background:#fff;border:1px solid #dadfd6;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08);transition:width .15s ease;overflow:hidden}.cf-preview-phone.mobile{width:min(100%,390px)}.cf-preview-phone.desktop{width:100%;max-width:760px}.cf-preview-product{padding:18px}.cf-preview-product h4{margin:0 0 10px;font-size:16px}.cf-preview-product p{font-size:13px;line-height:1.45;margin:0 0 10px}.cf-content-actions{display:flex;gap:8px;flex-wrap:wrap}.cf-content-status{padding:10px 12px;border-radius:11px;background:#f6f7f4;font-size:11px;line-height:1.5}.cf-content-status.good{background:#edf8f0;color:#176b36}.cf-content-status.warn{background:#fff8e8;color:#7f5a14}.cf-content-vars{font-size:10px;line-height:1.7;color:#646b63}.cf-content-mode-html[hidden],.cf-content-mode-visual[hidden]{display:none!important}
    @media(max-width:980px){.cf-content-layout{grid-template-columns:1fr}.cf-preview-wrap{position:static}.cf-preview-phone.desktop{width:100%}}
    @media(max-width:700px){.cf-content-grid{grid-template-columns:1fr}.cf-content-layout{gap:10px}.cf-content-section{padding:11px}.cf-content-actions{display:grid;grid-template-columns:1fr}.cf-content-actions button{width:100%}.cf-preview-stage{padding:9px}}
  `;
  document.head.appendChild(style);
}

function counts() {
  const personal = model.products.filter(isPersonalizable);
  const registered = personal.filter(isRegistered);
  const version = Number(model.published?.version || 0);
  const updated = registered.filter(product => Number(liOf(product).content_template_version || 0) === version && version > 0);
  return {
    personal: personal.length,
    registered: registered.length,
    updated: updated.length,
    pending: Math.max(0, registered.length - updated.length),
  };
}

function summaryHtml() {
  const count = counts();
  const version = Number(model.published?.version || 0);
  return `<div class="cf-content-summary"><span class="cf-content-chip"><b>${count.personal}</b> personalizáveis</span><span class="cf-content-chip"><b>${count.registered}</b> cadastradas</span><span class="cf-content-chip"><b>${count.updated}</b> na versão atual</span><span class="cf-content-chip"><b>${count.pending}</b> aguardando atualização</span><span class="cf-content-chip">modelo publicado: <b>${version ? `v${version}` : 'nenhum'}</b></span></div>`;
}

function templateFromForm() {
  const value = id => $(`#${id}`)?.value;
  return normalizeTemplate({
    ...model.draft,
    mode: value('cfContentMode'),
    enabled: $('#cfContentEnabled')?.checked !== false,
    title: value('cfContentTitle'),
    text: value('cfContentText'),
    button_text: value('cfContentButtonText'),
    benefits: value('cfContentBenefits'),
    note: value('cfContentNote'),
    align: value('cfContentAlign'),
    background: value('cfContentBg'),
    border_color: value('cfContentBorder'),
    text_color: value('cfContentTextColor'),
    button_background: value('cfContentButtonBg'),
    button_color: value('cfContentButtonColor'),
    border_radius: value('cfContentRadius'),
    button_radius: value('cfContentButtonRadius'),
    padding: value('cfContentPadding'),
    button_full_mobile: $('#cfContentButtonFull')?.checked !== false,
    personalizer_base: value('cfContentBase'),
    return_url: value('cfContentReturn'),
    open_new_tab: $('#cfContentNewTab')?.checked === true,
    custom_html: value('cfContentHtml'),
  });
}

function sampleProduct() {
  return model.products.find(product => keyOf(product) === model.sampleKey)
    || model.products.find(isPersonalizable)
    || {};
}

function updatePreview() {
  const template = templateFromForm();
  model.draft = template;
  const frame = $('#cfContentPreview');
  if (!frame) return;
  frame.className = `cf-preview-phone ${model.preview}`;
  const product = sampleProduct();
  frame.innerHTML = `<div class="cf-preview-product"><h4>Descrição</h4><p>${esc(text(product.descricao || product.descricao_completa || 'Caneca de porcelana branca personalizada.'))}</p>${compiledHtml(template, product)}</div>`;
  $$('.cf-preview-device button').forEach(button => button.classList.toggle('active', button.dataset.device === model.preview));
}

function toggleMode() {
  const mode = $('#cfContentMode')?.value || 'visual';
  $$('.cf-content-mode-visual').forEach(element => { element.hidden = mode === 'html'; });
  $$('.cf-content-mode-html').forEach(element => { element.hidden = mode !== 'html'; });
  updatePreview();
}

function fillForm(template) {
  const normalized = normalizeTemplate(template);
  model.draft = normalized;
  const set = (id, value) => {
    const element = $(`#${id}`);
    if (element) element.value = value ?? '';
  };
  set('cfContentMode', normalized.mode);
  set('cfContentTitle', normalized.title);
  set('cfContentText', normalized.text);
  set('cfContentButtonText', normalized.button_text);
  set('cfContentBenefits', normalized.benefits);
  set('cfContentNote', normalized.note);
  set('cfContentAlign', normalized.align);
  set('cfContentBg', normalized.background);
  set('cfContentBorder', normalized.border_color);
  set('cfContentTextColor', normalized.text_color);
  set('cfContentButtonBg', normalized.button_background);
  set('cfContentButtonColor', normalized.button_color);
  set('cfContentRadius', normalized.border_radius);
  set('cfContentButtonRadius', normalized.button_radius);
  set('cfContentPadding', normalized.padding);
  set('cfContentBase', normalized.personalizer_base);
  set('cfContentReturn', normalized.return_url);
  set('cfContentHtml', normalized.custom_html);
  if ($('#cfContentEnabled')) $('#cfContentEnabled').checked = normalized.enabled;
  if ($('#cfContentButtonFull')) $('#cfContentButtonFull').checked = normalized.button_full_mobile;
  if ($('#cfContentNewTab')) $('#cfContentNewTab').checked = normalized.open_new_tab;
  toggleMode();
}

function renderEditor() {
  const host = $('#cfContentEditor');
  if (!host) return;
  const personal = model.products.filter(isPersonalizable);
  const history = Object.values(model.history || {})
    .filter(Boolean)
    .sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
  const productOptions = personal.length
    ? personal.map(product => `<option value="${esc(keyOf(product))}">${esc(product.nome || product.codigo || keyOf(product))}${isRegistered(product) ? '' : ' · ainda não cadastrada'}</option>`).join('')
    : '<option value="">Nenhuma caneca personalizável encontrada</option>';

  host.innerHTML = `<div class="cf-content-layout"><div class="cf-content-form">
    <section class="cf-content-section"><h3>Modelo</h3><div class="cf-content-grid">
      <label class="cf-content-field"><span>Modo</span><select id="cfContentMode"><option value="visual">Editor visual</option><option value="html">HTML avançado</option></select></label>
      <label class="cf-content-field cf-content-toggle"><input type="checkbox" id="cfContentEnabled"><span>Exibir este bloco nas canecas personalizáveis</span></label>
    </div></section>
    <section class="cf-content-section cf-content-mode-visual"><h3>Conteúdo</h3><div class="cf-content-grid">
      <label class="cf-content-field full"><span>Título</span><input id="cfContentTitle" maxlength="120"></label>
      <label class="cf-content-field full"><span>Texto</span><textarea id="cfContentText"></textarea></label>
      <label class="cf-content-field full"><span>Texto do botão</span><input id="cfContentButtonText" maxlength="100"></label>
      <label class="cf-content-field full"><span>Benefícios</span><textarea id="cfContentBenefits" placeholder="Um por linha"></textarea></label>
      <label class="cf-content-field full"><span>Aviso inferior</span><textarea id="cfContentNote"></textarea></label>
    </div></section>
    <section class="cf-content-section cf-content-mode-visual"><h3>Aparência</h3><div class="cf-content-grid">
      <label class="cf-content-field"><span>Alinhamento</span><select id="cfContentAlign"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>
      <label class="cf-content-field"><span>Fundo</span><input id="cfContentBg" type="color"></label>
      <label class="cf-content-field"><span>Borda</span><input id="cfContentBorder" type="color"></label>
      <label class="cf-content-field"><span>Texto</span><input id="cfContentTextColor" type="color"></label>
      <label class="cf-content-field"><span>Fundo do botão</span><input id="cfContentButtonBg" type="color"></label>
      <label class="cf-content-field"><span>Texto do botão</span><input id="cfContentButtonColor" type="color"></label>
      <label class="cf-content-field"><span>Arredondamento do bloco</span><input id="cfContentRadius" type="number" min="0" max="32"></label>
      <label class="cf-content-field"><span>Arredondamento do botão</span><input id="cfContentButtonRadius" type="number" min="0" max="32"></label>
      <label class="cf-content-field"><span>Espaçamento interno</span><input id="cfContentPadding" type="number" min="8" max="32"></label>
      <label class="cf-content-field cf-content-toggle"><input type="checkbox" id="cfContentButtonFull"><span>Botão largo no mobile</span></label>
    </div></section>
    <section class="cf-content-section"><h3>Comportamento</h3><div class="cf-content-grid">
      <label class="cf-content-field full"><span>URL base do personalizador</span><input id="cfContentBase"></label>
      <label class="cf-content-field full"><span>URL de retorno</span><input id="cfContentReturn"></label>
      <label class="cf-content-field full cf-content-toggle"><input type="checkbox" id="cfContentNewTab"><span>Abrir em nova aba</span></label>
    </div></section>
    <section class="cf-content-section cf-content-mode-html" hidden><h3>HTML avançado</h3><label class="cf-content-field full"><span>Código</span><textarea class="code" id="cfContentHtml" spellcheck="false"></textarea><small>Scripts, iframes, formulários e eventos JavaScript são removidos por segurança.</small></label><div class="cf-content-vars">Variáveis: {{nome}}, {{sku}}, {{modelo_id}}, {{preco}}, {{url_personalizador}}, {{titulo}}, {{texto}}, {{botao}}, {{beneficios}}, {{aviso}}</div></section>
    <section class="cf-content-section"><h3>Publicação segura</h3><div class="cf-content-grid">
      <label class="cf-content-field full"><span>Caneca para teste</span><select id="cfContentTestProduct">${productOptions}</select></label>
      <label class="cf-content-field"><span>Histórico</span><select id="cfContentHistory"><option value="">Escolha uma versão</option>${history.map(item => `<option value="${Number(item.version || 0)}">v${Number(item.version || 0)} · ${esc(text(item.published_at || item.updated_at).slice(0, 16).replace('T', ' '))}</option>`).join('')}</select></label>
      <div class="cf-content-field"><span>&nbsp;</span><button type="button" class="secondary" id="cfContentLoadHistory">Carregar versão no rascunho</button></div>
    </div><div class="cf-content-actions" style="margin-top:12px"><button type="button" class="secondary" id="cfContentSaveDraft">Salvar rascunho</button><button type="button" class="secondary" id="cfContentTestOne">Testar em 1 caneca</button><button type="button" class="primary" id="cfContentPublish">Publicar em todas as cadastradas</button></div><div id="cfContentStatus" class="cf-content-status" style="margin-top:10px">Edite, visualize e salve como rascunho. Publicar cria uma nova versão e o GitHub atualiza as canecas gradualmente.</div></section>
  </div><aside class="cf-preview-wrap"><div class="cf-preview-toolbar"><div><strong>Pré-visualização</strong><small style="display:block;color:#737971">Referência mobile baseada na página real enviada.</small></div><div class="cf-preview-device"><button class="secondary active" type="button" data-device="mobile">Mobile</button><button class="secondary" type="button" data-device="desktop">Desktop</button></div></div><div class="cf-preview-stage"><div id="cfContentPreview" class="cf-preview-phone mobile"></div></div></aside></div>`;

  const sampleSelect = $('#cfContentTestProduct');
  if (sampleSelect) {
    model.sampleKey = model.sampleKey || sampleSelect.value;
    if ([...sampleSelect.options].some(option => option.value === model.sampleKey)) sampleSelect.value = model.sampleKey;
    sampleSelect.onchange = () => {
      model.sampleKey = sampleSelect.value;
      updatePreview();
    };
  }

  fillForm(model.draft);
  $('#cfContentMode').onchange = toggleMode;
  $$('#cfContentEditor input,#cfContentEditor textarea,#cfContentEditor select').forEach(element => {
    if (!['cfContentHistory', 'cfContentTestProduct'].includes(element.id)) element.addEventListener('input', updatePreview);
  });
  $$('.cf-preview-device button').forEach(button => {
    button.onclick = () => {
      model.preview = button.dataset.device;
      updatePreview();
    };
  });
  $('#cfContentSaveDraft').onclick = () => void saveDraft();
  $('#cfContentTestOne').onclick = () => void testOne();
  $('#cfContentPublish').onclick = () => void publishAll();
  $('#cfContentLoadHistory').onclick = () => loadHistory();
}

async function saveDraft({ quiet = false } = {}) {
  const draft = {
    ...templateFromForm(),
    version: Number(model.published?.version || 0),
    draft_revision: Date.now(),
    updated_at: nowIso(),
    updated_by: 'admin_canecas',
  };
  await fbPut(`${CONFIG_PATH}/draft`, draft);
  model.draft = draft;
  if (!quiet) toast('Rascunho salvo. A Loja Integrada ainda não foi alterada.');
  return draft;
}

async function testOne() {
  try {
    const key = text($('#cfContentTestProduct')?.value);
    const product = model.products.find(item => keyOf(item) === key);
    if (!product) throw new Error('Escolha uma caneca para o teste.');
    if (!isRegistered(product)) throw new Error('Essa caneca ainda não está cadastrada na Loja Integrada. Escolha uma já cadastrada.');
    const draft = await saveDraft({ quiet: true });
    const at = nowIso();
    await fbPut(`${CONTENT_QUEUE}/${queueKey(key)}`, {
      product_key: key,
      produto_id: text(liOf(product).produto_id),
      source: 'draft',
      base_published_version: Number(model.published?.version || 0),
      draft_revision: draft.draft_revision,
      status: 'pendente',
      solicitado_em: at,
      atualizado_em: at,
      tentativas: 0,
      solicitado_por: 'admin_content_test',
    });
    const status = $('#cfContentStatus');
    if (status) {
      status.className = 'cf-content-status warn';
      status.innerHTML = `<b>Teste enviado.</b> O GitHub aplicará este rascunho somente em <b>${esc(product.nome || key)}</b>. Aguarde alguns minutos e confira a página real antes de publicar em massa.`;
    }
    toast('Teste de conteúdo enviado ao GitHub.');
  } catch (error) {
    toast(error.message || error, true);
  }
}

async function publishAll() {
  try {
    const count = counts();
    if (!count.registered) throw new Error('Nenhuma caneca personalizável cadastrada foi encontrada.');
    if (!confirm(`Publicar este modelo em ${count.registered} caneca(s) já cadastrada(s)? O GitHub fará a atualização gradualmente e com confirmação.`)) return;
    const draft = await saveDraft({ quiet: true });
    const nextVersion = Number(model.published?.version || 0) + 1;
    const at = nowIso();
    const published = {
      ...draft,
      version: nextVersion,
      published_at: at,
      updated_at: at,
      published_by: 'admin_canecas',
    };
    await Promise.all([
      fbPut(`${CONFIG_PATH}/published`, published),
      fbPut(`${CONFIG_PATH}/history/${nextVersion}`, published),
      fbPatch(`${CONFIG_PATH}/meta`, {
        current_version: nextVersion,
        publish_requested_at: at,
        publish_requested_by: 'admin_canecas',
        registered_count_at_publish: count.registered,
      }),
    ]);
    model.published = published;
    model.history = { ...(model.history || {}), [nextVersion]: published };
    model.draft = { ...published, draft_revision: Date.now() };
    const panel = $('#cfProductContentPanel');
    const summary = $('.cf-content-summary', panel);
    if (summary) summary.outerHTML = summaryHtml();
    const status = $('#cfContentStatus');
    if (status) {
      status.className = 'cf-content-status good';
      status.innerHTML = `<b>Versão v${nextVersion} publicada.</b> O GitHub atualizará automaticamente as ${count.registered} canecas cadastradas em pequenos lotes. Novas canecas personalizáveis também usarão esta versão.`;
    }
    toast(`Modelo v${nextVersion} publicado. Atualização em massa iniciada.`);
  } catch (error) {
    toast(error.message || error, true);
  }
}

function loadHistory() {
  const version = Number($('#cfContentHistory')?.value || 0);
  if (!version || !model.history?.[version]) return toast('Escolha uma versão do histórico.', true);
  fillForm({ ...model.history[version], version: Number(model.published?.version || 0) });
  const status = $('#cfContentStatus');
  if (status) status.textContent = `Versão v${version} carregada no editor. Ela ainda é apenas um rascunho até você publicar.`;
}

async function loadModel() {
  const [config, products] = await Promise.all([
    fbGet(CONFIG_PATH).catch(() => ({})),
    loadMugs({ force: true }),
  ]);
  model.products = products || [];
  model.published = config?.published ? normalizeTemplate(config.published) : null;
  model.history = config?.history || {};
  model.draft = normalizeTemplate(config?.draft || model.published || DEFAULT_TEMPLATE);
}

async function renderPanel() {
  const settings = $('#settings');
  if (!settings || $('#cfProductContentPanel', settings)) return;
  installStyles();
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.id = 'cfProductContentPanel';
  panel.innerHTML = `<div class="panel-head"><div><h2>Conteúdo do Produto</h2><p>Modelo central das canecas personalizáveis. Edite uma vez e publique em massa com segurança.</p></div></div><div class="panel-body"><div id="cfContentLoading" class="notice">Carregando modelo e canecas…</div></div>`;
  settings.prepend(panel);
  try {
    await loadModel();
    $('.panel-body', panel).innerHTML = `${summaryHtml()}<div class="mini-actions" style="margin-top:11px"><button class="primary" id="cfOpenContentEditor" type="button">Abrir editor</button></div><div id="cfContentEditor" hidden></div>`;
    $('#cfOpenContentEditor').onclick = () => {
      const editor = $('#cfContentEditor');
      const opening = editor.hidden;
      editor.hidden = !opening;
      $('#cfOpenContentEditor').textContent = opening ? 'Fechar editor' : 'Abrir editor';
      if (opening) renderEditor();
    };
  } catch (error) {
    const loading = $('#cfContentLoading');
    if (loading) loading.textContent = `Não foi possível carregar: ${error.message || error}`;
  }
}

window.addEventListener('admin-canecas:settings-rendered', () => {
  setTimeout(() => void renderPanel(), 0);
});
if (location.hash.includes('settings')) setTimeout(() => void renderPanel(), 350);

document.documentElement.dataset.cfProductContentManager = BUILD;
export { BUILD, DEFAULT_TEMPLATE, normalizeTemplate, compiledHtml };
