import { NfeAdvancedModule } from './modules/nfe-advanced.js?admin_build=20260726-admin-v13-xml-editor-parity';
import { updateNfeItem } from './core/nfe-simulation.js?admin_build=20260726-admin-v13-xml-editor-parity';
import {
  clone, escapeHtml, number, text,
} from './core/utils.js';
import {
  assertMakeProductIdentity, callMake, compactProductForMake, extractMakeTags, unwrapMakeResult,
} from './services/make.js';
import { rawGithubUrl, upsertBase64File } from './services/github-binary.js';

const BUILD = '20260726-admin-v13-xml-editor-parity';
const NEW_BRAND_VALUE = '__nfe_new_brand__';
const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="13">sem imagem</text></svg>')}`;

function unique(values = []) {
  return [...new Set(values.map(value => text(value)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
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
    if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir a imagem. Copie a própria imagem ou escolha um arquivo.'));
    image.src = source;
  });
}

function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'produto';
}

function ensureState(instance) {
  if (!instance.nfeImageZoom) instance.nfeImageZoom = new Map();
  if (!instance.nfeInlineBrandItems) instance.nfeInlineBrandItems = new Set();
}

function itemById(instance, itemId) {
  return instance.analysis?.items?.find(item => item.id === itemId) || null;
}

function applyDraft(instance, itemId, patch, { render = true } = {}) {
  if (!instance.analysis || !itemId) return;
  instance.analysis = updateNfeItem(instance.analysis, itemId, { productDraft: patch }, instance.margin);
  instance.refreshSimulation();
  if (render) instance.renderAnalysis();
}

function registryValues(instance, field, predicate = () => true, current = '') {
  return unique([
    current,
    ...(instance.store?.state?.products || []).filter(predicate).map(product => product?.[field]),
  ]);
}

