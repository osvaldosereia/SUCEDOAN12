window.DA_ADMIN_V3_CONFIG = Object.freeze({
  supabaseUrl: 'https://ssbesxgaijknwsjbsbcz.supabase.co',
  supabasePublishableKey: 'sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
  edgeFunction: 'admin-ops-v1',
  categoryEdgeFunction: 'admin-product-categories-v1',
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
  marketingEdgeFunction: 'admin-marketing-v1',
  marketingUiEnabled: true,
  driverAppUrl: '../driver-app/',
  countAppUrl: '../contagem/',
  build: '20260910-marketing-center-v1'
});

(function loadHumanServiceCenter(cfg){
  if(!cfg?.humanServiceCenterUiEnabled)return;
  const view=document.querySelector('.view[data-view="whatsapp"]');
  if(!view)return;
  const legacy=view.querySelector('.grid-two');
  if(legacy&&!legacy.id)legacy.id='waLegacyOpsGrid';
  let mount=document.getElementById('humanServiceCenterMount');
  if(!mount){
    mount=document.createElement('section');
    mount.id='humanServiceCenterMount';
    mount.className='panel hidden';
    const metrics=document.getElementById('waOpsMetrics');
    (metrics||view.firstElementChild)?.insertAdjacentElement('afterend',mount);
  }
  if(!document.querySelector('link[data-human-service-center]')){
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='../admin-v3/human-service-center.css?v=20260908-02';link.dataset.humanServiceCenter='1';
    document.head.appendChild(link);
  }
  const loadCopilotPanel=()=>{
    if(!cfg.humanCopilotEnabled||document.querySelector('script[data-human-copilot-panel]'))return;
    const panel=document.createElement('script');
    panel.src='../admin-v3/human-copilot-panel.js?v=20260908-01';panel.dataset.humanCopilotPanel='1';document.body.appendChild(panel);
  };
  if(!document.querySelector('script[data-human-service-center]')){
    const script=document.createElement('script');
    script.src='../admin-v3/human-service-center.js?v=20260908-02';script.dataset.humanServiceCenter='1';
    script.onload=()=>{window.DAHumanServiceCenter?.mount(mount);loadCopilotPanel()};
    document.body.appendChild(script);
  }else{
    window.DAHumanServiceCenter?.mount(mount);loadCopilotPanel();
  }
})(window.DA_ADMIN_V3_CONFIG);

(function loadFinancialAdmin(cfg){
  if(!cfg?.financialAdminUiEnabled)return;
  const nav=document.getElementById('nav');
  const main=document.querySelector('.workspace main');
  if(!nav||!main)return;
  if(!document.querySelector('[data-route="financial"]')){
    const button=document.createElement('button');
    button.className='nav';button.type='button';button.dataset.route='financial';button.innerHTML='<span>FI</span>Financeiro';
    const queue=document.querySelector('.nav[data-route="queue"]');
    nav.insertBefore(button,queue||nav.lastElementChild);
  }
  let mount=document.getElementById('financialAdminMount');
  if(!mount){mount=document.createElement('section');mount.id='financialAdminMount';mount.className='view';mount.dataset.view='financial';main.appendChild(mount)}
  if(!document.querySelector('link[data-financial-admin]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='../admin-v3/financial-admin.css?v=20260908-01';link.dataset.financialAdmin='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-financial-admin]')){
    const script=document.createElement('script');script.src='../admin-v3/financial-admin.js?v=20260908-01';script.dataset.financialAdmin='1';script.onload=()=>window.DAFinancialAdmin?.mount(mount);document.body.appendChild(script);
  }
})(window.DA_ADMIN_V3_CONFIG);

(function loadMarketingCenter(cfg){
  if(!cfg?.marketingUiEnabled)return;
  const nav=document.getElementById('nav');
  const main=document.querySelector('.workspace main');
  if(!nav||!main)return;
  let button=document.querySelector('.nav[data-route="marketing"]');
  if(!button){
    button=document.createElement('button');
    button.className='nav';button.type='button';button.dataset.route='marketing';button.innerHTML='<span>MK</span>Marketing';
    const queue=document.querySelector('.nav[data-route="queue"]');
    nav.insertBefore(button,queue||nav.lastElementChild);
  }
  let mount=document.getElementById('marketingCenterMount');
  if(!mount){mount=document.createElement('section');mount.id='marketingCenterMount';mount.className='view';mount.dataset.view='marketing';main.appendChild(mount)}
  button.addEventListener('click',()=>setTimeout(()=>{
    const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle');
    if(title)title.textContent='Marketing';
    if(sub)sub.textContent='Conteúdo, campanhas, canais e automações sem Make.';
  },0));
  if(!document.querySelector('link[data-marketing-center]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='../admin-v3/marketing-center.css?v=20260910-01';link.dataset.marketingCenter='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-marketing-center]')){
    const script=document.createElement('script');script.src='../admin-v3/marketing-center.js?v=20260910-01';script.dataset.marketingCenter='1';script.onload=()=>window.DAMarketingCenter?.mount(mount);document.body.appendChild(script);
  }else window.DAMarketingCenter?.mount(mount);
})(window.DA_ADMIN_V3_CONFIG);

(function loadProductCategoriesInline(cfg){
  if(!cfg?.categoryEdgeFunction)return;
  if(!document.querySelector('link[data-product-categories-inline]')){
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='../admin-v3/product-categories-inline.css?v=20260908-02';link.dataset.productCategoriesInline='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-product-categories-inline]')){
    const script=document.createElement('script');
    script.src='../admin-v3/product-categories-inline.js?v=20260908-02';script.dataset.productCategoriesInline='1';document.body.appendChild(script);
  }
})(window.DA_ADMIN_V3_CONFIG);
