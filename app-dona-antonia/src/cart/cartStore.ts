import type {
  CartLine,
  CartLineInput,
  CartSnapshot,
  CartStore,
} from './types.ts';

function cloneLine(line: CartLine): CartLine {
  return { ...line };
}

function normalizeAddQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  const normalized = Math.trunc(quantity);
  return normalized > 0 ? normalized : 1;
}

export function createCartStore(): CartStore {
  let lines: CartLine[] = [];

  return {
    add(input) {
      const id = `${input.kind}:${input.refId}`;
      const quantityToAdd = normalizeAddQuantity(input.quantity);
      const existingIndex = lines.findIndex((line) => line.id === id);

      if (existingIndex >= 0) {
        const existing = lines[existingIndex]!;
        const updated: CartLine = {
          ...existing,
          name: input.name,
          unitPriceCents: input.unitPriceCents,
          promoUnitPriceCents: input.promoUnitPriceCents,
          quantity: existing.quantity + quantityToAdd,
        };
        lines = lines.map((line, index) => index === existingIndex ? updated : line);
        return cloneLine(updated);
      }

      const created: CartLine = {
        ...input,
        id,
        quantity: quantityToAdd,
      };
      lines = [...lines, created];
      return cloneLine(created);
    },

    remove(lineId) {
      const exists = lines.some((line) => line.id === lineId);
      if (!exists) return false;
      lines = lines.filter((line) => line.id !== lineId);
      return true;
    },

    setQuantity(lineId, quantity) {
      if (!Number.isInteger(quantity) || quantity <= 0) return false;

      const index = lines.findIndex((line) => line.id === lineId);
      if (index < 0) return false;

      lines = lines.map((line, currentIndex) =>
        currentIndex === index ? { ...line, quantity } : line
      );
      return true;
    },

    clear() {
      lines = [];
    },

    getSnapshot(): CartSnapshot {
      return {
        lines: lines.map(cloneLine),
      };
    },
  };
}
