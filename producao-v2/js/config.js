const ACTIVE_BUILD = document.querySelector('meta[name="admin-save-build"]')?.content || '20260921-supabase-only-v1';

async function loadCriticalEnhancement(path, label) {
  try { await import(path); }
  catch (error) { console.error(`Falha ao carregar ${label}. O painel continuará sem esse complemento.`, error); }
}

await loadCriticalEnhancement(`./direct-product-save.js?admin_build=${encodeURIComponent(ACTIVE_BUILD)}`, 'o fluxo unificado de produtos');

export const DEFAULT_CONFIG = Object.freeze({
  supabaseUrl: 'https://ssbesxgaijknwsjbsbcz.supabase.co',
  supabasePublishableKey: 'sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
  productsAuthority: 'supabase',
  productsAdminFunction: 'admin-products-live-v1',
  writeMode: true,
  nfeImportMode: true,
  stockWriteMode: true,
  collectionsWriteMode: true,
  offerWriteMode: true,
  campaignOfferWriteMode: true,
  validityOfferBlockDays: 2,
  validityOfferEndDaysBefore: 2,
  validityOfferRules: [
    { min: 3, max: 7, discount: 50 }, { min: 8, max: 15, discount: 40 },
    { min: 16, max: 31, discount: 35 }, { min: 32, max: 46, discount: 30 },
    { min: 47, max: 65, discount: 25 }, { min: 66, max: 76, discount: 20 },
    { min: 77, max: 91, discount: 10 }, { min: 92, max: 105, discount: 5 },
  ],
  registryWriteMode: true,
  pageSize: 50,
  githubToken: '', githubOwner: 'osvaldosereia', githubRepo: 'SUCEDOAN12', githubBranch: 'main',
  productsHomePath: 'site/produtos-home.json', adminProductsPath: 'site/produtos-admin.json', catalogVersionPath: 'catalog-version.json',
  basketsPath: 'site/produtos-cesta-basica.json', kitsPath: 'site/kits.json', couponsPath: 'site/cuponsativos.json', quickPurchasePath: 'site/compra-rapida.json',
  kitQueuePath: 'carrosseis-kits/fila.json', offersRulesPath: 'site/ofertas-automaticas.json', offersStatePath: 'site/ofertas-automaticas-estado.json', offersHistoryPath: 'site/ofertas-historico.json',
  offersWorkflowFile: '.github/workflows/processar-ofertas.yml', githubImagesPath: 'site/img/produtos_3', githubKitImagesPath: 'site/img/kits',
  makeTextWebhookUrl: '', makeImageWebhookUrl: '', makeInstagramKitWebhookUrl: '', makeAiWebhookUrl: '', makeOrderWebhookUrl: '',
  blingConnectionMode: 'supabase',
});

export const STORAGE_KEYS = Object.freeze({ config: 'da_admin_v2_config', lastPublication: 'da_admin_v2_last_publication' });
const LEGACY_SETTINGS_KEY = 'da_admin_settings_v4';
const PRODUCTION_ACTIVATION_KEY = 'da_admin_v2_supabase_only_20260921_v1';

function migrateLegacySettings() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}');
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || '{}');
    if (!legacy || typeof legacy !== 'object' || !Object.keys(legacy).length) return;
    const mapping = { githubOwner: legacy.githubOwner, githubRepo: legacy.githubRepo, githubBranch: legacy.githubBranch, productsHomePath: legacy.githubProdutosHomePath, basketsPath: legacy.githubCestasPath, kitsPath: legacy.githubKitsPath, githubImagesPath: legacy.githubImagesPath, githubKitImagesPath: legacy.githubKitImagesPath };
    let changed = false;
    Object.entries(mapping).forEach(([key, value]) => { if ((current[key] == null || String(current[key]).trim() === '') && value != null && String(value).trim() !== '') { current[key] = value; changed = true; } });
    if (changed) localStorage.setItem(STORAGE_KEYS.config, JSON.stringify({ ...DEFAULT_CONFIG, ...current }));
  } catch (error) { console.warn('Não foi possível migrar configurações não sensíveis do admin antigo:', error); }
}

function activateOfficialProductionMode() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}');
    // Explicitly discard legacy Firebase/Make runtime coordinates from local configuration.
    const { firebaseUrl, productsNode, clientsNode, makeTextWebhookUrl, makeImageWebhookUrl, makeInstagramKitWebhookUrl, makeAiWebhookUrl, makeOrderWebhookUrl, ...safeCurrent } = current;
    const activated = { ...DEFAULT_CONFIG, ...safeCurrent, supabaseUrl: DEFAULT_CONFIG.supabaseUrl, supabasePublishableKey: DEFAULT_CONFIG.supabasePublishableKey, productsAuthority: 'supabase', productsAdminFunction: DEFAULT_CONFIG.productsAdminFunction, writeMode: true, nfeImportMode: true, stockWriteMode: true, collectionsWriteMode: true, offerWriteMode: true, campaignOfferWriteMode: true, registryWriteMode: true, githubOwner: DEFAULT_CONFIG.githubOwner, githubRepo: DEFAULT_CONFIG.githubRepo, githubBranch: 'main', makeTextWebhookUrl: '', makeImageWebhookUrl: '', makeInstagramKitWebhookUrl: '', makeAiWebhookUrl: '', makeOrderWebhookUrl: '', blingConnectionMode: 'supabase' };
    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(activated));
    localStorage.setItem(PRODUCTION_ACTIVATION_KEY, '1');
  } catch (error) { console.warn('Não foi possível ativar o modo Supabase-only da V2:', error); }
}

function updateOfficialProductionLabels() {
  const apply = () => {
    document.title = 'Dona Antônia — Admin oficial';
    const brand = document.querySelector('.brand span'); if (brand) brand.textContent = 'Admin oficial';
    const banner = document.querySelector('.environment-banner'); if (banner) banner.innerHTML = '<strong>Supabase-only ativo.</strong> Produtos, estoque e dados administrativos usam o Supabase como única fonte operacional.';
    const sourceHelp = document.querySelector('[data-view="settings"] .settings-grid .panel .panel-header p'); if (sourceHelp) sourceHelp.textContent = 'Fonte operacional oficial: Supabase. Firebase é apenas histórico de migração e não participa do runtime.';
    const writeHelp = document.querySelector('#writeModeSetting')?.closest('.switch-row')?.querySelector('small'); if (writeHelp) writeHelp.textContent = 'Mantenha ativado para cadastrar, editar e operar pelo fluxo autenticado do Supabase.';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true }); else apply();
}

migrateLegacySettings();
activateOfficialProductionMode();
updateOfficialProductionLabels();
