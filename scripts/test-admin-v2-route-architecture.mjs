import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const warnings = [];

function read(relative) {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) {
    failures.push(`Arquivo ausente: ${relative}`);
    return '';
  }
  return readFileSync(file, 'utf8');
}

function requireText(source, marker, message) {
  if (!source.includes(marker)) failures.push(message);
}

function forbidText(source, marker, message) {
  if (source.includes(marker)) failures.push(message);
}

const config = read('producao-v2/js/config.js');
forbidText(config, "import('./basket-products-grid.js", 'config.js voltou a carregar a grade de cestas no boot global.');
forbidText(config, "import('./basket-editor-polish.js", 'config.js voltou a carregar o acabamento de cestas no boot global.');
forbidText(config, "import('./duplicate-product.js", 'config.js voltou a carregar Duplicar produto no boot global.');
requireText(config, 'meta[name="admin-save-build"]', 'config.js não herda a build produtiva atual.');
requireText(config, 'encodeURIComponent(ACTIVE_BUILD)', 'O fluxo crítico de Produtos não recebe a build produtiva atual.');

const stockBootstrap = read('producao-v2/js/stock-bootstrap.js');
for (const marker of [
  './products-offer-columns.js',
  './duplicate-product.js',
  './product-delete-tools.js',
]) {
  requireText(stockBootstrap, marker, `Produtos não carrega mais o complemento pela própria rota: ${marker}`);
}
requireText(stockBootstrap, 'meta[name="admin-save-build"]', 'O carregador das rotas não herda a build produtiva atual.');
requireText(stockBootstrap, 'encodeURIComponent(BUILD)', 'O carregador das rotas não aplica a build atual aos imports dinâmicos.');
requireText(stockBootstrap, 'refreshProductsTableAfterEnhancements', 'Produtos não atualiza a tabela após carregar os complementos da rota.');
requireText(stockBootstrap, "if (route === 'products') refreshProductsTableAfterEnhancements();", 'O refresh da tabela não está vinculado à conclusão dos complementos de Produtos.');
requireText(stockBootstrap, "if (route === 'baskets' || route === 'kits')", 'Cestas/Kits não estão vinculados ao carregamento sob demanda.');
requireText(stockBootstrap, "if (route === 'offers' || route === 'offers-rules')", 'Ofertas não estão vinculados ao carregamento sob demanda.');

const duplicateProduct = read('producao-v2/js/duplicate-product.js');
for (const marker of ['createProduct', 'loadProduct', 'loadProducts']) {
  requireText(duplicateProduct, marker, `Duplicar produto não usa mais o serviço Firebase oficial: ${marker}`);
}
forbidText(duplicateProduct, 'firebaseRequest(', 'Duplicar produto voltou a manter uma pilha Firebase paralela.');
forbidText(duplicateProduct, 'setInterval(', 'Duplicar produto voltou a usar setInterval para localizar a cópia.');

const productsOfferColumns = read('producao-v2/js/products-offer-columns.js');
requireText(productsOfferColumns, 'inline-sale-price-caption', 'O rótulo de preço de venda não está mais consolidado na tabela de Produtos.');
requireText(productsOfferColumns, "headerRow.cells[2].textContent = 'Preço de venda'", 'A coluna de preço de venda não é nomeada pelo módulo da tabela.');

const collections = read('producao-v2/js/collections-bootstrap.js');
for (const marker of [
  './basket-context.js',
  './basket-products-grid.js',
  './basket-editor-polish.js',
  './kit-editor-flow-v2.js',
  './kit-editor-order-v3.js',
]) {
  requireText(collections, marker, `Collections não carrega o complemento esperado: ${marker}`);
}
requireText(collections, 'meta[name="admin-save-build"]', 'Collections não herda a build produtiva atual.');
requireText(collections, 'function withBuild(path)', 'Collections não centraliza o cache-busting dos complementos.');
requireText(collections, 'window.__adminV2CollectionsModule = module', 'Collections não publica o módulo antes dos complementos.');
requireText(collections, 'installCollectionImageResolver(workspace)', 'O resolvedor de imagens não está limitado ao workspace de coleções.');
forbidText(collections, 'installCollectionImageResolver(document)', 'Collections voltou a observar imagens no documento inteiro.');
forbidText(collections, "import './instagram-queue-review.js", 'A revisão do Instagram voltou a carregar junto com qualquer coleção.');
requireText(collections, 'loadInstagramEnhancement', 'Collections perdeu o carregamento sob demanda da revisão do Instagram.');
requireText(collections, "event.detail?.route === 'kits'", 'A revisão do Instagram não está mais vinculada somente à rota Kits.');

