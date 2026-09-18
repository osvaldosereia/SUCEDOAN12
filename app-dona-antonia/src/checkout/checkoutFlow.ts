import type { CartSnapshot } from '../cart/types.ts';
import type {
  CheckoutAddress,
  CheckoutCustomer,
  CheckoutGateway,
  CheckoutResult,
  CheckoutSnapshot,
  PaymentMethod,
} from './types.ts';

const PAYMENT_METHODS: PaymentMethod[] = [
  'pix',
  'cash',
  'credit_card',
  'meal_card',
];

function cloneCart(cart: CartSnapshot): CartSnapshot {
  return {
    lines: cart.lines.map((line) => ({ ...line })),
  };
}

function validCustomer(customer: CheckoutCustomer): boolean {
  const phoneDigits = customer.phone.replace(/\D/g, '');
  return customer.name.trim().length >= 2
    && phoneDigits.length >= 10
    && phoneDigits.length <= 11;
}

function validAddress(address: CheckoutAddress): boolean {
  return address.street.trim().length >= 2
    && address.number.trim().length >= 1
    && address.neighborhood.trim().length >= 2
    && address.city.trim().length >= 2
    && address.state.trim().length === 2;
}

export function createCheckoutFlow(gateway: CheckoutGateway) {
  let state: CheckoutSnapshot = {
    step: 'idle',
    cart: { lines: [] },
    customer: null,
    address: null,
    payment: null,
    result: null,
  };

  return {
    start(cart: CartSnapshot): boolean {
      const cloned = cloneCart(cart);
      if (cloned.lines.length === 0) {
        state = {
          step: 'blocked',
          cart: cloned,
          customer: null,
          address: null,
          payment: null,
          result: null,
        };
        return false;
      }

      state = {
        step: 'customer',
        cart: cloned,
        customer: null,
        address: null,
        payment: null,
        result: null,
      };
      return true;
    },

    setCustomer(customer: CheckoutCustomer): boolean {
      if (state.step !== 'customer' || !validCustomer(customer)) return false;
      state = {
        ...state,
        customer: {
          name: customer.name.trim(),
          phone: customer.phone.replace(/\D/g, ''),
        },
        step: 'address',
      };
      return true;
    },

    setAddress(address: CheckoutAddress): boolean {
      if (state.step !== 'address' || !validAddress(address)) return false;
      state = {
        ...state,
        address: {
          street: address.street.trim(),
          number: address.number.trim(),
          neighborhood: address.neighborhood.trim(),
          city: address.city.trim(),
          state: address.state.trim().toUpperCase(),
          reference: address.reference.trim(),
        },
        step: 'payment',
      };
      return true;
    },

    setPayment(payment: PaymentMethod): boolean {
      if (state.step !== 'payment') return false;
      if (!PAYMENT_METHODS.includes(payment)) return false;
      state = {
        ...state,
        payment,
        step: 'review',
      };
      return true;
    },

    async confirm(): Promise<CheckoutResult | null> {
      if (
        state.step !== 'review'
        || !state.customer
        || !state.address
        || !state.payment
        || state.cart.lines.length === 0
      ) {
        return null;
      }

      const result = await gateway.confirm({
        cart: cloneCart(state.cart),
        customer: { ...state.customer },
        address: { ...state.address },
        payment: state.payment,
      });

      state = {
        ...state,
        result: { ...result },
        step: 'confirmed',
      };
      return { ...result };
    },

    getSnapshot(): CheckoutSnapshot {
      return {
        ...state,
        cart: cloneCart(state.cart),
        customer: state.customer ? { ...state.customer } : null,
        address: state.address ? { ...state.address } : null,
        result: state.result ? { ...state.result } : null,
      };
    },
  };
}
