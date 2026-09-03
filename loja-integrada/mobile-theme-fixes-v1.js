(() => {
  'use strict';

  const BUILD = '20260903-mobile-theme-fixes-v1.0';
  if (window.__CF_MOBILE_THEME_FIXES__ === BUILD) return;
  window.__CF_MOBILE_THEME_FIXES__ = BUILD;

  function installStyle() {
    let style = document.getElementById('cfMobileThemeFixes');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cfMobileThemeFixes';
      document.head.appendChild(style);
    }

    style.textContent = `
@media(max-width:767px){
  /* Rastreio / contato: o tema usa .cor-principal também dentro do popup.
     Em combinações claras isso deixa texto e campo praticamente invisíveis. */
  #cabecalho .rastreio-content,
  #cabecalho .contato-content,
  #cabecalho .minha-conta .dropdown-menu{
    box-sizing:border-box!important;
    background:#fff!important;
    color:#262626!important;
    border:1px solid #e2e2e2!important;
    border-radius:11px!important;
    box-shadow:0 10px 28px rgba(0,0,0,.14)!important;
    font-family:"Roboto",Arial,sans-serif!important;
    -webkit-font-smoothing:antialiased!important;
  }

  #cabecalho .rastreio-content{
    padding:14px!important;
    min-width:245px!important;
    max-width:calc(100vw - 24px)!important;
  }

  #cabecalho .rastreio-content p,
  #cabecalho .rastreio-content label,
  #cabecalho .rastreio-content span,
  #cabecalho .contato-content,
  #cabecalho .contato-content span,
  #cabecalho .minha-conta .dropdown-menu a{
    color:#292929!important;
    -webkit-text-fill-color:#292929!important;
    text-shadow:none!important;
  }

  #cabecalho .rastreio-content p{
    margin:0 0 9px!important;
    font-size:12.5px!important;
    line-height:1.35!important;
    font-weight:400!important;
  }

  #cabecalho .rastreio-content input,
  #cabecalho .rastreio-content #OrderTracking{
    display:block!important;
    width:100%!important;
    min-height:40px!important;
    height:40px!important;
    box-sizing:border-box!important;
    margin:0 0 9px!important;
    padding:8px 10px!important;
    background:#fff!important;
    color:#222!important;
    -webkit-text-fill-color:#222!important;
    caret-color:#222!important;
    border:1px solid #d5d5d5!important;
    border-radius:8px!important;
    box-shadow:none!important;
    font-size:14px!important;
    font-weight:300!important;
  }

  #cabecalho .rastreio-content input::placeholder{
    color:#8a8a8a!important;
    -webkit-text-fill-color:#8a8a8a!important;
    opacity:1!important;
  }

  #cabecalho .rastreio-content .rastreio,
  #cabecalho .rastreio-content button.rastreio{
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    width:100%!important;
    min-height:40px!important;
    margin:0!important;
    padding:8px 12px!important;
    border:1px solid #f47621!important;
    border-radius:8px!important;
    background:#f47621!important;
    color:#fff!important;
    -webkit-text-fill-color:#fff!important;
    font-size:12px!important;
    line-height:1!important;
    font-weight:500!important;
    text-shadow:none!important;
  }

  #cabecalho .contato-content{
    padding:12px 14px!important;
    min-width:180px!important;
    max-width:calc(100vw - 24px)!important;
  }

  /* Menu superior mobile: o HTML da Loja Integrada não possui um ícone por categoria.
     O espaço visual vinha do layout do tema. Transformamos os itens em chips compactos. */
  #cabecalho .menu.superior{
    width:100%!important;
    max-width:100%!important;
    overflow:hidden!important;
    background:#fff!important;
    border:0!important;
    box-shadow:none!important;
  }

  #cabecalho .menu.superior > ul.nivel-um{
    display:flex!important;
    flex-flow:row nowrap!important;
    align-items:center!important;
    gap:7px!important;
    width:100%!important;
    max-width:100%!important;
    margin:0!important;
    padding:7px 10px 9px!important;
    box-sizing:border-box!important;
    overflow-x:auto!important;
    overflow-y:hidden!important;
    -webkit-overflow-scrolling:touch!important;
    scrollbar-width:none!important;
  }

  #cabecalho .menu.superior > ul.nivel-um::-webkit-scrollbar{
    display:none!important;
    width:0!important;
    height:0!important;
  }

  #cabecalho .menu.superior > ul.nivel-um > li{
    position:relative!important;
    flex:0 0 auto!important;
    float:none!important;
    width:auto!important;
    min-width:0!important;
    height:auto!important;
    min-height:0!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    background:transparent!important;
  }

  #cabecalho .menu.superior > ul.nivel-um > li > a{
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    gap:5px!important;
    width:auto!important;
    min-width:0!important;
    min-height:38px!important;
    height:38px!important;
    margin:0!important;
    padding:0 13px!important;
    box-sizing:border-box!important;
    background:#f7f7f7!important;
    border:1px solid #e7e7e7!important;
    border-radius:999px!important;
    color:#303030!important;
    text-decoration:none!important;
    box-shadow:none!important;
  }

  #cabecalho .menu.superior > ul.nivel-um > li > a > strong.titulo{
    display:block!important;
    float:none!important;
    width:auto!important;
    min-width:0!important;
    height:auto!important;
    min-height:0!important;
    margin:0!important;
    padding:0!important;
    background:transparent!important;
    border:0!important;
    color:#303030!important;
    -webkit-text-fill-color:#303030!important;
    font-family:"Roboto",Arial,sans-serif!important;
    font-size:12.5px!important;
    line-height:1!important;
    font-weight:400!important;
    text-transform:none!important;
    white-space:nowrap!important;
  }

  /* Mantém um indicador pequeno nas categorias que têm submenu,
     sem depender do glifo antigo do tema. */
  #cabecalho .menu.superior > ul.nivel-um > li > a > i.icon-chevron-down{
    position:static!important;
    display:inline-flex!important;
    align-items:center!important;
    justify-content:center!important;
    flex:0 0 auto!important;
    width:11px!important;
    height:16px!important;
    margin:0!important;
    padding:0!important;
    background:transparent!important;
    border:0!important;
    color:#777!important;
    font-size:0!important;
    line-height:1!important;
  }

  #cabecalho .menu.superior > ul.nivel-um > li > a > i.icon-chevron-down:before{
    content:'▾'!important;
    display:block!important;
    color:#777!important;
    font-family:Arial,sans-serif!important;
    font-size:10px!important;
    line-height:1!important;
    font-weight:400!important;
  }
}
`;
  }

  function start() {
    installStyle();
    setTimeout(installStyle, 500);
    setTimeout(installStyle, 1800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  console.info(`CanecaFácil · ajustes mobile do tema ${BUILD}`);
})();
