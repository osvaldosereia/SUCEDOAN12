import { buildStockAdjustment } from '../core/stock.js';
import { number, text } from '../core/utils.js';
import { loadProduct, saveProduct } from './firebase-productive.js?admin_build=20260729-stock-save-v2';

export async function executeStockAdjustment(config, product, input) {
  if (!config.writeMode) throw new Error('O modo geral de gravação da V2 está bloqueado.');
  if (!config.stockWriteMode) throw new Error('Os ajustes de estoque e validade estão bloqueados.');
  const plan = buildStockAdjustment(product, input);
  if (plan.errors.length) throw new Error(plan.errors.join(' '));

  const remote = await loadProduct(config, plan.key);
  if (!remote) throw new Error('O produto não existe mais no Firebase.');

  const originalStock = number(plan.originalSnapshot.estoque);
  const remoteStock = number(remote.estoque);
  if (originalStock !== remoteStock
    || text(plan.originalSnapshot.stock_updated_at) !== text(remote.stock_updated_at)) {
    throw new Error(`O estoque mudou após abrir o ajuste (${originalStock} → ${remoteStock}). Reabra o ajuste para usar o valor mais recente.`);
  }

  // O ajuste parte da versão mais recente do Firebase e modifica somente
  // os campos operacionais de estoque/validade. Alterações paralelas em
  // descrição, imagem, categoria e outros conteúdos são preservadas.
  const payload = {
    ...remote,
    estoque: plan.nextProduct.estoque,
    validade: plan.nextProduct.validade,
    ajustes_estoque: plan.nextProduct.ajustes_estoque,
    updated_at: plan.nextProduct.updated_at,
    last_update: plan.nextProduct.last_update,
  };
  if (plan.nextProduct.stock_updated_at) payload.stock_updated_at = plan.nextProduct.stock_updated_at;

  return saveProduct(config, payload, remote);
}
