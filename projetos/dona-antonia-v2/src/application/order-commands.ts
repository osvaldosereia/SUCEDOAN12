import type { OperationalOrder, OrderState } from '../core/orders';
import { advanceOrder, markSeparated } from '../core/orders';

export class VersionConflict extends Error {
  constructor() {
    super('Pedido atualizado por outro operador. Atualize a tela.');
    this.name = 'VersionConflict';
  }
}
export class InvalidCommand extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCommand';
  }
}
export type OrderCommand =
  | { type: 'START' }
  | { type: 'MARK'; itemId: string; result: 'SEPARADO' | 'FALTOU' }
  | { type: 'FINISH' }
  | { type: 'DELIVER' };
export interface OrderMutation {
  orderId: string;
  commandId: string;
  operatorId: string;
  expectedVersion: number;
  command: OrderCommand;
}
export interface OrderCommandStore {
  /** Atomic: check idempotency + version, apply domain transition, persist + outbox. */
  apply(
    mutation: OrderMutation,
    fingerprint: string,
    change: (order: OperationalOrder) => OperationalOrder,
  ): Promise<OperationalOrder>;
  get(id: string): Promise<OperationalOrder | null>;
  list(state: OrderState, limit: number): Promise<readonly OperationalOrder[]>;
}
function fingerprint(input: OrderMutation): string {
  return JSON.stringify([input.orderId, input.operatorId, input.command]);
}
export function transition(
  order: OperationalOrder,
  command: OrderCommand,
  actor: string,
): OperationalOrder {
  switch (command.type) {
    case 'START':
      if (order.state !== 'NOVO') throw new InvalidCommand('Pedido não está em NOVO');
      return advanceOrder(order, actor);
    case 'MARK':
      return markSeparated(order, command.itemId, command.result);
    case 'FINISH':
      if (order.state !== 'EM_SEPARACAO') throw new InvalidCommand('Pedido não está em separação');
      return advanceOrder(order, actor);
    case 'DELIVER':
      if (order.state !== 'PRONTO') throw new InvalidCommand('Pedido ainda não está pronto');
      return advanceOrder(order, actor);
  }
}
export async function executeOrderCommand(
  store: OrderCommandStore,
  mutation: OrderMutation,
): Promise<OperationalOrder> {
  if (
    !mutation.commandId.trim() ||
    !mutation.operatorId.trim() ||
    !Number.isSafeInteger(mutation.expectedVersion) ||
    mutation.expectedVersion < 1
  ) {
    throw new InvalidCommand('Comando sem identificação ou versão válida');
  }
  return store.apply(mutation, fingerprint(mutation), (old) =>
    transition(old, mutation.command, mutation.operatorId),
  );
}
