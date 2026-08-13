import { ProductsModule } from './modules/products.js';
import { MakeModule } from './modules/make.js';
import { loadProduct, saveProduct } from './services/firebase.js';
import { assertMakeProductIdentity, callMake, compactProductForMake } from './services/make.js';
import { rawGithubUrl } from './services/github-binary.js';
import { isActive, productCode, productImage, productKey, productName, text } from './core/utils.js';

const DEFAULT_FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
const CONFIG_KEY = 'da_admin_v2_config';
const originalFetch = globalThis.fetch.bind(globalThis);

function readConfig() {
  try {
    return {
      firebaseUrl: DEFAULT_FIREBASE_URL,
      productsNode: 'produtos',
      writeMode: true,
      githubOwner: 'osvaldosereia',
      githubRepo: 'SUCEDOAN12',
      githubBranch: 'main',
      githubImagesPath: 'site/img/produtos_3',
      ...JSON.parse(globalThis.localStorage?.getItem(CONFIG_KEY) || '{}'),
    };
  } catch {
    return {
      firebaseUrl: DEFAULT_FIREBASE_URL,
      productsNode: 'produtos',
      writeMode: true,
      githubOwner: 'osvaldosereia',
      githubRepo: 'SUCEDOAN12',
      githubBranch: 'main',
      githubImagesPath: 'site/img/produtos_3',
    };
  }
}

function firebaseBase() {
  return text(readConfig().firebaseUrl || DEFAULT_FIREBASE_URL).replace(/\/+$/, '');
}

