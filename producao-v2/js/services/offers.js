import { buildOffersPlan } from '../core/offers.js';
import { number, text } from '../core/utils.js';
import { loadProduct, saveProduct } from './firebase.js';

function assertRemote(plan, remote) {
  if (!remote) throw new Error(`${plan.name}: produto não encontrado no Firebase.`);
  if (number(remote.estoque) !== number(plan.source.estoque)
    || text(remote.stock_updated_at) !== text(plan.source.stock_updated_at)
    || text(remote.validade) !== text(plan.source.validade)
    || number(remote.preco) !== number(plan.source.preco)) {
    throw new Error(`${plan.name}: estoque, validade ou preço mudaram após a simulação.`);
  }
}

export async function executeOffersPlan(config, plans, { onProgress = () => {} } = {}) {
  if (!config.writeMode) throw new Error('O modo geral de gravação da V2 está bloqueado.');
  if (!config.offerWriteMode) throw new Error('A aplicação de ofertas automáticas está bloqueada.');
  const actionable = (plans || []).filter(plan => plan.actionable);
  const saved = [];
  const failures = [];
  for (let index = 0; index < actionable.length; index += 1) {
    const plan = actionable[index];
    onProgress({ current: index + 1, total: actionable.length, plan });
    try {
      const remote = await loadProduct(config, plan.key);
      assertRemote(plan, remote);
      const payload = { ...remote };
      const fields = [
        'preco_oferta', 'desconto_validade', 'data_inicio_oferta', 'validade_oferta', 'oferta_origem',
        'situacao', 'bloqueio_validade', 'bloqueio_validade_em', 'situacao_antes_bloqueio_validade',
      ];
      fields.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(plan.nextProduct, field)) payload[field] = plan.nextProduct[field];
        else delete payload[field];
      });
      payload.last_update = Date.now();
      payload.updated_at = new Date().toISOString();
      const result = await saveProduct(config, payload, remote);
      saved.push(result);
    } catch (error) {
      failures.push({ plan, message: error?.message || String(error) });
    }
  }
  return { saved, failures, total: actionable.length, finishedAt: new Date().toISOString() };
}

export function simulateOffers(products, options = {}) {
  return buildOffersPlan(products, options);
}
