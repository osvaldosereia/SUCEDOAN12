import type {
  BasketLineSummary,
  BasketSelection,
  BasketSummary,
  BasketLineTemplate,
  BasketTemplate,
  Product,
  ProductType,
} from './model';

const integerQuantity = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0 && value <= 999;

/** Regras de escolha são compartilhadas por cestas e extras, sem dependência de UI. */
export function eligibleOptions(
  type: ProductType,
  products: readonly Product[],
  requiredQuantity = 1,
): Product[] {
  return products
    .filter(
      (product) =>
        type.productSkus.includes(product.sku) &&
        product.active &&
        product.priceCents > 0 &&
        product.stock >= Math.max(1, requiredQuantity),
    )
    .sort((a, b) => a.priceCents - b.priceCents || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Inicializa qualquer conjunto de linhas tipadas. */
export function initialTypeSelections(
  lines: readonly BasketLineTemplate[],
  types: readonly ProductType[],
  products: readonly Product[],
): BasketSelection[] {
  return lines.map((line) => {
    const type = types.find((item) => item.id === line.typeId);
    if (!type) throw new Error('Tipo não cadastrado: ' + line.typeId);
    if (!integerQuantity(line.defaultQuantity)) throw new Error('Quantidade inicial inválida');
    const choices = eligibleOptions(type, products, line.defaultQuantity);
    return {
      typeId: line.typeId,
      sku: choices[0]?.sku ?? null,
      quantity: line.defaultQuantity,
    };
  });
}

export function initialSelections(
  template: BasketTemplate,
  types: readonly ProductType[],
  products: readonly Product[],
): BasketSelection[] {
  return initialTypeSelections(template.lines, types, products);
}

export function setSelectionQuantity(
  selections: readonly BasketSelection[],
  typeId: string,
  quantity: number,
): BasketSelection[] {
  if (!integerQuantity(quantity)) throw new Error('Quantidade inválida');
  if (!selections.some((item) => item.typeId === typeId))
    throw new Error('Tipo não faz parte da seleção');
  return selections.map((item) => (item.typeId === typeId ? { ...item, quantity } : item));
}

export function setSelectionProduct(
  selections: readonly BasketSelection[],
  typeId: string,
  sku: string,
  types: readonly ProductType[],
  products: readonly Product[],
): BasketSelection[] {
  const current = selections.find((item) => item.typeId === typeId);
  const type = types.find((item) => item.id === typeId);
  if (!current || !type) throw new Error('Tipo não faz parte da seleção');
  if (!eligibleOptions(type, products, current.quantity).some((item) => item.sku === sku)) {
    throw new Error('Produto indisponível para este tipo ou quantidade');
  }
  return selections.map((item) => (item.typeId === typeId ? { ...item, sku } : item));
}

export interface TypeSelectionSummary {
  readonly lines: BasketLineSummary[];
  readonly totalCents: number;
  readonly itemCount: number;
  readonly unavailableTypeIds: string[];
}

/** Não elimina linhas indisponíveis: mantém alternativas visíveis para recuperar a escolha. */
export function summarizeTypeSelections(
  definitions: readonly BasketLineTemplate[],
  selections: readonly BasketSelection[],
  types: readonly ProductType[],
  products: readonly Product[],
): TypeSelectionSummary {
  const seen = new Set<string>();
  const lines: BasketLineSummary[] = [...definitions]
    .sort((a, b) => a.order - b.order)
    .map((line) => {
      if (seen.has(line.typeId)) throw new Error('Tipo duplicado na composição: ' + line.typeId);
      seen.add(line.typeId);
      const type = types.find((item) => item.id === line.typeId);
      if (!type) throw new Error('Tipo não cadastrado: ' + line.typeId);
      const selection = selections.find((item) => item.typeId === type.id);
      if (!selection || !integerQuantity(selection.quantity))
        throw new Error('Seleção inválida para ' + type.name);
      const options = eligibleOptions(type, products, selection.quantity);
      const chosen = options.find((item) => item.sku === selection.sku) ?? null;
      const selected = selection.quantity === 0 ? null : chosen;
      return {
        typeId: type.id,
        typeName: type.name,
        options,
        selected,
        quantity: selection.quantity,
        totalCents: selected ? selected.priceCents * selection.quantity : 0,
      };
    });
  return {
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    unavailableTypeIds: lines
      .filter((line) => line.quantity > 0 && !line.selected)
      .map((line) => line.typeId),
  };
}

export function summarizeBasket(
  template: BasketTemplate,
  selections: readonly BasketSelection[],
  types: readonly ProductType[],
  products: readonly Product[],
): BasketSummary {
  return {
    templateId: template.id,
    ...summarizeTypeSelections(template.lines, selections, types, products),
  };
}

export function validateBasketTemplate(
  template: BasketTemplate,
  types: readonly ProductType[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const line of template.lines) {
    if (!types.some((type) => type.id === line.typeId))
      errors.push('Tipo inexistente: ' + line.typeId);
    if (seen.has(line.typeId)) errors.push('Tipo duplicado: ' + line.typeId);
    if (!integerQuantity(line.defaultQuantity)) errors.push('Quantidade inválida: ' + line.typeId);
    seen.add(line.typeId);
  }
  return errors;
}
