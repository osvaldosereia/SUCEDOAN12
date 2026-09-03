(() => {
  'use strict';

  const BUILD = '20260903-personalizer-fullwidth-native-v2-stable';
  if (window.__CF_PERSONALIZER_FULLWIDTH_NATIVE__ === BUILD) return;
  window.__CF_PERSONALIZER_FULLWIDTH_NATIVE__ = BUILD;

  function installStyle() {
    if (document.getElementById('cfPersonalizerFullwidthNativeStyle')) return;
    const style = document.createElement('style');
    style.id = 'cfPersonalizerFullwidthNativeStyle';
    style.textContent = `
body.pagina-produto .span12.produto > .cf-native-personalizer-host,
body.pagina-produto .span12.produto > [data-cf-native-personalizer="1"],
body.pagina-produto .span12.produto > .cf-native-personalizer{
  display:block!important;
  float:none!important;
  clear:both!important;
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  margin:22px 0 28px!important;
  padding:0!important;
  position:relative!important;
  overflow:visible!important;
  box-sizing:border-box!important;
}
body.pagina-produto .cf-native-personalizer,
body.pagina-produto .cf-native-personalizer-inner,
body.pagina-produto .cf-native-personalizer .form-card,
body.pagina-produto .cf-native-personalizer .preview-card,
body.pagina-produto .cf-native-personalizer .progress-card,
body.pagina-produto .cf-native-personalizer .pending-card,
body.pagina-produto .cf-native-personalizer .success-card,
body.pagina-produto .cf-native-personalizer .error-card,
body.pagina-produto .cf-native-personalizer .grid{
  float:none!important;
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  margin-left:0!important;
  margin-right:0!important;
  overflow:visible!important;
  box-sizing:border-box!important;
}
body.pagina-produto .cf-native-personalizer .cf-field,
body.pagina-produto .cf-native-personalizer input,
body.pagina-produto .cf-native-personalizer textarea,
body.pagina-produto .cf-native-personalizer select{
  max-width:100%!important;
  box-sizing:border-box!important;
}
body.pagina-produto .cf-native-personalizer .preview-stage{
  width:100%!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  overflow:visible!important;
}
body.pagina-produto .cf-native-personalizer .preview-stage img{
  width:auto!important;
  max-width:100%!important;
  height:auto!important;
  max-height:none!important;
}
`;
    document.head.appendChild(style);
  }

  function mainProduct() {
    return document.querySelector('#corpo .secao-principal .span12.produto, #corpo .span12.produto[itemscope], #corpo .produto[itemscope], .span12.produto');
  }

  function topRow(product) {
    if (!product) return null;
    return [...product.children].find(node => node.nodeType === 1 && node.classList.contains('row-fluid')) || null;
  }

  function findHost(product) {
    return product?.querySelector('.cf-native-personalizer-host, [data-cf-native-personalizer="1"], .cf-personalizer-box.cf-native-personalizer') || null;
  }

  function resetHost(host) {
    if (!host) return;
    const props = {
      display:'block', float:'none', clear:'both', width:'100%', 'min-width':'0', 'max-width':'100%',
      height:'auto', 'min-height':'0', 'max-height':'none', margin:'22px 0 28px', padding:'0',
      position:'relative', overflow:'visible', 'box-sizing':'border-box'
    };
    Object.entries(props).forEach(([name,value]) => host.style.setProperty(name, value, 'important'));
  }

  function moveHost() {
    const product = mainProduct();
    const row = topRow(product);
    const host = findHost(product);
    if (!product || !row || !host) return false;

    if (host.parentNode !== product || host.previousElementSibling !== row) row.insertAdjacentElement('afterend', host);
    resetHost(host);
    product.style.setProperty('overflow','visible','important');
    product.style.setProperty('height','auto','important');
    product.style.setProperty('max-height','none','important');
    host.dataset.cfFullwidthNative = BUILD;
    return true;
  }

  function start() {
    installStyle();
    if (moveHost()) {
      [250, 900].forEach(delay => setTimeout(moveHost, delay));
      return;
    }

    const product = mainProduct();
    if (!product) {
      [300, 900, 1800, 3200].forEach(delay => setTimeout(moveHost, delay));
      return;
    }

    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!moveHost()) return;
        observer.disconnect();
        [250, 900].forEach(delay => setTimeout(moveHost, delay));
      });
    });
    observer.observe(product, { childList:true, subtree:true });
    setTimeout(() => observer.disconnect(), 6000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  console.info(`CanecaFácil · personalizador full width ${BUILD}`);
})();
