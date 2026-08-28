import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { ProductsModule } from './modules/products.js';
import { text } from './core/utils.js';
import { upsertBase64File } from './services/github-binary.js';

const BUILD = '20260828-product-media-general-v2-shorts';
const MAX_IMAGES = 3;

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function productImages(product = {}) {
  const values = [
    product.url_imagem,
    product.imagem_url,
    product.imagem,
    ...(Array.isArray(product.imagens_site) ? product.imagens_site : []),
    ...(Array.isArray(product.imagens) ? product.imagens : []),
  ];
  return [...new Set(values.map(value => text(value)).filter(Boolean))].slice(0, MAX_IMAGES);
}

function isMug(product = {}) {
  const category = text(product.categoria).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return category === 'canecas'
    || /caneca/.test(category)
    || Boolean(text(product.arte_personalizacao || product.arte_horizontal || product.arte_impressao?.url));
}

function safeKey(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `produto-${Date.now()}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível preparar a imagem.'));
    image.src = source;
  });
}

async function squareWebp(file) {
  const image = await loadImage(await fileToDataUrl(file));
  const size = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  const scale = Math.min((size - 60) / image.naturalWidth, (size - 60) / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL('image/webp', 0.9);
}

function setStatus(block, message, type = '') {
  const node = block?.querySelector('[data-product-media-status]');
  if (!node) return;
  node.textContent = message;
  node.dataset.type = type;
}

async function uploadGallerySlot(instance, block, input, slot, file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Selecione uma imagem válida.');
  const config = loadConfig();
  if (!config.githubToken) throw new Error('Configure o token GitHub no Admin antes de enviar imagens.');
  const key = instance.store.state.selectedProductKey;
  const product = instance.store.getProduct(key);
  if (!key || !product) throw new Error('Abra um produto antes de enviar a imagem.');

  setStatus(block, `Enviando Foto ${slot}…`);
  const dataUrl = await squareWebp(file);
  const path = `site/img/produtos-galeria/${safeKey(key)}-foto-${slot}.webp`;
  const uploaded = await upsertBase64File(config, path, dataUrl, `produto: galeria foto ${slot} ${text(product.codigo || key)}`);
  input.value = uploaded.url;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  setStatus(block, `Foto ${slot} adicionada. Salve o produto para confirmar.`);
}

function installSlotUploader(instance, block, input, slot) {
  if (!input || input.dataset.productMediaGeneralized === BUILD) return;
  input.dataset.productMediaGeneralized = BUILD;

  const row = document.createElement('div');
  row.className = 'product-gallery-slot-actions';
  const upload = document.createElement('input');
  upload.type = 'file';
  upload.accept = 'image/*';
  upload.hidden = true;
  upload.dataset.productGalleryUpload = String(slot);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary compact';
  button.textContent = `Enviar Foto ${slot}`;
  row.append(button, upload);
  input.insertAdjacentElement('afterend', row);

  button.addEventListener('click', () => upload.click());
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0];
    if (!file) return;
    button.disabled = true;
    try { await uploadGallerySlot(instance, block, input, slot, file); }
    catch (error) { setStatus(block, error?.message || String(error), 'error'); }
    finally { button.disabled = false; upload.value = ''; }
  });
}

function generalizeEditor(instance, product) {
  const block = instance.elements?.productForm?.querySelector('[data-mug-gallery-fields]');
  if (!block) return;

  const head = block.querySelector('.mug-gallery-head');
  if (head) {
    const strong = head.querySelector('strong');
    const small = head.querySelector('small');
    if (strong) strong.textContent = 'Galeria e mídia do produto';
    if (small) small.textContent = isMug(product)
      ? 'Canecas usam os 2 mockups gerados como galeria; a arte horizontal fica separada para impressão e o vídeo é cadastrado manualmente.'
      : 'Até 3 fotos podem ser cadastradas. A Foto 1 é a capa; produtos simples podem usar somente ela.';
  }

  for (const slot of [2, 3]) {
    const input = block.querySelector(`[data-mug-media-slot="${slot}"]`);
    installSlotUploader(instance, block, input, slot);
  }

  const artInput = block.querySelector('[data-mug-art-url]');
  const artLabel = artInput?.closest('label');
  if (artLabel) artLabel.hidden = !isMug(product);
  const artPreview = block.querySelector('.mug-art-preview');
  if (artPreview && !isMug(product)) artPreview.hidden = true;

  if (!block.querySelector('[data-product-media-status]')) {
    const status = document.createElement('small');
    status.className = 'muted product-media-status';
    status.dataset.productMediaStatus = '1';
    status.textContent = isMug(product)
      ? 'Os mockups podem ser substituídos por fotos reais depois. O site da caneca exibirá somente as duas primeiras vistas.'
      : 'Fotos adicionais também podem ser enviadas diretamente para o GitHub.';
    block.appendChild(status);
  }

  const video = instance.elements?.productForm?.querySelector('[data-field="video_youtube"]');
  const videoLabel = video?.closest('label');
  if (videoLabel) {
    const firstText = [...videoLabel.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (firstText) firstText.nodeValue = 'Vídeo do YouTube / Shorts';
    if (!videoLabel.querySelector('[data-product-video-help]')) {
      const help = document.createElement('small');
      help.dataset.productVideoHelp = '1';
      help.textContent = isMug(product)
        ? 'Opcional. Cole aqui o link do Short que você filmou; o vídeo aparecerá abaixo da arte horizontal na página da caneca.'
        : 'Opcional. Cole uma URL do YouTube para exibir o vídeo na página do produto.';
      videoLabel.appendChild(help);
    }
  }
}

function install() {
  const prototype = ProductsModule.prototype;
  if (prototype.__productMediaGeneralizerBuild === BUILD) return;
  prototype.__productMediaGeneralizerBuild = BUILD;
  const originalRenderEditor = prototype.renderEditor;
  prototype.renderEditor = function renderEditorWithGeneralMedia(product) {
    const result = originalRenderEditor.call(this, product);
    generalizeEditor(this, this.store.getProduct(this.store.state.selectedProductKey) || product || {});
    return result;
  };

  const style = document.createElement('style');
  style.id = 'productMediaGeneralizerStyle';
  style.textContent = '.product-gallery-slot-actions{display:flex;gap:8px;align-items:center;margin-top:6px}.product-media-status[data-type="error"]{color:#a12622}.product-media-status{grid-column:1/-1}';
  document.head.appendChild(style);
}

install();

export { generalizeEditor, productImages };
