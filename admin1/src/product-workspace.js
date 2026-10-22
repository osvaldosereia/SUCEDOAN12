import { buildAdminProductRecord, findIdentifierConflicts, getProductEditorErrors } from './product-management.js?v=4';

export const PRODUCT_WORKSPACE_KEY = 'dona-antonia.admin1.product-workspace.v1';

export function getProductWorkspaceStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function readProductWorkspace(storage = getProductWorkspaceStorage()) {
  if (!storage) return [];
  try {
    const records = JSON.parse(storage.getItem(PRODUCT_WORKSPACE_KEY) || '[]');
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export function saveProductWorkspaceProduct(input, storage = getProductWorkspaceStorage(), options = {}) {
  if (!storage) throw new Error('O armazenamento local não está disponível neste navegador.');
  const product = buildAdminProductRecord(input, options.now || new Date());
  if (options.statusOnly) {
    if (product.active && product.stock_quantity <= 0) throw new Error('Produto sem estoque não pode ser ativado.');
    if (product.active && !product.image_url) throw new Error('Adicione uma imagem do produto antes de ativar.');
  } else {
    const errors = getProductEditorErrors(product);
    if (errors.length) throw new Error(errors.map(error => error.message).join(' '));
  }

  const localProducts = readProductWorkspace(storage);
  const candidates = [...localProducts, ...(options.catalogProducts || [])];
  if (!options.statusOnly) {
    const conflicts = findIdentifierConflicts(product, candidates.filter(item => String(item.id) !== String(product.id)));
    if (conflicts.length) throw new Error(conflicts.map(issue => issue.label).join(' '));
  }
  const next = [...localProducts.filter(item => String(item.id) !== String(product.id)), product];
  try { storage.setItem(PRODUCT_WORKSPACE_KEY, JSON.stringify(next)); }
  catch { throw new Error('Não consegui salvar localmente. Libere espaço neste navegador e tente novamente.'); }
  return { product, products: next };
}

export function mergeWorkspaceProducts(catalogProducts = [], localProducts = readProductWorkspace()) {
  const localById = new Map(localProducts.map(product => [String(product.id), { ...product, workspace_source: 'local' }]));
  const merged = catalogProducts.map(product => {
    const local = localById.get(String(product.id));
    if (!local) return { ...product, workspace_source: 'catalog' };
    localById.delete(String(product.id));
    return { ...product, ...local, active: local.active === true, is_active: local.active === true, workspace_source: 'local' };
  });
  return [...merged, ...localById.values()];
}

