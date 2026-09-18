import type {
  CheckoutGateway,
  CheckoutPayload,
  CheckoutResult,
} from './types.ts';

export interface CheckoutFixtureGatewayOptions {
  idFactory?: () => string;
}

export interface CheckoutFixtureGateway extends CheckoutGateway {
  getConfirmationCount(): number;
  getExternalRequestCount(): number;
  getLastPayload(): CheckoutPayload | null;
}

function clonePayload(payload: CheckoutPayload): CheckoutPayload {
  return {
    cart: {
      lines: payload.cart.lines.map((line) => ({ ...line })),
    },
    customer: { ...payload.customer },
    address: { ...payload.address },
    payment: payload.payment,
  };
}

export function createCheckoutFixtureGateway(
  options: CheckoutFixtureGatewayOptions = {},
): CheckoutFixtureGateway {
  let sequence = 0;
  let confirmations = 0;
  let lastPayload: CheckoutPayload | null = null;
  const idFactory = options.idFactory
    ?? (() => `TEST-ORDER-${String(++sequence).padStart(4, '0')}`);

  return {
    async confirm(payload): Promise<CheckoutResult> {
      confirmations += 1;
      lastPayload = clonePayload(payload);

      const orderId = idFactory();
      if (!orderId.startsWith('TEST-')) {
        throw new Error('Fixture checkout must return TEST-* order id');
      }

      return {
        orderId,
        environment: 'homologation',
      };
    },

    getConfirmationCount() {
      return confirmations;
    },

    getExternalRequestCount() {
      return 0;
    },

    getLastPayload() {
      return lastPayload ? clonePayload(lastPayload) : null;
    },
  };
}
