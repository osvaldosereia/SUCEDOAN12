from pathlib import Path
import re

APP = Path('loja-integrada/personalizar/app-v13.js')
INDEX = Path('loja-integrada/personalizar/index.html')
STYLES = Path('loja-integrada/personalizar/styles.css')
SYNC = Path('scripts/sincronizar-loja-integrada.mjs')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Trecho não encontrado: {label}')
    return text.replace(old, new, 1)

a = APP.read_text(encoding='utf-8')
a = replace_once(a, "const BUILD = '20260901-loja-integrada-personalizador-v5.3-horizontal-2-crops-async-cart';", "const BUILD = '20260901-loja-integrada-personalizador-v6-async-preview-email';", 'BUILD')
a = replace_once(a, 'const WAIT_MS = 180000;', 'const WAIT_MS = 600000;', 'WAIT_MS')
a = replace_once(a, "const modelId = text(params.get('model'));\nconst explicitReturn = text(params.get('return'));", "let modelId = text(params.get('model'));\nconst creationParam = text(params.get('creation'));\nconst explicitReturn = text(params.get('return'));", 'params')
a = replace_once(a, "let product = null;\nlet config = null;", "let product = null;\nlet config = null;\nlet currentCreationCode = '';\nlet currentSource = '';\nlet currentCrops = null;\nlet currentPreviewIndex = 0;", 'estado atual')

pattern = r"function showError\(message\) \{[\s\S]*?\n\}\nfunction setProgress\(title, message\) \{[\s\S]*?\n\}"
replacement = r'''function hideTransient() {
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
}'''
if not re.search(pattern, a): raise SystemExit('helpers showError/setProgress não encontrados')
a = re.sub(pattern, replacement, a, count=1)

marker = 'async function collectCustomerValues() {'
if marker not in a: raise SystemExit('collectCustomerValues não encontrado')
preview_helpers = r'''function maskEmail(value) {
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
    arte_aprovada:null,
    arte_versao:'v1',
    arte_versao_aprovada:'',
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
      campos_liberados:config.fields.map(field => ({ id:field.id, rotulo:field.label, tipo:field.type, obrigatorio:field.required }))
    },
    status:'gerando',
    atendimento_status:'novo',
    criado_em:at,
    atualizado_em:at,
  };
  await writeJson(`${CREATIONS_NODE}/${safeKey(code)}`, record, 'PUT');
}
async function approveAndBuy() {
  if (!currentCreationCode || !currentSource) return;
  const button = $('#approveButton');
  if (button.disabled) return;
  button.disabled = true;
  setProgress('Preparando sua compra', 'Sua arte foi aprovada. Agora estamos preparando o item no carrinho…');
  try {
    const at = new Date().toISOString();
    await writeJson(`${CREATIONS_NODE}/${safeKey(currentCreationCode)}`, {
      aprovada:true,
      arte_aprovada:{ url:currentSource, versao:'v1', aprovado_em:at },
      arte_versao_aprovada:'v1',
      status:'pronta_para_compra',
      atualizado_em:at,
    }, 'PATCH');
    if (!currentCrops) currentCrops = await createTwoCrops(currentSource);
    const tempProductId = await createTemporaryProduct(currentCreationCode, currentCrops);
    goToCart(tempProductId, currentCreationCode);
  } catch (error) {
    $('#progressBox').hidden = true;
    $('#previewBox').hidden = false;
    $('#errorText').textContent = error?.message || String(error);
    $('#errorBox').hidden = false;
    button.disabled = false;
  }
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
  } catch (error) {
    showPending(code);
  }
}

'''
a = a.replace(marker, preview_helpers + marker, 1)

pattern = r"async function persistCreation\(code, source, fields, images\) \{[\s\S]*?\n\}\nfunction temporaryProductPayload"
if not re.search(pattern, a): raise SystemExit('persistCreation antigo não encontrado')
a = re.sub(pattern, "function temporaryProductPayload", a, count=1)

pattern = r"async function generateAndCart\(event\) \{[\s\S]*?\n\}\nasync function init\(\) \{"
new_generate = r'''async function generateForPreview(event) {
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
    const resume = buildResumeUrl(code);
    const personalizationPayload = {
      action:'personalize_mug_model',
      request_id:requestId,
      creation_code:code,
      resume_url:resume,
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
    await markArtReady(code, source);
    await showPreview(code, source);
  } catch (error) {
    if (code && /demorou mais/i.test(error?.message || '')) showPending(code, email);
    else showError(error?.message || String(error));
  } finally {
    button.disabled = false;
  }
}
async function init() {'''
if not re.search(pattern, a): raise SystemExit('generateAndCart/init não encontrado')
a = re.sub(pattern, new_generate, a, count=1)

pattern = r"async function init\(\) \{[\s\S]*?\n\}\n\nif \(document\.readyState === 'loading'\)"
new_init = r'''async function init() {
  document.documentElement.dataset.cfLiPersonalizer = BUILD;
  document.body.classList.toggle('is-embed', embedded);

  $('#prevPreview').addEventListener('click', () => { currentPreviewIndex -= 1; setPreviewImage(); });
  $('#nextPreview').addEventListener('click', () => { currentPreviewIndex += 1; setPreviewImage(); });
  $('#approveButton').addEventListener('click', approveAndBuy);
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
    if (product.loja_integrada_personalizavel === false || product.canecafacil_personalizavel === false) throw new Error('Este modelo não está disponível para personalização.');
    config = normalizeConfig(product);
    if (!config.active) throw new Error('A personalização deste modelo está desativada.');
    render();
  } catch (error) { return showError(error?.message || String(error)); }

  $('#personalizerForm').addEventListener('submit', generateForPreview);
}

if (document.readyState === 'loading')'''
if not re.search(pattern, a): raise SystemExit('init final não encontrado')
a = re.sub(pattern, new_init, a, count=1)

