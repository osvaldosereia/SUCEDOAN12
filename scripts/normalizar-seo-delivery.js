const fs = require('fs');
const path = require('path');
const { SITE_URL, atomicWrite } = require('./catalogos-combos-lib');
const { organizationSchema } = require('./gerar-paginas-seo-combos');

const ROOT = process.env.OUTPUT_DIR || path.join(__dirname, '..');

function jsonScript(schema) {
  return `<script type="application/ld+json">${JSON.stringify(schema).replace(/<\/script/gi, '<\\/script')}</script>`;
}

function replaceStructuredData(html, matcher, schema) {
  const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let replaced = false;
  const output = html.replace(pattern, (full, body) => {
    if (!replaced && matcher(body)) {
      replaced = true;
      return jsonScript(schema);
    }
    return full;
  });
  return { output, replaced };
}

function normalizeIndex(html) {
  let output = html.replaceAll('https://www.donaantonia.com.br', SITE_URL);
  const organization = replaceStructuredData(
    output,
    body => /"@type"\s*:\s*"GroceryStore"/.test(body) || /Super Cestas Básicas Dona Antônia/.test(body),
    organizationSchema(),
  );
  output = organization.output;

  const deliveryScript = '  <script type="module" src="app-next/src/delivery-only.js?v=20260726-1"></script>\n';
  if (!output.includes('app-next/src/delivery-only.js')) {
    const anchor = '  <script type="module" src="app-next/src/seo-combos.js?v=20260726-1"></script>\n';
    if (output.includes(anchor)) output = output.replace(anchor, `${anchor}${deliveryScript}`);
    else output = output.replace('</body>', `${deliveryScript}</body>`);
  }
  return output;
}

function normalizeAbout(html) {
  let output = html.replaceAll('https://www.donaantonia.com.br', SITE_URL);
  const organization = replaceStructuredData(
    output,
    body => /"@type"\s*:\s*"GroceryStore"/.test(body),
    organizationSchema(),
  );
  output = organization.output
    .replace('supermercado online e loja de cestas básicas', 'delivery de cestas básicas, kits e produtos de supermercado')
    .replace('supermercado online, cestas básicas, kits e entrega local', 'delivery de cestas básicas, kits e produtos de supermercado')
    .replace(/<strong>Endereço:<\/strong>[^<]*(?:<br>)?/i, '<strong>Modalidade:</strong> Atendimento exclusivamente por delivery, sem loja física ou retirada no local<br>');
  return output;
}

function normalizeContact(html) {
  let output = html.replaceAll('https://www.donaantonia.com.br', SITE_URL);
  const contactSchema = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Contato Dona Antônia',
    url: `${SITE_URL}/contato.html`,
    mainEntity: { '@id': `${SITE_URL}/#organization` },
  };
  const contact = replaceStructuredData(output, body => /"@type"\s*:\s*"ContactPage"/.test(body), contactSchema);
  output = contact.output.replace(
    /<article class="contact-card"><small>Endereço<\/small><strong>[\s\S]*?<\/article>/i,
    '<article class="contact-card"><small>Área de atendimento</small><strong>Cuiabá e Várzea Grande - MT</strong><p>Atendimento exclusivamente por delivery. Não temos loja física nem retirada no local.</p></article>',
  );
  return output;
}

function normalizeGeneric(html) {
  return html.replaceAll('https://www.donaantonia.com.br', SITE_URL);
}

function normalizeFile(file) {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) return false;
  const current = fs.readFileSync(fullPath, 'utf8');
  let updated = normalizeGeneric(current);
  if (file === 'index.html') updated = normalizeIndex(current);
  if (file === 'sobre-nos.html') updated = normalizeAbout(current);
  if (file === 'contato.html') updated = normalizeContact(current);
  return atomicWrite(fullPath, updated);
}

function main() {
  const files = fs.readdirSync(ROOT)
    .filter(file => file.endsWith('.html') && fs.statSync(path.join(ROOT, file)).isFile());
  const changed = files.filter(normalizeFile);
  console.log(`SEO delivery normalizado em ${changed.length} página(s): ${changed.join(', ') || 'nenhuma alteração'}.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error('Erro ao normalizar SEO delivery:', error); process.exit(1); }
}

module.exports = { normalizeAbout, normalizeContact, normalizeGeneric, normalizeIndex };