function selectHtml({ itemId, field, label, current, values, extraOption = '' }) {
  const options = unique([current, ...values]);
  return `<label>${escapeHtml(label)}<select data-nfe-draft-field="${escapeHtml(field)}" data-nfe-item="${escapeHtml(itemId)}"><option value="">Selecione…</option>${options.map(option => `<option value="${escapeHtml(option)}" ${text(current) === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}${extraOption}</select></label>`;
}

function makeButton(instance, itemId, action, label, kind = 'secondary') {
  const busy = instance.aiBusy?.has(`${itemId}:${action}`);
  const anyBusy = [...(instance.aiBusy || [])].some(key => key.startsWith(`${itemId}:`));
  return `<button class="button ${kind} compact${busy ? ' is-running' : ''}" type="button" data-nfe-ai="${escapeHtml(action)}" data-nfe-item="${escapeHtml(itemId)}" ${anyBusy ? 'disabled' : ''}>${busy ? 'Processando…' : escapeHtml(label)}</button>`;
}

function imageSource(draft = {}) {
  return text(draft.url_imagem || draft.imagem_url || draft.imagem);
}

function compactIdentity(item, draft) {
  return item.matchedProduct || {
    firebaseKey: draft.codigo || item.ean || item.id,
    id: draft.codigo || item.ean || item.id,
    codigo: draft.codigo || item.ean || item.id,
    ...draft,
  };
}

if (!NfeAdvancedModule.prototype.__nfeEditorParityInstalled) {
  Object.defineProperty(NfeAdvancedModule.prototype, '__nfeEditorParityInstalled', { value: true });

  const originalBind = NfeAdvancedModule.prototype.bind;
  const originalHandleItemInput = NfeAdvancedModule.prototype.handleItemInput;
  const originalHandleItemChange = NfeAdvancedModule.prototype.handleItemChange;
  const originalHandleItemsClick = NfeAdvancedModule.prototype.handleItemsClick;
  const originalRunAi = NfeAdvancedModule.prototype.runAi;

  NfeAdvancedModule.prototype.bind = function bindWithEditorParity() {
    ensureState(this);
    originalBind.call(this);
    this.elements.nfeItems.addEventListener('paste', event => {
      this.handleNfeImagePaste(event).catch(error => this.onToast(error?.message || String(error), 'error'));
    });
  };

  NfeAdvancedModule.prototype.productEditor = function productEditorParity(item) {
    ensureState(this);
    const draft = item.productDraft || {};
    const currentCategory = text(draft.categoria);
    const currentSubcategory = text(draft.subcategoria);
    const currentSubsubcategory = text(draft.subsubcategoria);
    const currentBrand = text(draft.marca);
    const products = this.store?.state?.products || [];
    const categories = registryValues(this, 'categoria', () => true, currentCategory);
    const subcategories = registryValues(this, 'subcategoria', product => !currentCategory || text(product.categoria) === currentCategory, currentSubcategory);
    const subsubcategories = registryValues(this, 'subsubcategoria', product => (!currentCategory || text(product.categoria) === currentCategory) && (!currentSubcategory || text(product.subcategoria) === currentSubcategory), currentSubsubcategory);
    const catalogBrands = unique(products.map(product => product?.marca));
    const brands = unique([currentBrand, ...catalogBrands]);
    const suppliers = registryValues(this, 'fornecedor', () => true, text(draft.fornecedor));
    const gondolas = registryValues(this, 'gondola', () => true, text(draft.gondola));
    const shelves = registryValues(this, 'prateleira', () => true, text(draft.prateleira));
    const brandExists = !currentBrand || catalogBrands.includes(currentBrand);
    const brandInline = this.nfeInlineBrandItems.has(item.id) || (!brandExists && Boolean(currentBrand));
    const image = imageSource(draft);
    const zoom = this.nfeImageZoom.get(item.id) || 100;
    const field = (name, label, type = 'text', extra = '', full = false) => {
      const value = name === 'tags' && Array.isArray(draft[name]) ? draft[name].join(', ') : draft[name] ?? '';
      return `<label${full ? ' class="span-2"' : ''}>${escapeHtml(label)}<input type="${escapeHtml(type)}" ${type === 'number' ? 'step="0.01" min="0"' : ''} ${extra} value="${escapeHtml(value)}" data-nfe-draft-field="${escapeHtml(name)}" data-nfe-item="${escapeHtml(item.id)}"></label>`;
    };
    const brandField = brandInline
      ? `<label class="nfe-new-brand-field">Nova marca<input value="${escapeHtml(currentBrand)}" data-nfe-draft-field="marca" data-nfe-new-brand-input="1" data-nfe-item="${escapeHtml(item.id)}" placeholder="Digite o nome da nova marca"><small>A marca será cadastrada ao importar o produto.</small><button class="button ghost compact" type="button" data-nfe-use-existing-brand="${escapeHtml(item.id)}">Escolher marca existente</button></label>`
      : selectHtml({
        itemId: item.id,
        field: 'marca',
        label: 'Marca',
        current: currentBrand,
        values: brands,
        extraOption: `<option value="${NEW_BRAND_VALUE}">+ Cadastrar nova marca</option>`,
      });

    return `<section class="nfe-product-editor nfe-product-editor-parity">
      <div class="nfe-product-editor-head"><div><h4>${item.matchedProduct ? 'Editar cadastro do produto' : 'Cadastrar produto novo do XML'}</h4><p>Os mesmos campos e recursos do editor manual estão disponíveis aqui, sem sair da NF-e.</p></div><span class="badge ${item.matchedProduct ? 'info' : 'warning'}">${item.matchedProduct ? 'Produto existente' : 'Produto novo'}</span></div>

      <section class="nfe-editor-block nfe-automation-block">
        <div><strong>Automações do Make</strong><small>As respostas entram nos campos para revisão antes da importação.</small></div>
        <div class="nfe-ai-actions">${makeButton(this, item.id, 'full', 'IA cadastro completo', 'primary')}${makeButton(this, item.id, 'name', 'Melhorar nome')}${makeButton(this, item.id, 'description', 'Gerar descrição')}${makeButton(this, item.id, 'packaging', 'Gerar embalagem')}${makeButton(this, item.id, 'tags', 'Gerar tags')}</div>
      </section>

      <section class="nfe-editor-block"><div class="nfe-editor-block-title"><strong>Essencial</strong><small>Identificação principal do produto.</small></div><div class="nfe-new-grid">
        ${field('nome', 'Nome do produto', 'text', '', true)}
        ${field('codigo', 'Código comercial')}
        ${field('gtin', 'EAN / GTIN', 'text', 'inputmode="numeric"')}
        <label>Situação<select data-nfe-draft-field="situacao" data-nfe-item="${escapeHtml(item.id)}"><option value="A" ${text(draft.situacao).toUpperCase() !== 'I' ? 'selected' : ''}>Ativo</option><option value="I" ${text(draft.situacao).toUpperCase() === 'I' ? 'selected' : ''}>Inativo</option></select></label>
      </div></section>

      <section class="nfe-editor-block"><div class="nfe-editor-block-title"><strong>Preço e oferta</strong><small>O estoque é calculado pela quantidade do XML.</small></div><div class="nfe-new-grid">
        ${field('preco_custo', 'Preço de custo', 'number')}
        ${field('preco', 'Preço de venda', 'number')}
        ${field('preco_oferta', 'Preço de oferta', 'number')}
        ${field('validade_oferta', 'Fim da oferta', 'text', 'inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA"')}
      </div></section>

      <section class="nfe-editor-block"><div class="nfe-editor-block-title"><strong>Classificação</strong><small>Categoria e subcategorias seguem os cadastros já usados no catálogo.</small></div><div class="nfe-new-grid">
        ${selectHtml({ itemId: item.id, field: 'categoria', label: 'Categoria', current: currentCategory, values: categories })}
        ${selectHtml({ itemId: item.id, field: 'subcategoria', label: 'Subcategoria', current: currentSubcategory, values: subcategories })}
        ${selectHtml({ itemId: item.id, field: 'subsubcategoria', label: 'Subsubcategoria', current: currentSubsubcategory, values: subsubcategories })}
        ${brandField}
        ${selectHtml({ itemId: item.id, field: 'fornecedor', label: 'Fornecedor', current: text(draft.fornecedor), values: suppliers })}
        ${field('tags', 'Tags', 'text', '', true)}
      </div></section>

      <section class="nfe-editor-block"><div class="nfe-editor-block-title"><strong>Imagem e conteúdo</strong><small>Clique na oficina e pressione Ctrl+V para colar uma imagem copiada.</small></div>
        <div class="nfe-image-workshop" data-nfe-image-workshop="${escapeHtml(item.id)}" tabindex="0">
          <div class="nfe-image-preview"><img data-nfe-image-preview="${escapeHtml(item.id)}" src="${escapeHtml(image || PLACEHOLDER)}" style="transform:scale(${zoom / 100})" onerror="this.src='${PLACEHOLDER}'" alt="Prévia do produto"><span>Ctrl+V funciona nesta área</span></div>
          <div class="nfe-image-controls">
            <div class="nfe-image-toolbar"><button class="button secondary compact" type="button" data-nfe-image-tool="google" data-nfe-item="${escapeHtml(item.id)}">Pesquisar no Google</button><button class="button secondary compact" type="button" data-nfe-image-tool="paste" data-nfe-item="${escapeHtml(item.id)}">Colar imagem</button><label class="button secondary compact nfe-file-button">Escolher arquivo<input type="file" accept="image/*" data-nfe-image-file="1" data-nfe-item="${escapeHtml(item.id)}" hidden></label><button class="button secondary compact" type="button" data-nfe-image-tool="upload" data-nfe-item="${escapeHtml(item.id)}">Aplicar zoom e enviar</button>${makeButton(this, item.id, 'image', 'IA: gerar imagem', 'primary')}</div>
            <label class="nfe-zoom-control">Zoom <input type="range" min="70" max="220" step="5" value="${zoom}" data-nfe-image-zoom="1" data-nfe-item="${escapeHtml(item.id)}"><span>${zoom}%</span></label>
            <small>Uma imagem colada pode ser usada como referência pela IA. Para importar sem IA, envie-a ao GitHub pelo botão “Aplicar zoom e enviar”.</small>
          </div>
        </div>
        <div class="nfe-new-grid nfe-content-fields">${field('url_imagem', 'URL da imagem', 'url', '', true)}<label class="span-2">Descrição curta<textarea data-nfe-draft-field="descricao_curta" data-nfe-item="${escapeHtml(item.id)}">${escapeHtml(draft.descricao_curta || '')}</textarea></label><label class="span-2">Descrição completa<textarea data-nfe-draft-field="descricao" data-nfe-item="${escapeHtml(item.id)}">${escapeHtml(draft.descricao || '')}</textarea></label></div>
      </section>

      <section class="nfe-editor-block"><div class="nfe-editor-block-title"><strong>Fiscal e logística</strong><small>Complete os dados usados no estoque e na localização física.</small></div><div class="nfe-new-grid">
        ${field('ncm', 'NCM', 'text', 'inputmode="numeric"')}
        ${field('cest', 'CEST', 'text', 'inputmode="numeric"')}
        ${field('embalagem', 'Embalagem')}
        ${selectHtml({ itemId: item.id, field: 'gondola', label: 'Gôndola', current: text(draft.gondola), values: gondolas })}
        ${selectHtml({ itemId: item.id, field: 'prateleira', label: 'Prateleira', current: text(draft.prateleira), values: shelves })}
        ${field('localizacao', 'Localização')}
      </div></section>
    </section>`;
  };

  NfeAdvancedModule.prototype.handleItemInput = function handleItemInputParity(event) {
    ensureState(this);
    const itemId = event.target.dataset.nfeItem;
    if (event.target.matches('[data-nfe-image-zoom]')) {
      const zoom = Math.max(70, Math.min(220, Number(event.target.value) || 100));
      this.nfeImageZoom.set(itemId, zoom);
      const preview = this.elements.nfeItems.querySelector(`[data-nfe-image-preview="${CSS.escape(itemId)}"]`);
      if (preview) preview.style.transform = `scale(${zoom / 100})`;
      const label = event.target.parentElement?.querySelector('span');
      if (label) label.textContent = `${zoom}%`;
      return;
    }
    if (event.target.matches('[data-nfe-new-brand-input]') && itemId) {
      applyDraft(this, itemId, { marca: event.target.value }, { render: false });
      return;
    }
    originalHandleItemInput.call(this, event);
  };

  NfeAdvancedModule.prototype.handleItemChange = function handleItemChangeParity(event) {
    ensureState(this);
    const itemId = event.target.dataset.nfeItem;
    if (event.target.matches('[data-nfe-image-file]')) {
      const file = event.target.files?.[0];
      event.target.value = '';
      this.handleNfeImageFile(file, itemId).catch(error => this.onToast(error?.message || String(error), 'error'));
      return;
    }
    const draftField = event.target.dataset.nfeDraftField;
    if (draftField === 'marca' && event.target.value === NEW_BRAND_VALUE) {
      this.nfeInlineBrandItems.add(itemId);
      applyDraft(this, itemId, { marca: '' });
      return;
    }
    if (draftField === 'categoria' && itemId) {
      const item = itemById(this, itemId);
      const value = event.target.value;
      const allowedSubs = registryValues(this, 'subcategoria', product => text(product.categoria) === value);
      const patch = { categoria: value };
      if (item?.productDraft?.subcategoria && !allowedSubs.includes(text(item.productDraft.subcategoria))) {
        patch.subcategoria = '';
        patch.subsubcategoria = '';
      }
      applyDraft(this, itemId, patch);
      return;
    }
    if (draftField === 'subcategoria' && itemId) {
      const item = itemById(this, itemId);
      const value = event.target.value;
      const category = text(item?.productDraft?.categoria);
      const allowed = registryValues(this, 'subsubcategoria', product => text(product.categoria) === category && text(product.subcategoria) === value);
      const patch = { subcategoria: value };
      if (item?.productDraft?.subsubcategoria && !allowed.includes(text(item.productDraft.subsubcategoria))) patch.subsubcategoria = '';
      applyDraft(this, itemId, patch);
      return;
    }
    originalHandleItemChange.call(this, event);
  };

  NfeAdvancedModule.prototype.handleItemsClick = function handleItemsClickParity(event) {
    ensureState(this);
    const imageTool = event.target.closest('[data-nfe-image-tool]');
    if (imageTool) {
      event.preventDefault();
      const action = imageTool.dataset.nfeImageTool;
      const itemId = imageTool.dataset.nfeItem;
      const task = action === 'google' ? Promise.resolve(this.searchNfeGoogleImage(itemId))
        : action === 'paste' ? this.readNfeClipboardImage(itemId)
          : action === 'upload' ? this.uploadNfeEditedImage(itemId)
            : Promise.resolve();
      task.catch(error => this.onToast(error?.message || String(error), 'error'));
      return;
    }
    const existingBrand = event.target.closest('[data-nfe-use-existing-brand]');
    if (existingBrand) {
      const itemId = existingBrand.dataset.nfeUseExistingBrand;
      this.nfeInlineBrandItems.delete(itemId);
      applyDraft(this, itemId, { marca: '' });
      return;
    }
    originalHandleItemsClick.call(this, event);
  };

  NfeAdvancedModule.prototype.setNfeDraftImage = function setNfeDraftImage(itemId, source, metadata = {}) {
    applyDraft(this, itemId, {
      url_imagem: source,
      imagem: source,
      imagem_url: source,
      imagens: source ? [source] : [],
      ...metadata,
    });
  };

  NfeAdvancedModule.prototype.handleNfeImageFile = async function handleNfeImageFile(file, itemId) {
    if (!file || !itemId) return;
    if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
    const source = await fileToDataUrl(file);
    this.nfeImageZoom.set(itemId, 100);
    this.setNfeDraftImage(itemId, source, {
      imagem_origem: 'arquivo_ou_clipboard_nfe',
      imagem_status: 'referencia_pendente',
    });
    this.onToast('Imagem carregada. Ela já pode ser usada como referência pela IA.', 'success');
  };

  NfeAdvancedModule.prototype.handleNfeImagePaste = async function handleNfeImagePaste(event) {
    const card = event.target.closest?.('[data-nfe-item-card]');
    const workshop = event.target.closest?.('[data-nfe-image-workshop]');
    const itemId = workshop?.dataset.nfeImageWorkshop || card?.dataset.nfeItemCard;
    if (!itemId) return;
    const items = [...(event.clipboardData?.items || [])];
    const imageItem = items.find(item => item.type?.startsWith('image/'));
    if (!imageItem) return;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (file) await this.handleNfeImageFile(file, itemId);
  };

  NfeAdvancedModule.prototype.readNfeClipboardImage = async function readNfeClipboardImage(itemId) {
    if (!navigator.clipboard?.read) throw new Error('Este navegador não permite ler imagens da área de transferência. Clique na oficina e pressione Ctrl+V ou escolha um arquivo.');
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(candidate => candidate.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      await this.handleNfeImageFile(new File([blob], `imagem-colada.${type.split('/')[1] || 'png'}`, { type }), itemId);
      return;
    }
    throw new Error('Nenhuma imagem foi encontrada na área de transferência.');
  };

  NfeAdvancedModule.prototype.searchNfeGoogleImage = function searchNfeGoogleImage(itemId) {
    const item = itemById(this, itemId);
    if (!item) return;
    const draft = item.productDraft || {};
    const query = [draft.nome || item.name, draft.marca, draft.embalagem].filter(Boolean).join(' ');
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
  };

  NfeAdvancedModule.prototype.uploadNfeEditedImage = async function uploadNfeEditedImage(itemId) {
    const item = itemById(this, itemId);
    if (!item) throw new Error('Produto da NF-e não encontrado.');
    if (typeof this.reloadConfig === 'function') this.store.state.config = this.reloadConfig();
    const config = this.store.state.config || {};
    if (!config.writeMode) throw new Error('Ative “Permitir gravações” para enviar a imagem ao GitHub.');
    const draft = clone(item.productDraft || {});
    const source = imageSource(draft);
    if (!source) throw new Error('Escolha ou cole uma imagem primeiro.');
    const image = await loadImage(source);
    const zoom = (this.nfeImageZoom.get(itemId) || 100) / 100;
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 800, 800);
    const contain = Math.min(680 / image.naturalWidth, 680 / image.naturalHeight) * zoom;
    const width = image.naturalWidth * contain;
    const height = image.naturalHeight * contain;
    context.drawImage(image, (800 - width) / 2, (800 - height) / 2, width, height);
    const dataUrl = canvas.toDataURL('image/webp', 0.88);
    const folder = text(config.githubImagesPath || 'site/img/produtos_3').replace(/^\/+|\/+$/g, '');
    const path = `${folder}/${slug(draft.codigo || draft.nome || item.name)}-xml-${Date.now()}.webp`;
    const uploaded = await upsertBase64File(config, path, dataUrl, `Adiciona imagem de ${draft.nome || item.name} pela entrada de NF-e`);
    const url = uploaded.url || rawGithubUrl(config, path);
    this.nfeImageZoom.set(itemId, 100);
    this.setNfeDraftImage(itemId, url, {
      imagem_path: path,
      imagem_storage: 'github',
      imagem_origem: 'editor_nfe',
      imagem_status: 'ok',
      imagem_editada_em: new Date().toISOString(),
      imagem_gerada_em: new Date().toISOString(),
    });
    this.onToast('Imagem ajustada e enviada ao GitHub. Revise o produto antes de importar.', 'success');
  };

  NfeAdvancedModule.prototype.runAi = async function runAiParity(action, itemId) {
    if (['full', 'image'].includes(action)) return originalRunAi.call(this, action, itemId);
    if (!['name', 'description', 'packaging', 'tags'].includes(action)) return originalRunAi.call(this, action, itemId);
    if (!this.analysis || this.busy) return;
    const item = itemById(this, itemId);
    if (!item) throw new Error('Item da NF-e não encontrado.');
    const busyKey = `${itemId}:${action}`;
    if (this.aiBusy.has(busyKey)) return;
    if (typeof this.reloadConfig === 'function') this.store.state.config = this.reloadConfig();
    const config = this.store.state.config || {};
    const draft = clone(item.productDraft || {});
    const identity = compactIdentity(item, draft);
    const actionMap = {
      name: 'melhorar_nome_produto',
      description: 'gerar_descricao_produto',
      packaging: 'gerar_embalagem',
      tags: 'gerar_tag_produto',
    };
    this.aiBusy.add(busyKey);
    this.renderAnalysis();
    try {
      this.onToast(`IA: processando ${draft.nome || item.name}…`);
      const raw = await callMake(config, 'text', {
        acao: actionMap[action],
        origem: 'entrada_nfe_admin_v2',
        dados_nfe: {
          nome_xml: item.name,
          ean: item.ean,
          ncm: item.ncm,
          cest: item.cest,
          embalagem: item.packaging,
          fornecedor: this.analysis.note?.supplier,
          custo_unitario: item.unitCost,
        },
        produto: compactProductForMake({ ...identity, ...draft }),
      });
      const data = unwrapMakeResult(assertMakeProductIdentity(identity, raw));
      const patch = {};
      if (action === 'name') {
        const value = data.nome_sugerido || data.nome || data.name || data.texto;
        if (text(value)) patch.nome = text(value);
      }
      if (action === 'description') {
        const value = data.descricao || data.description || data.texto;
        if (text(value)) patch.descricao = text(value);
        if (text(data.descricao_curta || data.short_description)) patch.descricao_curta = text(data.descricao_curta || data.short_description);
        const tags = extractMakeTags(data);
        if (tags.length) patch.tags = [...new Set([...(Array.isArray(draft.tags) ? draft.tags : []), ...tags].map(text).filter(Boolean))];
      }
      if (action === 'packaging') {
        const value = data.embalagem_sugerida || data.embalagem || data.texto;
        if (text(value)) patch.embalagem = text(value);
      }
      if (action === 'tags') {
        const tags = extractMakeTags(data);
        if (tags.length) patch.tags = [...new Set([...(Array.isArray(draft.tags) ? draft.tags : []), ...tags].map(text).filter(Boolean))];
      }
      if (!Object.keys(patch).length) throw new Error('A IA concluiu, mas não retornou campos utilizáveis.');
      applyDraft(this, itemId, patch, { render: false });
      this.onToast('Resposta da IA aplicada. Revise antes de importar.', 'success');
    } finally {
      this.aiBusy.delete(busyKey);
      this.renderAnalysis();
    }
  };
}

export const NFE_EDITOR_PARITY_BUILD = BUILD;
