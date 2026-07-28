export const DEFAULT_CONFIG = Object.freeze({
  firebaseUrl: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com',
  productsNode: 'produtos',
  writeMode: true,
  nfeImportMode: true,
  stockWriteMode: true,
  collectionsWriteMode: true,
  offerWriteMode: true,
  campaignOfferWriteMode: true,
  validityOfferBlockDays: 2,
  validityOfferEndDaysBefore: 2,
  validityOfferRules: [
    { min: 3, max: 7, discount: 50 },
    { min: 8, max: 15, discount: 40 },
    { min: 16, max: 31, discount: 35 },
    { min: 32, max: 46, discount: 30 },
    { min: 47, max: 65, discount: 25 },
    { min: 66, max: 76, discount: 20 },
    { min: 77, max: 91, discount: 10 },
    { min: 92, max: 105, discount: 5 },
  ],
  registryWriteMode: true,
  pageSize: 50,
  githubToken: '',
  githubOwner: 'osvaldosereia',
  githubRepo: 'SUCEDOAN12',
  githubBranch: 'main',
  productsHomePath: 'site/produtos-home.json',
  adminProductsPath: 'site/produtos-admin.json',
  catalogVersionPath: 'catalog-version.json',
  basketsPath: 'site/produtos-cesta-basica.json',
  kitsPath: 'site/kits.json',
  couponsPath: 'site/cuponsativos.json',
  quickPurchasePath: 'site/compra-rapida.json',
  kitQueuePath: 'carrosseis-kits/fila.json',
  offersRulesPath: 'site/ofertas-automaticas.json',
  offersStatePath: 'site/ofertas-automaticas-estado.json',
  offersHistoryPath: 'site/ofertas-historico.json',
  offersWorkflowFile: '.github/workflows/processar-ofertas.yml',
  githubImagesPath: 'site/img/produtos_3',
  githubKitImagesPath: 'site/img/kits',
  makeTextWebhookUrl: '',
  makeImageWebhookUrl: '',
  makeInstagramKitWebhookUrl: '',
  makeAiWebhookUrl: '',
  makeOrderWebhookUrl: '',
  blingConnectionMode: 'via-make',
});

export const STORAGE_KEYS = Object.freeze({
  config: 'da_admin_v2_config',
  lastPublication: 'da_admin_v2_last_publication',
});

const LEGACY_SETTINGS_KEY = 'da_admin_settings_v4';
const PRODUCTION_ACTIVATION_KEY = 'da_admin_v2_producao_oficial_20260725_v3';

function migrateLegacySettings() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}');
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || '{}');
    if (!legacy || typeof legacy !== 'object' || !Object.keys(legacy).length) return;
    const mapping = {
      githubToken: legacy.githubToken,
      githubOwner: legacy.githubOwner,
      githubRepo: legacy.githubRepo,
      githubBranch: legacy.githubBranch,
      productsHomePath: legacy.githubProdutosHomePath,
      basketsPath: legacy.githubCestasPath,
      kitsPath: legacy.githubKitsPath,
      githubImagesPath: legacy.githubImagesPath,
      githubKitImagesPath: legacy.githubKitImagesPath,
      makeTextWebhookUrl: legacy.makeTextWebhookUrl,
      makeImageWebhookUrl: legacy.makeImageWebhookUrl,
      makeInstagramKitWebhookUrl: legacy.makeInstagramKitWebhookUrl,
      makeOrderWebhookUrl: legacy.makeBlingWebhookUrl,
    };
    let changed = false;
    Object.entries(mapping).forEach(([key, value]) => {
      if ((current[key] === undefined || current[key] === null || String(current[key]).trim() === '') && value !== undefined && value !== null && String(value).trim() !== '') {
        current[key] = value;
        changed = true;
      }
    });
    if (changed) localStorage.setItem(STORAGE_KEYS.config, JSON.stringify({ ...DEFAULT_CONFIG, ...current }));
  } catch (error) {
    console.warn('Não foi possível migrar as configurações do admin antigo para a V2:', error);
  }
}

function activateOfficialProductionMode() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}');
    const activated = {
      ...DEFAULT_CONFIG,
      ...current,
      firebaseUrl: DEFAULT_CONFIG.firebaseUrl,
      productsNode: DEFAULT_CONFIG.productsNode,
      productsHomePath: DEFAULT_CONFIG.productsHomePath,
      adminProductsPath: DEFAULT_CONFIG.adminProductsPath,
      catalogVersionPath: DEFAULT_CONFIG.catalogVersionPath,
      writeMode: true,
      nfeImportMode: true,
      stockWriteMode: true,
      collectionsWriteMode: true,
      offerWriteMode: true,
      campaignOfferWriteMode: true,
      registryWriteMode: true,
      githubOwner: DEFAULT_CONFIG.githubOwner,
      githubRepo: DEFAULT_CONFIG.githubRepo,
      githubBranch: 'main',
    };
    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(activated));
    localStorage.setItem(PRODUCTION_ACTIVATION_KEY, '1');
  } catch (error) {
    console.warn('Não foi possível ativar o modo oficial da V2:', error);
  }
}

function updateOfficialProductionLabels() {
  const apply = () => {
    document.title = 'Dona Antônia — Admin oficial';
    const brand = document.querySelector('.brand span');
    if (brand) brand.textContent = 'Admin oficial';
    const banner = document.querySelector('.environment-banner');
    if (banner) banner.innerHTML = '<strong>Sistema oficial em uso.</strong> A lista abre pelo índice administrativo leve e cada cadastro completo é consultado diretamente no Firebase ao ser aberto.';
    const sourceHelp = document.querySelector('[data-view="settings"] .settings-grid .panel .panel-header p');
    if (sourceHelp) sourceHelp.textContent = 'Fonte oficial fixa do Firebase e arquivos operacionais.';
    const writeHelp = document.querySelector('#writeModeSetting')?.closest('.switch-row')?.querySelector('small');
    if (writeHelp) writeHelp.textContent = 'Mantenha ativado para cadastrar, editar e operar o sistema.';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
}

migrateLegacySettings();
activateOfficialProductionMode();
updateOfficialProductionLabels();
