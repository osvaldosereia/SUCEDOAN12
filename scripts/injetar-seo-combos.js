const fs = require('fs');
const path = require('path');

const INDEX_PATH = process.env.INDEX_PATH || path.join(__dirname, '..', 'index.html');
const SITE_URL = 'https://donaantonia.com.br';
const BUILD_VERSION = '2026-07-27-product-cards-spacing-v11';

function removeLegacyAssets(html) {
  return html
    .replace(/\n?\s*<link rel="stylesheet" href="\/app-next\/styles\/(?:visual-parity|home-parity|live-polish)\.css[^>]*>/g, '')
    .replace(/\n?\s*<script type="module" src="\/app-next\/src\/(?:seo-combos|live-polish)\.js[^>]*><\/script>/g, '')
    .replace(/\n?\s*<script type="module" src="\/?app-next\/src\/delivery-only\.js[^>]*><\/script>/g, '');
}

function injectSeo(html) {
  let output = html.replaceAll('https://www.donaantonia.com.br', SITE_URL);
  output = removeLegacyAssets(output);
  output = output.replace(/<meta name="da-build-version" content="[^"]+">/, `<meta name="da-build-version" content="${BUILD_VERSION}">`);
  output = output.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Cestas básicas econômicas, pequenas, médias e grandes com composição completa e delivery em Cuiabá e Várzea Grande.">');
  output = output.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">');
  output = output.replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="Cestas Básicas em Cuiabá e Várzea Grande | Dona Antônia">');
  output = output.replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="Compare cestas básicas, confira todos os produtos e peça com delivery em Cuiabá e Várzea Grande.">');
  output = output.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${SITE_URL}/">`);
  output = output.replace(/<title>[^<]*<\/title>/, '<title>Cestas Básicas em Cuiabá e Várzea Grande | Dona Antônia</title>');
  output = output.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE_URL}/">`);
  return output;
}

function main() {
  const current = fs.readFileSync(INDEX_PATH, 'utf8');
  const updated = injectSeo(current);
  if (updated === current) {
    console.log('SEO focado em cestas básicas já está aplicado no index.html.');
    return;
  }
  const temporary = `${INDEX_PATH}.tmp`;
  fs.writeFileSync(temporary, updated, 'utf8');
  fs.renameSync(temporary, INDEX_PATH);
  console.log('SEO focado em cestas básicas aplicado sem reintroduzir camadas antigas.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Erro ao aplicar SEO de cestas básicas no index.html:', error);
    process.exit(1);
  }
}

module.exports = { injectSeo, removeLegacyAssets };