import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { ProductsModule } from './modules/products.js';
import { MakeModule } from './modules/make.js';
import { productImage, text } from './core/utils.js';

const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';
const BUILD = '20260821-canecas-v1';

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function uniqueImages(product = {}) {
  const values = [
    product.url_imagem,
    product.imagem_url,
    product.imagem,
    ...(Array.isArray(product.imagens) ? product.imagens : []),
  ];
  return [...new Set(values.map(value => text(value)).filter(Boolean))].slice(0, 3);
}

function setMediaDirty(instance, key, patch) {
  instance.store.updateProduct(key, patch);
  const updated = instance.store.getProduct(key);
  if (updated) {
    instance.renderValidation(updated);
    instance.renderDirty();
  }
}

function enhanceProductMedia(instance, product) {
  const content = instance.elements?.productForm?.querySelector('[data-editor-section="content"] .form-grid');
  if (!content || content.querySelector('[data-mug-gallery-fields]')) return;

  const images = uniqueImages(product);
  const primaryInput = content.querySelector('[data-field="url_imagem"]');
  const primaryLabel = primaryInput?.closest('label');
  if (primaryLabel) {
    const firstText = [...primaryLabel.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (firstText) firstText.nodeValue = 'Foto 1 / capa';
  }

  const block = document.createElement('div');
  block.className = 'span-2 mug-gallery-fields';
  block.dataset.mugGalleryFields = '1';
  block.innerHTML = `
    <div class="mug-gallery-head"><strong>Galeria do produto</strong><small>Até 3 fotos. A Foto 1 continua sendo a capa do catálogo.</small></div>
    <div class="mug-gallery-grid">
      <label>Foto 2<input type="url" data-mug-media-slot="2" placeholder="https://..." value="${escapeAttribute(images[1] || '')}"></label>
      <label>Foto 3<input type="url" data-mug-media-slot="3" placeholder="https://..." value="${escapeAttribute(images[2] || '')}"></label>
    </div>
    <div class="mug-gallery-preview">${images.map((url, index) => `<figure><img src="${escapeAttribute(url)}" alt="Foto ${index + 1}"><figcaption>Foto ${index + 1}${index === 0 ? ' · capa' : ''}</figcaption></figure>`).join('') || '<small>Nenhuma foto cadastrada.</small>'}</div>`;

  if (primaryLabel) primaryLabel.insertAdjacentElement('afterend', block);
  else content.prepend(block);

  const youtube = content.querySelector('[data-field="video_youtube"]');
  const youtubeLabel = youtube?.closest('label');
  if (youtubeLabel) {
    const firstText = [...youtubeLabel.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (firstText) firstText.nodeValue = 'Vídeo do YouTube (1 vídeo)';
  }
}

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function installProductMediaPatch() {
  const prototype = ProductsModule.prototype;
  if (prototype.__mugMediaPatchBuild === BUILD) return;
  prototype.__mugMediaPatchBuild = BUILD;

  const originalRenderEditor = prototype.renderEditor;
  prototype.renderEditor = function renderEditorWithGallery(product) {
    const result = originalRenderEditor.call(this, product);
    enhanceProductMedia(this, this.store.getProduct(this.store.state.selectedProductKey) || product);
    return result;
  };

  const originalHandleEditorInput = prototype.handleEditorInput;
  prototype.handleEditorInput = function handleEditorInputWithGallery(event) {
    const customInput = event.target.closest?.('[data-mug-media-slot]');
    if (customInput) {
      const key = this.store.state.selectedProductKey;
      const product = this.store.getProduct(key);
      if (!key || !product) return;
      const slot = Math.max(1, Math.min(3, Number(customInput.dataset.mugMediaSlot) || 1));
      const images = uniqueImages(product);
      while (images.length < 3) images.push('');
      images[slot - 1] = text(customInput.value);
      const clean = images.map(value => text(value)).filter(Boolean).slice(0, 3);
      const patch = { imagens: clean };
      if (clean[0]) {
        patch.url_imagem = clean[0];
        patch.imagem = clean[0];
        patch.imagem_url = clean[0];
      }
      setMediaDirty(this, key, patch);
      return;
    }

    const field = event.target?.dataset?.field;
    const result = originalHandleEditorInput.call(this, event);
    if (field === 'url_imagem') {
      const key = this.store.state.selectedProductKey;
      const product = this.store.getProduct(key);
      if (key && product) {
        const primary = text(product.url_imagem);
        const images = uniqueImages(product).filter(url => url !== primary);
        const next = [primary, ...images].filter(Boolean).slice(0, 3);
        setMediaDirty(this, key, { imagens: next, imagem: primary, imagem_url: primary });
      }
    }
    return result;
  };

  const originalUploadEditedImage = prototype.uploadEditedImage;
  prototype.uploadEditedImage = async function uploadEditedImagePreservingGallery() {
    const key = this.store.state.selectedProductKey;
    const before = uniqueImages(this.store.getProduct(key));
    const result = await originalUploadEditedImage.call(this);
    const after = this.store.getProduct(key);
    const primary = text(productImage(after));
    const images = [primary, ...before.filter(url => url !== primary)].filter(Boolean).slice(0, 3);
    if (key && primary) {
      this.store.updateProduct(key, { url_imagem: primary, imagem: primary, imagem_url: primary, imagens });
      this.refreshAfterExternalChange(key);
    }
    return result;
  };

  const makePrototype = MakeModule.prototype;
  if (!makePrototype.__mugMediaPatchBuild) {
    makePrototype.__mugMediaPatchBuild = BUILD;
    const originalPatchFromResult = makePrototype.patchFromResult;
    makePrototype.patchFromResult = async function patchFromResultPreservingGallery(action, product, rawResult) {
      const patch = await originalPatchFromResult.call(this, action, product, rawResult);
      if (action === 'image' && patch.url_imagem) {
        const primary = text(patch.url_imagem);
        patch.imagens = [primary, ...uniqueImages(product).filter(url => url !== primary)].filter(Boolean).slice(0, 3);
      }
      return patch;
    };
  }
}

function titleCase(value) {
  return text(value).toLocaleLowerCase('pt-BR').replace(/(^|[\s\-/])([\p{L}\p{N}])/gu, (_, prefix, char) => `${prefix}${char.toLocaleUpperCase('pt-BR')}`);
}

function classifyTheme(value) {
  const theme = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rules = [
    ['Religiosas', ['jesus', 'maria', 'nossa senhora', 'santo', 'santa', 'sao ', 'deus', 'fe', 'oracao', 'catolic', 'espirito santo', 'pentecost']],
    ['Profissões', ['advog', 'medic', 'enferm', 'professor', 'dentist', 'engenheir', 'contador', 'policial', 'veterin', 'arquit']],
    ['Família', ['mae', 'pai', 'avo', 'avó', 'familia', 'filho', 'filha', 'irmao', 'irma', 'tio', 'tia']],
    ['Românticas', ['amor', 'namor', 'casal', 'casamento', 'marido', 'esposa', 'noivo', 'noiva']],
    ['Pets', ['gato', 'gata', 'cachorro', 'cadela', 'pet', 'pug', 'golden', 'shih', 'bulldog']],
    ['Humor', ['humor', 'engrac', 'meme', 'piada', 'sarcas', 'ironia']],
    ['Esportes e Fitness', ['futebol', 'time', 'crossfit', 'academia', 'corrida', 'ciclismo', 'esporte', 'gym']],
    ['Datas Comemorativas', ['natal', 'pascoa', 'anivers', 'dia das', 'formatura', 'festa junina', 'ano novo']],
    ['Motivacionais', ['motiv', 'gratidao', 'coragem', 'forca', 'foco', 'superacao', 'inspir']],
    ['Geek e Games', ['anime', 'game', 'gamer', 'nerd', 'rpg', 'manga', 'geek']],
    ['Música', ['musica', 'cantor', 'cantora', 'banda', 'rock', 'sertanejo', 'pagode']],
  ];
  return rules.find(([, terms]) => terms.some(term => theme.includes(term)))?.[0] || 'Criativas';
}

function youtubeUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(url.hostname)) return '';
    return raw;
  } catch {
    return '';
  }
}

