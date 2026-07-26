const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const SEO_COMBOS = path.join(ROOT, 'app-next', 'src', 'seo-combos.js');
const DELIVERY_MARKER = '<meta name="service-model" content="Somente delivery">';
const CLEAN_PATH_MARKER = "const CLEAN_SECTION_PATHS = Object.freeze({ baskets: '/cestas/', kits: '/kits/' });";
const JSONLD_ASSIGNMENT = '  node.textContent = JSON.stringify(value);';
const BREADCRUMB_ASSIGNMENT = `  const normalized = value?.['@type'] === 'Product'
    ? {
        '@context': value['@context'] || 'https://schema.org',
        '@graph': [
          { ...value, '@context': undefined },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Início', item: \`${CONFIG.SITE_BASE_URL}/\` },
              {
                '@type': 'ListItem',
                position: 2,
                name: value.category || 'Cestas e kits',
                item: \`${CONFIG.SITE_BASE_URL}\${value.category === 'Kits promocionais' ? CLEAN_SECTION_PATHS.kits : CLEAN_SECTION_PATHS.baskets}\`,
              },
              { '@type': 'ListItem', position: 3, name: value.name || document.title, item: value.url || location.href },
            ],
          },
        ],
      }
    : value;
  node.textContent = JSON.stringify(normalized);`;

function ensureDeliveryMarker() {
  let html = fs.readFileSync(INDEX, 'utf8');
  if (html.includes(DELIVERY_MARKER)) return false;
  const anchor = /(<meta\s+name="description"[^>]*>)/i;
  if (!anchor.test(html)) throw new Error('Meta description não encontrada no index.html.');
  html = html.replace(anchor, `$1\n  ${DELIVERY_MARKER}`);
  fs.writeFileSync(INDEX, html, 'utf8');
  return true;
}

function ensureSeoSignals() {
  let source = fs.readFileSync(SEO_COMBOS, 'utf8');
  let changed = false;
  if (!source.includes(CLEAN_PATH_MARKER)) {
    const anchor = "import { kitIsVisible, kitOriginalPrice, kitStockCapacity, resolveBundleRows } from './commerce.js';";
    if (!source.includes(anchor)) throw new Error('Importação principal não encontrada em seo-combos.js.');
    source = source.replace(anchor, `${anchor}\n\n${CLEAN_PATH_MARKER}`);
    changed = true;
  }
  if (!source.includes("'@type': 'BreadcrumbList'")) {
    if (!source.includes(JSONLD_ASSIGNMENT)) throw new Error('Atribuição JSON-LD não encontrada em seo-combos.js.');
    source = source.replace(JSONLD_ASSIGNMENT, BREADCRUMB_ASSIGNMENT);
    changed = true;
  }
  if (changed) fs.writeFileSync(SEO_COMBOS, source, 'utf8');
  return changed;
}

function main() {
  const indexChanged = ensureDeliveryMarker();
  const seoChanged = ensureSeoSignals();
  console.log(`Sinais técnicos de delivery, URLs limpas e breadcrumbs verificados: index=${indexChanged ? 'atualizado' : 'ok'}, seo=${seoChanged ? 'atualizado' : 'ok'}.`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error('Erro ao registrar sinais técnicos de delivery:', error);
    process.exit(1);
  }
}

module.exports = { main };
