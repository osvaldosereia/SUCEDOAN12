import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html', 'styles/app.css', 'styles/bundle-confirmation.css', 'src/config.js', 'src/core.js', 'src/catalog.js',
  'src/commerce.js', 'src/integrations.js', 'src/personalization.js', 'src/ui.js',
  'src/checkout.js', 'src/main.js'
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Arquivo ausente: ${file}`);
}
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!index.includes('type="module" src="src/main.js"')) throw new Error('index.html não carrega o módulo principal');
if (!index.includes('styles/bundle-confirmation.css')) throw new Error('index.html não carrega os estilos da confirmação');
if (!index.includes('noindex, nofollow')) throw new Error('prévia precisa permanecer fora da indexação');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
for (const action of ['bundle-confirm-checkout', 'bundle-confirm-continue', 'bundle-confirm-undo']) {
  if (!main.includes(action)) throw new Error(`Ação ausente na confirmação: ${action}`);
}
const jsFiles = fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.js'));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'src', file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Falha de sintaxe em ${file}:\n${result.stderr}`);
}
await import('../src/ui.js');
await import('../src/checkout.js');
console.log(`Smoke test concluído: ${required.length} arquivos e ${jsFiles.length} módulos validados.`);
