import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse } from 'csv-parse/sync';

const CSV = process.argv[2];
if (!CSV) {
  console.error('Uso: npm run import:bling -- /caminho/arquivo.csv');
  process.exit(2);
}
const EXPECTED = [
  'ID',
  'Código',
  'Descrição',
  'Unidade',
  'NCM',
  'Origem',
  'Preço',
  'Valor IPI fixo',
  'Observações',
  'Situação',
  'Estoque',
  'Preço de custo',
  'Cód no fornecedor',
  'Fornecedor',
  'Localização',
  'Estoque maximo',
  'Estoque minimo',
  'Peso líquido (Kg)',
  'Peso bruto (Kg)',
  'GTIN/EAN',
  'GTIN/EAN da embalagem',
  'Largura do Produto',
  'Altura do Produto',
  'Profundidade do produto',
  'Data Validade',
  'Descrição do Produto no Fornecedor',
  'Descrição Complementar',
  'Itens p/ caixa',
  'Produto Variação',
  'Tipo Produção',
  'Classe de enquadramento do IPI',
  'Código da lista de serviços',
  'Tipo do item',
  'Grupo de Tags/Tags',
  'Tributos',
  'Código Pai',
  'Código Integração',
  'Grupo de produtos',
  'Marca',
  'CEST',
  'Volumes',
  'Descrição Curta',
  'Cross-Docking',
  'URL Imagens Externas',
  'Link Externo',
  'Meses Garantia no Fornecedor',
  'Clonar dados do pai',
  'Condição do produto',
  'Frete Grátis',
  'Número FCI',
  'Vídeo',
  'Departamento',
  'Unidade de medida',
  'Preço de compra',
  'Valor base ICMS ST para retenção',
  'Valor ICMS ST para retenção',
  'Valor ICMS próprio do substituto',
  'Categoria do produto',
  'Informações Adicionais',
];
const CATEGORIES = new Set([
  'MERCEARIA BÁSICA',
  'LIMPEZA',
  'LAVANDERIA',
  'HIGIÊNE',
  'BELEZA',
  'UTILIDADES',
  'PET',
]);
const money = (raw) => {
  const normalized = (raw || '0').trim().replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) throw Error('Valor monetário inválido: ' + raw);
  return Math.round(value * 100);
};
const raw = readFileSync(resolve(CSV), 'utf8').replace(/^\uFEFF/, '');
const records = parse(raw, {
  columns: true,
  bom: true,
  skip_empty_lines: true,
  relax_quotes: false,
});
const header = parse(raw, { to_line: 1, bom: true })[0];
const withExportIndex =
  header?.[0] === 'index' && JSON.stringify(header.slice(1)) === JSON.stringify(EXPECTED);
if (!withExportIndex && JSON.stringify(header) !== JSON.stringify(EXPECTED)) {
  throw Error(
    'Cabeçalho diferente do modelo Bling oficial (59 colunas). Um índice adicional de exportação é aceito.',
  );
}
const normalizedGtin = (raw) => {
  const value = (raw || '').trim();
  return /^\d+\.0$/.test(value) ? value.slice(0, -2) : value;
};
const seen = new Set();
const publicProducts = [];
const adminProducts = [];
for (const [index, row] of records.entries()) {
  const line = index + 2;
  const sku = row['Código']?.trim();
  const name = row['Descrição']?.trim();
  const category = row['Categoria do produto']?.trim();
  const gtin = normalizedGtin(row['GTIN/EAN']) || null;
  if (!sku || !name || seen.has(sku)) throw Error('SKU ausente/repetido, linha ' + line);
  if (!CATEGORIES.has(category)) throw Error('Categoria inválida, linha ' + line);
  if (row['Unidade']?.trim() !== 'UN') throw Error('Venda não unitária, linha ' + line);
  if (gtin && !/^\d{8}$|^\d{12,14}$/.test(gtin)) throw Error('GTIN inválido, linha ' + line);
  seen.add(sku);
  const priceCents = money(row['Preço']);
  const costCents = money(row['Preço de custo']);
  const rawStock = row['Estoque']?.trim() || '0';
  const stock = Number(rawStock.replace(',', '.'));
  if (!Number.isSafeInteger(stock) || stock < 0) throw Error('Estoque inválido, linha ' + line);
  const product = {
    sku,
    name,
    gtin,
    category,
    brand: row['Marca']?.trim() || '',
    priceCents,
    active: row['Situação']?.trim().toLowerCase() === 'ativo',
    stock,
  };
  publicProducts.push(product);
  adminProducts.push({
    ...product,
    costCents,
    ncm: row['NCM']?.trim() || null,
    cest: row['CEST']?.trim() || null,
    packageGtin: normalizedGtin(row['GTIN/EAN da embalagem']) || null,
    unitsPerCase: row['Itens p/ caixa']?.trim() || null,
    supplier: row['Fornecedor']?.trim() || null,
    supplierCode: row['Cód no fornecedor']?.trim() || null,
    originalBlingFields: Object.fromEntries(EXPECTED.map((name) => [name, row[name] ?? ''])), // todos os 59 campos privados
  });
}
const write = (path, data) => {
  const file = resolve(path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
};
write('public/catalog.generated.json', publicProducts);
write('data/catalog.admin.json', adminProducts);
console.log(
  'Validados ' +
    records.length +
    ' produtos (' +
    publicProducts.filter((p) => p.active && p.stock > 0).length +
    ' vendáveis).',
);
console.log('Nenhuma escrita realizada no Bling, banco ou site em produção.');
