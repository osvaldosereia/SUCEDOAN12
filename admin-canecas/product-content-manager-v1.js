import { FIREBASE_BASE, text, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260831-admin-canecas-product-content-manager-v1.0';
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
  personalizer_base: 'https://canecafacil.com.br/personalizar/',
  return_url: 'https://canecafacil.com.br/',
  open_new_tab: false,
  custom_html: '',
});

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const keyOf = p => text(p?.__key || p?.firebaseKey || p?.id);
const liOf = p => p?.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {};
const isPersonalizable = p => p?.personalizavel === true || p?.loja_integrada_personalizavel === true || p?.canecafacil_personalizavel === true || p?.personalizacao_publica === true;
const isRegistered = p => Boolean(text(liOf(p).produto_id));
const queueKey = key => {
  const bytes = new TextEncoder().encode(text(key)); let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const clamp = (v, min, max, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
const validColor = (v, fallback) => /^#[0-9a-f]{6}$/i.test(text(v)) ? text(v) : fallback;

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message; el.className = `toast${error ? ' error' : ''}`; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, error ? 7000 : 3600);
}
async function request(path, { method = 'GET', body } = {}) {
  const url = `${FIREBASE_BASE}/${path}.json${method === 'GET' ? `?_=${Date.now()}` : ''}`;
  const r = await fetch(url, {
    method,
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json().catch(() => null);
}
const fbGet = path => request(path);
const fbPut = (path, body) => request(path, { method: 'PUT', body });
const fbPatch = (path, body) => request(path, { method: 'PATCH', body });

function normalizeTemplate(raw = {}) {
  const t = { ...DEFAULT_TEMPLATE, ...(raw || {}) };
  return {
    ...t,
    id: 'personalizavel_padrao',
    version: Math.max(0, Number(t.version || 0)),
    mode: t.mode === 'html' ? 'html' : 'visual',
    enabled: t.enabled !== false,
    title: text(t.title).slice(0, 120),
    text: text(t.text).slice(0, 500),
    button_text: text(t.button_text || DEFAULT_TEMPLATE.button_text).slice(0, 100),
    benefits: text(t.benefits).slice(0, 500),
    note: text(t.note).slice(0, 500),
    align: ['left', 'center', 'right'].includes(t.align) ? t.align : 'center',
    background: validColor(t.background, DEFAULT_TEMPLATE.background),
    border_color: validColor(t.border_color, DEFAULT_TEMPLATE.border_color),
    text_color: validColor(t.text_color, DEFAULT_TEMPLATE.text_color),
    button_background: validColor(t.button_background, DEFAULT_TEMPLATE.button_background),
    button_color: validColor(t.button_color, DEFAULT_TEMPLATE.button_color),
    border_radius: clamp(t.border_radius, 0, 32, 14),
    button_radius: clamp(t.button_radius, 0, 32, 10),
    padding: clamp(t.padding, 8, 32, 16),
    button_full_mobile: t.button_full_mobile !== false,
    personalizer_base: /^https:\/\//i.test(text(t.personalizer_base)) ? text(t.personalizer_base) : DEFAULT_TEMPLATE.personalizer_base,
    return_url: /^https:\/\//i.test(text(t.return_url)) ? text(t.return_url) : DEFAULT_TEMPLATE.return_url,
    open_new_tab: t.open_new_tab === true,
    custom_html: String(t.custom_html || '').slice(0, 15000),
  };
}
function sampleVars(product = {}, template = DEFAULT_TEMPLATE) {
  const key = keyOf(product) || 'modelo-exemplo';
  const base = template.personalizer_base || DEFAULT_TEMPLATE.personalizer_base;
  const ret = template.return_url || DEFAULT_TEMPLATE.return_url;
  const url = `${base}${base.includes('?') ? '&' : '?'}model=${encodeURIComponent(key)}&return=${encodeURIComponent(ret)}`;
  return {
    '{{nome}}': text(product.nome || 'Caneca Personalizável'),
    '{{sku}}': text(product.codigo || product.sku || 'CANP-EXEMPLO'),
    '{{modelo_id}}': key,
    '{{preco}}': Number(product.preco || 19.9).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    '{{url_personalizador}}': url,
    '{{titulo}}': template.title,
    '{{texto}}': template.text,
    '{{botao}}': template.button_text,
    '{{beneficios}}': template.benefits,
    '{{aviso}}': template.note,
  };
}
function replaceVars(value, vars, { escapeValues = true } = {}) {
  let out = String(value || '');
  for (const [token, raw] of Object.entries(vars)) out = out.split(token).join(escapeValues ? esc(raw) : String(raw));
  return out;
}
function sanitizePreviewHtml(value) {
  return String(value || '')
    .replace(/<\/?(?:script|iframe|object|embed|form|input|textarea|select|meta|link)[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '');
}
function visualHtml(template, vars) {
  const t = normalizeTemplate(template);
  if (!t.enabled) return '<div style="padding:14px;color:#777;text-align:center">Bloco desativado</div>';
  const benefits = t.benefits ? `<div style="margin-top:10px;font-size:12px;line-height:1.45;opacity:.78">${replaceVars(t.benefits, vars).replace(/\n/g, '<br>')}</div>` : '';
  const note = t.note ? `<div style="margin-top:9px;font-size:11px;line-height:1.45;opacity:.68">${replaceVars(t.note, vars).replace(/\n/g, '<br>')}</div>` : '';
  const textBlock = t.text ? `<div style="margin:0 0 12px;font-size:13px;line-height:1.45">${replaceVars(t.text, vars).replace(/\n/g, '<br>')}</div>` : '';
  const target = t.open_new_tab ? ' target="_blank" rel="noopener"' : '';
  return `<div class="cf-personalizer-box" data-cf-template-version="${t.version || 0}" style="margin:16px 0;padding:${t.padding}px;border:1px solid ${t.border_color};border-radius:${t.border_radius}px;background:${t.background};color:${t.text_color};text-align:${t.align};box-sizing:border-box"><strong style="display:block;margin:0 0 7px;font-size:15px;line-height:1.3">${replaceVars(t.title, vars)}</strong>${textBlock}<a class="cf-personalize-link" href="${esc(vars['{{url_personalizador}}'])}"${target} style="display:inline-flex;align-items:center;justify-content:center;min-height:46px;width:${t.button_full_mobile ? '100%' : 'auto'};max-width:340px;box-sizing:border-box;background:${t.button_background};color:${t.button_color};text-decoration:none;padding:12px 18px;border-radius:${t.button_radius}px;font-weight:800;font-size:13px;line-height:1.2;text-align:center">${replaceVars(t.button_text, vars)}</a>${benefits}${note}</div>`;
}
function compiledHtml(template, product = {}) {
  const t = normalizeTemplate(template); const vars = sampleVars(product, t);
  if (t.mode !== 'html' || !text(t.custom_html)) return visualHtml(t, vars);
  let custom = sanitizePreviewHtml(replaceVars(t.custom_html, vars));
  if (!/cf-personalizer-box/i.test(custom)) custom = `<div class="cf-personalizer-box" data-cf-template-version="${t.version || 0}">${custom}</div>`;
  return custom;
}

let model = { draft: normalizeTemplate(DEFAULT_TEMPLATE), published: null, history: {}, products: [], sampleKey: '', preview: 'mobile' };

function installStyles() {
  if ($('#cfContentManagerStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfContentManagerStyles';
  style.textContent = `
    #cfProductContentPanel{margin-top:14px}.cf-content-summary{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.cf-content-chip{padding:7px 9px;border-radius:10px;background:#f4f6f2;font-size:11px;font-weight:800}.cf-content-chip b{font-size:13px}
    #cfContentEditor{display:grid;gap:14px;margin-top:14px}.cf-content-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.9fr);gap:16px}.cf-content-form{display:grid;gap:12px}.cf-content-section{padding:13px;border:1px solid #e2e5de;border-radius:13px;background:#fff}.cf-content-section h3{margin:0 0 10px;font-size:14px}.cf-content-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cf-content-field{display:grid;gap:5px}.cf-content-field.full{grid-column:1/-1}.cf-content-field span{font-size:11px;font-weight:800}.cf-content-field small{font-size:10px;color:#737971}.cf-content-field input,.cf-content-field textarea,.cf-content-field select{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #d9ddd5;border-radius:9px;background:#fff;font:inherit}.cf-content-field textarea{min-height:76px;resize:vertical}.cf-content-field textarea.code{min-height:210px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}
    .cf-preview-wrap{position:sticky;top:84px;align-self:start;display:grid;gap:9px}.cf-preview-toolbar{display:flex;gap:7px;justify-content:space-between;align-items:center;flex-wrap:wrap}.cf-preview-device{display:flex;gap:5px}.cf-preview-device button.active{background:#171918;color:#fff}.cf-preview-stage{padding:16px;border-radius:16px;background:#eef0eb;overflow:auto}.cf-preview-phone{margin:0 auto;background:#fff;border:1px solid #dadfd6;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08);transition:width .15s ease;overflow:hidden}.cf-preview-phone.mobile{width:min(100%,390px)}.cf-preview-phone.desktop{width:100%;max-width:760px}.cf-preview-product{padding:18px}.cf-preview-product h4{margin:0 0 10px;font-size:16px}.cf-preview-product p{font-size:13px;line-height:1.45;margin:0 0 10px}.cf-content-actions{display:flex;gap:8px;flex-wrap:wrap}.cf-content-actions .danger-soft{border-color:#d8b5b2;color:#913734;background:#fff}.cf-content-status{padding:10px 12px;border-radius:11px;background:#f6f7f4;font-size:11px;line-height:1.5}.cf-content-status.good{background:#edf8f0;color:#176b36}.cf-content-status.warn{background:#fff8e8;color:#7f5a14}.cf-content-vars{font-size:10px;line-height:1.7;color:#646b63}.cf-content-mode-html[hidden],.cf-content-mode-visual[hidden]{display:none!important}
    @media(max-width:980px){.cf-content-layout{grid-template-columns:1fr}.cf-preview-wrap{position:static}.cf-preview-phone.desktop{width:100%}}
    @media(max-width:700px){.cf-content-grid{grid-template-columns:1fr}.cf-content-layout{gap:10px}.cf-content-section{padding:11px}.cf-content-actions{display:grid;grid-template-columns:1fr}.cf-content-actions button{width:100%}.cf-preview-stage{padding:9px}}
  `;
  document.head.appendChild(style);
}

function counts() {
  const personal = model.products.filter(isPersonalizable);
  const registered = personal.filter(isRegistered);
  const version = Number(model.published?.version || 0);
  const updated = registered.filter(p => Number(liOf(p).content_template_version || 0) === version && version > 0);
  const testing = registered.filter(p => liOf(p).content_template_preview === true);
  return { personal: personal.length, registered: registered.length, updated: updated.length, pending: Math.max(0, registered.length - updated.length), testing: testing.length };
}
function summaryHtml() {
  const c = counts(); const version = Number(model.published?.version || 0);
  return `<div class="cf-content-summary"><span class="cf-content-chip"><b>${c.personal}</b> personalizáveis</span><span class="cf-content-chip"><b>${c.registered}</b> cadastradas</span><span class="cf-content-chip"><b>${c.updated}</b> na versão atual</span><span class="cf-content-chip"><b>${c.pending}</b> aguardando atualização</span><span class="cf-content-chip">modelo publicado: <b>${version ? `v${version}` : 'nenhum'}</b></span></div>`;
}
function templateFromForm() {
  const value = id => $(`#${id}`)?.value;
  return normalizeTemplate({
    ...model.draft,
    mode: value('cfContentMode'), enabled: $('#cfContentEnabled')?.checked !== false,
    title: value('cfContentTitle'), text: value('cfContentText'), button_text: value('cfContentButtonText'), benefits: value('cfContentBenefits'), note: value('cfContentNote'),
    align: value('cfContentAlign'), background: value('cfContentBg'), border_color: value('cfContentBorder'), text_color: value('cfContentTextColor'), button_background: value('cfContentButtonBg'), button_color: value('cfContentButtonColor'),
    border_radius: value('cfContentRadius'), button_radius: value('cfContentButtonRadius'), padding: value('cfContentPadding'), button_full_mobile: $('#cfContentButtonFull')?.checked !== false,
    personalizer_base: value('cfContentBase'), return_url: value('cfContentReturn'), open_new_tab: $('#cfContentNewTab')?.checked === true,
    custom_html: value('cfContentHtml'),
  });
}
function sampleProduct() {
  return model.products.find(p => keyOf(p) === model.sampleKey) || model.products.find(isPersonalizable) || {};
}
function updatePreview() {
  const t = templateFromForm(); model.draft = t;
  const frame = $('#cfContentPreview'); if (!frame) return;
  frame.className = `cf-preview-phone ${model.preview}`;
  const p = sampleProduct();
  frame.innerHTML = `<div class="cf-preview-product"><h4>Descrição</h4><p>${esc(text(p.descricao || p.descricao_completa || 'Caneca de porcelana branca personalizada.'))}</p>${compiledHtml(t, p)}</div>`;
  $$('.cf-preview-device button').forEach(b => b.classList.toggle('active', b.dataset.device === model.preview));
}
function toggleMode() {
  const mode = $('#cfContentMode')?.value || 'visual';
  $$('.cf-content-mode-visual').forEach(el => el.hidden = mode === 'html');
  $$('.cf-content-mode-html').forEach(el => el.hidden = mode !== 'html');
  updatePreview();
}
function fillForm(tpl) {
  const t = normalizeTemplate(tpl); model.draft = t;
  const set = (id, value) => { const el = $(`#${id}`); if (el) el.value = value ?? ''; };
  set('cfContentMode', t.mode); set('cfContentTitle', t.title); set('cfContentText', t.text); set('cfContentButtonText', t.button_text); set('cfContentBenefits', t.benefits); set('cfContentNote', t.note);
  set('cfContentAlign', t.align); set('cfContentBg', t.background); set('cfContentBorder', t.border_color); set('cfContentTextColor', t.text_color); set('cfContentButtonBg', t.button_background); set('cfContentButtonColor', t.button_color);
  set('cfContentRadius', t.border_radius); set('cfContentButtonRadius', t.button_radius); set('cfContentPadding', t.padding); set('cfContentBase', t.personalizer_base); set('cfContentReturn', t.return_url); set('cfContentHtml', t.custom_html);
  if ($('#cfContentEnabled')) $('#cfContentEnabled').checked = t.enabled;
  if ($('#cfContentButtonFull')) $('#cfContentButtonFull').checked = t.button_full_mobile;
  if ($('#cfContentNewTab')) $('#cfContentNewTab').checked = t.open_new_tab;
  toggleMode(); updatePreview();
}
function renderEditor() {
  const host = $('#cfContentEditor'); if (!host) return;
  const personal = model.products.filter(isPersonalizable);
  const history = Object.values(model.history || {}).filter(Boolean).sort((a,b) => Number(b.version||0)-Number(a.version||0));
  host.innerHTML = `<div class="cf-content-layout"><div class="cf-content-form">
    <section class="cf-content-section"><h3>Modelo</h3><div class="cf-content-grid">
      <label class="cf-content-field"><span>Modo</span><select id="cfContentMode"><option value="visual">Editor visual</option><option value="html">HTML avançado</option></select></label>
      <label class="cf-content-field"><span>Status</span><select id="cfContentEnabled"><option value="1">Ativo</option></select><small>Use a caixa abaixo para ligar/desligar.</small><input type="checkbox" id="cfContentEnabledCheck" hidden></label>
      <label class="cf-content-field full"><span><input type="checkbox" id="cfContentEnabled" style="width:auto;margin-right:6px"> Exibir este bloco nas canecas personalizáveis</span></label>
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
      <label class="cf-content-field"><span>Borda</span><input id="cfContentBorder" type="color"></label><label class="cf-content-field"><span>Texto</span><input id="cfContentTextColor" type="color"></label>
      <label class="cf-content-field"><span>Fundo do botão</span><input id="cfContentButtonBg" type="color"></label><label class="cf-content-field"><span>Texto do botão</span><input id="cfContentButtonColor" type="color"></label>
      <label class="cf-content-field"><span>Arredondamento do bloco</span><input id="cfContentRadius" type="number" min="0" max="32"></label><label class="cf-content-field"><span>Arredondamento do botão</span><input id="cfContentButtonRadius" type="number" min="0" max="32"></label>
      <label class="cf-content-field"><span>Espaçamento interno</span><input id="cfContentPadding" type="number" min="8" max="32"></label>
      <label class="cf-content-field"><span><input type="checkbox" id="cfContentButtonFull" style="width:auto;margin-right:6px"> Botão largo no mobile</span></label>
    </div></section>
    <section class="cf-content-section"><h3>Comportamento</h3><div class="cf-content-grid">
      <label class="cf-content-field full"><span>URL base do personalizador</span><input id="cfContentBase"></label>
      <label class="cf-content-field full"><span>URL de retorno</span><input id="cfContentReturn"></label>
      <label class="cf-content-field full"><span><input type="checkbox" id="cfContentNewTab" style="width:auto;margin-right:6px"> Abrir em nova aba</span></label>
    </div></section>
    <section class="cf-content-section cf-content-mode-html" hidden><h3>HTML avançado</h3><label class="cf-content-field full"><span>Código</span><textarea class="code" id="cfContentHtml" spellcheck="false"></textarea><small>Scripts, iframes, formulários e eventos JavaScript são removidos por segurança.</small></label><div class="cf-content-vars">Variáveis: {{nome}}, {{sku}}, {{modelo_id}}, {{preco}}, {{url_personalizador}}, {{titulo}}, {{texto}}, {{botao}}, {{beneficios}}, {{aviso}}</div></section>
    <section class="cf-content-section"><h3>Publicação segura</h3><div class="cf-content-grid">
      <label class="cf-content-field full"><span>Caneca para teste</span><select id="cfContentTestProduct">${personal.map(p => `<option value="${esc(keyOf(p))}">${esc(p.nome || p.codigo || keyOf(p))}${isRegistered(p) ? '' : ' · ainda não cadastrada'}</option>`).join('')}</select></label>
      <label class="cf-content-field"><span>Histórico</span><select id="cfContentHistory"><option value="">Escolha uma versão</option>${history.map(h => `<option value="${Number(h.version||0)}">v${Number(h.version||0)} · ${esc(text(h.published_at || h.updated_at).slice(0,16).replace('T',' '))}</option>`).join('')}</select></label>
      <div class="cf-content-field"><span>&nbsp;</span><button type="button" class="secondary" id="cfContentLoadHistory">Carregar versão no rascunho</button></div>
    </div><div class="cf-content-actions" style="margin-top:12px"><button type="button" class="secondary" id="cfContentSaveDraft">Salvar rascunho</button><button type="button" class="secondary" id="cfContentTestOne">Testar em 1 caneca</button><button type="button" class="primary" id="cfContentPublish">Publicar em todas as cadastradas</button></div><div id="cfContentStatus" class="cf-content-status" style="margin-top:10px">Edite, visualize e salve como rascunho. Publicar cria uma nova versão e o GitHub atualiza as canecas gradualmente.</div></section>
  </div><aside class="cf-preview-wrap"><div class="cf-preview-toolbar"><div><strong>Pré-visualização</strong><small style="display:block;color:#737971">Referência mobile baseada na página real enviada.</small></div><div class="cf-preview-device"><button class="secondary active" type="button" data-device="mobile">Mobile</button><button class="secondary" type="button" data-device="desktop">Desktop</button></div></div><div class="cf-preview-stage"><div id="cfContentPreview" class="cf-preview-phone mobile"></div></div></aside></div>`;
  fillForm(model.draft);
  const sampleSelect = $('#cfContentTestProduct'); if (sampleSelect) { model.sampleKey = model.sampleKey || sampleSelect.value; sampleSelect.value = model.sampleKey; sampleSelect.onchange = () => { model.sampleKey = sampleSelect.value; updatePreview(); }; }
  $('#cfContentMode').onchange = toggleMode;
  $$('#cfContentEditor input,#cfContentEditor textarea,#cfContentEditor select').forEach(el => { if (el.id !== 'cfContentHistory' && el.id !== 'cfContentTestProduct') el.addEventListener('input', updatePreview); });
  $$('.cf-preview-device button').forEach(b => b.onclick = () => { model.preview = b.dataset.device; updatePreview(); });
  $('#cfContentSaveDraft').onclick = () => void saveDraft();
  $('#cfContentTestOne').onclick = () => void testOne();
  $('#cfContentPublish').onclick = () => void publishAll();
  $('#cfContentLoadHistory').onclick = () => loadHistory();
}

async function saveDraft({ quiet = false } = {}) {
  const t = { ...templateFromForm(), version: Number(model.published?.version || 0), draft_revision: Date.now(), updated_at: nowIso(), updated_by: 'admin_canecas' };
  await fbPut(`${CONFIG_PATH}/draft`, t); model.draft = t;
  if (!quiet) toast('Rascunho salvo. A Loja Integrada ainda não foi alterada.');
  return t;
}
async function testOne() {
  try {
    const key = text($('#cfContentTestProduct')?.value); const p = model.products.find(x => keyOf(x) === key);
    if (!p) throw new Error('Escolha uma caneca para o teste.');
    if (!isRegistered(p)) throw new Error('Essa caneca ainda não está cadastrada na Loja Integrada. Escolha uma já cadastrada.');
    const draft = await saveDraft({ quiet: true }); const at = nowIso();
    await fbPut(`${CONTENT_QUEUE}/${queueKey(key)}`, { product_key: key, produto_id: text(liOf(p).produto_id), source: 'draft', base_published_version: Number(model.published?.version || 0), draft_revision: draft.draft_revision, status: 'pendente', solicitado_em: at, atualizado_em: at, tentativas: 0, solicitado_por: 'admin_content_test' });
    const status = $('#cfContentStatus'); if (status) { status.className = 'cf-content-status warn'; status.innerHTML = `<b>Teste enviado.</b> O GitHub aplicará este rascunho somente em <b>${esc(p.nome || key)}</b>. Aguarde alguns minutos e confira a página real antes de publicar em massa.`; }
    toast('Teste de conteúdo enviado ao GitHub.');
  } catch (e) { toast(e.message || e, true); }
}
async function publishAll() {
  try {
    const c = counts(); if (!c.registered) throw new Error('Nenhuma caneca personalizável cadastrada foi encontrada.');
    if (!confirm(`Publicar este modelo em ${c.registered} caneca(s) já cadastrada(s)? O GitHub fará a atualização gradualmente e com confirmação.`)) return;
    const draft = await saveDraft({ quiet: true });
    const nextVersion = Number(model.published?.version || 0) + 1; const at = nowIso();
    const published = { ...draft, version: nextVersion, published_at: at, updated_at: at, published_by: 'admin_canecas' };
    await Promise.all([
      fbPut(`${CONFIG_PATH}/published`, published),
      fbPut(`${CONFIG_PATH}/history/${nextVersion}`, published),
      fbPatch(`${CONFIG_PATH}/meta`, { current_version: nextVersion, publish_requested_at: at, publish_requested_by: 'admin_canecas', registered_count_at_publish: c.registered }),
    ]);
    model.published = published; model.history = { ...(model.history || {}), [nextVersion]: published }; model.draft = { ...published, draft_revision: Date.now() };
    const panel = $('#cfProductContentPanel'); const summary = $('.cf-content-summary', panel); if (summary) summary.outerHTML = summaryHtml();
    const status = $('#cfContentStatus'); if (status) { status.className = 'cf-content-status good'; status.innerHTML = `<b>Versão v${nextVersion} publicada.</b> O GitHub atualizará automaticamente as ${c.registered} canecas cadastradas em pequenos lotes. Novas canecas personalizáveis também usarão esta versão.`; }
    toast(`Modelo v${nextVersion} publicado. Atualização em massa iniciada.`);
  } catch (e) { toast(e.message || e, true); }
}
function loadHistory() {
  const version = Number($('#cfContentHistory')?.value || 0); if (!version || !model.history?.[version]) return toast('Escolha uma versão do histórico.', true);
  fillForm({ ...model.history[version], version: Number(model.published?.version || 0) });
  const status = $('#cfContentStatus'); if (status) status.textContent = `Versão v${version} carregada no editor. Ela ainda é apenas um rascunho até você publicar.`;
}

async function loadModel() {
  const [config, products] = await Promise.all([fbGet(CONFIG_PATH).catch(() => ({})), loadMugs({ force: true })]);
  model.products = products || []; model.published = config?.published ? normalizeTemplate(config.published) : null; model.history = config?.history || {};
  model.draft = normalizeTemplate(config?.draft || model.published || DEFAULT_TEMPLATE);
}
async function renderPanel() {
  const settings = $('#settings'); if (!settings || $('#cfProductContentPanel', settings)) return;
  installStyles();
  const panel = document.createElement('section'); panel.className = 'panel'; panel.id = 'cfProductContentPanel';
  panel.innerHTML = `<div class="panel-head"><div><h2>Conteúdo do Produto</h2><p>Modelo central das canecas personalizáveis. Edite uma vez e publique em massa com segurança.</p></div></div><div class="panel-body"><div id="cfContentLoading" class="notice">Carregando modelo e canecas…</div></div>`;
  settings.prepend(panel);
  try {
    await loadModel();
    $('.panel-body', panel).innerHTML = `${summaryHtml()}<div class="mini-actions" style="margin-top:11px"><button class="primary" id="cfOpenContentEditor" type="button">Abrir editor</button></div><div id="cfContentEditor" hidden></div>`;
    $('#cfOpenContentEditor').onclick = () => { const editor = $('#cfContentEditor'); const open = editor.hidden; editor.hidden = !open; $('#cfOpenContentEditor').textContent = open ? 'Fechar editor' : 'Abrir editor'; if (open) renderEditor(); };
  } catch (e) { $('#cfContentLoading').textContent = `Não foi possível carregar: ${e.message || e}`; }
}

window.addEventListener('admin-canecas:settings-rendered', () => { setTimeout(() => void renderPanel(), 0); });
if (location.hash.includes('settings')) setTimeout(() => void renderPanel(), 350);

document.documentElement.dataset.cfProductContentManager = BUILD;
export { BUILD, DEFAULT_TEMPLATE, normalizeTemplate, compiledHtml };
