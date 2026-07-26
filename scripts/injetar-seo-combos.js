const fs = require('fs');
const path = require('path');

const INDEX_PATH = process.env.INDEX_PATH || path.join(__dirname, '..', 'index.html');

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    if (source.includes(replacement)) return source;
    throw new Error(`Trecho não encontrado para atualizar ${label}.`);
  }
  return source.replace(search, replacement);
}

function injectSeo(html) {
  let output = html;
  output = output.replace(/<meta name="da-build-version" content="[^"]+">/, '<meta name="da-build-version" content="2026-07-26-combos-seo-v1">');
  output = output.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Cestas básicas e kits promocionais com entrega em Cuiabá e Várzea Grande. Confira todos os produtos e escolha sua opção.">');
  output = output.replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="Cestas Básicas e Kits em Cuiabá e Várzea Grande | Dona Antônia">');
  output = output.replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="Cestas básicas e kits promocionais com entrega em Cuiabá e Várzea Grande.">');
  output = output.replace(/<title>[^<]*<\/title>/, '<title>Cestas Básicas e Kits em Cuiabá e Várzea Grande | Dona Antônia</title>');

  if (!output.includes("params.get('cesta')")) {
    output = replaceOnce(
      output,
      "if (params.get('p')) route = '#/produto/' + encodeURIComponent(params.get('p'));",
      "if (params.get('cesta')) route = '#/cesta/' + encodeURIComponent(params.get('cesta'));\n      else if (params.get('kit')) route = '#/kit/' + encodeURIComponent(params.get('kit'));\n      else if (params.get('p')) route = '#/produto/' + encodeURIComponent(params.get('p'));",
      'rotas de cesta e kit',
    );
  }

  output = output.replace(
    "if (route) history.replaceState(null, '', location.pathname + route);",
    "if (route) history.replaceState(null, '', location.pathname + location.search + route);",
  );

  const scriptTag = '  <script type="module" src="app-next/src/seo-combos.js?v=20260726-1"></script>\n';
  if (!output.includes('app-next/src/seo-combos.js')) {
    output = replaceOnce(
      output,
      '  <script type="module" src="app-next/src/image-performance.js?v=20260724-4"></script>\n',
      `${scriptTag}  <script type="module" src="app-next/src/image-performance.js?v=20260724-4"></script>\n`,
      'carregamento do SEO de combos',
    );
  }
  return output;
}

function main() {
  const current = fs.readFileSync(INDEX_PATH, 'utf8');
  const updated = injectSeo(current);
  if (updated === current) {
    console.log('SEO de cestas e kits já está aplicado no index.html.');
    return;
  }
  const temporary = `${INDEX_PATH}.tmp`;
  fs.writeFileSync(temporary, updated, 'utf8');
  fs.renameSync(temporary, INDEX_PATH);
  console.log('SEO de cestas e kits aplicado no index.html sem alterar o layout.');
}

if (require.main === module) {
  try { main(); } catch (error) { console.error('Erro ao aplicar SEO no index.html:', error); process.exit(1); }
}

module.exports = { injectSeo };
