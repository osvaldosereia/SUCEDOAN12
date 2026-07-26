const path = require('path');
const {
  STORE_NAME, SITE_URL, atomicWrite, loadComboCatalog, xmlEscape,
} = require('./catalogos-combos-lib');

const OUTPUT_FILE = process.env.MERCHANT_OUTPUT || path.join(__dirname, '..', 'merchant.xml');

function itemXml(record) {
  const { details } = record;
  const lines = [
    '    <item>',
    `      <g:id>${xmlEscape(record.id)}</g:id>`,
    `      <g:title>${xmlEscape(record.title)}</g:title>`,
    `      <g:description>${xmlEscape(record.description)}</g:description>`,
    `      <g:link>${xmlEscape(record.link)}</g:link>`,
    `      <g:image_link>${xmlEscape(record.image)}</g:image_link>`,
    '      <g:availability>in_stock</g:availability>',
    '      <g:condition>new</g:condition>',
    `      <g:price>${(details.oldPrice || details.price).toFixed(2)} BRL</g:price>`,
  ];

  if (details.oldPrice > details.price) {
    lines.push(`      <g:sale_price>${details.price.toFixed(2)} BRL</g:sale_price>`);
    const start = record.source?.data_inicio ? `${record.source.data_inicio}T00:00:00-04:00` : new Date().toISOString();
    const end = record.source?.data_fim ? `${record.source.data_fim}T23:59:59-04:00` : '';
    if (end) lines.push(`      <g:sale_price_effective_date>${xmlEscape(`${start}/${end}`)}</g:sale_price_effective_date>`);
  }

  lines.push(`      <g:brand>${xmlEscape(record.brand)}</g:brand>`);
  lines.push(`      <g:mpn>${xmlEscape(record.code || record.id)}</g:mpn>`);
  lines.push(`      <g:product_type>${xmlEscape(record.productType)}</g:product_type>`);
  lines.push(`      <g:custom_label_0>${xmlEscape(record.type === 'kit' ? 'Kit promocional' : 'Cesta básica')}</g:custom_label_0>`);
  lines.push(`      <g:custom_label_1>${xmlEscape('Cuiabá e Várzea Grande')}</g:custom_label_1>`);
  lines.push(`      <g:custom_label_2>${xmlEscape(`${details.uniqueProducts} produtos`)}</g:custom_label_2>`);
  lines.push('    </item>');
  return lines.join('\n');
}

function buildFeed(catalog) {
  if (!catalog.active.length) throw new Error('Nenhuma cesta ou kit ativo e disponível foi encontrado; o merchant.xml anterior foi preservado.');
  const items = catalog.active.map(itemXml).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n  <channel>\n    <title>${xmlEscape(STORE_NAME)}</title>\n    <link>${xmlEscape(SITE_URL)}</link>\n    <description>Cestas básicas e kits promocionais com entrega em Cuiabá e Várzea Grande.</description>\n${items}\n  </channel>\n</rss>\n`;
}

function main() {
  const catalog = loadComboCatalog();
  atomicWrite(OUTPUT_FILE, buildFeed(catalog));
  console.log(`merchant.xml gerado com ${catalog.active.length} cestas e kits ativos.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error('Erro ao gerar merchant.xml:', error); process.exit(1); }
}

module.exports = { buildFeed, itemXml };
