import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { ProductsModule } from './modules/products.js';
import { MakeModule } from './modules/make.js';
import { productImage, text } from './core/utils.js';
import { upsertBase64File } from './services/github-binary.js';

const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';
const BUILD = '20260821-canecas-studio-v2';
const MASTER_WIDTH = 2300;
const MASTER_HEIGHT = 1000;
const MAX_PUBLIC_IMAGES = 3;

const STYLE_OPTIONS = [
  ['minimalista', 'Minimalista'], ['moderna', 'Moderna'], ['elegante', 'Elegante'], ['fofa', 'Fofa'],
  ['religiosa', 'Religiosa'], ['divertida', 'Divertida'], ['romantica', 'Romântica'], ['masculina', 'Masculina'],
  ['feminina', 'Feminina'], ['neutra', 'Neutra'], ['infantil', 'Infantil'], ['profissional', 'Profissional'],
  ['vintage', 'Vintage'], ['colorida', 'Colorida'], ['preto_branco', 'Preto e branco'], ['com_nome', 'Com nome'],
  ['com_frase', 'Com frase'], ['com_ilustracao', 'Com ilustração'], ['arte_continua', 'Arte contínua 360°'],
  ['arte_centralizada', 'Arte centralizada'], ['fundo_claro', 'Fundo claro'], ['alto_contraste', 'Alto contraste'],
];

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'caneca';
}

function titleCase(value) {
  return text(value).toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s\-/])([\p{L}\p{N}])/gu, (_, prefix, char) => `${prefix}${char.toLocaleUpperCase('pt-BR')}`);
}

function parseTags(value) {
  return [...new Set(String(value || '').split(/[,;|]/).map(item => text(item)).filter(Boolean))];
}

function youtubeUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'youtu.be' && host !== 'youtube.com' && !host.endsWith('.youtube.com')) return '';
    return raw;
  } catch { return ''; }
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

