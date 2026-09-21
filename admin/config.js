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

(function loadHumanServiceCenter(cfg){
  if(!cfg?.humanServiceCenterUiEnabled)return;
})(window.DA_ADMIN_CONFIG);

(function loadAdminContextNavigation(){
  const page=location.pathname.split('/').filter(Boolean).pop()||'';
  if(!new Set(['inteligencia.html','aprendizados.html']).has(page))return;
  import('./admin-context-nav-v2.js?v=20260920-2').catch(error=>console.warn('[admin-context-nav] fallback legado preservado',error));
})();
