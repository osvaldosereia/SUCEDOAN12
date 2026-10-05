(()=>{
  'use strict';
  function load(src,marker){
    if(document.querySelector('script['+marker+']'))return;
    const script=document.createElement('script');
    script.src=src;
    script.async=false;
    script.setAttribute(marker,'');
    document.head.appendChild(script);
  }
  load('/vitrine/admin/orders-visual-v1.js?v=20261005-1','data-orders-visual-v1');
  load('/vitrine/admin/basket-admin-section-core.js?v=canonical-v3','data-basket-admin-core');
})();