function uniqueImages(product = {}) {
  const values = [
    product.url_imagem,
    product.imagem_url,
    product.imagem,
    ...(Array.isArray(product.imagens) ? product.imagens : []),
    ...(Array.isArray(product.imagens_site) ? product.imagens_site : []),
  ];
  return [...new Set(values.map(value => text(value)).filter(Boolean))].slice(0, MAX_PUBLIC_IMAGES);
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
  const artUrl = text(product.arte_personalizacao || product.arte_horizontal || product.arte_impressao?.url);
  block.innerHTML = `
    <div class="mug-gallery-head"><strong>Mídia do produto</strong><small>O site usa as fotos da galeria. A arte horizontal fica somente no cadastro/produção.</small></div>
    <div class="mug-gallery-grid">
      <label>Foto 2<input type="url" data-mug-media-slot="2" placeholder="https://..." value="${escapeAttribute(images[1] || '')}"></label>
      <label>Foto 3 (opcional)<input type="url" data-mug-media-slot="3" placeholder="https://..." value="${escapeAttribute(images[2] || '')}"></label>
      <label class="span-2">Arte horizontal / arquivo de impressão<input type="url" data-mug-art-url placeholder="https://..." value="${escapeAttribute(artUrl)}"></label>
    </div>
    <div class="mug-gallery-preview">
      ${images.map((url, index) => `<figure><img src="${escapeAttribute(url)}" alt="Foto ${index + 1}"><figcaption>Foto ${index + 1}${index === 0 ? ' · capa' : ''}</figcaption></figure>`).join('') || '<small>Nenhuma foto cadastrada.</small>'}
      ${artUrl ? `<figure class="mug-art-preview"><img src="${escapeAttribute(artUrl)}" alt="Arte horizontal"><figcaption>Arte 2,3:1 · impressão</figcaption></figure>` : ''}
    </div>`;

  if (primaryLabel) primaryLabel.insertAdjacentElement('afterend', block);
  else content.prepend(block);

  const youtube = content.querySelector('[data-field="video_youtube"]');
  const youtubeLabel = youtube?.closest('label');
  if (youtubeLabel) {
    const firstText = [...youtubeLabel.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (firstText) firstText.nodeValue = 'Vídeo do YouTube (1 vídeo)';
  }
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
    const mediaInput = event.target.closest?.('[data-mug-media-slot]');
    const artInput = event.target.closest?.('[data-mug-art-url]');
    if (mediaInput || artInput) {
      const key = this.store.state.selectedProductKey;
      const product = this.store.getProduct(key);
      if (!key || !product) return;
      if (artInput) {
        const value = text(artInput.value);
        setMediaDirty(this, key, {
          arte_personalizacao: value,
          arte_horizontal: value,
          arte_impressao: { ...(product.arte_impressao || {}), url: value, ratio: '2.3:1', width: MASTER_WIDTH, height: MASTER_HEIGHT },
        });
        return;
      }
      const slot = Math.max(1, Math.min(MAX_PUBLIC_IMAGES, Number(mediaInput.dataset.mugMediaSlot) || 1));
      const images = uniqueImages(product);
      while (images.length < MAX_PUBLIC_IMAGES) images.push('');
      images[slot - 1] = text(mediaInput.value);
      const clean = images.map(value => text(value)).filter(Boolean).slice(0, MAX_PUBLIC_IMAGES);
      const patch = { imagens: clean, imagens_site: clean };
      if (clean[0]) Object.assign(patch, { url_imagem: clean[0], imagem: clean[0], imagem_url: clean[0] });
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
        const next = [primary, ...images].filter(Boolean).slice(0, MAX_PUBLIC_IMAGES);
        setMediaDirty(this, key, { imagens: next, imagens_site: next, imagem: primary, imagem_url: primary });
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
    const images = [primary, ...before.filter(url => url !== primary)].filter(Boolean).slice(0, MAX_PUBLIC_IMAGES);
    if (key && primary) {
      this.store.updateProduct(key, { url_imagem: primary, imagem: primary, imagem_url: primary, imagens, imagens_site: images });
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
        patch.imagens = [primary, ...uniqueImages(product).filter(url => url !== primary)].filter(Boolean).slice(0, MAX_PUBLIC_IMAGES);
        patch.imagens_site = patch.imagens;
      }
      return patch;
    };
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem de referência.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir a imagem retornada pelo Make.'));
    image.src = source;
  });
}

async function normalizedReferenceDataUrl(file) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 1024;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (file) {
    const image = await loadImage(await fileToDataUrl(file));
    const scale = Math.min(1320 / image.naturalWidth, 880 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }
  return canvas.toDataURL('image/webp', 0.92);
}

async function cropMasterArt(sourceUrl) {
  const image = await loadImage(sourceUrl);
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = MASTER_WIDTH / MASTER_HEIGHT;
  let sx = 0; let sy = 0; let sw = image.naturalWidth; let sh = image.naturalHeight;
  if (sourceRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = (image.naturalHeight - sh) / 2;
  }
  const canvas = document.createElement('canvas');
  canvas.width = MASTER_WIDTH;
  canvas.height = MASTER_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, MASTER_WIDTH, MASTER_HEIGHT);
  context.drawImage(image, sx, sy, sw, sh, 0, 0, MASTER_WIDTH, MASTER_HEIGHT);
  return canvas.toDataURL('image/webp', 0.94);
}

function selectedParameters(panel) {
  return Object.fromEntries(STYLE_OPTIONS.map(([key]) => [key, Boolean(panel.querySelector(`[data-mug-param="${key}"]`)?.checked)]));
}

function activeParameterLabels(params) {
  return STYLE_OPTIONS.filter(([key]) => params[key]).map(([, label]) => label);
}

