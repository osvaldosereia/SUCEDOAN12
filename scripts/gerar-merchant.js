const path = require('path');
const {
  STORE_NAME, SITE_URL, atomicWrite, loadComboCatalog, xmlEscape,
} = require('./catalogos-combos-lib');

const OUTPUT_FILE = process.env.MERCHANT_OUTPUT || path.join(__dirname, '..', 'merchant.xml');

function priceBand(value) {
  const price = Number(value || 0);
  if (price < 75) return 'Abaixo de R$ 75';
  if (price < 150) return 'R$ 75 a R$ 149';
  if (price < 300) return 'R$ 150 a R$ 299';
  return 'R$ 300 ou mais';
}

function saleWindow(record) {
  if (!(record.details.oldPrice > record.details.price)) return '';
  const start = record.source?.data_inicio || record.source?.dataInicio || '';
  const end = record.source?.data_fim || record.source?.dataFim || '';
  return start && end ? `${start}T00:00:00-04:00/${end}T23:59:59-04:00` : '';
}

function itemXml(record) {
  const { details } = record;
  const lines = [
    '    <item>',
    `      <g:id>${xmlEscape(record.id)}</g:id>`,
    `      <g:title>${xmlEscape(record.title)}</g:title>`,
    `      <g:description>${xmlEscape(record.description)}</g:description>`,
    `      <g:link>${xmlEscape(record.link)}</g:link>`,
    `      <g:canonical_link>${xmlEscape(record.link)}</g:canonical_link>`,
    `      <g:image_link>${xmlEscape(record.image)}</g:image_link>`,
    '      <g:availability>in_stock</g:availability>',
    '      <g:condition>new</g:condition>',
    `      <g:price>${(details.oldPrice || details.price).toFixed(2)} BRL</g:price>`,
  ];

  if (details.oldPrice > details.price) {
    lines.push(`      <g:sale_price>${details.price.toFixed(2)} BRL</g:sale_price>`);
    const window = saleWindow(record);
    if (window) lines.push(`      <g:sale_price_effective_date>${xmlEscape(window)}</g:sale_price_effective_date>`);
  }

  lines.push(`      <g:brand>${xmlEscape(record.brand)}</g:brand>`);
  lines.push(`      <g:mpn>${xmlEscape(record.code || record.id)}</g:mpn>`);
  lines.push('      <g:identifier_exists>yes</g:identifier_exists>');
  lines.push(`      <g:product_type>${xmlEscape(record.productType)}</g:product_type>`);
  lines.push(`      <g:shipping_label>${xmlEscape('delivery-local-minimo-75')}</g:shipping_label>`);
  lines.push(`      <g:custom_label_0>${xmlEscape(record.type === 'kit' ? 'Kit promocional' : 'Cesta básica')}</g:custom_label_0>`);
  lines.push(`      <g:custom_label_1>${xmlEscape('Cuiabá e Várzea Grande')}</g:custom_label_1>`);
  lines.push(`      <g:custom_label_2>${xmlEscape(`${details.uniqueProducts} produtos`)}</g:custom_label_2>`);
  lines.push(`      <g:custom_label_3>${xmlEscape('Somente delivery')}</g:custom_label_3>`);
  lines.push(`      <g:custom_label_4>${xmlEscape(priceBand(details.price))}</g:custom_label_4>`);
  lines.push('    </item>');
  return lines.join('\n');
}

function buildFeed(catalog) {
  if (!catalog.active.length) {
    throw new Error('Nenhuma cesta ou kit ativo e disponível foi encontrado; o merchant.xml anterior foi preservado.');
  }
  const items = catalog.active.map(itemXml).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n  <channel>\n    <title>${xmlEscape(STORE_NAME)}</title>\n    <link>${xmlEscape(SITE_URL)}</link>\n    <description>Cestas básicas e kits promocionais com delivery em Cuiabá e Várzea Grande.</description>\n${items}\n  </channel>\n</rss>\n`;
}

function main() {
  const catalog = loadComboCatalog();
  atomicWrite(OUTPUT_FILE, buildFeed(catalog));
  console.log(`merchant.xml gerado com ${catalog.active.length} cestas e kits ativos.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error('Erro ao gerar merchant.xml:', error); process.exit(1); }
}

module.exports = { buildFeed, itemXml, saleWindow };
