import type { CartStore } from '../cart/types.ts';
import type { CatalogRepository } from '../catalog/types.ts';
import type { PurchaseHistoryOrder } from './purchaseHistory.ts';

export interface ReorderAvailableLine {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  promoUnitPriceCents: number | null;
}

export interface ReorderProposal {
  sourceOrderId: string;
  available: ReorderAvailableLine[];
  unavailableProductIds: string[];
  totalCents: number;
}

function currentPrice(normal: number, promo: number | null): number {
  return promo !== null && promo > 0 && promo < normal ? promo : normal;
}

export async function prepareReorder(
  order: PurchaseHistoryOrder,
  catalog: CatalogRepository,
): Promise<ReorderProposal> {
  if (!order.id.startsWith('TEST-HISTORY-')) {
    throw new Error('reorder accepts only synthetic history orders in homologation');
  }

  const available: ReorderAvailableLine[] = [];
  const unavailableProductIds: string[] = [];
  let totalCents = 0;

  for (const historicalItem of order.items) {
    if (!historicalItem.productId.startsWith('TEST-PROD-')) {
      unavailableProductIds.push(historicalItem.productId);
      continue;
    }

    const product = await catalog.getById(historicalItem.productId);
    if (!product || !product.active) {
      unavailableProductIds.push(historicalItem.productId);
      continue;
    }

    const quantity = Math.max(1, Math.trunc(historicalItem.quantity));
    const line: ReorderAvailableLine = {
      productId: product.id,
      name: product.name,
      quantity,
      unitPriceCents: product.priceCents,
      promoUnitPriceCents: product.promoPriceCents,
    };
    available.push(line);
    totalCents += currentPrice(product.priceCents, product.promoPriceCents) * quantity;
  }

  return {
    sourceOrderId: order.id,
    available,
    unavailableProductIds,
    totalCents,
  };
}

export function confirmReorder(
  proposal: ReorderProposal,
  cart: CartStore,
  confirmed: boolean,
): boolean {
  if (!confirmed) return false;

  for (const line of proposal.available) {
    cart.add({
      kind: 'product',
      refId: line.productId,
      name: line.name,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      promoUnitPriceCents: line.promoUnitPriceCents,
    });
  }
  return true;
}
