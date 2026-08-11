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

const stockBootstrap = read('producao-v2/js/stock-bootstrap.js');
requireText(stockBootstrap, "'./products-offer-columns.js'", 'Produtos não carrega mais as colunas de oferta pela própria rota.');
requireText(stockBootstrap, "if (route === 'baskets' || route === 'kits')", 'Cestas/Kits não estão vinculados ao carregamento sob demanda.');
requireText(stockBootstrap, "if (route === 'offers' || route === 'offers-rules')", 'Ofertas não estão vinculadas ao carregamento sob demanda.');

const productsOfferColumns = read('producao-v2/js/products-offer-columns.js');
requireText(productsOfferColumns, 'inline-sale-price-caption', 'O rótulo de preço de venda não está mais consolidado na tabela de Produtos.');
requireText(productsOfferColumns, "headerRow.cells[2].textContent = 'Preço de venda'", 'A coluna de preço de venda não é nomeada pelo módulo da tabela.');

const collections = read('producao-v2/js/collections-bootstrap.js');
for (const marker of [
  './basket-products-grid.js?',
  './basket-editor-polish.js?',
  './kit-editor-flow-v2.js?',
  './kit-editor-order-v3.js?',
]) {
  requireText(collections, marker, `Collections não carrega o complemento esperado: ${marker}`);
}
requireText(collections, 'window.__adminV2CollectionsModule = module', 'Collections não publica o módulo antes dos complementos.');

const offers = read('producao-v2/js/offers-bootstrap.js');
requireText(offers, "import './campaign-rules-section.js", 'Offers não é mais responsável por carregar as regras de campanha.');
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

const adminIndex = read('producao-v2/index.html');
for (const marker of ['kit-editor-flow-v2.js', 'campaign-rules-section.js']) {
  if (adminIndex.includes(`<script`) && adminIndex.includes(marker)) {
    warnings.push(`${marker} ainda possui entrada global no index.html; já existe carregamento por rota para permitir remoção futura segura.`);
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
