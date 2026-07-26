const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const MARKER = '<meta name="service-model" content="Somente delivery">';

function main() {
  let html = fs.readFileSync(INDEX, 'utf8');
  if (html.includes(MARKER)) {
    console.log('Sinal de operação somente delivery já está presente.');
    return;
  }
  const anchor = /(<meta\s+name="description"[^>]*>)/i;
  if (!anchor.test(html)) throw new Error('Meta description não encontrada no index.html.');
  html = html.replace(anchor, `$1\n  ${MARKER}`);
  fs.writeFileSync(INDEX, html, 'utf8');
  console.log('Sinal de operação somente delivery adicionado ao index.html.');
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error('Erro ao registrar operação somente delivery:', error);
    process.exit(1);
  }
}

module.exports = { main };