function buildArtPrompt(data) {
  const params = activeParameterLabels(data.parametros);
  const exactText = [data.frase_principal, data.frase_secundaria].filter(Boolean);
  return `CRIE SOMENTE A ARTE PLANA PARA SUBLIMAÇÃO DE CANECA. NÃO desenhe caneca, mockup, mãos, mesa, cenário ou fotografia de produto.\n\nFORMATO E CORTE:\n- Gere uma composição horizontal em 1536x1024.\n- Toda informação essencial (texto, rostos, símbolos e elementos principais) precisa ficar dentro de uma faixa horizontal CENTRAL de proporção 2.3:1.\n- Essa faixa será recortada automaticamente para 2300x1000; portanto mantenha uma margem interna de segurança de pelo menos 8% nas quatro bordas da faixa.\n- As áreas acima e abaixo dessa faixa devem ser visualmente simples/continuáveis e não podem conter texto nem elementos essenciais.\n- A arte deve funcionar como estampa contínua para envolver uma caneca branca de cerâmica.\n\nCONTEÚDO:\nTema: ${data.tema}\nNome do produto/contexto: ${data.nome || 'não informado'}\nFrase principal: ${data.frase_principal || 'sem frase obrigatória'}\nFrase secundária: ${data.frase_secundaria || 'sem frase secundária'}\nDescrição livre do que desejo: ${data.descricao_livre || 'crie uma composição comercialmente atraente e original'}\nPúblico-alvo: ${data.publico_alvo || 'geral'}\nEstilo visual: ${data.estilo_arte || 'livre, coerente com o tema'}\nPaleta: ${data.paleta_cores || 'harmônica e adequada ao tema'}\nTipografia: ${data.tipografia || 'legível e coerente'}\nElementos obrigatórios: ${data.elementos_obrigatorios || 'nenhum além do tema'}\nElementos proibidos: ${data.elementos_proibidos || 'nenhum adicional'}\nParâmetros selecionados: ${params.length ? params.join(', ') : 'nenhum'}\n\n${exactText.length ? `TEXTO OBRIGATÓRIO: reproduza EXATAMENTE, com ortografia, acentos e pontuação: ${exactText.map(value => `“${value}”`).join(' e ')}.` : 'Não inclua texto aleatório.'}\n\nSe houver uma imagem de referência fornecida, use-a como referência visual conforme a descrição, preservando identidade/elementos relevantes quando solicitado, mas adapte a composição ao formato horizontal. Não inclua marcas-d'água, assinaturas ou logotipos não solicitados. Resultado limpo, nítido e pronto para impressão.`;
}

function buildMockupPrompt(data, side) {
  const orientation = side === 1
    ? 'Vista 1: caneca em ângulo de 3/4, alça preferencialmente à direita, mostrando claramente a primeira metade visual da estampa.'
    : 'Vista 2: caneca girada para o lado oposto, alça preferencialmente à esquerda, mostrando claramente a outra metade visual da mesma estampa.';
  return `Use a imagem fornecida como ARTE-MESTRE IMUTÁVEL. Crie UMA fotografia quadrada 1:1 de e-commerce de uma caneca branca de cerâmica 325 ml. ${orientation}\nAplique a arte fornecida na superfície curva da caneca como uma estampa de sublimação contínua, sem redesenhar, trocar textos, inventar símbolos, alterar cores ou substituir elementos da arte. Preserve exatamente a identidade visual e o conteúdo da imagem de origem; apenas faça a deformação/perspectiva necessária para parecer impressa na caneca. Fundo branco puro, iluminação suave de estúdio, caneca inteira visível, sem mãos, sem caixas, sem objetos extras, sem texto fora da caneca, sem logotipo e sem marca-d'água. O resultado deve ser um mockup comercial realista, quadrado 1024x1024. Tema de referência: ${data.tema}.`;
}

