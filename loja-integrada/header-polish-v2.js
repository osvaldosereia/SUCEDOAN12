(() => {
  'use strict';

  const BUILD = '20260902-header-polish-v2';
  if (window.__CF_HEADER_POLISH_V2__ === BUILD) return;
  window.__CF_HEADER_POLISH_V2__ = BUILD;

  function install() {
    let style = document.getElementById('cfHeaderPolishV2Style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cfHeaderPolishV2Style';
      document.head.appendChild(style);
    }

    style.textContent = `
#cabecalho{
  background:#fff!important;
  border:0!important;
  box-shadow:none!important;
  padding:10px 0 4px!important;
}
#cabecalho > .conteiner{
  width:calc(100% - 32px)!important;
  max-width:1320px!important;
  margin:0 auto!important;
  padding:13px 20px!important;
  box-sizing:border-box!important;
  background:#faf7f3!important;
  border:1px solid #eee5dd!important;
  border-radius:16px!important;
  box-shadow:0 5px 20px rgba(48,36,28,.045)!important;
}
#cabecalho > .conteiner > .row-fluid{
  margin:0!important;
}
#cabecalho .logo img{
  max-height:52px!important;
}
#cabecalho a{
  transition:color .16s ease,background-color .16s ease,border-color .16s ease,box-shadow .16s ease!important;
}
#cabecalho .menu.superior a:hover,
#cabecalho .nivel-um > li > a:hover{
  color:#d45f17!important;
  background:rgba(255,116,32,.06)!important;
  border-radius:9px!important;
}
#cabecalho .busca,
#cabecalho .minha-conta .dropdown-toggle,
#cabecalho .carrinho > a{
  background:#fff!important;
  border-color:#e8dfd8!important;
}
#cabecalho .busca:focus-within{
  border-color:#e5b896!important;
  box-shadow:0 0 0 3px rgba(255,116,32,.06)!important;
}
#cfMyArtsTrigger{
  border-color:#e8dfd8!important;
  background:#fff!important;
  box-shadow:0 4px 14px rgba(40,30,24,.05)!important;
}
@media(max-width:767px){
  #cabecalho{
    padding:6px 0 2px!important;
  }
  #cabecalho > .conteiner{
    width:calc(100% - 14px)!important;
    max-width:none!important;
    padding:8px 10px!important;
    border-radius:13px!important;
  }
  #cabecalho .logo img{
    max-height:36px!important;
  }
}
`;
  }

  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  setTimeout(install, 300);
  setTimeout(install, 1000);

  console.info(`CanecaFácil · cabeçalho refinado ${BUILD}`);
})();
