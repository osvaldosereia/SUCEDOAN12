import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html', 'styles/app.css', 'styles/home-parity.css', 'styles/checkout-flow.css', 'styles/bundle-confirmation.css',
  'src/config.js', 'src/core.js', 'src/catalog.js', 'src/commerce.js', 'src/integrations.js',
  'src/personalization.js', 'src/ui.js', 'src/checkout.js', 'src/main.js', 'src/visual-parity.js'
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Arquivo ausente: ${file}`);
}
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!index.includes('type="module" src="src/main.js"')) throw new Error('index.html não carrega o módulo principal');
if (!index.includes('styles/bundle-confirmation.css')) throw new Error('index.html não carrega os estilos da confirmação');
if (!index.includes('styles/checkout-flow.css')) throw new Error('index.html não carrega os estilos do checkout');
if (!index.includes('noindex, nofollow')) throw new Error('prévia precisa permanecer fora da indexação');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
for (const action of ['bundle-confirm-checkout', 'bundle-confirm-continue', 'bundle-confirm-undo']) {
  if (!main.includes(action)) throw new Error(`Ação ausente na confirmação: ${action}`);
}
const checkout = fs.readFileSync(path.join(root, 'src/checkout.js'), 'utf8');
for (const fragment of ['Total da compra', 'Tem cupom de desconto?', 'Identifique seu cadastro']) {
  if (!checkout.includes(fragment)) throw new Error(`Etapa ausente no checkout: ${fragment}`);
}
const checkoutCss = fs.readFileSync(path.join(root, 'styles/checkout-flow.css'), 'utf8');
if (!checkoutCss.includes('.checkout-offers-review{display:none!important}')) throw new Error('Ofertas para completar ainda estão visíveis no checkout');
const visualParity = fs.readFileSync(path.join(root, 'src/visual-parity.js'), 'utf8');
for (const fragment of ['50% OFF', '40% OFF', 'Todas as ofertas', 'ATÉ R$ 5', 'Math.random()']) {
  if (!visualParity.includes(fragment)) throw new Error(`Atalho promocional incompleto: ${fragment}`);
}
const homeCss = fs.readFileSync(path.join(root, 'styles/home-parity.css'), 'utf8');
if (!homeCss.includes('grid-template-columns:repeat(4')) throw new Error('Desktop precisa exibir quatro cards promocionais');
if (!homeCss.includes('grid-template-columns:repeat(2')) throw new Error('Mobile precisa exibir dois cards promocionais por linha');
const jsFiles = fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.js'));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'src', file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Falha de sintaxe em ${file}:\n${result.stderr}`);
}
await import('../src/ui.js');
await import('../src/checkout.js');
console.log(`Smoke test concluído: ${required.length} arquivos e ${jsFiles.length} módulos validados.`);