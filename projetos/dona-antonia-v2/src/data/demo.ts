import type { BasketTemplate, Category, Product, ProductType } from '../core/model';

/** Amostra explícita para desenvolvimento. Nunca sincronizar este estoque artificial. */
const product = (
  sku: string,
  name: string,
  brand: string,
  gtin: string | null,
  priceCents: number,
  category: Category = 'MERCEARIA BÁSICA',
): Product => ({ sku, name, brand, gtin, priceCents, category, active: true, stock: 50 });

export const DEMO_PRODUCTS: Product[] = [
  product('DA-0028', 'Arroz Caibi Tipo 1 5 kg', 'Caibi', '7898220470092', 2377),
  product('DA-0029', 'Arroz Dubom 5 kg', 'Dubom', '7898125370206', 2217),
  product('DA-0030', 'Arroz Koblenz 5 kg', 'Koblenz', '7896038342037', 3626),
  product('DA-0069', 'Feijão Carioca Dona Dê 1 kg', 'Dona Dê', '7898922012019', 979),
  product('DA-0070', 'Feijão Carioca Da Casa 1 kg', 'Da Casa', '7898930234038', 1015),
  product('DA-0073', 'Feijão Carioca Koblenz Tipo 1 1 kg', 'Koblenz', '7896038360062', 1077),
  product('DA-0110', 'Óleo de Soja Concord 900 ml', 'Concord', '7898247780075', 965),
  product('DA-0111', 'Óleo de Soja Liza Garrafa PET 900 ml', 'Liza', '7896036090244', 1091),
  product('DA-0001', 'Açúcar Cristal Barralcool 2 kg', 'Barralcool', '7897062500073', 581),
  product('DA-0002', 'Açúcar Cristal Doce Dia 2 kg', 'Doce Dia', '7896984700028', 657),
  product(
    'DA-0048',
    'Café Torrado e Moído Brasileiro Tradicional Sachê 250 g',
    'Brasileiro',
    '7891018427582',
    1259,
  ),
  product(
    'DA-0049',
    'Café Torrado e Moído Caboclo Tradicional a Vácuo 250 g',
    'Caboclo',
    '7896089012460',
    1628,
  ),
  product('DA-0134', 'Sal Refinado Cristal Ouro 1 kg', 'Cristal Ouro', '7898280080170', 307),
];

export const DEMO_TYPES: ProductType[] = [
  { id: 'arroz', name: 'Arroz', productSkus: ['DA-0028', 'DA-0029', 'DA-0030'], order: 1 },
  { id: 'feijao', name: 'Feijão', productSkus: ['DA-0069', 'DA-0070', 'DA-0073'], order: 2 },
  { id: 'oleo', name: 'Óleo de soja', productSkus: ['DA-0110', 'DA-0111'], order: 3 },
  { id: 'acucar', name: 'Açúcar', productSkus: ['DA-0001', 'DA-0002'], order: 4 },
  { id: 'cafe', name: 'Café', productSkus: ['DA-0048', 'DA-0049'], order: 5 },
  { id: 'sal', name: 'Sal', productSkus: ['DA-0134'], order: 6 },
];

const buildLines = (quantities: readonly number[]) =>
  DEMO_TYPES.map((type, index) => ({
    typeId: type.id,
    defaultQuantity: quantities[index] ?? 0,
    order: index + 1,
  })).filter((line) => line.defaultQuantity > 0);

export const DEMO_TEMPLATES: BasketTemplate[] = [
  { id: 'economica', name: 'Econômica', active: true, lines: buildLines([1, 1, 1, 1, 0, 1]) },
  { id: 'mini', name: 'Mini', active: true, lines: buildLines([1, 1, 1, 1, 1, 1]) },
  { id: 'pequena', name: 'Pequena', active: true, lines: buildLines([2, 2, 1, 1, 1, 1]) },
  { id: 'media', name: 'Média', active: true, lines: buildLines([2, 3, 2, 2, 2, 2]) },
  { id: 'grande', name: 'Grande', active: true, lines: buildLines([4, 4, 3, 3, 3, 2]) },
];
