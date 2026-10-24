export interface AdminProductType {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly active?: boolean;
  readonly productSkus: readonly string[];
}
export interface AdminBasketSize {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly order: number;
  readonly active: boolean;
  readonly lines: readonly {
    readonly typeId: string;
    readonly defaultQuantity: number;
    readonly order: number;
  }[];
  readonly privateAdjustmentCents: number | null;
  readonly imageUrl?: string | null;
}
export interface AdminExtraGroup {
  readonly typeId: string;
  readonly order: number;
  readonly active: boolean;
}
export interface AdminBasketConfiguration {
  readonly types: readonly AdminProductType[];
  readonly baskets: readonly AdminBasketSize[];
  readonly extras: readonly AdminExtraGroup[];
}

export function normalizeBasketConfiguration(
  input: AdminBasketConfiguration,
): AdminBasketConfiguration {
  const ids = new Set<string>();
  const types = input.types
    .map((type) => {
      const name = type.name.trim();
      if (!type.id || ids.has(type.id)) throw new Error('Há um tipo de produto duplicado.');
      if (!name || name.length > 120) throw new Error('Informe um nome válido para o tipo.');
      ids.add(type.id);
      return {
        ...type,
        name,
        order: Math.max(1, Math.trunc(type.order)),
        active: type.active !== false,
        productSkus: [...new Set(type.productSkus)],
      };
    })
    .sort((a, b) => a.order - b.order);
  const basketIds = new Set<string>();
  const baskets = input.baskets.map((basket) => {
    const name = basket.name.trim();
    if (!basket.id || basketIds.has(basket.id))
      throw new Error('Há um tamanho de cesta duplicado.');
    if (!name || !basket.code.trim()) throw new Error('Informe nome e código do tamanho.');
    basketIds.add(basket.id);
    const lineIds = new Set<string>();
    const lines = basket.lines
      .map((line) => {
        if (!ids.has(line.typeId) || lineIds.has(line.typeId))
          throw new Error('Tipo inválido ou duplicado na composição.');
        if (
          !Number.isSafeInteger(line.defaultQuantity) ||
          line.defaultQuantity < 0 ||
          line.defaultQuantity > 999
        )
          throw new Error('Quantidade deve ser um inteiro entre 0 e 999.');
        lineIds.add(line.typeId);
        return { ...line, order: Math.max(1, Math.trunc(line.order)) };
      })
      .sort((a, b) => a.order - b.order);
    const privateAdjustmentCents = basket.privateAdjustmentCents;
    const imageUrl = basket.imageUrl?.trim() || null;
    if (imageUrl && !/^https:\/\/[^\s]+$/i.test(imageUrl))
      throw new Error('A foto da cesta deve usar um endereço HTTPS válido.');
    if (
      privateAdjustmentCents !== null &&
      (!Number.isSafeInteger(privateAdjustmentCents) ||
        privateAdjustmentCents < 0 ||
        privateAdjustmentCents > 2_000_000_000)
    )
      throw new Error('Valor interno inválido.');
    return { ...basket, name, code: basket.code.trim(), lines, privateAdjustmentCents, imageUrl };
  });
  const extras = input.extras
    .map((group) => {
      if (!ids.has(group.typeId)) throw new Error('Grupo extra aponta para um tipo inexistente.');
      return { ...group, order: Math.max(1, Math.trunc(group.order)) };
    })
    .sort((a, b) => a.order - b.order);
  if (new Set(extras.map((group) => group.typeId)).size !== extras.length)
    throw new Error('Há um grupo extra duplicado.');
  return { types, baskets, extras };
}

export interface AdminBasketConfigurationRepository {
  load(): Promise<AdminBasketConfiguration>;
  save(configuration: AdminBasketConfiguration): Promise<void>;
}
