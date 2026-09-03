(() => {
  'use strict';

  const BUILD = '20260903-personalizer-fullwidth-native-v1.0';
  if (window.__CF_PERSONALIZER_FULLWIDTH_NATIVE__ === BUILD) return;
  window.__CF_PERSONALIZER_FULLWIDTH_NATIVE__ = BUILD;

  function installStyle() {
    let style = document.getElementById('cfPersonalizerFullwidthNativeStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cfPersonalizerFullwidthNativeStyle';
      document.head.appendChild(style);
    }
    style.textContent = `
body.pagina-produto .cf-native-personalizer-host,
body.pagina-produto .cf-native-personalizer{
  display:block!important;
  float:none!important;
  clear:both!important;
  width:100%!important;
  max-width:none!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  overflow:visible!important;
  position:relative!important;
  box-sizing:border-box!important;
}
body.pagina-produto .cf-native-personalizer-inner,
body.pagina-produto .cf-native-personalizer .form-card,
body.pagina-produto .cf-native-personalizer .preview-card,
body.pagina-produto .cf-native-personalizer .progress-card,
body.pagina-produto .cf-native-personalizer .pending-card,
body.pagina-produto .cf-native-personalizer .success-card,
body.pagina-produto .cf-native-personalizer .error-card{
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  overflow:visible!important;
}
body.pagina-produto .cf-native-personalizer .preview-stage{
  height:auto!important;
  max-height:none!important;
  overflow:visible!important;
}
body.pagina-produto .cf-native-personalizer .preview-stage img{
  height:auto!important;
  max-height:none!important;
}
`;
  }

  function productTopRow() {
    const product = document.querySelector('#corpo .span12.produto, #corpo .produto[itemscope], .span12.produto');
    if (!product) return null;
    return [...product.children].find(node => node.nodeType === 1 && node.classList.contains('row-fluid')) || null;
  }

  function moveHost() {
    const host = document.querySelector('.cf-native-personalizer-host, [data-cf-native-personalizer="1"]');
    const row = productTopRow();
    if (!host || !row || !row.parentNode) return false;

    if (host.parentNode !== row.parentNode || host.previousElementSibling !== row) {
      row.parentNode.insertBefore(host, row.nextSibling);
    }

    host.style.setProperty('display', 'block', 'important');
    host.style.setProperty('float', 'none', 'important');
    host.style.setProperty('clear', 'both', 'important');
    host.style.setProperty('width', '100%', 'important');
    host.style.setProperty('height', 'auto', 'important');
    host.style.setProperty('max-height', 'none', 'important');
    host.style.setProperty('overflow', 'visible', 'important');
    host.dataset.cfFullwidthNative = BUILD;
    return true;
  }

  function refresh() {
    installStyle();
    moveHost();
  }

  refresh();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once:true });

  const observer = new MutationObserver(() => refresh());
  const startObserver = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList:true, subtree:true });
    refresh();
  };
  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver, { once:true });

  setTimeout(refresh, 300);
  setTimeout(refresh, 900);
  setTimeout(refresh, 2200);

  console.info(`CanecaFácil · personalizador full width ${BUILD}`);
})();
