(function(){
  'use strict';

  const $=id=>document.getElementById(id);
  let scheduled=false;

  function productView(){return document.querySelector('.view[data-view="products"]')}
  function isProductView(){return productView()?.classList.contains('active')===true}

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;ensure()});
  }

  function ensureSummary(){
    const view=productView();
    const summary=$('productLiveSummary');
    if(!view||!summary)return;
    summary.classList.add('product-live-summary-v3');
    const manager=$('productCategoryManager');
    const toolbar=view.querySelector('.toolbar');
    const anchor=manager||toolbar||view.firstElementChild;
    if(anchor&&summary!==anchor&&summary.nextElementSibling!==anchor)view.insertBefore(summary,anchor);

    const sync=summary.querySelector('.product-live-sync');
    if(sync){
      const strong=sync.querySelector('strong');
      const small=sync.querySelector('small');
      if(strong)strong.textContent='Ao vivo';
      if(small)small.textContent='atualiza sozinho';
    }
  }

  function ensureCategoryManager(){
    const manager=$('productCategoryManager');
    if(!manager)return;
    manager.classList.add('product-category-manager-v3');
    if(!manager.dataset.v3Ready){
      manager.dataset.v3Ready='1';
      manager.classList.add('is-collapsed');
      const head=manager.querySelector('.product-category-head');
      if(head){
        const copy=head.querySelector(':scope > div');
        if(copy){
          const eyebrow=copy.querySelector('.eyebrow');
          const title=copy.querySelector('h2');
          const paragraph=copy.querySelector('p');
          if(eyebrow)eyebrow.textContent='ORGANIZAÇÃO DO CATÁLOGO';
          if(title)title.textContent='Categorias e vitrine';
          if(paragraph)paragraph.textContent='Abra somente quando precisar criar, renomear ou ajustar categorias da vitrine.';
        }
        const actions=document.createElement('div');
        actions.className='category-manager-actions';
        actions.innerHTML='<span id="productCategoryManagerCount" class="category-manager-count">Categorias</span><button id="productCategoryManagerToggle" class="button secondary small" type="button" aria-expanded="false">Gerenciar categorias</button>';
        head.appendChild(actions);
        $('productCategoryManagerToggle')?.addEventListener('click',()=>{
          const collapsed=manager.classList.toggle('is-collapsed');
          const button=$('productCategoryManagerToggle');
          if(button){
            button.setAttribute('aria-expanded',collapsed?'false':'true');
            button.textContent=collapsed?'Gerenciar categorias':'Fechar categorias';
          }
          if(!collapsed)setTimeout(()=>manager.scrollIntoView({behavior:'smooth',block:'nearest'}),30);
        });
      }
    }
    const count=manager.querySelectorAll('.category-admin-row').length;
    const label=$('productCategoryManagerCount');
    if(label&&count)label.textContent=`${count} categorias`;
  }

  function ensureToolbar(){
    const view=productView();
    const toolbar=view?.querySelector('.toolbar');
    if(!toolbar||toolbar.dataset.v3Ready)return;
    toolbar.dataset.v3Ready='1';
    toolbar.classList.add('product-toolbar-v3');

    const search=toolbar.querySelector('.search');
    const status=$('productStatus');
    const category=$('productCategory');
    const sync=$('productSync');
    const expiry=$('productExpiry');
    const sort=$('productSort');
    const brand=$('productBrand');
    const gondola=$('productGondola');
    const shelf=$('productShelf');

    const main=document.createElement('div');
    main.className='product-toolbar-main';
    const advanced=document.createElement('div');
    advanced.className='product-toolbar-advanced';

    [search,status,category].filter(Boolean).forEach(el=>main.appendChild(el));

    const more=document.createElement('button');
    more.id='productMoreFilters';
    more.className='button secondary product-filter-button';
    more.type='button';
    more.textContent='Mais filtros';
    more.setAttribute('aria-expanded','false');
    main.appendChild(more);

    const clear=document.createElement('button');
    clear.id='productClearFilters';
    clear.className='button product-clear-button';
    clear.type='button';
    clear.textContent='Limpar';
    main.appendChild(clear);

    [sync,expiry,sort,brand,gondola,shelf].filter(Boolean).forEach(el=>advanced.appendChild(el));
    toolbar.replaceChildren(main,advanced);

    more.addEventListener('click',()=>{
      const open=toolbar.classList.toggle('show-advanced');
      more.setAttribute('aria-expanded',open?'true':'false');
      more.textContent=open?'Menos filtros':'Mais filtros';
    });

    clear.addEventListener('click',()=>{
      const ids=['productSearch','productStatus','productSync','productExpiry','productSort','productCategory','productBrand','productGondola','productShelf'];
      for(const id of ids){const el=$(id);if(el)el.value=''}
      $('refreshButton')?.click();
    });
  }

  function ensureTable(){
    const view=productView();
    const panel=view?.querySelector('.table-panel');
    if(!panel)return;
    panel.classList.add('product-table-v3');
    const heads=panel.querySelectorAll('thead th');
    const labels=['Produto','Categoria','Estoque / preço','Validade / local','WhatsApp','Situação','Ações'];
    heads.forEach((th,i)=>{if(labels[i])th.textContent=labels[i]});
    const summary=panel.querySelector('.table-summary');
    if(summary&&!summary.querySelector('.product-table-hint')){
      const hint=document.createElement('small');
      hint.className='product-table-hint';
      hint.textContent='Clique em Abrir para revisar os detalhes do produto.';
      summary.insertBefore(hint,summary.querySelector('#productPage'));
    }
  }

  function ensureHeader(){
    if(!isProductView())return;
    const title=$('pageTitle');
    const subtitle=$('pageSubtitle');
    if(title)title.textContent='Produtos e conferência';
    if(subtitle)subtitle.textContent='Conferência de estoque, produtos em contagem e cadastros que precisam de revisão.';
  }

  function ensure(){
    const view=productView();
    if(!view)return;
    ensureSummary();
    ensureCategoryManager();
    ensureToolbar();
    ensureTable();
    ensureHeader();
  }

  function bind(){
    ensure();
    const view=productView();
    if(view)new MutationObserver(schedule).observe(view,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    const pageTitle=$('pageTitle');
    if(pageTitle)new MutationObserver(schedule).observe(pageTitle,{childList:true,characterData:true,subtree:true});
    window.addEventListener('resize',schedule,{passive:true});
    setTimeout(ensure,200);
    setTimeout(ensure,900);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
