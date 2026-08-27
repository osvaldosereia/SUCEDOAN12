import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const loader = read('producao-v2/js/mug-make-native-openai-bridge.js');
const low = read('producao-v2/js/mug-force-low-quality-v23.js');
const admin = read('producao-v2/admin-produtivo.html');
const shared = read('shared/mug-make-fast-ack-v1.js');
const publicRuntime = read('app-next/src/mug-public-runtime-v6.js');
const publicContract = read('app-next/src/mug-public-personalization-contract-v25.js');
const customerLibrary = read('app-next/src/customer-favorites-v27.js');
const failures = [];

if (!loader.includes('./mug-force-low-quality-v23.js')) failures.push('Loader do Produção não carrega a trava Low.');
if (!loader.includes('20260827-canecas-clean-v24-low-async')) failures.push('Loader não usa a build V24.');
if (!admin.includes('20260827-canecas-clean-v24-low-async')) failures.push('Admin produtivo não invalida cache para V24.');
if (!low.includes("inner.quality = 'low'")) failures.push('Produção não reescreve o payload para low.');
if (!low.includes("select.value = 'low'")) failures.push('Trava não fixa o seletor em low.');
if (!low.includes('select.disabled = true')) failures.push('Seletor de qualidade ainda pode ser alterado.');
if (!shared.includes("inner.quality = 'low'")) failures.push('Transporte compartilhado não força low para site/Caneca10.');
if (!shared.includes("'generate_mug_art', 'finalize_mug_product', 'personalize_mug_model'")) failures.push('Transporte compartilhado não cobre todas as ações de imagem.');
if (!shared.includes("dataset.mugImageQuality = 'low'")) failures.push('Transporte compartilhado não declara qualidade Low ativa.');
if (!publicRuntime.includes('customer-favorites-v27.js')) failures.push('Runtime público não carrega a biblioteca de Favoritos + Minhas canecas.');
if (!publicRuntime.includes('mug-public-personalization-contract-v25.js')) failures.push('Runtime público não carrega o contrato V25 antes do controlador.');
if (!publicRuntime.includes('mug-public-result-link-v26.js')) failures.push('Runtime público não carrega a correção do link de resultado.');
if (!publicRuntime.includes('da:mug-personalized-added')) failures.push('Runtime público não sincroniza a biblioteca após concluir a caneca.');
if (!publicContract.includes("payload.quality = 'low'")) failures.push('Contrato público não fixa LOW na personalização.');
if (!publicContract.includes('payload.image_base64 = firstCustomerPhoto(payload)')) failures.push('Contrato público não envia a primeira foto como image_base64.');
if (!publicContract.includes('fallbackModelImage')) failures.push('Contrato público não possui fallback da arte oficial quando não há foto.');
if (!customerLibrary.includes("const CUSTOMER_ROOT = 'canecas/clientes'")) failures.push('Biblioteca do cliente não usa o nó canecas/clientes.');

if (failures.length) {
  console.error(`Canecas LOW FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Canecas LOW OK: Produção, site público e Caneca10 forçam LOW; personalização pública envia imagem válida e biblioteca do cliente está integrada.');