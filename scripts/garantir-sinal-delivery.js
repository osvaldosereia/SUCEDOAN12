const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const SEO_COMBOS = path.join(ROOT, 'app-next', 'src', 'seo-combos.js');
const DELIVERY_MARKER = '<meta name="service-model" content="Somente delivery">';
const CLEAN_PATH_MARKER = "const CLEAN_SECTION_PATHS = Object.freeze({ baskets: '/cestas/', kits: '/kits/' });";

function ensureDeliveryMarker() {
  let html = fs.readFileSync(INDEX, 'utf8');
  if (html.includes(DELIVERY_MARKER)) return false;
  const anchor = /(<meta\s+name="description"[^>]*>)/i;
  if (!anchor.test(html)) throw new Error('Meta description não encontrada no index.html.');
  html = html.replace(anchor, `$1\n  ${DELIVERY_MARKER}`);
  fs.writeFileSync(INDEX, html, 'utf8');
  return true;
}

function ensureCleanSectionPaths() {
  let source = fs.readFileSync(SEO_COMBOS, 'utf8');
  if (source.includes(CLEAN_PATH_MARKER)) return false;
  const anchor = "import { kitIsVisible, kitOriginalPrice, kitStockCapacity, resolveBundleRows } from './commerce.js';";
  if (!source.includes(anchor)) throw new Error('Importação principal não encontrada em seo-combos.js.');
  source = source.replace(anchor, `${anchor}\n\n${CLEAN_PATH_MARKER}`);
  fs.writeFileSync(SEO_COMBOS, source, 'utf8');
  return true;
}

function main() {
  const indexChanged = ensureDeliveryMarker();
  const seoChanged = ensureCleanSectionPaths();
  console.log(`Sinais técnicos de delivery e URLs limpas verificados: index=${indexChanged ? 'atualizado' : 'ok'}, seo=${seoChanged ? 'atualizado' : 'ok'}.`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error('Erro ao registrar sinais técnicos de delivery:', error);
    process.exit(1);
  }
}

module.exports = { main };