const offers = read('producao-v2/js/offers-bootstrap.js');
requireText(offers, 'meta[name="admin-save-build"]', 'Offers não herda a build produtiva atual.');
requireText(offers, "'./campaign-rules-section.js'", 'Offers não é mais responsável por carregar as regras de campanha.');
requireText(offers, 'loadOfferEnhancements', 'Offers não centraliza o carregamento dos complementos.');
requireText(offers, 'window.__adminV2OffersStore = store', 'Offers não publica mais o store diretamente.');
requireText(offers, 'window.__adminV2OffersModule = module', 'Offers não publica mais o módulo diretamente.');

const campaignRules = read('producao-v2/js/campaign-rules-section.js');
forbidText(campaignRules, 'products-offer-columns.js', 'Regras de oferta voltou a carregar colunas de Produtos.');
forbidText(campaignRules, 'kit-editor-flow-v2.js', 'Regras de oferta voltou a carregar editor de Kits.');
forbidText(campaignRules, 'kit-editor-order-v3.js', 'Regras de oferta voltou a carregar ordenação de Kits.');
forbidText(campaignRules, 'setInterval(', 'Regras de oferta voltou a usar polling permanente.');
forbidText(campaignRules, 'observe(document.documentElement', 'Regras de oferta voltou a observar o documento inteiro.');
requireText(campaignRules, '__adminV2CampaignRulesSectionInstalled', 'Regras de oferta perdeu a trava contra execução duplicada.');
requireText(campaignRules, 'ensureHistoryLoaded', 'Histórico de ofertas voltou a ser carregado sem demanda.');
requireText(campaignRules, 'meta[name="admin-save-build"]', 'Regras de oferta não herda a build produtiva atual.');
requireText(campaignRules, 'campaign-execution-history.js?admin_build=${encodeURIComponent(BUILD)}', 'Histórico de ofertas não recebe a build produtiva atual.');

const campaignHistory = read('producao-v2/js/campaign-execution-history.js');
forbidText(campaignHistory, 'setInterval(', 'Histórico de ofertas voltou a usar polling periódico.');
forbidText(campaignHistory, 'observe(document.documentElement', 'Histórico de ofertas voltou a observar o documento inteiro.');
requireText(campaignHistory, "addEventListener('focus'", 'Histórico de ofertas não atualiza mais ao retornar para a janela.');

const adminUx = read('producao-v2/admin-ux.js');
forbidText(adminUx, 'new MutationObserver', 'admin-ux.js voltou a depender de MutationObserver global.');
requireText(adminUx, "addEventListener('admin-v2-route-ready'", 'admin-ux.js perdeu o evento de rota pronta.');

const basketGrid = read('producao-v2/js/basket-products-grid.js');
forbidText(basketGrid, 'setInterval(tryInstall', 'Grade de cestas voltou a esperar módulo por polling.');
requireText(basketGrid, "addEventListener('admin-v2-route-ready'", 'Grade de cestas perdeu o evento de rota pronta.');

const basketContext = read('producao-v2/js/basket-context.js');
forbidText(basketContext, 'observe(document.documentElement', 'Contexto de cestas voltou a observar o documento inteiro.');
requireText(basketContext, 'installScopedObservers', 'Contexto de cestas não instala mais observers limitados aos editores.');

