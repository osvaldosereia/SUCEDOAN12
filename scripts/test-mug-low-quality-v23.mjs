import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const loader = read('producao-v2/js/mug-make-native-openai-bridge.js');
const low = read('producao-v2/js/mug-force-low-quality-v23.js');
const admin = read('producao-v2/admin-produtivo.html');
const failures = [];

if (!loader.includes('./mug-force-low-quality-v23.js')) failures.push('Loader do Produção não carrega a trava Low V23.');
if (!loader.includes('20260827-canecas-clean-v23-low-async')) failures.push('Loader não usa a build V23.');
if (!admin.includes('20260827-canecas-clean-v23-low-async')) failures.push('Admin produtivo não invalida cache para V23.');
if (!low.includes("select.value = 'low'")) failures.push('Trava não fixa o seletor em low.');
if (!low.includes('select.disabled = true')) failures.push('Seletor de qualidade ainda pode ser alterado.');
if (!low.includes("dataset.mugImageQuality = 'low'")) failures.push('Documento não declara qualidade Low ativa.');

if (failures.length) {
  console.error(`Canecas V23 LOW FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Canecas V23 LOW OK: Produção força qualidade Low e build nova invalida cache.');
