(() => {
  'use strict';

  const BUILD = '20260902-minhas-canecas-scroll-fix-v1';
  if (window.__CF_MINHAS_CANECAS_SCROLL_FIX__ === BUILD) return;
  window.__CF_MINHAS_CANECAS_SCROLL_FIX__ = BUILD;

  function install() {
    let style = document.getElementById('cfMinhasCanecasScrollFix');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cfMinhasCanecasScrollFix';
      document.head.appendChild(style);
    }

    style.textContent = `
#cfMyArtsOverlay .cf-arts-drawer{
  height:100vh!important;
  height:100dvh!important;
  max-height:100dvh!important;
  overflow:hidden!important;
}
#cfMyArtsOverlay .cf-arts-head{
  flex:0 0 auto!important;
}
#cfMyArtsOverlay .cf-arts-list{
  flex:1 1 auto!important;
  min-height:0!important;
  height:auto!important;
  overflow-y:auto!important;
  overflow-x:hidden!important;
  display:block!important;
  padding:12px!important;
  overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
  scrollbar-gutter:stable;
}
#cfMyArtsOverlay .cf-art-card{
  display:grid!important;
  grid-template-columns:142px minmax(0,1fr)!important;
  width:100%!important;
  min-height:164px!important;
  height:auto!important;
  margin:0 0 10px!important;
  flex:none!important;
  box-sizing:border-box!important;
}
#cfMyArtsOverlay .cf-art-card:last-child{
  margin-bottom:2px!important;
}
#cfMyArtsOverlay .cf-art-thumb,
#cfMyArtsOverlay .cf-art-thumb img,
#cfMyArtsOverlay .cf-art-thumb-empty{
  min-height:164px!important;
}
#cfMyArtsOverlay .cf-art-info{
  min-height:164px!important;
  height:auto!important;
  overflow:visible!important;
  box-sizing:border-box!important;
}
@media(max-width:720px){
  #cfMyArtsOverlay .cf-arts-list{padding:10px!important;}
  #cfMyArtsOverlay .cf-art-card{
    grid-template-columns:116px minmax(0,1fr)!important;
    min-height:154px!important;
    margin-bottom:9px!important;
  }
  #cfMyArtsOverlay .cf-art-thumb,
  #cfMyArtsOverlay .cf-art-thumb img,
  #cfMyArtsOverlay .cf-art-thumb-empty,
  #cfMyArtsOverlay .cf-art-info{
    min-height:154px!important;
  }
}
`;
  }

  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  setTimeout(install, 500);
  setTimeout(install, 1600);

  console.info(`CanecaFácil · rolagem Minhas Canecas corrigida · ${BUILD}`);
})();
