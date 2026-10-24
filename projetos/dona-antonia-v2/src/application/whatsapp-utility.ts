export type WhatsAppUtilityAccount = '0975' | '1018';
export type WhatsAppUtilityEvent =
  'OrderReceived' | 'OrderSeparating' | 'OrderReady' | 'OrderDelivered';
export type UtilityDeliveryStatus =
  'NA_FILA' | 'ENVIANDO' | 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHA' | 'FALHA_FINAL';

export interface WhatsAppUtilityMessage {
  readonly id: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly providerAccount: WhatsAppUtilityAccount;
  readonly eventType: WhatsAppUtilityEvent;
  readonly templateName: string;
  readonly phone: string;
  readonly deliveryStatus: UtilityDeliveryStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly providerMessageId: string | null;
  readonly lastErrorCode: string | null;
  readonly nextAttemptAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WhatsAppUtilityQuery {
  readonly account: WhatsAppUtilityAccount | null;
  readonly status: UtilityDeliveryStatus | null;
  readonly search: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface WhatsAppUtilityPage {
  readonly items: readonly WhatsAppUtilityMessage[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface RecordUtilityResultInput {
  readonly id: string;
  readonly status: Extract<UtilityDeliveryStatus, 'FALHA' | 'ENVIADA' | 'ENTREGUE' | 'LIDA'>;
  readonly providerMessageId: string | null;
  readonly errorCode: string | null;
}

export interface WhatsAppUtilityRepository {
  list(query: WhatsAppUtilityQuery): Promise<WhatsAppUtilityPage>;
  recordResult(input: RecordUtilityResultInput): Promise<WhatsAppUtilityMessage>;
}

export function utilityEventFromOrderEvent(eventType: string): WhatsAppUtilityEvent | null {
  switch (eventType) {
    case 'OrderCreated':
    case 'OrderReceived':
      return 'OrderReceived';
    case 'OrderStarted':
      return 'OrderSeparating';
    case 'OrderReady':
      return 'OrderReady';
    case 'OrderDelivered':
      return 'OrderDelivered';
    default:
      return null;
  }
}

export function utilityRetryState(
  status: UtilityDeliveryStatus,
  attempts: number,
  maxAttempts: number,
): {
  readonly status: UtilityDeliveryStatus;
  readonly attempts: number;
  readonly retryable: boolean;
} {
  if (status !== 'FALHA') return { status, attempts, retryable: false };
  const nextAttempts = Math.max(0, attempts) + 1;
  return nextAttempts < Math.max(1, maxAttempts)
    ? { status: 'NA_FILA', attempts: nextAttempts, retryable: true }
    : { status: 'FALHA_FINAL', attempts: nextAttempts, retryable: false };
}
