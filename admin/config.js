window.DA_ADMIN_V3_CONFIG = Object.freeze({
  supabaseUrl: 'https://ssbesxgaijknwsjbsbcz.supabase.co',
  supabasePublishableKey: 'sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
  edgeFunction: 'admin-ops-v1',
  productsEdgeFunction: 'admin-products-live-v1',
  categoryEdgeFunction: 'admin-product-categories-v1',
  chatMenuEdgeFunction: 'admin-chat-menu-v1',
  whatsappOpsEdgeFunction: 'admin-whatsapp-ops-v1',
  trustedBrowserSession: true,
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
  build: '20260911-chat-menu-01'
});

(function prepareTrustedBrowserSession(cfg){
  if(!cfg?.trustedBrowserSession)return;
  const adminKey='da_admin_v3_auth';
  const countKey='da_count_v2_auth';
  try{
    const parse=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
    const admin=parse(adminKey);
    const count=parse(countKey);
    const usable=value=>value&&(value.access_token||value.refresh_token);
    const score=value=>Number(value?.expires_at||0);
    if(usable(count)&&(!usable(admin)||score(count)>score(admin))){
      localStorage.setItem(adminKey,JSON.stringify(count));
    }
    const selected=parse(adminKey);
    if(selected?.access_token){
      document.documentElement.classList.add('da-trusted-admin-session');
      document.getElementById('loginView')?.classList.add('hidden');
    }
  }catch{}
})(window.DA_ADMIN_V3_CONFIG);

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
    script.onload=()=>{window.DAHumanServiceCenter?.mount(mount);loadCopilotPanel()};document.body.appendChild(script);
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

(function loadProductsLiveUi(cfg){
  if(!cfg?.productsEdgeFunction)return;
  if(!document.querySelector('link[data-products-live-ui]')){
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='../admin-v3/products-live-ui.css?v=20260910-02';link.dataset.productsLiveUi='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-products-live-ui]')){
    const script=document.createElement('script');
    script.src='../admin-v3/products-live-ui.js?v=20260910-03';script.dataset.productsLiveUi='1';document.body.appendChild(script);
  }
})(window.DA_ADMIN_V3_CONFIG);

(function loadProductsConsoleV3(cfg){
  if(!cfg?.productsEdgeFunction)return;
  if(!document.querySelector('link[data-products-console-v3]')){
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='../admin-v3/products-console-v3.css?v=20260910-01';link.dataset.productsConsoleV3='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-products-console-v3]')){
    const script=document.createElement('script');script.src='../admin-v3/products-console-v3.js?v=20260910-01';script.dataset.productsConsoleV3='1';document.body.appendChild(script);
  }
})(window.DA_ADMIN_V3_CONFIG);

(function loadChatMenuAdmin(cfg){
  if(!cfg?.chatMenuEdgeFunction)return;
  const mount=()=>{
    const nav=document.getElementById('nav'),main=document.querySelector('.workspace main');if(!nav||!main)return false;
    let button=document.querySelector('[data-route="chat-menu"]');
    if(!button){button=document.createElement('button');button.className='nav';button.type='button';button.dataset.route='chat-menu';button.innerHTML='<span>CH</span>Menu do Chat';const wa=document.querySelector('.nav[data-route="whatsapp"]');wa?.insertAdjacentElement('afterend',button)||nav.appendChild(button)}
    if(!document.querySelector('.view[data-view="chat-menu"]')){const view=document.createElement('section');view.className='view';view.dataset.view='chat-menu';main.appendChild(view)}
    button.addEventListener('click',()=>setTimeout(()=>{const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle');if(title)title.textContent='Menu do Chat';if(sub)sub.textContent='Botão flutuante, atalhos comerciais e respostas rápidas do chat de compra.'},0));
    if(!document.querySelector('link[data-chat-menu-admin]')){const link=document.createElement('link');link.rel='stylesheet';link.href='../admin-v3/chat-menu-admin.css?v=20260911-01';link.dataset.chatMenuAdmin='1';document.head.appendChild(link)}
    if(!document.querySelector('script[data-chat-menu-admin]')){const script=document.createElement('script');script.src='../admin-v3/chat-menu-admin.js?v=20260911-01';script.dataset.chatMenuAdmin='1';document.body.appendChild(script)}
    return true;
  };
  if(!mount())document.addEventListener('DOMContentLoaded',mount,{once:true});
})(window.DA_ADMIN_V3_CONFIG);