a = replace_once(a, "return `CF-${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;", "const random = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9]/gi,'').toUpperCase().slice(-12);\n  return `CF-${prefix}-${random}`;", 'creationCode')
Path('loja-integrada/personalizar/app-v14.js').write_text(a, encoding='utf-8')

h = INDEX.read_text(encoding='utf-8')
h = h.replace('Ao gerar, sua caneca vai direto para o carrinho.', 'Gere sua arte, confira o resultado e só depois aprove para comprar.')
h = h.replace('<div class="grid" id="dynamicFields"></div>', '''<div class="grid">
        <label class="cf-field cf-wide">Seu e-mail *
          <input id="customerEmail" type="email" autocomplete="email" maxlength="160" placeholder="voce@email.com" required>
          <small>Se você sair da página, avisaremos quando sua arte estiver pronta.</small>
        </label>
      </div>
      <div class="grid" id="dynamicFields"></div>''')
h = h.replace('GERAR E IR PARA O CARRINHO', 'GERAR MINHA ARTE')
h = h.replace('Seu e-mail será informado no checkout seguro da própria Loja Integrada.', 'Usaremos seu e-mail somente para avisar sobre esta personalização. Promoções exigem autorização separada.')
preview = '''
    <section class="preview-card" id="previewBox" hidden aria-live="polite">
      <div class="preview-head">
        <div><strong>Sua arte ficou pronta ✨</strong><p>Confira os dois lados antes de aprovar.</p></div>
        <small id="previewCode"></small>
      </div>
      <div class="preview-stage">
        <button type="button" class="preview-arrow" id="prevPreview" aria-label="Imagem anterior">‹</button>
        <img id="previewImage" alt="Prévia da arte personalizada">
        <button type="button" class="preview-arrow" id="nextPreview" aria-label="Próxima imagem">›</button>
      </div>
      <div class="preview-meta"><span id="previewCounter">1 de 2</span><span>Prévia da arte real</span></div>
      <button class="primary" id="approveButton" type="button">APROVAR E COMPRAR</button>
      <button class="secondary preview-edit" id="editCreation" type="button">ALTERAR DADOS</button>
      <p class="native-note">O produto só será preparado no carrinho depois da sua aprovação.</p>
    </section>

    <section class="pending-card" id="pendingBox" hidden aria-live="polite">
      <strong>Sua arte continua sendo preparada</strong>
      <p id="pendingText">Você pode sair desta página e voltar depois.</p>
      <a class="secondary" id="resumeLink" href="#" target="_top">ACOMPANHAR MINHA ARTE</a>
    </section>
'''
h = h.replace('    <section class="progress-card" id="progressBox" hidden aria-live="polite">', preview + '\n    <section class="progress-card" id="progressBox" hidden aria-live="polite">')
h = h.replace('<strong>Pronto</strong>', '<strong>Compra preparada</strong>')
h = h.replace('Sua arte foi criada e sua caneca está pronta para continuar a compra.', 'Sua arte foi aprovada e sua caneca está pronta para continuar a compra.')
h = h.replace('./styles.css?v=20260901-6', './styles.css?v=20260901-7')
h = h.replace('<script type="module" src="./app-v13.js?v=20260901-4"></script>', '<script type="module" src="./app-v14.js?v=20260901-1"></script>')
INDEX.write_text(h, encoding='utf-8')

c = STYLES.read_text(encoding='utf-8')
extra = r'''
[hidden]{display:none!important}.preview-card,.pending-card{background:#fff;border:1px solid #e5e5e1;border-radius:12px;box-shadow:0 4px 15px rgba(20,20,20,.03);margin-top:8px;padding:12px}.preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}.preview-head strong,.pending-card strong{font-size:13px}.preview-head p,.pending-card p{margin:2px 0 0;color:#727672;font-size:10px}.preview-head small{color:#8a8d88;font-size:8.5px}.preview-stage{display:grid;grid-template-columns:38px minmax(0,1fr) 38px;align-items:center;gap:8px;background:#f4f4f2;border-radius:10px;padding:8px;min-height:190px}.preview-stage img{display:block;width:100%;height:210px;object-fit:contain;background:#fff;border-radius:8px}.preview-arrow{width:38px;height:38px;border:0;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);font-size:25px;line-height:1;cursor:pointer}.preview-meta{display:flex;justify-content:space-between;gap:8px;margin:6px 2px 0;color:#777c77;font-size:9px}.preview-card>.primary{width:100%;min-height:46px;margin-top:9px}.preview-edit{width:100%;margin-top:6px}.pending-card .secondary{width:100%;margin-top:8px}.is-embed .preview-card,.is-embed .pending-card{box-shadow:none;border-radius:0;border-left:0;border-right:0}.is-embed .preview-stage{min-height:165px}.is-embed .preview-stage img{height:185px}@media(max-width:620px){.preview-stage{grid-template-columns:34px minmax(0,1fr) 34px;gap:6px}.preview-stage img{height:180px}.preview-arrow{width:34px;height:34px}.is-embed .preview-stage img{height:165px}}
'''
if '.preview-card' not in c:
    c += extra
STYLES.write_text(c, encoding='utf-8')

s = SYNC.read_text(encoding='utf-8')
s = s.replace('const frameHeight = Math.min(520, Math.max(235, 190 + fields * 48));', 'const frameHeight = Math.min(620, Math.max(320, 235 + (fields + 1) * 48));')
SYNC.write_text(s, encoding='utf-8')

print('V14 aplicado: app-v14.js + index + styles + iframe height')
