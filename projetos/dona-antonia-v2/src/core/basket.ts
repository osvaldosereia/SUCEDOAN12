import type {
  BasketLineSummary, BasketSelection, BasketSummary,
  BasketTemplate, Product, ProductType
} from './model';

const integerQuantity = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0 && value <= 999;

export function eligibleOptions(
  type: ProductType,
  products: readonly Product[],
  requiredQuantity = 1
): Product[] {
  return products
    .filter((product) =>
      type.productSkus.includes(product.sku) &&
      product.active &&
      product.priceCents > 0 &&
      product.stock >= Math.max(1, requiredQuantity)
    )
    .sort((a, b) => a.priceCents - b.priceCents || a.name.localeCompare(b.name, 'pt-BR'));
}

export function initialSelections(
  template: BasketTemplate,
  types: readonly ProductType[],
  products: readonly Product[]
): BasketSelection[] {
  return template.lines.map((line) => {
    const type = types.find((item) => item.id === line.typeId);
    if (!type) throw new Error('Tipo não cadastrado: ' + line.typeId);
    const choices = eligibleOptions(type, products, line.defaultQuantity);
    return {
      typeId: line.typeId,
      sku: choices[0]?.sku ?? null,
      quantity: line.defaultQuantity
    };
  });
}

export function setSelectionQuantity(
  selections: readonly BasketSelection[],
  typeId: string,
  quantity: number
): BasketSelection[] {
  if (!integerQuantity(quantity)) throw new Error('Quantidade inválida');
  if (!selections.some((item) => item.typeId === typeId)) throw new Error('Tipo não faz parte da cesta');
  return selections.map((item) => item.typeId === typeId ? { ...item, quantity } : item);
}

export function setSelectionProduct(
  selections: readonly BasketSelection[],
  typeId: string,
  sku: string,
  types: readonly ProductType[],
  products: readonly Product[]
): BasketSelection[] {
  const current = selections.find((item) => item.typeId === typeId);
  const type = types.find((item) => item.id === typeId);
  if (!current || !type) throw new Error('Tipo não faz parte da cesta');
  if (!eligibleOptions(type, products, current.quantity).some((item) => item.sku === sku)) {
    throw new Error('Produto indisponível para este tipo ou quantidade');
  }
  return selections.map((item) => item.typeId === typeId ? { ...item, sku } : item);
}

export function summarizeBasket(
  template: BasketTemplate,
  selections: readonly BasketSelection[],
  types: readonly ProductType[],
  products: readonly Product[]
): BasketSummary {
  const lines: BasketLineSummary[] = [...template.lines]
    .sort((a, b) => a.order - b.order)
    .map((line) => {
      const type = types.find((item) => item.id === line.typeId);
      if (!type) throw new Error('Tipo não cadastrado: ' + line.typeId);
      const selection = selections.find((item) => item.typeId === type.id);
      if (!selection || !integerQuantity(selection.quantity)) throw new Error('Seleção inválida para ' + type.name);
      const options = eligibleOptions(type, products, selection.quantity);
      const selected = products.find((item) => item.sku === selection.sku) ?? null;
      if (selection.quantity > 0 && (
        !selected || !options.some((item) => item.sku === selected.sku)
      )) {
        throw new Error('Produto indisponível: ' + type.name);
      }
      return {
        typeId: type.id,
        typeName: type.name,
        options,
        selected,
        quantity: selection.quantity,
        totalCents: selected && selection.quantity > 0 ? selected.priceCents * selection.quantity : 0
      };
    });
  return {
    templateId: template.id,
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    unavailableTypeIds: lines.filter((line) => line.quantity > 0 && !line.options.length).map((line) => line.typeId)
  };
}

export function validateBasketTemplate(template: BasketTemplate, types: readonly ProductType[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const line of template.lines) {
    if (!types.some((type) => type.id === line.typeId)) errors.push('Tipo inexistente: ' + line.typeId);
    if (seen.has(line.typeId)) errors.push('Tipo duplicado: ' + line.typeId);
    if (!integerQuantity(line.defaultQuantity)) errors.push('Quantidade inválida: ' + line.typeId);
    seen.add(line.typeId);
  }
  return errors;
}
