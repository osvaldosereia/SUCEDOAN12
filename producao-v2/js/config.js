export const DEFAULT_CONFIG = Object.freeze({
  firebaseUrl: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com',
  productsNode: 'produtos',
  writeMode: false,
  nfeImportMode: false,
  stockWriteMode: false,
  collectionsWriteMode: false,
  offerWriteMode: false,
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
    if (changed) localStorage.setItem(STORAGE_KEYS.config, JSON.stringify({ ...DEFAULT_CONFIG, ...current, writeMode: Boolean(current.writeMode) }));
  } catch (error) {
    console.warn('Não foi possível migrar as configurações do admin antigo para a V2:', error);
  }
}

migrateLegacySettings();
