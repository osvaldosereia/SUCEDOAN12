(() => {
  'use strict';
  const MODULES={
    types:{label:'Tipos de cestas',src:'/vitrine/admin/basket-admin-types.js?v=20261023-1',global:'DonaAntoniaBasketAdminTypes'},
    quantities:{label:'Tipos e quantidades',src:'/vitrine/admin/basket-admin-quantities.js?v=20261023-1',global:'DonaAntoniaBasketAdminQuantities'},
    carousel:{label:'Produtos do carrossel',src:'/vitrine/admin/basket-admin-carousel.js?v=20261023-4',global:'DonaAntoniaBasketAdminCarousel'},
    flow:{label:'Atendimento por Flow',src:'/vitrine/admin/basket-admin-flow.js?v=20261025-flow-v1',global:'DonaAntoniaBasketAdminFlow'}
  };
  const COMPATIBILITY_MODULES={
    kits:{label:'Receitas de kits (legado)',src:'/vitrine/admin/kit-builder.js?v=basket-products-v1',global:'DonaAntoniaKitBuilder'},
    store:{label:'Operação de lotes antigos',src:'/vitrine/admin/store-baskets-builder.js?v=component-edit-v1',global:'DonaAntoniaStoreBaskets'}
  };
  const DEPENDENCIES=[
    {src:'/vitrine/admin/basket-admin-domain.js?v=20261023-1',global:'DonaAntoniaBasketAdminDomain'},
    {src:'/vitrine/admin/basket-admin-api.js?v=20261025-flow-v1',global:'DonaAntoniaBasketAdminApi'}
  ];
  const state={tab:'types',generation:0,loaders:new Map()};
  const host=()=>document.querySelector('#content');
  const toast=message=>{const bridge=window.DonaAntoniaAdminBridge||{};if(typeof bridge.toast==='function')bridge.toast(message);else console.warn(message)};
  function ensureStyle(){
    if(document.getElementById('basketAdminThreeTabsStyle'))return;
    const style=document.createElement('style');style.id='basketAdminThreeTabsStyle';
    style.textContent='.basket-config-shell{display:grid;gap:14px;color:#17221b}.basket-config-head{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap}.basket-config-head h1{margin:0;font-size:24px;letter-spacing:-.03em}.basket-config-head p{margin:4px 0 0;color:#66716a}.basket-config-tabs{display:flex;gap:8px;overflow-x:auto;padding:0 0 3px}.basket-config-tab{min-height:44px;border:1px solid #dfe5e1;background:#fff;color:#18221c;border-radius:999px;padding:0 16px;font-weight:900;white-space:nowrap;cursor:pointer}.basket-config-tab[aria-selected="true"]{background:#176b43;border-color:#176b43;color:#fff}.basket-config-workspace{min-height:240px}.basket-config-loading,.basket-config-error{padding:30px 18px;text-align:center;color:#66716a;background:#fff;border:1px solid #e3e8e5;border-radius:12px}.basket-config-error{color:#922a31;background:#fff7f6;border-color:#f0c3c0}.basket-config-error button{margin-top:10px;min-height:38px;border:1px solid #dfe5e1;background:#fff;border-radius:9px;padding:0 12px;font-weight:800}';
    document.head.appendChild(style);
  }
  function renderShell(){
    const root=host();if(!root)return null;ensureStyle();
    root.innerHTML='<section class="basket-config-shell"><div class="basket-config-head"><div><h1>Cestas</h1><p>Defina os tipos, as quantidades e os produtos dos carrosséis.</p></div></div><div class="basket-config-tabs" role="tablist" aria-label="Configuração de cestas"><button type="button" class="basket-config-tab" role="tab" data-basket-config-tab="types">Tipos de cestas</button><button type="button" class="basket-config-tab" role="tab" data-basket-config-tab="quantities">Tipos e quantidades</button><button type="button" class="basket-config-tab" role="tab" data-basket-config-tab="carousel">Produtos do carrossel</button><button type="button" class="basket-config-tab" role="tab" data-basket-config-tab="flow">Atendimento por Flow</button></div><div class="basket-config-workspace" data-basket-config-workspace></div></section>';
    root.querySelectorAll('[data-basket-config-tab]').forEach(button=>button.addEventListener('click',()=>void setTab(button.dataset.basketConfigTab)));
    root.querySelectorAll('[role=tab]').forEach((button,index)=>button.addEventListener('keydown',event=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
      event.preventDefault();const tabs=[...root.querySelectorAll('[role=tab]')];let next=index;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;tabs[next].focus();void setTab(tabs[next].dataset.basketConfigTab);
    }));
    return root;
  }
  function paintTabState(){
    const root=host();if(!root)return;
    root.querySelectorAll('[data-basket-config-tab]').forEach(button=>{
      const active=button.dataset.basketConfigTab===state.tab;button.setAttribute('aria-selected',active?'true':'false');button.tabIndex=active?0:-1;
    });
  }
  function loadScript(src,global){
    if(window[global])return Promise.resolve(window[global]);
    const existing=document.querySelector('script[data-basket-config-loader="'+global+'"]');
    if(existing&&existing.dataset.loaded==='true')return window[global]?Promise.resolve(window[global]):Promise.reject(new Error('basket_admin_module_unavailable'));
    return new Promise((resolve,reject)=>{
      const script=existing||document.createElement('script');
      const finish=()=>{script.dataset.loaded='true';const module=window[global];module?resolve(module):reject(new Error('basket_admin_module_unavailable'))};
      script.addEventListener('load',finish,{once:true});script.addEventListener('error',()=>reject(new Error('basket_admin_module_load_failed')),{once:true});
      if(!existing){script.src=src;script.async=true;script.dataset.basketConfigLoader=global;document.head.appendChild(script)}
    });
  }
  function loadModule(config){
    if(window[config.global])return Promise.resolve(window[config.global]);
    if(state.loaders.has(config.global))return state.loaders.get(config.global);
    const promise=DEPENDENCIES.reduce((chain,dep)=>chain.then(()=>loadScript(dep.src,dep.global)),Promise.resolve())
      .then(()=>loadScript(config.src,config.global));
    state.loaders.set(config.global,promise);promise.catch(()=>state.loaders.delete(config.global));return promise;
  }
  async function activate(){
    const root=host();if(!root)return;const config=MODULES[state.tab]||COMPATIBILITY_MODULES[state.tab]||MODULES.types;paintTabState();
    const workspace=root.querySelector('[data-basket-config-workspace]');if(!workspace)return;
    const generation=++state.generation;workspace.innerHTML='<div class="basket-config-loading">Carregando '+config.label+'…</div>';
    try{const module=await loadModule(config);if(generation!==state.generation)return;await module.open(workspace)}
    catch(error){if(generation!==state.generation)return;workspace.innerHTML='<div class="basket-config-error"><strong>Não consegui carregar '+config.label+'.</strong><br><small>Atualize a página ou tente novamente.</small><br><button type="button" data-basket-config-retry>Tentar novamente</button></div>';workspace.querySelector('[data-basket-config-retry]')?.addEventListener('click',()=>void activate());toast('Não consegui carregar '+config.label+'.')}
  }
  async function setTab(tab){state.tab=Object.hasOwn(MODULES,tab)||Object.hasOwn(COMPATIBILITY_MODULES,tab)?tab:'types';await activate()}
  async function render(){if(!host())return;renderShell();await activate()}
  async function refresh(){if(!host())return;const config=MODULES[state.tab]||COMPATIBILITY_MODULES[state.tab]||MODULES.types;const module=window[config.global];const workspace=host().querySelector('[data-basket-config-workspace]');if(module&&workspace){await module.open(workspace);return}await activate()}
  window.DonaAntoniaBasketAdmin={state,render,refresh,setTab};
})();
