import type { CartSnapshot } from '../cart/types.ts';

export type CheckoutStep =
  | 'idle'
  | 'blocked'
  | 'customer'
  | 'address'
  | 'payment'
  | 'review'
  | 'confirmed';

export type PaymentMethod =
  | 'pix'
  | 'cash'
  | 'credit_card'
  | 'meal_card';

export interface CheckoutCustomer {
  name: string;
  phone: string;
}

export interface CheckoutAddress {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
}

export interface CheckoutPayload {
  cart: CartSnapshot;
  customer: CheckoutCustomer;
  address: CheckoutAddress;
  payment: PaymentMethod;
}

export interface CheckoutResult {
  orderId: string;
  environment: 'homologation';
}

export interface CheckoutGateway {
  confirm(payload: CheckoutPayload): Promise<CheckoutResult>;
}

export interface CheckoutSnapshot {
  step: CheckoutStep;
  cart: CartSnapshot;
  customer: CheckoutCustomer | null;
  address: CheckoutAddress | null;
  payment: PaymentMethod | null;
  result: CheckoutResult | null;
}
