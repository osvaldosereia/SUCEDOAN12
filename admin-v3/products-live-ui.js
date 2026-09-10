(function(){
  'use strict';

  const C=window.DA_ADMIN_V3_CONFIG||{};
  const EDGE=C.productsEdgeFunction||'admin-products-live-v1';
  const MAIN_EDGE=C.edgeFunction||'admin-ops-v1';
  const $=id=>document.getElementById(id);
  const nativeFetch=window.fetch.bind(window);
  let latestProducts=[];
  let latestMetrics={verified:0,counting:0,ai_review:0,ai_created:0};
  let refreshTimer=null;

  function productView(){return document.querySelector('.view[data-view="products"]')}
  function isProductsVisible(){return productView()?.classList.contains('active')}

  function ensureUi(){
    const view=productView();
    if(!view)return;

    const nav=document.querySelector('.nav[data-route="products"]');
    if(nav)nav.innerHTML='<span>PR</span>Produtos e conferência';
    const sort=$('productSort');
    const defaultSort=sort?.querySelector('option[value=""]');
    if(defaultSort)defaultSort.textContent='Mais recentes';

    const status=$('productStatus');
    if(status){
      const first=status.querySelector('option[value=""]');
      if(first)first.textContent='Todos da operação';
      const options=[
        ['verified','Conferidos'],
        ['counting','Em contagem agora'],
        ['ai-created','Cadastrados pela IA'],
        ['ai-review','Revisão IA'],
      ];
      for(const [value,label] of options){
        if(status.querySelector(`option[value="${value}"]`))continue;
        const option=document.createElement('option');option.value=value;option.textContent=label;
        const inactive=status.querySelector('option[value="inactive"]');
        status.insertBefore(option,inactive||null);
      }
    }

    if(!document.getElementById('productLiveSummary')){
      const summary=document.createElement('section');
      summary.id='productLiveSummary';summary.className='product-live-summary';
      summary.innerHTML=`
        <button type="button" class="product-live-card verified" data-product-live-filter="verified">
          <span>CONFERIDOS</span><strong id="productLiveVerified">0</strong><small>estoque já consolidado</small>
        </button>
        <button type="button" class="product-live-card counting" data-product-live-filter="counting">
          <span>EM CONTAGEM</span><strong id="productLiveCounting">0</strong><small>já localizados no checkpoint</small>
        </button>
        <button type="button" class="product-live-card ai" data-product-live-filter="ai-review">
          <span>REVISÃO IA</span><strong id="productLiveAi">0</strong><small>inativos até revisão humana</small>
        </button>
        <div class="product-live-sync"><i></i><div><strong>Atualização automática</strong><small>a cada 15 segundos enquanto esta tela estiver aberta</small></div></div>`;
      const toolbar=view.querySelector('.toolbar');
      view.insertBefore(summary,toolbar||view.firstChild);
      summary.addEventListener('click',event=>{
        const button=event.target.closest('[data-product-live-filter]');if(!button)return;
        const select=$('productStatus');if(!select)return;
        select.value=button.dataset.productLiveFilter||'';
        select.dispatchEvent(new Event('change',{bubbles:true}));
      });
    }
    renderMetrics();
    syncHeader();
  }

  function renderMetrics(){
    if($('productLiveVerified'))$('productLiveVerified').textContent=String(latestMetrics.verified||0);
    if($('productLiveCounting'))$('productLiveCounting').textContent=String(latestMetrics.counting||0);
    if($('productLiveAi'))$('productLiveAi').textContent=String(latestMetrics.ai_review||0);
    document.querySelectorAll('[data-product-live-filter]').forEach(button=>button.classList.toggle('selected',button.dataset.productLiveFilter===($('productStatus')?.value||'')));
  }

  function statusOf(p){
    if(p?.source_system==='ai_ean_research'&&!p?.is_active)return{label:'REVISÃO IA',kind:'ai',help:'Cadastro automático · ativação somente humana'};
    if(p?.physically_verified)return{label:'CONFERIDO',kind:'verified',help:'Conferência física concluída'};
    if(p?.source_system==='inventory_fast_discovered')return{label:'EM CONTAGEM',kind:'counting',help:'EAN já salvo no checkpoint · aguardando fechamento'};
    if(p?.source_system==='ai_ean_research'&&p?.is_active)return{label:'ATIVADO',kind:'verified',help:'Cadastro da IA revisado e ativado manualmente'};
    return{label:'PENDENTE',kind:'pending',help:'Aguardando conferência'};
  }

  function enhanceRows(){
    ensureUi();
    const host=$('productRows');if(!host)return;
    const rows=[...host.querySelectorAll('tr')];
    if(!latestProducts.length){
      const empty=host.querySelector('.empty');if(empty&&isProductsVisible())empty.textContent='Nenhum produto nesta situação.';
      return;
    }
    rows.forEach((row,index)=>{
      const p=latestProducts[index];if(!p)return;
      const firstCell=row.cells?.[0];if(!firstCell)return;
      const status=statusOf(p);
      let badge=firstCell.querySelector('.product-state-badge');
      if(!badge){badge=document.createElement('span');badge.className='product-state-badge';firstCell.querySelector('.product-cell>div')?.appendChild(badge)}
      if(badge){badge.className=`product-state-badge ${status.kind}`;badge.textContent=status.label;badge.title=status.help}

      let note=firstCell.querySelector('.product-state-note');
      if(!note){note=document.createElement('small');note.className='product-state-note';firstCell.querySelector('.product-cell>div')?.appendChild(note)}
      if(note)note.textContent=status.help;

      if(!p.physically_verified&&row.cells?.[2]){
        const stockStrong=row.cells[2].querySelector('strong');
        if(stockStrong&&p.stock==null)stockStrong.textContent='—';
      }

      const wa=row.querySelector('[data-whatsapp-toggle]');
      if(wa&&!p.physically_verified){
        wa.checked=false;wa.disabled=true;wa.title='Só pode publicar no WhatsApp depois da conferência física.';
        const label=wa.nextElementSibling;if(label)label.textContent='Bloqueado';
      }
    });
    renderMetrics();
  }

  function syncHeader(){
    if(!isProductsVisible())return;
    const title=$('pageTitle'),subtitle=$('pageSubtitle');
    if(title)title.textContent='Produtos e conferência';
    if(subtitle)subtitle.textContent='Acompanhe em tempo real os conferidos, os EANs em contagem e os cadastros da IA aguardando revisão humana.';
  }

  async function interceptedFetch(input,init){
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.includes(`/functions/v1/${MAIN_EDGE}`)&&typeof init?.body==='string'){
      try{
        const body=JSON.parse(init.body);
        if(body?.action==='products'){
          const nextUrl=url.replace(`/functions/v1/${MAIN_EDGE}`,`/functions/v1/${EDGE}`);
          const response=await nativeFetch(nextUrl,init);
          try{
            const data=await response.clone().json();
            if(response.ok&&data?.ok!==false){
              latestProducts=Array.isArray(data.products)?data.products:[];
              latestMetrics=data.metrics||latestMetrics;
              setTimeout(enhanceRows,0);
            }
          }catch{}
          return response;
        }
      }catch{}
    }
    return nativeFetch(input,init);
  }

  function startAutoRefresh(){
    clearInterval(refreshTimer);
    refreshTimer=setInterval(()=>{
      if(document.hidden||!isProductsVisible())return;
      if(!$('modal')?.classList.contains('hidden'))return;
      const active=document.activeElement;
      if(active&&productView()?.contains(active)&&/^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName))return;
      $('refreshButton')?.click();
    },15000);
  }

  function bind(){
    ensureUi();
    const host=$('productRows');
    if(host)new MutationObserver(()=>setTimeout(enhanceRows,0)).observe(host,{childList:true});
    const view=productView();
    if(view)new MutationObserver(()=>{ensureUi();syncHeader();if(isProductsVisible())setTimeout(enhanceRows,0)}).observe(view,{attributes:true,attributeFilter:['class']});
    $('productStatus')?.addEventListener('change',()=>setTimeout(renderMetrics,0));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&isProductsVisible())$('refreshButton')?.click()});
    startAutoRefresh();
  }

  window.fetch=interceptedFetch;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();