import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { escapeHtml, normalizeSearch, productImage, productKey, productName, text } from './core/utils.js';
import {
  archiveProduct, createProduct, loadArchivedProducts, loadProducts, restoreProduct,
} from './services/firebase.js';
import { upsertBase64File } from './services/github-binary.js';

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 7000 : 4000);
}

function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function splitList(value = '') {
  return [...new Set(String(value || '').split(/[,;|\n]/).map(item => item.trim()).filter(Boolean))];
}

async function dispatchCatalogSync(config) {
  if (!config.githubToken || !config.githubOwner || !config.githubRepo) return false;
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.githubToken}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: 'sincronizar_produtos_home', client_payload: { origem: 'admin-v2', solicitado_em: new Date().toISOString() } }),
  });
  return response.ok;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem selecionada.')); };
    image.src = url;
  });
}

async function imageFileToWebp(file) {
  if (!file || !file.size) return '';
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem válido.');
  if (file.size > 20 * 1024 * 1024) throw new Error('A imagem precisa ter no máximo 20 MB.');
  const image = await fileToImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 800;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 800, 800);
  const scale = Math.min(680 / image.naturalWidth, 680 / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (800 - width) / 2, (800 - height) / 2, width, height);
  return canvas.toDataURL('image/webp', 0.88);
}

async function uploadNewProductImage(config, file, { nome, codigo, ean }) {
  const dataUrl = await imageFileToWebp(file);
  if (!dataUrl) return null;
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const folder = text(config.githubImagesPath || DEFAULT_CONFIG.githubImagesPath).replace(/^\/+|\/+$/g, '');
  const filename = `${slug(nome)}-${slug(ean || codigo)}-${Date.now()}.webp`;
  return upsertBase64File(config, `${folder}/admin/${year}/${month}/${filename}`, dataUrl, `Adiciona imagem de ${nome} pelo Admin oficial`);
}

function installStyle() {
  if (document.getElementById('productLifecycleStyle')) return;
  const style = document.createElement('style');
  style.id = 'productLifecycleStyle';
  style.textContent = `
    .lifecycle-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:1200}
    .lifecycle-dialog{position:fixed;z-index:1201;inset:4vh max(18px,calc((100vw - 980px)/2));background:#fff;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden}
    .lifecycle-head,.lifecycle-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 22px;border-bottom:1px solid #e6e7e3}.lifecycle-foot{border-top:1px solid #e6e7e3;border-bottom:0;justify-content:flex-end}
    .lifecycle-head h2{margin:0}.lifecycle-body{padding:20px 22px;overflow:auto}.lifecycle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.lifecycle-grid .wide{grid-column:1/-1}.lifecycle-grid label{display:grid;gap:6px;font-weight:700}.lifecycle-grid input,.lifecycle-grid select,.lifecycle-grid textarea{width:100%;padding:11px;border:1px solid #cfd2ca;border-radius:10px;font:inherit}.lifecycle-grid textarea{min-height:90px;resize:vertical}
    .lifecycle-list{display:grid;gap:10px}.lifecycle-row{display:grid;grid-template-columns:54px 1fr auto;gap:12px;align-items:center;border:1px solid #e2e3df;border-radius:12px;padding:10px}.lifecycle-row img{width:54px;height:54px;object-fit:contain;background:#f3f4f1;border-radius:9px}.lifecycle-row small{display:block;color:#697067}.lifecycle-toolbar{display:flex;gap:10px;align-items:center;margin-bottom:14px}.lifecycle-toolbar input{flex:1;padding:11px;border:1px solid #cfd2ca;border-radius:10px}.archive-product-button{margin-right:auto}.lifecycle-image-preview{display:flex;align-items:center;gap:12px;padding:10px;border:1px dashed #cfd2ca;border-radius:10px}.lifecycle-image-preview img{width:86px;height:86px;object-fit:contain;background:#f3f4f1;border-radius:9px}
    @media(max-width:700px){.lifecycle-dialog{inset:0;border-radius:0}.lifecycle-grid{grid-template-columns:1fr}.lifecycle-grid .wide{grid-column:auto}.lifecycle-row{grid-template-columns:48px 1fr}.lifecycle-row>button{grid-column:1/-1}}
  `;
  document.head.appendChild(style);
}

