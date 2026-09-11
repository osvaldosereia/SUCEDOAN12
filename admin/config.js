window.DA_ADMIN_V3_CONFIG = Object.freeze({
  supabaseUrl: 'https://ssbesxgaijknwsjbsbcz.supabase.co',
  supabasePublishableKey: 'sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8',
  edgeFunction: 'admin-ops-v1',
  basketsEdgeFunction: 'admin-baskets-v1',
  customerEdgeFunction: 'customer-intelligence-v1',
  marketingEdgeFunction: 'admin-marketing-v1',
  marketingWorkflowEdgeFunction: 'admin-marketing-workflow-v1',
  marketingUiEnabled: true,
  countAppUrl: '../contagem/',
  build: '20260911-admin-simple-marketing-01'
});

(function reuseTrustedSession(){
  const adminKey='da_admin_v3_auth';
  const countKey='da_count_v2_auth';
  try{
    const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
    const admin=read(adminKey);
    const count=read(countKey);
    const usable=value=>value&&(value.access_token||value.refresh_token);
    if(!usable(admin)&&usable(count)) localStorage.setItem(adminKey,JSON.stringify(count));
  }catch{}
})();

(function loadMarketingCenter(cfg){
  if(!cfg?.marketingUiEnabled)return;
  const mountMarketing=()=>{
    const nav=document.getElementById('nav');
    const main=document.querySelector('.workspace main');
    if(!nav||!main)return false;

    let button=document.querySelector('.nav[data-route="marketing"]');
    if(!button){
      button=document.createElement('button');
      button.className='nav';
      button.type='button';
      button.dataset.route='marketing';
      button.innerHTML='<span>MK</span>Marketing';
      const queue=document.querySelector('.nav[data-route="queue"]');
      nav.insertBefore(button,queue||nav.lastElementChild);
    }

    let mount=document.getElementById('marketingCenterMount');
    if(!mount){
      mount=document.createElement('section');
      mount.id='marketingCenterMount';
      mount.className='view';
      mount.dataset.view='marketing';
      main.appendChild(mount);
    }

    button.addEventListener('click',()=>setTimeout(()=>{
      const title=document.getElementById('pageTitle');
      const sub=document.getElementById('pageSubtitle');
      if(title)title.textContent='Marketing';
      if(sub)sub.textContent='Conteúdo, campanhas, canais e automações sem Make.';
    },0));

    if(!document.querySelector('link[data-marketing-center]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='../admin-v3/marketing-center.css?v=20260910-04';
      link.dataset.marketingCenter='1';
      document.head.appendChild(link);
    }

    const loadObservability=()=>{
      if(document.querySelector('script[data-marketing-render-observability]'))return;
      const obs=document.createElement('script');
      obs.src='../admin-v3/marketing-render-observability-v1.js?v=20260911-01';
      obs.dataset.marketingRenderObservability='1';
      document.body.appendChild(obs);
    };

    const loadWorkflow=()=>{
      if(document.querySelector('script[data-marketing-workflow]')){
        loadObservability();
        return;
      }
      const ext=document.createElement('script');
      ext.src='../admin-v3/marketing-workflow-v1.js?v=20260910-01';
      ext.dataset.marketingWorkflow='1';
      ext.onload=loadObservability;
      document.body.appendChild(ext);
    };

    if(!document.querySelector('script[data-marketing-center]')){
      const script=document.createElement('script');
      script.src='../admin-v3/marketing-center.js?v=20260910-01';
      script.dataset.marketingCenter='1';
      script.onload=()=>{window.DAMarketingCenter?.mount(mount);loadWorkflow()};
      document.body.appendChild(script);
    }else{
      window.DAMarketingCenter?.mount(mount);
      loadWorkflow();
    }
    return true;
  };

  if(!mountMarketing()) document.addEventListener('DOMContentLoaded',mountMarketing,{once:true});
})(window.DA_ADMIN_V3_CONFIG);
