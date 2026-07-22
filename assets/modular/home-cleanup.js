
  (function(){
    function normalizeTitle(value){
      return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
    }
    function removeFeaturedProductSections(){
      const root=document.querySelector('.da-home-profit');
      if(!root) return;
      root.querySelectorAll('section,.da-home-section').forEach(function(section){
        const heading=section.querySelector('h2,h3,.section-title,.da-home-section-head strong');
        if(heading && normalizeTitle(heading.textContent)==='produtos em destaque') section.remove();
      });
    }
    const observer=new MutationObserver(removeFeaturedProductSections);
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('DOMContentLoaded',removeFeaturedProductSections,{once:true});
    window.setTimeout(removeFeaturedProductSections,0);
    window.setTimeout(removeFeaturedProductSections,2000);
  })();
  