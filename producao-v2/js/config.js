export const DEFAULT_CONFIG = Object.freeze({
  firebaseUrl: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com',
  productsNode: 'produtos',
  writeMode: true,
  nfeImportMode: false,
  stockWriteMode: true,
  collectionsWriteMode: true,
  offerWriteMode: true,
  campaignOfferWriteMode: false,
  registryWriteMode: false,
  pageSize: 50,
  githubToken: '',
  githubOwner: 'osvaldosereia',
  githubRepo: 'SUCEDOAN12',
  githubBranch: 'main',
  productsHomePath: 'site/produtos-home.json',
  catalogVersionPath: 'catalog-version.json',
  basketsPath: 'site/produtos-cesta-basica.json',
  kitsPath: 'site/kits.json',
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
const PRODUCTION_ACTIVATION_KEY = 'da_admin_v2_producao_oficial_20260724_v1';

function migrateLegacySettings() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}');
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || '{}');
    if (!legacy || typeof legacy !== 'object' || !Object.keys(legacy).length) return;
    const mapping = {
      firebaseUrl: legacy.firebaseUrl,
      productsNode: legacy.produtosNode,
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
    if (localStorage.getItem(PRODUCTION_ACTIVATION_KEY) === '1') return;
    const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}');
    const activated = {
      ...DEFAULT_CONFIG,
      ...current,
      writeMode: true,
      stockWriteMode: true,
      collectionsWriteMode: true,
      offerWriteMode: true,
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
    const brand = document.querySelector('.brand span');
    if (brand) brand.textContent = 'Admin oficial';
    const banner = document.querySelector('.environment-banner');
    if (banner) banner.innerHTML = '<strong>Sistema oficial em uso.</strong> Alterações de produtos são salvas diretamente no Firebase. Operações em lote continuam com confirmação própria.';
    const sourceHelp = document.querySelector('[data-view="settings"] .settings-grid .panel .panel-header p');
    if (sourceHelp) sourceHelp.textContent = 'Configurações do sistema oficial.';
    const writeHelp = document.querySelector('#writeModeSetting')?.closest('.switch-row')?.querySelector('small');
    if (writeHelp) writeHelp.textContent = 'Mantenha ativado para cadastrar e editar produtos.';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
}

migrateLegacySettings();
activateOfficialProductionMode();
updateOfficialProductionLabels();