async function callMake(hook, payload) {
  const response = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: JSON.stringify(payload) }),
  });
  const rawText = await response.text();
  let result = {};
  try { result = rawText ? JSON.parse(rawText) : {}; }
  catch { throw new Error(`Make respondeu algo que não é JSON (${response.status}).`); }
  if (!response.ok || result.ok === false) throw new Error(result.error || result.message || `Make respondeu HTTP ${response.status}.`);
  return result;
}

async function saveGeneratedProduct(data, urls, referenceUrl) {
  const config = loadConfig();
  const base = text(config.firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
  const node = text(config.productsNode || DEFAULT_CONFIG.productsNode).replace(/^\/+|\/+$/g, '') || 'produtos';
  const now = new Date().toISOString();
  const publicImages = [urls.mockup_1, urls.mockup_2].map(text).filter(Boolean);
  const tags = parseTags(data.tags);
  const product = {
    id: data.request_id,
    firebaseKey: data.request_id,
    codigo: data.codigo,
    nome: data.nome,
    categoria: 'Canecas',
    subcategoria: data.subcategoria,
    subsubcategoria: data.tema,
    preco_custo: 10,
    preco: 19.90,
    estoque: 0,
    situacao: 'I',
    ativo: false,
    material: 'Cerâmica',
    capacidade: '325 ml',
    embalagem: 'Caneca de cerâmica 325 ml',
    unidade: 'UN',
    descricao: data.descricao_produto || `Caneca branca de cerâmica 325 ml com arte temática ${data.tema}. Produto cadastrado automaticamente para revisão antes da publicação.`,
    tags,
    url_imagem: publicImages[0],
    imagem: publicImages[0],
    imagem_url: publicImages[0],
    imagens: publicImages,
    imagens_site: publicImages,
    mockup_1: urls.mockup_1,
    mockup_2: urls.mockup_2,
    arte_personalizacao: urls.arte_horizontal,
    arte_horizontal: urls.arte_horizontal,
    arte_impressao: { url: urls.arte_horizontal, ratio: '2.3:1', width: MASTER_WIDTH, height: MASTER_HEIGHT, formato: 'webp' },
    midias_admin: [urls.mockup_1, urls.mockup_2, urls.arte_horizontal].filter(Boolean),
    video_youtube: data.video_youtube || '',
    origem_cadastro: 'make_canecas_admin_studio_v2',
    tipo_produto: 'caneca_personalizavel',
    tema_caneca: data.tema,
    frase_caneca: data.frase_principal || '',
    frase_secundaria_caneca: data.frase_secundaria || '',
    imagem_referencia: data.has_reference ? referenceUrl : '',
    configuracao_arte: {
      descricao_livre: data.descricao_livre,
      paleta_cores: data.paleta_cores,
      tipografia: data.tipografia,
      estilo_arte: data.estilo_arte,
      publico_alvo: data.publico_alvo,
      elementos_obrigatorios: data.elementos_obrigatorios,
      elementos_proibidos: data.elementos_proibidos,
      parametros: data.parametros,
      gerador: 'openai_via_make',
    },
    criado_em: now,
    updated_at: now,
    last_update: Date.now(),
  };
  const response = await fetch(`${base}/${node}/${encodeURIComponent(data.request_id)}.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(product),
  });
  if (!response.ok) throw new Error(`Firebase não aceitou o novo produto (${response.status}).`);
  return product;
}

function paramMarkup() {
  return STYLE_OPTIONS.map(([key, label]) => `<label class="mug-chip"><input type="checkbox" data-mug-param="${key}"><span>${escapeHtml(label)}</span></label>`).join('');
}

function installMugPanel() {
  if (document.getElementById('mugAutomationPanel')) return;
  const view = document.querySelector('[data-view="products"]');
  if (!view) return;

  const panel = document.createElement('section');
  panel.id = 'mugAutomationPanel';
  panel.className = 'mug-automation-panel';
  panel.innerHTML = `
    <div class="mug-auto-title"><div><span class="eyebrow">Estúdio de Canecas + Make + OpenAI</span><h2>Criar nova caneca com IA</h2><p>1 arte horizontal 2,3:1 → 2 mockups quadrados → cadastro inativo para revisão.</p></div><span class="badge warning">Sempre inativo</span></div>

    <details class="mug-section" open><summary>1. Conteúdo da arte</summary><div class="mug-auto-grid">
      <label>Tema principal<input id="mugTheme" type="text" placeholder="Ex.: São José minimalista" autocomplete="off"></label>
      <label>Nome do produto (opcional)<input id="mugName" type="text" placeholder="Se vazio, será criado automaticamente"></label>
      <label>Frase principal<input id="mugPhrase" type="text" placeholder="Texto exato que deve aparecer"></label>
      <label>Frase secundária<input id="mugPhrase2" type="text" placeholder="Complemento opcional"></label>
      <label class="span-2">Descreva livremente o que você deseja na arte<textarea id="mugDescription" rows="5" placeholder="Ex.: quero uma composição masculina, São José à esquerda, lírios discretos, frase central, sem aparência infantil..."></textarea></label>
      <label>Subcategoria<input id="mugSubcategory" type="text" placeholder="Automática se ficar vazia"></label>
      <label>Tags<input id="mugTags" type="text" placeholder="católica, presente, masculina"></label>
    </div></details>

    <details class="mug-section" open><summary>2. Direção visual</summary><div class="mug-auto-grid">
      <label>Estilo da arte<input id="mugStyle" type="text" placeholder="Ex.: vetorial editorial, aquarela, gravura"></label>
      <label>Paleta de cores<input id="mugPalette" type="text" placeholder="Ex.: azul-marinho, dourado e branco"></label>
      <label>Tipografia<input id="mugTypography" type="text" placeholder="Ex.: serifada elegante + manuscrita discreta"></label>
      <label>Público-alvo<input id="mugAudience" type="text" placeholder="Ex.: homem adulto católico"></label>
      <label>Elementos obrigatórios<input id="mugRequired" type="text" placeholder="Ex.: lírio e São José"></label>
      <label>Elementos proibidos<input id="mugForbidden" type="text" placeholder="Ex.: infantil, excesso de ornamentos"></label>
    </div><div class="mug-chips">${paramMarkup()}</div></details>

    <details class="mug-section" open><summary>3. Referência e mídia</summary><div class="mug-auto-grid">
      <label class="span-2 mug-reference-field">Imagem de referência (opcional)<input id="mugReference" type="file" accept="image/*"><div id="mugReferencePreview" class="mug-reference-preview" hidden><img alt="Referência"><button id="mugClearReference" class="button secondary compact" type="button">Remover referência</button></div><small>A imagem será enviada ao GitHub temporariamente e usada pelo módulo de edição de imagens da OpenAI no Make.</small></label>
      <label class="span-2">Vídeo do YouTube (opcional)<input id="mugYoutube" type="url" placeholder="https://www.youtube.com/watch?v=..."></label>
    </div></details>

    <details class="mug-section" open><summary>4. Integração</summary><div class="mug-auto-grid">
      <label class="span-2">Webhook do cenário Make<input id="mugWebhook" type="url" placeholder="https://hook.eu1.make.com/..."><small>Salvo somente neste navegador.</small></label>
      <label>Qualidade<select id="mugQuality"><option value="medium" selected>Média</option><option value="high">Alta</option><option value="low">Baixa / teste</option></select></label>
      <div class="mug-fixed-values"><strong>Cadastro automático</strong><span>Canecas · Cerâmica · custo R$ 10,00 · venda R$ 19,90 · estoque 0 · Inativo</span></div>
    </div></details>

    <div class="mug-auto-footer"><button id="mugGenerateButton" class="button primary" type="button">Gerar arte + 2 mockups</button><button id="mugResetButton" class="button secondary" type="button">Limpar formulário</button><span id="mugAutomationStatus" class="muted"></span></div>
    <div id="mugResult" class="mug-result" hidden></div>`;

  const anchor = view.querySelector('.filter-bar, [data-products-toolbar], .products-toolbar, .table-shell');
  if (anchor) anchor.insertAdjacentElement('beforebegin', panel);
  else view.prepend(panel);

  const webhook = panel.querySelector('#mugWebhook');
  const referenceInput = panel.querySelector('#mugReference');
  const preview = panel.querySelector('#mugReferencePreview');
  let referenceFile = null;
  webhook.value = localStorage.getItem(WEBHOOK_KEY) || '';
  webhook.addEventListener('change', () => localStorage.setItem(WEBHOOK_KEY, text(webhook.value)));

  referenceInput.addEventListener('change', async () => {
    referenceFile = referenceInput.files?.[0] || null;
    if (!referenceFile) return;
    if (!referenceFile.type.startsWith('image/')) {
      referenceFile = null; referenceInput.value = ''; return;
    }
    preview.querySelector('img').src = await fileToDataUrl(referenceFile);
    preview.hidden = false;
  });
  panel.querySelector('#mugClearReference').addEventListener('click', () => {
    referenceFile = null; referenceInput.value = ''; preview.hidden = true; preview.querySelector('img').removeAttribute('src');
  });

  const reset = () => {
    ['mugTheme','mugName','mugPhrase','mugPhrase2','mugDescription','mugSubcategory','mugTags','mugStyle','mugPalette','mugTypography','mugAudience','mugRequired','mugForbidden','mugYoutube']
      .forEach(id => { const input = panel.querySelector(`#${id}`); if (input) input.value = ''; });
    panel.querySelectorAll('[data-mug-param]').forEach(input => { input.checked = false; });
    referenceFile = null; referenceInput.value = ''; preview.hidden = true; preview.querySelector('img').removeAttribute('src');
    panel.querySelector('#mugResult').hidden = true;
  };
  panel.querySelector('#mugResetButton').addEventListener('click', reset);

  panel.querySelector('#mugGenerateButton').addEventListener('click', async () => {
    const button = panel.querySelector('#mugGenerateButton');
    const status = panel.querySelector('#mugAutomationStatus');
    const hook = text(webhook.value);
    const theme = text(panel.querySelector('#mugTheme').value);
    const rawVideo = text(panel.querySelector('#mugYoutube').value);
    const video = youtubeUrl(rawVideo);
    const config = loadConfig();
    if (!theme) return void (status.textContent = 'Informe o tema principal.');
    if (!hook) return void (status.textContent = 'Cole o webhook do cenário Make.');
    if (rawVideo && !video) return void (status.textContent = 'O vídeo precisa ser uma URL válida do YouTube.');
    if (!config.githubToken) return void (status.textContent = 'Configure o token GitHub no Admin para salvar as imagens.');

    localStorage.setItem(WEBHOOK_KEY, hook);
    const requestId = `mug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const code = requestId.replace(/^mug-/, 'CAN-').replace(/-/g, '').slice(0, 20).toUpperCase();
    const subcategory = text(panel.querySelector('#mugSubcategory').value) || classifyTheme(theme);
    const automaticName = `Caneca ${titleCase(theme).slice(0, 62)} em Cerâmica 325 ml`;
    const data = {
      request_id: requestId,
      codigo: code,
      tema: theme,
      nome: text(panel.querySelector('#mugName').value) || automaticName,
      frase_principal: text(panel.querySelector('#mugPhrase').value),
      frase_secundaria: text(panel.querySelector('#mugPhrase2').value),
      descricao_livre: text(panel.querySelector('#mugDescription').value),
      subcategoria: subcategory,
      tags: text(panel.querySelector('#mugTags').value),
      estilo_arte: text(panel.querySelector('#mugStyle').value),
      paleta_cores: text(panel.querySelector('#mugPalette').value),
      tipografia: text(panel.querySelector('#mugTypography').value),
      publico_alvo: text(panel.querySelector('#mugAudience').value),
      elementos_obrigatorios: text(panel.querySelector('#mugRequired').value),
      elementos_proibidos: text(panel.querySelector('#mugForbidden').value),
      video_youtube: video,
      parametros: selectedParameters(panel),
      quality: panel.querySelector('#mugQuality').value || 'medium',
      has_reference: Boolean(referenceFile),
    };

    button.disabled = true;
    try {
      status.textContent = '1/6 · Preparando imagem de referência...';
      const referenceData = await normalizedReferenceDataUrl(referenceFile);
      const tempBase = `canecas/imagens/referencias/${new Date().toISOString().slice(0, 10)}`;
      const referencePath = `${tempBase}/${requestId}-referencia.webp`;
      const referenceUploaded = await upsertBase64File(config, referencePath, referenceData, `canecas: referência ${requestId}`);

      status.textContent = '2/6 · OpenAI está criando a arte horizontal no Make...';
      const artResult = await callMake(hook, {
        action: 'generate_mug_art', request_id: requestId, reference_image_url: referenceUploaded.url,
        prompt_art: buildArtPrompt(data), quality: data.quality,
      });
      const artSourceUrl = text(artResult.art_source_url || artResult.arte_url || artResult.image_url || artResult.url);
      if (!artSourceUrl) throw new Error('O Make não retornou art_source_url.');

      status.textContent = '3/6 · Recortando arquivo de impressão em 2300×1000...';
      const finalArtData = await cropMasterArt(artSourceUrl);
      const artPath = `canecas/imagens/artes-geradas/${new Date().toISOString().slice(0, 10)}/${requestId}-arte-2300x1000.webp`;
      const artUploaded = await upsertBase64File(config, artPath, finalArtData, `canecas: arte mestre ${requestId}`);

      status.textContent = '4/6 · Gerando mockup do lado 1...';
      const mockup1Result = await callMake(hook, {
        action: 'generate_mug_mockup', request_id: requestId, side: 1, art_url: artUploaded.url,
        prompt_mockup: buildMockupPrompt(data, 1), quality: data.quality,
      });
      const mockup1 = text(mockup1Result.mockup_url || mockup1Result.image_url || mockup1Result.url);
      if (!mockup1) throw new Error('O Make não retornou o mockup do lado 1.');

      status.textContent = '5/6 · Gerando mockup do lado 2...';
      const mockup2Result = await callMake(hook, {
        action: 'generate_mug_mockup', request_id: requestId, side: 2, art_url: artUploaded.url,
        prompt_mockup: buildMockupPrompt(data, 2), quality: data.quality,
      });
      const mockup2 = text(mockup2Result.mockup_url || mockup2Result.image_url || mockup2Result.url);
      if (!mockup2) throw new Error('O Make não retornou o mockup do lado 2.');

      status.textContent = '6/6 · Salvando produto inativo no Firebase...';
      const urls = { arte_horizontal: artUploaded.url, mockup_1: mockup1, mockup_2: mockup2 };
      await saveGeneratedProduct(data, urls, referenceUploaded.url);

      const result = panel.querySelector('#mugResult');
      result.hidden = false;
      result.innerHTML = `<strong>${escapeHtml(data.nome)}</strong><span>cadastrado como INATIVO · ${escapeHtml(subcategory)}</span><div class="mug-result-media"><figure><img src="${escapeAttribute(mockup1)}" alt="Mockup 1"><figcaption>Mockup 1 · site</figcaption></figure><figure><img src="${escapeAttribute(mockup2)}" alt="Mockup 2"><figcaption>Mockup 2 · site</figcaption></figure><figure class="mug-art-preview"><img src="${escapeAttribute(artUploaded.url)}" alt="Arte horizontal"><figcaption>Arte 2300×1000 · produção</figcaption></figure></div>`;
      status.textContent = 'Concluído. Produto salvo como inativo para sua revisão.';
      setTimeout(() => document.getElementById('reloadButton')?.click(), 500);
    } catch (error) {
      console.error('Falha no Estúdio de Canecas:', error);
      status.textContent = `Erro: ${error?.message || error}`;
    } finally { button.disabled = false; }
  });
}

function injectStyle() {
  if (document.getElementById('mugProductsEnhancementStyle')) return;
  const style = document.createElement('style');
  style.id = 'mugProductsEnhancementStyle';
  style.textContent = `
    .mug-automation-panel{margin:0 0 18px;padding:18px;border:1px solid #dadcd6;border-radius:18px;background:#fff;display:grid;gap:14px}.mug-auto-title{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.mug-auto-title h2{margin:3px 0 4px;font-size:21px}.mug-auto-title p{margin:0;color:#6d716b}.mug-section{border:1px solid #ecece7;border-radius:14px;padding:0 14px 14px}.mug-section summary{cursor:pointer;font-weight:800;padding:14px 0}.mug-auto-grid,.mug-gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mug-auto-grid label,.mug-gallery-grid label{display:grid;gap:6px;font-weight:700}.mug-auto-grid input,.mug-auto-grid textarea,.mug-auto-grid select,.mug-gallery-grid input{width:100%}.mug-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.mug-chip{position:relative;cursor:pointer}.mug-chip input{position:absolute;opacity:0;pointer-events:none}.mug-chip span{display:block;padding:8px 11px;border:1px solid #d7d9d3;border-radius:999px;font-size:12px;font-weight:700;background:#fafaf8}.mug-chip input:checked+span{background:#111;color:#fff;border-color:#111}.mug-reference-preview{display:flex;align-items:center;gap:12px;margin-top:8px}.mug-reference-preview img{width:100px;height:100px;object-fit:contain;border:1px solid #ddd;border-radius:10px;background:#fff}.mug-fixed-values{display:grid;align-content:center;gap:4px;padding:10px 12px;border:1px dashed #cfd2ca;border-radius:10px}.mug-fixed-values span{font-size:12px;color:#6b7069}.mug-auto-footer{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.mug-result{border:1px solid #d9ded4;border-radius:14px;padding:14px;display:grid;gap:5px;background:#fbfcfa}.mug-result-media,.mug-gallery-preview{display:grid;grid-template-columns:repeat(3,minmax(100px,1fr));gap:10px;margin-top:8px}.mug-result figure,.mug-gallery-preview figure{margin:0;border:1px solid #e2e3df;border-radius:10px;padding:7px}.mug-result img,.mug-gallery-preview img{width:100%;aspect-ratio:1;object-fit:contain;background:#f5f5f2;border-radius:7px}.mug-result .mug-art-preview img,.mug-gallery-preview .mug-art-preview img{aspect-ratio:2.3/1}.mug-result figcaption,.mug-gallery-preview figcaption{font-size:11px;margin-top:5px;color:#6c7069}.mug-gallery-fields{border-top:1px solid #e2e3df;padding-top:14px;display:grid;gap:12px}.mug-gallery-head{display:grid;gap:3px}.mug-gallery-head small{color:#747970}
    @media(max-width:760px){.mug-auto-grid,.mug-gallery-grid{grid-template-columns:1fr}.mug-auto-grid .span-2,.mug-gallery-grid .span-2{grid-column:auto}.mug-result-media,.mug-gallery-preview{grid-template-columns:repeat(2,1fr)}.mug-art-preview{grid-column:1/-1}}`;
  document.head.appendChild(style);
}

installProductMediaPatch();
injectStyle();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installMugPanel, { once: true });
else installMugPanel();
window.addEventListener('admin-v2-route', event => { if (event.detail?.route === 'products') installMugPanel(); });
