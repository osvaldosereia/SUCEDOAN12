/** Application-to-database transaction contracts; implementations arrive with the API adapter. */
export interface OrderBasketWrite {
  readonly basketSizeId: string;
  readonly basketCodeSnapshot: string;
  readonly basketNameSnapshot: string;
  readonly quantity: number;
  readonly publicUnitPriceCents: number;
  readonly privateAdjustmentCents: number;
  readonly selectedTypes: readonly {
    readonly productTypeId: string;
    readonly typeNameSnapshot: string;
    readonly selectedQuantity: number;
  }[];
}

export interface OrderItemWrite {
  readonly kind: 'BASKET_COMPONENT' | 'EXTRA';
  readonly basketIndex: number | null;
  readonly productId: string;
  readonly productTypeId: string;
  readonly skuSnapshot: string;
  readonly productNameSnapshot: string;
  readonly productTypeNameSnapshot: string;
  readonly quantity: number;
  /** Must be null for basket components; present only for paid extras. */
  readonly unitPriceCents: number | null;
}

export interface CreateOrderTransaction {
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly orderNumber: string;
  readonly customerId: string | null;
  readonly customerNameSnapshot: string;
  /** Canonical Brazilian number: digits only, 10 or 11 digits, no country code. */
  readonly customerPhoneSnapshot: string;
  readonly addressSnapshot: Readonly<Record<string, unknown>>;
  readonly paymentMethod:
    'PIX' | 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'VALE_ALIMENTACAO' | 'VALE_REFEICAO';
  readonly baskets: readonly OrderBasketWrite[];
  readonly items: readonly OrderItemWrite[];
  readonly subtotalCents: number;
  readonly deliveryCents: number;
  readonly totalCents: number;
  readonly stockRequirements: readonly { readonly productId: string; readonly quantity: number }[];
}

export interface OrderPersistenceTransaction {
  /**
   * One database transaction must: replay/validate the idempotency key, lock and check products,
   * reserve stock, persist order + immutable snapshots, then append order event and outbox event.
   * No implementation is connected in R02.
   */
  createOrder(
    input: CreateOrderTransaction,
  ): Promise<{ readonly orderId: string; readonly orderNumber: string }>;
}

export interface OrderCommandTransaction {
  readonly orderId: string;
  readonly commandId: string;
  readonly requestFingerprint: string;
  readonly actorId: string;
  readonly expectedVersion: number;
  readonly command: 'START' | 'MARK' | 'FINISH' | 'DELIVER' | 'CANCEL';
}

export interface OrderCommandPersistence {
  /** Compare version + fingerprint and persist command, state change, audit and outbox atomically. */
  applyOrderCommand(input: OrderCommandTransaction): Promise<{ readonly version: number }>;
}
