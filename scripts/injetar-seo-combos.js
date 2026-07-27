const fs = require('fs');
const path = require('path');

const INDEX_PATH = process.env.INDEX_PATH || path.join(__dirname, '..', 'index.html');
const SITE_URL = 'https://donaantonia.com.br';
const BUILD_VERSION = '2026-07-27-site-estavel-v1';

function ensureModule(output, modulePath, anchorPath) {
  if (output.includes(modulePath)) return output;
  const tag = `  <script type="module" src="${modulePath}"></script>\n`;
  const anchor = `  <script type="module" src="${anchorPath}"></script>\n`;
  return output.includes(anchor)
    ? output.replace(anchor, `${tag}${anchor}`)
    : output.replace('</body>', `${tag}</body>`);
}

function dedupeModule(output, modulePath) {
  const expression = new RegExp(`\\s*<script type="module" src="/?${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"></script>`, 'g');
  let found = false;
  return output.replace(expression, match => {
    if (found) return '';
    found = true;
    return match;
  });
}

function injectSeo(html) {
  let output = html.replaceAll('https://www.donaantonia.com.br', SITE_URL);
  output = output.replace(/<meta name="da-build-version" content="[^"]+">/, `<meta name="da-build-version" content="${BUILD_VERSION}">`);
  output = output.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Cestas básicas e kits promocionais com delivery em Cuiabá e Várzea Grande. Confira a composição, os preços e peça pelo WhatsApp.">');
  output = output.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">');
  output = output.replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="Cestas Básicas e Kits com Delivery em Cuiabá e Várzea Grande | Dona Antônia">');
  output = output.replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="Cestas básicas e kits promocionais com delivery em Cuiabá e Várzea Grande.">');
  output = output.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${SITE_URL}/">`);
  output = output.replace(/<title>[^<]*<\/title>/, '<title>Cestas Básicas e Kits com Delivery em Cuiabá e Várzea Grande | Dona Antônia</title>');
  output = output.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE_URL}/">`);
  output = ensureModule(output, 'app-next/src/seo-combos.js?v=20260727-4', 'app-next/src/image-performance.js?v=20260727-4');
  output = output.replace(/\n\s*<script type="module" src="\/?app-next\/src\/delivery-only\.js[^\n]*<\/script>/g, '');
  output = dedupeModule(output, 'app-next/src/seo-combos.js?v=20260727-4');
  return output;
}

function main() {
  const current = fs.readFileSync(INDEX_PATH, 'utf8');
  const updated = injectSeo(current);
  if (updated === current) {
    console.log('SEO delivery de cestas e kits já está aplicado no index.html.');
    return;
  }
  const temporary = `${INDEX_PATH}.tmp`;
  fs.writeFileSync(temporary, updated, 'utf8');
  fs.renameSync(temporary, INDEX_PATH);
  console.log('SEO delivery de cestas e kits aplicado no index.html sem alterar o layout.');
}

if (require.main === module) {
  try { main(); } catch (error) { console.error('Erro ao aplicar SEO no index.html:', error); process.exit(1); }
}

module.exports = { injectSeo };
