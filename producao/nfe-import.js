(function(){
  'use strict';

  function addStyle(){
    if(document.querySelector('link[data-da-compra-rapida]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'compra-rapida-admin.css?v=2026-07-18-producao-v6';
    link.dataset.daCompraRapida = '1';
    document.head.appendChild(link);
  }

  function addScript(src, done){
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = function(){ if(done) done(); };
    script.onerror = function(){
      console.error('Falha ao carregar módulo do admin:', src);
      if(done) done();
    };
    document.head.appendChild(script);
  }

  addStyle();
  addScript('catalog-sync-admin.js?v=2026-07-21-catalog-v1');
  addScript('nfe-import-core.js?v=20260716-8', function(){
    addScript('compra-rapida-admin.js?v=2026-07-18-producao-v6', function(){
      addScript('compra-rapida-tab.js?v=2026-07-18-producao-v6');
    });
  });
})();
