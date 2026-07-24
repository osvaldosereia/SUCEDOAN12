import { buildRegistryRenamePlan } from '../core/registries.js';
import { clone, text } from '../core/utils.js';
import { loadProduct, saveProduct } from './firebase.js';

function relevantSnapshot(product, type) {
  if (type === 'tag') return JSON.stringify(Array.isArray(product?.tags) ? product.tags : text(product?.tags));
  const field = { category: 'categoria', subcategory: 'subcategoria', subsubcategory: 'subsubcategoria', brand: 'marca', supplier: 'fornecedor' }[type];
  return text(product?.[field]);
}

export async function executeRegistryRename(config, products, input, { onProgress = () => {} } = {}) {
  if (!config.writeMode) throw new Error('O modo geral de gravação da V2 está bloqueado.');
  if (!config.registryWriteMode) throw new Error('A padronização de cadastros está bloqueada.');
  const plan = buildRegistryRenamePlan(products, input);
  if (plan.errors.length) throw new Error(plan.errors.join(' '));
  const saved = [];
  const failures = [];
  for (let index = 0; index < plan.changes.length; index += 1) {
    const change = plan.changes[index];
    onProgress({ current: index + 1, total: plan.changes.length, change });
    try {
      const remote = await loadProduct(config, change.key);
      if (!remote) throw new Error('Produto não encontrado no Firebase.');
      if (relevantSnapshot(remote, plan.type) !== relevantSnapshot(change.source, plan.type)) {
        throw new Error('O cadastro mudou após a simulação.');
      }
      const payload = clone(remote);
      if (plan.type === 'tag') payload.tags = clone(change.nextProduct.tags);
      else {
        const field = { category: 'categoria', subcategory: 'subcategoria', subsubcategory: 'subsubcategoria', brand: 'marca', supplier: 'fornecedor' }[plan.type];
        payload[field] = change.nextProduct[field];
      }
      payload.last_update = Date.now();
      payload.updated_at = new Date().toISOString();
      saved.push(await saveProduct(config, payload, remote));
    } catch (error) {
      failures.push({ change, message: error?.message || String(error) });
    }
  }
  return { plan, saved, failures, finishedAt: new Date().toISOString() };
}
