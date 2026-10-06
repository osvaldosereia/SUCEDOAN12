(()=>{
  'use strict';

  const MODULES={
    taxonomy:{label:'Categorias da vitrine',description:'Crie categorias e subdivisões, controle a ordem e escolha quais seções ficam ativas.',src:'/vitrine/admin/basket-category-admin.js?v=20261006-1',global:'DonaAntoniaBasketTaxonomy'},
    molds:{label:'Cestas Molde',description:'Edite nome, valor oculto, posições, quantidades e produtos permitidos em cada cesta.',src:'/vitrine/admin/basket-mold-admin.js?v=20261006-r2',global:'DonaAntoniaBasketMolds'},
    kits:{label:'Criador de Kits',description:'Ferramenta técnica para manutenção das receitas reutilizáveis existentes.',src:'/vitrine/admin/kit-builder.js?v=basket-products-v1',global:'DonaAntoniaKitBuilder'},
    store:{label:'Operação anterior',description:'Ferramenta técnica para receitas, reservas e montagens do modelo anterior.',src:'/vitrine/admin/store-baskets-builder.js?v=component-edit-v1',global:'DonaAntoniaStoreBaskets'}
  };
  const state={tab:'molds',generation:0,loaders:new Map()};

  function host(){return document.querySelector('#content')}
  function toast(message){const b=window.DonaAntoniaAdminBridge||{};if(typeof b.toast==='function')b.toast(message);else console.warn(message)}

  function ensureStyle(){
    if(document.getElementById('basketSimpleTabsStyles'))return;
    const style=document.createElement('style');
    style.id='basketSimpleTabsStyles';
    style.textContent=`
      .basket-simple-shell{display:grid;gap:12px}.basket-simple-head{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap}.basket-simple-head h1{margin:0;font-size:24px;letter-spacing:-.03em}.basket-simple-head p{margin:3px 0 0;color:#66716a}.basket-simple-tabs{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}.basket-simple-tab{min-height:44px;border:1px solid #dfe5e1;background:#fff;color:#18221c;border-radius:999px;padding:0 16px;font-weight:900;white-space:nowrap}.basket-simple-tab[aria-selected="true"]{background:#176b43;border-color:#176b43;color:#fff}.basket-simple-help{border:1px solid #dfe5e1;background:#fff;border-radius:12px;padding:10px 12px;color:#66716a;font-size:12px}.basket-simple-workspace{min-height:240px}.basket-simple-loading{padding:32px 18px;text-align:center;color:#66716a}.basket-simple-error{border:1px solid #f0c3c0;background:#fff7f6;border-radius:12px;padding:16px;color:#922a31}.basket-simple-error button{margin-top:10px;border:1px solid #dfe5e1;background:#fff;border-radius:9px;min-height:38px;padding:0 11px;font-weight:800}.basket-advanced{border:1px solid #e3e8e5;border-radius:12px;background:#fafcfb}.basket-advanced summary{cursor:pointer;padding:10px 12px;font-size:12px;font-weight:900;color:#59665f}.basket-advanced .basket-simple-tabs{padding:0 10px 10px}.basket-advanced .basket-simple-tab{min-height:38px;font-size:11px}
      @media(max-width:760px){.basket-simple-head{align-items:start}.basket-simple-tabs{width:100%}.basket-simple-tab{flex:1}.basket-simple-help{font-size:11px}.basket-advanced .basket-simple-tabs{display:grid;grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function renderShell(){
    const root=host();if(!root)return null;ensureStyle();
    root.innerHTML='<section class="basket-simple-shell"><div class="basket-simple-head"><div><h1>Cestas do Site</h1><p>Configure cada cesta pelo molde e deixe o sistema cuidar das variações.</p></div></div><div class="basket-simple-tabs" role="tablist" aria-label="Cestas do Site"><button type="button" class="basket-simple-tab" role="tab" data-basket-simple-tab="molds">Cestas Molde</button><button type="button" class="basket-simple-tab" role="tab" data-basket-simple-tab="taxonomy">Categorias da vitrine</button></div><details class="basket-advanced" data-basket-advanced><summary>Ferramentas avançadas</summary><div class="basket-simple-tabs" role="tablist" aria-label="Ferramentas avançadas"><button type="button" class="basket-simple-tab" role="tab" data-basket-simple-tab="kits">Criador de Kits</button><button type="button" class="basket-simple-tab" role="tab" data-basket-simple-tab="store">Operação anterior</button></div></details><div class="basket-simple-help" data-basket-simple-help></div><div class="basket-simple-workspace" data-basket-simple-workspace></div></section>';
    root.querySelectorAll('[data-basket-simple-tab]').forEach(btn=>btn.addEventListener('click',()=>setTab(String(btn.dataset.basketSimpleTab||'molds'))));
    return root;
  }

  function paintTabState(){
    const root=host();if(!root)return;
    root.querySelectorAll('[data-basket-simple-tab]').forEach(btn=>{
      const active=String(btn.dataset.basketSimpleTab)===state.tab;
      btn.setAttribute('aria-selected',active?'true':'false');
      btn.tabIndex=active?0:-1;
    });
    const advanced=root.querySelector('[data-basket-advanced]');if(advanced&&state.tab!=='molds')advanced.open=true;
    const cfg=MODULES[state.tab];
    const help=root.querySelector('[data-basket-simple-help]');
    if(help)help.textContent=cfg?.description||'';
  }

  function loadModule(cfg){
    const ready=window[cfg.global];
    if(ready&&typeof ready.open==='function')return Promise.resolve(ready);
    if(state.loaders.has(cfg.global))return state.loaders.get(cfg.global);
    const promise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-basket-simple-loader="'+cfg.global+'"]');
      const finish=()=>{const mod=window[cfg.global];if(mod&&typeof mod.open==='function')resolve(mod);else reject(new Error('basket_module_unavailable:'+cfg.global))};
      if(existing){existing.addEventListener('load',finish,{once:true});existing.addEventListener('error',()=>reject(new Error('basket_module_load_failed:'+cfg.global)),{once:true});return}
      const script=document.createElement('script');script.src=cfg.src;script.async=true;script.dataset.basketSimpleLoader=cfg.global;script.addEventListener('load',finish,{once:true});script.addEventListener('error',()=>reject(new Error('basket_module_load_failed:'+cfg.global)),{once:true});document.head.appendChild(script);
    });
    state.loaders.set(cfg.global,promise);promise.catch(()=>state.loaders.delete(cfg.global));return promise;
  }

  async function activate(){
    const root=host();if(!root)return;const cfg=MODULES[state.tab]||MODULES.molds;paintTabState();
    const workspace=root.querySelector('[data-basket-simple-workspace]');if(!workspace)return;const generation=++state.generation;
    workspace.innerHTML='<div class="basket-simple-loading">Carregando '+cfg.label+'…</div>';
    try{const mod=await loadModule(cfg);if(generation!==state.generation)return;await mod.open(workspace)}catch(error){if(generation!==state.generation)return;workspace.innerHTML='<div class="basket-simple-error"><strong>Não consegui carregar '+cfg.label+'.</strong><br><small>Atualize a página ou tente novamente.</small><br><button type="button" data-basket-simple-retry>Tentar novamente</button></div>';workspace.querySelector('[data-basket-simple-retry]')?.addEventListener('click',activate);toast('Não consegui carregar '+cfg.label+'.')}
  }

  async function setTab(tab){state.tab=Object.prototype.hasOwnProperty.call(MODULES,tab)?tab:'molds';await activate()}
  async function render(){if(!host())return;renderShell();await activate()}
  async function refresh(){if(!host())return;const cfg=MODULES[state.tab]||MODULES.molds,mod=window[cfg.global],workspace=host().querySelector('[data-basket-simple-workspace]');if(mod&&typeof mod.refresh==='function'){await mod.refresh();return}if(mod&&typeof mod.open==='function'&&workspace){await mod.open(workspace);return}await activate()}

  window.DonaAntoniaBasketAdmin={state,render,refresh,setTab};
})();

(()=>{
  'use strict';
  if(document.querySelector('script[data-orders-visual-v1]'))return;
  const script=document.createElement('script');
  script.src='/vitrine/admin/orders-visual-v1.js?v=20261005-1';
  script.async=false;
  script.setAttribute('data-orders-visual-v1','');
  document.head.appendChild(script);
})();

(()=>{
  'use strict';
  if(document.querySelector('script[data-store-ops-panel-v1]'))return;
  const script=document.createElement('script');
  script.src='/vitrine/admin/store-baskets-ops-overview.js?v=20261006-1';
  script.async=false;
  script.setAttribute('data-store-ops-panel-v1','');
  document.head.appendChild(script);
})();

(()=>{
  'use strict';
  if(document.querySelector('script[data-product-basket-cutover-v1]'))return;
  const script=document.createElement('script');
  script.src='/vitrine/admin/product-basket-link-cutover.js?v=20261006-1';
  script.async=false;
  script.setAttribute('data-product-basket-cutover-v1','');
  document.head.appendChild(script);
})();

(()=>{
  'use strict';
  if(document.querySelector('script[data-baskets-operational-polish-v1]'))return;
  const script=document.createElement('script');
  script.src='/vitrine/admin/baskets-operational-polish.js?v=20261006-1';
  script.async=false;
  script.setAttribute('data-baskets-operational-polish-v1','');
  document.head.appendChild(script);
})();