function productsNode() {
  return text(readConfig().productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
}

function productUrl(key = '') {
  const suffix = key ? `/${encodeURIComponent(key)}` : '';
  return `${firebaseBase()}/${productsNode()}${suffix}.json`;
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url || '';
}

function isAdminIndexRequest(input, init = {}) {
  const method = text(init?.method || input?.method || 'GET').toUpperCase();
  if (method !== 'GET') return false;
  try {
    return new URL(requestUrl(input), globalThis.location?.href).pathname.endsWith('/site/produtos-admin.json');
  } catch {
    return false;
  }
}

// A lista administrativa sempre lê o Firebase. O arquivo estático não participa
// mais do salvamento nem pode recolocar uma versão antiga na tela.
globalThis.fetch = function adminV2FirebaseFirst(input, init = {}) {
  if (isAdminIndexRequest(input, init)) {
    return originalFetch(`${productUrl()}?_admin_v2=${Date.now()}`, { ...init, cache: 'no-store' });
  }
  return originalFetch(input, init);
};

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function canonicalProduct(product, snapshot = null) {
  const next = cloneValue(product || {});
  const active = isActive(next);
  next.situacao = active ? 'A' : 'I';
  next.status = active ? 'A' : 'I';
  next.ativo = active;
  next.visivel = active;

  if (snapshot && isActive(snapshot) !== active) {
    const timestamp = new Date().toISOString();
    next.situacao_manual_override = active ? 'A' : 'I';
    next.situacao_manual_em = timestamp;
    next.situacao_manual_origem = 'admin-oficial';
  }

  return next;
}

function toast(module, message, type = '') {
  module?.onToast?.(message, type);
}

async function saveFromProductsModule(module, product, { silent = false } = {}) {
  const key = productKey(product);
  if (!key) throw new Error('Produto sem chave do Firebase.');
  if (module.store.state.config.writeMode === false) throw new Error('As gravações estão bloqueadas nas configurações.');

  const button = module.elements?.saveProductButton;
  const previousText = button?.textContent || 'Salvar produto';
  if (!silent && button) {
    button.disabled = true;
    button.textContent = 'Salvando…';
  }

  try {
    const snapshot = module.store.state.remoteSnapshots.get(String(key));
    const prepared = canonicalProduct(product, snapshot);
    const saved = await saveProduct(module.store.state.config, prepared, snapshot);
    module.store.markProductSaved(key, saved, { emit: true });
    module.renderDirty();
    return saved;
  } finally {
    if (!silent && button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

function markRowDirty(module, input, key) {
  input.closest('tr')?.classList.add('dirty-row');
  const save = input.closest('tr')?.querySelector('[data-inline-save]');
  if (save) save.disabled = false;
  module.renderDirty();
  const selected = module.store.getProduct(module.store.state.selectedProductKey);
  if (selected) module.renderValidation(selected);
}

function statusSelect(key, active) {
  return `<select class="inline-product-input inline-situacao" data-inline-product="${String(key).replace(/"/g, '&quot;')}" data-inline-field="situacao"><option value="A"${active ? ' selected' : ''}>Ativo</option><option value="I"${active ? '' : ' selected'}>Inativo</option></select>`;
}

function imageVersion(product) {
  return text(product?.imagem_gerada_em || product?.imagem_editada_em || product?.updated_at || product?.last_update || '0');
}

function versionedImage(product) {
  const source = productImage(product);
  if (!source || /^data:image\//i.test(source)) return source;
  const version = encodeURIComponent(imageVersion(product));
  if (/[?&](?:v|admin_image)=/i.test(source)) {
    return source.replace(/([?&](?:v|admin_image)=)[^&]*/i, `$1${version}`);
  }
  return `${source}${source.includes('?') ? '&' : '?'}admin_image=${version}`;
}

function enhanceRows(module) {
  module.elements.productsTableBody.querySelectorAll('tr').forEach(row => {
    const save = row.querySelector('[data-inline-save]');
    if (!save) return;
    const key = text(save.dataset.inlineSave);
    const product = module.store.getProduct(key);
    if (!product) return;

    const statusCell = row.children[5];
    if (statusCell && !statusCell.querySelector('[data-inline-field="situacao"]')) {
      statusCell.innerHTML = statusSelect(key, isActive(product));
    }

    const image = row.querySelector('.product-thumb');
    const freshSource = versionedImage(product);
    if (image && freshSource && image.src !== freshSource) image.src = freshSource;
  });
}

function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'produto';
}

function deepImage(value, depth = 0, visited = new Set()) {
  if (depth > 7 || value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const raw = text(value);
    if (!raw) return '';
    if (/^data:image\//i.test(raw)) return raw;
    if (/^https?:\/\/\S+/i.test(raw) && /\.(?:png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(raw)) return raw;
    if (/^(?:\/)?(?:site|img)\//i.test(raw) && /\.(?:png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(raw)) return raw;
    try {
      const parsed = JSON.parse(raw);
      return deepImage(parsed, depth + 1, visited);
    } catch {
      return '';
    }
  }
  if (typeof value !== 'object' || visited.has(value)) return '';
  visited.add(value);

  const priority = [
    'imagem_principal', 'url_imagem', 'imagem_url', 'image_url', 'download_url',
    'raw_url', 'github_url', 'imagem', 'image', 'url', 'src', 'output_url',
    'generated_image', 'arquivo_url', 'file_url', 'b64_json', 'base64',
  ];
  for (const key of priority) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      if (['b64_json', 'base64'].includes(key) && typeof value[key] === 'string' && text(value[key]).length > 120) {
        return `data:image/png;base64,${text(value[key])}`;
      }
      const found = deepImage(value[key], depth + 1, visited);
      if (found) return found;
    }
  }
  for (const child of Object.values(value)) {
    const found = deepImage(child, depth + 1, visited);
    if (found) return found;
  }
  return '';
}

async function waitForRemoteImage(config, key, beforeImage, beforeVersion) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 650));
    const remote = await loadProduct(config, key).catch(() => null);
    if (!remote) continue;
    const nextImage = productImage(remote);
    const nextVersion = imageVersion(remote);
    if (nextImage && (nextImage !== beforeImage || nextVersion !== beforeVersion)) return remote;
  }
  return null;
}

function makeImagePayload(config, product) {
  const path = `${text(config.githubImagesPath || 'site/img/produtos_3').replace(/\/+$/, '')}/${slug(productCode(product) || productName(product))}-ia.webp`;
  return {
    path,
    payload: {
      acao: 'melhorar_imagem_produto',
      quantidade_imagens: 1,
      produto: compactProductForMake(product),
      storage_destino: 'github',
      substituir_imagens_existentes: true,
      imagem_path: path,
      instrucoes: 'Usar obrigatoriamente a imagem de referência enviada no produto. Gerar exatamente 1 imagem quadrada fiel ao produto, fundo branco puro, sem cenário e sem inventar informações da embalagem.',
    },
  };
}

function installProductsFixes() {
  const prototype = ProductsModule.prototype;
  if (prototype.__adminV2UnifiedSaveInstalled) return;
  prototype.__adminV2UnifiedSaveInstalled = true;

  const originalBind = prototype.bind;
  prototype.bind = function bindUnifiedSave() {
    this.onSave = (product, options = {}) => saveFromProductsModule(this, product, options);
    return originalBind.call(this);
  };

  const originalInline = prototype.handleInlineInput;
  prototype.handleInlineInput = function handleUnifiedInline(event) {
    const input = event.target.closest('[data-inline-product][data-inline-field]');
    if (!input || input.dataset.inlineField !== 'situacao') return originalInline.call(this, event);
    const key = text(input.dataset.inlineProduct);
    const active = input.value !== 'I';
    this.store.updateProduct(key, {
      situacao: active ? 'A' : 'I',
      status: active ? 'A' : 'I',
      ativo: active,
      visivel: active,
    });
    markRowDirty(this, input, key);
  };

  const originalEditorInput = prototype.handleEditorInput;
  prototype.handleEditorInput = function handleUnifiedEditorInput(event) {
    originalEditorInput.call(this, event);
    if (event.target?.dataset?.field !== 'situacao') return;
    const key = text(this.store.state.selectedProductKey);
    const active = event.target.value !== 'I';
    this.store.updateProduct(key, {
      situacao: active ? 'A' : 'I',
      status: active ? 'A' : 'I',
      ativo: active,
      visivel: active,
    });
    const updated = this.store.getProduct(key);
    if (updated) this.renderValidation(updated);
  };

  const originalRenderTable = prototype.renderTable;
  prototype.renderTable = function renderUnifiedTable() {
    originalRenderTable.call(this);
    enhanceRows(this);
  };

  const originalRenderEditor = prototype.renderEditor;
  prototype.renderEditor = function renderUnifiedEditor(product) {
    originalRenderEditor.call(this, product);
    if (this.pendingImages.has(productKey(product))) return;
    const preview = document.getElementById('editorImagePreview');
    const source = versionedImage(product);
    if (preview && source) preview.src = source;
  };

  prototype.renderValidation = function renderSaveAndPublicationValidation(product) {
    const validation = this.productValidation(product);
    const messages = [...validation.errors, ...validation.warnings];
    this.elements.editorValidation.innerHTML = messages.length
      ? `<div class="validation-box warning"><div><strong>O produto pode ser salvo</strong><small>Pendências para publicar no site: ${messages.map(item => String(item).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))).join(' · ')}</small></div></div>`
      : '<div class="validation-box success"><div><strong>Produto pronto</strong><small>Nenhum erro ou aviso encontrado.</small></div></div>';
    this.elements.saveProductButton.disabled = this.store.state.config.writeMode === false;
    this.elements.saveProductButton.title = this.store.state.config.writeMode === false
      ? 'As gravações estão bloqueadas nas configurações.'
      : 'Salva imediatamente no Firebase. A publicação do site é separada.';
  };

  prototype.saveInlineProduct = async function saveUnifiedInline(key, button = null) {
    const product = this.store.getProduct(key);
    if (!product) return;
    if (!this.store.state.dirtyProducts.has(String(key))) return toast(this, 'Esta linha não possui alteração pendente.', 'success');
    const originalText = button?.textContent || 'Salvar';
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Salvando…';
      }
      const saved = await this.onSave(product, { silent: true });
      toast(this, `${productName(saved)} salvo no Firebase.`, 'success');
      this.renderTable();
      this.renderDirty();
    } catch (error) {
      if (button) button.disabled = false;
      toast(this, error?.message || String(error), 'error');
    } finally {
      if (button) button.textContent = originalText;
    }
  };

  prototype.saveCurrent = async function saveUnifiedCurrent() {
    const key = text(this.store.state.selectedProductKey);
    if (!key) return;
    const product = this.store.getProduct(key);
    if (!product) return;
    const hasProductChanges = this.store.state.dirtyProducts.has(key);
    const hasBasketChanges = Boolean(this.basketChangesPending?.());
    if (!hasProductChanges && !hasBasketChanges) return toast(this, 'Este produto não possui alterações pendentes.', 'success');
    try {
      const basketResult = await this.saveProductBasketMemberships?.();
      const saved = hasProductChanges ? await this.onSave(product) : product;
      this.renderEditor(saved);
      this.renderTable();
      const basketMessage = basketResult?.changed
        ? ` e ${basketResult.changed} cesta${basketResult.changed === 1 ? '' : 's'} atualizada${basketResult.changed === 1 ? '' : 's'}`
        : '';
      toast(this, `${productName(saved)} salvo no Firebase${basketMessage}.`, 'success');
    } catch (error) {
      toast(this, error?.message || String(error), 'error');
    }
  };

  prototype.preparePendingImageForAutomation = async function preparePendingImageForAutomation(key) {
    const normalizedKey = text(key);
    if (!this.pendingImages.has(normalizedKey)) return this.store.getProduct(normalizedKey);
    const previousKey = this.store.state.selectedProductKey;
    this.store.state.selectedProductKey = normalizedKey;
    try {
      toast(this, 'Preparando a imagem colada como referência da IA…');
      await this.uploadEditedImage();
      return this.store.getProduct(normalizedKey);
    } finally {
      this.store.state.selectedProductKey = previousKey || normalizedKey;
    }
  };
}