function dialogShell(title, subtitle = '') {
  const backdrop = document.createElement('div');
  backdrop.className = 'lifecycle-backdrop';
  const dialog = document.createElement('section');
  dialog.className = 'lifecycle-dialog';
  dialog.innerHTML = `<header class="lifecycle-head"><div><span class="eyebrow">Admin oficial</span><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><button class="icon-button" type="button" data-close>×</button></header><div class="lifecycle-body"></div><footer class="lifecycle-foot"></footer>`;
  const close = () => { backdrop.remove(); dialog.remove(); };
  backdrop.addEventListener('click', close);
  dialog.querySelector('[data-close]').addEventListener('click', close);
  document.body.append(backdrop, dialog);
  return { dialog, body: dialog.querySelector('.lifecycle-body'), foot: dialog.querySelector('.lifecycle-foot'), close };
}

function newProductMarkup(products) {
  const values = field => [...new Set(products.map(product => text(product[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const options = field => values(field).map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
  return `<form id="newProductOfficialForm" class="lifecycle-grid">
    <label class="wide">Nome do produto<input name="nome" required autofocus></label>
    <label>Código comercial<input name="codigo" required></label>
    <label>EAN / GTIN<input name="gtin" inputmode="numeric"></label>
    <label>Preço de custo<input name="preco_custo" type="number" min="0" step="0.01"></label>
    <label>Preço de venda<input name="preco" type="number" min="0" step="0.01" required></label>
    <label>Estoque<input name="estoque" type="number" min="0" step="1" value="0"></label>
    <label>Validade<input name="validade" type="date"></label>
    <label>Embalagem<input name="embalagem" required list="lifecyclePackaging"></label>
    <label>Unidade<input name="unidade" value="UN"></label>
    <label>Categoria<input name="categoria" required list="lifecycleCategories"></label>
    <label>Subcategoria<input name="subcategoria" list="lifecycleSubcategories"></label>
    <label>Subsubcategoria<input name="subsubcategoria" list="lifecycleSubsubcategories"></label>
    <label>Marca<input name="marca" list="lifecycleBrands"></label>
    <label>Fornecedor<input name="fornecedor" list="lifecycleSuppliers"></label>
    <label>NCM<input name="ncm" inputmode="numeric"></label>
    <label>CEST<input name="cest" inputmode="numeric"></label>
    <label>Origem tributária<input name="origem_tributaria"></label>
    <label>CFOP padrão<input name="cfop"></label>
    <label>Quantidade por caixa<input name="quantidade_caixa" type="number" min="0" step="1"></label>
    <label>Múltiplo de venda<input name="multiplo_venda" type="number" min="1" step="1" value="1"></label>
    <label>Estoque mínimo<input name="estoque_minimo" type="number" min="0" step="1"></label>
    <label>Peso (kg)<input name="peso" type="number" min="0" step="0.001"></label>
    <label>Gôndola<input name="gondola" list="lifecycleGondolas"></label>
    <label>Prateleira<input name="prateleira" list="lifecycleShelves"></label>
    <label class="wide">Imagem do produto<input name="image_file" type="file" accept="image/*"><small>A imagem será centralizada em fundo branco e enviada como WebP 800 × 800.</small></label>
    <div class="wide lifecycle-image-preview" data-new-image-preview hidden><img alt="Prévia"><span>Prévia da imagem selecionada</span></div>
    <label class="wide">Ou URL da imagem<input name="url_imagem" type="url"></label>
    <label class="wide">Tags<input name="tags" placeholder="Separe por vírgulas"></label>
    <label class="wide">Descrição<textarea name="descricao"></textarea></label>
    <label class="wide">Título SEO<input name="seo_titulo"></label>
    <label class="wide">Descrição SEO<textarea name="seo_descricao"></textarea></label>
    <datalist id="lifecycleCategories">${options('categoria')}</datalist><datalist id="lifecycleSubcategories">${options('subcategoria')}</datalist><datalist id="lifecycleSubsubcategories">${options('subsubcategoria')}</datalist><datalist id="lifecycleBrands">${options('marca')}</datalist><datalist id="lifecycleSuppliers">${options('fornecedor')}</datalist><datalist id="lifecyclePackaging">${options('embalagem')}</datalist><datalist id="lifecycleGondolas">${options('gondola')}</datalist><datalist id="lifecycleShelves">${options('prateleira')}</datalist>
  </form>`;
}

async function openNewProduct() {
  const config = loadConfig();
  if (!config.writeMode) return toast('Ative “Permitir gravações” nas configurações.', 'error');
  const products = await loadProducts(config);
  const view = dialogShell('Novo produto', 'Cadastre diretamente no Firebase; o catálogo público será sincronizado em seguida.');
  view.body.innerHTML = newProductMarkup(products);
  const form = view.body.querySelector('form');
  form.elements.image_file.addEventListener('change', () => {
    const file = form.elements.image_file.files?.[0];
    const preview = view.body.querySelector('[data-new-image-preview]');
    if (!file) { preview.hidden = true; return; }
    const url = URL.createObjectURL(file);
    preview.querySelector('img').src = url;
    preview.hidden = false;
    preview.querySelector('img').addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
  });
  view.foot.innerHTML = '<button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button primary" type="button" data-save>Cadastrar produto</button>';
  view.foot.querySelector('[data-cancel]').addEventListener('click', view.close);
  view.foot.querySelector('[data-save]').addEventListener('click', async event => {
    const button = event.currentTarget;
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const values = Object.fromEntries(formData.entries());
    const imageFile = form.elements.image_file.files?.[0] || null;
    delete values.image_file;
    const codigo = text(values.codigo);
    const ean = String(values.gtin || '').replace(/\D/g, '');
    const duplicate = products.find(product => normalizeSearch(product.codigo) === normalizeSearch(codigo) || (ean && String(product.gtin || product.ean || '').replace(/\D/g, '') === ean));
    if (duplicate) return toast(`Já existe: ${productName(duplicate)} (${duplicate.codigo || productKey(duplicate)}).`, 'error');
    button.disabled = true;
    button.textContent = imageFile ? 'Enviando imagem…' : 'Cadastrando…';
    try {
      const key = String(Date.now());
      const uploaded = imageFile ? await uploadNewProductImage(config, imageFile, { nome: values.nome, codigo, ean }) : null;
      const imageUrl = uploaded?.url || text(values.url_imagem);
      button.textContent = 'Cadastrando…';
      const product = {
        ...values,
        firebaseKey: key,
        id: key,
        codigo,
        gtin: ean,
        ean,
        preco: Number(values.preco || 0),
        preco_custo: Number(values.preco_custo || 0),
        estoque: Math.max(0, Math.floor(Number(values.estoque || 0))),
        quantidade_caixa: Math.max(0, Math.floor(Number(values.quantidade_caixa || 0))),
        multiplo_venda: Math.max(1, Math.floor(Number(values.multiplo_venda || 1))),
        estoque_minimo: Math.max(0, Math.floor(Number(values.estoque_minimo || 0))),
        peso: Math.max(0, Number(values.peso || 0)),
        tags: splitList(values.tags),
        slug: slug(values.nome),
        situacao: 'A',
        origem_cadastro: 'admin-v2-manual',
        ...(imageUrl ? {
          url_imagem: imageUrl,
          imagem: imageUrl,
          imagem_url: imageUrl,
          imagens: [imageUrl],
          ...(uploaded?.path ? { imagem_path: uploaded.path, imagem_storage: 'github', imagem_origem: 'cadastro_novo_admin_v2' } : {}),
        } : {}),
      };
      const saved = await createProduct(config, product, key);
      await dispatchCatalogSync(config).catch(() => false);
      toast(`${productName(saved)} cadastrado com sucesso.`, 'success');
      view.close();
      document.getElementById('reloadButton')?.click();
    } catch (error) {
      toast(error?.message || String(error), 'error');
      button.disabled = false;
      button.textContent = 'Cadastrar produto';
    }
  });
}

async function openTrash() {
  const config = loadConfig();
  const view = dialogShell('Lixeira de produtos', 'Produtos arquivados podem ser restaurados com a mesma chave.');
  view.body.innerHTML = '<p>Carregando produtos arquivados…</p>';
  view.foot.innerHTML = '<button class="button secondary" type="button" data-close-foot>Fechar</button>';
  view.foot.querySelector('[data-close-foot]').addEventListener('click', view.close);
  try {
    const archived = await loadArchivedProducts(config);
    view.body.innerHTML = `<div class="lifecycle-toolbar"><input type="search" placeholder="Buscar na lixeira" data-trash-search><strong>${archived.length} produto(s)</strong></div><div class="lifecycle-list" data-trash-list></div>`;
    const list = view.body.querySelector('[data-trash-list]');
    const render = () => {
      const query = normalizeSearch(view.body.querySelector('[data-trash-search]').value);
      const visible = archived.filter(product => !query || normalizeSearch([productName(product), product.codigo, product.gtin, product.arquivado_motivo].join(' ')).includes(query));
      list.innerHTML = visible.length ? visible.map(product => `<article class="lifecycle-row"><img src="${escapeHtml(productImage(product) || '')}" alt=""><div><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(product.codigo || productKey(product))} · ${escapeHtml(product.arquivado_motivo || 'Sem motivo')}</small></div><button class="button primary compact" type="button" data-restore="${escapeHtml(productKey(product))}">Restaurar</button></article>`).join('') : '<p>Nenhum produto encontrado.</p>';
    };
    view.body.querySelector('[data-trash-search]').addEventListener('input', render);
    list.addEventListener('click', async event => {
      const button = event.target.closest('[data-restore]');
      if (!button) return;
      button.disabled = true;
      try {
        const restored = await restoreProduct(config, button.dataset.restore);
        await dispatchCatalogSync(config).catch(() => false);
        const index = archived.findIndex(item => productKey(item) === button.dataset.restore);
        if (index >= 0) archived.splice(index, 1);
        render();
        toast(`${productName(restored)} restaurado.`, 'success');
        document.getElementById('reloadButton')?.click();
      } catch (error) {
        button.disabled = false;
        toast(error?.message || String(error), 'error');
      }
    });
    render();
  } catch (error) {
    view.body.innerHTML = `<p>${escapeHtml(error?.message || String(error))}</p>`;
  }
}

function start() {
  installStyle();
  const newButton = document.getElementById('newProductButton');
  if (newButton) newButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    openNewProduct().catch(error => toast(error?.message || String(error), 'error'));
  }, true);

  const toolbar = document.querySelector('[data-view="products"] .section-toolbar');
  if (toolbar && !document.getElementById('trashProductsButton')) {
    const button = document.createElement('button');
    button.id = 'trashProductsButton';
    button.className = 'button secondary';
    button.type = 'button';
    button.textContent = 'Lixeira';
    button.addEventListener('click', () => openTrash().catch(error => toast(error?.message || String(error), 'error')));
    toolbar.appendChild(button);
  }

  let currentKey = '';
  document.getElementById('productsTableBody')?.addEventListener('click', event => {
    const button = event.target.closest('[data-product-key]');
    if (button) currentKey = button.dataset.productKey;
  }, true);
  window.addEventListener('admin-v2-open-product', event => { currentKey = text(event.detail?.key); });

  const footer = document.querySelector('#productEditor .editor-footer');
  if (footer && !document.getElementById('archiveProductButton')) {
    const button = document.createElement('button');
    button.id = 'archiveProductButton';
    button.className = 'button ghost archive-product-button';
    button.type = 'button';
    button.textContent = 'Arquivar produto';
    footer.prepend(button);
    button.addEventListener('click', async () => {
      if (!currentKey) return toast('Abra novamente o produto antes de arquivar.', 'error');
      const reason = prompt('Motivo do arquivamento:', 'Produto descontinuado');
      if (reason === null) return;
      if (!confirm('O produto será retirado do Firebase e enviado para a lixeira. Continuar?')) return;
      button.disabled = true;
      try {
        const config = loadConfig();
        const archived = await archiveProduct(config, currentKey, { reason });
        await dispatchCatalogSync(config).catch(() => false);
        toast(`${productName(archived)} enviado para a lixeira.`, 'success');
        document.getElementById('closeEditorButton')?.click();
        document.getElementById('reloadButton')?.click();
      } catch (error) {
        toast(error?.message || String(error), 'error');
      } finally {
        button.disabled = false;
      }
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

export { dispatchCatalogSync };
