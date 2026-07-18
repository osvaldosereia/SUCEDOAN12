
(function(){
  function normalize(value){
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  }
  function isKitsSection(section){
    const heading=section.querySelector('h2,h3,.section-title,.da-home-section-head strong');
    const title=normalize(heading && heading.textContent);
    return title.includes('kit promocional') || title==='kits' || section.matches('[data-home-section="kits"],.kits-section,.kit-shelf');
  }
  function addMobileSeeAllButtons(){
    const root=document.querySelector('.da-home-profit');
    if(!root) return;
    const selectors=['.da-home-section-head a[href]','.section-head a[href]','.shelf-head a[href]','a.section-link[href]'];
    root.querySelectorAll(selectors.join(',')).forEach(function(action){
      const section=action.closest('section,.da-home-section');
      if(!section || isKitsSection(section) || section.querySelector(':scope > .da-mobile-see-all')) return;
      const href=action.getAttribute('href');
      if(!href || href==='#' || /^javascript:/i.test(href)) return;
      const button=document.createElement('a');
      button.className='da-mobile-see-all';
      button.href=href;
      button.textContent='Ver Todos os Produtos';
      button.setAttribute('aria-label','Ver todos os produtos desta seção');
      section.appendChild(button);
    });
  }
  const observer=new MutationObserver(addMobileSeeAllButtons);
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',addMobileSeeAllButtons,{once:true});
  window.setTimeout(addMobileSeeAllButtons,0);
  window.setTimeout(addMobileSeeAllButtons,1800);
  window.setTimeout(addMobileSeeAllButtons,3600);
})();
