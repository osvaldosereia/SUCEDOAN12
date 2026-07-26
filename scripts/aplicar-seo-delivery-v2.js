const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const markerPath = path.join(root, '.seo-delivery-v2-aplicado');
const payloadDir = path.join(__dirname, 'seo-delivery-payload');
const PAYLOAD_PARTS = [
  'part-01.txt',
  'part-02.txt',
  'part-03.txt',
  'part-04a.txt',
  'part-04b.txt',
  'part-05a.txt',
  'part-05b1.txt',
  'part-05b2.txt',
  'part-06.txt',
  'part-07.txt',
  'part-08.txt',
];

function writeAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, filePath);
}

function readPayload() {
  const encoded = PAYLOAD_PARTS
    .map(file => fs.readFileSync(path.join(payloadDir, file), 'utf8'))
    .join('');
  return JSON.parse(encoded);
}

function main() {
  if (fs.existsSync(markerPath)) {
    console.log('Migração SEO delivery v2 já aplicada.');
    return;
  }
  const payload = readPayload();
  for (const [relative, encoded] of Object.entries(payload)) {
    const content = zlib.gunzipSync(Buffer.from(encoded, 'base64'));
    writeAtomic(path.join(root, relative), content);
  }
  writeAtomic(markerPath, Buffer.from(JSON.stringify({
    version: '2026-07-26-seo-delivery-v2',
    appliedAt: new Date().toISOString()
  }, null, 2) + '\n'));
  console.log(`Migração SEO delivery v2 aplicada em ${Object.keys(payload).length} arquivos.`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error('Erro ao aplicar migração SEO delivery v2:', error);
    process.exit(1);
  }
}

module.exports = { main };