function promptForPhoto({ theme, phrase, angle }) {
  const phraseInstruction = phrase
    ? `A estampa deve conter exatamente a frase em português brasileiro: "${phrase}". Não altere nenhuma letra, acento ou pontuação.`
    : 'A estampa pode ser apenas visual, sem texto obrigatório.';
  return `Crie uma fotografia profissional de e-commerce de UMA caneca branca de cerâmica 325 ml, ${angle}, fundo branco puro, iluminação de estúdio suave, produto inteiro visível e sem mãos. A caneca deve ter uma arte ORIGINAL e comercialmente atraente inspirada no tema: ${theme}. ${phraseInstruction} Não use marcas, personagens protegidos, logotipos, assinatura ou marca-d'água. A imagem deve ser quadrada 1:1, limpa e pronta para catálogo de loja online.`;
}

async function saveGeneratedProduct(payload, images) {
  const config = loadConfig();
  const base = text(config.firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
  const node = text(config.productsNode || DEFAULT_CONFIG.productsNode).replace(/^\/+|\/+$/g, '') || 'produtos';
  const now = new Date().toISOString();
  const product = {
    id: payload.request_id,
    firebaseKey: payload.request_id,
    codigo: payload.codigo,
    nome: payload.nome,
    categoria: 'Canecas',
    subcategoria: payload.subcategoria,
    subsubcategoria: payload.tema,
    preco_custo: 10,
    preco: 19.90,
    estoque: 0,
    situacao: 'I',
    material: 'Cerâmica',
    embalagem: 'Caneca de cerâmica 325 ml',
    unidade: 'UN',
    descricao: `Caneca branca de cerâmica 325 ml com arte temática ${payload.tema}. Produto cadastrado automaticamente para revisão antes da publicação.`,
    url_imagem: images[0],
    imagem: images[0],
    imagem_url: images[0],
    imagens: images.slice(0, 3),
    video_youtube: payload.video_youtube || '',
    origem_cadastro: 'make_canecas_admin',
    tema_caneca: payload.tema,
    frase_caneca: payload.frase || '',
    criado_em: now,
    updated_at: now,
    last_update: Date.now(),
  };
  const response = await fetch(`${base}/${node}/${encodeURIComponent(payload.request_id)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(product),
  });
  if (!response.ok) throw new Error(`Firebase não aceitou o novo produto (${response.status}).`);
  return product;
}

function installMugPanel() {
  if (document.getElementById('mugAutomationPanel')) return;
  const view = document.querySelector('[data-view="products"]');
  if (!view) return;

  const panel = document.createElement('section');
  panel.id = 'mugAutomationPanel';
  panel.className = 'mug-automation-panel';
  panel.innerHTML = `
    <div class="mug-auto-title"><div><span class="eyebrow">Canecas + Make</span><h2>Gerar nova caneca com IA</h2><p>O Make gera duas fotos; o Admin cadastra o produto no Firebase como inativo para revisão.</p></div><span class="badge warning">Sempre inativo</span></div>
    <div class="mug-auto-grid">
      <label class="span-2">Tema da caneca<input id="mugTheme" type="text" placeholder="Ex.: São José minimalista, mãe de gato, advogado..." autocomplete="off"></label>
      <label>Frase opcional<input id="mugPhrase" type="text" placeholder="Texto exato da arte"></label>
      <label>Nome opcional<input id="mugName" type="text" placeholder="Se vazio, será criado automaticamente"></label>
      <label class="span-2">Vídeo do YouTube (opcional)<input id="mugYoutube" type="url" placeholder="https://www.youtube.com/watch?v=..."></label>
      <label class="span-2">Webhook do cenário Make<input id="mugWebhook" type="url" placeholder="https://hook.eu1.make.com/..."><small>Fica salvo somente neste navegador.</small></label>
    </div>
    <div class="mug-auto-footer"><button id="mugGenerateButton" class="button primary" type="button">Gerar caneca</button><span id="mugAutomationStatus" class="muted"></span></div>`;

  const anchor = view.querySelector('.filter-bar, [data-products-toolbar], .products-toolbar, .table-shell');
  if (anchor) anchor.insertAdjacentElement('beforebegin', panel);
  else view.prepend(panel);

  const webhook = panel.querySelector('#mugWebhook');
  webhook.value = localStorage.getItem(WEBHOOK_KEY) || '';
  webhook.addEventListener('change', () => localStorage.setItem(WEBHOOK_KEY, text(webhook.value)));

  panel.querySelector('#mugGenerateButton').addEventListener('click', async () => {
    const button = panel.querySelector('#mugGenerateButton');
    const status = panel.querySelector('#mugAutomationStatus');
    const theme = text(panel.querySelector('#mugTheme').value);
    const phrase = text(panel.querySelector('#mugPhrase').value);
    const hook = text(webhook.value);
    const video = youtubeUrl(panel.querySelector('#mugYoutube').value);
    if (!theme) return void (status.textContent = 'Informe o tema da caneca.');
    if (!hook) return void (status.textContent = 'Cole o webhook do cenário Make.');
    if (panel.querySelector('#mugYoutube').value && !video) return void (status.textContent = 'O vídeo precisa ser uma URL válida do YouTube.');

    localStorage.setItem(WEBHOOK_KEY, hook);
    const requestId = `mug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const compactCode = requestId.replace(/^mug-/, 'CAN-').replace(/-/g, '').slice(0, 20).toUpperCase();
    const subcategory = classifyTheme(theme);
    const automaticName = `Caneca ${titleCase(theme).slice(0, 65)} em Cerâmica 325 ml`;
    const payload = {
      action: 'generate_mug_product',
      request_id: requestId,
      codigo: compactCode,
      tema: theme,
      frase: phrase,
      nome: text(panel.querySelector('#mugName').value) || automaticName,
      categoria: 'Canecas',
      subcategoria: subcategory,
      preco_custo: 10,
      preco: 19.90,
      situacao: 'I',
      material: 'Cerâmica',
      video_youtube: video,
      prompt_photo_1: promptForPhoto({ theme, phrase, angle: 'fotografada de frente com a alça levemente visível' }),
      prompt_photo_2: promptForPhoto({ theme, phrase, angle: 'fotografada em ângulo de 3/4 para mostrar a lateral e a alça' }),
    };

    button.disabled = true;
    status.textContent = 'Gerando duas fotos no Make...';
    try {
      const response = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: JSON.stringify(payload) }),
      });
      if (!response.ok) throw new Error(`Make respondeu HTTP ${response.status}.`);
      const result = await response.json();
      const images = Array.isArray(result.images) ? result.images.map(text).filter(Boolean).slice(0, 3) : [];
      if (images.length < 2) throw new Error('O Make não retornou as duas fotos esperadas.');
      status.textContent = 'Fotos prontas. Cadastrando produto inativo no Firebase...';
      await saveGeneratedProduct(payload, images);
      status.textContent = `${payload.nome} criado como INATIVO · ${subcategory}.`;
      panel.querySelector('#mugTheme').value = '';
      panel.querySelector('#mugPhrase').value = '';
      panel.querySelector('#mugName').value = '';
      panel.querySelector('#mugYoutube').value = '';
      setTimeout(() => document.getElementById('reloadButton')?.click(), 350);
    } catch (error) {
      console.error('Falha ao gerar caneca:', error);
      status.textContent = `Erro: ${error?.message || error}`;
    } finally {
      button.disabled = false;
    }
  });
}

