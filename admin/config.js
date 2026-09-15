window.DA_ADMIN_CONFIG = Object.freeze({
  supabaseUrl: 'https://ssbesxgaijknwsjbsbcz.supabase.co',
  supabasePublishableKey: 'sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
  edgeFunction: 'admin-simple-v2',
  productsEdgeFunction: 'admin-products-live-v1',
  categoryEdgeFunction: 'admin-product-categories-v1',
  chatMenuEdgeFunction: 'admin-chat-menu-v1',
  whatsappOpsEdgeFunction: 'admin-whatsapp-ops-v1',
  humanServiceCenterUiEnabled: false,
  humanCopilotEnabled: false,
  humanCopilotEdgeFunction: 'admin-human-copilot-v1',
  financialAdminUiEnabled: false,
  financialEdgeFunction: 'admin-financial-v1',
  experienceOrchestratorEdgeFunction: 'admin-experience-orchestrator-v1',
  experienceOrchestratorUiEnabled: false,
  automationBuilderEdgeFunction: 'admin-automation-builder-v1',
  automationBuilderUiEnabled: false,
  logisticsEdgeFunction: 'admin-logistics-v1',
  logisticsUiEnabled: false,
  commercialTruthEdgeFunction: 'admin-commercial-truth-v1',
  commercialTruthUiEnabled: false,
  driverAppUrl: '../driver-app/',
  countAppUrl: '../contagem/',
  build: '20260915-admin-simple-v2-no-auth-safety-flags'
});

// Alias de compatibilidade somente para módulos antigos. Todos os módulos sensíveis
// continuam explicitamente desligados acima e o Admin oficial segue no endpoint simples.
window.DA_ADMIN_V3_CONFIG = window.DA_ADMIN_CONFIG;

(function loadHumanServiceCenter(cfg){
  if(!cfg?.humanServiceCenterUiEnabled)return;
})(window.DA_ADMIN_V3_CONFIG);
