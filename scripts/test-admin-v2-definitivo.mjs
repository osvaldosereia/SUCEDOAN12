import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const checked = [];

function fail(message) {
  failures.push(message);
}

function read(relative) {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) {
    fail(`Arquivo ausente: ${relative}`);
    return '';
  }
  return readFileSync(file, 'utf8');
}

function walk(directory, extension = '.js') {
  const base = path.join(ROOT, directory);
  if (!existsSync(base)) return [];
  const output = [];
  for (const name of readdirSync(base)) {
    const full = path.join(base, name);
    const relative = path.relative(ROOT, full).replace(/\\/g, '/');
    if (statSync(full).isDirectory()) output.push(...walk(relative, extension));
    else if (name.endsWith(extension)) output.push(relative);
  }
  return output;
}

function checkSyntax(relative) {
  try {
    execFileSync(process.execPath, ['--check', relative], { cwd: ROOT, stdio: 'pipe' });
    checked.push(relative);
  } catch (error) {
    fail(`Erro de sintaxe em ${relative}: ${String(error.stderr || error.message).trim()}`);
  }
}

function checkImports(relative) {
  const source = read(relative);
  const directory = path.dirname(relative);
  const expressions = [...source.matchAll(/(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g)];
  for (const match of expressions) {
    const originalTarget = match[2];
    const target = originalTarget.split(/[?#]/, 1)[0];
    const resolved = path.normalize(path.join(ROOT, directory, target));
    const candidates = [resolved, `${resolved}.js`, path.join(resolved, 'index.js')];
    if (!candidates.some(existsSync)) fail(`Import não encontrado em ${relative}: ${originalTarget}`);
  }
}

const required = [
  'producao/index.html',
  'producao/index-legado.html',
  'admin/index.html',
  'producao-v2/index.html',
  'producao-v2/js/product-lifecycle-bootstrap.js',
  'producao-v2/js/product-editor-enhancements.js',
  'producao-v2/js/admin-suite-bootstrap.js',
  'producao-v2/js/order-tools-bootstrap.js',
  'producao-v2/js/catalog-auto-sync.js',
  'producao-v2/js/official-copy-fixes.js',
  'site/produtos-admin.json',
  'site/ofertas-historico.json',
  'site/cuponsativos.json',
  'site/compra-rapida.json',
  'scripts/check-admin-production.mjs',
  'scripts/sincronizar-produtos-home-firebase.mjs',
  'scripts/processar-ofertas.mjs',
  'scripts/reconciliar-publicacao-ofertas.mjs',
  '.github/workflows/verificar-admin-producao.yml',
  '.github/workflows/sincronizar-produtos-home-firebase.yml',
  '.github/workflows/processar-ofertas.yml',
  'app-next/src/config.js',
  'app-next/src/catalog.js',
];
required.forEach(file => { if (!existsSync(path.join(ROOT, file))) fail(`Arquivo obrigatório ausente: ${file}`); });

const javascript = [
  ...walk('producao-v2/js', '.js'),
  ...walk('app-next/src', '.js'),
  'scripts/check-admin-production.mjs',
  'scripts/sincronizar-produtos-home-firebase.mjs',
  'scripts/processar-ofertas.mjs',
  'scripts/reconciliar-publicacao-ofertas.mjs',
  'scripts/limpar-ofertas-validade-expiradas.mjs',
].filter((value, index, list) => list.indexOf(value) === index && existsSync(path.join(ROOT, value)));

javascript.forEach(checkSyntax);
javascript.forEach(checkImports);

for (const jsonFile of ['site/produtos-admin.json', 'site/banners/banners.json', 'site/ofertas-historico.json', 'site/cuponsativos.json', 'site/compra-rapida.json']) {
  try { JSON.parse(read(jsonFile)); }
  catch (error) { fail(`JSON inválido em ${jsonFile}: ${error.message}`); }
}

try {
  const adminProducts = JSON.parse(read('site/produtos-admin.json'));
  const entries = Object.entries(adminProducts || {});
  if (entries.length < 1) fail('O índice administrativo de produtos está vazio.');
  const first = entries[0]?.[1] || {};
  for (const field of ['firebaseKey', 'codigo', 'nome', 'estoque', 'situacao']) {
    if (!Object.prototype.hasOwnProperty.call(first, field)) fail(`O índice administrativo não contém o campo ${field}.`);
  }
} catch {}

try {
  const banners = JSON.parse(read('site/banners/banners.json'));
  if (Array.isArray(banners) ? banners.length : Array.isArray(banners.banners) && banners.banners.length) fail('Ainda existem banners ativos no arquivo oficial.');
  if (banners.disabled !== true) fail('O arquivo de banners precisa permanecer explicitamente desativado.');
} catch {}

const productionEntry = read('producao/index.html');
if (!productionEntry.includes('../producao-v2/')) fail('A rota /producao não aponta para o Admin oficial.');
if (!productionEntry.includes('no-store') || !productionEntry.includes('window.location.replace')) fail('A rota /producao precisa redirecionar sem cache e preservar a navegação.');
if (read('producao/index-legado.html').length < 10000) fail('O Admin legado não foi preservado integralmente.');
if (!read('admin/index.html').includes('producao-v2')) fail('O atalho /admin não aponta para o Admin oficial.');

const publicConfig = read('app-next/src/config.js');
const publicCatalog = read('app-next/src/catalog.js');
if (/BANNERS\s*:/.test(publicConfig)) fail('O site público ainda possui endpoint ou armazenamento de banners.');
if (/ENDPOINTS\.BANNERS|STORAGE\.BANNERS/.test(publicCatalog)) fail('O catálogo público ainda consulta banners.');
if (!/banners:\s*\[\]/.test(publicCatalog)) fail('O estado público precisa inicializar banners como lista vazia para compatibilidade.');

const offersWorkflow = read('.github/workflows/processar-ofertas.yml');
if (!offersWorkflow.includes('cron: "17 * * * *"')) fail('A rotina horária de ofertas não está agendada.');
if (/git add[\s\S]{0,240}banners\.json/.test(offersWorkflow)) fail('O workflow de ofertas ainda publica banners.');
if (!offersWorkflow.includes('limpar-ofertas-validade-expiradas.mjs')) fail('A limpeza de ofertas vencidas não ocorre antes do processamento.');

const catalogWorkflow = read('.github/workflows/sincronizar-produtos-home-firebase.yml');
for (const requiredText of ['catalog-version.json', 'site/produtos-admin.json', 'PRODUCTS_ADMIN_PATH']) {
  if (!catalogWorkflow.includes(requiredText)) fail(`A sincronização do catálogo não contém ${requiredText}.`);
}
if (!catalogWorkflow.includes('*/5 * * * *')) fail('A contingência de sincronização a cada cinco minutos não está ativa.');

const catalogSyncScript = read('scripts/sincronizar-produtos-home-firebase.mjs');
for (const requiredText of ['PRODUCTS_ADMIN_PATH', 'adminProductCount', 'adminProduct']) {
  if (!catalogSyncScript.includes(requiredText)) fail(`O sincronizador não gera corretamente o índice administrativo: ${requiredText}.`);
}

const healthWorkflow = read('.github/workflows/verificar-admin-producao.yml');
if (!healthWorkflow.includes('23,53 * * * *')) fail('A verificação de produção a cada 30 minutos não está agendada.');
if (!healthWorkflow.includes("steps.first_check.outcome != 'skipped'")) fail('Execuções canceladas ainda podem publicar diagnóstico falso.');
for (const eventType of ['sincronizar_produtos_home', 'processar_ofertas']) {
  if (!healthWorkflow.includes(eventType)) fail(`A autocorreção não dispara ${eventType}.`);
}
const healthScript = read('scripts/check-admin-production.mjs');
for (const endpoint of ['/producao/', '/producao-v2/', '/site/produtos-home.json', '/site/produtos-admin.json', '/site/ofertas-automaticas-estado.json']) {
  if (!healthScript.includes(endpoint)) fail(`Healthcheck não valida ${endpoint}.`);
}

const adminConfig = read('producao-v2/js/config.js');
if (!adminConfig.includes("adminProductsPath: 'site/produtos-admin.json'")) fail('A configuração oficial não aponta para o índice administrativo.');
if (!adminConfig.includes('firebaseUrl: DEFAULT_CONFIG.firebaseUrl')) fail('A fonte oficial do Firebase pode ser sobrescrita por configuração antiga.');

const firebaseService = read('producao-v2/js/services/firebase.js');
if (!firebaseService.includes("method: 'PATCH'")) fail('O salvamento seguro por PATCH não foi encontrado.');
if (!firebaseService.includes('createProduct')) fail('Cadastro de produto novo não foi encontrado.');
if (!firebaseService.includes('archiveProduct') || !firebaseService.includes('restoreProduct')) fail('Lixeira e restauração não foram encontradas.');
if (!firebaseService.includes('conflicts.length')) fail('Proteção de conflito por campo não foi encontrada.');
if (!firebaseService.includes("databaseUrl(config, 'logs_admin')")) fail('Auditoria em logs_admin não foi encontrada.');
if (!firebaseService.includes('imagens_historico')) fail('Histórico das imagens anteriores não foi encontrado.');
if (!firebaseService.includes('fetchAdminProducts') || !firebaseService.includes('adminCatalogUrl')) fail('A abertura do Admin ainda não usa o índice administrativo leve.');
if (!firebaseService.includes('fetchProductsFromFirebase')) fail('O fallback direto do Firebase não foi preservado.');

const stockBootstrap = read('producao-v2/js/stock-bootstrap.js');
for (const moduleName of ['catalog-auto-sync.js', 'product-lifecycle-bootstrap.js', 'admin-suite-bootstrap.js', 'collections-bootstrap.js']) {
  if (!stockBootstrap.includes(moduleName)) fail(`Módulo não carregado pelo Admin: ${moduleName}`);
}

const catalogAutoSync = read('producao-v2/js/catalog-auto-sync.js');
for (const moduleName of ['official-copy-fixes.js', 'product-editor-enhancements.js', 'order-tools-bootstrap.js']) {
  if (!catalogAutoSync.includes(moduleName)) fail(`Módulo complementar não carregado: ${moduleName}`);
}

const adminSuite = read('producao-v2/js/admin-suite-bootstrap.js');
for (const feature of ['Cupons de desconto', 'Compra Rápida', 'Pedidos', 'Backup, exportação e auditoria', 'Selecionar todos']) {
  if (!adminSuite.includes(feature)) fail(`Função administrativa ausente: ${feature}`);
}

const orderTools = read('producao-v2/js/order-tools-bootstrap.js');
if (!orderTools.includes('100mm 150mm')) fail('Etiqueta 100 × 150 mm não foi encontrada.');
if (!orderTools.includes('Reenviar Make/Bling')) fail('Reenvio Make/Bling não foi encontrado.');
if (!orderTools.includes('makeOrderWebhookSetting')) fail('Configuração do webhook de pedidos não foi encontrada.');

const productEditor = read('producao-v2/js/product-editor-enhancements.js');
if (!productEditor.includes('replaceClassificationSelects')) fail('Cadastros digitáveis no produto existente não foram encontrados.');
if (!productEditor.includes('installHydratedProductOpening') || !productEditor.includes('loadProduct(this.store.state.config')) fail('O editor não hidrata o cadastro completo antes de abrir.');

const adminIndex = read('producao-v2/index.html');
if (/ambiente paralelo|versão paralela|Mantenha desligado durante a validação/i.test(adminIndex)) fail('O HTML oficial ainda contém textos de homologação.');
if (!adminIndex.includes('makeOrderWebhookSetting')) fail('O campo do webhook de pedidos não está no HTML oficial.');

if (failures.length) {
  console.error(`\nAdmin V2 definitivo: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Admin V2 definitivo validado: ${checked.length} arquivos JavaScript sem erro de sintaxe, imports resolvidos e contratos principais presentes.`);
}