function injectStyle() {
  if (document.getElementById('mugProductsEnhancementStyle')) return;
  const style = document.createElement('style');
  style.id = 'mugProductsEnhancementStyle';
  style.textContent = `
    .mug-automation-panel{margin:0 0 18px;padding:18px;border:1px solid #dadcd6;border-radius:16px;background:#fff;display:grid;gap:16px}
    .mug-auto-title{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.mug-auto-title h2{margin:3px 0 4px;font-size:20px}.mug-auto-title p{margin:0;color:#6d716b}
    .mug-auto-grid,.mug-gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mug-auto-grid label,.mug-gallery-grid label{display:grid;gap:6px;font-weight:700}.mug-auto-grid input,.mug-gallery-grid input{width:100%}
    .mug-auto-footer{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.mug-gallery-fields{border-top:1px solid #e2e3df;padding-top:14px;display:grid;gap:12px}.mug-gallery-head{display:grid;gap:3px}.mug-gallery-head small{color:#747970}
    .mug-gallery-preview{display:grid;grid-template-columns:repeat(3,minmax(80px,140px));gap:10px}.mug-gallery-preview figure{margin:0;border:1px solid #e2e3df;border-radius:10px;padding:7px}.mug-gallery-preview img{width:100%;aspect-ratio:1;object-fit:contain;background:#f5f5f2;border-radius:7px}.mug-gallery-preview figcaption{font-size:11px;margin-top:5px;color:#6c7069}
    @media(max-width:760px){.mug-auto-grid,.mug-gallery-grid{grid-template-columns:1fr}.mug-auto-grid .span-2{grid-column:auto}.mug-gallery-preview{grid-template-columns:repeat(3,1fr)}}`;
  document.head.appendChild(style);
}

installProductMediaPatch();
injectStyle();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installMugPanel, { once: true });
else installMugPanel();
window.addEventListener('admin-v2-route', event => { if (event.detail?.route === 'products') installMugPanel(); });
