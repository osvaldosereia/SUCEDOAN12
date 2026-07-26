const path = require('path');
const { atomicWrite, csvCell, loadComboCatalog, round } = require('./catalogos-combos-lib');

const CSV_OUTPUT = process.env.META_OUTPUT || path.join(__dirname, '..', 'site', 'produtos_meta.csv');
const ADMIN_OUTPUT = process.env.META_ADMIN_OUTPUT || path.join(__dirname, '..', 'site', 'produtos_admin_meta.json');

const HEADER = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price',
  'sale_price_effective_date', 'link', 'image_link', 'brand', 'product_type', 'inventory',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4',
  'custom_number_0', 'custom_number_1', 'custom_number_2', 'custom_number_3', 'custom_number_4',
  'video[0].url', 'video[0].tag[0]'
];

function saleWindow(record) {
  if (!(record.details.oldPrice > record.details.price)) return '';
  const start = record.source?.data_inicio || record.source?.dataInicio || '';
  const end = record.source?.data_fim || record.source?.dataFim || '';
  return start && end ? `${start}T00:00:00-04:00/${end}T23:59:59-04:00` : '';
}

function labelSize(record) {
  const name = String(record.source?.nome || '').toLowerCase();
  for (const value of ['econômica', 'economica', 'mini', 'pequena', 'média', 'media', 'grande', 'premium']) {
    if (name.includes(value)) {
      return value
        .replace('economica', 'Econômica')
        .replace('media', 'Média')
        .replace(/^./, letter => letter.toUpperCase());
    }
  }
  return record.type === 'kit' ? 'Promocional' : 'Cesta pronta';
}

function csvRow(record) {
  const details = record.details;
  const regularPrice = details.oldPrice || details.price;
  const salePrice = details.oldPrice > details.price ? `${details.price.toFixed(2)} BRL` : '';
  const discount = details.oldPrice > details.price
    ? round((1 - details.price / details.oldPrice) * 100)
    : round(record.source?.desconto_percentual || 0);
  const values = [
    record.id,
    record.title,
    record.description,
    'in stock',
    'new',
    `${regularPrice.toFixed(2)} BRL`,
    salePrice,
    saleWindow(record),
    record.link,
    record.image,
    record.brand,
    record.productType,
    details.stock,
    record.type === 'kit' ? 'Kit promocional' : 'Cesta básica',
    labelSize(record),
    'Cuiabá e Várzea Grande',
    `${details.uniqueProducts} produtos`,
    'Somente delivery',
    details.stock,
    details.price,
    discount,
    details.uniqueProducts,
    details.units,
    '',
    '',
  ];
  return values.map(csvCell).join(',');
}

function buildCsv(catalog) {
  if (!catalog.active.length) throw new Error('Nenhuma cesta ou kit ativo foi encontrado; o CSV anterior foi preservado.');
  return `\uFEFF${HEADER.join(',')}\n${catalog.active.map(csvRow).join('\n')}\n`;
}

function adminRecord(record) {
  return {
    id: record.id,
    referencia: record.reference,
    codigo: record.code,
    tipo: record.type === 'kit' ? 'kit_promocional' : 'cesta_basica',
    nome: record.source?.nome || record.title,
    titulo_meta: record.title,
    descricao_meta: record.description,
    link: record.link,
    link_legado: record.legacyLink,
    caminho_seo: record.seoPath,
    ultima_alteracao: record.lastmod || null,
    imagem: record.image,
    preco: record.details.price,
    preco_anterior: record.details.oldPrice || null,
    estoque_catalogo: record.details.stock,
    quantidade_produtos: record.details.uniqueProducts,
    quantidade_unidades: record.details.units,
    periodo_status: record.details.periodStatus,
    ativo_catalogo: record.details.catalogActive,
    valido: record.details.valid,
    componentes: record.details.resolvedItems.map(item => ({
      codigo_solicitado: item.requestedCode,
      codigo_usado: item.selectedCode,
      quantidade: item.qty,
      produto_encontrado: Boolean(item.product),
      estoque: item.product ? Number(item.product.estoque || item.product.stock || 0) : 0,
    })),
  };
}

function buildAdminJson(catalog) {
  const payload = {
    generatedAt: catalog.generatedAt,
    source: 'cestas-e-kits-oficiais',
    deliveryOnly: true,
    summary: {
      total: catalog.all.length,
      ativos_no_catalogo: catalog.active.length,
      cestas: catalog.baskets.length,
      kits: catalog.kits.length,
    },
    items: catalog.all.map(adminRecord),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function main() {
  const catalog = loadComboCatalog();
  atomicWrite(CSV_OUTPUT, buildCsv(catalog));
  atomicWrite(ADMIN_OUTPUT, buildAdminJson(catalog));
  console.log(`Catálogo da Meta gerado com ${catalog.active.length} cestas e kits ativos; ${catalog.all.length} registros no diagnóstico administrativo.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error('Erro ao gerar catálogo da Meta:', error); process.exit(1); }
}

module.exports = { HEADER, buildAdminJson, buildCsv, csvRow, saleWindow };
