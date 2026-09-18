export type CartLineKind = 'basket' | 'product';

export interface CartLineInput {
  kind: CartLineKind;
  refId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  promoUnitPriceCents: number | null;
}

export interface CartLine extends CartLineInput {
  id: string;
}

export interface CartSnapshot {
  lines: CartLine[];
}

export interface CartSummary {
  itemCount: number;
  lineCount: number;
  subtotalCents: number;
  savingsCents: number;
  totalCents: number;
}

export interface CartStore {
  add(input: CartLineInput): CartLine;
  remove(lineId: string): boolean;
  setQuantity(lineId: string, quantity: number): boolean;
  clear(): void;
  getSnapshot(): CartSnapshot;
}
