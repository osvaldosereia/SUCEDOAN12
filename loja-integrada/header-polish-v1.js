(() => {
  'use strict';

  const BUILD = '20260902-header-polish-v1';
  if (window.__CF_HEADER_POLISH__ === BUILD) return;
  window.__CF_HEADER_POLISH__ = BUILD;

  function install() {
    const header = document.getElementById('cabecalho');
    if (!header) return;

    const shell = header.querySelector(':scope > .conteiner') || header.querySelector('.conteiner');
    if (shell) shell.classList.add('cf-header-polish-shell');

    let style = document.getElementById('cfHeaderPolishStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cfHeaderPolishStyle';
      document.head.appendChild(style);
    }

    style.textContent = `
#cabecalho{
  background:#fff!important;
  border-bottom:0!important;
  padding:10px 0 0!important;
}
#cabecalho .cf-header-polish-shell{
  width:calc(100% - 28px)!important;
  max-width:1240px!important;
  margin:0 auto!important;
  padding:10px 16px!important;
  box-sizing:border-box!important;
  background:#faf8f5!important;
  border:1px solid #eee8e2!important;
  border-radius:18px!important;
  box-shadow:0 7px 24px rgba(45,35,28,.055)!important;
}
#cabecalho .cf-header-polish-shell > .row-fluid:first-child{
  margin:0!important;
}
#cabecalho .logo img{
  transition:transform .18s ease,opacity .18s ease;
}
#cabecalho .logo a:hover img{
  opacity:.94;
}
#cabecalho .menu.superior a,
#cabecalho .nivel-um > li > a{
  border-radius:10px!important;
  transition:background-color .16s ease,color .16s ease!important;
}
#cabecalho .menu.superior a:hover,
#cabecalho .nivel-um > li > a:hover{
  background:rgba(255,116,32,.065)!important;
  color:#c95714!important;
}
#cabecalho .busca,
#cabecalho .minha-conta .dropdown-toggle,
#cabecalho .carrinho > a{
  transition:border-color .16s ease,box-shadow .16s ease,background-color .16s ease!important;
}
#cabecalho .busca:focus-within{
  border-color:#e7c9b6!important;
  box-shadow:0 0 0 3px rgba(255,116,32,.07)!important;
}
#cabecalho .minha-conta .dropdown-toggle:hover,
#cabecalho .carrinho > a:hover{
  background:#fff!important;
  border-color:#e4d8cf!important;
  box-shadow:0 4px 12px rgba(35,28,24,.06)!important;
}
#cfMyArtsTrigger{
  box-shadow:0 4px 14px rgba(35,28,24,.055)!important;
}
@media(max-width:767px){
  #cabecalho{padding-top:6px!important;}
  #cabecalho .cf-header-polish-shell{
    width:calc(100% - 16px)!important;
    padding:8px 10px!important;
    border-radius:14px!important;
    box-shadow:0 5px 18px rgba(45,35,28,.05)!important;
  }
}
`;
  }

  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  setTimeout(install, 500);
  setTimeout(install, 1500);

  console.info(`CanecaFácil · cabeçalho refinado · ${BUILD}`);
})();
