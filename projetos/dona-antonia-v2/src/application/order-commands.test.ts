import { describe, expect, it } from 'vitest';
import { DEMO_ORDERS } from '../data/demo-orders';
import { MemoryOrderStore } from './testing/memory-order-store';
import { executeOrderCommand, VersionConflict } from './order-commands';
const mutation = (type: 'START' | 'FINISH' | 'DELIVER', version = 1, commandId = type) => ({
  orderId: 'demo-0',
  commandId,
  operatorId: 'separador-123',
  expectedVersion: version,
  command: { type } as const,
});
describe('Persistência futura - comandos de pedido', () => {
  it('bloqueia corrida entre operadores e mantém número do pedido', async () => {
    const store = new MemoryOrderStore(DEMO_ORDERS);
    const before = await store.get('demo-0');
    expect(before).not.toBeNull();
    const next = await executeOrderCommand(store, mutation('START'));
    expect(next.state).toBe('EM_SEPARACAO');
    expect(next.assignedTo).toBe('separador-123');
    expect(next.number).toBe(before!.number);
    await expect(
      executeOrderCommand(store, {
        ...mutation('START'),
        commandId: 'outra-tentativa',
        operatorId: 'separador-456',
      }),
    ).rejects.toBeInstanceOf(VersionConflict);
  });
  it('idempotência retorna mesmo resultado sem disparar novos eventos', async () => {
    const store = new MemoryOrderStore(DEMO_ORDERS);
    const first = await executeOrderCommand(store, mutation('START'));
    const second = await executeOrderCommand(store, mutation('START'));
    expect(second).toEqual(first);
    expect(store.outbox).toHaveLength(1);
    await expect(
      executeOrderCommand(store, { ...mutation('START'), operatorId: 'outro' }),
    ).rejects.toThrow(/idempotência/);
  });
  it('não pula estado e exige separação concluída antes de PRONTO', async () => {
    const store = new MemoryOrderStore(DEMO_ORDERS);
    await executeOrderCommand(store, mutation('START'));
    await expect(executeOrderCommand(store, mutation('DELIVER', 2))).rejects.toThrow(/pronto/);
    await expect(executeOrderCommand(store, mutation('FINISH', 2))).rejects.toThrow(
      /Marque cada item/,
    );
    const current = (await store.get('demo-0'))!;
    let version = current.version;
    for (const line of current.items) {
      await executeOrderCommand(store, {
        orderId: current.id,
        commandId: 'mark-' + line.id,
        operatorId: 'separador-123',
        expectedVersion: version++,
        command: { type: 'MARK', itemId: line.id, result: 'SEPARADO' },
      });
    }
    const ready = await executeOrderCommand(store, mutation('FINISH', version));
    expect(ready.state).toBe('PRONTO');
    expect(store.outbox).toHaveLength(2);
  });
  it('recusa comando sem operador', async () => {
    const store = new MemoryOrderStore(DEMO_ORDERS);
    await expect(
      executeOrderCommand(store, { ...mutation('START'), operatorId: '' }),
    ).rejects.toThrow(/identificação/);
  });
});
