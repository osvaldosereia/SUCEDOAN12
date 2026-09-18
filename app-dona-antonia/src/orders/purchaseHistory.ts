import type { SecureSession } from '../customer/secureSession.ts';
import {
  loadVerifiedCustomerProfile,
  type CustomerProfileRepository,
} from '../customer/customerProfile.ts';

export interface PurchaseHistoryItem {
  productId: string;
  name: string;
  quantity: number;
}

export interface PurchaseHistoryOrder {
  id: string;
  customerId: string;
  createdAt: number;
  items: PurchaseHistoryItem[];
}

export interface PurchaseHistoryRepository {
  listByCustomerId(customerId: string): Promise<PurchaseHistoryOrder[]>;
}

function cloneOrder(order: PurchaseHistoryOrder): PurchaseHistoryOrder {
  return {
    ...order,
    items: order.items.map((item) => ({ ...item })),
  };
}

export function createPurchaseHistoryFixtureRepository(
  source: PurchaseHistoryOrder[],
): PurchaseHistoryRepository {
  const orders = source.map(cloneOrder);

  return {
    async listByCustomerId(customerId) {
      if (!customerId.startsWith('TEST-CUSTOMER-')) return [];
      return orders
        .filter((order) => order.customerId === customerId && order.id.startsWith('TEST-HISTORY-'))
        .sort((left, right) => right.createdAt - left.createdAt)
        .map(cloneOrder);
    },
  };
}

export async function loadPurchaseHistory(options: {
  session: SecureSession;
  customerRepository: CustomerProfileRepository;
  historyRepository: PurchaseHistoryRepository;
}): Promise<PurchaseHistoryOrder[]> {
  const profile = await loadVerifiedCustomerProfile(
    options.session,
    options.customerRepository,
  );
  if (!profile) return [];
  return options.historyRepository.listByCustomerId(profile.id);
}
