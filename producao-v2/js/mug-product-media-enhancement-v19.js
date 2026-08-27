import { ProductsModule } from './modules/products.js';
import { MakeModule } from './modules/make.js';
import { productImage, text } from './core/utils.js';

const BUILD = '20260826-mug-product-media-v19';
const MASTER_WIDTH = 2400;
const MASTER_HEIGHT = 960;
const MAX_PUBLIC_IMAGES = 3;

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  const artUrl = text(product.arte_personalizacao || product.arte_horizontal || product.arte_impressao?.url);
  const block = document.createElement('div');
  block.className = 'span-2 mug-gallery-fields';
  block.dataset.mugGalleryFields = '1';
  block.innerHTML = `
    <div class="mug-gallery-head"><strong>Mídia do produto</strong><small>O site usa até 3 fotos. A arte horizontal 2400×960 fica no cadastro/produção.</small></div>
    <div class="mug-gallery-grid">
      <label>Foto 2<input type="url" data-mug-media-slot="2" placeholder="https://..." value="${escapeAttribute(images[1] || '')}"></label>
      <label>Foto 3 (opcional)<input type="url" data-mug-media-slot="3" placeholder="https://..." value="${escapeAttribute(images[2] || '')}"></label>
      <label class="span-2">Arte horizontal / arquivo de impressão<input type="url" data-mug-art-url placeholder="https://..." value="${escapeAttribute(artUrl)}"></label>
    </div>
    <div class="mug-gallery-preview">
      ${images.map((url, index) => `<figure><img src="${escapeAttribute(url)}" alt="Foto ${index + 1}"><figcaption>Foto ${index + 1}${index === 0 ? ' · capa' : ''}</figcaption></figure>`).join('') || '<small>Nenhuma foto cadastrada.</small>'}
      ${artUrl ? `<figure class="mug-art-preview"><img src="${escapeAttribute(artUrl)}" alt="Arte horizontal"><figcaption>Arte 2400×960 · impressão</figcaption></figure>` : ''}
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
          arte_impressao: {
            ...(product.arte_impressao || {}),
            url: value,
            ratio: `${MASTER_WIDTH}:${MASTER_HEIGHT}`,
            width: MASTER_WIDTH,
            height: MASTER_HEIGHT,
          },
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

function injectStyle() {
  if (document.getElementById('mugProductMediaV19Style')) return;
  const style = document.createElement('style');
  style.id = 'mugProductMediaV19Style';
  style.textContent = `
    .mug-gallery-fields{border-top:1px solid #e2e3df;padding-top:14px;display:grid;gap:12px}
    .mug-gallery-head{display:grid;gap:3px}.mug-gallery-head small{color:#747970}
    .mug-gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .mug-gallery-grid label{display:grid;gap:6px;font-weight:700}.mug-gallery-grid input{width:100%}
    .mug-gallery-preview{display:grid;grid-template-columns:repeat(3,minmax(100px,1fr));gap:10px;margin-top:8px}
    .mug-gallery-preview figure{margin:0;border:1px solid #e2e3df;border-radius:10px;padding:7px}
    .mug-gallery-preview img{width:100%;aspect-ratio:1;object-fit:contain;background:#f5f5f2;border-radius:7px}
    .mug-gallery-preview .mug-art-preview img{aspect-ratio:${MASTER_WIDTH}/${MASTER_HEIGHT}}
    .mug-gallery-preview figcaption{font-size:11px;margin-top:5px;color:#6c7069}
    @media(max-width:760px){.mug-gallery-grid{grid-template-columns:1fr}.mug-gallery-grid .span-2{grid-column:auto}.mug-gallery-preview{grid-template-columns:repeat(2,1fr)}.mug-art-preview{grid-column:1/-1}}
  `;
  document.head.appendChild(style);
}

installProductMediaPatch();
injectStyle();

export { BUILD, installProductMediaPatch, enhanceProductMedia };
