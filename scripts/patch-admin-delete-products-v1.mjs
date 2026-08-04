import fs from 'node:fs';

const files = {
  app: 'producao-v2/js/app.js',
  products: 'producao-v2/js/modules/products.js',
  index: 'producao-v2/index.html',
  css: 'producao-v2/assets/admin.css',
  loader: 'producao-v2/admin-produtivo.html',
};

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}.`);
  return content.replace(before, after);
}

let app = read(files.app);
app = replaceOnce(
  app,
  "import { loadProducts, saveProduct } from './services/firebase.js';",
  "import { archiveProduct, loadProducts, saveProduct } from './services/firebase.js';",
  'Importação do Firebase',
);
app = replaceOnce(
  app,
  "  editorValidation: element('editorValidation'), productForm: element('productForm'), discardProductButton: element('discardProductButton'),\n  saveProductButton: element('saveProductButton'), toastRegion: element('toastRegion'), firebaseUrlSetting: element('firebaseUrlSetting'),",
  "  editorValidation: element('editorValidation'), productForm: element('productForm'), discardProductButton: element('discardProductButton'),\n  deleteProductButton: element('deleteProductButton'), saveProductButton: element('saveProductButton'), toastRegion: element('toastRegion'), firebaseUrlSetting: element('firebaseUrlSetting'),",
  'Elemento do botão de exclusão',
);
const deleteOne = `async function deleteOne(product) {
  const key = text(product?.firebaseKey || product?.id || product?.codigo);
  if (!key) throw new Error('Produto sem chave do Firebase.');
  const name = productName(product);
  const archived = await archiveProduct(store.state.config, key, {
    reason: 'Excluído pelo Admin Produção V2',
    source: 'admin-produtivo-v2',
  });
  store.removeProduct(key);
  invalidateAudit();
  renderStatus();
  renderDashboard();
  return { key, name, archived };
}

`;
app = replaceOnce(
  app,
  'async function uploadProductImage(product, dataUrl) {',
  `${deleteOne}async function uploadProductImage(product, dataUrl) {`,
  'Função de exclusão',
);
app = replaceOnce(
  app,
  '  onSave: saveOne,\n  onToast: toast,',
  '  onSave: saveOne,\n  onDelete: deleteOne,\n  onToast: toast,',
  'Callback de exclusão',
);
write(files.app, app);

let products = read(files.products);
products = replaceOnce(
  products,
  '  constructor({ store, elements, onSave, onToast, onMakeAction, onUploadImage }) {',
  '  constructor({ store, elements, onSave, onDelete, onToast, onMakeAction, onUploadImage }) {',
  'Construtor ProductsModule',
);
products = replaceOnce(
  products,
  '    this.onSave = onSave;\n    this.onToast = onToast;',
  '    this.onSave = onSave;\n    this.onDelete = onDelete;\n    this.onToast = onToast;',
  'Atribuição onDelete',
);
products = replaceOnce(
  products,
  "    this.elements.productsTableBody.addEventListener('click', event => {\n      const saveButton = event.target.closest('[data-inline-save]');",
  "    this.elements.productsTableBody.addEventListener('click', event => {\n      const deleteButton = event.target.closest('[data-delete-product]');\n      if (deleteButton) {\n        this.deleteProduct(deleteButton.dataset.deleteProduct, deleteButton);\n        return;\n      }\n      const saveButton = event.target.closest('[data-inline-save]');",
  'Clique excluir na lista',
);
products = replaceOnce(
  products,
  "    this.elements.discardProductButton.addEventListener('click', () => this.discardCurrent());\n    this.elements.saveProductButton.addEventListener('click', () => this.saveCurrent());",
  "    this.elements.discardProductButton.addEventListener('click', () => this.discardCurrent());\n    this.elements.deleteProductButton?.addEventListener('click', () => this.deleteProduct(this.store.state.selectedProductKey, this.elements.deleteProductButton));\n    this.elements.saveProductButton.addEventListener('click', () => this.saveCurrent());",
  'Clique excluir no editor',
);
products = replaceOnce(
  products,
  '<td><div class="row-actions"><button class="row-action save-inline" type="button" data-inline-save="${escapeHtml(key)}" ${dirty ? \'\' : \'disabled\'}>Salvar</button><button class="row-action" type="button" data-product-key="${escapeHtml(key)}">Corrigir</button></div></td>',
  '<td><div class="row-actions"><button class="row-action save-inline" type="button" data-inline-save="${escapeHtml(key)}" ${dirty ? \'\' : \'disabled\'}>Salvar</button><button class="row-action" type="button" data-product-key="${escapeHtml(key)}">Corrigir</button><button class="row-action danger-action" type="button" data-delete-product="${escapeHtml(key)}" ${this.store.state.config.writeMode ? \'\' : \'disabled\'}>Excluir</button></div></td>',
  'Botão excluir na linha',
);
products = replaceOnce(
  products,
  "    this.elements.saveProductButton.title = validation.errors.length\n      ? 'Corrija os erros antes de salvar.'\n      : !this.store.state.config.writeMode ? 'Ative gravações somente durante testes controlados.' : '';",
  "    this.elements.saveProductButton.title = validation.errors.length\n      ? 'Corrija os erros antes de salvar.'\n      : !this.store.state.config.writeMode ? 'Ative gravações somente durante testes controlados.' : '';\n    if (this.elements.deleteProductButton) {\n      this.elements.deleteProductButton.disabled = !this.store.state.config.writeMode;\n      this.elements.deleteProductButton.title = this.store.state.config.writeMode\n        ? 'Remove o produto do catálogo e guarda uma cópia em produtos_excluidos.'\n        : 'Ative o modo de gravação para excluir produtos.';\n    }",
  'Estado do botão excluir',
);
const deleteMethod = `  async deleteProduct(key, button = null) {
    const normalizedKey = text(key);
    const product = this.store.getProduct(normalizedKey);
    if (!product) return this.onToast('Produto não encontrado na lista atual.', 'error');
    if (!this.store.state.config.writeMode) return this.onToast('Ative o modo de gravação nas configurações antes de excluir.', 'error');

    const name = productName(product);
    const code = productCode(product) || normalizedKey;
    const pending = this.store.state.dirtyProducts.has(normalizedKey)
      ? '\n\nAs alterações ainda não salvas deste produto também serão descartadas.'
      : '';
    const confirmed = confirm(
      `Excluir o produto "\${name}"?\n\nCódigo: \${code}\n\nEle será removido da lista de produtos e guardado em produtos_excluidos para possível recuperação.\${pending}`,
    );
    if (!confirmed) return;
    const typed = prompt('Confirmação final: digite EXCLUIR para continuar.');
    if (text(typed).toUpperCase() !== 'EXCLUIR') {
      this.onToast('Exclusão cancelada. Era necessário digitar EXCLUIR.', 'error');
      return;
    }

    const originalText = button?.textContent || 'Excluir';
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Excluindo...';
      }
      if (!this.onDelete) throw new Error('O serviço de exclusão não foi configurado.');
      await this.onDelete(product);
      this.pendingImages.delete(normalizedKey);
      this.imageZoom.delete(normalizedKey);
      if (this.store.state.selectedProductKey === normalizedKey) this.closeEditor();
      this.populateFilters();
      this.renderTable();
      this.renderDirty();
      this.onToast(`\${name} foi excluído do catálogo e enviado para produtos_excluidos.`, 'success');
    } catch (error) {
      console.error(error);
      this.onToast(error?.message || String(error), 'error');
      if (button?.isConnected) button.disabled = false;
    } finally {
      if (button?.isConnected) button.textContent = originalText;
    }
  }