const basketPolish = read('producao-v2/js/basket-editor-polish.js');
forbidText(basketPolish, 'observe(document.documentElement', 'Acabamento de cestas voltou a observar o documento inteiro.');

const kitOrder = read('producao-v2/js/kit-editor-order-v3.js');
forbidText(kitOrder, 'observe(document.documentElement', 'Ordenação do editor de kits voltou a observar o documento inteiro.');

for (const removed of ['producao-v2/js/offer-store-bridge.js', 'producao-v2/js/inline-sale-price-label.js']) {
  if (existsSync(path.join(ROOT, removed))) failures.push(`Arquivo consolidado reapareceu: ${removed}`);
}

const productiveLoader = read('producao-v2/admin-produtivo.html');
forbidText(productiveLoader, 'inline-sale-price-label.js', 'O carregador produtivo voltou a injetar o patch separado de preço.');
forbidText(productiveLoader, "['./js/product-delete-tools.js'", 'O carregador produtivo voltou a injetar ações da rota Produtos no boot global.');
requireText(productiveLoader, "params.get('admin_build')", 'O carregador produtivo não recebe a build dinâmica da URL.');
requireText(productiveLoader, 'normalizeProductiveBuild', 'O carregador produtivo não normaliza o cache-busting da base.');
requireText(productiveLoader, 'admin-save-build', 'O carregador produtivo não publica a build ativa no documento final.');
requireText(productiveLoader, "stripGlobalRouteScript(html, 'kit-editor-flow-v2.js')", 'O carregador produtivo voltou a carregar o editor de Kits no boot global.');
requireText(productiveLoader, "stripGlobalRouteScript(html, 'campaign-rules-section.js')", 'O carregador produtivo voltou a carregar regras de oferta no boot global.');

for (const redirect of ['producao/index.html', 'admin/index.html']) {
  const source = read(redirect);
  requireText(source, 'var build = String(Date.now());', `${redirect} não gera uma build nova a cada abertura.`);
  requireText(source, "destination.searchParams.set('admin_build', build)", `${redirect} não envia a build dinâmica ao carregador.`);
  requireText(source, "destination.searchParams.set('save_build', build)", `${redirect} não mantém admin_build e save_build sincronizados.`);
  forbidText(source, "destination.searchParams.set('admin_build', '2026", `${redirect} voltou a usar uma build fixa.`);
}

const mugNavigation = read('producao-v2/js/navigation-v12.js');
requireText(mugNavigation, 'meta[name="admin-save-build"]', 'A navegação do Criador não herda a build ativa.');
requireText(mugNavigation, "import(withBuild('./mug-make-native-openai-bridge.js'))", 'A navegação do Criador não aplica a build ativa ao bridge.');
forbidText(mugNavigation, 'mug-make-native-openai-bridge.js?admin_build=', 'A navegação do Criador voltou a fixar uma versão do bridge.');

const mugBridge = read('producao-v2/js/mug-make-native-openai-bridge.js');
requireText(mugBridge, 'meta[name="admin-save-build"]', 'O bridge do Criador não herda a build ativa.');
requireText(mugBridge, 'for (const path of MODULES) await import(withBuild(path));', 'O bridge do Criador não usa a mesma build para todos os módulos.');
forbidText(mugBridge, "import './mug-", 'O bridge do Criador voltou a usar imports estáticos com versões independentes.');

const adminIndex = read('producao-v2/index.html');
for (const marker of ['kit-editor-flow-v2.js', 'campaign-rules-section.js']) {
  if (adminIndex.includes('<script') && adminIndex.includes(marker)) {
    warnings.push(`${marker} ainda possui entrada global no index.html de fallback; o carregador produtivo remove essa entrada antes de abrir o Admin oficial.`);
  }
}

if (failures.length) {
  console.error(`Arquitetura por rota: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Arquitetura por rota validada${warnings.length ? ` com ${warnings.length} pendência(s) conhecida(s)` : ''}.`);
  warnings.forEach(warning => console.warn(`AVISO: ${warning}`));
}
