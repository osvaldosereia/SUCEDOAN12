(() => {
  'use strict';

  const BUILD = '20260903-personalizer-fullwidth-native-v1.1-rescue';
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
  left:auto!important;
  right:auto!important;
  top:auto!important;
  bottom:auto!important;
  transform:none!important;
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
  }

  function mainProduct() {
    return document.querySelector('#corpo .secao-principal .span12.produto, #corpo .span12.produto[itemscope], #corpo .produto[itemscope]');
  }

  function topRow(product) {
    if (!product) return null;
    for (const node of product.children) {
      if (node.nodeType === 1 && node.classList.contains('row-fluid')) return node;
    }
    return null;
  }

  function findHost() {
    return document.querySelector('.cf-native-personalizer-host, [data-cf-native-personalizer="1"], .cf-personalizer-box.cf-native-personalizer');
  }

  function hardReset(host) {
    const props = {
      display:'block', float:'none', clear:'both', width:'100%', 'min-width':'0', 'max-width':'100%',
      height:'auto', 'min-height':'0', 'max-height':'none', margin:'22px 0 28px', padding:'0',
      left:'auto', right:'auto', top:'auto', bottom:'auto', transform:'none', position:'relative',
      overflow:'visible', 'box-sizing':'border-box'
    };
    for (const [name,value] of Object.entries(props)) host.style.setProperty(name, value, 'important');
    host.querySelectorAll('.cf-native-personalizer-inner,.form-card,.preview-card,.progress-card,.pending-card,.success-card,.error-card,.grid').forEach(node => {
      node.style.setProperty('width','100%','important');
      node.style.setProperty('max-width','100%','important');
      node.style.setProperty('height','auto','important');
      node.style.setProperty('max-height','none','important');
      node.style.setProperty('overflow','visible','important');
      node.style.setProperty('float','none','important');
      node.style.setProperty('margin-left','0','important');
      node.style.setProperty('margin-right','0','important');
      node.style.setProperty('box-sizing','border-box','important');
    });
  }

  function moveHost() {
    const host = findHost();
    const product = mainProduct();
    const row = topRow(product);
    if (!host || !product || !row) return false;

    // O personalizador nunca pode permanecer dentro de .acoes-produto,
    // .comprar, labels de quantidade ou qualquer coluna span6.
    if (host.parentNode !== product || host.previousElementSibling !== row) {
      row.insertAdjacentElement('afterend', host);
    }

    hardReset(host);
    product.style.setProperty('overflow','visible','important');
    product.style.setProperty('height','auto','important');
    product.style.setProperty('max-height','none','important');
    host.dataset.cfFullwidthNative = BUILD;
    return true;
  }

  function refresh() {
    installStyle();
    moveHost();
  }

  refresh();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once:true });

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; refresh(); });
  });
  const startObserver = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList:true, subtree:true });
    refresh();
  };
  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver, { once:true });

  [100,300,700,1400,2600,4500].forEach(ms => setTimeout(refresh, ms));
  window.addEventListener('resize', refresh, { passive:true });

  console.info(`CanecaFácil · personalizador full width ${BUILD}`);
})();