`;
products = replaceOnce(
  products,
  '  discardCurrent() {',
  `${deleteMethod}  discardCurrent() {`,
  'Método deleteProduct',
);
write(files.products, products);

let index = read(files.index);
index = replaceOnce(
  index,
  '<link rel="stylesheet" href="./assets/admin.css?admin_build=20260727-products-inline-v1">',
  '<link rel="stylesheet" href="./assets/admin.css?admin_build=20260804-delete-products-v1">',
  'Cache do CSS',
);
index = replaceOnce(
  index,
  '<div class="editor-footer"><button class="button secondary" id="discardProductButton" type="button">Descartar alterações</button><button class="button primary" id="saveProductButton" type="button">Salvar produto</button></div>',
  '<div class="editor-footer"><button class="button danger delete-product-button" id="deleteProductButton" type="button">Excluir produto</button><button class="button secondary" id="discardProductButton" type="button">Descartar alterações</button><button class="button primary" id="saveProductButton" type="button">Salvar produto</button></div>',
  'Botão excluir no editor',
);
write(files.index, index);

let css = read(files.css);
const cssBlock = `

/* Exclusão segura de produtos */
.button.danger{
  border-color:#d89b96;
  background:var(--danger-soft);
  color:var(--danger);
}
.button.danger:hover{
  border-color:var(--danger);
  background:#ffe3e0;
  box-shadow:0 5px 14px rgba(166,50,44,.12);
}
.row-actions{flex-wrap:wrap;min-width:210px}
.row-action.danger-action{
  border-color:#e2b7b3;
  background:var(--danger-soft);
  color:var(--danger);
}
.row-action.danger-action:hover{border-color:var(--danger);background:#ffe3e0}
.editor-footer .delete-product-button{margin-right:auto}
@media(max-width:560px){
  .editor-footer{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .editor-footer .delete-product-button{grid-column:1/-1;margin-right:0}
  .editor-footer .button{width:100%}
}
`;
if (!css.includes('/* Exclusão segura de produtos */')) css += cssBlock;
write(files.css, css);

let loader = read(files.loader);
loader = replaceOnce(
  loader,
  'Carregando a versão corrigida da lista de produtos, preço de venda e estoque.',
  'Carregando produtos, preço de venda, estoque e exclusão segura.',
  'Texto do carregador',
);
loader = replaceOnce(
  loader,
  "const BUILD = '20260804-inline-sale-price-v1';",
  "const BUILD = '20260804-delete-products-v1';",
  'Versão do Admin produtivo',
);
loader = replaceOnce(
  loader,
  'Sistema oficial v13.1 · preço de venda editável, produtos, XML, imagens e EANs alternativos confirmados.</strong>',
  'Sistema oficial v13.1 · edição e exclusão segura de produtos, XML, imagens e EANs alternativos.</strong>',
  'Banner do Admin',
);
write(files.loader, loader);

for (const path of [files.app, files.products]) {
  const source = read(path);
  if (!source.includes('deleteProduct') && !source.includes('deleteOne')) throw new Error(`Exclusão ausente em ${path}`);
}
if (!read(files.index).includes('id="deleteProductButton"')) throw new Error('Botão do editor não foi criado.');
if (!read(files.products).includes('data-delete-product')) throw new Error('Botão da lista não foi criado.');
if (!read(files.app).includes('archiveProduct')) throw new Error('archiveProduct não foi conectado.');
console.log('Patch de exclusão segura aplicado com sucesso.');