function installMakeImageFix() {
  const prototype = MakeModule.prototype;
  if (prototype.__adminV2ImageFlowInstalled) return;
  prototype.__adminV2ImageFlowInstalled = true;
  const originalRun = prototype.runProductAction;

  prototype.runProductAction = async function runUnifiedProductAction(action, key) {
    if (action !== 'image') return originalRun.call(this, action, key);

    const id = `${key}:${action}`;
    if (this.busy.has(id)) return;
    this.setBusy(key, action, true);
    try {
      await this.productsModule.preparePendingImageForAutomation?.(key);
      let product = this.store.getProduct(key);
      if (!product) throw new Error('Produto não encontrado.');

      const beforeImage = productImage(product);
      const beforeVersion = imageVersion(product);
      const { path, payload } = makeImagePayload(this.config(), product);
      this.onToast(`Make: gerando imagem de ${productName(product)} com a referência atual…`);

      const rawResult = await callMake(this.config(), 'image', payload);
      const result = assertMakeProductIdentity(product, rawResult);
      let patch = {};
      let resultError = null;

      try {
        patch = await this.patchFromResult('image', product, result);
      } catch (error) {
        resultError = error;
        const found = deepImage(rawResult);
        if (found) patch = await this.patchFromResult('image', product, { imagem: found });
      }

      if (!Object.keys(patch).length) {
        const remote = await waitForRemoteImage(this.config(), key, beforeImage, beforeVersion);
        if (remote) {
          this.store.markProductSaved(key, remote, { emit: true });
          this.productsModule.refreshAfterExternalChange(key);
          this.onToast('Imagem gerada pelo Make e carregada do Firebase.', 'success');
          return remote;
        }

        // Alguns cenários gravam exatamente no caminho solicitado e respondem apenas "ok".
        const fallbackUrl = `${rawGithubUrl(this.config(), path)}?v=${Date.now()}`;
        patch = {
          url_imagem: fallbackUrl,
          imagem: fallbackUrl,
          imagem_url: fallbackUrl,
          imagens: [fallbackUrl],
          imagem_path: path,
          imagem_storage: 'github',
          imagem_origem: 'ia_make',
          imagem_status: 'ok',
          imagem_gerada_em: new Date().toISOString(),
        };
        if (resultError) console.warn('Resposta do Make sem URL explícita; usando o caminho solicitado.', resultError);
      }

      this.store.updateProduct(key, patch);
      product = this.store.getProduct(key);
      const saved = await this.productsModule.onSave(product, { silent: true });
      this.productsModule.refreshAfterExternalChange(key);
      this.onToast('Imagem gerada, aplicada e salva no Firebase.', 'success');
      return saved;
    } catch (error) {
      console.error(error);
      this.onToast(error?.message || String(error), 'error');
      throw error;
    } finally {
      this.setBusy(key, action, false);
    }
  };
}

installProductsFixes();
installMakeImageFix();
